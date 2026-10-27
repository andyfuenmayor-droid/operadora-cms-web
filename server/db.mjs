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
      integrity_hash, is_locked, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
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
      is_locked = EXCLUDED.is_locked,
      updated_at = NOW()
    RETURNING id, user_id, semana_no, periodo, fecha_cierre, integrity_hash, is_locked, created_at, updated_at;
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
    Boolean(snapshot.is_locked ?? false),
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

/**
 * Inserción masiva de agencias y credenciales de taquilla en PostgreSQL nativo
 * Soporta idempotencia con ON CONFLICT (user_id, nombre_agencia)
 */
export async function saveBulkAgenciesAndUsers(userId, agenciesList) {
  if (!agenciesList || agenciesList.length === 0) return { inserted: 0, updated: 0 };

  const client = await pool.connect();
  let inserted = 0;
  let updated = 0;

  try {
    await client.query('BEGIN');

    for (const item of agenciesList) {
      const uId = item.user_id || userId;
      const agencyName = (item.nombre_agencia || item.nombre || '').trim().toUpperCase();
      if (!agencyName) continue;

      const comision = Number(item.comision) || 0;
      const participacion = Number(item.participacion_ag || item.participacion) || 0;
      const sistemas = item.sistemas || 'GENERAL';
      const monedas = item.monedas || 'USD';
      const condiciones = typeof item.condiciones_sistemas === 'string'
        ? item.condiciones_sistemas
        : JSON.stringify(item.condiciones_sistemas || {});
      const usuarioTaq = (item.usuario_taquilla || item.usuarioTaquilla || agencyName).trim().replace(/\s+/g, '_');
      const claveTaq = (item.clave_taquilla || item.claveTaquilla || '1234').trim();
      const grupoId = item.grupo_id || item.grupoId || null;
      const grupoNombre = item.grupo_nombre || item.grupoNombre || null;

      // 1. Insert or update agency
      const agencySql = `
        INSERT INTO agencias (
          user_id, nombre_agencia, comision, participacion_ag,
          sistemas, monedas, condiciones_sistemas, cuentas_asignadas,
          usuario_taquilla, clave_taquilla, grupo_id, grupo_nombre,
          saldo_inicial_bs, saldo_inicial_usd, saldo_inicial_cop, created_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, 'NINGUNA', $8, $9, $10, $11, 0, 0, 0, NOW()
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

      let agencyId = null;
      try {
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
      } catch (agErr) {
        // Fallback if grupo columns don't exist yet in target schema
        if (agErr.message?.includes('grupo') || agErr.code === '42703') {
          const fallbackSql = `
            INSERT INTO agencias (
              user_id, nombre_agencia, comision, participacion_ag,
              sistemas, monedas, condiciones_sistemas, cuentas_asignadas,
              usuario_taquilla, clave_taquilla,
              saldo_inicial_bs, saldo_inicial_usd, saldo_inicial_cop, created_at
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, 'NINGUNA', $8, $9, 0, 0, 0, NOW()
            )
            ON CONFLICT (user_id, nombre_agencia) DO UPDATE SET
              comision = EXCLUDED.comision,
              condiciones_sistemas = EXCLUDED.condiciones_sistemas,
              usuario_taquilla = EXCLUDED.usuario_taquilla,
              clave_taquilla = EXCLUDED.clave_taquilla
            RETURNING id;
          `;
          const fbRes = await client.query(fallbackSql, [
            uId, agencyName, comision, participacion,
            sistemas, monedas, condiciones,
            usuarioTaq, claveTaq
          ]);
          agencyId = fbRes.rows[0]?.id;
          inserted++;
        } else {
          throw agErr;
        }
      }

      // 2. Insert cashier credential into taquilla_usuarios
      if (agencyId) {
        const userSql = `
          INSERT INTO taquilla_usuarios (
            user_id, usuario, clave, agencia_id, nombre_cajero, rol, activo, created_at
          ) VALUES (
            $1, $2, $3, $4, $5, 'agencia', true, NOW()
          )
          ON CONFLICT (user_id, usuario) DO UPDATE SET
            clave = EXCLUDED.clave,
            agencia_id = EXCLUDED.agencia_id,
            nombre_cajero = EXCLUDED.nombre_cajero;
        `;
        try {
          await client.query(userSql, [uId, usuarioTaq, claveTaq, agencyId, agencyName]);
        } catch (uErr) {
          // If unique constraint is different or missing
          try {
            await client.query(
              `INSERT INTO taquilla_usuarios (user_id, usuario, clave, agencia_id, nombre_cajero, rol, activo)
               VALUES ($1, $2, $3, $4, $5, 'agencia', true)
               ON CONFLICT DO NOTHING;`,
              [uId, usuarioTaq, claveTaq, agencyId, agencyName]
            );
          } catch (_) {}
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


