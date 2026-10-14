import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import type { ModuleId } from '../../types';
import {
  Store,
  CheckSquare,
  Bike,
  Coins,
  ArrowUpRight,
  TrendingUp,
  RefreshCw,
  Sparkles,
  Calendar,
  AlertCircle,
  FileText,
  Globe,
  Building2,
  Wallet,
  ArrowRight,
} from 'lucide-react';
import { formatCurrency, formatDate, normalizarMoneda, cleanAgencyName } from '../../utils/formatters';
import { getAgencyCommissionAndParticipation } from '../../utils/salesRecalculation';
import { getConsolidatedPayments, getConsolidatedExpenses, getAdministrativeExpenses } from '../../utils/consolidations';
import { loadSystemKeywords, type SystemKeywordsMap } from '../../utils/systemKeywords';
import {
  calculateOperatorSettlements,
  type OperatorPayment,
  type OperatorSettlementRow,
  type OperatorSettlementTotals,
} from '../../utils/operatorSettlement';

interface HomeDashboardProps {
  onNavigate: (module: ModuleId) => void;
}

interface CurrencyBalance {
  moneda: string;
  saldoAnterior: number;
  ventasSemana: number;
  gastosSemana: number;
  gastosAgencias: number;
  gastosComercializadora: number;
  totalCobros: number;
  reposicionPremios: number;
  pagosSemana: number;
  balanceFinal: number;
}

