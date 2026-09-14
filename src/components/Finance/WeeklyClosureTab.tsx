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
  ShieldAlert,
  Download,
  Undo2,
  FileSpreadsheet,
  X
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
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [hasRollbackBackup, setHasRollbackBackup] = useState(false);
  const [lastClosurePeriodo, setLastClosurePeriodo] = useState<string | null>(null);

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

      // Check for rollback availability
      const hasLocalBackup = Boolean(localStorage.getItem('cms_last_closure_backup'));
      const { data: pastCierres } = await supabase
        .from('cierres_semanales')
        .select('periodo, fecha_cierre')
        .eq('user_id', effectiveUserId)
        .order('fecha_cierre', { ascending: false })
        .limit(1);

      if (pastCierres && pastCierres.length > 0) {
        setLastClosurePeriodo(pastCierres[0].periodo);
        setHasRollbackBackup(true);
      } else {
        setLastClosurePeriodo(null);
        setHasRollbackBackup(hasLocalBackup);
      }
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
        const nom = String(ag.nombre_agencia || '').trim().toUpperCase();
        const confMon = String(ag.monedas || '').toUpperCase();
        const sAnt = Number(ag[colIni] || 0);

        if (confMon.includes(m) || Math.abs(sAnt) > 0.01) {
          // Ventas: la venta neta (neto) es la utilidad real del período
          const agSales = sales.filter((s) => s.agencia === nom && normalizarMoneda(s.moneda) === m);
          const brutoTotal = agSales.reduce((sum, curr) => sum + Number(curr.neto || 0), 0);
          const utilVal = brutoTotal;

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

          // Final Balance: Arrastre + Venta Neta - Gastos - Cobros + Premios
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

  const nextCyclePreview = useMemo(() => {
    if (!systemCycle.hasta) return { semana: '?', desde: '?', hasta: '?' };
    const [y, m, d] = systemCycle.hasta.split('-').map(Number);
    const nuevaDesdeDt = new Date(y, m - 1, d + 1);
    const nuevaHastaDt = new Date(y, m - 1, d + 1);
    if (systemCycle.tipo !== 'DIARIO') {
      nuevaHastaDt.setDate(nuevaHastaDt.getDate() + 6);
    }
    const pad = (n: number) => String(n).padStart(2, '0');
    const desde = `${nuevaDesdeDt.getFullYear()}-${pad(nuevaDesdeDt.getMonth() + 1)}-${pad(nuevaDesdeDt.getDate())}`;
    const hasta = `${nuevaHastaDt.getFullYear()}-${pad(nuevaHastaDt.getMonth() + 1)}-${pad(nuevaHastaDt.getDate())}`;
    const semana = String(Number(systemCycle.semana || 1) + 1);
    return { semana, desde, hasta };
  }, [systemCycle]);

  const totalsByCurrency = useMemo(() => {
    const res: Record<string, { totalVenta: number; totalSaldoFinal: number; count: number }> = {};
    for (const d of closureData) {
      if (!res[d.moneda]) {
        res[d.moneda] = { totalVenta: 0, totalSaldoFinal: 0, count: 0 };
      }
      res[d.moneda].totalVenta += d.venta_bruta;
      res[d.moneda].totalSaldoFinal += d.saldo_final;
      res[d.moneda].count += 1;
    }
    return res;
  }, [closureData]);

  // CSV Export for Accountant Backup
  const handleDownloadBackupCSV = () => {
    if (closureData.length === 0) return;
    const headers = [
      'Agencia',
      'Moneda',
      'Arrastre',
      'Venta Neta',
      'Gastos',
      'Premios',
      'Cobros',
      'Saldo Final'
    ];
    const rows = closureData.map((d) => [
      `"${d.entidad}"`,
      d.moneda,
      d.saldo_anterior.toFixed(2),
      d.venta_bruta.toFixed(2),
      d.gastos.toFixed(2),
      d.premios.toFixed(2),
      d.cobros.toFixed(2),
      d.saldo_final.toFixed(2),
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Respaldo_Cierre_Semana_${systemCycle.semana}_${systemCycle.desde}_al_${systemCycle.hasta}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Rollback Last Closure Handler
  const handleRollbackLastClosure = async () => {
    const rawBackup = localStorage.getItem('cms_last_closure_backup');
    if (!rawBackup && !lastClosurePeriodo) {
      alert('No se encontró información de respaldo para revertir el último cierre.');
      return;
    }

    const backupData = rawBackup ? JSON.parse(rawBackup) : null;
    const targetPeriodo = backupData?.periodo || lastClosurePeriodo;
    const targetSemana = backupData?.semana_no || 'anterior';

    if (!window.confirm(`⚠️ ¿Está seguro de DESHACER EL ÚLTIMO CIERRE (${targetPeriodo})?\n\nEsta acción:\n1. Restaurará los saldos de arrastre previos de las agencias.\n2. Devolverá el ciclo a la Semana ${targetSemana}.\n3. Restaurará las tablas de ventas activas del período.`)) {
      return;
    }

    setIsProcessing(true);
    setMessage(null);

    try {
      // 1. Restaurar saldos iniciales de las agencias
      if (backupData?.agenciesSnapshot && backupData.agenciesSnapshot.length > 0) {
        for (const agSnap of backupData.agenciesSnapshot) {
          await supabase
            .from('agencias')
            .update({
              saldo_inicial_bs: agSnap.saldo_inicial_bs,
              saldo_inicial_usd: agSnap.saldo_inicial_usd,
              saldo_inicial_cop: agSnap.saldo_inicial_cop,
            })
            .eq('id', agSnap.id)
            .eq('user_id', effectiveUserId);
        }
      }

      // 2. Restaurar ventas en carga_actual si existen en backup
      if (backupData?.salesBackup && backupData.salesBackup.length > 0) {
        await supabase.from('carga_actual').delete().eq('user_id', effectiveUserId);
        const salesToRestore = backupData.salesBackup.map((s: any) => {
          const { id, ...rest } = s;
          return { ...rest, user_id: effectiveUserId };
        });
        await supabase.from('carga_actual').insert(salesToRestore);
      }

      // 3. Restaurar pagos_semana si existen en backup
      if (backupData?.paymentsBackup && backupData.paymentsBackup.length > 0) {
        await supabase.from('pagos_semana').delete().eq('user_id', effectiveUserId);
        const paymentsToRestore = backupData.paymentsBackup.map((p: any) => {
          const { id, ...rest } = p;
          return { ...rest, user_id: effectiveUserId };
        });
        await supabase.from('pagos_semana').insert(paymentsToRestore);
      }

      // 4. Restaurar fechas en config_sistema
      if (backupData?.desde && backupData?.hasta && backupData?.semana_no) {
        const cycleRollback = [
          { parametro: 'fecha_desde', valor: backupData.desde },
          { parametro: 'fecha_hasta', valor: backupData.hasta },
          { parametro: 'tipo_cierre', valor: backupData.tipo_cierre || 'SEMANAL' },
          { parametro: 'semana_no', valor: backupData.semana_no },
        ];
        for (const item of cycleRollback) {
          await supabase.from('config_sistema').upsert(
            { user_id: effectiveUserId, parametro: item.parametro, valor: item.valor },
            { onConflict: 'user_id,parametro' }
          );
        }
      }

      // 5. Eliminar el registro en cierres_semanales
      if (targetPeriodo) {
        await supabase
          .from('cierres_semanales')
          .delete()
          .eq('user_id', effectiveUserId)
          .eq('periodo', targetPeriodo);
      }

      // Limpiar backup consumido
      localStorage.removeItem('cms_last_closure_backup');
      setHasRollbackBackup(false);

      await refreshSystemCycle();
      await loadData();

      setMessage({
        type: 'success',
        text: `✅ El cierre de la Semana ${targetSemana} ha sido revertido exitosamente. Los datos y fechas previas han sido restaurados.`,
      });
    } catch (err: any) {
      console.error('Error rolling back closure:', err);
      setMessage({ type: 'error', text: err?.message || 'Error al revertir el cierre.' });
    } finally {
      setIsProcessing(false);
    }
  };

  // Execute Cycle Finalization
  const handleFinalizeWeek = async () => {
    if (!effectiveUserId) return;
    setIsProcessing(true);
    setMessage(null);

    try {
      const periodoActual = `${systemCycle.desde} al ${systemCycle.hasta}`;
      const nowIso = new Date().toISOString();

      // 0. AUTO-BACKUP PRE-CIERRE
      const preClosureBackup = {
        timestamp: nowIso,
        periodo: periodoActual,
        semana_no: systemCycle.semana,
        tipo_cierre: systemCycle.tipo,
        desde: systemCycle.desde,
        hasta: systemCycle.hasta,
        closureData,
        agenciesSnapshot: agencies.map((ag) => ({
          id: ag.id,
          nombre_agencia: ag.nombre_agencia,
          saldo_inicial_bs: ag.saldo_inicial_bs,
          saldo_inicial_usd: ag.saldo_inicial_usd,
          saldo_inicial_cop: ag.saldo_inicial_cop,
        })),
        salesBackup: sales,
        paymentsBackup: payments,
        expensesBackup: expenses,
      };

      try {
        localStorage.setItem(`cms_backup_semana_${systemCycle.semana}_${Date.now()}`, JSON.stringify(preClosureBackup));
        localStorage.setItem('cms_last_closure_backup', JSON.stringify(preClosureBackup));
      } catch (e) {
        console.warn('Could not save localStorage backup:', e);
      }

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

      // 4. Advance cycle dates in config_sistema (timezone-safe)
      const [y, m, d] = systemCycle.hasta.split('-').map(Number);
      const nuevaDesdeDt = new Date(y, m - 1, d + 1);
      const nuevaHastaDt = new Date(y, m - 1, d + 1);
      if (systemCycle.tipo === 'DIARIO') {
        // Misma fecha para ciclo diario
      } else {
        nuevaHastaDt.setDate(nuevaHastaDt.getDate() + 6);
      }

      const pad = (n: number) => String(n).padStart(2, '0');
      const nuevaDesdeStr = `${nuevaDesdeDt.getFullYear()}-${pad(nuevaDesdeDt.getMonth() + 1)}-${pad(nuevaDesdeDt.getDate())}`;
      const nuevaHastaStr = `${nuevaHastaDt.getFullYear()}-${pad(nuevaHastaDt.getMonth() + 1)}-${pad(nuevaHastaDt.getDate())}`;
      const nuevaSemana = String(Number(systemCycle.semana || 1) + 1);

      // Upsert updated cycle configs without wiping other user settings
      const cycleUpdates = [
        { parametro: 'fecha_desde', valor: nuevaDesdeStr },
        { parametro: 'fecha_hasta', valor: nuevaHastaStr },
        { parametro: 'tipo_cierre', valor: systemCycle.tipo },
        { parametro: 'semana_no', valor: nuevaSemana },
      ];

      for (const item of cycleUpdates) {
        await supabase.from('config_sistema').upsert(
          { user_id: effectiveUserId, parametro: item.parametro, valor: item.valor },
          { onConflict: 'user_id,parametro' }
        );
      }

      await refreshSystemCycle();

      confetti({ particleCount: 90, spread: 100, origin: { y: 0.6 } });
      setMessage({
        type: 'success',
        text: `¡Ciclo finalizado con éxito! El sistema ha avanzado a la Semana ${nuevaSemana} (${nuevaDesdeStr} al ${nuevaHastaStr}). Se ha guardado un respaldo seguro.`,
      });

      setIsConfirmModalOpen(false);
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

        <div className="flex flex-wrap items-center gap-2">
          {hasRollbackBackup && (
            <button
              onClick={handleRollbackLastClosure}
              disabled={isProcessing}
              title="Deshacer el último cierre y restaurar saldos y tablas activas previas"
              className="px-3.5 py-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs font-semibold flex items-center gap-1.5 transition-all border border-rose-500/30 cursor-pointer disabled:opacity-50"
            >
              <Undo2 className="w-3.5 h-3.5" />
              Deshacer Último Cierre
            </button>
          )}

          <button
            onClick={handleDownloadBackupCSV}
            disabled={closureData.length === 0}
            title="Descargar copia de respaldo de balances en formato CSV"
            className="px-3.5 py-2.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-xs font-semibold flex items-center gap-1.5 transition-all border border-emerald-500/30 cursor-pointer disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            Exportar Respaldo (CSV)
          </button>

          <button
            onClick={() => loadData()}
            disabled={isLoading}
            className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex items-center gap-1.5 transition-all border border-slate-700 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            Recalcular
          </button>
        </div>
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
                      <td className={`py-3 px-4 text-right font-semibold ${row.venta_bruta >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {formatCurrency(row.venta_bruta, mon as any)}
                      </td>
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
            onClick={() => setIsConfirmModalOpen(true)}
            disabled={!verifiedCheck || isProcessing}
            className="px-8 py-3.5 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs uppercase tracking-wider shadow-xl shadow-amber-500/20 flex items-center gap-2 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Lock className="w-4 h-4" />
            {isProcessing ? 'Procesando Cierre...' : 'Finalizar Ciclo y Avanzar'}
          </button>
        </div>
      </div>

      {/* Modal de Confirmación Pre-Cierre */}
      {isConfirmModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#0D1B22] border border-amber-500/30 rounded-3xl max-w-xl w-full p-6 sm:p-8 shadow-2xl space-y-6 relative">
            <button
              onClick={() => !isProcessing && setIsConfirmModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-2 rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3">
              <div className="p-3 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
                <Lock className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-black text-white">Confirmación de Cierre Maestro</h3>
                <p className="text-xs text-slate-400">
                  {systemCycle.tipo === 'SEMANAL' ? `Semana ${systemCycle.semana}` : `Operación Diaria ${systemCycle.semana}`} ({systemCycle.desde} al {systemCycle.hasta})
                </p>
              </div>
            </div>

            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-3 text-xs">
              <div className="flex justify-between items-center pb-2 border-b border-slate-800">
                <span className="text-slate-400">Agencias auditadas:</span>
                <span className="font-bold font-mono text-white">{agencies.length} agencias</span>
              </div>
              <div className="flex justify-between items-center pb-2 border-b border-slate-800">
                <span className="text-slate-400">Registros de venta a archivar:</span>
                <span className="font-bold font-mono text-white">{sales.length} registros</span>
              </div>

              <div className="pt-1">
                <span className="text-slate-400 block mb-2 font-semibold uppercase tracking-wider text-[10px]">
                  Resumen de Balances a Traspasar a Arrastre:
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {Object.entries(totalsByCurrency).map(([mon, data]) => (
                    <div key={mon} className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800">
                      <span className="text-[10px] font-bold text-amber-400 block">{mon}</span>
                      <span className="text-xs font-mono font-bold text-white block">
                        {formatCurrency(data.totalSaldoFinal, mon as any)}
                      </span>
                      <span className="text-[10px] text-slate-400 block">
                        Venta Neta: {formatCurrency(data.totalVenta, mon as any)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 mt-3 text-amber-300">
                <div className="flex items-center gap-2 font-bold mb-1">
                  <ArrowRight className="w-4 h-4 text-amber-400" />
                  Próximo Ciclo Operativo:
                </div>
                <p className="text-[11px] text-slate-300">
                  El sistema avanzará a la <strong className="text-white">Semana {nextCyclePreview.semana}</strong> con rango de fechas <strong className="text-amber-300">{nextCyclePreview.desde}</strong> al <strong className="text-amber-300">{nextCyclePreview.hasta}</strong>.
                </p>
              </div>

              <div className="text-[11px] text-emerald-400/90 flex items-center gap-1.5 pt-1">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                Se creará automáticamente una copia de seguridad en memoria antes de aplicar los cambios.
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsConfirmModalOpen(false)}
                disabled={isProcessing}
                className="flex-1 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs uppercase tracking-wider transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleFinalizeWeek}
                disabled={isProcessing}
                className="flex-1 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs uppercase tracking-wider shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
              >
                {isProcessing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Procesando Cierre...
                  </>
                ) : (
                  <>
                    <Lock className="w-4 h-4" />
                    Confirmar y Ejecutar Cierre
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
