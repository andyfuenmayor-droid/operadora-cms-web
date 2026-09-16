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
  ShieldCheck,
  RefreshCw,
  Search,
  Filter,
  Download,
  FileText,
  Bike,
  Building2,
  DollarSign,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  Clock,
  ArrowRight,
  TrendingUp,
  Receipt,
  Layers,
  Award,
  Wallet
} from 'lucide-react';
import { DeliveryReportModal, type PreClosureAgencyRow } from './DeliveryReportModal';

export const PreClosureAuditTab: React.FC = () => {
  const { effectiveUserId, systemCycle, user } = useAuth();

  const [isLoading, setIsLoading] = useState(true);
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [sales, setSales] = useState<any[]>([]);
  const [payments, setPayments] = useState<ConsolidatedPaymentItem[]>([]);
  const [expenses, setExpenses] = useState<ConsolidatedExpenseItem[]>([]);
  const [rawDailyPayments, setRawDailyPayments] = useState<any[]>([]);

  // Filters
  const [selectedCurrency, setSelectedCurrency] = useState<'ALL' | 'BS' | 'USD' | 'COP'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pagado' | 'pendiente' | 'favor'>('all');

  // Modal for Acta de Entrega
  const [isActaModalOpen, setIsActaModalOpen] = useState(false);

  // Load database data
  const loadData = async () => {
    if (!effectiveUserId) return;
    setIsLoading(true);

    try {
      const [agRes, sRes, pConsolidated, gConsolidated, pdRes] = await Promise.all([
        supabase.from('agencias').select('*').eq('user_id', effectiveUserId).order('id', { ascending: true }),
        supabase.from('carga_actual').select('*').eq('user_id', effectiveUserId),
        getConsolidatedPayments(effectiveUserId, { fechaDesde: systemCycle.desde, fechaHasta: systemCycle.hasta }),
        getConsolidatedExpenses(effectiveUserId, { fechaDesde: systemCycle.desde, fechaHasta: systemCycle.hasta }),
        supabase.from('cda_pagos_diarios').select('*').eq('user_id', effectiveUserId),
      ]);

      setAgencies(agRes.data || []);
      setSales(sRes.data || []);
      setPayments(pConsolidated);
      setExpenses(gConsolidated);
      setRawDailyPayments(pdRes.data || []);
    } catch (err) {
      console.error('Error loading pre-closure audit data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [effectiveUserId, systemCycle?.desde, systemCycle?.hasta]);

  // Compute detailed audit rows
  const auditRows = useMemo<PreClosureAgencyRow[]>(() => {
    const list: PreClosureAgencyRow[] = [];
    const currencies: ('BS' | 'USD' | 'COP')[] = ['BS', 'USD', 'COP'];

    currencies.forEach((mon) => {
      const colIni = mon === 'BS' ? 'saldo_inicial_bs' : mon === 'USD' ? 'saldo_inicial_usd' : 'saldo_inicial_cop';

      agencies.forEach((ag) => {
        const nom = String(ag.nombre_agencia || '').trim().toUpperCase();
        const confMon = String(ag.monedas || '').toUpperCase();
        const sAnt = Number(ag[colIni] || 0);

        // Filter sales for this agency and currency
        const agSales = sales.filter((s) => s.agencia === nom && normalizarMoneda(s.moneda) === mon);
        const vtaBruta = agSales.reduce((sum, curr) => sum + Number(curr.venta || curr.monto_ventas || curr.neto || 0), 0);
        const com = agSales.reduce((sum, curr) => sum + Number(curr.comision || 0), 0);
        const premTaq = agSales.reduce((sum, curr) => sum + Number(curr.monto_premios || curr.premios || 0), 0);
        const vtaNeta = agSales.reduce((sum, curr) => sum + Number(curr.neto || curr.util_op || 0), 0);

        if (confMon.includes(mon) || Math.abs(sAnt) > 0.01 || agSales.length > 0) {
          // Gastos confirmados en el ciclo
          const agExp = expenses.filter((g) => g.agencia === nom && normalizarMoneda(g.moneda) === mon && Boolean(g.confirmado));
          const gTot = agExp.reduce((sum, curr) => sum + Number(curr.monto || 0), 0);

          // Segregación de Pagos por Canal restringidos estrictamente al ciclo operativo activo:
          // 1. Cobradores de Ruta (recaudaciones QR de cda_pagos_diarios)
          const agCobradorList = rawDailyPayments.filter((p) => {
            const matchAg = (p.agencia || p.nombre_agency || '').trim().toUpperCase() === nom;
            const matchMon = normalizarMoneda(p.moneda) === mon;
            const isCob = Boolean(p.qr_token) || String(p.tipo_pago || '').toUpperCase().includes('COBRADOR');
            const isConf = Boolean(p.confirmado) || Boolean(p.confirmado_supervisor) || Boolean(p.fecha_escaneo_cobrador);
            const fStr = String(p.fecha || p.created_at || '').slice(0, 10);
            const inCycle = !systemCycle?.desde || (fStr >= systemCycle.desde && fStr <= (systemCycle.hasta || fStr));
            return matchAg && matchMon && isCob && isConf && inCycle && !p.rechazado;
          });
          const cobradorRutaTot = agCobradorList.reduce((sum, curr) => sum + Number(curr.monto || 0), 0);
          const cobradorLiquidadoTot = agCobradorList.filter((p) => Boolean(p.liquidado_admin)).reduce((sum, curr) => sum + Number(curr.monto || 0), 0);
          const cobradorEnRutaTot = agCobradorList.filter((p) => !p.liquidado_admin).reduce((sum, curr) => sum + Number(curr.monto || 0), 0);

          // 2. Efectivo Taquilla directo (Entregado a Supervisor en caja taquilla sin QR en el ciclo)
          const agEfectivoList = rawDailyPayments.filter((p) => {
            const matchAg = (p.agencia || p.nombre_agency || '').trim().toUpperCase() === nom;
            const matchMon = normalizarMoneda(p.moneda) === mon;
            const isCob = Boolean(p.qr_token) || String(p.tipo_pago || '').toUpperCase().includes('COBRADOR');
            const isConf = Boolean(p.confirmado) || Boolean(p.confirmado_supervisor);
            const fStr = String(p.fecha || p.created_at || '').slice(0, 10);
            const inCycle = !systemCycle?.desde || (fStr >= systemCycle.desde && fStr <= (systemCycle.hasta || fStr));
            return matchAg && matchMon && !isCob && isConf && inCycle && !p.rechazado;
          });
          const efectivoTaquillaTot = agEfectivoList.reduce((sum, curr) => sum + Number(curr.monto || 0), 0);

          // 3. Bancos ordinarios (pagos_semana + cda_pagos_bancarios sin incluir reposición de premios)
          const agBancosList = payments.filter((p) => {
            const matchAg = p.agencia === nom && normalizarMoneda(p.moneda) === mon;
            const isPrem = String(p.tipo_pago || '').toUpperCase().includes('PREMIO') || String(p.referencia || '').toUpperCase().includes('PREMIO');
            const isDiario = p.id.startsWith('pd_');
            return matchAg && !isPrem && !isDiario && Boolean(p.confirmado);
          });
          const bancosTot = agBancosList.reduce((sum, curr) => sum + Number(curr.monto || 0), 0);

          // 4. Reposición de Premios (Abonos de la Operadora a la agencia por pérdidas / faltantes de premio)
          const agPremiosList = payments.filter((p) => {
            const matchAg = p.agencia === nom && normalizarMoneda(p.moneda) === mon;
            const isPrem = String(p.tipo_pago || '').toUpperCase().includes('PREMIO') || String(p.referencia || '').toUpperCase().includes('PREMIO');
            return matchAg && isPrem && Boolean(p.confirmado);
          });
          const reposicionPremiosTot = agPremiosList.reduce((sum, curr) => sum + Number(curr.monto || 0), 0);

          // Total cobros ordinarios (reducen saldo de la agencia)
          const totalCobros = cobradorRutaTot + efectivoTaquillaTot + bancosTot;

          // Pagos netos
          const pagosNetos = totalCobros - reposicionPremiosTot;

          // Saldo Final = Arrastre + Venta Neta - Gastos - Cobros + Premios
          const saldoFinal = Math.round((sAnt + vtaNeta - gTot - totalCobros + reposicionPremiosTot) * 100) / 100;

          let status: 'pagado' | 'pendiente' | 'favor' = 'pagado';
          if (Math.abs(saldoFinal) < 0.1) status = 'pagado';
          else if (saldoFinal > 0) status = 'pendiente';
          else status = 'favor';

          list.push({
            ag_id: ag.id,
            entidad: nom,
            moneda: mon,
            saldo_anterior: sAnt,
            venta_bruta: vtaBruta,
            comision: com,
            premios_taquilla: premTaq,
            venta_neta: vtaNeta,
            gastos: gTot,
            cobrador_ruta: cobradorRutaTot,
            cobrador_liquidado: cobradorLiquidadoTot,
            cobrador_en_ruta: cobradorEnRutaTot,
            efectivo_taquilla: efectivoTaquillaTot,
            bancos: bancosTot,
            reposicion_premios: reposicionPremiosTot,
            pagos_netos: pagosNetos,
            saldo_final: saldoFinal,
            status,
          });
        }
      });
    });

    return list;
  }, [agencies, sales, payments, expenses, rawDailyPayments, systemCycle]);

  // Totals by currency
  const totalsByCurrency = useMemo(() => {
    const res: Record<string, {
      saldoAnterior: number;
      ventaNeta: number;
      gastos: number;
      cobradorRuta: number;
      cobradorLiquidado: number;
      cobradorEnRuta: number;
      efectivoTaquilla: number;
      bancos: number;
      reposicionPremios: number;
      saldoFinal: number;
      count: number;
    }> = {};

    ['BS', 'USD', 'COP'].forEach((m) => {
      res[m] = {
        saldoAnterior: 0,
        ventaNeta: 0,
        gastos: 0,
        cobradorRuta: 0,
        cobradorLiquidado: 0,
        cobradorEnRuta: 0,
        efectivoTaquilla: 0,
        bancos: 0,
        reposicionPremios: 0,
        saldoFinal: 0,
        count: 0,
      };
    });

    auditRows.forEach((r) => {
      if (res[r.moneda]) {
        res[r.moneda].saldoAnterior += r.saldo_anterior;
        res[r.moneda].ventaNeta += r.venta_neta;
        res[r.moneda].gastos += r.gastos;
        res[r.moneda].cobradorRuta += r.cobrador_ruta;
        res[r.moneda].cobradorLiquidado += r.cobrador_liquidado || 0;
        res[r.moneda].cobradorEnRuta += r.cobrador_en_ruta || 0;
        res[r.moneda].efectivoTaquilla += r.efectivo_taquilla;
        res[r.moneda].bancos += r.bancos;
        res[r.moneda].reposicionPremios += r.reposicion_premios;
        res[r.moneda].saldoFinal += r.saldo_final;
        res[r.moneda].count += 1;
      }
    });

    return res;
  }, [auditRows]);

  // Filtered rows for the table view
  const filteredRows = useMemo(() => {
    return auditRows.filter((r) => {
      if (selectedCurrency !== 'ALL' && r.moneda !== selectedCurrency) return false;
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        if (!r.entidad.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [auditRows, selectedCurrency, statusFilter, searchQuery]);

  // CSV Export
  const handleExportCSV = () => {
    if (auditRows.length === 0) return;
    const headers = [
      'Agencia',
      'Moneda',
      'Arrastre Inicial',
      'Venta Neta',
      'Gastos',
      'Cobrador Ruta (QR)',
      'Efectivo Taquilla',
      'Bancos (Cobros)',
      'Reposicion Premios (+)',
      'Pagos Netos',
      'Saldo Final',
      'Estado Arqueo',
    ];
    const rows = auditRows.map((d) => [
      `"${d.entidad}"`,
      d.moneda,
      d.saldo_anterior.toFixed(2),
      d.venta_neta.toFixed(2),
      d.gastos.toFixed(2),
      d.cobrador_ruta.toFixed(2),
      d.efectivo_taquilla.toFixed(2),
      d.bancos.toFixed(2),
      d.reposicion_premios.toFixed(2),
      d.pagos_netos.toFixed(2),
      d.saldo_final.toFixed(2),
      d.status.toUpperCase(),
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `PreCierre_Arqueo_Semana_${systemCycle.semana}_${systemCycle.desde}_al_${systemCycle.hasta}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const currentTotals = selectedCurrency === 'ALL' ? totalsByCurrency['COP'] || totalsByCurrency['BS'] : totalsByCurrency[selectedCurrency];

  return (
    <div className="space-y-6">
      {/* Top Banner with Quick Actions */}
      <div className="bg-gradient-to-r from-emerald-950/30 via-[#0D1B22] to-sky-950/30 border border-emerald-500/20 rounded-3xl p-5 sm:p-6 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-extrabold uppercase border border-emerald-500/30 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5" />
              Auditoría en Tiempo Real
            </span>
            <span className="text-xs font-mono font-bold text-slate-400">
              {systemCycle.tipo === 'SEMANAL' ? `Semana ${systemCycle.semana}` : `Ciclo ${systemCycle.semana}`} ({systemCycle.desde} al {systemCycle.hasta})
            </span>
          </div>
          <h3 className="text-lg font-black text-white">
            Pre-Cierre y Arqueo Integral del Ciclo
          </h3>
          <p className="text-xs text-slate-400">
            Conciliación de saldos por caja, canales de cobro (Efectivo/Cobradores/Bancos) y reposición de premios antes del cierre.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => setIsActaModalOpen(true)}
            className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs shadow-lg shadow-amber-500/20 flex items-center gap-2 transition-all cursor-pointer"
          >
            <FileText className="w-4 h-4" />
            <span>📜 Generar Acta Oficial de Entrega</span>
          </button>

          <button
            onClick={handleExportCSV}
            disabled={auditRows.length === 0}
            className="px-3.5 py-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 text-xs font-bold flex items-center gap-1.5 transition-all border border-slate-700 cursor-pointer disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Exportar CSV</span>
          </button>

          <button
            onClick={loadData}
            disabled={isLoading}
            className="p-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 transition-all border border-slate-700 cursor-pointer disabled:opacity-50"
            title="Recalcular arqueo"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* KPI Cards Multi-Moneda */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {['BS', 'USD', 'COP'].map((mon) => {
          const tot = totalsByCurrency[mon];
          if (!tot) return null;

          return (
            <div
              key={mon}
              onClick={() => setSelectedCurrency(mon as any)}
              className={`p-5 rounded-3xl border transition-all cursor-pointer ${
                selectedCurrency === mon
                  ? 'bg-[#0F222D] border-emerald-500/40 shadow-lg shadow-emerald-500/10'
                  : 'bg-[#0D1B22] border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-black uppercase text-amber-400 font-mono tracking-wider">
                  Caja Consolidada {mon}
                </span>
                <span className="text-[10px] text-slate-400 font-mono">
                  {tot.count} agencias
                </span>
              </div>

              <div className="text-2xl font-black font-mono text-white mb-3">
                {formatCurrency(tot.saldoFinal, mon as any)}
                <span className="text-xs font-semibold text-slate-400 ml-1.5">Saldo Final</span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px] font-mono border-t border-slate-800/80 pt-2.5 text-slate-400">
                <div>
                  <span className="text-[10px] block text-slate-500">Arrastre Inicial:</span>
                  <span className="font-semibold text-slate-300">{formatCurrency(tot.saldoAnterior, mon as any)}</span>
                </div>
                <div>
                  <span className="text-[10px] block text-slate-500">Venta Neta:</span>
                  <span className={`font-semibold ${tot.ventaNeta >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {formatCurrency(tot.ventaNeta, mon as any)}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] block text-slate-500">🛵 Cobradores:</span>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-semibold text-sky-400">{formatCurrency(tot.cobradorRuta, mon as any)}</span>
                    {tot.cobradorRuta > 0 && (
                      <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded-full border ${
                        tot.cobradorEnRuta > 0 ? 'bg-amber-500/15 text-amber-400 border-amber-500/30' : 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                      }`}>
                        {tot.cobradorEnRuta > 0 ? `${formatCurrency(tot.cobradorEnRuta, mon as any)} en ruta` : '🏛️ 100% en Admin'}
                      </span>
                    )}
                  </div>
                </div>
                <div>
                  <span className="text-[10px] block text-slate-500">🏛️ Bancos:</span>
                  <span className="font-semibold text-cyan-400">{formatCurrency(tot.bancos, mon as any)}</span>
                </div>
                {tot.reposicionPremios > 0 && (
                  <div className="col-span-2 pt-1 border-t border-slate-800/50 flex justify-between">
                    <span className="text-[10px] text-amber-400/90 font-bold">🏆 Reposición Premios:</span>
                    <span className="font-bold text-amber-400">+{formatCurrency(tot.reposicionPremios, mon as any)}</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-[#0D1B22] border border-slate-800 rounded-2xl p-4">
        {/* Currency Switcher Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto">
          <button
            onClick={() => setSelectedCurrency('ALL')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              selectedCurrency === 'ALL'
                ? 'bg-emerald-500 text-slate-950 font-black'
                : 'text-slate-400 hover:text-white bg-slate-800/60'
            }`}
          >
            Todas ({auditRows.length})
          </button>
          {['COP', 'BS', 'USD'].map((mon) => (
            <button
              key={mon}
              onClick={() => setSelectedCurrency(mon as any)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                selectedCurrency === mon
                  ? 'bg-emerald-500 text-slate-950 font-black'
                  : 'text-slate-400 hover:text-white bg-slate-800/60'
              }`}
            >
              {mon} ({auditRows.filter((r) => r.moneda === mon).length})
            </button>
          ))}
        </div>

        {/* Search & Status Filter */}
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar agencia..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#071217] border border-slate-700 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="bg-[#071217] border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
          >
            <option value="all">Todos los Estados</option>
            <option value="pagado">🟢 Cuadrado / Pagado</option>
            <option value="pendiente">🟡 Saldo Operadora</option>
            <option value="favor">🔴 Saldo Agencia</option>
          </select>
        </div>
      </div>

      {/* Main Audit Matrix Table */}
      <div className="bg-[#0D1B22] border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Layers className="w-4 h-4 text-emerald-400" />
              Matriz de Arqueo Detallada por Caja y Agencia ({filteredRows.length})
            </h4>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Fórmula: Saldo Anterior + Venta Neta - Gastos - Cobros (Efectivo/Bancos) + Reposición de Premios = Saldo Final
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-[#071217] text-slate-400 border-b border-slate-800 font-bold uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-3 px-3">Agencia</th>
                <th className="py-3 px-2 text-center">Moneda</th>
                <th className="py-3 px-3 text-right">Arrastre Inicial</th>
                <th className="py-3 px-3 text-right">Venta Neta</th>
                <th className="py-3 px-3 text-right">Gastos</th>
                <th className="py-3 px-3 text-right">🛵 Cobrador</th>
                <th className="py-3 px-3 text-right">💵 Efec Taquilla</th>
                <th className="py-3 px-3 text-right">🏛️ Bancos</th>
                <th className="py-3 px-3 text-right">🏆 Reposición (+)</th>
                <th className="py-3 px-3 text-right font-black">Saldo Final</th>
                <th className="py-3 px-3 text-center">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70 font-mono text-xs">
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-8 text-center text-slate-500 font-sans">
                    No se encontraron registros de arqueo para los filtros aplicados.
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => (
                  <tr key={`${row.entidad}_${row.moneda}`} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-3 px-3 font-sans font-bold text-white flex items-center gap-2 truncate max-w-[160px]">
                      <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate">{row.entidad}</span>
                    </td>

                    <td className="py-3 px-2 text-center">
                      <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 font-bold text-[10px]">
                        {row.moneda}
                      </span>
                    </td>

                    <td className="py-3 px-3 text-right text-slate-400">
                      {formatCurrency(row.saldo_anterior, row.moneda)}
                    </td>

                    <td className={`py-3 px-3 text-right font-semibold ${row.venta_neta >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {formatCurrency(row.venta_neta, row.moneda)}
                    </td>

                    <td className="py-3 px-3 text-right text-rose-400">
                      {row.gastos > 0 ? formatCurrency(row.gastos, row.moneda) : '-'}
                    </td>

                    <td className="py-3 px-3 text-right">
                      {row.cobrador_ruta > 0 ? (
                        <div className="flex flex-col items-end">
                          <span className="font-semibold text-sky-400">
                            {formatCurrency(row.cobrador_ruta, row.moneda)}
                          </span>
                          {row.cobrador_en_ruta && row.cobrador_en_ruta > 0 ? (
                            <span className="text-[9px] font-bold text-amber-400 bg-amber-500/15 border border-amber-500/30 px-1.5 py-0.5 rounded-full inline-flex items-center gap-0.5 mt-0.5" title="En custodia / ruta">
                              🛵 En Ruta ({formatCurrency(row.cobrador_en_ruta, row.moneda)})
                            </span>
                          ) : (
                            <span className="text-[9px] font-bold text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 px-1.5 py-0.5 rounded-full inline-flex items-center gap-0.5 mt-0.5" title="Fondos liquidados a la administración central">
                              🏛️ Liquidado Admin
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-500">-</span>
                      )}
                    </td>

                    <td className="py-3 px-3 text-right text-sky-300">
                      {row.efectivo_taquilla > 0 ? formatCurrency(row.efectivo_taquilla, row.moneda) : '-'}
                    </td>

                    <td className="py-3 px-3 text-right text-cyan-400">
                      {row.bancos > 0 ? formatCurrency(row.bancos, row.moneda) : '-'}
                    </td>

                    <td className="py-3 px-3 text-right text-amber-400 font-bold">
                      {row.reposicion_premios > 0 ? `+${formatCurrency(row.reposicion_premios, row.moneda)}` : '-'}
                    </td>

                    <td className={`py-3 px-3 text-right font-black text-sm ${row.saldo_final > 0 ? 'text-amber-400' : row.saldo_final < 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                      {formatCurrency(row.saldo_final, row.moneda)}
                    </td>

                    <td className="py-3 px-3 text-center font-sans">
                      {row.status === 'pagado' ? (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 inline-flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          Pagado
                        </span>
                      ) : row.status === 'pendiente' ? (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-amber-500/15 text-amber-400 border border-amber-500/30">
                          Operadora
                        </span>
                      ) : (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-rose-500/15 text-rose-400 border border-rose-500/30">
                          Agencia
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Acta Oficial de Entrega */}
      <DeliveryReportModal
        isOpen={isActaModalOpen}
        onClose={() => setIsActaModalOpen(false)}
        systemCycle={systemCycle}
        userName={user?.nombre || user?.email?.split('@')[0] || 'Administración'}
        companyName="CORPORACION CALENDARIO, CA"
        auditRows={auditRows}
        totalsByCurrency={totalsByCurrency}
      />
    </div>
  );
};
