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
} from 'lucide-react';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { getConsolidatedPayments, getConsolidatedExpenses } from '../../utils/consolidations';

interface HomeDashboardProps {
  onNavigate: (module: ModuleId) => void;
}

interface CurrencyBalance {
  moneda: string;
  saldoAnterior: number;
  ventasSemana: number;
  gastosSemana: number;
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

      // 4. Cargar Saldos Consolidados por Moneda (BS, USD, COP)
      const currencies = ['BS', 'USD', 'COP'];
      const balancesMap: Record<string, CurrencyBalance> = {};

      const [resVentas, gastosList, pagosList] = await Promise.all([
        supabase.from('carga_actual').select('*').eq('user_id', effectiveUserId),
        getConsolidatedExpenses(effectiveUserId, { fechaDesde: systemCycle.desde, fechaHasta: systemCycle.hasta }),
        getConsolidatedPayments(effectiveUserId, { fechaDesde: systemCycle.desde, fechaHasta: systemCycle.hasta }),
      ]);

      const ventasList = resVentas.data || [];

      currencies.forEach((mon) => {
        const colInicial = `saldo_inicial_${mon.toLowerCase()}`;
        const saldoAnt = agList.reduce((acc: number, ag: any) => acc + (Number(ag[colInicial]) || 0), 0);

        const vTot = ventasList
          .filter((v: any) => String(v.moneda || '').toUpperCase() === mon)
          .reduce((acc: number, v: any) => acc + (Number(v.util_op) || (Number(v.monto_venta || 0) - Number(v.comision || 0) - Number(v.monto_premios || 0))), 0);

        const gTot = gastosList
          .filter((g) => g.moneda === mon)
          .reduce((acc: number, g) => acc + (Number(g.monto) || 0), 0);

        const pTot = pagosList
          .filter((p) => p.moneda === mon)
          .reduce((acc: number, p) => {
            const m = Number(p.monto || 0);
            return p.tipo_pago.includes('Premio') ? acc - m : acc + m;
          }, 0);

        const bFinal = (saldoAnt + vTot) - gTot - pTot;

        balancesMap[mon] = {
          moneda: mon,
          saldoAnterior: saldoAnt,
          ventasSemana: vTot,
          gastosSemana: gTot,
          pagosSemana: pTot,
          balanceFinal: bFinal,
        };
      });

      setBalancesByCurrency(balancesMap);
    } catch (err) {
      console.error('Error loading dashboard:', err);
    } finally {
      setLoading(false);
    }
  }, [effectiveUserId]);

  useEffect(() => {
    loadDashboardData();
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
              Fórmula: (Saldo Arrastre + Utilidad Semanal) - Gastos - Pagos = Balance Final
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
                    <span className="font-mono text-emerald-400">{formatCurrency(b.ventasSemana, mon)}</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Gastos Operativos (-):</span>
                    <span className="font-mono text-rose-400">{formatCurrency(b.gastosSemana, mon)}</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Cobros / Pagos (-):</span>
                    <span className="font-mono text-sky-400">{formatCurrency(b.pagosSemana, mon)}</span>
                  </div>
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

      {/* Fast Navigation Shortcuts */}
      <div className="bg-[#0D1B22] border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
        <h3 className="text-base font-extrabold text-white flex items-center gap-2">
          <span>⚡</span>
          <span>Accesos Rápidos del Sistema</span>
        </h3>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { id: 'Confirmaciones' as ModuleId, label: 'Confirmaciones', icon: CheckSquare, color: 'text-amber-400 bg-amber-500/10' },
            { id: 'Rep. Confirmaciones' as ModuleId, label: 'Rep. Confirm.', icon: FileText, color: 'text-sky-400 bg-sky-500/10' },
            { id: 'Agencias' as ModuleId, label: 'Agencias', icon: Store, color: 'text-emerald-400 bg-emerald-500/10' },
            { id: 'Cargar Ventas' as ModuleId, label: 'Cargar Ventas', icon: TrendingUp, color: 'text-teal-400 bg-teal-500/10' },
            { id: 'Saldo Agencias' as ModuleId, label: 'Estados Cuenta', icon: Coins, color: 'text-indigo-400 bg-indigo-500/10' },
            { id: 'Cobradores' as ModuleId, label: 'Cobradores QR', icon: Bike, color: 'text-purple-400 bg-purple-500/10' },
          ].map((item) => {
            const IconC = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                className="p-3.5 rounded-2xl bg-[#071217] border border-slate-800 hover:border-slate-700 flex flex-col items-center justify-center gap-2 text-center transition-all cursor-pointer hover:scale-102 group"
              >
                <div className={`p-2.5 rounded-xl ${item.color} group-hover:scale-110 transition-transform`}>
                  <IconC className="w-5 h-5" />
                </div>
                <span className="text-xs font-bold text-slate-300 group-hover:text-white truncate w-full">
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
