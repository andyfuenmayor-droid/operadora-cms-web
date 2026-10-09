import { normalizarMoneda } from './formatters';
import type { SystemKeywordsMap } from './systemKeywords';

export interface OperatorPayment {
  id: number;
  fecha: string;
  sistema: string;
  moneda: string;
  monto: number;
  referencia: string;
  tipo_pago: 'PAGO_OPERADORA' | 'ABONO_OPERADORA';
  banco?: string;
  agencia?: string;
}

export interface OperatorSettlementRow {
  sistema: string;
  moneda: string;
  venta: number;
  premio: number;
  utilidadBruta: number; // GGR
  comisionPct: number;
  comCompletaProv: number;
  comAgencias: number;
  difCom: number;
  baseUtil: number;
  participacionPct: number;
  partCom: number;
  totalCom: number; // Total ganancia comercializador (Diferencial + Participacion)
  totalComercializador: number;
  netoOperadora: number; // Utilidad neta de la casa matriz
  saldoInit: number;
  pagosRealizados: number;
  abonosRecibidos: number;
  pagosNetos: number;
  balanceFinal: number;
}

export interface OperatorSettlementTotals {
  venta: number;
  premios: number;
  ggr: number;
  comCompletaProv: number;
  comAgencias: number;
  difCom: number;
  baseUtil: number;
  partCom: number;
  totalCom: number;
  totalComercializador: number;
  netoOperadora: number;
  saldoInit: number;
  pagosRealizados: number;
  abonosRecibidos: number;
  pagosNetos: number;
  balanceFinal: number;
  count: number;
}

/**
 * Standard Dual Calculation (Option B):
 * - Diferencial de Comision = Comision Otorgada Proveedor (ej: 16%) - Comision Pagada a Agencias
 * - Base Neta de Utilidad = GGR (Venta - Premios) - Comision Proveedor (16%)
 * - Participacion Comercializador (40%) sobre Base Neta
 * - Ganancia Comercializador = Diferencial + Participacion
 * - Utilidad Casa Operadora (60%) sobre Base Neta
 * - Balance Final = Saldo Inicial + Utilidad Operadora - Pagos Netos
 */
