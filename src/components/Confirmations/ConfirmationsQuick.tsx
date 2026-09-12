import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { normalizarMoneda, formatCurrency, formatDate } from '../../utils/formatters';
import type { ConfirmationTransaction } from '../../types';
import {
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  Search,
  Filter,
  DollarSign,
  Building2,
  User,
  CheckCheck,
  CreditCard,
  Banknote,
  Send,
  AlertTriangle,
  Receipt,
  RotateCcw
} from 'lucide-react';
import confetti from 'canvas-confetti';

export const ConfirmationsQuick: React.FC = () => {
  const { effectiveUserId, user } = useAuth();

  // Filters state
  const [selAgencia, setSelAgencia] = useState('Todas');
  const [searchQuery, setSearchQuery] = useState('');

  // Data state
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transactions, setTransactions] = useState<ConfirmationTransaction[]>([]);
  const [agenciesList, setAgenciesList] = useState<string[]>([]);
  const [cashierMap, setCashierMap] = useState<Record<string, string>>({});

  // Reject modal state
  const [rejectModalItem, setRejectModalItem] = useState<ConfirmationTransaction | null>(null);
  const [rejectReason, setRejectReason] = useState('Comprobante no coincide / No cayó en cuenta');
  const [rejectNote, setRejectNote] = useState('');

  // Bulk confirmation state
  const [isBulkConfirming, setIsBulkConfirming] = useState(false);

  // Feedback message
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Live Sync
  const [lastSyncTime, setLastSyncTime] = useState<Date>(new Date());
  const [isSilentUpdating, setIsSilentUpdating] = useState(false);

  // Load pending data
  const loadData = useCallback(async (isSilent = false) => {
    if (!effectiveUserId) return;
    if (isSilent) {
      setIsSilentUpdating(true);
    } else {
      setIsLoading(true);
      setMessage(null);
    }

    try {
      // 1. Fetch agencies
      const { data: agData } = await supabase
        .from('agencias')
        .select('id, nombre_agencia')
        .eq('user_id', effectiveUserId);

      const ags = (agData || [])
        .map((a: any) => String(a.nombre_agencia || '').trim().toUpperCase())
        .filter(Boolean);
      setAgenciesList(Array.from(new Set(ags)).sort());

      // 2. Fetch cashiers
      const { data: userData } = await supabase
        .from('taquilla_usuarios')
        .select('id, usuario, nombre_cajero')
        .eq('user_id', effectiveUserId);

      const cMap: Record<string, string> = {};
      (userData || []).forEach((u: any) => {
        cMap[String(u.id)] = String(u.nombre_cajero || u.usuario || `ID ${u.id}`);
      });
      setCashierMap(cMap);

      // 3. Fetch transaction tables (only pending: confirmado === false && rechazado === false)
      const [pbRes, gdRes, gcRes, cgRes, pdRes] = await Promise.all([
        supabase.from('cda_pagos_bancarios').select('*').eq('user_id', effectiveUserId),
        supabase.from('cda_gastos_diarios').select('*').eq('user_id', effectiveUserId),
        supabase.from('gastos').select('*').eq('user_id', effectiveUserId),
        supabase.from('cda_gastos').select('*').eq('user_id', effectiveUserId),
        supabase.from('cda_pagos_diarios').select('*').eq('user_id', effectiveUserId),
      ]);

      const list: ConfirmationTransaction[] = [];

      // Bancarios
      (pbRes.data || []).forEach((r: any) => {
        const isRech = !!r.rechazado || String(r.estado || '').toUpperCase() === 'RECHAZADO';
        const isConf = (!!r.confirmado || !!r.confirmado_supervisor) && !isRech;
        if (!isConf && !isRech) {
          const cid = String(r.cajero_id || r.user_id || '');
          const met = String(r.metodo_pago || 'BANCO').trim().toUpperCase();
          const conc = String(r.concepto || 'Pago Bancario');
          const isPremio = ['PREMIO', 'PÉRDIDA', 'PERDIDA', 'ABONO', 'REPOSICION'].some((k) =>
            (conc + ' ' + met).toUpperCase().includes(k)
          );
          let cat = 'Bancos';
          if (isPremio) cat = 'Pago de Premios';
          else if (met.includes('PUNTO')) cat = 'Punto de Venta';

          list.push({
            id: r.id,
            tabla: 'cda_pagos_bancarios',
            categoria: cat,
            fecha: String(r.fecha || r.created_at || ''),
            agencia: String(r.agencia || '').trim().toUpperCase(),
            cajero_id: cid,
            cajero_nombre: cMap[cid] || `ID ${cid}`,
            metodo: met,
            monto: parseFloat(r.monto) || 0,
            moneda: normalizarMoneda(r.moneda),
            referencia: String(r.referencia || 'N/A'),
            concepto: conc,
            pagador: String(r.datos_pagador || 'N/A'),
            confirmado: false,
            rechazado: false,
            created_at: String(r.created_at || ''),
          });
        }
      });

      // Gastos
      const allGastos = [
        ...(gdRes.data || []).map((r: any) => ({ ...r, _table: 'cda_gastos_diarios' })),
        ...(gcRes.data || []).map((r: any) => ({ ...r, _table: 'gastos' })),
        ...(cgRes.data || []).map((r: any) => ({ ...r, _table: 'cda_gastos' })),
      ];

      allGastos.forEach((r: any) => {
        const isRech = !!r.rechazado || String(r.estado || '').toUpperCase() === 'RECHAZADO';
        const isConf = (!!r.confirmado || !!r.confirmado_supervisor) && !isRech;
        if (!isConf && !isRech) {
          const cid = String(r.cajero_id || r.user_id || '');
          list.push({
            id: r.id,
            tabla: r._table,
            categoria: 'Gastos',
            fecha: String(r.fecha || r.created_at || ''),
            agencia: String(r.agencia || r.nombre_agency || '').trim().toUpperCase(),
            cajero_id: cid,
            cajero_nombre: cMap[cid] || `ID ${cid}`,
            metodo: 'GASTO',
            monto: parseFloat(r.monto) || 0,
            moneda: normalizarMoneda(r.moneda),
            referencia: String(r.referencia || 'N/A'),
            concepto: String(r.concepto || r.descripcion || 'Gasto Operativo'),
            pagador: 'N/A',
            confirmado: false,
            rechazado: false,
            created_at: String(r.created_at || ''),
          });
        }
      });

      // Pagos de Taquilla
      (pdRes.data || []).forEach((r: any) => {
        const isRech = !!r.rechazado || String(r.estado || '').toUpperCase() === 'RECHAZADO';
        const isConf = (!!r.confirmado || !!r.confirmado_supervisor) && !isRech;
        if (!isConf && !isRech) {
          const tipo = String(r.tipo_pago || r.metodo || 'EFECTIVO').trim().toUpperCase();
          const cid = String(r.cajero_id || r.user_id || '');
          const isBanco = ['PUNTO', 'POS', 'TRANSFERENCIA', 'ZELLE', 'PAGO MOVIL', 'PAGO MÓVIL'].some((k) =>
            tipo.includes(k)
          );

          list.push({
            id: r.id,
            tabla: 'cda_pagos_diarios',
            categoria: isBanco ? 'Bancos' : 'Efectivo',
            fecha: String(r.fecha || r.created_at || ''),
            agencia: String(r.agencia || r.nombre_agency || '').trim().toUpperCase(),
            cajero_id: cid,
            cajero_nombre: cMap[cid] || `ID ${cid}`,
            metodo: tipo || 'EFECTIVO',
            monto: parseFloat(r.monto) || 0,
            moneda: normalizarMoneda(r.moneda),
            referencia: String(r.referencia || 'N/A'),
            concepto: String(r.concepto || tipo || 'Pago Taquilla'),
            pagador: String(r.pagador || 'N/A'),
            confirmado: false,
            rechazado: false,
            created_at: String(r.created_at || ''),
          });
        }
      });

      // Sort newest first
      list.sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
      setTransactions(list);
      setLastSyncTime(new Date());
    } catch (err: any) {
      console.error('Error loading confirmations:', err);
      setMessage({ type: 'error', text: 'Error al conectar con la base de datos.' });
    } finally {
      setIsLoading(false);
      setIsSilentUpdating(false);
    }
  }, [effectiveUserId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Realtime subscription
  useEffect(() => {
    if (!effectiveUserId) return;
    const channel = supabase
      .channel(`quick_conf_live_${effectiveUserId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cda_pagos_bancarios' }, () => loadData(true))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cda_gastos_diarios' }, () => loadData(true))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'gastos' }, () => loadData(true))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cda_pagos_diarios' }, () => loadData(true))
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [effectiveUserId, loadData]);

  // Filtered list
  const filteredTransactions = useMemo(() => {
    return transactions.filter((tx) => {
      if (selAgencia !== 'Todas' && tx.agencia !== selAgencia) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const refM = tx.referencia.toLowerCase().includes(q);
        const agM = tx.agencia.toLowerCase().includes(q);
        const pagM = tx.pagador.toLowerCase().includes(q);
        const concM = tx.concepto.toLowerCase().includes(q);
        const metM = tx.metodo.toLowerCase().includes(q);
        if (!refM && !agM && !pagM && !concM && !metM) return false;
      }
      return true;
    });
  }, [transactions, selAgencia, searchQuery]);

  // Metrics totals for pending transactions
  const metrics = useMemo(() => {
    let bs = 0;
    let usd = 0;
    let cop = 0;
    filteredTransactions.forEach((tx) => {
      if (tx.moneda === 'BS') bs += tx.monto;
      else if (tx.moneda === 'COP') cop += tx.monto;
      else usd += tx.monto;
    });
    return { count: filteredTransactions.length, bs, usd, cop };
  }, [filteredTransactions]);

  // Action: Confirm Single
  const handleConfirmSingle = async (tx: ConfirmationTransaction) => {
    setIsProcessing(true);
    const currentUser = (user?.email || 'ADMIN').split('@')[0].toUpperCase();

    try {
      // 1. Update in primary table
      const { error: updErr } = await supabase
        .from(tx.tabla)
        .update({
          confirmado: true,
          confirmado_por: currentUser,
          rechazado: false,
          rechazado_por: null,
          motivo_rechazo: null,
          fecha_rechazo: null,
        })
        .eq('id', tx.id);

      if (updErr) throw updErr;

      // 2. Synchronize cda_pagos_bancarios to pagos_semana
      if (tx.tabla === 'cda_pagos_bancarios') {
        try {
          const { data: psMatch } = await supabase
            .from('pagos_semana')
            .select('id, referencia')
            .eq('user_id', effectiveUserId)
            .eq('agencia', tx.agencia)
            .eq('monto', tx.monto);

          let alreadyInPs = false;
          if (psMatch && psMatch.length > 0) {
            for (const ps of psMatch) {
              const rStr = String(ps.referencia || '').toUpperCase();
              if (tx.referencia !== 'N/A' && rStr.includes(tx.referencia)) {
                alreadyInPs = true;
                await supabase.from('pagos_semana').update({ confirmado: true, rechazado: false }).eq('id', ps.id);
                break;
              }
            }
          }

          if (!alreadyInPs && tx.agencia && tx.monto > 0) {
            let refLabel = `REF: ${tx.referencia}`;
            if (tx.pagador && tx.pagador !== 'N/A') refLabel += ` - ${tx.pagador}`;
            refLabel += ' [✅ CONFIRMADO BANCO]';

            const conc = tx.concepto.toUpperCase();
            const isPremio = ['PREMIO', 'PÉRDIDA', 'PERDIDA', 'ABONO', 'REPOSICION'].some((k) =>
              (conc + ' ' + tx.metodo).includes(k)
            );

            await supabase.from('pagos_semana').insert({
              user_id: effectiveUserId,
              agencia: tx.agencia,
              moneda: tx.moneda,
              tipo_pago: isPremio ? 'Pago de Premios' : 'Pago',
              metodo: ['BANCO', 'EFECTIVO', 'TRANSFERENCIA', 'PAGO MOVIL', 'ZELLE', 'POS'].includes(tx.metodo)
                ? tx.metodo
                : 'BANCO',
              monto: tx.monto,
              referencia: refLabel.toUpperCase(),
              confirmado: true,
              confirmado_por: currentUser,
              rechazado: false,
              fecha: tx.fecha || new Date().toISOString(),
            });
          }
        } catch (e) {
          console.warn('Sync pagos_semana warning:', e);
        }
      } else if (tx.tabla === 'cda_pagos_diarios') {
        try {
          await supabase
            .from('cda_pagos_diarios')
            .update({
              confirmado_supervisor: true,
              supervisor_nombre: currentUser,
              confirmado: true,
              rechazado: false,
            })
            .eq('id', tx.id);
        } catch (e) {
          console.warn('Sync cda_pagos_diarios warning:', e);
        }
      }

      // Optimistic update
      setTransactions((prev) => prev.filter((item) => !(item.id === tx.id && item.tabla === tx.tabla)));

      if (transactions.length <= 1) {
        confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 } });
      }
    } catch (err: any) {
      console.error('Confirm error:', err);
      setMessage({ type: 'error', text: `Error al confirmar: ${err.message}` });
    } finally {
      setIsProcessing(false);
    }
  };

  // Action: Open Reject Modal
  const handleOpenRejectModal = (tx: ConfirmationTransaction) => {
    setRejectModalItem(tx);
    setRejectReason('Comprobante no coincide / No cayó en cuenta');
    setRejectNote('');
  };

  // Action: Submit Reject
  const handleSubmitReject = async () => {
    if (!rejectModalItem) return;
    setIsProcessing(true);
    const currentUser = (user?.email || 'ADMIN').split('@')[0].toUpperCase();
    const finalReason = rejectNote.trim() ? `${rejectReason}: ${rejectNote.trim()}` : rejectReason;

    try {
      const { error: rejErr } = await supabase
        .from(rejectModalItem.tabla)
        .update({
          confirmado: false,
          confirmado_por: null,
          rechazado: true,
          rechazado_por: currentUser,
          motivo_rechazo: finalReason,
          fecha_rechazo: new Date().toISOString(),
        })
        .eq('id', rejectModalItem.id);

      if (rejErr) throw rejErr;

      // Sincronizaciones en rechazo
      if (rejectModalItem.tabla === 'cda_pagos_bancarios') {
        try {
          await supabase
            .from('cda_pagos_diarios')
            .update({
              confirmado: false,
              confirmado_supervisor: false,
              rechazado: true,
              rechazado_por: currentUser,
              motivo_rechazo: finalReason,
            })
            .eq('agencia', rejectModalItem.agencia)
            .eq('monto', rejectModalItem.monto);
        } catch (e) {
          console.warn('Sync cda_pagos_diarios reject error:', e);
        }
      } else if (rejectModalItem.tabla === 'cda_pagos_diarios') {
        try {
          await supabase.from('cda_caja_efectivo_supervisor').delete().eq('pago_id', rejectModalItem.id);
        } catch (e) {
          console.warn('Sync cda_caja delete error:', e);
        }
      }

      setTransactions((prev) =>
        prev.filter((item) => !(item.id === rejectModalItem.id && item.tabla === rejectModalItem.tabla))
      );
      setRejectModalItem(null);
    } catch (err: any) {
      console.error('Reject error:', err);
      setMessage({ type: 'error', text: `Error al rechazar: ${err.message}` });
    } finally {
      setIsProcessing(false);
    }
  };

  // Action: Bulk Confirm All Visible
  const handleBulkConfirmAll = async () => {
    if (filteredTransactions.length === 0) return;
    setIsBulkConfirming(true);
    const currentUser = (user?.email || 'ADMIN').split('@')[0].toUpperCase();

    try {
      for (const tx of filteredTransactions) {
        await supabase
          .from(tx.tabla)
          .update({
            confirmado: true,
            confirmado_por: currentUser,
            rechazado: false,
            rechazado_por: null,
            motivo_rechazo: null,
          })
          .eq('id', tx.id);
      }

      confetti({ particleCount: 120, spread: 90, origin: { y: 0.6 } });
      setMessage({ type: 'success', text: `¡Se confirmaron ${filteredTransactions.length} transacciones exitosamente!` });
      await loadData();
    } catch (err: any) {
      console.error('Bulk confirm error:', err);
      setMessage({ type: 'error', text: 'Ocurrió un error al procesar la confirmación masiva.' });
    } finally {
      setIsBulkConfirming(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#0D1B22] p-5 rounded-2xl border border-slate-800/80 shadow-lg">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <CheckCheck className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-black text-white tracking-tight flex items-center gap-2">
                <span>Confirmaciones</span>
                <span className="px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 text-xs font-bold font-mono">
                  {metrics.count} pendientes
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Pizarra operativa: Verificación y aprobación rápida en 1 clic de transferencias, puntos de venta, gastos y efectivo.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Realtime / Sync Badge */}
          <button
            onClick={() => loadData()}
            disabled={isLoading}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 hover:text-white text-xs font-bold transition-all border border-slate-700/50 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-emerald-400 ${isLoading || isSilentUpdating ? 'animate-spin' : ''}`} />
            <span>Sincronizar</span>
          </button>

          {metrics.count > 0 && (
            <button
              onClick={handleBulkConfirmAll}
              disabled={isBulkConfirming || isProcessing}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-black text-xs font-extrabold shadow-md shadow-emerald-500/20 transition-all cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{isBulkConfirming ? 'Confirmando...' : `Confirmar Todos (${metrics.count})`}</span>
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      {message && (
        <div
          className={`p-4 rounded-xl text-xs font-bold border flex items-center justify-between animate-fade-in ${
            message.type === 'success'
              ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
              : 'bg-rose-500/10 text-rose-300 border-rose-500/30'
          }`}
        >
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)} className="text-slate-400 hover:text-white cursor-pointer font-black">
            ✕
          </button>
        </div>
      )}

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="p-4 rounded-2xl bg-[#0D1B22] border border-slate-800/80 shadow-xs flex items-center gap-3.5">
          <div className="p-3 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 shrink-0">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total Pendientes</div>
            <div className="text-2xl font-black text-amber-400 font-mono mt-0.5">{metrics.count}</div>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-[#0D1B22] border border-slate-800/80 shadow-xs flex items-center gap-3.5">
          <div className="p-3 rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20 shrink-0">
            <DollarSign className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Pendiente Bolívares</div>
            <div className="text-lg font-black text-white font-mono mt-0.5">{formatCurrency(metrics.bs, 'BS')}</div>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-[#0D1B22] border border-slate-800/80 shadow-xs flex items-center gap-3.5">
          <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
            <DollarSign className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Pendiente Dólares</div>
            <div className="text-lg font-black text-emerald-400 font-mono mt-0.5">{formatCurrency(metrics.usd, 'USD')}</div>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-[#0D1B22] border border-slate-800/80 shadow-xs flex items-center gap-3.5">
          <div className="p-3 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 shrink-0">
            <DollarSign className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Pendiente Pesos COP</div>
            <div className="text-lg font-black text-white font-mono mt-0.5">{formatCurrency(metrics.cop, 'COP')}</div>
          </div>
        </div>
      </div>

      {/* Quick Filters */}
      <div className="p-4 rounded-2xl bg-[#0D1B22] border border-slate-800/80 flex flex-col md:flex-row items-center gap-3.5">
        <div className="w-full md:w-64">
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Agencia</label>
          <div className="relative">
            <select
              value={selAgencia}
              onChange={(e) => setSelAgencia(e.target.value)}
              className="w-full pl-3 pr-8 py-2 bg-slate-900 border border-slate-700/80 rounded-xl text-xs font-bold text-white focus:outline-hidden focus:border-emerald-500 cursor-pointer"
            >
              <option value="Todas">Todas las Agencias</option>
              {agenciesList.map((ag) => (
                <option key={ag} value={ag}>
                  {ag}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="w-full flex-1">
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Buscar</label>
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Buscar por referencia, pagador, concepto o método..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-700/80 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-hidden focus:border-emerald-500"
            />
          </div>
        </div>
      </div>

      {/* Pending Items List */}
      {isLoading ? (
        <div className="p-12 text-center bg-[#0D1B22] rounded-2xl border border-slate-800/80">
          <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-xs text-slate-400">Cargando transacciones pendientes...</p>
        </div>
      ) : filteredTransactions.length === 0 ? (
        <div className="p-16 text-center bg-[#0D1B22] rounded-2xl border border-slate-800/80 flex flex-col items-center justify-center">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mb-4">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-black text-white tracking-tight">¡Todo al día!</h3>
          <p className="text-xs text-slate-400 max-w-sm mt-1">
            No hay transacciones pendientes por confirmar con los filtros seleccionados.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs font-bold text-slate-400 px-1">
            <span>Mostrando {filteredTransactions.length} registros pendientes:</span>
          </div>

          <div className="grid grid-cols-1 gap-3">
            {filteredTransactions.map((tx) => {
              const isBanco = tx.categoria === 'Bancos' || tx.categoria === 'Punto de Venta';
              const isGasto = tx.categoria === 'Gastos';

              return (
                <div
                  key={`${tx.tabla}_${tx.id}`}
                  className="p-4 rounded-2xl bg-[#0D1B22] border border-slate-800/90 hover:border-emerald-500/40 transition-all shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4 group"
                >
                  {/* Left: Info details */}
                  <div className="space-y-2 flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-black text-white flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span>{tx.agencia}</span>
                      </span>

                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider ${
                          isGasto
                            ? 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                            : isBanco
                            ? 'bg-sky-500/15 text-sky-300 border border-sky-500/30'
                            : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                        }`}
                      >
                        {tx.categoria}
                      </span>

                      <span className="px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[10px] font-bold flex items-center gap-1">
                        <Clock className="w-2.5 h-2.5" />
                        <span>Pendiente</span>
                      </span>

                      <span className="text-[11px] text-slate-400 font-mono">{formatDate(tx.fecha)}</span>
                    </div>

                    {/* Metadata Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-slate-300 pt-1">
                      <div>
                        <span className="text-[10px] text-slate-500 uppercase block font-bold">Método</span>
                        <span className="font-semibold text-slate-200">{tx.metodo}</span>
                      </div>

                      <div>
                        <span className="text-[10px] text-slate-500 uppercase block font-bold">Referencia</span>
                        <span className="font-mono font-bold text-amber-300 break-all">{tx.referencia}</span>
                      </div>

                      <div>
                        <span className="text-[10px] text-slate-500 uppercase block font-bold">Cajero</span>
                        <span className="text-slate-300">{tx.cajero_nombre}</span>
                      </div>

                      <div>
                        <span className="text-[10px] text-slate-500 uppercase block font-bold">Pagador / Concepto</span>
                        <span className="text-slate-300 truncate block">
                          {tx.pagador !== 'N/A' ? tx.pagador : tx.concepto}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Right: Amount & Actions */}
                  <div className="flex items-center justify-between lg:justify-end gap-4 shrink-0 pt-3 lg:pt-0 border-t lg:border-t-0 border-slate-800">
                    <div className="text-right">
                      <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Monto</div>
                      <div className="text-xl font-black text-emerald-400 font-mono">
                        {formatCurrency(tx.monto, tx.moneda)}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleConfirmSingle(tx)}
                        disabled={isProcessing}
                        className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-black flex items-center gap-1.5 shadow-md shadow-emerald-500/10 transition-all cursor-pointer"
                        title="Aprobar transacción"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Aprobar</span>
                      </button>

                      <button
                        onClick={() => handleOpenRejectModal(tx)}
                        disabled={isProcessing}
                        className="px-3 py-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 hover:text-rose-300 border border-rose-500/30 text-xs font-bold flex items-center gap-1 transition-all cursor-pointer"
                        title="Rechazar transacción"
                      >
                        <XCircle className="w-4 h-4" />
                        <span>Rechazar</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {rejectModalItem && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-[#0D1B22] border border-rose-500/30 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl animate-scale-up">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-rose-400 font-black text-base">
                <AlertTriangle className="w-5 h-5" />
                <span>Rechazar Transacción</span>
              </div>
              <button
                onClick={() => setRejectModalItem(null)}
                className="text-slate-400 hover:text-white cursor-pointer font-bold"
              >
                ✕
              </button>
            </div>

            <div className="p-3 bg-slate-900/90 rounded-xl border border-slate-800 space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">Agencia:</span>
                <span className="font-bold text-white">{rejectModalItem.agencia}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Monto:</span>
                <span className="font-bold text-emerald-400 font-mono">
                  {formatCurrency(rejectModalItem.monto, rejectModalItem.moneda)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Referencia:</span>
                <span className="font-mono text-amber-400">{rejectModalItem.referencia}</span>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">Causa principal del rechazo</label>
                <select
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  className="w-full p-2.5 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white focus:outline-hidden focus:border-rose-500"
                >
                  <option value="Comprobante no coincide / No cayó en cuenta">Comprobante no coincide / No cayó en cuenta</option>
                  <option value="Monto transferido incorrecto">Monto transferido incorrecto</option>
                  <option value="Referencia duplicada / Ya registrada">Referencia duplicada / Ya registrada</option>
                  <option value="No autorizado por Administración">No autorizado por Administración</option>
                  <option value="Otro motivo">Otro motivo</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">Nota explicativa (opcional)</label>
                <textarea
                  value={rejectNote}
                  onChange={(e) => setRejectNote(e.target.value)}
                  placeholder="Detalles adicionales sobre el rechazo..."
                  rows={2}
                  className="w-full p-2.5 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-hidden focus:border-rose-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRejectModalItem(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-all cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSubmitReject}
                disabled={isProcessing}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-md shadow-rose-600/20 transition-all cursor-pointer"
              >
                {isProcessing ? 'Procesando...' : 'Confirmar Rechazo'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
