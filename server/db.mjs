/**
 * Capa de Conexión Nativa a PostgreSQL (Connection Pooling)
 * Proyecto: Operadora CMS / Multibanca Express
 * 
 * Conecta el Backend Principal (/rest/v1, /auth/v1) y el Web Service (/api/v1)
 * directamente al PostgreSQL 17 de DigitalOcean mediante pg.Pool.
 */

import pg from 'pg';

const { Pool } = pg;

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUuid(val) {
  return typeof val === 'string' && UUID_REGEX.test(val.trim());
}

// Resolver cadena de conexión de base de datos
const connectionString =
  process.env.DATABASE_URL ||
  (process.env.POSTGRES_USER && process.env.POSTGRES_PASSWORD
    ? `postgresql://${process.env.POSTGRES_USER}:${encodeURIComponent(process.env.POSTGRES_PASSWORD)}@${process.env.POSTGRES_HOST || 'localhost'}:${process.env.POSTGRES_PORT || 5432}/${process.env.POSTGRES_DB || 'operadora_production'}`
    : null);

// Configuración del Pool de PostgreSQL
export const pool = new Pool({
  connectionString: connectionString || undefined,
  max: parseInt(process.env.PG_MAX_POOL || '25', 10),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  ssl: process.env.PG_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

pool.on('error', (err) => {
  console.error('[DB Pool] Error inesperado en cliente inactivo de PostgreSQL:', err.message);
});

/**
 * Ejecuta una consulta SQL parametrizada con control de tiempo y errores
 */
export async function query(text, params = []) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    if (process.env.DEBUG_SQL === 'true') {
      console.log('[DB SQL]', { text, duration: `${duration}ms`, rows: res.rowCount });
    }
    return res;
  } catch (err) {
    console.error('[DB Query Error]:', { text, error: err.message });
    throw err;
  }
}

/**
 * Health check de PostgreSQL
 */
export async function checkDbHealth() {
  const start = Date.now();
  try {
    const res = await pool.query('SELECT 1 AS healthy, NOW() AS server_time, version() AS pg_version');
    const latencyMs = Date.now() - start;
    return {
      healthy: true,
      latency_ms: latencyMs,
      server_time: res.rows[0]?.server_time,
      pg_version: res.rows[0]?.pg_version?.split(' ')?.[0] || 'PostgreSQL',
    };
  } catch (err) {
    return {
      healthy: false,
      error: err.message,
    };
  }
}

// ============================================================================
// MÓDULO DE AUTENTICACIÓN NATIVA (auth.users con pgcrypto bcrypt)
// ============================================================================

/**
 * Autenticar usuario por email y contraseña contra auth.users (bcrypt)
 */
export async function authenticateUserByEmailPassword(email, password) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  const cleanPass = String(password || '').trim();
  if (!cleanEmail || !cleanPass) return null;

  const res = await query(
    `SELECT id, email, role, aud, raw_user_meta_data, created_at, updated_at
     FROM auth.users
     WHERE LOWER(TRIM(email)) = $1
       AND encrypted_password IS NOT NULL
       AND encrypted_password = crypt($2, encrypted_password)
     LIMIT 1`,
    [cleanEmail, cleanPass]
  );
  return res.rows[0] || null;
}

/**
 * Buscar usuario en auth.users por UUID
 */
export async function findAuthUserById(userId) {
  if (!isValidUuid(userId)) return null;
  const res = await query(
    `SELECT id, email, role, aud, raw_user_meta_data, created_at, updated_at
     FROM auth.users
     WHERE id = $1::uuid
     LIMIT 1`,
    [userId.trim()]
  );
  return res.rows[0] || null;
}

/**
 * Buscar usuario en auth.users por email
 */
export async function findAuthUserByEmail(email) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!cleanEmail) return null;
  const res = await query(
    `SELECT id, email, role, aud, raw_user_meta_data, created_at, updated_at
     FROM auth.users
     WHERE LOWER(TRIM(email)) = $1
     LIMIT 1`,
    [cleanEmail]
  );
  return res.rows[0] || null;
}

