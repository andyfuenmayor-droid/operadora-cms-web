import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { formatCurrency, formatDate, normalizarMoneda } from '../../utils/formatters';
import {
  getConsolidatedPayments,
  getConsolidatedExpenses,
  type ConsolidatedPaymentItem,
  type ConsolidatedExpenseItem,
} from '../../utils/consolidations';
import type { Agency } from '../../types';
import {
  Building2,
  Calendar,
  DollarSign,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Search,
  Download,
  FileSpreadsheet,
  FileText,
  X,
  ChevronRight,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Receipt,
  CreditCard,
  QrCode,
  Layers,
  Clock,
  Printer
} from 'lucide-react';

interface CycleHistoryRow {
  id: string;
  tipo_periodo: 'semanal' | 'mensual';
  periodo_label: string;
  rango_fechas: string;
  fecha_desde: string;
  fecha_hasta: string;
  arrastre_inicial: number;
  venta_neta: number;
  efectivo_qr: number;
  bancos: number;
  reposicion_premios: number;
  gastos: number;
  saldo_final: number;
  is_active_cycle: boolean;
  status: 'pagado' | 'pendiente' | 'favor';
  // Detailed voucher collections
  vouchers: {
    cobradores_qr: any[];
    bancos: any[];
    gastos: any[];
    reposicion_premios: any[];
    ventas_sistemas: any[];
  };
}

