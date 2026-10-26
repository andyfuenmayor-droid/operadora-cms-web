/**
 * Script de Aplicación Automatizada de Migración 05
 * Proyecto: Operadora CMS / Multibanca Express
 * 
 * Ejecuta la migración 05 (Catálogos Maestros y Ocultamiento de Sistemas/Monedas)
 * en PostgreSQL (DigitalOcean Managed Database, Supabase o Docker).
 * 
 * Uso:
 *   node scripts/apply-migration-05.mjs "postgresql://user:password@host:port/database?sslmode=require"
 * O con variable de entorno:
 *   DATABASE_URL="postgresql://..." node scripts/apply-migration-05.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const { Client } = pg;

// 1. Obtener cadena de conexión (por argumento o variable de entorno)
const targetUrl = process.argv[2] || process.env.DATABASE_URL || process.env.DATABASE_URL_EXTERNAL;

console.log('====================================================================');
console.log('🚀 APLICADOR AUTOMATIZADO DE MIGRACIÓN 05 (PostgreSQL / DigitalOcean)');
console.log('====================================================================\n');

if (!targetUrl) {
  console.log('⚠️  Modo de espera de conexión:');
  console.log('   Para ejecutar este script contra DigitalOcean o Supabase, proporciona la URL:');
  console.log('   node scripts/apply-migration-05.mjs "postgresql://usuario:clave@host:25060/db?sslmode=require"\n');
  console.log('📄 El archivo SQL listo para ejecutar se encuentra en:');
  console.log('   - docker-init/05-catalogos-maestros-sistemas-monedas.sql');
  console.log('   - MIGRATION_05_CATALOGOS_MAESTROS.sql (en la raíz del proyecto)\n');
  process.exit(0);
}

// 2. Cargar el script SQL
const sqlPath = path.resolve(__dirname, '../docker-init/05-catalogos-maestros-sistemas-monedas.sql');
if (!fs.existsSync(sqlPath)) {
  console.error(`❌ Error: No se encontró el archivo de migración en ${sqlPath}`);
  process.exit(1);
}

const sqlContent = fs.readFileSync(sqlPath, 'utf8');

async function runMigration() {
  const isSslRequired = targetUrl.includes('digitalocean') || targetUrl.includes('supabase') || targetUrl.includes('sslmode=require') || process.env.PG_SSL === 'true';

  const client = new Client({
    connectionString: targetUrl,
    ssl: isSslRequired ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: 10000,
  });

  try {
    console.log('🔌 Conectando a PostgreSQL...');
    await client.connect();
    console.log('✅ Conexión establecida con éxito.\n');

    console.log('⚙️  Ejecutando script SQL de Migración 05...');
    await client.query(sqlContent);
    console.log('✅ Sentencias SQL ejecutadas correctamente.\n');

    // 3. Verificaciones de integridad
    console.log('🔍 Verificando integridad de las tablas maestras...');
    
    const resSistemas = await client.query('SELECT count(*) AS total FROM public.catalogo_sistemas_maestro');
    console.log(`   ✓ catalogo_sistemas_maestro: ${resSistemas.rows[0].total} sistemas registrados.`);

    const resMonedas = await client.query('SELECT count(*) AS total FROM public.catalogo_monedas_maestro');
    console.log(`   ✓ catalogo_monedas_maestro: ${resMonedas.rows[0].total} divisas registradas.`);

    const checkColSistemas = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'sistemas' AND column_name = 'activo'
    `);
    if (checkColSistemas.rows.length > 0) {
      console.log('   ✓ Columna sistemas.activo: Presente y lista.');
    }

    const checkColMonedas = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'monedas' AND column_name = 'activo'
    `);
    if (checkColMonedas.rows.length > 0) {
      console.log('   ✓ Columna monedas.activo: Presente y lista.');
    }

    console.log('\n====================================================================');
    console.log('🎉 ¡MIGRACIÓN 05 COMPLETADA CON ÉXITO SIN ERRORES!');
    console.log('====================================================================\n');
  } catch (error) {
    console.error('\n❌ Error durante la ejecución de la migración:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigration();