/**
 * Crear o actualizar usuario en auth.users con hash bcrypt vía pgcrypto
 */
export async function createOrUpdateAuthUser(email, password, metadata = {}) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  const cleanPass = String(password || '').trim();
  if (!cleanEmail || !cleanPass) {
    throw new Error('Correo y contraseña obligatorios.');
  }

  const existing = await findAuthUserByEmail(cleanEmail);
  if (existing) {
    const upd = await query(
      `UPDATE auth.users
       SET encrypted_password = crypt($2, gen_salt('bf', 10)),
           raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || $3::jsonb,
           updated_at = NOW()
       WHERE id = $1::uuid
       RETURNING id, email, role, aud, raw_user_meta_data, created_at, updated_at`,
      [existing.id, cleanPass, JSON.stringify(metadata || {})]
    );
    return upd.rows[0];
  }

  const ins = await query(
    `INSERT INTO auth.users (email, encrypted_password, role, aud, raw_user_meta_data, created_at, updated_at)
     VALUES ($1, crypt($2, gen_salt('bf', 10)), 'authenticated', 'authenticated', $3::jsonb, NOW(), NOW())
     RETURNING id, email, role, aud, raw_user_meta_data, created_at, updated_at`,
    [cleanEmail, cleanPass, JSON.stringify(metadata || {})]
  );
  return ins.rows[0];
}

/**
 * Actualizar contraseña o datos de un usuario en auth.users por su UUID
 */
export async function updateAuthUserPasswordById(userId, newPassword, email = null) {
  if (!isValidUuid(userId)) {
    throw new Error('ID de usuario UUID inválido.');
  }
  const cleanPass = String(newPassword || '').trim();
  if (!cleanPass || cleanPass.length < 6) {
    throw new Error('La contraseña debe tener al menos 6 caracteres.');
  }

  const res = await query(
    `UPDATE auth.users
     SET encrypted_password = crypt($2, gen_salt('bf', 10)),
         updated_at = NOW()
     WHERE id = $1::uuid
     RETURNING id, email, role, aud, raw_user_meta_data, created_at, updated_at`,
    [userId.trim(), cleanPass]
  );

  if (res.rows[0]) {
    return res.rows[0];
  }

  // Si el perfil existía en public.perfiles pero no estaba en auth.users, lo creamos con el mismo UUID
  const profRes = await query(`SELECT email FROM public.perfiles WHERE id = $1::uuid LIMIT 1`, [userId.trim()]);
  const targetEmail = email || profRes.rows[0]?.email || `user_${userId.slice(0, 8)}@multibancaexpress.com`;

  const ins = await query(
    `INSERT INTO auth.users (id, email, encrypted_password, role, aud, created_at, updated_at)
     VALUES ($1::uuid, LOWER(TRIM($2)), crypt($3, gen_salt('bf', 10)), 'authenticated', 'authenticated', NOW(), NOW())
     RETURNING id, email, role, aud, raw_user_meta_data, created_at, updated_at`,
    [userId.trim(), targetEmail, cleanPass]
  );
  return ins.rows[0];
}

// ============================================================================
// MÓDULO DE WEB SERVICE (/api/v1/payments, /api/v1/snapshots, /api/v1/agencies)
// ============================================================================

/**
 * Buscar configuración de API Key en config_sistema
 */
export async function findApiKeyRecord(apiKey) {
  try {
    const res = await query(
      `SELECT user_id, valor, parametro 
       FROM config_sistema 
       WHERE (parametro = 'api_key' AND valor = $1)
          OR (parametro = 'config_api' AND valor ILIKE '%' || $1 || '%')
       LIMIT 1`,
      [apiKey]
    );
    return res.rows[0] || null;
  } catch (err) {
    console.warn('[DB] Error buscando API key en config_sistema:', err.message);
    return null;
  }
}

/**
 * Buscar el user_id de una agencia por nombre (búsqueda insensible a mayúsculas)
 */
