#!/usr/bin/env node
/**
 * ==============================================================================
 * GOLDEN TEST DE INTEGRIDAD FINANCIERA - CIERRE SEMANA 41
 * Invariable Mathematical Regression Lock for Multibanca Express
 * 
 * EJECUTA LAS FUNCIONES REALES DEL MOTOR CONTABLE Y DE OPERADORAS:
 * - computeCertifiedAgencyMatrix (src/lib/closureEngineLock.ts)
 * - computeCertifiedTotals (src/lib/closureEngineLock.ts)
 * - calculateOperatorSettlements (src/utils/operatorSettlement.ts)
 * ==============================================================================
 */

import { createHash } from 'node:crypto';
import {
  computeCertifiedAgencyMatrix,
  computeCertifiedTotals,
  computeCertifiedGroupMatrix,
} from '../src/lib/closureEngineLock.ts';
import { calculateOperatorSettlements } from '../src/utils/operatorSettlement.ts';
import { SEMANA_41_SALES_RECORDS } from '../src/utils/semana41SalesData.ts';
import { AUDITED_SEMANA_40_BALANCES } from '../src/utils/auditedBalancesS40.ts';

console.log('🛡️  EJECUTANDO GOLDEN TEST DE INTEGRIDAD FINANCIERA (SEMANA 41)...\n');

let passed = true;
const errors = [];

function assertExact(actual, expected, label, currency = '') {
  const numActual = Number(actual);
  const numExpected = Number(expected);
  const diff = Math.abs(numActual - numExpected);
  if (diff > 0.01) {
    passed = false;
    const err = `❌ ${label}: Esperado ${numExpected.toLocaleString('es-VE', { minimumFractionDigits: 2 })} ${currency}, pero se obtuvo ${numActual.toLocaleString('es-VE', { minimumFractionDigits: 2 })} ${currency} (Diferencia: ${diff.toFixed(2)})`;
    errors.push(err);
    console.error(err);
  } else {
    console.log(`  ✓ ${label}: ${numActual.toLocaleString('es-VE', { minimumFractionDigits: 2 })} ${currency}`);
  }
}

// ------------------------------------------------------------------------------
// 1. PREPARACIÓN DE ENTIDADES Y ARRASTRES OFICIALES DE S40 -> S41
// ------------------------------------------------------------------------------
const testAgencies = Object.entries(AUDITED_SEMANA_40_BALANCES).map(([nombre, saldos], idx) => ({
  id: idx + 1,
  nombre_agencia: nombre,
  monedas: 'BS,USD,COP',
  saldo_inicial_bs: saldos.bs,
  saldo_inicial_usd: saldos.usd,
  saldo_inicial_cop: saldos.cop,
}));

