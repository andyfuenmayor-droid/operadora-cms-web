/**
 * Operadora CMS / Multibanca Express
 * Unified Backend & Public Web Service (PostgreSQL 17 Native)
 *
 * Capas integradas:
 *  1. Backend Auth (/auth/v1/* y /api/admin-users/*) contra auth.users en PostgreSQL
 *  2. Backend Data REST (/rest/v1/*, /api/leads, /api/planes) vía PostgREST nativo
 *  3. Realtime WebSocket Hub (/realtime/v1/websocket) protocolo Phoenix/Supabase
 *  4. Web Service Público de Pagos, Snapshots y Agencias (/api/v1/*)
 */

import http from 'http';
import { URL } from 'url';
import crypto from 'crypto';
import {
  checkDbHealth,
  authenticateUserByEmailPassword,
  findAuthUserById,
  createOrUpdateAuthUser,
  updateAuthUserPasswordById,
  findApiKeyRecord,
  findAgencyUserId,
  findDuplicatePayment,
  insertPaymentRecord,
  findPaymentStatus,
  saveWeeklySnapshotRecord,
  findWeeklySnapshotRecord,
  saveBulkAgenciesAndUsers,
} from './db.mjs';

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;
const POSTGREST_URL = process.env.POSTGREST_URL || 'http://postgrest:3000';
const DEFAULT_API_KEY = process.env.PAYMENTS_API_KEY || 'mbe_live_7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c';
const JWT_SECRET = process.env.JWT_SECRET || 'multibanca-express-do-jwt-secret-2026';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD',
  'Access-Control-Allow-Headers':
    'Content-Type, Authorization, X-API-Key, X-Requested-With, apikey, Prefer, Range, Range-Unit, Accept-Profile, Content-Profile, X-Client-Info, Cache-Control, Pragma',
  'Access-Control-Expose-Headers':
    'Content-Range, Range-Unit, Content-Location, Location, Preference-Applied',
};

// Rate limiting map for external Web Service
const rateLimitMap = new Map();
const RATE_LIMIT_MAX = 200;
const RATE_LIMIT_WINDOW = 60 * 1000;

function sendJson(res, statusCode, data, headers = {}) {
  const jsonStr = JSON.stringify(data, null, 2);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    ...CORS_HEADERS,
    ...headers,
  });
  res.end(jsonStr);
}

