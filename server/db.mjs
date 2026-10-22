/**
 * Capa de Conexión Nativa a PostgreSQL (Connection Pooling)
 * Proyecto: Operadora CMS / Multibanca Express
 * 
 * Reemplaza consultas HTTP a Supabase PostgREST por conexiones SQL directas
 * optimizadas con pg.Pool para máxima velocidad, seguridad y baja latencia.
 */

import pg from 'pg';

const { Pool } = pg;

// Resolver cadena de conexión de base de datos
const connectionString =
  process.env.DATABASE_URL ||
  (process.env.POSTGRES_USER && process.env.POSTGRES_PASSWORD
    ? `postgresql://${process.env.POSTGRES_USER}:${encodeURIComponent(process.env.POSTGRES_PASSWORD)}@${process.env.POSTGRES_HOST || 'localhost'}:${process.env.POSTGRES_PORT || 5432}/${process.env.POSTGRES_DB || 'operadora_production'}`
    : null);

// Configuración del Pool de PostgreSQL
export const pool = new Pool({
  connectionString: connectionString || undefined,
  max: parseInt(process.env.PG_MAX_POOL || '20', 10), // Máximo 20 conexiones simultáneas
  idleTimeoutMillis: 30000, // Cerrar clientes inactivos después de 30 segundos
  connectionTimeoutMillis: 5000, // Timeout de conexión de 5 segundos
  ssl: process.env.PG_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

pool.on('error', (err) => {
  console.error('[DB Pool] Error inesperado en cliente inactivo de PostgreSQL:', err.message);
});

/**
 * Ejecuta una consulta SQL parametrizada con control de tiempo y errores
 * @param {string} text - Consulta SQL con placeholders ($1, $2, etc.)
 * @param {Array} params - Parámetros sanitizados
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

  if (payload.user_id) {
    fields.push('user_id');
    values.push(String(payload.user_id));
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
    sql += ' WHERE id = $1';
    params.push(parseInt(id, 10));
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
  const sql = `
    INSERT INTO weekly_closure_snapshots (
      user_id, semana_no, periodo, fecha_cierre,
      raw_sales_loads, consolidated_totals, agency_matrix,
      operator_matrix, all_movements, carry_over_balances,
      integrity_hash, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
    ON CONFLICT (user_id, semana_no) DO UPDATE SET
      periodo = EXCLUDED.periodo,
      fecha_cierre = EXCLUDED.fecha_cierre,
      raw_sales_loads = EXCLUDED.raw_sales_loads,
      consolidated_totals = EXCLUDED.consolidated_totals,
      agency_matrix = EXCLUDED.agency_matrix,
      operator_matrix = EXCLUDED.operator_matrix,
      all_movements = EXCLUDED.all_movements,
      carry_over_balances = EXCLUDED.carry_over_balances,
      integrity_hash = EXCLUDED.integrity_hash,
      updated_at = NOW()
    RETURNING id, user_id, semana_no, periodo, fecha_cierre, integrity_hash, created_at, updated_at;
  `;

  const params = [
    snapshot.user_id,
    String(snapshot.semana_no),
    snapshot.periodo,
    snapshot.fecha_cierre || new Date().toISOString(),
    JSON.stringify(snapshot.raw_sales_loads || []),
    JSON.stringify(snapshot.consolidated_totals || {}),
    JSON.stringify(snapshot.agency_matrix || []),
    JSON.stringify(snapshot.operator_matrix || []),
    JSON.stringify(snapshot.all_movements || {}),
    JSON.stringify(snapshot.carry_over_balances || []),
    snapshot.integrity_hash || '',
  ];

  const res = await query(sql, params);
  return res.rows[0];
}

/**
 * Consultar un Snapshot Total por semana y user_id
 */
export async function findWeeklySnapshotRecord(userId, semanaNo) {
  const sql = `
    SELECT id, user_id, semana_no, periodo, fecha_cierre,
           raw_sales_loads, consolidated_totals, agency_matrix,
           operator_matrix, all_movements, carry_over_balances,
           integrity_hash, created_at, updated_at
    FROM weekly_closure_snapshots
    WHERE user_id = $1 AND semana_no = $2
    LIMIT 1;
  `;
  const res = await query(sql, [userId, String(semanaNo)]);
  return res.rows[0] || null;
}