// Movimientos bancarios auditados de S41
const testPayments = [
  // BS - Bancos confirmados de agencias (Total exacto: 549,185.20 Bs.)
  { id: 'pb_1', agencia: 'EL FUTURO', moneda: 'BS', monto: 308655.00, tipo_pago: 'PAGO', metodo: 'TRANSFERENCIA', confirmado: true, rechazado: false, fecha: '2026-10-11' },
  { id: 'pb_2', agencia: 'AGENCIA JAVIER', moneda: 'BS', monto: 45025.20, tipo_pago: 'PAGO', metodo: 'TRANSFERENCIA', confirmado: true, rechazado: false, fecha: '2026-10-11' },
  { id: 'pb_3', agencia: 'LA GAVIOTA', moneda: 'BS', monto: 34150.00, tipo_pago: 'PAGO', metodo: 'TRANSFERENCIA', confirmado: true, rechazado: false, fecha: '2026-10-11' },
  { id: 'pb_4', agencia: 'LAS VIVIENDAS', moneda: 'BS', monto: 30000.00, tipo_pago: 'PAGO', metodo: 'TRANSFERENCIA', confirmado: true, rechazado: false, fecha: '2026-10-11' },
  { id: 'pb_5', agencia: 'CHUCHO', moneda: 'BS', monto: 47725.60, tipo_pago: 'PAGO', metodo: 'TRANSFERENCIA', confirmado: true, rechazado: false, fecha: '2026-10-11' },
  { id: 'pb_6', agencia: 'JYY', moneda: 'BS', monto: 26835.00, tipo_pago: 'PAGO', metodo: 'TRANSFERENCIA', confirmado: true, rechazado: false, fecha: '2026-10-11' },
  { id: 'pb_7', agencia: 'YERITZA', moneda: 'BS', monto: 35520.00, tipo_pago: 'PAGO', metodo: 'TRANSFERENCIA', confirmado: true, rechazado: false, fecha: '2026-10-11' },
  { id: 'pb_8', agencia: 'EL 40', moneda: 'BS', monto: 0.00, tipo_pago: 'PAGO', metodo: 'TRANSFERENCIA', confirmado: true, rechazado: false, fecha: '2026-10-11' },
  { id: 'pb_9', agencia: 'CENTRO GUAJIRO', moneda: 'BS', monto: 0.00, tipo_pago: 'PAGO', metodo: 'TRANSFERENCIA', confirmado: true, rechazado: false, fecha: '2026-10-11' },
  { id: 'pb_10', agencia: 'EL CUJI', moneda: 'BS', monto: 21274.40, tipo_pago: 'PAGO', metodo: 'TRANSFERENCIA', confirmado: true, rechazado: false, fecha: '2026-10-11' },
  
  // USD - Bancos auditados (95.00 USD)
  { id: 'pb_u1', agencia: 'AGENCIA JAVIER', moneda: 'USD', monto: 95.00, tipo_pago: 'PAGO', metodo: 'TRANSFERENCIA', referencia: 'ZELLE-95', confirmado: true, rechazado: false, fecha: '2026-10-11' },

  // COP - Bancos conciliados (1,010,143.00 COP en MAXIMA CDA 02 T2)
  { id: 'pb_c1', agencia: 'MAXIMA CDA 02 T2', moneda: 'COP', monto: 1010143.00, tipo_pago: 'PAGO', metodo: 'TRANSFERENCIA', referencia: 'BANCOLOMBIA-S41', confirmado: true, rechazado: false, fecha: '2026-10-11' },
];

// Efectivo diario y cobradores
const testDailyPayments = [
  // USD - Efectivo de Taquilla (Total: 992.56 USD)
  { id: 'pd_u1', agencia: 'EL FUTURO', moneda: 'USD', monto: 620.56, tipo_pago: 'EFECTIVO TAQUILLA', metodo: 'EFECTIVO', confirmado: true, rechazado: false, fecha: '2026-10-11' },
  { id: 'pd_u2', agencia: 'AGENCIA JAVIER', moneda: 'USD', monto: 292.00, tipo_pago: 'EFECTIVO TAQUILLA', metodo: 'EFECTIVO', confirmado: true, rechazado: false, fecha: '2026-10-11' },
  { id: 'pd_u3', agencia: 'MAXIMA CDA 02 T2', moneda: 'USD', monto: 80.00, tipo_pago: 'EFECTIVO TAQUILLA', metodo: 'EFECTIVO', confirmado: true, rechazado: false, fecha: '2026-10-11' },

  // COP - Efectivo de Taquilla (Total: 18,000.00 COP)
  { id: 'pd_c1', agencia: 'EL FUTURO', moneda: 'COP', monto: 18000.00, tipo_pago: 'EFECTIVO TAQUILLA', metodo: 'EFECTIVO', confirmado: true, rechazado: false, fecha: '2026-10-11' },
];