function parseBodyBuffer(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalLen = 0;
    req.on('data', (chunk) => {
      totalLen += chunk.length;
      if (totalLen > 10 * 1024 * 1024) {
        reject(new Error('Payload too large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function parseBody(req) {
  const buf = await parseBodyBuffer(req);
  const str = buf.toString('utf8').trim();
  if (!str) return {};
  try {
    return JSON.parse(str);
  } catch (_) {
    throw new Error('Formato JSON inválido en el cuerpo de la solicitud');
  }
}

// ============================================================================
// 1. JWT & AUTHENTICATION HELPERS (/auth/v1/* y /api/admin-users/*)
// ============================================================================

function base64UrlEncode(strOrBuf) {
  const buf = Buffer.isBuffer(strOrBuf) ? strOrBuf : Buffer.from(String(strOrBuf), 'utf8');
  return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function base64UrlDecode(str) {
  let b64 = String(str).replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  return Buffer.from(b64, 'base64').toString('utf8');
}

function signJwt(payload) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const data = `${encodedHeader}.${encodedPayload}`;
  const signature = crypto.createHmac('sha256', JWT_SECRET).update(data).digest();
  return `${data}.${base64UrlEncode(signature)}`;
}

function decodeJwtPayload(token) {
  try {
    const parts = String(token || '').split('.');
    if (parts.length < 2) return null;
    return JSON.parse(base64UrlDecode(parts[1]));
  } catch (_) {
    return null;
  }
}

function buildAuthUserObject(dbUser) {
  const nowIso = new Date().toISOString();
  return {
    id: dbUser.id,
    aud: dbUser.aud || 'authenticated',
    role: dbUser.role || 'authenticated',
    email: dbUser.email,
    email_confirmed_at: dbUser.created_at || nowIso,
    phone: '',
    confirmed_at: dbUser.created_at || nowIso,
    last_sign_in_at: nowIso,
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: dbUser.raw_user_meta_data || {},
    identities: [],
    created_at: dbUser.created_at || nowIso,
    updated_at: dbUser.updated_at || nowIso,
  };
}

function buildAuthSessionResponse(dbUser) {
  const nowSec = Math.floor(Date.now() / 1000);
  const expiresIn = 31536000; // 1 año
  const expiresAt = nowSec + expiresIn;
  const userObj = buildAuthUserObject(dbUser);

  const tokenPayload = {
    aud: 'authenticated',
    exp: expiresAt,
    iat: nowSec,
    iss: 'https://crm.multibancaexpress.com/auth/v1',
    sub: dbUser.id,
    email: dbUser.email,
    phone: '',
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: dbUser.raw_user_meta_data || {},
    role: 'authenticated',
  };

  const accessToken = signJwt(tokenPayload);
  const refreshToken = signJwt({ sub: dbUser.id, type: 'refresh', iat: nowSec });

  return {
    access_token: accessToken,
    token_type: 'bearer',
    expires_in: expiresIn,
    expires_at: expiresAt,
    refresh_token: refreshToken,
    user: userObj,
  };
}

async function handleAuthRoutes(req, res, pathname, parsedUrl) {
  const method = req.method;

  // POST /auth/v1/token (?grant_type=password | refresh_token)
  if (pathname === '/auth/v1/token' && method === 'POST') {
    const body = await parseBody(req);
    const grantType = parsedUrl.searchParams.get('grant_type') || body.grant_type || 'password';

    if (grantType === 'refresh_token' && body.refresh_token) {
      const decoded = decodeJwtPayload(body.refresh_token);
      if (decoded?.sub) {
        const dbUser = await findAuthUserById(decoded.sub);
        if (dbUser) {
          return sendJson(res, 200, buildAuthSessionResponse(dbUser));
        }
      }
      return sendJson(res, 400, { error: 'invalid_grant', error_description: 'Refresh token inválido' });
    }

    const email = body.email || '';
    const password = body.password || '';
    const dbUser = await authenticateUserByEmailPassword(email, password);
    if (!dbUser) {
      return sendJson(res, 400, {
        error: 'invalid_grant',
        error_description: 'Credenciales incorrectas. Verifique correo y contraseña.',
        message: 'Credenciales incorrectas. Verifique correo y contraseña.',
      });
    }

    return sendJson(res, 200, buildAuthSessionResponse(dbUser));
  }

  // POST /auth/v1/signup
  if (pathname === '/auth/v1/signup' && method === 'POST') {
    const body = await parseBody(req);
    const email = body.email || '';
    const password = body.password || '';
    const metadata = body.data || body.user_metadata || {};

    try {
      const dbUser = await createOrUpdateAuthUser(email, password, metadata);
      return sendJson(res, 200, buildAuthSessionResponse(dbUser));
    } catch (err) {
      return sendJson(res, 400, {
        error: 'signup_error',
        message: err.message || 'No se pudo registrar el usuario.',
      });
    }
  }

  // GET /auth/v1/user
  if (pathname === '/auth/v1/user' && method === 'GET') {
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    const decoded = decodeJwtPayload(token);
    if (decoded?.sub) {
      const dbUser = await findAuthUserById(decoded.sub);
      if (dbUser) {
        return sendJson(res, 200, buildAuthUserObject(dbUser));
      }
    }
    return sendJson(res, 401, { message: 'Sesión no válida o expirada' });
  }

  // PUT /auth/v1/user
  if (pathname === '/auth/v1/user' && method === 'PUT') {
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    const decoded = decodeJwtPayload(token);
    const body = await parseBody(req);
    if (decoded?.sub && body.password) {
      const updated = await updateAuthUserPasswordById(decoded.sub, body.password);
      return sendJson(res, 200, { user: buildAuthUserObject(updated) });
    }
    return sendJson(res, 400, { message: 'No se pudo actualizar el usuario' });
  }

  // POST /auth/v1/logout
  if (pathname === '/auth/v1/logout' && method === 'POST') {
    res.writeHead(204, CORS_HEADERS);
    return res.end();
  }

  // Admin Users Management (/api/admin-users/* o /auth/v1/admin/users/*)
  if (pathname.startsWith('/api/admin-users') || pathname.startsWith('/auth/v1/admin/users')) {
    const cleanPath = pathname
      .replace(/^\/api\/admin-users\/?/, '')
      .replace(/^\/auth\/v1\/admin\/users\/?/, '')
      .replace(/\/$/, '');

    // POST -> Create user
    if (!cleanPath && method === 'POST') {
      const body = await parseBody(req);
      const email = body.email || '';
      const password = body.password || '';
      const metadata = body.user_metadata || {};
      try {
        const dbUser = await createOrUpdateAuthUser(email, password, metadata);
        const userObj = buildAuthUserObject(dbUser);
        return sendJson(res, 200, { ...userObj, user: userObj });
      } catch (err) {
        return sendJson(res, 400, { message: err.message });
      }
    }

    // PUT /:id -> Update user password
    if (cleanPath && (method === 'PUT' || method === 'PATCH')) {
      const body = await parseBody(req);
      try {
        const dbUser = await updateAuthUserPasswordById(cleanPath, body.password, body.email);
        const userObj = buildAuthUserObject(dbUser);
        return sendJson(res, 200, { ...userObj, user: userObj });
      } catch (err) {
        return sendJson(res, 400, { message: err.message });
      }
    }
  }

  return sendJson(res, 404, { message: 'Auth endpoint not found' });
}

// ============================================================================
// 2. POSTGREST PROXY (/rest/v1/*, /api/leads, /api/planes)
// ============================================================================

async function handlePostgrestProxy(req, res, pathname, parsedUrl) {
  let targetSubpath = pathname.replace(/^\/rest\/v1/, '');
  let targetSearch = parsedUrl.search || '';

  // Alias para Landing Page (multibancaexpress.com)
  if (pathname === '/api/leads' || pathname === '/api/leads/') {
    targetSubpath = '/suscriptores_leads';
  } else if (pathname === '/api/planes' || pathname === '/api/planes/') {
    targetSubpath = '/config_sistema';
    targetSearch = '?parametro=eq.planes_saas_catalogo&select=valor';
  }

  if (!targetSubpath.startsWith('/')) {
    targetSubpath = '/' + targetSubpath;
  }

  const targetUrl = `${POSTGREST_URL}${targetSubpath}${targetSearch}`;
  const method = req.method;

  const forwardHeaders = {};
  const allowedIncoming = [
    'accept',
    'content-type',
    'prefer',
    'range',
    'range-unit',
    'accept-profile',
    'content-profile',
  ];

  for (const key of allowedIncoming) {
    if (req.headers[key]) {
      forwardHeaders[key] = req.headers[key];
    }
  }

  // Para /api/leads asegurar return=representation
  if ((pathname === '/api/leads' || pathname === '/api/leads/') && !forwardHeaders['prefer']) {
    forwardHeaders['prefer'] = 'return=representation';
  }

  let bodyBuf = undefined;
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    bodyBuf = await parseBodyBuffer(req);
  }

  try {
    const pgRes = await fetch(targetUrl, {
      method,
      headers: forwardHeaders,
      body: bodyBuf && bodyBuf.length > 0 ? bodyBuf : undefined,
    });

    const respHeaders = { ...CORS_HEADERS };
    const passBackHeaders = [
      'content-type',
      'content-range',
      'range-unit',
      'preference-applied',
      'content-location',
      'location',
    ];

    for (const h of passBackHeaders) {
      const val = pgRes.headers.get(h);
      if (val) respHeaders[h] = val;
    }

    const respArrayBuffer = await pgRes.arrayBuffer();
    const respBuf = Buffer.from(respArrayBuffer);

    res.writeHead(pgRes.status, respHeaders);
    res.end(respBuf);

    // Si fue una escritura exitosa, emitir notificación en vivo a los clientes WebSocket
    if (pgRes.ok && ['POST', 'PATCH', 'PUT', 'DELETE'].includes(method)) {
      const tableName = targetSubpath.slice(1).split('/')[0];
      if (tableName) {
        notifyPostgresChange(tableName, method);
      }
    }
  } catch (err) {
    console.error('[PostgREST Proxy Error]:', err.message);
    return sendJson(res, 502, {
      code: 'PGRST_CONNECTION_ERROR',
      message: 'Error comunicando con el motor PostgREST interno: ' + err.message,
    });
  }
}

// ============================================================================
// 3. REALTIME WEBSOCKET HUB (RFC 6455 + Phoenix Protocol para Supabase JS)
// ============================================================================

const wsClients = new Set();

function encodeWsFrame(text) {
  const payload = Buffer.from(text, 'utf8');
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x81; // FIN + text frame
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([header, payload]);
}

function decodeWsFrames(buffer) {
  const messages = [];
  let offset = 0;

  while (offset + 2 <= buffer.length) {
    const byte1 = buffer[offset];
    const byte2 = buffer[offset + 1];
    const opcode = byte1 & 0x0f;
    const isMasked = (byte2 & 0x80) !== 0;
    let payloadLen = byte2 & 0x7f;
    let headerLen = 2;

    if (payloadLen === 126) {
      if (offset + 4 > buffer.length) break;
      payloadLen = buffer.readUInt16BE(offset + 2);
      headerLen = 4;
    } else if (payloadLen === 127) {
      if (offset + 10 > buffer.length) break;
      payloadLen = Number(buffer.readBigUInt64BE(offset + 2));
      headerLen = 10;
    }

    const maskLen = isMasked ? 4 : 0;
    if (offset + headerLen + maskLen + payloadLen > buffer.length) break;

    const payload = Buffer.alloc(payloadLen);
    if (isMasked) {
      const maskOffset = offset + headerLen;
      const dataOffset = maskOffset + 4;
      for (let i = 0; i < payloadLen; i++) {
        payload[i] = buffer[dataOffset + i] ^ buffer[maskOffset + (i % 4)];
      }
    } else {
      buffer.copy(payload, 0, offset + headerLen, offset + headerLen + payloadLen);
    }

    offset += headerLen + maskLen + payloadLen;

    if (opcode === 0x08) {
      messages.push({ type: 'close' });
    } else if (opcode === 0x09) {
      messages.push({ type: 'ping', data: payload });
    } else if (opcode === 0x01) {
      messages.push({ type: 'text', text: payload.toString('utf8') });
    }
  }

  return { messages, remaining: buffer.slice(offset) };
}

function sendWsMessage(client, msgObj) {
  if (client.socket.destroyed) return;
  try {
    if (client.isArrayProtocol) {
      const arr = [
        msgObj.join_ref || null,
        msgObj.ref || null,
        msgObj.topic,
        msgObj.event,
        msgObj.payload || {},
      ];
      client.socket.write(encodeWsFrame(JSON.stringify(arr)));
    } else {
      client.socket.write(encodeWsFrame(JSON.stringify(msgObj)));
    }
  } catch (_) {}
}

function broadcastRealtimeEvent(type, data) {
  const payload = {
    type: 'broadcast',
    event: 'GLOBAL_EVENT',
    payload: {
      type,
      data: { ...data, timestamp: Date.now() },
    },
  };
  for (const client of wsClients) {
    for (const topic of client.topics) {
      if (topic.includes('multibanca_global_sync')) {
        sendWsMessage(client, {
          topic,
          event: 'broadcast',
          payload,
          ref: null,
        });
      }
    }
  }
}

function notifyPostgresChange(tableName, method) {
  const eventType = method === 'POST' ? 'INSERT' : method === 'DELETE' ? 'DELETE' : 'UPDATE';
  for (const client of wsClients) {
    for (const topic of client.topics) {
      if (topic === 'phoenix') continue;
      sendWsMessage(client, {
        topic,
        event: 'postgres_changes',
        payload: {
          data: {
            schema: 'public',
            table: tableName,
            commit_timestamp: new Date().toISOString(),
            type: eventType,
            record: {},
            old_record: {},
            errors: null,
          },
          ids: [1],
        },
        ref: null,
      });
    }
  }
}

function handleWsUpgrade(req, socket) {
  const key = req.headers['sec-websocket-key'];
  if (!key) {
    socket.destroy();
    return;
  }

  const acceptKey = crypto
    .createHash('sha1')
    .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
    .digest('base64');

  socket.write(
    [
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${acceptKey}`,
      '\r\n',
    ].join('\r\n')
  );

  const client = {
    socket,
    topics: new Set(),
    isArrayProtocol: false,
    buffer: Buffer.alloc(0),
  };
  wsClients.add(client);

  socket.on('data', (chunk) => {
    client.buffer = Buffer.concat([client.buffer, chunk]);
    const { messages, remaining } = decodeWsFrames(client.buffer);
    client.buffer = remaining;

    for (const m of messages) {
      if (m.type === 'close') {
        socket.end();
        wsClients.delete(client);
        return;
      }
      if (m.type === 'text') {
        try {
          const parsed = JSON.parse(m.text);
          let topic, event, payload, ref, join_ref;
          if (Array.isArray(parsed)) {
            client.isArrayProtocol = true;
            [join_ref, ref, topic, event, payload] = parsed;
          } else {
            ({ topic, event, payload, ref, join_ref } = parsed);
          }

          if (event === 'phx_join') {
            client.topics.add(topic);
            const pgChanges = payload?.config?.postgres_changes || [];
            const enrichedChanges = pgChanges.map((c, idx) => ({ ...c, id: idx + 1 }));
            sendWsMessage(client, {
              join_ref,
              ref,
              topic,
              event: 'phx_reply',
              payload: {
                status: 'ok',
                response: { postgres_changes: enrichedChanges },
              },
            });
          } else if (event === 'heartbeat') {
            sendWsMessage(client, {
              join_ref: null,
              ref,
              topic: 'phoenix',
              event: 'phx_reply',
              payload: { status: 'ok', response: {} },
            });
          } else if (event === 'access_token') {
            sendWsMessage(client, {
              join_ref,
              ref,
              topic,
              event: 'phx_reply',
              payload: { status: 'ok', response: {} },
            });
          } else if (event === 'phx_leave') {
            client.topics.delete(topic);
            sendWsMessage(client, {
              join_ref,
              ref,
              topic,
              event: 'phx_reply',
              payload: { status: 'ok', response: {} },
            });
          } else if (event === 'broadcast') {
            for (const other of wsClients) {
              if (other !== client && other.topics.has(topic)) {
                sendWsMessage(other, {
                  join_ref: null,
                  ref: null,
                  topic,
                  event: 'broadcast',
                  payload,
                });
              }
            }
            if (ref) {
              sendWsMessage(client, {
                join_ref,
                ref,
                topic,
                event: 'phx_reply',
                payload: { status: 'ok', response: {} },
              });
            }
          }
        } catch (_) {}
      }
    }
  });

  socket.on('close', () => wsClients.delete(client));
  socket.on('error', () => wsClients.delete(client));
}

// ============================================================================
// 4. WEB SERVICE PÚBLICO DE PAGOS, SNAPSHOTS Y AGENCIAS (/api/v1/*)
// ============================================================================

function normalizeCurrency(raw) {
  if (!raw) return 'BS';
  const c = String(raw).toUpperCase().trim();
  if (['VES', 'BS', 'BOLIVARES', 'BOLÍVARES', 'BS.'].includes(c)) return 'BS';
  if (['USD', 'DOLARES', 'DÓLARES', '$'].includes(c)) return 'USD';
  if (['COP', 'PESOS', 'PESOS COLOMBIANOS'].includes(c)) return 'COP';
  if (['EUR', 'EUROS', '€'].includes(c)) return 'EUR';
  if (['USDT', 'TETHER', 'CRYPTO'].includes(c)) return 'USDT';
  return c;
}

function normalizeMethod(raw) {
  if (!raw) return 'TRANSFERENCIA';
  const m = String(raw).toUpperCase().trim();
  if (m.includes('MOVIL') || m.includes('MÓVIL') || m.includes('PAGOMOVIL')) return 'PAGO MOVIL';
  if (m.includes('PUNTO') || m.includes('POS')) return 'PUNTO DE VENTA';
  if (m.includes('ZELLE')) return 'ZELLE';
  if (m.includes('BINANCE') || m.includes('USDT')) return 'BINANCE';
  if (m.includes('EFECTIVO') || m.includes('CASH')) return 'EFECTIVO';
  if (m.includes('BANCO') || m.includes('TRANSFER')) return 'TRANSFERENCIA';
  return m;
}

function checkRateLimit(ip) {
  const now = Date.now();
  let item = rateLimitMap.get(ip);
  if (!item || now > item.resetTime) {
    item = { count: 1, resetTime: now + RATE_LIMIT_WINDOW };
    rateLimitMap.set(ip, item);
    return true;
  }
  item.count++;
  return item.count <= RATE_LIMIT_MAX;
}

async function authenticateRequest(req, parsedUrl) {
  const apiKey =
    req.headers['x-api-key'] ||
    (req.headers['authorization']?.startsWith('Bearer ') ? req.headers['authorization'].slice(7).trim() : null) ||
    parsedUrl.searchParams.get('api_key');

  if (!apiKey) {
    return { authenticated: false, error: 'Falta encabezado X-API-Key o Bearer Token' };
  }

  if (apiKey === DEFAULT_API_KEY) {
    return {
      authenticated: true,
      keyType: 'master',
      userId: process.env.DEFAULT_TENANT_ID || null,
      permissions: ['read', 'write', 'confirm'],
    };
  }

  try {
    const pgKeyRow = await findApiKeyRecord(apiKey);
    if (pgKeyRow && pgKeyRow.user_id) {
      return {
        authenticated: true,
        keyType: 'tenant',
        userId: pgKeyRow.user_id,
        permissions: ['read', 'write'],
      };
    }
  } catch (_) {}

  if (apiKey.startsWith('mbe_live_') && apiKey.length >= 20) {
    return {
      authenticated: true,
      keyType: 'dynamic',
      userId: parsedUrl.searchParams.get('user_id') || null,
      permissions: ['read', 'write'],
    };
  }

  return { authenticated: false, error: 'API Key inválida o no autorizada' };
}

async function handleReceivePayment(req, res, auth, body) {
  const {
    agencia,
    monto,
    moneda,
    referencia,
    metodo,
    concepto,
    pagador,
    telefono,
    cedula,
    cuenta_destino,
    comprobante_url,
    fecha,
    metadata,
    user_id: requestedUserId,
  } = body;

  if (!agencia || typeof agencia !== 'string' || !agencia.trim()) {
    return sendJson(res, 400, {
      success: false,
      error: 'PARAMETRO_REQUERIDO',
      message: "El campo 'agencia' es obligatorio (nombre o identificador de la agencia).",
    });
  }

  const numMonto = parseFloat(monto);
  if (isNaN(numMonto) || numMonto <= 0) {
    return sendJson(res, 400, {
      success: false,
      error: 'MONTO_INVALIDO',
      message: "El campo 'monto' debe ser un número positivo mayor a 0.",
    });
  }

  if (!referencia || typeof referencia !== 'string' || !referencia.trim()) {
    return sendJson(res, 400, {
      success: false,
      error: 'REFERENCIA_REQUERIDA',
      message: "El campo 'referencia' es obligatorio (número o código de confirmación bancaria).",
    });
  }

  const normMoneda = normalizeCurrency(moneda);
  const normMetodo = normalizeMethod(metodo);
  const cleanRef = referencia.toUpperCase().trim();
  const cleanAgencia = agencia.toUpperCase().trim();
  const cleanPagador = pagador ? String(pagador).trim() : cedula ? `C.I. ${cedula}` : 'CLIENTE EXTERNO';
  const nowIso = new Date().toISOString();
  const txDate = fecha ? new Date(fecha).toISOString() : nowIso;

  let effectiveUserId = auth.userId || requestedUserId;
  if (!effectiveUserId) {
    try {
      const pgUserId = await findAgencyUserId(cleanAgencia);
      if (pgUserId) effectiveUserId = pgUserId;
    } catch (_) {}
  }

  try {
    const dup = await findDuplicatePayment(cleanRef, normMoneda, 7);
    if (dup) {
      return sendJson(res, 409, {
        success: false,
        error: 'PAGO_DUPLICADO',
        message: `El pago con referencia '${cleanRef}' (${normMoneda} ${numMonto}) ya fue recibido previamente.`,
        transaccion_existente: {
          id: dup.id,
          referencia: dup.referencia,
          monto: dup.monto,
          moneda: dup.moneda,
          agencia: dup.agencia,
          estado: dup.confirmado ? 'CONFIRMADO' : dup.estado || 'PENDIENTE',
          fecha_registro: dup.created_at,
        },
      });
    }
  } catch (dedupeErr) {
    console.warn('[API] Warning during deduplication check:', dedupeErr.message);
  }

  const trackingUuid = `TX-${crypto.randomBytes(4).toString('hex').toUpperCase()}-${Date.now().toString().slice(-4)}`;
  const isPremio =
    String(concepto || '').toUpperCase().includes('PREMIO') ||
    String(metodo || '').toUpperCase().includes('PREMIO');

  const cdaPayload = {
    agencia: cleanAgencia,
    monto: numMonto,
    moneda: normMoneda,
    referencia: cleanRef,
    metodo_pago: normMetodo,
    categoria: isPremio ? 'Pago de Premios' : 'Bancos',
    concepto: concepto ? String(concepto).trim() : `Pago API Externa (${cleanRef})`,
    datos_pagador: cleanPagador + (telefono ? ` | Tel: ${telefono}` : ''),
    cajero_id: 'API',
    pos_o_cuenta: cuenta_destino ? String(cuenta_destino).trim() : null,
    comprobante_url: comprobante_url ? String(comprobante_url).trim() : null,
    confirmado: false,
    confirmado_supervisor: false,
    confirmado_por: null,
    rechazado: false,
    estado: 'PENDIENTE',
    fecha: txDate,
    created_at: nowIso,
  };

  if (effectiveUserId) {
    cdaPayload.user_id = effectiveUserId;
  }

  let inserted = null;
  try {
    inserted = await insertPaymentRecord(cdaPayload);
    notifyPostgresChange('cda_pagos_bancarios', 'POST');
    broadcastRealtimeEvent('NEW_BANK_PAYMENT', {
      id: inserted?.id,
      tabla: 'cda_pagos_bancarios',
      agencia: cleanAgencia,
      monto: numMonto,
      moneda: normMoneda,
      referencia: cleanRef,
      metodo_pago: normMetodo,
      pagador: cleanPagador,
      concepto: cdaPayload.concepto,
      cajero_id: 'API',
      created_at: nowIso,
    });
  } catch (insertErr) {
    console.error('[API] Error inserting into cda_pagos_bancarios:', insertErr);
    return sendJson(res, 500, {
      success: false,
      error: 'ERROR_INSERCION',
      message: 'No se pudo registrar el pago en la base de datos: ' + insertErr.message,
    });
  }

  return sendJson(res, 201, {
    success: true,
    mensaje: 'Pago recibido exitosamente en cola de Confirmaciones. Un operador lo verificará en Pizarra.',
    transaccion: {
      id: inserted?.id || null,
      tracking_id: trackingUuid,
      agencia: cleanAgencia,
      monto: numMonto,
      moneda: normMoneda,
      referencia: cleanRef,
      metodo: normMetodo,
      concepto: cdaPayload.concepto,
      pagador: cleanPagador,
      estado: 'PENDIENTE',
      requiere_confirmacion: true,
      fecha_recepcion: nowIso,
      metadata: metadata || null,
    },
  });
}

async function handleBatchPayments(req, res, auth, body) {
  const items = Array.isArray(body) ? body : body?.pagos;
  if (!Array.isArray(items) || items.length === 0) {
    return sendJson(res, 400, {
      success: false,
      error: 'PAYLOAD_INVALIDO',
      message: "Se requiere un array de pagos en el cuerpo o bajo la clave 'pagos'.",
    });
  }

  if (items.length > 50) {
    return sendJson(res, 400, {
      success: false,
      error: 'LIMITE_EXCEDIDO',
      message: 'El límite máximo por lote es de 50 transacciones por solicitud.',
    });
  }

  const results = [];
  let successful = 0;
  let failed = 0;

  for (const item of items) {
    try {
      let capturedStatus = 200;
      let capturedData = null;
      const mockRes = {
        writeHead: (status) => {
          capturedStatus = status;
        },
        end: (dataStr) => {
          capturedData = JSON.parse(dataStr);
        },
      };

      await handleReceivePayment(req, mockRes, auth, item);
      if (capturedStatus === 201) {
        successful++;
        results.push({
          referencia: item.referencia,
          estado: 'PROCESADO',
          transaccion: capturedData.transaccion,
        });
      } else {
        failed++;
        results.push({
          referencia: item.referencia,
          estado: 'FALLIDO',
          error: capturedData.error,
          mensaje: capturedData.message,
        });
      }
    } catch (err) {
      failed++;
      results.push({
        referencia: item.referencia,
        estado: 'ERROR',
        mensaje: err.message,
      });
    }
  }

  return sendJson(res, 207, {
    success: failed === 0,
    resumen: {
      total: items.length,
      procesados_exitosos: successful,
      fallidos: failed,
    },
    resultados: results,
  });
}

async function handleVerifyPayment(req, res, auth, parsedUrl) {
  const ref = parsedUrl.searchParams.get('referencia');
  const id = parsedUrl.searchParams.get('id');

  if (!ref && !id) {
    return sendJson(res, 400, {
      success: false,
      error: 'PARAMETRO_REQUERIDO',
      message: "Debe proveer el parámetro 'referencia' o 'id' en la consulta.",
    });
  }

  try {
    const p = await findPaymentStatus(id, ref);
    if (!p) {
      return sendJson(res, 404, {
        success: false,
        error: 'PAGO_NO_ENCONTRADO',
        message: `No se encontró ningún pago con los criterios suministrados (${id ? `ID: ${id}` : `Ref: ${ref}`}).`,
      });
    }

    const isRech = Boolean(p.rechazado) || String(p.estado || '').toUpperCase() === 'RECHAZADO';
    const isConf = Boolean(p.confirmado) && !isRech;
    const estado = isRech ? 'RECHAZADO' : isConf ? 'CONFIRMADO' : 'PENDIENTE';

    return sendJson(res, 200, {
      success: true,
      pago: {
        id: p.id,
        referencia: p.referencia,
        agencia: p.agencia,
        monto: p.monto,
        moneda: p.moneda,
        metodo: p.metodo_pago,
        concepto: p.concepto,
        pagador: p.datos_pagador,
        estado,
        confirmado: isConf,
        rechazado: isRech,
        motivo_rechazo: p.motivo_rechazo || null,
        fecha: p.fecha || p.created_at,
      },
    });
  } catch (err) {
    return sendJson(res, 500, {
      success: false,
      error: 'ERROR_CONSULTA',
      message: err.message,
    });
  }
}

async function handleSimulatePayment(req, res, auth, body) {
  const { agencia, monto, referencia, moneda } = body;
  if (!agencia || !monto || !referencia) {
    return sendJson(res, 400, {
      success: false,
      error: 'PARAMETRO_REQUERIDO',
      message: "Modo Sandbox: se requieren 'agencia', 'monto' y 'referencia'.",
    });
  }

  return sendJson(res, 200, {
    success: true,
    modo: 'SANDBOX / SIMULACION (No se guardó en BD)',
    mensaje: 'Validación de estructura de pago exitosa. Los datos cumplen con todas las reglas de negocio.',
    datos_validados: {
      agencia: agencia.toUpperCase().trim(),
      monto: parseFloat(monto),
      moneda: normalizeCurrency(moneda),
      referencia: referencia.toUpperCase().trim(),
      metodo: normalizeMethod(body.metodo),
      estado_simulado: body.confirmado ? 'CONFIRMADO' : 'PENDIENTE',
      fecha_prueba: new Date().toISOString(),
    },
  });
}

async function handleSaveSnapshot(req, res, auth, body) {
  const userId = auth.userId || body.user_id;
  if (!userId || !body.semana_no) {
    return sendJson(res, 400, {
      success: false,
      error: 'PARAMETRO_REQUERIDO',
      message: "Se requieren 'user_id' y 'semana_no' para guardar el snapshot.",
    });
  }

  try {
    const record = await saveWeeklySnapshotRecord({
      ...body,
      user_id: userId,
    });
    return sendJson(res, 200, {
      success: true,
      message: `Snapshot Total de Semana ${body.semana_no} guardado exitosamente en PostgreSQL.`,
      snapshot: record,
    });
  } catch (err) {
    console.error('[API] Error saving snapshot in PostgreSQL:', err.message);
    return sendJson(res, 500, {
      success: false,
      error: 'ERROR_SNAPSHOT_PG',
      message: err.message,
    });
  }
}

async function handleGetSnapshot(req, res, auth, parsedUrl) {
  const userId = auth.userId || parsedUrl.searchParams.get('user_id');
  const semanaNo = parsedUrl.searchParams.get('semana_no');

  if (!userId || !semanaNo) {
    return sendJson(res, 400, {
      success: false,
      error: 'PARAMETRO_REQUERIDO',
      message: "Parámetros requeridos: 'user_id' y 'semana_no'.",
    });
  }

  try {
    const record = await findWeeklySnapshotRecord(userId, semanaNo);
    if (!record) {
      return sendJson(res, 404, {
        success: false,
        error: 'SNAPSHOT_NO_ENCONTRADO',
        message: `No se encontró snapshot para la Semana ${semanaNo}.`,
      });
    }
    return sendJson(res, 200, {
      success: true,
      snapshot: record,
    });
  } catch (err) {
    return sendJson(res, 500, {
      success: false,
      error: 'ERROR_CONSULTA_SNAPSHOT',
      message: err.message,
    });
  }
}

async function handleBulkAgencies(req, res, auth, body) {
  const userId = auth.userId || body.user_id;
  const agenciesList = body.agencies || [];

  if (!Array.isArray(agenciesList) || agenciesList.length === 0) {
    return sendJson(res, 400, {
      success: false,
      error: 'PARAMETRO_REQUERIDO',
      message: "Se requiere un array 'agencies' con las agencias a registrar.",
    });
  }

  try {
    const result = await saveBulkAgenciesAndUsers(userId, agenciesList);
    return sendJson(res, 201, {
      success: true,
      mensaje: `Carga masiva registrada en PostgreSQL nativo: ${result.inserted} creadas, ${result.updated} actualizadas.`,
      resultado: result,
    });
  } catch (err) {
    return sendJson(res, 500, {
      success: false,
      error: 'ERROR_REGISTRO_POSTGRES',
      message: err.message,
    });
  }
}

function getOpenApiSpec() {
  return {
    openapi: '3.0.3',
    info: {
      title: 'Multibanca Express / Operadora CMS - Public Payments API & Backend',
      version: '2.0.0',
      description:
        'Backend Principal (/rest/v1, /auth/v1, /realtime/v1) y Web Service Público REST (/api/v1) conectado nativamente a PostgreSQL 17 en DigitalOcean.',
    },
    servers: [
      { url: 'https://crm.multibancaexpress.com', description: 'Servidor Producción HTTPS' },
      { url: `http://localhost:${PORT}`, description: 'Servidor Local de Pruebas' },
    ],
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key',
          description: 'Clave de autenticación API provista en el CMS.',
        },
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'Token',
        },
      },
    },
    security: [{ ApiKeyAuth: [] }, { BearerAuth: [] }],
    paths: {
      '/api/v1/payments': {
        post: {
          summary: 'Registrar nuevo pago entrante',
          responses: {
            201: { description: 'Pago registrado exitosamente' },
            400: { description: 'Parámetros inválidos' },
            401: { description: 'No autorizado' },
            409: { description: 'Pago duplicado' },
          },
        },
      },
      '/api/v1/payments/verify': {
        get: {
          summary: 'Verificar estado de un pago',
          parameters: [
            { name: 'referencia', in: 'query', schema: { type: 'string' } },
            { name: 'id', in: 'query', schema: { type: 'integer' } },
          ],
          responses: {
            200: { description: 'Estado actual del pago' },
            404: { description: 'No encontrado' },
          },
        },
      },
      '/api/v1/health': {
        get: {
          summary: 'Health check del servicio',
          responses: { 200: { description: 'Servicio en línea' } },
        },
      },
    },
  };
}