export const AgencyCycleHistoryTab: React.FC<{ initialAgency?: string }> = ({ initialAgency }) => {
  const { effectiveUserId, systemCycle } = useAuth();

  const [isLoading, setIsLoading] = useState(true);
  const [selectedCurrency, setSelectedCurrency] = useState<'BS' | 'USD' | 'COP'>('BS');
  const [periodicity, setPeriodicity] = useState<'semanal' | 'mensual'>('semanal');
  const [selectedAgencyName, setSelectedAgencyName] = useState<string>('');
  const [agencySearchQuery, setAgencySearchQuery] = useState('');

  // Data states
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [closures, setClosures] = useState<any[]>([]);
  const [activeSales, setActiveSales] = useState<any[]>([]);
  const [rawDailyPayments, setRawDailyPayments] = useState<any[]>([]);
  const [rawBankPayments, setRawBankPayments] = useState<any[]>([]);
  const [rawDailyExpenses, setRawDailyExpenses] = useState<any[]>([]);
  const [rawManualPayments, setRawManualPayments] = useState<any[]>([]);
  const [rawManualExpenses, setRawManualExpenses] = useState<any[]>([]);

  // Drawer modal state for drilldown
  const [selectedDrilldownRow, setSelectedDrilldownRow] = useState<CycleHistoryRow | null>(null);

  const loadAllHistoryData = async () => {
    if (!effectiveUserId) return;
    setIsLoading(true);

    try {
      const [
        agRes,
        cRes,
        sRes,
        pdRes,
        pbRes,
        gdRes,
        psRes,
        gRes
      ] = await Promise.all([
        supabase.from('agencias').select('*').eq('user_id', effectiveUserId).order('nombre_agencia', { ascending: true }),
        supabase.from('cierres_semanales').select('*').eq('user_id', effectiveUserId).order('fecha_cierre', { ascending: false }),
        supabase.from('carga_actual').select('*').eq('user_id', effectiveUserId),
        supabase.from('cda_pagos_diarios').select('*').eq('user_id', effectiveUserId),
        supabase.from('cda_pagos_bancarios').select('*').eq('user_id', effectiveUserId).eq('confirmado', true),
        supabase.from('cda_gastos_diarios').select('*').eq('user_id', effectiveUserId),
        supabase.from('pagos_semana').select('*').eq('user_id', effectiveUserId),
        supabase.from('gastos').select('*').eq('user_id', effectiveUserId),
      ]);

      const agList = agRes.data || [];
      setAgencies(agList);
      setClosures(cRes.data || []);
      setActiveSales(sRes.data || []);
      setRawDailyPayments(pdRes.data || []);
      setRawBankPayments(pbRes.data || []);
      setRawDailyExpenses(gdRes.data || []);
      setRawManualPayments(psRes.data || []);
      setRawManualExpenses(gRes.data || []);

      if (!selectedAgencyName && agList.length > 0) {
        if (initialAgency && agList.some(a => a.nombre_agencia.toUpperCase() === initialAgency.toUpperCase())) {
          setSelectedAgencyName(initialAgency.toUpperCase());
        } else {
          setSelectedAgencyName(agList[0].nombre_agencia.toUpperCase());
        }
      }
    } catch (err) {
      console.error('Error loading agency history data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAllHistoryData();

    if (!effectiveUserId) return;

    const channel = supabase
      .channel('realtime_agency_history')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cierres_semanales' }, () => loadAllHistoryData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cda_pagos_diarios' }, () => loadAllHistoryData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cda_pagos_bancarios' }, () => loadAllHistoryData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cda_gastos_diarios' }, () => loadAllHistoryData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pagos_semana' }, () => loadAllHistoryData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'gastos' }, () => loadAllHistoryData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'carga_actual' }, () => loadAllHistoryData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agencias' }, () => loadAllHistoryData())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [effectiveUserId]);

  const currentAgency = useMemo(() => {
    return agencies.find((a) => a.nombre_agencia.toUpperCase() === selectedAgencyName.toUpperCase()) || null;
  }, [agencies, selectedAgencyName]);

  // Compute Weekly Rows for the selected agency and currency
  const weeklyHistoryRows = useMemo<CycleHistoryRow[]>(() => {
    if (!selectedAgencyName || !currentAgency) return [];

    const agencyNom = selectedAgencyName.toUpperCase();
    const mon = selectedCurrency;
    const colIni = mon === 'BS' ? 'saldo_inicial_bs' : mon === 'USD' ? 'saldo_inicial_usd' : 'saldo_inicial_cop';

    const list: CycleHistoryRow[] = [];

    // 1. ACTIVE CYCLE ROW (Open cycle in progress)
    const curArrastre = Math.abs(Number(currentAgency[colIni] || 0)) < 0.0001 ? 0 : Number(currentAgency[colIni] || 0);

    // Active sales
    const agActiveSales = activeSales.filter(
      (s) => s.agencia.toUpperCase() === agencyNom && normalizarMoneda(s.moneda) === mon
    );
    const activeVentaNeta = agActiveSales.reduce((sum, curr) => sum + Number(curr.neto || curr.util_op || 0), 0);

    // Active daily payments in cycle range
    const cycleDesde = systemCycle?.desde || '';
    const cycleHasta = systemCycle?.hasta || '';

    const agCobradorList = rawDailyPayments.filter((p) => {
      const matchAg = (p.agencia || p.nombre_agency || '').trim().toUpperCase() === agencyNom;
      const matchMon = normalizarMoneda(p.moneda) === mon;
      const isCob = Boolean(p.qr_token) || String(p.tipo_pago || '').toUpperCase().includes('COBRADOR');
      const isConf = Boolean(p.confirmado) || Boolean(p.confirmado_supervisor) || Boolean(p.fecha_escaneo_cobrador);
      const fStr = String(p.fecha || p.created_at || '').slice(0, 10);
      const inCycle = (!cycleDesde || fStr >= cycleDesde) && (!cycleHasta || fStr <= cycleHasta);
      return matchAg && matchMon && isCob && isConf && inCycle && !p.rechazado;
    });
    const cobradorTot = agCobradorList.reduce((sum, curr) => sum + Number(curr.monto || 0), 0);

    const agEfectivoList = rawDailyPayments.filter((p) => {
      const matchAg = (p.agencia || p.nombre_agency || '').trim().toUpperCase() === agencyNom;
      const matchMon = normalizarMoneda(p.moneda) === mon;
      const isCob = Boolean(p.qr_token) || String(p.tipo_pago || '').toUpperCase().includes('COBRADOR');
      const isConf = Boolean(p.confirmado) || Boolean(p.confirmado_supervisor);
      const fStr = String(p.fecha || p.created_at || '').slice(0, 10);
      const inCycle = (!cycleDesde || fStr >= cycleDesde) && (!cycleHasta || fStr <= cycleHasta);
      return matchAg && matchMon && !isCob && isConf && inCycle && !p.rechazado;
    });
    const rawEfectivoTot = agEfectivoList.reduce((sum, curr) => sum + Number(curr.monto || 0), 0);
    const efectivoRemanente = Math.max(0, rawEfectivoTot - cobradorTot);
    const totalEfectivoQR = cobradorTot + efectivoRemanente;

    // Active bank transfers
    const agBankList = rawBankPayments.filter((p) => {
      const matchAg = (p.agencia || '').trim().toUpperCase() === agencyNom;
      const matchMon = normalizarMoneda(p.moneda) === mon;
      const fStr = String(p.fecha || p.created_at || '').slice(0, 10);
      const inCycle = (!cycleDesde || fStr >= cycleDesde) && (!cycleHasta || fStr <= cycleHasta);
      return matchAg && matchMon && inCycle && !p.rechazado;
    });
    const bancosTot = agBankList.reduce((sum, curr) => sum + Number(curr.monto || 0), 0);

    // Active prize replenishments & manual payments
    const agManualPrem = rawManualPayments.filter((p) => {
      const matchAg = (p.agencia || '').trim().toUpperCase() === agencyNom;
      const matchMon = normalizarMoneda(p.moneda) === mon;
      const isPrem = String(p.tipo_pago || '').toUpperCase().includes('PREMIO') || String(p.referencia || '').toUpperCase().includes('PREMIO');
      return matchAg && matchMon && isPrem && !p.rechazado;
    });
    const reposicionPremiosTot = agManualPrem.reduce((sum, curr) => sum + Number(curr.monto || 0), 0);

    // Active manual & daily expenses
    const agExpList = [
      ...rawDailyExpenses.filter((g) => {
        const matchAg = (g.agencia || g.nombre_agency || '').trim().toUpperCase() === agencyNom;
        const matchMon = normalizarMoneda(g.moneda) === mon;
        const fStr = String(g.fecha || g.created_at || '').slice(0, 10);
        const inCycle = (!cycleDesde || fStr >= cycleDesde) && (!cycleHasta || fStr <= cycleHasta);
        return matchAg && matchMon && inCycle && (g.confirmado || g.confirmado_supervisor) && !g.rechazado;
      }),
      ...rawManualExpenses.filter((g) => {
        const matchAg = (g.agencia || '').trim().toUpperCase() === agencyNom;
        const matchMon = normalizarMoneda(g.moneda) === mon;
        return matchAg && matchMon && !g.rechazado;
      }),
    ];
    const gastosTot = agExpList.reduce((sum, curr) => sum + Number(curr.monto || 0), 0);

    const activeFinal = Math.round((curArrastre + activeVentaNeta - totalEfectivoQR - bancosTot + reposicionPremiosTot - gastosTot) * 100) / 100;

    let activeStatus: 'pagado' | 'pendiente' | 'favor' = 'pagado';
    if (Math.abs(activeFinal) < 0.1) activeStatus = 'pagado';
    else if (activeFinal > 0) activeStatus = 'pendiente';
    else activeStatus = 'favor';

    list.push({
      id: `active_sem_${systemCycle.semana}`,
      tipo_periodo: 'semanal',
      periodo_label: `Semana ${systemCycle.semana} (Ciclo Abierto)`,
      rango_fechas: `${systemCycle.desde} al ${systemCycle.hasta}`,
      fecha_desde: systemCycle.desde,
      fecha_hasta: systemCycle.hasta,
      arrastre_inicial: curArrastre,
      venta_neta: activeVentaNeta,
      efectivo_qr: totalEfectivoQR,
      bancos: bancosTot,
      reposicion_premios: reposicionPremiosTot,
      gastos: gastosTot,
      saldo_final: activeFinal,
      is_active_cycle: true,
      status: activeStatus,
      vouchers: {
        cobradores_qr: agCobradorList,
        bancos: agBankList,
        gastos: agExpList,
        reposicion_premios: agManualPrem,
        ventas_sistemas: agActiveSales,
      },
    });

    // 2. CLOSED CYCLES FROM cierres_semanales
    const pastAgencyClosures = closures.filter(
      (c) => c.entidad.toUpperCase() === agencyNom && normalizarMoneda(c.moneda) === mon
    );

    pastAgencyClosures.forEach((c) => {
      let cStatus: 'pagado' | 'pendiente' | 'favor' = 'pagado';
      const cFinal = Number(c.saldo_final || 0);
      if (Math.abs(cFinal) < 0.1) cStatus = 'pagado';
      else if (cFinal > 0) cStatus = 'pendiente';
      else cStatus = 'favor';

      // Parse dates from periodo string (e.g. "2026-08-31 al 2026-09-06")
      let pDesde = '', pHasta = '';
      if (c.periodo && c.periodo.includes(' al ')) {
        const parts = c.periodo.split(' al ');
        pDesde = parts[0].trim();
        pHasta = parts[1].trim();
      }

      // Filter historical vouchers in that period
      const histCob = rawDailyPayments.filter((p) => {
        const matchAg = (p.agencia || p.nombre_agency || '').trim().toUpperCase() === agencyNom;
        const matchMon = normalizarMoneda(p.moneda) === mon;
        const fStr = String(p.fecha || p.created_at || '').slice(0, 10);
        const inCycle = (!pDesde || fStr >= pDesde) && (!pHasta || fStr <= pHasta);
        return matchAg && matchMon && inCycle && !p.rechazado;
      });

      const histBank = rawBankPayments.filter((p) => {
        const matchAg = (p.agencia || '').trim().toUpperCase() === agencyNom;
        const matchMon = normalizarMoneda(p.moneda) === mon;
        const fStr = String(p.fecha || p.created_at || '').slice(0, 10);
        const inCycle = (!pDesde || fStr >= pDesde) && (!pHasta || fStr <= pHasta);
        return matchAg && matchMon && inCycle && !p.rechazado;
      });

      const histExp = rawDailyExpenses.filter((g) => {
        const matchAg = (g.agencia || g.nombre_agency || '').trim().toUpperCase() === agencyNom;
        const matchMon = normalizarMoneda(g.moneda) === mon;
        const fStr = String(g.fecha || g.created_at || '').slice(0, 10);
        const inCycle = (!pDesde || fStr >= pDesde) && (!pHasta || fStr <= pHasta);
        return matchAg && matchMon && inCycle && !g.rechazado;
      });

      const arrastrePast = Math.abs(Number(c.saldo_anterior || 0)) < 0.0001 ? 0 : Number(c.saldo_anterior || 0);
      const vtaPast = Number(c.utilidad_semana || 0);
      const gastosPast = Number(c.gastos || 0);
      const movsPast = Number(c.movimientos || 0);

      // Distinguish bank vs QR from movements or vouchers
      const pastCobTot = histCob.reduce((sum, curr) => sum + Number(curr.monto || 0), 0);
      const pastBankTot = histBank.reduce((sum, curr) => sum + Number(curr.monto || 0), 0);

      list.push({
        id: `closed_${c.id}`,
        tipo_periodo: 'semanal',
        periodo_label: c.periodo ? `Ciclo ${c.periodo}` : `Cierre ${formatDate(c.fecha_cierre)}`,
        rango_fechas: c.periodo || formatDate(c.fecha_cierre),
        fecha_desde: pDesde,
        fecha_hasta: pHasta,
        arrastre_inicial: arrastrePast,
        venta_neta: vtaPast,
        efectivo_qr: pastCobTot,
        bancos: pastBankTot > 0 ? pastBankTot : Math.max(0, -movsPast - pastCobTot - gastosPast),
        reposicion_premios: Math.max(0, movsPast + pastCobTot + pastBankTot + gastosPast),
        gastos: gastosPast,
        saldo_final: cFinal,
        is_active_cycle: false,
        status: cStatus,
        vouchers: {
          cobradores_qr: histCob,
          bancos: histBank,
          gastos: histExp,
          reposicion_premios: [],
          ventas_sistemas: [],
        },
      });
    });

    return list;
  }, [
    selectedAgencyName,
    currentAgency,
    selectedCurrency,
    activeSales,
    rawDailyPayments,
    rawBankPayments,
    rawDailyExpenses,
    rawManualPayments,
    rawManualExpenses,
    closures,
    systemCycle,
  ]);

  // Compute Monthly Aggregated Rows
  const monthlyHistoryRows = useMemo<CycleHistoryRow[]>(() => {
    if (weeklyHistoryRows.length === 0) return [];

    const monthMap = new Map<string, CycleHistoryRow[]>();

    weeklyHistoryRows.forEach((row) => {
      const dateKey = row.fecha_desde || row.fecha_hasta || '';
      const ym = dateKey.length >= 7 ? dateKey.slice(0, 7) : '2026-09';
      if (!monthMap.has(ym)) {
        monthMap.set(ym, []);
      }
      monthMap.get(ym)!.push(row);
    });

    const months: CycleHistoryRow[] = [];

    monthMap.forEach((rowsInMonth, ym) => {
      // Sort oldest to newest to get accurate initial and final balances
      const sorted = [...rowsInMonth].sort((a, b) => (a.fecha_desde || '').localeCompare(b.fecha_desde || ''));
      const oldestRow = sorted[0];
      const newestRow = sorted[sorted.length - 1];

      const [yStr, mStr] = ym.split('-');
      const monthNames = [
        'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
        'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
      ];
      const mIndex = parseInt(mStr, 10) - 1;
      const mName = monthNames[mIndex] || ym;
      const monthLabel = `${mName} ${yStr}`;

      const totalVenta = sorted.reduce((sum, r) => sum + r.venta_neta, 0);
      const totalEf = sorted.reduce((sum, r) => sum + r.efectivo_qr, 0);
      const totalBan = sorted.reduce((sum, r) => sum + r.bancos, 0);
      const totalPrem = sorted.reduce((sum, r) => sum + r.reposicion_premios, 0);
      const totalG = sorted.reduce((sum, r) => sum + r.gastos, 0);
      const saldoIniMonth = oldestRow.arrastre_inicial;
      const saldoFinMonth = newestRow.saldo_final;

      let mStatus: 'pagado' | 'pendiente' | 'favor' = 'pagado';
      if (Math.abs(saldoFinMonth) < 0.1) mStatus = 'pagado';
      else if (saldoFinMonth > 0) mStatus = 'pendiente';
      else mStatus = 'favor';

      const combinedVouchers = {
        cobradores_qr: sorted.flatMap((r) => r.vouchers.cobradores_qr),
        bancos: sorted.flatMap((r) => r.vouchers.bancos),
        gastos: sorted.flatMap((r) => r.vouchers.gastos),
        reposicion_premios: sorted.flatMap((r) => r.vouchers.reposicion_premios),
        ventas_sistemas: sorted.flatMap((r) => r.vouchers.ventas_sistemas),
      };

      months.push({
        id: `month_${ym}`,
        tipo_periodo: 'mensual',
        periodo_label: monthLabel,
        rango_fechas: `${ym}-01 al fin de mes (${sorted.length} semanas)`,
        fecha_desde: `${ym}-01`,
        fecha_hasta: `${ym}-31`,
        arrastre_inicial: saldoIniMonth,
        venta_neta: totalVenta,
        efectivo_qr: totalEf,
        bancos: totalBan,
        reposicion_premios: totalPrem,
        gastos: totalG,
        saldo_final: saldoFinMonth,
        is_active_cycle: sorted.some((r) => r.is_active_cycle),
        status: mStatus,
        vouchers: combinedVouchers,
      });
    });

    return months.sort((a, b) => (b.fecha_desde || '').localeCompare(a.fecha_desde || ''));
  }, [weeklyHistoryRows]);

  const activeRows = periodicity === 'semanal' ? weeklyHistoryRows : monthlyHistoryRows;

  // KPI calculations
  const kpis = useMemo(() => {
    if (activeRows.length === 0) {
      return { saldoActual: 0, ventaNetaTotal: 0, cobrosTotal: 0, premiosTotal: 0, gastosTotal: 0 };
    }
    const latest = activeRows[0];
    const totalVenta = activeRows.reduce((sum, r) => sum + r.venta_neta, 0);
    const totalCobros = activeRows.reduce((sum, r) => sum + r.efectivo_qr + r.bancos, 0);
    const totalPremios = activeRows.reduce((sum, r) => sum + r.reposicion_premios, 0);
    const totalGastos = activeRows.reduce((sum, r) => sum + r.gastos, 0);

    return {
      saldoActual: latest.saldo_final,
      ventaNetaTotal: totalVenta,
      cobrosTotal: totalCobros,
      premiosTotal: totalPremios,
      gastosTotal: totalGastos,
    };
  }, [activeRows]);

  // Filtered agencies for dropdown search
  const filteredAgencies = useMemo(() => {
    if (!agencySearchQuery) return agencies;
    const q = agencySearchQuery.toUpperCase();
    return agencies.filter((a) => a.nombre_agencia.toUpperCase().includes(q));
  }, [agencies, agencySearchQuery]);

  // CSV Export handler
  const handleExportCSV = () => {
    if (activeRows.length === 0) return;
    const headers = [
      'Período',
      'Rango Fechas',
      'Arrastre Inicial',
      'Ganancia/Pérdida (Venta Neta)',
      'Efectivo y QR',
      'Gestión Bancaria',
      'Reposición de Premios',
      'Gastos',
      'Saldo Final',
      'Estado',
    ];

    const rows = activeRows.map((r) => [
      `"${r.periodo_label}"`,
      `"${r.rango_fechas}"`,
      r.arrastre_inicial.toFixed(2),
      r.venta_neta.toFixed(2),
      r.efectivo_qr.toFixed(2),
      r.bancos.toFixed(2),
      r.reposicion_premios.toFixed(2),
      r.gastos.toFixed(2),
      r.saldo_final.toFixed(2),
      r.status.toUpperCase(),
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute(
      'download',
      `Historial_${selectedAgencyName}_${selectedCurrency}_${periodicity}_${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header & Controls Card */}
      <div className="bg-[#0D1B22] border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-xl space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2.5">
              <span className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <Layers className="w-5 h-5" />
              </span>
              Histórico Individual por Taquilla
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              Kardex y estado de cuenta cronológico de ganancias, recaudaciones de efectivo, bancos y reposición de premios.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleExportCSV}
              disabled={activeRows.length === 0}
              className="px-3.5 py-2 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-xs font-semibold flex items-center gap-1.5 transition-all border border-emerald-500/30 cursor-pointer disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" />
              Exportar CSV
            </button>

            <button
              onClick={() => window.print()}
              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex items-center gap-1.5 transition-all border border-slate-700 cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              Imprimir
            </button>

            <button
              onClick={loadAllHistoryData}
              disabled={isLoading}
              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex items-center gap-1.5 transition-all border border-slate-700 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              Actualizar
            </button>
          </div>
        </div>

        {/* Filter Controls Row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-slate-800/80">
          {/* 1. Agency Selector */}
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">
              🏢 Seleccionar Taquilla / Agencia:
            </label>
            <select
              value={selectedAgencyName}
              onChange={(e) => setSelectedAgencyName(e.target.value)}
              className="w-full bg-[#071217] border border-slate-700 rounded-xl px-3.5 py-2 text-xs font-bold text-white focus:outline-none focus:border-emerald-500 cursor-pointer"
            >
              {agencies.map((ag) => (
                <option key={ag.id} value={ag.nombre_agencia.toUpperCase()}>
                  {ag.nombre_agencia.toUpperCase()}
                </option>
              ))}
            </select>
          </div>

          {/* 2. Currency Selector */}
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">
              💰 Moneda:
            </label>
            <div className="flex items-center bg-[#071217] p-1 rounded-xl border border-slate-700">
              {(['BS', 'USD', 'COP'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setSelectedCurrency(m)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    selectedCurrency === m
                      ? 'bg-emerald-500 text-slate-950 shadow-md font-black'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
                  }`}
                >
                  {m === 'BS' ? '🔵 BS' : m === 'USD' ? '🟢 USD' : '🟡 COP'}
                </button>
              ))}
            </div>
          </div>

          {/* 3. Periodicity Switch (Semanal / Mensual) */}
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">
              📅 Periodicidad:
            </label>
            <div className="flex items-center bg-[#071217] p-1 rounded-xl border border-slate-700">
              <button
                onClick={() => setPeriodicity('semanal')}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  periodicity === 'semanal'
                    ? 'bg-emerald-500 text-slate-950 shadow-md font-black'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
                }`}
              >
                📅 Semanal (Ciclos)
              </button>
              <button
                onClick={() => setPeriodicity('mensual')}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  periodicity === 'mensual'
                    ? 'bg-emerald-500 text-slate-950 shadow-md font-black'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
                }`}
              >
                🗓️ Mensual (Consolidado)
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* KPI Cards for Selected Agency */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        <div className="bg-[#0D1B22] border border-slate-800 p-4 rounded-2xl shadow-lg">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
            Saldo Actual Acumulado
          </span>
          <div
            className={`text-lg sm:text-xl font-black font-mono ${
              kpis.saldoActual > 0
                ? 'text-rose-400'
                : kpis.saldoActual < 0
                ? 'text-cyan-400'
                : 'text-emerald-400'
            }`}
          >
            {formatCurrency(kpis.saldoActual, selectedCurrency)}
          </div>
          <span className="text-[10px] text-slate-500 block mt-1">
            {kpis.saldoActual > 0
              ? '⚠️ Saldo pendiente por cobrar'
              : kpis.saldoActual < 0
              ? '🎁 Saldo a favor de la agencia'
              : '✅ Taquilla al día'}
          </span>
        </div>

        <div className="bg-[#0D1B22] border border-slate-800 p-4 rounded-2xl shadow-lg">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
            Utilidad Neta Total
          </span>
          <div
            className={`text-lg sm:text-xl font-black font-mono ${
              kpis.ventaNetaTotal >= 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {formatCurrency(kpis.ventaNetaTotal, selectedCurrency)}
          </div>
          <span className="text-[10px] text-slate-500 block mt-1">
            Ganancia / Pérdida en ventas
          </span>
        </div>

        <div className="bg-[#0D1B22] border border-slate-800 p-4 rounded-2xl shadow-lg">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
            Total Cobros Recaudados
          </span>
          <div className="text-lg sm:text-xl font-black font-mono text-sky-400">
            {formatCurrency(kpis.cobrosTotal, selectedCurrency)}
          </div>
          <span className="text-[10px] text-slate-500 block mt-1">
            Efectivo QR + Transferencias
          </span>
        </div>

        <div className="bg-[#0D1B22] border border-slate-800 p-4 rounded-2xl shadow-lg">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
            Premios Repuestos
          </span>
          <div className="text-lg sm:text-xl font-black font-mono text-amber-400">
            {formatCurrency(kpis.premiosTotal, selectedCurrency)}
          </div>
          <span className="text-[10px] text-slate-500 block mt-1">
            Abonos de la Operadora
          </span>
        </div>
      </div>

      {/* Main Historical Table */}
      <div className="bg-[#0D1B22] border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
        <div className="p-4 sm:p-5 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/30">
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <span>
                {periodicity === 'semanal' ? '📜 Historial Cronológico de Ciclos' : '🗓️ Historial Consolidado Mensual'}
              </span>
              <span className="text-emerald-400 font-black">({selectedAgencyName})</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Haga clic en cualquier fila para desplegar el desglose de comprobantes, tokens QR y transferencias.
            </p>
          </div>

          <span className="px-3 py-1 rounded-full text-xs font-bold bg-slate-800 text-slate-300 border border-slate-700 self-start sm:self-auto">
            {activeRows.length} {periodicity === 'semanal' ? 'períodos' : 'meses'} registrados
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-[#071217] text-slate-400 border-b border-slate-800 font-bold uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">Período / Ciclo</th>
                <th className="py-3 px-4 text-right">Arrastre Inicial</th>
                <th className="py-3 px-4 text-right">Ganancia / Pérdida</th>
                <th className="py-3 px-4 text-right">(-) Efectivo/QR</th>
                <th className="py-3 px-4 text-right">(-) Gestión Banco</th>
                <th className="py-3 px-4 text-right">(+) Rep. Premios</th>
                <th className="py-3 px-4 text-right">(-) Gastos</th>
                <th className="py-3 px-4 text-right">Saldo Final</th>
                <th className="py-3 px-4 text-center">Estado</th>
                <th className="py-3 px-3 text-center">Detalle</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 font-mono">
              {activeRows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-500 font-sans">
                    No se encontraron registros históricos para esta agencia en {selectedCurrency}.
                  </td>
                </tr>
              ) : (
                activeRows.map((row) => (
                  <tr
                    key={row.id}
                    onClick={() => setSelectedDrilldownRow(row)}
                    className="hover:bg-slate-800/40 transition-colors cursor-pointer group"
                  >
                    <td className="py-3.5 px-4 font-sans">
                      <div className="font-bold text-white flex items-center gap-1.5">
                        {row.periodo_label}
                        {row.is_active_cycle && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                            Activo
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-slate-500 block">{row.rango_fechas}</span>
                    </td>

                    <td className="py-3.5 px-4 text-right text-slate-400">
                      {formatCurrency(row.arrastre_inicial, selectedCurrency)}
                    </td>

                    <td
                      className={`py-3.5 px-4 text-right font-semibold ${
                        row.venta_neta > 0
                          ? 'text-emerald-400'
                          : row.venta_neta < 0
                          ? 'text-rose-400'
                          : 'text-slate-400'
                      }`}
                    >
                      {row.venta_neta > 0 ? '+' : ''}
                      {formatCurrency(row.venta_neta, selectedCurrency)}
                    </td>

                    <td className="py-3.5 px-4 text-right text-rose-400">
                      {row.efectivo_qr > 0 ? `-${formatCurrency(row.efectivo_qr, selectedCurrency)}` : '0.00'}
                    </td>

                    <td className="py-3.5 px-4 text-right text-sky-400">
                      {row.bancos > 0 ? `-${formatCurrency(row.bancos, selectedCurrency)}` : '0.00'}
                    </td>

                    <td className="py-3.5 px-4 text-right text-amber-400">
                      {row.reposicion_premios > 0
                        ? `+${formatCurrency(row.reposicion_premios, selectedCurrency)}`
                        : '0.00'}
                    </td>

                    <td className="py-3.5 px-4 text-right text-rose-400/80">
                      {row.gastos > 0 ? `-${formatCurrency(row.gastos, selectedCurrency)}` : '0.00'}
                    </td>

                    <td
                      className={`py-3.5 px-4 text-right font-black ${
                        row.saldo_final > 0
                          ? 'text-rose-400'
                          : row.saldo_final < 0
                          ? 'text-cyan-400'
                          : 'text-emerald-400'
                      }`}
                    >
                      {formatCurrency(row.saldo_final, selectedCurrency)}
                    </td>

                    <td className="py-3.5 px-4 text-center font-sans">
                      {row.status === 'pagado' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                          <CheckCircle2 className="w-3 h-3" /> Solvente
                        </span>
                      ) : row.status === 'pendiente' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30">
                          <AlertTriangle className="w-3 h-3" /> Por Cobrar
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                          A Favor
                        </span>
                      )}
                    </td>

                    <td className="py-3.5 px-3 text-center">
                      <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-emerald-400 transition-colors mx-auto" />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Slide-over Drawer / Modal for Detailed Drilldown */}
      {selectedDrilldownRow && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-xs animate-fade-in">
          <div className="bg-[#0D1B22] border-l border-slate-800 w-full max-w-2xl h-full flex flex-col shadow-2xl overflow-hidden">
            {/* Drawer Header */}
            <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <Receipt className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-white">
                    Detalle Auditado: {selectedAgencyName}
                  </h3>
                  <p className="text-xs text-slate-400">
                    {selectedDrilldownRow.periodo_label} ({selectedDrilldownRow.rango_fechas})
                  </p>
                </div>
              </div>

              <button
                onClick={() => setSelectedDrilldownRow(null)}
                className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Drawer Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 text-xs font-sans">
              {/* Summary Balance Strip */}
              <div className="p-4 rounded-2xl bg-[#071217] border border-slate-800 grid grid-cols-3 gap-3 text-center">
                <div>
                  <span className="text-[10px] text-slate-500 block uppercase font-bold">Arrastre Inicial</span>
                  <span className="text-xs font-mono font-bold text-slate-300">
                    {formatCurrency(selectedDrilldownRow.arrastre_inicial, selectedCurrency)}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block uppercase font-bold">Venta Neta Período</span>
                  <span
                    className={`text-xs font-mono font-bold ${
                      selectedDrilldownRow.venta_neta >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {formatCurrency(selectedDrilldownRow.venta_neta, selectedCurrency)}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block uppercase font-bold">Saldo Final</span>
                  <span
                    className={`text-xs font-mono font-black ${
                      selectedDrilldownRow.saldo_final > 0
                        ? 'text-rose-400'
                        : selectedDrilldownRow.saldo_final < 0
                        ? 'text-cyan-400'
                        : 'text-emerald-400'
                    }`}
                  >
                    {formatCurrency(selectedDrilldownRow.saldo_final, selectedCurrency)}
                  </span>
                </div>
              </div>

              {/* Section 1: Cobradores en Ruta QR */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-white flex items-center gap-2">
                    <QrCode className="w-4 h-4 text-emerald-400" />
                    <span>Recaudaciones en Ruta (Cobradores QR)</span>
                  </h4>
                  <span className="font-mono font-bold text-rose-400">
                    -{formatCurrency(selectedDrilldownRow.efectivo_qr, selectedCurrency)}
                  </span>
                </div>

                {selectedDrilldownRow.vouchers.cobradores_qr.length === 0 ? (
                  <p className="text-slate-500 text-[11px] p-3 rounded-xl bg-slate-900/40 border border-slate-800/60">
                    No hubo entregas a cobradores QR registradas en este período.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {selectedDrilldownRow.vouchers.cobradores_qr.map((v: any, idx: number) => (
                      <div
                        key={idx}
                        className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between"
                      >
                        <div>
                          <span className="font-bold text-white block">
                            {v.qr_token || 'Recaudación QR'}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            Fecha: {formatDate(v.fecha || v.created_at)} &bull; Cobrador:{' '}
                            {v.supervisor_nombre || v.cajero_nombre || 'Asignado'}
                          </span>
                        </div>
                        <span className="font-mono font-bold text-rose-400">
                          -{formatCurrency(v.monto, selectedCurrency)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Section 2: Gestión Bancaria */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-white flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-sky-400" />
                    <span>Gestión Bancaria (Transferencias y Pago Móvil)</span>
                  </h4>
                  <span className="font-mono font-bold text-sky-400">
                    -{formatCurrency(selectedDrilldownRow.bancos, selectedCurrency)}
                  </span>
                </div>

                {selectedDrilldownRow.vouchers.bancos.length === 0 ? (
                  <p className="text-slate-500 text-[11px] p-3 rounded-xl bg-slate-900/40 border border-slate-800/60">
                    No hubo transferencias bancarias registradas en este período.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {selectedDrilldownRow.vouchers.bancos.map((v: any, idx: number) => (
                      <div
                        key={idx}
                        className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between"
                      >
                        <div>
                          <span className="font-bold text-white block">
                            {v.referencia ? `REF: ${v.referencia}` : 'Transferencia Bancaria'}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            Fecha: {formatDate(v.fecha || v.created_at)} &bull; Pagador:{' '}
                            {v.datos_pagador || v.pagador || 'Agencia'}
                          </span>
                        </div>
                        <span className="font-mono font-bold text-sky-400">
                          -{formatCurrency(v.monto, selectedCurrency)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Section 3: Reposición de Premios */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-white flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-amber-400" />
                    <span>Reposición de Premios (Abonos Operadora)</span>
                  </h4>
                  <span className="font-mono font-bold text-amber-400">
                    +{formatCurrency(selectedDrilldownRow.reposicion_premios, selectedCurrency)}
                  </span>
                </div>

                {selectedDrilldownRow.reposicion_premios === 0 ? (
                  <p className="text-slate-500 text-[11px] p-3 rounded-xl bg-slate-900/40 border border-slate-800/60">
                    Sin abonos de reposición de premios en este período.
                  </p>
                ) : (
                  <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-between">
                    <div>
                      <span className="font-bold text-amber-300 block">Reposición de Premios / Abono por Pérdida</span>
                      <span className="text-[10px] text-slate-400">Acreditado por la administración central</span>
                    </div>
                    <span className="font-mono font-bold text-amber-400">
                      +{formatCurrency(selectedDrilldownRow.reposicion_premios, selectedCurrency)}
                    </span>
                  </div>
                )}
              </div>

              {/* Section 4: Gastos */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-white flex items-center gap-2">
                    <Receipt className="w-4 h-4 text-rose-400" />
                    <span>Gastos Operativos de Taquilla</span>
                  </h4>
                  <span className="font-mono font-bold text-rose-400">
                    -{formatCurrency(selectedDrilldownRow.gastos, selectedCurrency)}
                  </span>
                </div>

                {selectedDrilldownRow.vouchers.gastos.length === 0 ? (
                  <p className="text-slate-500 text-[11px] p-3 rounded-xl bg-slate-900/40 border border-slate-800/60">
                    Sin gastos reportados en este período.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {selectedDrilldownRow.vouchers.gastos.map((v: any, idx: number) => (
                      <div
                        key={idx}
                        className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between"
                      >
                        <div>
                          <span className="font-bold text-white block">
                            {v.concepto || v.descripcion || 'Gasto Operativo'}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            Fecha: {formatDate(v.fecha || v.created_at)}
                          </span>
                        </div>
                        <span className="font-mono font-bold text-rose-400">
                          -{formatCurrency(v.monto, selectedCurrency)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Drawer Footer */}
            <div className="p-4 border-t border-slate-800 bg-slate-900/80 flex justify-end">
              <button
                onClick={() => setSelectedDrilldownRow(null)}
                className="px-6 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-colors cursor-pointer"
              >
                Cerrar Detalle
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
