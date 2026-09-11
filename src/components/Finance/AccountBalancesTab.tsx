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
  AlertCircle
} from 'lucide-react';

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

  // Filtered rows for active currency
  const filteredRows = useMemo(() => {
    if (!searchQuery.trim()) return activeBalances.rows;
    const q = searchQuery.toLowerCase();
    return activeBalances.rows.filter((r) => r.agencia.toLowerCase().includes(q));
  }, [activeBalances.rows, searchQuery]);

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

  // Detailed movements for an individual agency (Modal)
  const detailMovements = useMemo(() => {
    if (!detailModalAgency) return null;
    const agName = detailModalAgency;

    const agSales = sales.filter((s) => s.agencia === agName);
    const agPayments = payments.filter((p) => p.agencia === agName);
    const agExpenses = expenses.filter((e) => e.agencia === agName);

    return {
      agencia: agName,
      sales: agSales,
      payments: agPayments,
      expenses: agExpenses,
    };
  }, [detailModalAgency, sales, payments, expenses]);

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
      <div className="bg-[#0D1B22] border border-slate-800 rounded-3xl p-6 shadow-xl flex flex-col md:flex-row items-center justify-between gap-6">
        {/* Currency Tabs */}
        <div className="flex items-center gap-2 bg-[#071217] p-1.5 rounded-2xl border border-slate-800">
          <button
            onClick={() => setActiveCurrency('BS')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeCurrency === 'BS'
                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            🇻🇪 Bolívares (BS)
          </button>

          <button
            onClick={() => setActiveCurrency('USD')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeCurrency === 'USD'
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            💵 Dólares (USD)
          </button>

          <button
            onClick={() => setActiveCurrency('COP')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeCurrency === 'COP'
                ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            🇨🇴 Pesos (COP)
          </button>
        </div>

        {/* Cartera Total Metric */}
        <div className="text-center md:text-right">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
            Cartera Total Pendiente ({activeCurrency})
          </span>
          <span
            className={`text-2xl sm:text-3xl font-black font-mono mt-1 block ${
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

      {/* Search Input */}
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="Buscar agencia..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full bg-[#0D1B22] border border-slate-800 rounded-2xl pl-9 pr-4 py-3 text-xs text-white focus:outline-none focus:border-purple-500"
        />
      </div>

      {/* Account Balances Table */}
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
                <th className="py-3.5 px-4">Agencia</th>
                <th className="py-3.5 px-4 text-right">Saldo Arrastre</th>
                <th className="py-3.5 px-4 text-right">Semana (Utilidad)</th>
                <th className="py-3.5 px-4 text-right">Gastos (-)</th>
                <th className="py-3.5 px-4 text-right">Pagos (-)</th>
                <th className="py-3.5 px-4 text-right">Balance Final</th>
                <th className="py-3.5 px-4 text-center">Estatus</th>
                <th className="py-3.5 px-4 text-center">Detalle</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 font-mono">
              {filteredRows.map((r) => (
                <tr key={r.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="py-3.5 px-4 font-sans font-bold text-white">{r.agencia}</td>
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
                  <td className="py-3.5 px-4 text-center font-sans">
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
                    <button
                      onClick={() => setDetailModalAgency(r.agencia)}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
                      title="Ver Detalle de la Agencia"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* =========================================================================
          INDIVIDUAL AGENCY DETAIL MODAL
      ========================================================================= */}
      {detailMovements && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#0D1B22] border border-slate-800 rounded-3xl p-6 sm:p-8 max-w-2xl w-full space-y-5 shadow-2xl animate-fade-in my-8">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-purple-400" />
                  Estado de Cuenta Detallado: {detailMovements.agencia}
                </h3>
                <p className="text-xs text-slate-400">
                  Desglose de ventas, pagos y gastos registrados para esta agencia.
                </p>
              </div>

              <button
                onClick={() => setDetailModalAgency(null)}
                className="text-slate-400 hover:text-white text-xs font-bold"
              >
                ✕
              </button>
            </div>

            {/* Sales List */}
            <div className="space-y-2">
              <span className="text-xs font-bold uppercase text-slate-400 tracking-wider">
                Ventas ({detailMovements.sales.length})
              </span>
              {detailMovements.sales.length === 0 ? (
                <p className="text-xs text-slate-500 italic">No hay ventas registradas.</p>
              ) : (
                <div className="max-h-36 overflow-y-auto border border-slate-800 rounded-xl bg-[#071217] p-2 space-y-1 text-xs font-mono">
                  {detailMovements.sales.map((s) => (
                    <div key={s.id} className="flex justify-between py-1 border-b border-slate-800/60 last:border-0">
                      <span>{formatDate(s.fecha)} • {s.sistema}</span>
                      <span>Venta: {formatCurrency(s.venta, s.moneda)} | Neto: <strong className="text-emerald-400">{formatCurrency(s.neto, s.moneda)}</strong></span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Payments List */}
            <div className="space-y-2">
              <span className="text-xs font-bold uppercase text-slate-400 tracking-wider">
                Pagos y Cobranzas ({detailMovements.payments.length})
              </span>
              {detailMovements.payments.length === 0 ? (
                <p className="text-xs text-slate-500 italic">No hay pagos registrados.</p>
              ) : (
                <div className="max-h-36 overflow-y-auto border border-slate-800 rounded-xl bg-[#071217] p-2 space-y-1 text-xs font-mono">
                  {detailMovements.payments.map((p) => {
                    const isPremio = String(p.tipo_pago || '').toUpperCase().includes('PREMIO');
                    return (
                      <div key={p.id} className="flex justify-between items-center py-1 border-b border-slate-800/60 last:border-0">
                        <span>
                          {formatDate(p.fecha)} • {p.metodo} ({p.referencia})
                          {isPremio && (
                            <span className="ml-1.5 px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-sans font-semibold">
                              Reposición Premios
                            </span>
                          )}
                        </span>
                        <strong className={isPremio ? 'text-amber-400' : 'text-cyan-400'}>
                          {isPremio ? '-' : ''}{formatCurrency(p.monto, p.moneda)}
                        </strong>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Expenses List */}
            <div className="space-y-2">
              <span className="text-xs font-bold uppercase text-slate-400 tracking-wider">
                Gastos ({detailMovements.expenses.length})
              </span>
              {detailMovements.expenses.length === 0 ? (
                <p className="text-xs text-slate-500 italic">No hay gastos registrados.</p>
              ) : (
                <div className="max-h-36 overflow-y-auto border border-slate-800 rounded-xl bg-[#071217] p-2 space-y-1 text-xs font-mono">
                  {detailMovements.expenses.map((e) => (
                    <div key={e.id} className="flex justify-between py-1 border-b border-slate-800/60 last:border-0">
                      <span>{formatDate(e.fecha)} • {e.concepto}</span>
                      <strong className="text-rose-400">{formatCurrency(e.monto, e.moneda)}</strong>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end pt-3 border-t border-slate-800">
              <button
                onClick={() => setDetailModalAgency(null)}
                className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs transition-colors"
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
