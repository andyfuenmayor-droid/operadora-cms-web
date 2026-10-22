/**
 * Ventas oficiales auditadas de la Semana 41 (2026-10-05 al 2026-10-11)
 * 18 registros consolidados por agencia, sistema y moneda para Multibanca Express.
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
  // 1. BETM3 - BOLÍVARES (BS) [11 registros]
  { agencia: 'EL 40', sistema: 'BETM3', moneda: 'BS', venta: 68150, comision: 6815, premios: 28500, neto: 32835, util_ag: 0, util_op: 32835, fecha: '2026-10-11' },
  { agencia: 'EL CUJI', sistema: 'BETM3', moneda: 'BS', venta: 133110, comision: 13311, premios: 88500, neto: 31299, util_ag: 0, util_op: 31299, fecha: '2026-10-11' },
  { agencia: 'EL FUTURO', sistema: 'BETM3', moneda: 'BS', venta: 1738404, comision: 173840.4, premios: 1632000, neto: -67436.4, util_ag: 0, util_op: -67436.4, fecha: '2026-10-11' },
  { agencia: 'AGENCIA JAVIER', sistema: 'BETM3', moneda: 'BS', venta: 810050, comision: 81005, premios: 213000, neto: 516045, util_ag: 51604.5, util_op: 464440.5, fecha: '2026-10-11' },
  { agencia: 'LA GAVIOTA', sistema: 'BETM3', moneda: 'BS', venta: 296370, comision: 35564.4, premios: 220800, neto: 40005.6, util_ag: 6000.84, util_op: 34004.76, fecha: '2026-10-11' },
  { agencia: 'LAS VIVIENDAS', sistema: 'BETM3', moneda: 'BS', venta: 307600, comision: 36912, premios: 251500, neto: 19188, util_ag: 0, util_op: 19188, fecha: '2026-10-11' },
  { agencia: 'AG ORLANDO', sistema: 'BETM3', moneda: 'BS', venta: 15900, comision: 1590, premios: 0, neto: 14310, util_ag: 0, util_op: 14310, fecha: '2026-10-11' },
  { agencia: 'CENTRO GUAJIRO', sistema: 'BETM3', moneda: 'BS', venta: 49900, comision: 4990, premios: 27000, neto: 17910, util_ag: 0, util_op: 17910, fecha: '2026-10-11' },
  { agencia: 'CHUCHO', sistema: 'BETM3', moneda: 'BS', venta: 86150, comision: 8615, premios: 77400, neto: 135, util_ag: 0, util_op: 135, fecha: '2026-10-11' },
  { agencia: 'JYY', sistema: 'BETM3', moneda: 'BS', venta: 176800, comision: 17680, premios: 130500, neto: 28620, util_ag: 0, util_op: 28620, fecha: '2026-10-11' },
  { agencia: 'YERITZA', sistema: 'BETM3', moneda: 'BS', venta: 261650, comision: 26165, premios: 157500, neto: 77985, util_ag: 0, util_op: 77985, fecha: '2026-10-11' },

  // 2. PESOS COLOMBIANOS (COP) [5 registros]
  { agencia: 'EL FUTURO', sistema: 'BETM3', moneda: 'COP', venta: 209400, comision: 20940, premios: 180000, neto: 8460, util_ag: 0, util_op: 8460, fecha: '2026-10-11' },
  { agencia: 'AG ORLANDO', sistema: 'BETM3', moneda: 'COP', venta: 41000, comision: 4100, premios: 30000, neto: 6900, util_ag: 0, util_op: 6900, fecha: '2026-10-11' },
  { agencia: 'MAXIMA CDA 02 T2', sistema: 'GATO PESOS', moneda: 'COP', venta: 890500, comision: 0, premios: 25000, neto: 865500, util_ag: 0, util_op: 865500, fecha: '2026-10-11' },
  { agencia: 'MAXIMA CDA 02 T2', sistema: 'KENO', moneda: 'COP', venta: 7447500, comision: 0, premios: 7180957, neto: 266543, util_ag: 0, util_op: 266543, fecha: '2026-10-11' },
  { agencia: 'MAXIMA CDA 02 T2', sistema: 'BETM3', moneda: 'COP', venta: 2395100, comision: 0, premios: 1830000, neto: 565100, util_ag: 0, util_op: 565100, fecha: '2026-10-11' },

  // 3. BETM3 - DÓLARES (USD) [2 registros]
  { agencia: 'EL CUJI', sistema: 'BETM3', moneda: 'USD', venta: 79.5, comision: 7.95, premios: 210, neto: -138.45, util_ag: 0, util_op: -138.45, fecha: '2026-10-11' },
  { agencia: 'EL FUTURO', sistema: 'BETM3', moneda: 'USD', venta: 1549.4, comision: 154.94, premios: 862.5, neto: 531.96, util_ag: 0, util_op: 531.96, fecha: '2026-10-11' },

  // 4. CDAPUESTAS - DÓLARES (USD) [2 registros]
  { agencia: 'AGENCIA JAVIER', sistema: 'CDAPUESTAS', moneda: 'USD', venta: 290, comision: 43.5, premios: 0, neto: 246.5, util_ag: 0, util_op: 246.5, fecha: '2026-10-11' },
  { agencia: 'MAXIMA CDA 02 T2', sistema: 'CDAPUESTAS', moneda: 'USD', venta: 85, comision: 0, premios: 0, neto: 85, util_ag: 0, util_op: 85, fecha: '2026-10-11' },
];