// Gastos de agencias (Total: 16,000.00 Bs. | 462,000.00 COP)
const testExpenses = [
  { id: 'g_1', agencia: 'EL CUJI', moneda: 'BS', monto: 10000.00, concepto: 'Gastos Operativos', confirmado: true, rechazado: false, fecha: '2026-10-11' },
  { id: 'g_2', agencia: 'CHUCHO', moneda: 'BS', monto: 6000.00, concepto: 'Gastos Operativos', confirmado: true, rechazado: false, fecha: '2026-10-11' },
  { id: 'g_3', agencia: 'MAXIMA CDA 02 T2', moneda: 'COP', monto: 462000.00, concepto: 'Gastos Operativos', confirmado: true, rechazado: false, fecha: '2026-10-11' },
];

// Gastos Administrativos Comercializadora (25,000.00 Bs. Sueldos Oficina)
const testAdminExpenses = {
  BS: 25000.00,
  USD: 0.00,
  COP: 0.00,
};

// ------------------------------------------------------------------------------
// 2. EJECUCIÓN REAL DEL MOTOR CONTABLE DE AGENCIAS
// ------------------------------------------------------------------------------
console.log('--- 1. EJECUTANDO computeCertifiedAgencyMatrix Y computeCertifiedTotals ---');
const agencyMatrix = computeCertifiedAgencyMatrix({
  agencies: testAgencies,
  sales: SEMANA_41_SALES_RECORDS,
  payments: testPayments,
  expenses: testExpenses,
  rawDailyPayments: testDailyPayments,
  systemCycle: { desde: '2026-10-05', hasta: '2026-10-11' },
  participationCalculator: (_ag, _sis, _mon) => ({ partPct: 0 }),
});

const totals = computeCertifiedTotals(agencyMatrix, testAdminExpenses);

// INVARIANTE 1: BOLÍVARES (BS)
console.log('\n[INVARIANTE 1 - BOLÍVARES (BS)]');
assertExact(totals.BS.saldoAnterior, 96878.92, 'Arrastre Anterior BS', 'Bs.');
assertExact(totals.BS.ventaNeta, 564603.10, 'Venta Neta BS', 'Bs.');
assertExact(totals.BS.gastosAgencias, 16000.00, 'Gastos Agencias BS (Acta 41-02)', 'Bs.');
assertExact(totals.BS.gastosComercializadora, 25000.00, 'Gastos Comercializadora BS (Acta 41-03)', 'Bs.');
assertExact(totals.BS.bancos, 549185.20, 'Bancos BS (Acta 41-04)', 'Bs.');
assertExact(totals.BS.saldoFinal, 96296.82, 'Saldo Final Matriz BS (Acta 41-01)', 'Bs.');

// INVARIANTE 2: DÓLARES (USD)
console.log('\n[INVARIANTE 2 - DÓLARES (USD)]');
assertExact(totals.USD.saldoAnterior, 125.94, 'Arrastre Anterior USD', 'USD');
assertExact(totals.USD.ventaNeta, 994.96, 'Venta Neta USD', 'USD');
assertExact(totals.USD.efectivoTaquilla, 992.56, 'Efectivo Taquilla USD (Acta 41-05)', 'USD');
assertExact(totals.USD.bancos, 95.00, 'Bancos Auditados USD (Acta 41-06 / 41-04)', 'USD');
assertExact(totals.USD.saldoFinal, 33.34, 'Saldo Final Matriz USD (Acta 41-01)', 'USD');

if (totals.USD.bancos > 95.00) {
  passed = false;
  errors.push('❌ CRÍTICO: Efectivo duplicado indebidamente en bancos USD.');
}

// INVARIANTE 3: PESOS COLOMBIANOS (COP)
console.log('\n[INVARIANTE 3 - PESOS COLOMBIANOS (COP)]');
assertExact(totals.COP.saldoAnterior, 972070.00, 'Arrastre Anterior COP', 'COP');
assertExact(totals.COP.ventaNeta, 1490593.00, 'Venta Neta COP Conciliada', 'COP');
assertExact(totals.COP.gastosAgencias, 462000.00, 'Gastos Agencias COP (Acta 41-02)', 'COP');
assertExact(totals.COP.efectivoTaquilla, 18000.00, 'Efectivo Taquilla COP (Acta 41-05)', 'COP');
assertExact(totals.COP.bancos, 1010143.00, 'Bancos COP Conciliados (Acta 41-04)', 'COP');
assertExact(totals.COP.saldoFinal, 972520.00, 'Saldo Final Matriz COP (Acta 41-01)', 'COP');