export async function findAgencyUserId(cleanAgencia) {
  try {
    const res = await query(
      `SELECT user_id, nombre_agencia 
       FROM agencias 
       WHERE UPPER(TRIM(nombre_agencia)) = UPPER(TRIM($1))
       LIMIT 1`,
      [cleanAgencia]
    );
    return res.rows[0]?.user_id || null;
  } catch (err) {
    console.warn('[DB] Error buscando agencia:', err.message);
    return null;
  }
}

/**
 * Deduplicación: Verificar si ya existe un pago con la misma referencia y moneda en los últimos N días
 */
export async function findDuplicatePayment(referencia, moneda, daysLimit = 7) {
  try {
    const res = await query(
      `SELECT id, referencia, monto, moneda, agencia, confirmado, rechazado, created_at,
              CASE WHEN rechazado = true THEN 'RECHAZADO' 
                   WHEN confirmado = true THEN 'CONFIRMADO' 
                   ELSE 'PENDIENTE' END AS estado
       FROM cda_pagos_bancarios
       WHERE UPPER(TRIM(referencia)) = UPPER(TRIM($1))
         AND UPPER(TRIM(moneda)) = UPPER(TRIM($2))
         AND created_at >= NOW() - ($3 || ' days')::INTERVAL
       LIMIT 1`,
      [referencia, moneda, daysLimit.toString()]
    );
    return res.rows[0] || null;
  } catch (err) {
    console.warn('[DB] Error en verificación de duplicados:', err.message);
    return null;
  }
}

/**
 * Insertar pago en cda_pagos_bancarios de forma atómica y devolver el registro creado
 */
export async function insertPaymentRecord(payload) {
  const fields = [
    'agencia',
    'monto',
    'moneda',
    'referencia',
    'metodo_pago',
    'concepto',
    'datos_pagador',
    'cajero_id',
    'pos_o_cuenta',
    'confirmado',
    'confirmado_supervisor',
    'confirmado_por',
    'rechazado',
    'fecha',
    'created_at',
  ];

  const values = [
    payload.agencia,
    payload.monto,
    payload.moneda,
    payload.referencia,
    payload.metodo_pago,
    payload.concepto,
    payload.datos_pagador,
    payload.cajero_id,
    payload.pos_o_cuenta,
    payload.confirmado || false,
    payload.confirmado_supervisor || false,
    payload.confirmado_por || null,
    payload.rechazado || false,
    payload.fecha || new Date().toISOString().slice(0, 10),
    payload.created_at || new Date().toISOString(),
  ];

  if (payload.user_id && isValidUuid(String(payload.user_id))) {
    fields.push('user_id');
    values.push(String(payload.user_id).trim());
  }

  const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
  const sql = `
    INSERT INTO cda_pagos_bancarios (${fields.join(', ')})
    VALUES (${placeholders})
    RETURNING id, referencia, monto, moneda, agencia, confirmado, rechazado, created_at;
  `;

  const res = await query(sql, values);
  const row = res.rows[0];
  if (row) {
    row.estado = row.rechazado ? 'RECHAZADO' : row.confirmado ? 'CONFIRMADO' : 'PENDIENTE';
  }
  return row;
}

/**
 * Consultar estado de un pago por ID o por Referencia
 */
export async function findPaymentStatus(id, referencia) {
  let sql = `
    SELECT id, agencia, monto, moneda, referencia, metodo_pago, concepto, 
            datos_pagador, confirmado, rechazado, motivo_rechazo, fecha, created_at,
            CASE WHEN rechazado = true THEN 'RECHAZADO' 
                 WHEN confirmado = true THEN 'CONFIRMADO' 
                 ELSE 'PENDIENTE' END AS estado
    FROM cda_pagos_bancarios
  `;
  const params = [];

  if (id) {
    const parsedId = parseInt(id, 10);
    if (isNaN(parsedId)) return null;
    sql += ' WHERE id = $1';
    params.push(parsedId);
  } else if (referencia) {
    sql += ' WHERE UPPER(TRIM(referencia)) = UPPER(TRIM($1)) ORDER BY id DESC LIMIT 1';
    params.push(referencia);
  } else {
    return null;
  }

  const res = await query(sql, params);
  return res.rows[0] || null;
}