export const HomeDashboard: React.FC<HomeDashboardProps> = ({ onNavigate }) => {
  const { user, profile, systemCycle, effectiveUserId } = useAuth();
  const [loading, setLoading] = useState(true);

  // Metrics state
  const [totalAgencias, setTotalAgencias] = useState(0);
  const [agenciasActivas, setAgenciasActivas] = useState(0);
  const [pendientesPizarra, setPendientesPizarra] = useState(0);
  const [cobradoresActivos, setCobradoresActivos] = useState(0);
  const [montoEnRuta, setMontoEnRuta] = useState(0);
  const [balancesByCurrency, setBalancesByCurrency] = useState<Record<string, CurrencyBalance>>({});
  const [operatorRows, setOperatorRows] = useState<OperatorSettlementRow[]>([]);
  const [operatorTotalsByCurrency, setOperatorTotalsByCurrency] = useState<Record<string, OperatorSettlementTotals>>({});
  const [adminExpensesByCurrency, setAdminExpensesByCurrency] = useState<Record<string, number>>({ BS: 0, USD: 0, COP: 0 });

  const limiteAgencias = Number(profile?.limite_agencias || 5);
  const planName = (profile?.plan || user?.plan || 'Elite').toUpperCase();
  const bancaNombre = profile?.nombre_banca || profile?.banca || 'Mi Operadora';

  const loadDashboardData = useCallback(async () => {
    if (!effectiveUserId) return;
    setLoading(true);

    try {
      // 1. Cargar Agencias
      const { data: agData } = await supabase
        .from('agencias')
        .select('*')
        .eq('user_id', effectiveUserId);

      const agList = agData || [];
      setTotalAgencias(agList.length);
      setAgenciasActivas(agList.length);

      // 2. Pagos Pendientes en Pizarra
      const [resPb, resPd] = await Promise.all([
        supabase
          .from('cda_pagos_bancarios')
          .select('id')
          .eq('user_id', effectiveUserId)
          .eq('confirmado', false)
          .eq('rechazado', false),
        supabase
          .from('cda_pagos_diarios')
          .select('id')
          .eq('user_id', effectiveUserId)
          .eq('confirmado', false)
          .eq('rechazado', false),
      ]);

      const pendCount = (resPb.data?.length || 0) + (resPd.data?.length || 0);
      setPendientesPizarra(pendCount);

      // 3. Cobradores y Efectivo en Ruta
      const { data: cobData } = await supabase
        .from('cda_cobradores')
        .select('id')
        .eq('user_id', effectiveUserId)
        .eq('activo', true);

      setCobradoresActivos(cobData?.length || 0);

      const { data: liqPend } = await supabase
        .from('cda_pagos_diarios')
        .select('monto')
        .eq('user_id', effectiveUserId)
        .eq('liquidado_admin', false)
        .not('qr_token', 'is', null);

      const totalRuta = (liqPend || []).reduce((acc: number, r: any) => acc + (Number(r.monto) || 0), 0);
      setMontoEnRuta(totalRuta);

      // 4. Cargar Saldos Consolidados por Moneda (BS, USD, COP) y Operadoras
      const currencies = ['BS', 'USD', 'COP'];
      const balancesMap: Record<string, CurrencyBalance> = {};

      const [resVentas, gastosList, pagosList, sysRes, confs, payRes, adminExpensesList] = await Promise.all([
        supabase.from('carga_actual').select('*').eq('user_id', effectiveUserId),
        getConsolidatedExpenses(effectiveUserId, { fechaDesde: systemCycle?.desde, fechaHasta: systemCycle?.hasta }),
        getConsolidatedPayments(effectiveUserId, { fechaDesde: systemCycle?.desde, fechaHasta: systemCycle?.hasta }),
        supabase.from('sistemas').select('nombre_sistema').eq('user_id', effectiveUserId).order('nombre_sistema', { ascending: true }),
        loadSystemKeywords(effectiveUserId),
        supabase
          .from('pagos_semana')
          .select('*')
          .eq('user_id', effectiveUserId)
          .or('tipo_pago.eq.PAGO_OPERADORA,tipo_pago.eq.ABONO_OPERADORA,agencia.ilike.OPERADORA:%')
          .order('id', { ascending: false }),
        getAdministrativeExpenses(effectiveUserId, { fechaDesde: systemCycle?.desde, fechaHasta: systemCycle?.hasta }),
      ]);

      const adminTotals: Record<string, number> = { BS: 0, USD: 0, COP: 0 };
      (adminExpensesList || []).forEach((e) => {
        if (adminTotals[e.moneda] !== undefined) {
          adminTotals[e.moneda] += e.monto;
        }
      });
      setAdminExpensesByCurrency(adminTotals);

      const ventasList = resVentas.data || [];

      currencies.forEach((mon) => {
        const colInicial = `saldo_inicial_${mon.toLowerCase()}`;
        const saldoAnt = agList.reduce((acc: number, ag: any) => acc + (Number(ag[colInicial]) || 0), 0);

        // Venta neta = neto de carga actual deduciendo participación de agencias
        const vTot = ventasList
          .filter((v: any) => (v.moneda || '').toUpperCase().includes(mon))
          .reduce((acc: number, v: any) => {
            const ag = agList.find(
              (a: any) =>
                cleanAgencyName(a.nombre_agencia) === cleanAgencyName(v.agencia) ||
                String(a.nombre_agencia || '').trim().toUpperCase() === String(v.agencia || '').trim().toUpperCase()
            );
            const { partPct } = ag ? getAgencyCommissionAndParticipation(ag, v.sistema, mon) : { partPct: 0 };
            const n = Number(v.neto ?? v.util_op ?? 0);
            const partMonto = partPct > 0 ? Math.round(n * (partPct / 100) * 100) / 100 : Number(v.util_ag || 0);
            return acc + (n - partMonto);
          }, 0);

        // Gastos operativos confirmados
        const gTot = gastosList
          .filter((g) => g.moneda === mon && Boolean(g.confirmado))
          .reduce((acc: number, g) => acc + (Number(g.monto) || 0), 0);

        // Cobros ordinarios (Bancos, Efectivo Taquilla, Cobradores QR)
        const pCobros = pagosList
          .filter((p) => p.moneda === mon && Boolean(p.confirmado) && !p.tipo_pago.includes('Premio'))
          .reduce((acc: number, p) => acc + Number(p.monto || 0), 0);

        // Reposición de Premios de la operadora
        const pPremios = pagosList
          .filter((p) => p.moneda === mon && Boolean(p.confirmado) && p.tipo_pago.includes('Premio'))
          .reduce((acc: number, p) => acc + Number(p.monto || 0), 0);

        const gAdm = adminTotals[mon] || 0;
        const pNeto = pCobros - pPremios;
        const bFinal = Math.round((saldoAnt + vTot - gTot - gAdm - pCobros + pPremios) * 100) / 100;

        balancesMap[mon] = {
          moneda: mon,
          saldoAnterior: saldoAnt,
          ventasSemana: vTot,
          gastosSemana: gTot + gAdm,
          gastosAgencias: gTot,
          gastosComercializadora: gAdm,
          totalCobros: pCobros,
          reposicionPremios: pPremios,
          pagosSemana: pNeto,
          balanceFinal: bFinal,
        };
      });

      setBalancesByCurrency(balancesMap);

      // 5. Liquidación y Saldos de Casas Operadoras (Proveedores)
      const rawOperatorPayments: OperatorPayment[] = (payRes.data || []).map((p: any) => {
        let sysName = '';
        if (p.agencia && p.agencia.toUpperCase().startsWith('OPERADORA:')) {
          sysName = p.agencia.replace(/^OPERADORA:\s*/i, '').trim().toUpperCase();
        } else {
          sysName = String(p.sistema || p.agencia || '').trim().toUpperCase();
        }
        return {
          id: p.id,
          fecha: p.fecha || new Date().toISOString().slice(0, 10),
          sistema: sysName,
          moneda: String(p.moneda || 'BS').toUpperCase(),
          monto: Number(p.monto || 0),
          referencia: p.referencia || 'S/R',
          tipo_pago: (p.tipo_pago === 'ABONO_OPERADORA' ? 'ABONO_OPERADORA' : 'PAGO_OPERADORA') as any,
          banco: p.banco || p.metodo,
          agencia: p.agencia,
        };
      });

      const sysList = Array.from(new Set([
        ...(sysRes.data?.map((s) => s.nombre_sistema?.toUpperCase()) || []),
        ...(ventasList.map((s: any) => String(s.sistema || '').toUpperCase()).filter(Boolean)),
        ...Object.keys(confs).map((k) => k.toUpperCase())
      ])).sort();

      const opCalc = calculateOperatorSettlements(
        sysList,
        confs,
        ventasList,
        rawOperatorPayments,
        'ALL'
      );

      setOperatorRows(opCalc.rows);
      setOperatorTotalsByCurrency(opCalc.totalsByCurrency);
    } catch (err) {
      console.error('Error loading dashboard:', err);
    } finally {
      setLoading(false);
    }
  }, [effectiveUserId, systemCycle?.desde, systemCycle?.hasta]);

  useEffect(() => {
    loadDashboardData();

    const handleFocus = () => {
      loadDashboardData();
    };

    window.addEventListener('focus', handleFocus);
    return () => {
      window.removeEventListener('focus', handleFocus);
    };
  }, [loadDashboardData]);

  const usoAgenciasPct = Math.min(100, Math.round((totalAgencias / (limiteAgencias || 1)) * 100));

  return (
    <div className="space-y-6">
      {/* Top Banner: Welcome + Cycle Info */}
      <div className="bg-gradient-to-r from-[#0D1B22] via-[#0F242C] to-[#0D1B22] border border-slate-800 rounded-3xl p-6 shadow-xl relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold">
              <Sparkles className="w-3.5 h-3.5" />
              <span>SaaS {planName} • Conectado</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
              Bienvenido al Panel de Control Maestro
            </h2>
            <p className="text-xs text-slate-400">
              Operadora: <span className="text-slate-200 font-bold">{bancaNombre}</span>
            </p>
          </div>

          <div className="flex items-center gap-3">
            {systemCycle && (
              <div className="bg-[#071217]/90 border border-slate-800 p-3 rounded-2xl text-right">
                <div className="text-[10px] uppercase tracking-wider font-bold text-slate-400 flex items-center justify-end gap-1">
                  <Calendar className="w-3 h-3 text-emerald-400" />
                  <span>Semana {systemCycle.semana} ({systemCycle.tipo})</span>
                </div>
                <div className="text-xs font-mono font-bold text-white mt-0.5">
                  {formatDate(systemCycle.desde)} al {formatDate(systemCycle.hasta)}
                </div>
              </div>
            )}

            <button
              onClick={loadDashboardData}
              disabled={loading}
              className="p-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
              title="Actualizar datos"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-emerald-400' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* 4 KPI Top Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Agencias y Límite */}
        <div
          onClick={() => onNavigate('Agencias')}
          className="bg-[#0D1B22] border border-slate-800/80 rounded-2xl p-4 shadow-sm hover:border-emerald-500/40 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Agencias Registradas</span>
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 group-hover:scale-110 transition-transform">
              <Store className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-white font-mono">
            {totalAgencias} <span className="text-xs font-normal text-slate-400 font-sans">/ {limiteAgencias} max</span>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                style={{ width: `${usoAgenciasPct}%` }}
              />
            </div>
            <span className="text-[10px] font-bold text-slate-400">{usoAgenciasPct}%</span>
          </div>
        </div>

        {/* Card 2: Confirmaciones Pendientes */}
        <div
          onClick={() => onNavigate('Confirmaciones')}
          className="bg-[#0D1B22] border border-slate-800/80 rounded-2xl p-4 shadow-sm hover:border-amber-500/40 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Por Confirmar</span>
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 group-hover:scale-110 transition-transform">
              <CheckSquare className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-amber-400 font-mono">
            {pendientesPizarra}
          </div>
          <p className="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
            <span>Transferencias y pagos pendientes</span>
            <ArrowUpRight className="w-3 h-3 text-amber-400" />
          </p>
        </div>

        {/* Card 3: Cobradores en Calle */}
        <div
          onClick={() => onNavigate('Cobradores')}
          className="bg-[#0D1B22] border border-slate-800/80 rounded-2xl p-4 shadow-sm hover:border-sky-500/40 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Cobradores en Ruta</span>
            <div className="p-2 rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20 group-hover:scale-110 transition-transform">
              <Bike className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-sky-400 font-mono">
            {cobradoresActivos} <span className="text-xs font-normal text-slate-400 font-sans">activos</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            Rutas de cobro operativas
          </p>
        </div>

        {/* Card 4: Efectivo por Liquidar en Ruta */}
        <div
          onClick={() => onNavigate('Cobradores')}
          className="bg-[#0D1B22] border border-slate-800/80 rounded-2xl p-4 shadow-sm hover:border-teal-500/40 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Efectivo en Ruta</span>
            <div className="p-2 rounded-xl bg-teal-500/10 text-teal-400 border border-teal-500/20 group-hover:scale-110 transition-transform">
              <Coins className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-black text-teal-300 font-mono truncate">
            {formatCurrency(montoEnRuta, 'USD')}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            Pendiente de ingreso a caja central
          </p>
        </div>
      </div>

      {/* Multicurrency Balances Section */}
      <div className="bg-[#0D1B22] border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-extrabold text-white flex items-center gap-2">
              <span>💰</span>
              <span>Estado Financiero Consolidado por Moneda</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Fórmula: Saldo Arrastre + Utilidad Ciclo - Gastos Agencias - Gastos Comercializadora - Cobros + Reposición Premios = Balance Final
            </p>
          </div>
          <button
            onClick={() => onNavigate('Saldo Agencias')}
            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <span>Ver Detalle de Agencias</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
          {['BS', 'USD', 'COP'].map((mon) => {
            const b = balancesByCurrency[mon] || {
              moneda: mon,
              saldoAnterior: 0,
              ventasSemana: 0,
              gastosSemana: 0,
              gastosAgencias: 0,
              gastosComercializadora: 0,
              totalCobros: 0,
              reposicionPremios: 0,
              pagosSemana: 0,
              balanceFinal: 0,
            };

            const isPositive = b.balanceFinal > 0;
            const isZero = Math.abs(b.balanceFinal) < 0.05;

            return (
              <div
                key={mon}
                className="bg-[#071217] border border-slate-800/80 rounded-2xl p-4 space-y-3"
              >
                <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                  <span className="text-xs font-black tracking-wider text-slate-300">
                    {mon === 'BS' ? '🇻🇪 BOLÍVARES (BS)' : mon === 'USD' ? '🇺🇸 DÓLARES (USD)' : '🇨🇴 PESOS (COP)'}
                  </span>
                  <span
                    className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                      isZero
                        ? 'bg-slate-800 text-slate-400'
                        : isPositive
                        ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                        : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    }`}
                  >
                    {isZero ? 'AL DÍA' : isPositive ? 'CARTERA PENDIENTE' : 'SALDO A FAVOR'}
                  </span>
                </div>

                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between text-slate-400">
                    <span>Saldo Arrastre:</span>
                    <span className="font-mono text-slate-300">{formatCurrency(b.saldoAnterior, mon)}</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Utilidad Ciclo (+):</span>
                    <span className={`font-mono ${b.ventasSemana >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {formatCurrency(b.ventasSemana, mon)}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Gastos Agencias (-):</span>
                    <span className="font-mono text-rose-400">{formatCurrency(b.gastosAgencias ?? b.gastosSemana, mon)}</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Gastos Comercializadora (-):</span>
                    <span className="font-mono text-rose-400">{formatCurrency(b.gastosComercializadora || 0, mon)}</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Cobros Ordinarios (-):</span>
                    <span className="font-mono text-sky-400">{formatCurrency(b.totalCobros, mon)}</span>
                  </div>
                  {b.reposicionPremios > 0 && (
                    <div className="flex justify-between text-slate-400">
                      <span>Reposición Premios (+):</span>
                      <span className="font-mono text-amber-400 font-bold">+{formatCurrency(b.reposicionPremios, mon)}</span>
                    </div>
                  )}
                </div>

                <div className="pt-2.5 border-t border-slate-800/80 flex items-center justify-between">
                  <span className="text-xs font-bold text-white">Balance Final:</span>
                  <span
                    className={`text-base font-black font-mono ${
                      isZero ? 'text-slate-400' : isPositive ? 'text-rose-400' : 'text-emerald-400'
                    }`}
                  >
                    {formatCurrency(b.balanceFinal, mon)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 5. Liquidación y Saldos a Casas Operadoras (Proveedores) */}
      <div className="bg-[#0D1B22] border border-slate-800 rounded-3xl p-6 shadow-xl space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-4">
          <div>
            <h3 className="text-base font-extrabold text-white flex items-center gap-2">
              <span>🏛️</span>
              <span>Saldos y Liquidación a Casas Operadoras (Proveedores)</span>
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Fórmula Modelo Dual (40% Comercializador / 60% Casa Matriz): Arrastre Inicial + Utilidad Casa - Pagos Netos = Balance Final a Casas
            </p>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
            <button
              onClick={() => onNavigate('Reporte Proveedores')}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <span>Reporte Proveedores</span>
              <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
            </button>
            <button
              onClick={() => onNavigate('Cierre ')}
              className="px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <span>Centro de Cierre</span>
              <ArrowUpRight className="w-3.5 h-3.5 text-amber-300" />
            </button>
          </div>
        </div>

        {/* Currency Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
          {['BS', 'USD', 'COP'].map((mon) => {
            const tot = operatorTotalsByCurrency[mon] || {
              venta: 0,
              premios: 0,
              ggr: 0,
              comCompletaProv: 0,
              comAgencias: 0,
              difCom: 0,
              baseUtil: 0,
              partCom: 0,
              totalCom: 0,
              totalComercializador: 0,
              netoOperadora: 0,
              saldoInit: 0,
              pagosRealizados: 0,
              abonosRecibidos: 0,
              pagosNetos: 0,
              balanceFinal: 0,
              count: 0,
            };

            const isDeuda = tot.balanceFinal > 0.05;
            const isAFavor = tot.balanceFinal < -0.05;
            const isAlDia = !isDeuda && !isAFavor;

            return (
              <div
                key={mon}
                className="bg-[#071217] border border-slate-800/80 rounded-2xl p-4 space-y-3 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-black tracking-wider text-slate-300">
                        {mon === 'BS' ? '🇻🇪 BOLÍVARES (BS)' : mon === 'USD' ? '🇺🇸 DÓLARES (USD)' : '🇨🇴 PESOS (COP)'}
                      </span>
                      <span className="text-[10px] text-slate-400 font-medium">
                        ({tot.count} {tot.count === 1 ? 'activa' : 'activas'})
                      </span>
                    </div>
                    <span
                      className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                        isAlDia
                          ? 'bg-slate-800 text-slate-400'
                          : isDeuda
                          ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                          : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      }`}
                    >
                      {isAlDia ? 'AL DÍA' : isDeuda ? 'DEUDA A PAGAR' : 'A FAVOR COMERCIALIZADOR'}
                    </span>
                  </div>

                  <div className="space-y-1.5 text-xs pt-2">
                    <div className="flex justify-between text-slate-400">
                      <span>Arrastre Inicial:</span>
                      <span className="font-mono text-slate-300">{formatCurrency(tot.saldoInit, mon)}</span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>Venta Bruta:</span>
                      <span className="font-mono text-slate-300">{formatCurrency(tot.venta, mon)}</span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>Premios Pagados (-):</span>
                      <span className="font-mono text-rose-400">
                        {tot.premios > 0 ? `-${formatCurrency(tot.premios, mon)}` : formatCurrency(0, mon)}
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>Utilidad Bruta (GGR):</span>
                      <span className={`font-mono ${tot.ggr >= 0 ? 'text-slate-300' : 'text-rose-400'}`}>
                        {formatCurrency(tot.ggr, mon)}
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-400 pt-1 border-t border-slate-800/60">
                      <span className="text-emerald-400/90 font-medium">Ganancia Comercializador (+):</span>
                      <span className="font-mono text-emerald-400 font-bold">
                        +{formatCurrency(tot.totalComercializador, mon)}
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span className="text-rose-400/90 font-medium">Gastos Administrativos (-):</span>
                      <span className="font-mono text-rose-400 font-bold">
                        {(adminExpensesByCurrency[mon] || 0) > 0 ? `-${formatCurrency(adminExpensesByCurrency[mon] || 0, mon)}` : formatCurrency(0, mon)}
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-200 font-bold bg-slate-900/60 p-1.5 rounded-lg border border-slate-800/80">
                      <span className="text-[11px] text-slate-300">Utilidad Neta Real:</span>
                      <span className={`font-mono text-xs ${tot.totalComercializador - (adminExpensesByCurrency[mon] || 0) >= 0 ? 'text-emerald-300 font-black' : 'text-rose-400 font-black'}`}>
                        {formatCurrency(tot.totalComercializador - (adminExpensesByCurrency[mon] || 0), mon)}
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-400 pt-1 border-t border-slate-800/60">
                      <span className="text-sky-400/90 font-medium">Utilidad Casa Matriz (60%):</span>
                      <span className="font-mono text-sky-400 font-bold">
                        {formatCurrency(tot.netoOperadora, mon)}
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>Pagos Netos Realizados (-):</span>
                      <span className="font-mono text-amber-400">
                        {tot.pagosNetos !== 0 ? `-${formatCurrency(tot.pagosNetos, mon)}` : formatCurrency(0, mon)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="pt-2.5 border-t border-slate-800/80 flex items-center justify-between">
                  <span className="text-xs font-bold text-white">Balance Final a Casas:</span>
                  <span
                    className={`text-base font-black font-mono ${
                      isAlDia ? 'text-slate-400' : isDeuda ? 'text-rose-400' : 'text-emerald-400'
                    }`}
                  >
                    {formatCurrency(tot.balanceFinal, mon)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Detailed Operators Table */}
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <span>📋</span>
              <span>Desglose por Casa Operadora Activa ({operatorRows.length})</span>
            </h4>
            <span className="text-[11px] text-slate-500">
              Arqueo auditado en tiempo real
            </span>
          </div>

          {operatorRows.length === 0 ? (
            <div className="bg-[#071217] border border-slate-800/60 rounded-2xl p-6 text-center text-slate-400 text-xs">
              No hay movimientos ni saldos pendientes de casas operadoras para este ciclo.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-800/80 bg-[#071217]">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-[11px] uppercase tracking-wider text-slate-400 bg-slate-900/60">
                    <th className="py-2.5 px-3 font-bold">Sistema / Operadora</th>
                    <th className="py-2.5 px-2 font-bold text-center">Moneda</th>
                    <th className="py-2.5 px-3 font-bold text-right">Arrastre</th>
                    <th className="py-2.5 px-3 font-bold text-right">Venta Bruta</th>
                    <th className="py-2.5 px-3 font-bold text-right">Premios</th>
                    <th className="py-2.5 px-3 font-bold text-right text-emerald-400">Ganancia Com.</th>
                    <th className="py-2.5 px-3 font-bold text-right text-sky-400">Casa (60%)</th>
                    <th className="py-2.5 px-3 font-bold text-right text-amber-400">Pagos Netos</th>
                    <th className="py-2.5 px-3 font-bold text-right text-white">Balance Final</th>
                    <th className="py-2.5 px-3 font-bold text-center">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {operatorRows.map((row) => {
                    const isRowDeuda = row.balanceFinal > 0.05;
                    const isRowAFavor = row.balanceFinal < -0.05;
                    const isRowAlDia = !isRowDeuda && !isRowAFavor;

                    return (
                      <tr key={`${row.sistema}-${row.moneda}`} className="hover:bg-slate-800/30 transition-colors">
                        <td className="py-2.5 px-3 font-bold text-white flex items-center gap-2">
                          <Building2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          <span>{row.sistema}</span>
                        </td>
                        <td className="py-2.5 px-2 text-center">
                          <span
                            className={`text-[10px] font-black px-1.5 py-0.5 rounded ${
                              row.moneda === 'BS'
                                ? 'bg-amber-500/10 text-amber-300 border border-amber-500/20'
                                : row.moneda === 'USD'
                                ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'
                                : 'bg-sky-500/10 text-sky-300 border border-sky-500/20'
                            }`}
                          >
                            {row.moneda}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-slate-300">
                          {formatCurrency(row.saldoInit, row.moneda)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-slate-300">
                          {formatCurrency(row.venta, row.moneda)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-rose-400">
                          {row.premio > 0 ? `-${formatCurrency(row.premio, row.moneda)}` : formatCurrency(0, row.moneda)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-emerald-400 font-semibold">
                          +{formatCurrency(row.totalComercializador, row.moneda)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-sky-400 font-semibold">
                          {formatCurrency(row.netoOperadora, row.moneda)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-amber-400">
                          {row.pagosNetos !== 0 ? `-${formatCurrency(row.pagosNetos, row.moneda)}` : formatCurrency(0, row.moneda)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold">
                          <span className={isRowAlDia ? 'text-slate-400' : isRowDeuda ? 'text-rose-400' : 'text-emerald-400'}>
                            {formatCurrency(row.balanceFinal, row.moneda)}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span
                            className={`text-[9px] font-black px-2 py-0.5 rounded-full whitespace-nowrap ${
                              isRowAlDia
                                ? 'bg-slate-800 text-slate-400'
                                : isRowDeuda
                                ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                                : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            }`}
                          >
                            {isRowAlDia ? 'AL DÍA' : isRowDeuda ? 'A PAGAR' : 'A FAVOR'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