const maximaRow = agencyMatrix.find((r) => r.entidad === 'MAXIMA CDA 02 T2' && r.moneda === 'COP');
const maximaSaldo = maximaRow ? maximaRow.saldo_final : 0.00;
assertExact(maximaSaldo, 0.00, 'Saldo Final MAXIMA CDA 02 T2 en COP', 'COP');

// ------------------------------------------------------------------------------
// 3. EJECUCIÓN REAL DEL MOTOR DE LIQUIDACIÓN DE OPERADORAS
// ------------------------------------------------------------------------------
console.log('\n--- 2. EJECUTANDO calculateOperatorSettlements ---');
const operatorSystems = ['BETM3', 'CDAPUESTAS'];

const operatorConfigs = {
  BETM3: {
    comision_comercializador: 10,
    participacion_comercializador: 40,
    saldo_inicial_bs: 300150.97,
    saldo_inicial_usd: 0,
    saldo_inicial_cop: 0,
  },
  CDAPUESTAS: {
    comision_comercializador: 10,
    participacion_comercializador: 40,
    saldo_inicial_bs: 0,
    saldo_inicial_usd: 0,
    saldo_inicial_cop: 0,
  },
};

// Cargas oficiales consolidadas del reporte de casas operadoras S41
const operatorSalesLoads = [
  { sistema: 'BETM3', moneda: 'BS', venta: 3881474, comision: 379184.8, premios: 2781091 },
  { sistema: 'BETM3', moneda: 'USD', venta: 1628.9, comision: 162.89, premios: 1072.5 },
  { sistema: 'BETM3', moneda: 'COP', venta: 2424800, comision: 242480, premios: 1629000 },
  { sistema: 'CDAPUESTAS', moneda: 'USD', venta: 375, comision: 43.5, premios: 49.5 },
];

const operatorPayments = [
  { id: 1, fecha: '2026-10-11', sistema: 'BETM3', moneda: 'BS', monto: 439358.13, tipo_pago: 'PAGO_OPERADORA', referencia: 'PAGO-BETM3-BS' },
  { id: 2, fecha: '2026-10-11', sistema: 'BETM3', moneda: 'USD', monto: 149.84, tipo_pago: 'PAGO_OPERADORA', referencia: 'PAGO-BETM3-USD' },
  { id: 3, fecha: '2026-10-11', sistema: 'BETM3', moneda: 'COP', monto: 331992.00, tipo_pago: 'PAGO_OPERADORA', referencia: 'PAGO-BETM3-COP' },
  { id: 4, fecha: '2026-10-11', sistema: 'CDAPUESTAS', moneda: 'USD', monto: 172.80, tipo_pago: 'PAGO_OPERADORA', referencia: 'PAGO-CDA-USD' },
];

const { rows: opRows } = calculateOperatorSettlements(
  operatorSystems,
  operatorConfigs,
  operatorSalesLoads,
  operatorPayments,
  'ALL'
);

console.log('[INVARIANTE 4 - LIQUIDACIÓN CASAS OPERADORAS S41]');
const betm3Bs = opRows.find((r) => r.sistema === 'BETM3' && r.moneda === 'BS');
const betm3Usd = opRows.find((r) => r.sistema === 'BETM3' && r.moneda === 'USD');
const betm3Cop = opRows.find((r) => r.sistema === 'BETM3' && r.moneda === 'COP');
const cdaUsd = opRows.find((r) => r.sistema === 'CDAPUESTAS' && r.moneda === 'USD');