/**
 * Guardar o actualizar un Snapshot Total en PostgreSQL nativo
 */
export async function saveWeeklySnapshotRecord(snapshot) {
  if (!isValidUuid(snapshot.user_id)) {
    throw new Error('El campo user_id debe ser un UUID válido.');
  }

  const sql = `
    INSERT INTO weekly_closure_snapshots (
      user_id, semana_no, periodo, fecha_cierre,
      raw_sales_loads, consolidated_totals, agency_matrix,
      operator_matrix, group_matrix, all_movements, carry_over_balances,
      integrity_hash, is_locked, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
    ON CONFLICT (user_id, semana_no) DO UPDATE SET
      periodo = EXCLUDED.periodo,
      fecha_cierre = EXCLUDED.fecha_cierre,
      raw_sales_loads = EXCLUDED.raw_sales_loads,
      consolidated_totals = EXCLUDED.consolidated_totals,
      agency_matrix = EXCLUDED.agency_matrix,
      operator_matrix = EXCLUDED.operator_matrix,
      group_matrix = EXCLUDED.group_matrix,
      all_movements = EXCLUDED.all_movements,
      carry_over_balances = EXCLUDED.carry_over_balances,
      integrity_hash = EXCLUDED.integrity_hash,
      is_locked = EXCLUDED.is_locked,
      updated_at = NOW()
    RETURNING id, user_id, semana_no, periodo, fecha_cierre, integrity_hash, is_locked, created_at, updated_at;
  `;

  const params = [
    snapshot.user_id.trim(),
    String(snapshot.semana_no),
    snapshot.periodo,
    snapshot.fecha_cierre || new Date().toISOString(),
    JSON.stringify(snapshot.raw_sales_loads || []),
    JSON.stringify(snapshot.consolidated_totals || {}),
    JSON.stringify(snapshot.agency_matrix || []),
    JSON.stringify(snapshot.operator_matrix || []),
    JSON.stringify(snapshot.group_matrix || []),
    JSON.stringify(snapshot.all_movements || {}),
    JSON.stringify(snapshot.carry_over_balances || []),
    snapshot.integrity_hash || '',
    Boolean(snapshot.is_locked ?? false),
  ];

  const res = await query(sql, params);
  return res.rows[0];
}

/**
 * Consultar un Snapshot Total por semana y user_id
 */
export async function findWeeklySnapshotRecord(userId, semanaNo) {
  if (!isValidUuid(userId)) {
    return null;
  }
  const sql = `
    SELECT id, user_id, semana_no, periodo, fecha_cierre,
           raw_sales_loads, consolidated_totals, agency_matrix,
           operator_matrix, group_matrix, all_movements, carry_over_balances,
           integrity_hash, is_locked, created_at, updated_at
    FROM weekly_closure_snapshots
    WHERE user_id = $1::uuid AND semana_no = $2
    LIMIT 1;
  `;
  const res = await query(sql, [userId.trim(), String(semanaNo)]);
  return res.rows[0] || null;
}

/**
 * Inserción masiva de agencias y credenciales de taquilla en PostgreSQL nativo
 * Usa SAVEPOINT por fila para evitar abortar la transacción en caso de error puntual
 */
