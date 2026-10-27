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

// -----------------------------------------------------------------------------
// TEST 5: CASO CHUCHO Y GATOWEB EN BOLÍVARES (BS)
// -----------------------------------------------------------------------------
console.log('\n--- 5. TEST DE GATOWEB Y MONEDA BS (CASO CHUCHO) ---');
assert(CANONICAL_SYSTEM_RULES.GATOWEB.defaultMoneda === 'BS', 'GATOWEB tiene por defecto la moneda BS');
assert(CANONICAL_SYSTEM_RULES.HIPISMO.defaultMoneda === 'BS', 'HIPISMO tiene por defecto la moneda BS');
assert(CANONICAL_SYSTEM_RULES['PARLEY INH'].defaultMoneda === 'BS', 'PARLEY INH tiene por defecto la moneda BS');

const chuchoAgency = {
  id: 20,
  nombre_agencia: 'CHUCHO',
  sistemas: 'GATOWEB',
  monedas: 'BS',
  condiciones_sistemas: JSON.stringify({
    GATOWEB_BS: {
      sistema: 'GATOWEB',
      moneda: 'BS',
      codigo: 'chucho@banklot.net',
      comision: 22,
      participacion: 0
    }
  })
};

const matchChucho = matchAgencyStrict('chucho@banklot.net', 'GATOWEB', 'AUTO', [chuchoAgency]);
assert(matchChucho.agency?.nombre_agencia === 'CHUCHO', 'Encuentra la agencia CHUCHO mediante su correo de taquilla');
assert(matchChucho.moneda === 'BS', 'La moneda resuelta es estrictamente BS (nunca COP)');
assert(matchChucho.system === 'GATOWEB', 'El sistema es GATOWEB');

// Test de match por nombre directo "CHUCHO" en reporte GATOWEB
const matchChuchoByName = matchAgencyStrict('CHUCHO', 'GATOWEB', 'AUTO', [chuchoAgency]);
assert(matchChuchoByName.agency?.nombre_agencia === 'CHUCHO', 'Encuentra la agencia CHUCHO por nombre exacto');
assert(matchChuchoByName.moneda === 'BS', 'Por nombre también hereda la moneda BS de su configuración');

// -----------------------------------------------------------------------------
// TEST 6: CASO CDAPUESTAS USD Y AGENCIA JAVIER (ANTI-SECUESTRO BETM3)
// -----------------------------------------------------------------------------
console.log('\n--- 6. TEST DE CDAPUESTAS USD Y ANTI-SECUESTRO BETM3 (CASO JAVIER) ---');

const cdaDna = 'AGENCIA VENTA PREMIO AGENCIA JAVIER 295,00 0,00 250,75 CDA CARRASQUERO 3,00 0,00 3,00';
const cdaFilename = '2026-10-19_2026-10-25_USD.xlsx';

assert(
  detectSystemFromDna(cdaFilename, cdaDna, 'AUTO') === 'CDAPUESTAS',
  'Reporte con CDA Carrasquero y 2026-10-19_2026-10-25_USD.xlsx detecta CDAPUESTAS (NUNCA BETM3)'
);

assert(
  detectFileIntrinsicCurrency(cdaFilename, cdaDna, 'CDAPUESTAS', 'AUTO') === 'USD',
  '2026-10-19_2026-10-25_USD.xlsx detecta divisa USD (NUNCA BS)'
);

assert(
  detectSystemFromDna('archivo_desconocido.xlsx', 'COL1 COL2 COL3', 'AUTO') === '',
  'Un archivo desconocido sin firmas retorna cadena vacía (NO adivina BETM3)'
);

const javierAgency = {
  id: 25,
  nombre_agencia: 'AGENCIA JAVIER',
  sistemas: 'BETM3, CDAPUESTAS',
  monedas: 'BS, USD',
  condiciones_sistemas: JSON.stringify({
    BETM3_BS: { sistema: 'BETM3', moneda: 'BS', codigo: 'AG JAVIER', comision: 10, participacion: 10 },
    CDAPUESTAS_USD: { sistema: 'CDAPUESTAS', moneda: 'USD', codigo: 'AGENCIA JAVIER', comision: 15 },
    CDAPUESTAS_BS: { sistema: 'CDAPUESTAS', moneda: 'BS', codigo: 'AGENCIA JAVIER', comision: 15 },
  }),
};

const matchJavierCda = matchAgencyStrict('AGENCIA JAVIER', 'CDAPUESTAS', 'USD', [javierAgency]);
assert(matchJavierCda.agency?.nombre_agencia === 'AGENCIA JAVIER', 'Encuentra AGENCIA JAVIER en CDAPUESTAS');
assert(matchJavierCda.system === 'CDAPUESTAS', 'El sistema asignado es CDAPUESTAS (NO BETM3)');
assert(matchJavierCda.moneda === 'USD', 'La moneda resuelta es USD');

const salesWithBetm3 = [
  {
    agencia: 'AGENCIA JAVIER',
    sistema: 'BETM3',
    moneda: 'BS',
    fecha: '2026-10-25',
  },
];

const isCdaDup = isSaleDuplicate(salesWithBetm3, 'AGENCIA JAVIER', 'CDAPUESTAS', 'USD', '2026-10-25');
assert(isCdaDup === false, 'CDAPUESTAS USD en 2026-10-25 NO es marcado como duplicado de BETM3 BS');

console.log('\n==============================================================');
console.log(`✅ TODOS LOS ${passedTests} TESTS DEL MOTOR DE VENTAS PASARON CON ÉXITO.`);
console.log('🔒 salesEngineLock certificado y 100% blindado contra secuestros y corrupción.');
console.log('==============================================================');