export function calculateOperatorSettlements(
  availableSystems: string[],
  systemConfigs: SystemKeywordsMap,
  sales: any[],
  operatorPayments: OperatorPayment[],
  reportCurrencyFilter: 'ALL' | 'BS' | 'USD' | 'COP' = 'ALL'
) {
  const rows: OperatorSettlementRow[] = [];
  const allCurrencies = ['BS', 'USD', 'COP'];

  availableSystems.forEach((sys) => {
    const sysUpper = String(sys || '').trim().toUpperCase();
    const conf = systemConfigs[sysUpper] || {
      comision_comercializador: 0,
      participacion_comercializador: 0,
      saldo_inicial_bs: 0,
      saldo_inicial_usd: 0,
      saldo_inicial_cop: 0,
    };

    allCurrencies.forEach((curr) => {
      if (reportCurrencyFilter !== 'ALL' && reportCurrencyFilter !== curr) return;

      const matching = sales.filter(
        (s) =>
          String(s.sistema || '').toUpperCase() === sysUpper &&
          normalizarMoneda(s.moneda) === curr
      );

      let saldoInit = 0;
      if (curr === 'BS') saldoInit = Number(conf.saldo_inicial_bs || 0);
      else if (curr === 'USD') saldoInit = Number(conf.saldo_inicial_usd || 0);
      else if (curr === 'COP') saldoInit = Number(conf.saldo_inicial_cop || 0);

      const sysPayments = operatorPayments.filter(
        (p) => String(p.sistema || '').toUpperCase() === sysUpper && normalizarMoneda(p.moneda) === curr
      );
      const pagosRealizados = Math.round(
        sysPayments.filter((p) => p.tipo_pago === 'PAGO_OPERADORA').reduce((sum, p) => sum + Number(p.monto || 0), 0) * 100
      ) / 100;
      const abonosRecibidos = Math.round(
        sysPayments.filter((p) => p.tipo_pago === 'ABONO_OPERADORA').reduce((sum, p) => sum + Number(p.monto || 0), 0) * 100
      ) / 100;
      const pagosNetos = Math.round((pagosRealizados - abonosRecibidos) * 100) / 100;

      const venta = Math.round(matching.reduce((sum, currItem) => sum + Number(currItem.venta || 0), 0) * 100) / 100;
      const premio = Math.round(matching.reduce((sum, currItem) => sum + Number(currItem.premios || 0), 0) * 100) / 100;

      // Include row if there is activity, initial balance or payments
      if (venta > 0 || premio > 0 || Math.abs(saldoInit) > 0.001 || Math.abs(pagosNetos) > 0.001) {
        const uBruta = Math.round((venta - premio) * 100) / 100;
        const comAgencias = Math.round(matching.reduce((sum, currItem) => sum + Number(currItem.comision || 0), 0) * 100) / 100;
        const cPct = Number(conf.comision_comercializador || 0);
        const pPct = Number(conf.participacion_comercializador || 0);

        const comCompletaProv = Math.round(venta * (cPct / 100) * 100) / 100;
        const difCom = Math.round((comCompletaProv - comAgencias) * 100) / 100;
        const baseUtil = Math.round((uBruta - comCompletaProv) * 100) / 100;
        const partCom = Math.round(baseUtil * (pPct / 100) * 100) / 100;
        const totalCom = Math.round((difCom + partCom) * 100) / 100;
        const netoOperadora = Math.round(baseUtil * ((100 - pPct) / 100) * 100) / 100;
        const balanceFinal = Math.round((saldoInit + netoOperadora - pagosNetos) * 100) / 100;

        rows.push({
          sistema: sysUpper,
          moneda: curr,
          venta,
          premio,
          utilidadBruta: uBruta,
          comisionPct: cPct,
          comCompletaProv,
          comAgencias,
          difCom,
          baseUtil,
          participacionPct: pPct,
          partCom,
          totalCom,
          totalComercializador: totalCom,
          netoOperadora,
          saldoInit,
          pagosRealizados,
          abonosRecibidos,
          pagosNetos,
          balanceFinal,
        });
      }
    });
  });

  // Calculate totals strictly separated by currency (Never mixed)
  const totalsByCurrency: Record<string, OperatorSettlementTotals> = {};
  allCurrencies.forEach((c) => {
    const cRows = rows.filter((r) => r.moneda === c);
    totalsByCurrency[c] = {
      venta: Math.round(cRows.reduce((sum, r) => sum + r.venta, 0) * 100) / 100,
      premios: Math.round(cRows.reduce((sum, r) => sum + r.premio, 0) * 100) / 100,
      ggr: Math.round(cRows.reduce((sum, r) => sum + r.utilidadBruta, 0) * 100) / 100,
      comCompletaProv: Math.round(cRows.reduce((sum, r) => sum + r.comCompletaProv, 0) * 100) / 100,
      comAgencias: Math.round(cRows.reduce((sum, r) => sum + r.comAgencias, 0) * 100) / 100,
      difCom: Math.round(cRows.reduce((sum, r) => sum + r.difCom, 0) * 100) / 100,
      baseUtil: Math.round(cRows.reduce((sum, r) => sum + r.baseUtil, 0) * 100) / 100,
      partCom: Math.round(cRows.reduce((sum, r) => sum + r.partCom, 0) * 100) / 100,
      totalCom: Math.round(cRows.reduce((sum, r) => sum + r.totalCom, 0) * 100) / 100,
      totalComercializador: Math.round(cRows.reduce((sum, r) => sum + r.totalCom, 0) * 100) / 100,
      netoOperadora: Math.round(cRows.reduce((sum, r) => sum + r.netoOperadora, 0) * 100) / 100,
      saldoInit: Math.round(cRows.reduce((sum, r) => sum + r.saldoInit, 0) * 100) / 100,
      pagosRealizados: Math.round(cRows.reduce((sum, r) => sum + r.pagosRealizados, 0) * 100) / 100,
      abonosRecibidos: Math.round(cRows.reduce((sum, r) => sum + r.abonosRecibidos, 0) * 100) / 100,
      pagosNetos: Math.round(cRows.reduce((sum, r) => sum + r.pagosNetos, 0) * 100) / 100,
      balanceFinal: Math.round(cRows.reduce((sum, r) => sum + r.balanceFinal, 0) * 100) / 100,
      count: cRows.length,
    };
  });

  const activeCurrenciesWithData = (allCurrencies as ('BS' | 'USD' | 'COP')[]).filter((c) => {
    if (reportCurrencyFilter !== 'ALL' && reportCurrencyFilter !== c) return false;
    const t = totalsByCurrency[c];
    return t && (t.count > 0 || t.venta > 0 || t.premios > 0 || Math.abs(t.balanceFinal) > 0.001);
  });

  return {
    rows,
    totalsByCurrency,
    activeCurrenciesWithData,
  };
}
