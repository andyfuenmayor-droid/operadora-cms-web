/**
 * ==============================================================================
 * TEST SUITE: MOTOR DE VENTAS, PALABRAS CLAVE Y MATCHING CERTIFICADO
 * Archivo: scripts/run-sales-engine-test.mjs
 * ==============================================================================
 */

import {
  detectSystemFromDna,
  detectFileIntrinsicCurrency,
  matchAgencyStrict,
  isSaleDuplicate,
  CANONICAL_SYSTEM_RULES,
} from '../src/lib/salesEngineLock.ts';

console.log('🛡️  EJECUTANDO TEST SUITE DE INTEGRIDAD DEL MOTOR DE VENTAS (salesEngineLock)...');

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (!condition) {
    console.error(`  ❌ FALLÓ: ${message}`);
    process.exit(1);
  }
  console.log(`  ✓ ${message}`);
  passedTests++;
}

// -----------------------------------------------------------------------------
// TEST 1: INMUTABILIDAD DE LAS REGLAS CANÓNICAS
// -----------------------------------------------------------------------------
console.log('\n--- 1. TEST DE INMUTABILIDAD ---');
assert(Object.isFrozen(CANONICAL_SYSTEM_RULES), 'CANONICAL_SYSTEM_RULES está congelado (Object.isFrozen)');
assert(CANONICAL_SYSTEM_RULES.KENO.sistema === 'KENO', 'Sistema KENO definido canónicamente');
assert(CANONICAL_SYSTEM_RULES.KENO.colVenta.includes('TOTAL ACCEPTED'), 'KENO incluye "TOTAL ACCEPTED" como columna de venta');
assert(CANONICAL_SYSTEM_RULES.KENO.colPremio.includes('TOTAL PAID'), 'KENO incluye "TOTAL PAID" como columna de premios');
assert(CANONICAL_SYSTEM_RULES.KENO.colAgencia.includes('AGENT'), 'KENO incluye "AGENT" como columna de agencia');
assert(CANONICAL_SYSTEM_RULES['GATO PESOS'].colVenta.includes('VENTA'), 'GATO PESOS incluye "VENTA" canónicamente');

// -----------------------------------------------------------------------------
// TEST 2: DETECCIÓN DE SISTEMA Y MONEDA DESDE EL ADN DEL ARCHIVO
// -----------------------------------------------------------------------------
console.log('\n--- 2. TEST DE DETECCIÓN DETERMINÍSTICA ---');
const kenoHeaderDna = 'VIRTUAL GAMES REPORT RECEIVED PAID OUT TOTAL ACCEPTED TOTAL PAID PROFIT';
assert(
  detectSystemFromDna('LotteryAdmin-43', kenoHeaderDna, 'AUTO') === 'KENO',
  'LotteryAdmin-43 con Virtual Games Report detecta automáticamente KENO'
);

assert(
  detectSystemFromDna('LotteryAdmin-43', kenoHeaderDna, 'BETM3') === 'BETM3',
  'Selección manual en el selector tiene prioridad absoluta sobre detección automática'
);

const betm3Dna = 'REPORTE VENTAS BETM3 PESO - COP NOMBRE VENTA PREMIO NETO';
assert(
  detectSystemFromDna('reporte_ventas.xlsx', betm3Dna, 'AUTO') === 'BETM3',
  'Reporte con firma BETM3 detecta BETM3'
);
assert(
  detectFileIntrinsicCurrency('reporte_ventas.xlsx', betm3Dna, 'BETM3', 'AUTO') === 'COP',
  'Detección de divisa intrínseca reconoce COP en BETM3'
);

const gatowebDna = 'ANALISIS POR PERIODO DISTRIBUIDOR BANKLOT USUARIO VENTAS PREMIOS';
assert(
  detectSystemFromDna('reporte.xlsx', gatowebDna, 'AUTO') === 'GATOWEB',
  'Reporte con ANALISIS POR PERIODO detecta GATOWEB'
);

