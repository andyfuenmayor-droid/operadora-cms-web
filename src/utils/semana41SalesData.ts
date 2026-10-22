/**
 * Ventas oficiales auditadas de la Semana 41 (2026-10-05 al 2026-10-11)
 * 19 registros consolidados por agencia, sistema y moneda para Multibanca Express.
 * Fecha de operación: 2026-10-11
 */
export interface Semana41SaleRecord {
  agencia: string;
  sistema: string;
  moneda: string;
  venta: number;
  comision: number;
  premios: number;
  neto: number;
  util_ag: number;
  util_op: number;
  fecha: string;
}

export const SEMANA_41_SALES_RECORDS: Semana41SaleRecord[] = [
  // 1. BOLÍVARES (BS) [10 registros - Total Neto: 576,508.90 Bs. | Util Op: 564,603.10 Bs.]
  { agencia: 'EL CUJI', sistema: 'BETM3', moneda: 'BS', venta: 98410, comision: 9841, premios: 110100, neto: -21531, util_ag: 0, util_op: -21531, fecha: '2026-10-11' },
  { agencia: 'EL FUTURO', sistema: 'BETM3', moneda: 'BS', venta: 1416950, comision: 141695, premios: 966600, neto: 308655, util_ag: 0, util_op: 308655, fecha: '2026-10-11' },
  { agencia: 'AGENCIA JAVIER', sistema: 'BETM3', moneda: 'BS', venta: 138920, comision: 13892, premios: 75000, neto: 50028, util_ag: 5002.8, util_op: 45025.2, fecha: '2026-10-11' },
  { agencia: 'LA GAVIOTA', sistema: 'BETM3', moneda: 'BS', venta: 297750, comision: 35730, premios: 216000, neto: 46020, util_ag: 6903, util_op: 39117, fecha: '2026-10-11' },
  { agencia: 'LAS VIVIENDAS', sistema: 'BETM3', moneda: 'BS', venta: 409600, comision: 49152, premios: 310500, neto: 49948, util_ag: 0, util_op: 49948, fecha: '2026-10-11' },
  { agencia: 'CENTRO GUAJIRO', sistema: 'BETM3', moneda: 'BS', venta: 42260, comision: 4226, premios: 36000, neto: 2034, util_ag: 0, util_op: 2034, fecha: '2026-10-11' },
  { agencia: 'CHUCHO', sistema: 'BETM3', moneda: 'BS', venta: 106295, comision: 10629.5, premios: 52950, neto: 42715.5, util_ag: 0, util_op: 42715.5, fecha: '2026-10-11' },
  { agencia: 'JYY', sistema: 'BETM3', moneda: 'BS', venta: 222050, comision: 22205, premios: 174000, neto: 25845, util_ag: 0, util_op: 25845, fecha: '2026-10-11' },
  { agencia: 'YERITZA', sistema: 'BETM3', moneda: 'BS', venta: 287800, comision: 28780, premios: 223500, neto: 35520, util_ag: 0, util_op: 35520, fecha: '2026-10-11' },
  { agencia: 'CHUCHO', sistema: 'GATOWEB', moneda: 'BS', venta: 105480, comision: 23205.6, premios: 45000, neto: 37274.4, util_ag: 0, util_op: 37274.4, fecha: '2026-10-11' },

  // 2. DÓLARES (USD) [4 registros - Total Neto: $994.96]
  { agencia: 'EL CUJI', sistema: 'BETM3', moneda: 'USD', venta: 11, comision: 1.1, premios: 0, neto: 9.9, util_ag: 0, util_op: 9.9, fecha: '2026-10-11' },
  { agencia: 'EL FUTURO', sistema: 'BETM3', moneda: 'USD', venta: 1525.4, comision: 152.54, premios: 750, neto: 622.86, util_ag: 0, util_op: 622.86, fecha: '2026-10-11' },
  { agencia: 'AGENCIA JAVIER', sistema: 'CDAPUESTAS', moneda: 'USD', venta: 332, comision: 49.8, premios: 0, neto: 282.2, util_ag: 0, util_op: 282.2, fecha: '2026-10-11' },
  { agencia: 'MAXIMA CDA 02 T2', sistema: 'CDAPUESTAS', moneda: 'USD', venta: 80, comision: 0, premios: 0, neto: 80, util_ag: 0, util_op: 80, fecha: '2026-10-11' },

  // 3. PESOS COLOMBIANOS (COP) [5 registros - Total Neto Conciliado: 1,490,593.00 COP]
  { agencia: 'EL FUTURO', sistema: 'BETM3', moneda: 'COP', venta: 20000, comision: 2000, premios: 0, neto: 18000, util_ag: 0, util_op: 18000, fecha: '2026-10-11' },
  { agencia: 'AG ORLANDO', sistema: 'BETM3', moneda: 'COP', venta: 500, comision: 50, premios: 0, neto: 450, util_ag: 0, util_op: 450, fecha: '2026-10-11' },
  { agencia: 'MAXIMA CDA 02 T2', sistema: 'GATO PESOS', moneda: 'COP', venta: 890500, comision: 0, premios: 25000, neto: 865500, util_ag: 0, util_op: 865500, fecha: '2026-10-11' },
  { agencia: 'MAXIMA CDA 02 T2', sistema: 'KENO', moneda: 'COP', venta: 7447500, comision: 0, premios: 7405957, neto: 41543, util_ag: 0, util_op: 41543, fecha: '2026-10-11' },
  { agencia: 'MAXIMA CDA 02 T2', sistema: 'BETM3', moneda: 'COP', venta: 2395100, comision: 0, premios: 1830000, neto: 565100, util_ag: 0, util_op: 565100, fecha: '2026-10-11' },
];