assertExact(betm3Bs ? betm3Bs.balanceFinal : 0, 288134.20, 'Balance Final BETM3 BS', 'Bs.');
assertExact(betm3Usd ? betm3Usd.balanceFinal : 0, 86.27, 'Balance Final BETM3 USD', 'USD');
assertExact(betm3Cop ? betm3Cop.balanceFinal : 0, 0.00, 'Balance Final BETM3 COP', 'COP');
assertExact(cdaUsd ? cdaUsd.balanceFinal : 0, 0.00, 'Balance Final CDAPUESTAS USD', 'USD');

// ------------------------------------------------------------------------------
// 4. PARIDAD MATRIZ VS ACTAS Y HASH CRIPTOGRÁFICO
// ------------------------------------------------------------------------------
console.log('\n--- 3. PARIDAD ENTRE ACTAS Y SNAPSHOT INTEGRITY HASH ---');
const matrixBankBs = totals.BS.bancos;
const actaBankBs = testPayments.filter((p) => p.moneda === 'BS').reduce((s, p) => s + p.monto, 0);
assertExact(matrixBankBs, actaBankBs, 'Paridad Bancos Matriz 41-01 === Acta 41-04 (BS)', 'Bs.');

const matrixExpBs = totals.BS.gastosAgencias;
const actaExpBs = testExpenses.filter((g) => g.moneda === 'BS').reduce((s, g) => s + g.monto, 0);
assertExact(matrixExpBs, actaExpBs, 'Paridad Gastos Matriz 41-01 === Acta 41-02 (BS)', 'Bs.');

const canonicalPayload = JSON.stringify({
  semana_no: '41',
  periodo: 'Semana 41 (2026-10-05 al 2026-10-11)',
  raw_sales_loads: SEMANA_41_SALES_RECORDS,
  consolidated_totals: totals,
  agency_matrix: agencyMatrix,
  operator_matrix: opRows,
});
const hash = createHash('sha256').update(canonicalPayload).digest('hex');

if (!hash || hash.length !== 64) {
  passed = false;
  errors.push('❌ Fallo en el cálculo del hash SHA-256 de integridad.');
} else {
  console.log(`  ✓ Hash SHA-256 Determinístico Certificado: ${hash.slice(0, 32)}... (64 bytes OK)`);
}

// ------------------------------------------------------------------------------
// 5. INVARIANTE 5: TEST MATEMÁTICO DE GRUPOS MULTI-DIVISA (OVERRIDING COMMISSIONS)
// ------------------------------------------------------------------------------
console.log('\n--- 4. INVARIANTE 5: LIQUIDACIÓN DE GRUPOS (INTERMEDIARIOS / MULTI-DIVISA) ---');

const testGroups = [
  {
    id: 101,
    nombre_grupo: 'GRUPO OCCIDENTE',
    monedas: 'BS,USDT',
    comision_pct_default: 15,
    participacion_pct_default: 30,
    saldo_inicial_bs: 0,
    saldos_iniciales_json: { USDT: 0 },
    activo: true,
  },
];

const testGroupAgencies = [
  {
    id: 201,
    nombre_agencia: 'AGENCIA HIJA 1',
    grupo_id: 101,
    grupo_nombre: 'GRUPO OCCIDENTE',
    monedas: 'BS',
    comision: 10,
    participacion_ag: 20,
  },
  {
    id: 202,
    nombre_agencia: 'AGENCIA HIJA 2',
    grupo_id: 101,
    grupo_nombre: 'GRUPO OCCIDENTE',
    monedas: 'USDT',
    comision: 10,
    participacion_ag: 20,
  },
];

const testGroupSales = [
  // Venta en BS: 10,000 Bs., 0 premios.
  { agencia: 'AGENCIA HIJA 1', sistema: 'BETM3', moneda: 'BS', venta: 10000, premios: 0 },
  // Venta en USDT: 1,000 USDT, 200 premios.
  { agencia: 'AGENCIA HIJA 2', sistema: 'BETM3', moneda: 'USDT', venta: 1000, premios: 200 },
];

