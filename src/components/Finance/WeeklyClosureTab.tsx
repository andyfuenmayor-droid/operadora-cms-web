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
  Lock,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Layers,
  Calendar,
  Building2,
  ArrowRight,
  ShieldAlert
} from 'lucide-react';
import confetti from 'canvas-confetti';

interface CierreAgencyData {
  ag_id: number;
  entidad: string;
  moneda: string;
  saldo_anterior: number;
  venta_bruta: number;
  utilidad_semana: number;
  gastos: number;
  premios: number;
  cobros: number;
  saldo_final: number;
}

export const WeeklyClosureTab: React.FC = () => {
  const { effectiveUserId, systemCycle, refreshSystemCycle } = useAuth();

  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [sales, setSales] = useState<any[]>([]);
  const [payments, setPayments] = useState<ConsolidatedPaymentItem[]>([]);
  const [expenses, setExpenses] = useState<ConsolidatedExpenseItem[]>([]);

  const [verifiedCheck, setVerifiedCheck] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadData = async () => {
    if (!effectiveUserId) return;
    setIsLoading(true);
    setMessage(null);

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
      console.error('Error loading closure data:', err);
      setMessage({ type: 'error', text: err?.message || 'Error al cargar datos de cierre.' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [effectiveUserId]);

  // Compute closure movements for all currencies
  const closureData = useMemo<CierreAgencyData[]>(() => {
    const list: CierreAgencyData[] = [];
    const currencies = ['BS', 'USD', 'COP'];

    currencies.forEach((m) => {
      const colIni = m === 'BS' ? 'saldo_inicial_bs' : m === 'USD' ? 'saldo_inicial_usd' : 'saldo_inicial_cop';

      agencies.forEach((ag) => {
        const nom = ag.nombre_agencia.trim().toUpperCase();
        const confMon = String(ag.monedas || '').toUpperCase();
        const sAnt = Number(ag[colIni] || 0);

        if (confMon.includes(m) || Math.abs(sAnt) > 0.01) {
          // Ventas
          const agSales = sales.filter((s) => s.agencia === nom && normalizarMoneda(s.moneda) === m);
          const brutoTotal = agSales.reduce((sum, curr) => sum + Number(curr.neto || 0), 0);

          const partAg = Number(ag.participacion_ag || 50);
          const utilVal = brutoTotal !== 0 ? Math.round((brutoTotal - Math.round(brutoTotal * (partAg / 100))) * 100) / 100 : 0;

          // Gastos
          const agExp = expenses.filter((g) => g.agencia === nom && normalizarMoneda(g.moneda) === m);
          const gastoVal = agExp.reduce((sum, curr) => sum + Number(curr.monto || 0), 0);

          // Pagos & Premios
          const agPay = payments.filter((p) => p.agencia === nom && normalizarMoneda(p.moneda) === m);
          let premiosVal = 0, cobrosVal = 0;
          agPay.forEach((p) => {
            const mto = Number(p.monto || 0);
            const tipo = String(p.tipo_pago || '').toUpperCase();
            if (tipo.includes('PREMIO')) premiosVal += mto;
            else cobrosVal += mto;
          });

          // Final Balance
          const sFin = Math.round((sAnt + utilVal - gastoVal - cobrosVal + premiosVal) * 100) / 100;

          list.push({
            ag_id: ag.id,
            entidad: nom,
            moneda: m,
            saldo_anterior: sAnt,
            venta_bruta: brutoTotal,
            utilidad_semana: utilVal,
            gastos: gastoVal,
            premios: premiosVal,
            cobros: cobrosVal,
            saldo_final: sFin,
          });
        }
      });
    });

    return list;
  }, [agencies, sales, payments, expenses]);

  // Execute Cycle Finalization
  const handleFinalizeWeek = async () => {
    if (!verifiedCheck || !effectiveUserId) return;
    if (!window.confirm('⚠️ ¿Estás seguro de FINALIZAR EL CICLO? Esta acción trasladará saldos de arrastre a las agencias, limpiará las tablas activas y avanzará las fechas de trabajo.')) {
      return;
    }

    setIsProcessing(true);
    setMessage(null);

    try {
      const periodoActual = `${systemCycle.desde} al ${systemCycle.hasta}`;
      const nowIso = new Date().toISOString();

      // 1. Insert snapshot into cierres_semanales
      const snapshot = closureData.map((d) => ({
        user_id: effectiveUserId,
        entidad: d.entidad,
        moneda: d.moneda,
        saldo_anterior: d.saldo_anterior,
        utilidad_semana: d.utilidad_semana,
        gastos: d.gastos,
        movimientos: Math.round((d.premios - d.cobros - d.gastos) * 100) / 100,
        saldo_final: d.saldo_final,
        periodo: periodoActual,
        tipo_entidad: 'AGENCIA',
        fecha_cierre: nowIso,
      }));

      if (snapshot.length > 0) {
        const { error: snapErr } = await supabase.from('cierres_semanales').insert(snapshot);
        if (snapErr) throw snapErr;
      }

      // 2. Update initial balances in agencias
      for (const d of closureData) {
        const colUpdate = d.moneda === 'BS' ? 'saldo_inicial_bs' : d.moneda === 'USD' ? 'saldo_inicial_usd' : 'saldo_inicial_cop';
        await supabase
          .from('agencias')
          .update({ [colUpdate]: d.saldo_final })
          .eq('id', d.ag_id)
          .eq('user_id', effectiveUserId);
      }

      // 3. Clean active tables
      await Promise.all([
        supabase.from('carga_actual').delete().eq('user_id', effectiveUserId),
        supabase.from('pagos_semana').delete().eq('user_id', effectiveUserId),
        supabase.from('gastos').delete().eq('user_id', effectiveUserId),
      ]);

      // 4. Advance cycle dates in config_sistema
      const hastaPrev = new Date(systemCycle.hasta);
      const nuevaDesdeDt = new Date(hastaPrev);
      nuevaDesdeDt.setDate(hastaPrev.getDate() + 1);

      const nuevaHastaDt = new Date(nuevaDesdeDt);
      if (systemCycle.tipo === 'DIARIO') {
        nuevaHastaDt.setDate(nuevaDesdeDt.getDate());
      } else {
        nuevaHastaDt.setDate(nuevaDesdeDt.getDate() + 6);
      }

      const nuevaDesdeStr = nuevaDesdeDt.toISOString().slice(0, 10);
      const nuevaHastaStr = nuevaHastaDt.toISOString().slice(0, 10);
      const nuevaSemana = String(Number(systemCycle.semana || 1) + 1);

      // Clean & insert updated cycle configs
      await supabase.from('config_sistema').delete().eq('user_id', effectiveUserId);
      await supabase.from('config_sistema').insert([
        { user_id: effectiveUserId, parametro: 'fecha_desde', valor: nuevaDesdeStr },
        { user_id: effectiveUserId, parametro: 'fecha_hasta', valor: nuevaHastaStr },
        { user_id: effectiveUserId, parametro: 'tipo_cierre', valor: systemCycle.tipo },
        { user_id: effectiveUserId, parametro: 'semana_no', valor: nuevaSemana },
      ]);

      await refreshSystemCycle();

      confetti({ particleCount: 80, spread: 90, origin: { y: 0.6 } });
      setMessage({
        type: 'success',
        text: `¡Ciclo finalizado con éxito! El sistema ha avanzado a la Semana ${nuevaSemana} (${nuevaDesdeStr} al ${nuevaHastaStr}).`,
      });

      setVerifiedCheck(false);
      await loadData();
    } catch (err: any) {
      console.error('Error in weekly closure:', err);
      setMessage({ type: 'error', text: err?.message || 'Error al procesar el cierre semanal.' });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2">
            <span className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <Lock className="w-5 h-5" />
            </span>
            Centro de Cierre y Registro Maestro
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Auditoría de balances finales de agencias, traspaso automático de saldos de arrastre y avance de ciclo operativo.
          </p>
        </div>

        <button
          onClick={() => loadData()}
          disabled={isLoading}
          className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex items-center gap-1.5 transition-all border border-slate-700 cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          Recalcular
        </button>
      </div>

      {message && (
        <div
          className={`p-4 rounded-2xl border flex items-center gap-3 text-sm animate-fade-in ${
            message.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
              : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 shrink-0" />
          ) : (
            <AlertTriangle className="w-5 h-5 shrink-0" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      {/* Cycle Banner */}
      <div className="bg-gradient-to-r from-amber-950/30 via-slate-900 to-slate-900 border border-amber-500/20 rounded-3xl p-6 relative overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-400 bg-amber-400/10 px-2.5 py-1 rounded-full border border-amber-400/20">
              Ciclo Sujeto a Cierre
            </span>
            <h3 className="text-lg font-bold text-white mt-2">
              {systemCycle.tipo === 'SEMANAL' ? `Semana ${systemCycle.semana}` : `Operación Diaria ${systemCycle.semana}`}
            </h3>
            <p className="text-xs text-slate-400 font-mono mt-1">
              Rango actual: <strong className="text-amber-300">{systemCycle.desde}</strong> al{' '}
              <strong className="text-amber-300">{systemCycle.hasta}</strong>
            </p>
          </div>

          <div className="text-right">
            <span className="text-xs text-slate-400 block">Agencias a consolidar:</span>
            <span className="text-xl font-black text-white font-mono">{agencies.length}</span>
          </div>
        </div>
      </div>

      {/* Verified Balances Breakdown Tables */}
      {['BS', 'USD', 'COP'].map((mon) => {
        const monRows = closureData.filter((d) => d.moneda === mon);
        if (monRows.length === 0) return null;

        return (
          <div key={mon} className="bg-[#0D1B22] border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
            <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between">
              <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <span>💰 Balance Verificado {mon}</span>
              </h4>
              <span className="text-[10px] text-slate-400 font-mono">{monRows.length} agencias</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#071217] text-slate-400 border-b border-slate-800 font-bold uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Agencia</th>
                    <th className="py-3 px-4 text-right">Arrastre</th>
                    <th className="py-3 px-4 text-right">Venta Neta</th>
                    <th className="py-3 px-4 text-right">Utilidad</th>
                    <th className="py-3 px-4 text-right">Gastos</th>
                    <th className="py-3 px-4 text-right">Premios</th>
                    <th className="py-3 px-4 text-right">Cobros</th>
                    <th className="py-3 px-4 text-right">Saldo Final</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80 font-mono">
                  {monRows.map((row) => (
                    <tr key={`${row.entidad}_${mon}`} className="hover:bg-slate-800/30 transition-colors">
                      <td className="py-3 px-4 font-sans font-bold text-white">{row.entidad}</td>
                      <td className="py-3 px-4 text-right text-slate-400">{formatCurrency(row.saldo_anterior, mon as any)}</td>
                      <td className="py-3 px-4 text-right text-slate-300">{formatCurrency(row.venta_bruta, mon as any)}</td>
                      <td className="py-3 px-4 text-right text-emerald-400 font-semibold">{formatCurrency(row.utilidad_semana, mon as any)}</td>
                      <td className="py-3 px-4 text-right text-rose-400">{formatCurrency(row.gastos, mon as any)}</td>
                      <td className="py-3 px-4 text-right text-amber-400">{formatCurrency(row.premios, mon as any)}</td>
                      <td className="py-3 px-4 text-right text-cyan-400">{formatCurrency(row.cobros, mon as any)}</td>
                      <td
                        className={`py-3 px-4 text-right font-black ${
                          row.saldo_final > 0 ? 'text-rose-400' : row.saldo_final < 0 ? 'text-cyan-400' : 'text-emerald-400'
                        }`}
                      >
                        {formatCurrency(row.saldo_final, mon as any)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      {/* Confirmation & Finalize Box */}
      <div className="bg-[#0D1B22] border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl space-y-5">
        <div className="flex items-start gap-3 p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl text-xs text-amber-300">
          <ShieldAlert className="w-5 h-5 shrink-0 text-amber-400 mt-0.5" />
          <div className="space-y-1">
            <strong>ADVERTENCIA DE CIERRE DEFINITIVO:</strong>
            <p className="text-slate-300">
              Al finalizar el ciclo, los balances finales calculados se registrarán como los nuevos saldos de arrastre iniciales de las agencias. Los registros actuales de ventas, pagos y gastos del ciclo se archivarán en el registro histórico y las tablas activas quedarán listas para el nuevo período.
            </p>
          </div>
        </div>

        <label className="flex items-center gap-3 cursor-pointer p-3 rounded-2xl border border-slate-800 hover:bg-slate-800/40 transition-colors">
          <input
            type="checkbox"
            checked={verifiedCheck}
            onChange={(e) => setVerifiedCheck(e.target.checked)}
            className="w-5 h-5 rounded text-amber-500 bg-[#071217] border-slate-700 focus:ring-0 cursor-pointer"
          />
          <span className="text-xs font-bold text-white select-none">
            He verificado los montos. Traspasar saldos de arrastre y avanzar el ciclo operativo.
          </span>
        </label>

        <div className="flex justify-end pt-2">
          <button
            onClick={handleFinalizeWeek}
            disabled={!verifiedCheck || isProcessing}
            className="px-8 py-3.5 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs uppercase tracking-wider shadow-xl shadow-amber-500/20 flex items-center gap-2 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Lock className="w-4 h-4" />
            {isProcessing ? 'Finalizando Ciclo...' : 'Finalizar Ciclo y Avanzar'}
          </button>
        </div>
      </div>
    </div>
  );
};