// ============================================================================
// MAIN HTTP SERVER & ROUTER
// ============================================================================

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;
  const method = req.method;
  const clientIp = req.socket.remoteAddress || '127.0.0.1';

  // 1. CORS Preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      ...CORS_HEADERS,
      'Access-Control-Max-Age': '86400',
    });
    return res.end();
  }

  try {
    // 2. Health check
    if (pathname === '/api/v1/health' || pathname === '/health' || pathname === '/api/health') {
      const dbStatus = await checkDbHealth();
      return sendJson(res, 200, {
        status: 'UP',
        servicio: 'Multibanca Express Backend & Payments Web Service',
        database: dbStatus,
        timestamp: new Date().toISOString(),
        uptime_seconds: Math.floor(process.uptime()),
        version: '2.0.0-digitalocean-unified',
      });
    }

    // 3. Backend Auth & Admin Users (/auth/v1/* y /api/admin-users/*)
    if (pathname.startsWith('/auth/v1/') || pathname.startsWith('/api/admin-users')) {
      return await handleAuthRoutes(req, res, pathname, parsedUrl);
    }

    // 4. Backend Data REST (/rest/v1/*, /api/leads, /api/planes)
    if (
      pathname.startsWith('/rest/v1/') ||
      pathname === '/api/leads' ||
      pathname === '/api/leads/' ||
      pathname === '/api/planes' ||
      pathname === '/api/planes/'
    ) {
      return await handlePostgrestProxy(req, res, pathname, parsedUrl);
    }

    // 5. OpenAPI Documentation
    if (pathname === '/api/v1/docs' || pathname === '/api/v1/openapi.json') {
      return sendJson(res, 200, getOpenApiSpec());
    }

    // 6. Rate Limiting & Auth for Public Web Service (/api/v1/*)
    if (pathname.startsWith('/api/v1/')) {
      if (!checkRateLimit(clientIp)) {
        return sendJson(res, 429, {
          success: false,
          error: 'RATE_LIMIT_EXCEDED',
          message: 'Demasiadas solicitudes. Límite excedido.',
        });
      }

      const auth = await authenticateRequest(req, parsedUrl);
      if (!auth.authenticated) {
        return sendJson(res, 401, {
          success: false,
          error: 'NO_AUTORIZADO',
          message: auth.error || 'Autenticación requerida. Envíe el header X-API-Key.',
        });
      }

      if (pathname === '/api/v1/payments' && method === 'POST') {
        const body = await parseBody(req);
        return await handleReceivePayment(req, res, auth, body);
      }

      if (pathname === '/api/v1/payments/batch' && method === 'POST') {
        const body = await parseBody(req);
        return await handleBatchPayments(req, res, auth, body);
      }

      if ((pathname === '/api/v1/payments/verify' || pathname === '/api/v1/payments/status') && method === 'GET') {
        return await handleVerifyPayment(req, res, auth, parsedUrl);
      }

      if (pathname === '/api/v1/payments/simulate' && method === 'POST') {
        const body = await parseBody(req);
        return await handleSimulatePayment(req, res, auth, body);
      }

      if (pathname === '/api/v1/snapshots' && method === 'POST') {
        const body = await parseBody(req);
        return await handleSaveSnapshot(req, res, auth, body);
      }

      if (pathname === '/api/v1/snapshots' && method === 'GET') {
        return await handleGetSnapshot(req, res, auth, parsedUrl);
      }

      if (pathname === '/api/v1/agencies/bulk' && method === 'POST') {
        const body = await parseBody(req);
        return await handleBulkAgencies(req, res, auth, body);
      }
    }

    return sendJson(res, 404, {
      success: false,
      error: 'RUTA_NO_ENCONTRADA',
      message: `El endpoint '${method} ${pathname}' no existe. Consulte /api/v1/docs`,
    });
  } catch (routeErr) {
    console.error('[API Server] Unhandled error:', routeErr);
    return sendJson(res, 500, {
      success: false,
      error: 'ERROR_INTERNO_SERVIDOR',
      message: routeErr.message || 'Error inesperado al procesar la solicitud.',
    });
  }
});

// WebSocket Upgrade for Supabase Realtime (/realtime/v1/websocket)
server.on('upgrade', (req, socket) => {
  if (req.url && req.url.startsWith('/realtime/v1')) {
    handleWsUpgrade(req, socket);
  } else {
    socket.destroy();
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n========================================================`);
  console.log(`🚀 Multibanca Express - Backend & Web Service Unificado`);
  console.log(`📡 Puerto: ${PORT}`);
  console.log(`🗄️  PostgREST Interno: ${POSTGREST_URL}`);
  console.log(`🌐 Web Service Pagos: http://localhost:${PORT}/api/v1/payments`);
  console.log(`🔐 Auth Service:      http://localhost:${PORT}/auth/v1/token`);
  console.log(`⚡ Realtime Socket:   ws://localhost:${PORT}/realtime/v1/websocket`);
  console.log(`========================================================\n`);
});

process.on('SIGTERM', () => server.close());
process.on('SIGINT', () => server.close());
