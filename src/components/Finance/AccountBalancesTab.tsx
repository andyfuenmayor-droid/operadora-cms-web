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
  FileText,
  RefreshCw,
  Share2,
  Building2,
  DollarSign,
  TrendingUp,
  CreditCard,
  Banknote,
  Search,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  LayoutGrid,
  List,
  ChevronRight
} from 'lucide-react';

const WhatsAppIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z" />
  </svg>
);

interface BalanceRow {
  id: number;
  agencia: string;
  saldo_arrastre: number;
  utilidad_semana: number;
  gastos: number;
  pagos: number;
  reposicion_premios?: number;
  balance_final: number;
  status: 'pagado' | 'pendiente' | 'favor';
}

export const AccountBalancesTab: React.FC = () => {
  const { effectiveUserId, systemCycle } = useAuth();

  const [isLoading, setIsLoading] = useState(true);
  const [activeCurrency, setActiveCurrency] = useState<'BS' | 'USD' | 'COP'>('USD');
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [sales, setSales] = useState<any[]>([]);
  const [payments, setPayments] = useState<ConsolidatedPaymentItem[]>([]);
  const [expenses, setExpenses] = useState<ConsolidatedExpenseItem[]>([]);

  const [searchQuery, setSearchQuery] = useState('');
  const [detailModalAgency, setDetailModalAgency] = useState<string | null>(null);

  // Mobile / Desktop View Mode (cards or table)
  const [viewMode, setViewMode] = useState<'cards' | 'table'>(() =>
    typeof window !== 'undefined' && window.innerWidth >= 768 ? 'table' : 'cards'
  );
  const [statusFilter, setStatusFilter] = useState<'all' | 'pendiente' | 'favor' | 'pagado'>('all');

  const loadData = async () => {
    if (!effectiveUserId) return;
    setIsLoading(true);

    try {
      const [agRes, sRes, pConsolidated, gConsolidated] = await Promise.all([
        supabase.from('agencias').select('*').eq('user_id', effectiveUserId).order('id', { ascending: true }),
        supabase.from('carga_actual').select('*').eq('user_id', effectiveUserId),
        getConsolidatedPayments(effectiveUserId, { fechaDesde: systemCycle.desde, fechaHasta: systemCycle.hasta }),
        getConsolidatedExpenses(effectiveUserId, { fechaDesde: systemCycle.desde, fechaHasta: systemCycle.hasta }),
      ]);

      setAgencies(agRes.data || []);
      setSales(sRes.data || []);
      setPayments(pConsolidated);
      setExpenses(gConsolidated);
    } catch (err: any) {
      console.error('Error loading account balances data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [effectiveUserId]);

  // Compute balance rows for given currency
  const computeBalances = (mon: 'BS' | 'USD' | 'COP'): { rows: BalanceRow[]; totalDebt: number } => {
    let totalDebt = 0;
    const colInicial = mon === 'BS' ? 'saldo_inicial_bs' : mon === 'USD' ? 'saldo_inicial_usd' : 'saldo_inicial_cop';

    const rows: BalanceRow[] = [];

    agencies.forEach((ag) => {
      const nom = ag.nombre_agencia.trim().toUpperCase();
      const sAnt = Number(ag[colInicial] || 0);

      // Utilidad operativa de la semana
      const uOp = sales
        .filter((s) => s.agencia === nom && normalizarMoneda(s.moneda) === mon)
        .reduce((sum, curr) => sum + Number(curr.util_op || 0), 0);

      // Gastos
      const gTot = expenses
        .filter((g) => g.agencia === nom && normalizarMoneda(g.moneda) === mon)
        .reduce((sum, curr) => sum + Number(curr.monto || 0), 0);

      // Pagos ordinarios recibidos de la agencia (reducen la deuda)
      const pCobros = payments
        .filter((p) => p.agencia === nom && normalizarMoneda(p.moneda) === mon && !String(p.tipo_pago || '').toUpperCase().includes('PREMIO'))
        .reduce((sum, curr) => sum + Number(curr.monto || 0), 0);

      // Reposición de premios pagados por la operadora a la agencia
      const pPremios = payments
        .filter((p) => p.agencia === nom && normalizarMoneda(p.moneda) === mon && String(p.tipo_pago || '').toUpperCase().includes('PREMIO'))
        .reduce((sum, curr) => sum + Number(curr.monto || 0), 0);

      // Pagos netos (PAGOS - PREMIOS)
      const pTot = pCobros - pPremios;

      // Formula: (sAnt + uOp) - gTot - pTot
      const balanceFinal = Math.round(((sAnt + uOp) - gTot - pTot) * 100) / 100;
      totalDebt += balanceFinal;

      let status: 'pagado' | 'pendiente' | 'favor' = 'pagado';
      if (Math.abs(balanceFinal) < 0.1) status = 'pagado';
      else if (balanceFinal > 0) status = 'pendiente';
      else status = 'favor';

      rows.push({
        id: ag.id,
        agencia: nom,
        saldo_arrastre: Math.round(sAnt * 100) / 100,
        utilidad_semana: Math.round(uOp * 100) / 100,
        gastos: Math.round(gTot * 100) / 100,
        pagos: Math.round(pTot * 100) / 100,
        reposicion_premios: Math.round(pPremios * 100) / 100,
        balance_final: balanceFinal,
        status,
      });
    });

    return { rows, totalDebt: Math.round(totalDebt * 100) / 100 };
  };

  const activeBalances = useMemo(() => {
    return computeBalances(activeCurrency);
  }, [agencies, sales, payments, expenses, activeCurrency]);

  // Status metrics counts
  const statusCounts = useMemo(() => {
    let pendientes = 0;
    let pagados = 0;
    let favor = 0;
    activeBalances.rows.forEach((r) => {
      if (r.status === 'pendiente') pendientes++;
      else if (r.status === 'pagado') pagados++;
      else if (r.status === 'favor') favor++;
    });
    return { all: activeBalances.rows.length, pendiente: pendientes, pagado: pagados, favor };
  }, [activeBalances.rows]);

  // Filtered rows for active currency
  const filteredRows = useMemo(() => {
    let list = activeBalances.rows;
    if (statusFilter !== 'all') {
      list = list.filter((r) => r.status === statusFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((r) => r.agencia.toLowerCase().includes(q));
    }
    return list;
  }, [activeBalances.rows, statusFilter, searchQuery]);

  // Generate Master WhatsApp Report URL
  const generateWhatsAppUrl = () => {
    const ahora = new Date().toLocaleString('es-VE');
    let reportTxt = `📑 *REPORTE DE AGENCIAS CONSOLIDADO*\n📅 ${ahora}\n\n`;

    ['BS', 'USD', 'COP'].forEach((mon) => {
      const { rows } = computeBalances(mon as any);
      const withBalance = rows.filter((r) => Math.abs(r.balance_final) > 0.1);

      if (withBalance.length > 0) {
        reportTxt += `💰 *SALDOS EN ${mon}:*\n`;
        withBalance.forEach((r) => {
          const icon = r.balance_final > 0 ? '🚩' : '✅';
          reportTxt += `${icon} *${r.agencia}*: ${formatCurrency(r.balance_final, mon as any)}\n`;
        });
        reportTxt += `━━━━━━━━━━━━━━━━━━\n`;
      }
    });

    return `https://wa.me/?text=${encodeURIComponent(reportTxt)}`;
  };

  // Generate individual agency WhatsApp account balance message
  const generateAgencyWhatsAppUrl = (r: BalanceRow) => {
    const cycleRange = (systemCycle?.desde && systemCycle?.hasta)
      ? `📅 *Período:* ${systemCycle.desde} al ${systemCycle.hasta}\n`
      : '';
    const semana = systemCycle?.semana ? `🗓️ *Semana:* #${systemCycle.semana}\n` : '';

    let statusMsg = '';
    if (r.status === 'pendiente') {
      statusMsg = `⚠️ *ESTADO: PENDIENTE POR COBRAR*\nFavor gestionar la cancelación de este saldo a la brevedad.`;
    } else if (r.status === 'favor') {
      statusMsg = `🔵 *ESTADO: SALDO A FAVOR DE LA AGENCIA*\nEste monto queda a su favor acumulado para el próximo ciclo.`;
    } else {
      statusMsg = `✅ *ESTADO: SOLVENTE / PAGADO*\n¡Muchas gracias por su puntualidad!`;
    }

    const reposicionTxt = (r.reposicion_premios && r.reposicion_premios > 0)
      ? `   ↳ _(incluye reposición premios: ${formatCurrency(r.reposicion_premios, activeCurrency)})_\n`
      : '';

    const text =
`🏢 *ESTADO DE CUENTA - ${r.agencia}*
${semana}${cycleRange}💰 *Moneda:* ${activeCurrency}
━━━━━━━━━━━━━━━━━━━━
▫️ *Saldo Arrastre:* ${formatCurrency(r.saldo_arrastre, activeCurrency)}
▫️ *Semana (Utilidad):* ${formatCurrency(r.utilidad_semana, activeCurrency)}
▫️ *Gastos Ag.:* ${formatCurrency(r.gastos, activeCurrency)}
▫️ *Pagos Realizados:* ${formatCurrency(r.pagos, activeCurrency)}
${reposicionTxt}━━━━━━━━━━━━━━━━━━━━
💵 *BALANCE FINAL:* *${formatCurrency(r.balance_final, activeCurrency)}*
━━━━━━━━━━━━━━━━━━━━
${statusMsg}

_Generado automáticamente por Sistema Operadora Taquilla_`;

    return `https://wa.me/?text=${encodeURIComponent(text)}`;
  };

  // Selected agency row for detail modal
  const selectedAgencyRow = useMemo(() => {
    if (!detailModalAgency) return null;
    return activeBalances.rows.find((r) => r.agencia === detailModalAgency) || null;
  }, [detailModalAgency, activeBalances.rows]);

  // Detailed movements for an individual agency (Modal)
  const detailMovements = useMemo(() => {
    if (!detailModalAgency) return null;
    const agName = detailModalAgency;

    const agSales = sales.filter((s) => s.agencia === agName && normalizarMoneda(s.moneda) === activeCurrency);
    const agPayments = payments.filter((p) => p.agencia === agName && normalizarMoneda(p.moneda) === activeCurrency);
    const agExpenses = expenses.filter((e) => e.agencia === agName && normalizarMoneda(e.moneda) === activeCurrency);

    return {
      agencia: agName,
      sales: agSales,
      payments: agPayments,
      expenses: agExpenses,
    };
  }, [detailModalAgency, sales, payments, expenses, activeCurrency]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2">
            <span className="p-2 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
              <FileText className="w-5 h-5" />
            </span>
            Estado de Cuenta por Agencia
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Fórmula: (Saldo Arrastre + Utilidad Semanal) - Gastos - Pagos = Balance Final.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => loadData()}
            disabled={isLoading}
            className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex items-center gap-1.5 transition-all border border-slate-700 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            Actualizar
          </button>

          <a
            href={generateWhatsAppUrl()}
            target="_blank"
            rel="noreferrer"
            className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow-lg shadow-emerald-600/20 flex items-center gap-2 transition-all"
          >
            <Share2 className="w-4 h-4" />
            Enviar Reporte WhatsApp
          </a>
        </div>
      </div>

      {/* Currency Switcher & Total Cartera Metric */}
      <div className="bg-[#0D1B22] border border-slate-800 rounded-3xl p-4 sm:p-6 shadow-xl flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 sm:gap-6">
        {/* Currency Tabs (3 columns on mobile, flex on desktop) */}
        <div className="grid grid-cols-3 sm:flex items-center gap-1.5 sm:gap-2 bg-[#071217] p-1.5 rounded-2xl border border-slate-800 w-full sm:w-auto">
          <button
            onClick={() => setActiveCurrency('BS')}
            className={`px-3 sm:px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer text-center ${
              activeCurrency === 'BS'
                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30 shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            🇻🇪 BS
          </button>

          <button
            onClick={() => setActiveCurrency('USD')}
            className={`px-3 sm:px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer text-center ${
              activeCurrency === 'USD'
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            💵 USD
          </button>

          <button
            onClick={() => setActiveCurrency('COP')}
            className={`px-3 sm:px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer text-center ${
              activeCurrency === 'COP'
                ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            🇨🇴 COP
          </button>
        </div>

        {/* Cartera Total Metric */}
        <div className="text-center md:text-right bg-[#071217]/60 md:bg-transparent p-3 md:p-0 rounded-2xl border border-slate-800/60 md:border-0">
          <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
            Cartera Total Pendiente ({activeCurrency})
          </span>
          <span
            className={`text-xl sm:text-2xl md:text-3xl font-black font-mono mt-0.5 block ${
              activeBalances.totalDebt > 0
                ? 'text-rose-400'
                : activeBalances.totalDebt < 0
                ? 'text-cyan-400'
                : 'text-emerald-400'
            }`}
          >
            {formatCurrency(activeBalances.totalDebt, activeCurrency)}
          </span>
        </div>
      </div>

      {/* Controls Bar: Search + Status Chips + View Toggle */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar agencia por nombre..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#0D1B22] border border-slate-800 rounded-2xl pl-9 pr-4 py-2.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-purple-500 transition-colors"
            />
          </div>

          {/* View Toggle (Cards vs Table) */}
          <div className="flex items-center gap-1 bg-[#071217] p-1 rounded-2xl border border-slate-800 self-end sm:self-auto shrink-0">
            <button
              onClick={() => setViewMode('cards')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                viewMode === 'cards'
                  ? 'bg-purple-600/30 text-purple-300 border border-purple-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Tarjetas</span>
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                viewMode === 'table'
                  ? 'bg-purple-600/30 text-purple-300 border border-purple-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              <span>Tabla</span>
            </button>
          </div>
        </div>

        {/* Status Filter Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
              statusFilter === 'all'
                ? 'bg-slate-700 text-white shadow'
                : 'bg-[#0D1B22] text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            Todas ({statusCounts.all})
          </button>
          <button
            onClick={() => setStatusFilter('pendiente')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
              statusFilter === 'pendiente'
                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow'
                : 'bg-[#0D1B22] text-rose-400/90 hover:text-rose-300 border border-slate-800'
            }`}
          >
            🔴 Pendientes ({statusCounts.pendiente})
          </button>
          <button
            onClick={() => setStatusFilter('favor')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
              statusFilter === 'favor'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow'
                : 'bg-[#0D1B22] text-cyan-400/90 hover:text-cyan-300 border border-slate-800'
            }`}
          >
            🔵 A Favor ({statusCounts.favor})
          </button>
          <button
            onClick={() => setStatusFilter('pagado')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
              statusFilter === 'pagado'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow'
                : 'bg-[#0D1B22] text-emerald-400/90 hover:text-emerald-300 border border-slate-800'
            }`}
          >
            🟢 Pagadas ({statusCounts.pagado})
          </button>
        </div>
      </div>

      {/* =========================================================================
          VIEW MODE 1: MODERN MOBILE / RESPONSIVE CARDS
      ========================================================================= */}
      {viewMode === 'cards' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-400 px-1">
            <span>Mostrando <strong>{filteredRows.length}</strong> agencias en <strong>{activeCurrency}</strong></span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {filteredRows.map((r) => (
              <div
                key={r.id}
                onClick={() => setDetailModalAgency(r.agencia)}
                className="bg-[#0D1B22] hover:bg-[#10222b] border border-slate-800 hover:border-slate-700/80 rounded-2xl p-4 shadow-xl active:scale-[0.99] transition-all cursor-pointer space-y-3 relative overflow-hidden group"
              >
                {/* Agency Name & Status Badge */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-6 h-6 rounded-lg bg-slate-800/90 border border-slate-700/70 flex items-center justify-center text-slate-300 font-mono text-[11px] font-bold shrink-0">
                      {r.id}
                    </span>
                    <h3 className="font-bold text-white text-sm truncate group-hover:text-purple-300 transition-colors">
                      {r.agencia}
                    </h3>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {r.status === 'pagado' && (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 text-[10px] font-bold border border-emerald-500/30 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                        PAGADO
                      </span>
                    )}
                    {r.status === 'pendiente' && (
                      <span className="px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-400 text-[10px] font-bold border border-rose-500/30 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse"></span>
                        PENDIENTE
                      </span>
                    )}
                    {r.status === 'favor' && (
                      <span className="px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-400 text-[10px] font-bold border border-cyan-500/30 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
                        A FAVOR
                      </span>
                    )}
                    <a
                      href={generateAgencyWhatsAppUrl(r)}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="p-1 rounded-lg bg-emerald-600/20 hover:bg-emerald-600 text-emerald-400 hover:text-white border border-emerald-500/30 transition-colors cursor-pointer"
                      title="Enviar Estado de Cuenta por WhatsApp"
                    >
                      <WhatsAppIcon className="w-4 h-4" />
                    </a>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDetailModalAgency(r.agencia);
                      }}
                      className="p-1 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
                      title="Ver detalle"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Hero Balance Box */}
                <div
                  className={`p-3 rounded-xl border flex items-center justify-between ${
                    r.status === 'pendiente'
                      ? 'bg-rose-500/10 border-rose-500/25 text-rose-400'
                      : r.status === 'favor'
                      ? 'bg-cyan-500/10 border-cyan-500/25 text-cyan-400'
                      : 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400'
                  }`}
                >
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Balance Final
                  </div>
                  <div className="text-lg sm:text-xl font-black font-mono tracking-tight">
                    {formatCurrency(r.balance_final, activeCurrency)}
                  </div>
                </div>

                {/* 4 Financial Items Grid */}
                <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                  <div className="bg-[#071217] p-2 rounded-xl border border-slate-800/80">
                    <span className="text-[10px] font-sans text-slate-400 block">Saldo Arrastre</span>
                    <span className="text-slate-200 font-semibold text-xs truncate block">
                      {formatCurrency(r.saldo_arrastre, activeCurrency)}
                    </span>
                  </div>

                  <div className="bg-[#071217] p-2 rounded-xl border border-slate-800/80">
                    <span className="text-[10px] font-sans text-slate-400 block">Semana (Utilidad)</span>
                    <span className="text-emerald-400 font-semibold text-xs truncate block">
                      {formatCurrency(r.utilidad_semana, activeCurrency)}
                    </span>
                  </div>

                  <div className="bg-[#071217] p-2 rounded-xl border border-slate-800/80">
                    <span className="text-[10px] font-sans text-slate-400 block">Gastos (-)</span>
                    <span className="text-rose-400 font-semibold text-xs truncate block">
                      {formatCurrency(r.gastos, activeCurrency)}
                    </span>
                  </div>

                  <div className="bg-[#071217] p-2 rounded-xl border border-slate-800/80">
                    <span className="text-[10px] font-sans text-slate-400 block">Pagos (-)</span>
                    <span className="text-cyan-400 font-semibold text-xs truncate block">
                      {formatCurrency(r.pagos, activeCurrency)}
                    </span>
                    {Boolean(r.reposicion_premios && r.reposicion_premios > 0) && (
                      <span className="text-[9px] text-amber-400/90 font-sans block truncate mt-0.5">
                        (incl. {formatCurrency(r.reposicion_premios || 0, activeCurrency)} prem.)
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {filteredRows.length === 0 && (
            <div className="bg-[#0D1B22] border border-slate-800 rounded-3xl p-8 text-center text-slate-400 text-xs">
              No se encontraron agencias con los filtros aplicados.
            </div>
          )}
        </div>
      )}

      {/* =========================================================================
          VIEW MODE 2: DESKTOP / PINNED STICKY TABLE
      ========================================================================= */}
      {viewMode === 'table' && (
        <div className="bg-[#0D1B22] border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
          <div className="p-4 sm:p-6 border-b border-slate-800 flex items-center justify-between">
            <h4 className="text-sm font-bold text-white uppercase tracking-wider">
              Saldos y Balances en {activeCurrency} ({filteredRows.length})
            </h4>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#071217] text-slate-400 border-b border-slate-800 font-bold uppercase tracking-wider">
                <tr>
                  {/* Pinned Agency Column with shadow */}
                  <th className="py-3.5 px-4 sticky left-0 bg-[#071217] z-20 border-r border-slate-800 shadow-[2px_0_8px_-2px_rgba(0,0,0,0.6)]">
                    Agencia
                  </th>
                  <th className="py-3.5 px-4 text-right">Saldo Arrastre</th>
                  <th className="py-3.5 px-4 text-right">Semana (Utilidad)</th>
                  <th className="py-3.5 px-4 text-right">Gastos (-)</th>
                  <th className="py-3.5 px-4 text-right">Pagos (-)</th>
                  <th className="py-3.5 px-4 text-right">Balance Final</th>
                  <th className="py-3.5 px-4 text-center">Estatus</th>
                  <th className="py-3.5 px-4 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 font-mono">
                {filteredRows.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-800/30 transition-colors group">
                    {/* Pinned Agency Column with shadow */}
                    <td className="py-3.5 px-4 font-sans font-bold text-white sticky left-0 bg-[#0D1B22] group-hover:bg-[#12232c] z-10 border-r border-slate-800/80 shadow-[2px_0_8px_-2px_rgba(0,0,0,0.6)] whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-slate-500 font-mono">#{r.id}</span>
                        <span>{r.agencia}</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-right text-slate-400">{formatCurrency(r.saldo_arrastre, activeCurrency)}</td>
                    <td className="py-3.5 px-4 text-right text-emerald-400 font-semibold">{formatCurrency(r.utilidad_semana, activeCurrency)}</td>
                    <td className="py-3.5 px-4 text-right text-rose-400">{formatCurrency(r.gastos, activeCurrency)}</td>
                    <td className="py-3.5 px-4 text-right text-cyan-400">
                      <div>{formatCurrency(r.pagos, activeCurrency)}</div>
                      {Boolean(r.reposicion_premios && r.reposicion_premios > 0) && (
                        <span className="text-[10px] text-amber-400/90 font-sans block">
                          (incl. {formatCurrency(r.reposicion_premios || 0, activeCurrency)} premios)
                        </span>
                      )}
                    </td>
                    <td
                      className={`py-3.5 px-4 text-right font-black text-sm ${
                        r.status === 'pendiente'
                          ? 'text-rose-400'
                          : r.status === 'favor'
                          ? 'text-cyan-400'
                          : 'text-emerald-400'
                      }`}
                    >
                      {formatCurrency(r.balance_final, activeCurrency)}
                    </td>
                    <td className="py-3.5 px-4 text-center font-sans whitespace-nowrap">
                      {r.status === 'pagado' && (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 text-[10px] font-bold border border-emerald-500/30">
                          🟢 PAGADO
                        </span>
                      )}
                      {r.status === 'pendiente' && (
                        <span className="px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-400 text-[10px] font-bold border border-rose-500/30">
                          🔴 PENDIENTE
                        </span>
                      )}
                      {r.status === 'favor' && (
                        <span className="px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-400 text-[10px] font-bold border border-cyan-500/30">
                          🔵 A FAVOR
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => setDetailModalAgency(r.agencia)}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
                          title="Ver Detalle de la Agencia"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </button>
                        <a
                          href={generateAgencyWhatsAppUrl(r)}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600 text-emerald-400 hover:text-white border border-emerald-500/30 transition-all cursor-pointer"
                          title={`Enviar Estado de Cuenta de ${r.agencia} por WhatsApp`}
                        >
                          <WhatsAppIcon className="w-3.5 h-3.5 fill-current" />
                        </a>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =========================================================================
          INDIVIDUAL AGENCY DETAIL MODAL
      ========================================================================= */}
      {detailMovements && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-[#0D1B22] border border-slate-800 rounded-3xl p-5 sm:p-7 max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl animate-fade-in my-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 shrink-0">
              <div className="pr-2">
                <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-purple-400 shrink-0" />
                  <span>Estado de Cuenta: {detailMovements.agencia}</span>
                </h3>
                <p className="text-[11px] sm:text-xs text-slate-400 mt-0.5">
                  Desglose financiero consolidado, ventas, pagos y gastos en {activeCurrency}.
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {selectedAgencyRow && (
                  <a
                    href={generateAgencyWhatsAppUrl(selectedAgencyRow)}
                    target="_blank"
                    rel="noreferrer"
                    className="p-2 rounded-xl bg-emerald-600/20 hover:bg-emerald-600 text-emerald-400 hover:text-white border border-emerald-500/30 transition-all cursor-pointer hidden sm:flex items-center gap-1.5 text-xs font-bold"
                    title="Enviar Estado de Cuenta por WhatsApp"
                  >
                    <WhatsAppIcon className="w-4 h-4 fill-current" />
                    <span>WhatsApp</span>
                  </a>
                )}
                <button
                  onClick={() => setDetailModalAgency(null)}
                  className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center text-xs font-bold transition-colors shrink-0"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Scrollable contents */}
            <div className="overflow-y-auto space-y-4 py-3 pr-1 flex-1">
              {/* Financial Balance Summary Card */}
              {selectedAgencyRow && (
                <div className="bg-[#071217] border border-slate-800 rounded-2xl p-4 space-y-3 shrink-0">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                        Balance Final ({activeCurrency})
                      </span>
                      <div
                        className="text-xl sm:text-2xl font-black font-mono mt-0.5"
                        style={{
                          color:
                            selectedAgencyRow.status === 'pendiente'
                              ? '#f43f5e'
                              : selectedAgencyRow.status === 'favor'
                              ? '#22d3ee'
                              : '#10b981',
                        }}
                      >
                        {formatCurrency(selectedAgencyRow.balance_final, activeCurrency)}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {selectedAgencyRow.status === 'pagado' && (
                        <span className="px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-400 text-xs font-bold border border-emerald-500/30">
                          🟢 PAGADO
                        </span>
                      )}
                      {selectedAgencyRow.status === 'pendiente' && (
                        <span className="px-2.5 py-1 rounded-full bg-rose-500/15 text-rose-400 text-xs font-bold border border-rose-500/30 animate-pulse">
                          🔴 PENDIENTE
                        </span>
                      )}
                      {selectedAgencyRow.status === 'favor' && (
                        <span className="px-2.5 py-1 rounded-full bg-cyan-500/15 text-cyan-400 text-xs font-bold border border-cyan-500/30">
                          🔵 A FAVOR
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-xs">
                    <div className="bg-[#0D1B22] p-2.5 rounded-xl border border-slate-800/80">
                      <span className="text-[10px] font-sans text-slate-400 block">Saldo Arrastre</span>
                      <span className="text-slate-200 font-semibold truncate block">
                        {formatCurrency(selectedAgencyRow.saldo_arrastre, activeCurrency)}
                      </span>
                    </div>
                    <div className="bg-[#0D1B22] p-2.5 rounded-xl border border-slate-800/80">
                      <span className="text-[10px] font-sans text-slate-400 block">Semana (Utilidad)</span>
                      <span className="text-emerald-400 font-semibold truncate block">
                        {formatCurrency(selectedAgencyRow.utilidad_semana, activeCurrency)}
                      </span>
                    </div>
                    <div className="bg-[#0D1B22] p-2.5 rounded-xl border border-slate-800/80">
                      <span className="text-[10px] font-sans text-slate-400 block">Gastos (-)</span>
                      <span className="text-rose-400 font-semibold truncate block">
                        {formatCurrency(selectedAgencyRow.gastos, activeCurrency)}
                      </span>
                    </div>
                    <div className="bg-[#0D1B22] p-2.5 rounded-xl border border-slate-800/80">
                      <span className="text-[10px] font-sans text-slate-400 block">Pagos (-)</span>
                      <span className="text-cyan-400 font-semibold truncate block">
                        {formatCurrency(selectedAgencyRow.pagos, activeCurrency)}
                      </span>
                      {Boolean(selectedAgencyRow.reposicion_premios && selectedAgencyRow.reposicion_premios > 0) && (
                        <span className="text-[9px] text-amber-400/90 font-sans block truncate mt-0.5">
                          (incl. {formatCurrency(selectedAgencyRow.reposicion_premios || 0, activeCurrency)} prem.)
                        </span>
                      )}
                    </div>
                  </div>

                  <a
                    href={generateAgencyWhatsAppUrl(selectedAgencyRow)}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2 transition-all cursor-pointer"
                  >
                    <WhatsAppIcon className="w-4 h-4 fill-white" />
                    <span>Enviar Estado de Cuenta por WhatsApp</span>
                  </a>
                </div>
              )}

              {/* Sales List */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-bold uppercase text-slate-400 tracking-wider">
                  Ventas ({detailMovements.sales.length})
                </span>
                {detailMovements.sales.length === 0 ? (
                  <p className="text-xs text-slate-500 italic">No hay ventas registradas en {activeCurrency}.</p>
                ) : (
                  <div className="max-h-40 overflow-y-auto border border-slate-800 rounded-xl bg-[#071217] p-2 space-y-1 text-xs font-mono">
                    {detailMovements.sales.map((s) => (
                      <div key={s.id} className="flex justify-between items-center py-1 border-b border-slate-800/60 last:border-0 text-[11px] sm:text-xs">
                        <span className="truncate pr-2">{formatDate(s.fecha)} • {s.sistema}</span>
                        <span className="shrink-0 text-right">Venta: {formatCurrency(s.venta, s.moneda)} | <strong className="text-emerald-400">{formatCurrency(s.neto, s.moneda)}</strong></span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Payments List */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-bold uppercase text-slate-400 tracking-wider">
                  Pagos y Cobranzas ({detailMovements.payments.length})
                </span>
                {detailMovements.payments.length === 0 ? (
                  <p className="text-xs text-slate-500 italic">No hay pagos registrados en {activeCurrency}.</p>
                ) : (
                  <div className="max-h-40 overflow-y-auto border border-slate-800 rounded-xl bg-[#071217] p-2 space-y-1 text-xs font-mono">
                    {detailMovements.payments.map((p) => {
                      const isPremio = String(p.tipo_pago || '').toUpperCase().includes('PREMIO');
                      return (
                        <div key={p.id} className="flex justify-between items-center py-1.5 border-b border-slate-800/60 last:border-0 text-[11px] sm:text-xs">
                          <span className="truncate pr-2">
                            {formatDate(p.fecha)} • {p.metodo} ({p.referencia})
                            {isPremio && (
                              <span className="ml-1.5 px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[9px] font-sans font-semibold">
                                Reposición Premios
                              </span>
                            )}
                          </span>
                          <strong className={`shrink-0 ${isPremio ? 'text-amber-400' : 'text-cyan-400'}`}>
                            {isPremio ? '-' : ''}{formatCurrency(p.monto, p.moneda)}
                          </strong>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Expenses List */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-bold uppercase text-slate-400 tracking-wider">
                  Gastos ({detailMovements.expenses.length})
                </span>
                {detailMovements.expenses.length === 0 ? (
                  <p className="text-xs text-slate-500 italic">No hay gastos registrados en {activeCurrency}.</p>
                ) : (
                  <div className="max-h-40 overflow-y-auto border border-slate-800 rounded-xl bg-[#071217] p-2 space-y-1 text-xs font-mono">
                    {detailMovements.expenses.map((e) => (
                      <div key={e.id} className="flex justify-between items-center py-1 border-b border-slate-800/60 last:border-0 text-[11px] sm:text-xs">
                        <span className="truncate pr-2">{formatDate(e.fecha)} • {e.concepto}</span>
                        <strong className="text-rose-400 shrink-0">{formatCurrency(e.monto, e.moneda)}</strong>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-800 shrink-0 gap-2">
              {selectedAgencyRow && (
                <a
                  href={generateAgencyWhatsAppUrl(selectedAgencyRow)}
                  target="_blank"
                  rel="noreferrer"
                  className="px-4 py-2.5 rounded-xl bg-emerald-600/20 hover:bg-emerald-600 text-emerald-300 hover:text-white font-bold text-xs border border-emerald-500/30 flex items-center gap-2 transition-all cursor-pointer"
                >
                  <WhatsAppIcon className="w-4 h-4 fill-current" />
                  <span>Enviar por WhatsApp</span>
                </a>
              )}
              <button
                onClick={() => setDetailModalAgency(null)}
                className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs transition-colors text-center ml-auto cursor-pointer"
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