export async function saveBulkAgenciesAndUsers(userId, agenciesList) {
  if (!agenciesList || agenciesList.length === 0) return { inserted: 0, updated: 0 };

  const client = await pool.connect();
  let inserted = 0;
  let updated = 0;

  try {
    await client.query('BEGIN');

    for (let idx = 0; idx < agenciesList.length; idx++) {
      const item = agenciesList[idx];
      const uId = item.user_id || userId;
      const agencyName = (item.nombre_agencia || item.nombre || '').trim().toUpperCase();
      if (!agencyName || !isValidUuid(String(uId))) continue;

      const comision = Number(item.comision) || 0;
      const participacion = Number(item.participacion_ag ?? item.participacion) || 0;
      const sistemas = item.sistemas || 'GENERAL';
      const monedas = item.monedas || 'USD';
      const condiciones = typeof item.condiciones_sistemas === 'string'
        ? item.condiciones_sistemas
        : JSON.stringify(item.condiciones_sistemas || {});
      const usuarioTaq = (item.usuario_taquilla || item.usuarioTaquilla || agencyName).trim().replace(/\s+/g, '_');
      const claveTaq = (item.clave_taquilla || item.claveTaquilla || '1234').trim();
      const grupoId = item.grupo_id || item.grupoId || null;
      const grupoNombre = item.grupo_nombre || item.grupoNombre || null;

      const spName = `sp_agency_${idx}`;
      await client.query(`SAVEPOINT ${spName}`);

      let agencyId = null;
      try {
        const agencySql = `
          INSERT INTO agencias (
            user_id, nombre_agencia, comision, participacion_ag,
            sistemas, monedas, condiciones_sistemas, cuentas_asignadas,
            usuario_taquilla, clave_taquilla, grupo_id, grupo_nombre,
            saldo_inicial_bs, saldo_inicial_usd, saldo_inicial_cop, created_at
          ) VALUES (
            $1::uuid, $2, $3, $4, $5, $6, $7, 'NINGUNA', $8, $9, $10, $11, 0, 0, 0, NOW()
          )
          ON CONFLICT (user_id, nombre_agencia) DO UPDATE SET
            comision = EXCLUDED.comision,
            participacion_ag = EXCLUDED.participacion_ag,
            sistemas = EXCLUDED.sistemas,
            monedas = EXCLUDED.monedas,
            condiciones_sistemas = EXCLUDED.condiciones_sistemas,
            usuario_taquilla = EXCLUDED.usuario_taquilla,
            clave_taquilla = EXCLUDED.clave_taquilla,
            grupo_id = COALESCE(EXCLUDED.grupo_id, agencias.grupo_id),
            grupo_nombre = COALESCE(EXCLUDED.grupo_nombre, agencias.grupo_nombre)
          RETURNING id, (xmax = 0) AS is_inserted;
        `;

        const agRes = await client.query(agencySql, [
          uId, agencyName, comision, participacion,
          sistemas, monedas, condiciones,
          usuarioTaq, claveTaq, grupoId, grupoNombre
        ]);
        if (agRes.rows[0]) {
          agencyId = agRes.rows[0].id;
          if (agRes.rows[0].is_inserted) inserted++;
          else updated++;
        }
        await client.query(`RELEASE SAVEPOINT ${spName}`);
      } catch (agErr) {
        await client.query(`ROLLBACK TO SAVEPOINT ${spName}`);
        console.warn(`[DB] Advertencia insertando agencia ${agencyName}:`, agErr.message);
      }

      if (agencyId) {
        const spUser = `sp_user_${idx}`;
        await client.query(`SAVEPOINT ${spUser}`);
        try {
          const userSql = `
            INSERT INTO taquilla_usuarios (
              user_id, usuario, clave, agencia_id, nombre_cajero, rol, activo, created_at
            ) VALUES (
              $1::uuid, $2, $3, $4, $5, 'cajero', true, NOW()
            )
            ON CONFLICT (user_id, usuario) DO UPDATE SET
              clave = EXCLUDED.clave,
              agencia_id = EXCLUDED.agencia_id,
              nombre_cajero = EXCLUDED.nombre_cajero;
          `;
          await client.query(userSql, [uId, usuarioTaq, claveTaq, agencyId, agencyName]);
          await client.query(`RELEASE SAVEPOINT ${spUser}`);
        } catch (uErr) {
          await client.query(`ROLLBACK TO SAVEPOINT ${spUser}`);
        }
      }
    }

    await client.query('COMMIT');
    return { success: true, inserted, updated, total: agenciesList.length };
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[DB] Error en saveBulkAgenciesAndUsers:', err.message);
    throw err;
  } finally {
    client.release();
  }
}