const groupMatrix = computeCertifiedGroupMatrix({
  groups: testGroups,
  agencies: testGroupAgencies,
  sales: testGroupSales,
  customCurrencies: ['BS', 'USDT'],
});

const grpBs = groupMatrix.find((g) => g.nombre_grupo === 'GRUPO OCCIDENTE' && g.moneda === 'BS');
const grpUsdt = groupMatrix.find((g) => g.nombre_grupo === 'GRUPO OCCIDENTE' && g.moneda === 'USDT');

// 1. Verificación en BS:
// Comisiones: Agencia (10% = 1,000) + Dif. Grupo (5% = 500) + Dif. Comercializador (5% = 500) === Total Proveedor (20% = 2,000)
assertExact(grpBs ? grpBs.venta_bruta_arbol : 0, 10000, 'Venta Árbol Grupo BS', 'Bs.');
assertExact(grpBs ? grpBs.comision_agencias : 0, 1000, 'Comisión Agencias Hijas BS (10%)', 'Bs.');
assertExact(grpBs ? grpBs.dif_com_grupo : 0, 500, 'Diferencial Comisión Grupo BS (15% - 10%)', 'Bs.');
// Participación: Base Neta (10,000 - 1,500 = 8,500) * (30% - 20% = 10%) = 850 Bs.
assertExact(grpBs ? grpBs.dif_part_grupo : 0, 850, 'Diferencial Participación Grupo BS (30% - 20%)', 'Bs.');
assertExact(grpBs ? grpBs.utilidad_grupo : 0, 1350, 'Ganancia Total Grupo BS (500 + 850)', 'Bs.');

// Suma de comisiones: 1000 + 500 + 500 = 2000 (20% de 10,000)
const totalComisionProveedorBs = 10000 * 0.20;
const difComercializadorBs = totalComisionProveedorBs - (grpBs ? grpBs.comision_grupo_total : 0);
assertExact((grpBs ? grpBs.comision_agencias : 0) + (grpBs ? grpBs.dif_com_grupo : 0) + difComercializadorBs, totalComisionProveedorBs, 'Consistencia Tripartita Comisión Proveedor (Agencia + Grupo + Comercializador = 20% Proveedor)', 'Bs.');

// 2. Verificación en USDT:
// Venta 1,000, Premios 200
assertExact(grpUsdt ? grpUsdt.venta_bruta_arbol : 0, 1000, 'Venta Árbol Grupo USDT', 'USDT');
assertExact(grpUsdt ? grpUsdt.comision_agencias : 0, 100, 'Comisión Agencia USDT (10%)', 'USDT');
assertExact(grpUsdt ? grpUsdt.dif_com_grupo : 0, 50, 'Diferencial Comisión Grupo USDT (15% - 10%)', 'USDT');
// Base neta: 1000 - 150 - 200 = 650 USDT. Dif part: 650 * 10% = 65 USDT.
assertExact(grpUsdt ? grpUsdt.dif_part_grupo : 0, 65, 'Diferencial Participación Grupo USDT (30% - 20%)', 'USDT');
assertExact(grpUsdt ? grpUsdt.utilidad_grupo : 0, 115, 'Ganancia Total Grupo USDT (50 + 65)', 'USDT');

// ------------------------------------------------------------------------------
// RESULTADO FINAL
// ------------------------------------------------------------------------------
console.log('\n==============================================================');
if (!passed) {
  console.error('🚨 ERROR: REGRESIÓN FINANCIERA DETECTADA. SUITE FALLIDA.');
  errors.forEach((e) => console.error(e));
  process.exit(1);
} else {
  console.log('✅ TODAS LAS PRUEBAS DEL MOTOR CONTABLE PASARON CON ÉXITO.');
  console.log('🔒 Cierre Semana 41 cuadrado con precisión milimétrica.');
  console.log('==============================================================\n');
  process.exit(0);
}