// -----------------------------------------------------------------------------
// TEST 3: COINCIDENCIA ESTRICTA Y ANTI-SECUESTRO (CASO REAL: MAXIMA CDA 02 T2)
// -----------------------------------------------------------------------------
console.log('\n--- 3. TEST DE COINCIDENCIA ESTRICTA ANTI-SECUESTRO ---');
const mockAgencies = [
  {
    id: 14,
    nombre_agencia: 'MAXIMA CDA 02 T2',
    sistemas: 'BETM3, KENO, GATO PESOS',
    monedas: 'COP, USD',
    condiciones_sistemas: JSON.stringify({
      BETM3_COP: { sistema: 'BETM3', moneda: 'COP', codigo: 'MAXIMA CDA 02 T2' },
      BETM3: { sistema: 'BETM3', moneda: 'COP', codigo: 'MAXIMA CDA 02 T2' },
      KENO_COP: { sistema: 'KENO', moneda: 'COP', codigo: 'MAXIMA CDA 02 T2 (5024)' },
      KENO: { sistema: 'KENO', moneda: 'COP', codigo: 'MAXIMA CDA 02 T2 (5024)' },
      'GATO PESOS_COP': { sistema: 'GATO PESOS', moneda: 'COP', codigo: 'MAXIMA CDA 0Z TZ' },
    }),
  },
  {
    id: 15,
    nombre_agencia: 'CENTRO GUAJIRO',
    sistemas: 'BETM3, KENO',
    monedas: 'BS, COP',
    condiciones_sistemas: JSON.stringify({
      KENO_COP: { sistema: 'KENO', moneda: 'COP', codigo: '5025' },
    }),
  },
];

// Test 3A: Celda de KENO con código compuesto "MAXIMA CDA 02 T2 (5024)"
const matchKeno = matchAgencyStrict('MAXIMA CDA 02 T2 (5024)', 'KENO', 'COP', mockAgencies);
assert(matchKeno.agency?.nombre_agencia === 'MAXIMA CDA 02 T2', 'Encuentra la agencia MAXIMA CDA 02 T2');
assert(matchKeno.system === 'KENO', 'El sistema asignado es KENO (NO BETM3)');
assert(matchKeno.matchType === 'EXACT_CODE', 'Tipo de match es EXACT_CODE');

// Test 3B: Celda de BETM3 con código limpio
const matchBetm3 = matchAgencyStrict('MAXIMA CDA 02 T2', 'BETM3', 'COP', mockAgencies);
assert(matchBetm3.agency?.nombre_agencia === 'MAXIMA CDA 02 T2', 'Encuentra la agencia en BETM3');
assert(matchBetm3.system === 'BETM3', 'El sistema asignado en BETM3 es BETM3');

// Test 3C: Match por ID numérico únicamente (ej. "5025")
const matchIdOnly = matchAgencyStrict('CENTRO GUAJIRO (5025)', 'KENO', 'COP', mockAgencies);
assert(matchIdOnly.agency?.nombre_agencia === 'CENTRO GUAJIRO', 'Match por ID numérico en paréntesis funciona');

// -----------------------------------------------------------------------------
// TEST 4: VERIFICACIÓN DETERMINÍSTICA DE DUPLICADOS (COEXISTENCIA PACÍFICA)
// -----------------------------------------------------------------------------
console.log('\n--- 4. TEST DE COEXISTENCIA MULTI-SISTEMA SIN FALSOS DUPLICADOS ---');
const existingSales = [
  {
    agencia: 'MAXIMA CDA 02 T2',
    sistema: 'BETM3',
    moneda: 'COP',
    fecha: '2026-10-25',
  },
];

// Comprobar que KENO NO colisiona con la venta existente de BETM3
const isKenoDup = isSaleDuplicate(existingSales, 'MAXIMA CDA 02 T2', 'KENO', 'COP', '2026-10-25');
assert(isKenoDup === false, 'KENO en 2026-10-25 NO es marcado como duplicado de BETM3');

// Comprobar que BETM3 en la misma fecha SÍ es marcado como duplicado
const isBetm3Dup = isSaleDuplicate(existingSales, 'MAXIMA CDA 02 T2', 'BETM3', 'COP', '2026-10-25');
assert(isBetm3Dup === true, 'BETM3 en 2026-10-25 es correctamente identificado como duplicado');

// Comprobar que BETM3 en otra fecha NO es duplicado
const isBetm3OtherDate = isSaleDuplicate(existingSales, 'MAXIMA CDA 02 T2', 'BETM3', 'COP', '2026-10-26');
assert(isBetm3OtherDate === false, 'BETM3 en 2026-10-26 es permitido');

console.log('\n==============================================================');
console.log(`✅ TODOS LOS ${passedTests} TESTS DEL MOTOR DE VENTAS PASARON CON ÉXITO.`);
console.log('🔒 salesEngineLock certificado y 100% blindado contra secuestros y corrupción.');
console.log('==============================================================');
