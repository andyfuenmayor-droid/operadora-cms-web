import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { normalizarMoneda, formatCurrency, formatDate } from '../../utils/formatters';
import type { ConfirmationTransaction } from '../../types';
import {
  CheckCircle2,
  XCircle,
  RotateCcw,
  Clock,
  Filter,
  RefreshCw,
  Search,
  Printer,
  Share2,
  DollarSign,
  Building2,
  Calendar,
  AlertTriangle,
  FileText,
  User,
  CheckCheck,
  CreditCard,
  Banknote,
  Send,
  ArrowRight,
  TrendingUp,
  ShieldCheck,
  ChevronDown
} from 'lucide-react';
import confetti from 'canvas-confetti';

interface CustodiaAgencia {
  agencia: string;
  supervisor: string;
  arrastre_cop: number;
  recaudado_cop: number;
  liquidado_cop: number;
  custodia_taquilla_cop: number;
  en_ruta_cop: number;
  custodia_usd: number;
  custodia_bs: number;
  status: 'custodia' | 'ruta' | 'al_dia';
}

export const ConfirmationsBoard: React.FC = () => {
  const { effectiveUserId, systemCycle, user } = useAuth();

  // Active sub-tab
  const [activeTab, setActiveTab] = useState<'rapidas' | 'rechazados' | 'arqueo'>('rapidas');

  // Filters state
  const [fechaDesde, setFechaDesde] = useState(systemCycle.desde);
  const [fechaHasta, setFechaHasta] = useState(systemCycle.hasta);
  const [selAgencia, setSelAgencia] = useState('Todas');
  const [selCajero, setSelCajero] = useState('Todos');
  const [selCategoria, setSelCategoria] = useState('Todas');
  const [selEstado, setSelEstado] = useState<'Pendientes' | 'Confirmados' | 'Rechazados' | 'Todos'>('Pendientes');
  const [searchQuery, setSearchQuery] = useState('');

  // Loaded data
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transactions, setTransactions] = useState<ConfirmationTransaction[]>([]);
  const [agenciesList, setAgenciesList] = useState<string[]>([]);
  const [cashiersList, setCashiersList] = useState<string[]>([]);
  const [cajaSupervisorRows, setCajaSupervisorRows] = useState<any[]>([]);

  // Modals state
  const [rejectModalItem, setRejectModalItem] = useState<ConfirmationTransaction | null>(null);
  const [rejectReason, setRejectReason] = useState('Comprobante no coincide / No cayó en cuenta');
  const [rejectNote, setRejectNote] = useState('');

  // Receipt modal state
  const [receiptModalItem, setReceiptModalItem] = useState<any | null>(null);

  // New Cash Entry Form state (Tab 3)
  const [formAgencia, setFormAgencia] = useState('');
  const [formSupervisor, setFormSupervisor] = useState('');
  const [formMoneda, setFormMoneda] = useState<'COP' | 'USD' | 'BS'>('COP');
  const [formMonto, setFormMonto] = useState('');
  const [formNota, setFormNota] = useState('');
  const [isSubmittingCash, setIsSubmittingCash] = useState(false);

  // Feedback message
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Auto-sync & Realtime state
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(true);
  const [isSilentUpdating, setIsSilentUpdating] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date>(new Date());
  const [secondsAgo, setSecondsAgo] = useState(0);

  // Load all data (isSilent avoids blocking full UI on background updates)
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
        .select('id, nombre_agencia, auditoria_activa')
        .eq('user_id', effectiveUserId);

      const ags = (agData || [])
        .map((a: any) => String(a.nombre_agencia || '').trim().toUpperCase())
        .filter(Boolean);
      const uniqueAgs = Array.from(new Set(ags)).sort();
      setAgenciesList(uniqueAgs);

      // 2. Fetch cashiers
      const { data: userData } = await supabase
        .from('taquilla_usuarios')
        .select('id, usuario, nombre_cajero, rol')
        .eq('user_id', effectiveUserId);

      const cajs = (userData || [])
        .map((u: any) => String(u.nombre_cajero || u.usuario || '').trim())
        .filter(Boolean);
      const uniqueCajs = Array.from(new Set(cajs)).sort();
      setCashiersList(uniqueCajs);

      const cashierMap: Record<string, string> = {};
      (userData || []).forEach((u: any) => {
        cashierMap[String(u.id)] = String(u.nombre_cajero || u.usuario || `ID ${u.id}`);
      });

      // 3. Parallel fetch transaction tables
      const [pbRes, gdRes, gcRes, cgRes, pdRes, psRes, csRes] = await Promise.all([
        supabase.from('cda_pagos_bancarios').select('*').eq('user_id', effectiveUserId),
        supabase.from('cda_gastos_diarios').select('*').eq('user_id', effectiveUserId),
        supabase.from('gastos').select('*').eq('user_id', effectiveUserId),
        supabase.from('cda_gastos').select('*').eq('user_id', effectiveUserId),
        supabase.from('cda_pagos_diarios').select('*').eq('user_id', effectiveUserId),
        supabase.from('pagos_semana').select('*').eq('user_id', effectiveUserId),
        supabase.from('cda_caja_efectivo_supervisor').select('*').eq('user_id', effectiveUserId),
      ]);

      setCajaSupervisorRows(csRes.data || []);

      const list: ConfirmationTransaction[] = [];

      // Process Bancarios
      (pbRes.data || []).forEach((r: any) => {
        const cid = String(r.cajero_id || r.user_id || '');
        const c_nom = cashierMap[cid] || (cid ? `ID ${cid}` : 'Desconocido');
        const metodoRaw = String(r.metodo_pago || 'Bancario').trim().toUpperCase();
        const isRech = Boolean(r.rechazado) || String(r.estado || '').toUpperCase() === 'RECHAZADO';
        const isConf = (Boolean(r.confirmado) || Boolean(r.confirmado_supervisor)) && !isRech;

        const concUpper = String(r.concepto || '').toUpperCase();
        let cat = 'Bancos';
        if (['PREMIO', 'PERDIDA', 'PÉRDIDA', 'ABONO', 'REPOSICION', 'REPOSICIÓN'].some(k => concUpper.includes(k) || metodoRaw.includes(k))) {
          cat = 'Pago de Premios';
        } else if (metodoRaw.includes('PUNTO') || metodoRaw.includes('POS')) {
          cat = 'Punto de Venta';
        }

        list.push({
          id: r.id,
          tabla: 'cda_pagos_bancarios',
          fecha: String(r.fecha || r.created_at || ''),
          agencia: String(r.agencia || '').trim().toUpperCase(),
          cajero_id: cid,
          cajero_nombre: c_nom,
          categoria: cat,
          metodo: metodoRaw || 'TRANSFERENCIA',
          concepto: String(r.concepto || 'Pago Bancario'),
          referencia: String(r.referencia || 'N/A'),
          pagador: String(r.datos_pagador || 'N/A'),
          monto: Number(r.monto || 0),
          moneda: normalizarMoneda(r.moneda),
          confirmado: isConf,
          confirmado_por: r.confirmado_por || r.supervisor_nombre || null,
          rechazado: isRech,
          rechazado_por: r.rechazado_por || null,
          motivo_rechazo: r.motivo_rechazo || null,
          fecha_rechazo: r.fecha_rechazo || null,
        });
      });

      // Process Gastos
      const allGastos = [
        ...(gdRes.data || []).map((r: any) => ({ ...r, __t: 'cda_gastos_diarios' })),
        ...(gcRes.data || []).map((r: any) => ({ ...r, __t: 'gastos' })),
        ...(cgRes.data || []).map((r: any) => ({ ...r, __t: 'cda_gastos' })),
      ];

      allGastos.forEach((r: any) => {
        const cid = String(r.cajero_id || r.user_id || '');
        const c_nom = cashierMap[cid] || (cid ? `ID ${cid}` : 'Desconocido');
        const isRech = Boolean(r.rechazado) || String(r.estado || '').toUpperCase() === 'RECHAZADO';
        const isConf = (Boolean(r.confirmado) || Boolean(r.confirmado_supervisor)) && !isRech;

        list.push({
          id: r.id,
          tabla: r.__t,
          fecha: String(r.fecha || r.created_at || ''),
          agencia: String(r.agencia || r.nombre_agencia || '').trim().toUpperCase(),
          cajero_id: cid,
          cajero_nombre: c_nom,
          categoria: 'Gastos',
          metodo: 'GASTO',
          concepto: String(r.concepto || r.descripcion || 'Gasto Operativo'),
          referencia: String(r.referencia || 'N/A'),
          pagador: 'N/A',
          monto: Number(r.monto || 0),
          moneda: normalizarMoneda(r.moneda),
          confirmado: isConf,
          confirmado_por: r.confirmado_por || r.supervisor_nombre || null,
          rechazado: isRech,
          rechazado_por: r.rechazado_por || null,
          motivo_rechazo: r.motivo_rechazo || null,
          fecha_rechazo: r.fecha_rechazo || null,
        });
      });

      // Process Pagos Diarios (Efectivo / Cobrador)
      (pdRes.data || []).forEach((r: any) => {
        const cid = String(r.cajero_id || r.user_id || '');
        const c_nom = cashierMap[cid] || (cid ? `ID ${cid}` : 'Desconocido');
        const isRech = Boolean(r.rechazado) || String(r.estado || '').toUpperCase() === 'RECHAZADO';
        const isConf = (Boolean(r.confirmado) || Boolean(r.confirmado_supervisor)) && !isRech;

        list.push({
          id: r.id,
          tabla: 'cda_pagos_diarios',
          fecha: String(r.fecha || r.created_at || ''),
          agencia: String(r.agencia || '').trim().toUpperCase(),
          cajero_id: cid,
          cajero_nombre: c_nom,
          categoria: 'Efectivo',
          metodo: String(r.tipo_pago || 'EFECTIVO').toUpperCase(),
          concepto: String(r.concepto || 'Recaudación de Efectivo'),
          referencia: String(r.referencia || r.qr_token || 'N/A'),
          pagador: 'Taquilla',
          monto: Number(r.monto || 0),
          moneda: normalizarMoneda(r.moneda),
          confirmado: isConf,
          confirmado_por: r.supervisor_nombre || r.confirmado_por || null,
          rechazado: isRech,
          rechazado_por: r.rechazado_por || null,
          motivo_rechazo: r.motivo_rechazo || null,
          fecha_rechazo: r.fecha_rechazo || null,
          cobrador_nombre: r.cobrador_nombre,
          qr_token: r.qr_token,
          liquidado_admin: r.liquidado_admin,
          fecha_escaneo_cobrador: r.fecha_escaneo_cobrador,
        });
      });

      setTransactions(list);
      setLastSyncTime(new Date());
      setSecondsAgo(0);
    } catch (err: any) {
      console.error('Error loading confirmation board data:', err);
      if (!isSilent) {
        setMessage({ type: 'error', text: err?.message || 'Error al cargar transacciones.' });
      }
    } finally {
      setIsLoading(false);
      setIsSilentUpdating(false);
    }
  }, [effectiveUserId]);

  // 1. Initial load & Supabase Realtime Channels + Fallback Heartbeat Interval
  useEffect(() => {
    if (!effectiveUserId) return;

    loadData(false);

    if (!autoSyncEnabled) return;

    // Realtime subscriptions on all transaction tables
    const channel = supabase
      .channel(`pizarra_sync_${effectiveUserId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'cda_pagos_bancarios', filter: `user_id=eq.${effectiveUserId}` },
        () => loadData(true)
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'cda_pagos_diarios', filter: `user_id=eq.${effectiveUserId}` },
        () => loadData(true)
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'cda_gastos_diarios', filter: `user_id=eq.${effectiveUserId}` },
        () => loadData(true)
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'cda_caja_efectivo_supervisor', filter: `user_id=eq.${effectiveUserId}` },
        () => loadData(true)
      )
      .subscribe();

    // Fallback heartbeat polling every 12 seconds as a resilient backup
    const intervalId = setInterval(() => {
      loadData(true);
    }, 12000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(intervalId);
    };
  }, [effectiveUserId, autoSyncEnabled, loadData]);

  // 2. Relative time counter ("Actualizado hace X seg")
  useEffect(() => {
    const timer = setInterval(() => {
      const diff = Math.floor((Date.now() - lastSyncTime.getTime()) / 1000);
      setSecondsAgo(diff);
    }, 1000);
    return () => clearInterval(timer);
  }, [lastSyncTime]);

  // Current operator user display name
  const currentOperatorName = user?.nombre || user?.email?.split('@')[0] || 'Administrador';

  // Base metrics & filtered transactions
  const filteredTransactions = useMemo(() => {
    return transactions.filter((t) => {
      // Date filter
      const tFecha = t.fecha.slice(0, 10);
      if (fechaDesde && tFecha < fechaDesde) return false;
      if (fechaHasta && tFecha > fechaHasta) return false;

      // Agency filter
      if (selAgencia !== 'Todas' && t.agencia !== selAgencia) return false;

      // Cashier filter
      if (selCajero !== 'Todos' && t.cajero_nombre !== selCajero) return false;

      // Category filter
      if (selCategoria !== 'Todas') {
        if (selCategoria === 'Bancos' && !['Bancos', 'Punto de Venta'].includes(t.categoria)) return false;
        if (selCategoria === 'Gastos' && t.categoria !== 'Gastos') return false;
        if (selCategoria === 'Efectivo' && t.categoria !== 'Efectivo') return false;
        if (selCategoria === 'Pago de Premios' && t.categoria !== 'Pago de Premios') return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const match =
          (t.agencia || '').toLowerCase().includes(q) ||
          (t.cajero_nombre || '').toLowerCase().includes(q) ||
          (t.concepto || '').toLowerCase().includes(q) ||
          (t.referencia || '').toLowerCase().includes(q) ||
          (t.pagador || '').toLowerCase().includes(q);
        if (!match) return false;
      }

      return true;
    });
  }, [transactions, fechaDesde, fechaHasta, selAgencia, selCajero, selCategoria, searchQuery]);

  // Status slices
  const pendingTransactions = useMemo(
    () => filteredTransactions.filter((t) => !t.confirmado && !t.rechazado),
    [filteredTransactions]
  );
  const confirmedTransactions = useMemo(
    () => filteredTransactions.filter((t) => t.confirmado),
    [filteredTransactions]
  );
  const rejectedTransactions = useMemo(
    () => filteredTransactions.filter((t) => t.rechazado),
    [filteredTransactions]
  );

  // Totals
  const totals = useMemo(() => {
    const calc = (items: ConfirmationTransaction[]) => {
      let bs = 0, usd = 0, cop = 0;
      items.forEach((t) => {
        if (t.moneda === 'BS') bs += t.monto;
        else if (t.moneda === 'USD') usd += t.monto;
        else if (t.moneda === 'COP') cop += t.monto;
      });
      return { bs, usd, cop };
    };

    return {
      pending: calc(pendingTransactions),
      confirmed: calc(confirmedTransactions),
      rejected: calc(rejectedTransactions),
    };
  }, [pendingTransactions, confirmedTransactions, rejectedTransactions]);

  // Display items for Tab 1 based on selEstado
  const displayItems = useMemo(() => {
    let list: ConfirmationTransaction[] = [];
    if (selEstado === 'Pendientes') list = pendingTransactions;
    else if (selEstado === 'Confirmados') list = confirmedTransactions;
    else if (selEstado === 'Rechazados') list = rejectedTransactions;
    else list = filteredTransactions;

    return [...list].sort((a, b) => b.fecha.localeCompare(a.fecha));
  }, [selEstado, pendingTransactions, confirmedTransactions, rejectedTransactions, filteredTransactions]);

  // Core confirm execution with cross-table sync
  const executeConfirmTransaction = async (item: ConfirmationTransaction) => {
    if (!effectiveUserId) return false;

    const dataPayload = {
      confirmado: true,
      confirmado_por: currentOperatorName,
      rechazado: false,
      rechazado_por: null,
      motivo_rechazo: null,
      fecha_rechazo: null,
    };

    // 1. Update main table
    await supabase.from(item.tabla).update(dataPayload).eq('id', item.id);

    // 2. Cross table syncs
    if (item.tabla === 'cda_pagos_bancarios') {
      // Sync cda_pagos_diarios
      await supabase
        .from('cda_pagos_diarios')
        .update({
          ...dataPayload,
          confirmado_supervisor: true,
          supervisor_nombre: currentOperatorName,
        })
        .eq('agencia', item.agencia)
        .eq('fecha', item.fecha)
        .eq('monto', item.monto);

      // Sync pagos_semana
      const { data: psData } = await supabase
        .from('pagos_semana')
        .select('id, referencia')
        .eq('user_id', effectiveUserId)
        .eq('agencia', item.agencia)
        .eq('monto', item.monto);

      let matched = false;
      if (psData && psData.length > 0) {
        for (const ps of psData) {
          if (
            (item.referencia !== 'N/A' && String(ps.referencia || '').includes(item.referencia)) ||
            String(ps.referencia || '').includes('CONFIRMADO BANCO')
          ) {
            matched = true;
            await supabase.from('pagos_semana').update(dataPayload).eq('id', ps.id);
            break;
          }
        }
      }

      if (!matched && item.monto > 0) {
        const refLabel = `REF: ${item.referencia} ${item.pagador !== 'N/A' ? `- ${item.pagador}` : ''} [✅ CONFIRMADO BANCO]`.trim();
        const isPremio = item.categoria === 'Pago de Premios';

        try {
          const allowedMetodo = String(item.metodo || '').toUpperCase().includes('EFECTIVO') ? 'EFECTIVO' : 'BANCO';
          await supabase.from('pagos_semana').insert({
            user_id: effectiveUserId,
            agencia: item.agencia,
            moneda: item.moneda,
            tipo_pago: isPremio ? 'Pago de Premios' : 'Pago',
            metodo: allowedMetodo,
            monto: Math.round(item.monto * 100) / 100,
            referencia: refLabel.toUpperCase(),
            confirmado: true,
            confirmado_por: currentOperatorName,
            rechazado: false,
            fecha: item.fecha || new Date().toISOString(),
          });
        } catch (insertErr) {
          console.warn('Error sincronizando con pagos_semana:', insertErr);
        }
      }
    } else if (item.tabla === 'cda_pagos_diarios') {
      await supabase
        .from('cda_pagos_diarios')
        .update({
          confirmado_supervisor: true,
          supervisor_nombre: currentOperatorName,
          confirmado: true,
          confirmado_por: currentOperatorName,
          rechazado: false,
        })
        .eq('id', item.id);
    }

    return true;
  };

  // Single Transaction Confirm
  const handleConfirm = async (item: ConfirmationTransaction) => {
    if (!effectiveUserId) return;
    setIsProcessing(true);

    try {
      await executeConfirmTransaction(item);

      // Local optimistic update
      setTransactions((prev) =>
        prev.map((t) =>
          t.id === item.id && t.tabla === item.tabla
            ? { ...t, confirmado: true, confirmado_por: currentOperatorName, rechazado: false }
            : t
        )
      );

      confetti({
        particleCount: 50,
        spread: 60,
        origin: { y: 0.7 },
      });

      setMessage({ type: 'success', text: `¡Transacción #${item.id} confirmada exitosamente!` });
    } catch (err: any) {
      console.error('Error confirming transaction:', err);
      setMessage({ type: 'error', text: err?.message || 'Error al confirmar la transacción.' });
    } finally {
      setIsProcessing(false);
    }
  };

  // Single Transaction Revert
  const handleRevert = async (item: ConfirmationTransaction) => {
    if (!effectiveUserId) return;
    setIsProcessing(true);

    try {
      const dataPayload = {
        confirmado: false,
        confirmado_por: null,
        rechazado: false,
        rechazado_por: null,
      };

      await supabase.from(item.tabla).update(dataPayload).eq('id', item.id);

      if (item.tabla === 'cda_pagos_bancarios') {
        await supabase
          .from('cda_pagos_diarios')
          .update(dataPayload)
          .eq('agencia', item.agencia)
          .eq('monto', item.monto);
      }

      setTransactions((prev) =>
        prev.map((t) =>
          t.id === item.id && t.tabla === item.tabla
            ? { ...t, confirmado: false, confirmado_por: null, rechazado: false }
            : t
        )
      );

      setMessage({ type: 'success', text: `Transacción revertida a estado pendiente.` });
    } catch (err: any) {
      console.error('Error reverting item:', err);
      setMessage({ type: 'error', text: err?.message || 'Error al revertir.' });
    } finally {
      setIsProcessing(false);
    }
  };

  // Submit Reject
  const handleSubmitReject = async () => {
    if (!rejectModalItem || !effectiveUserId) return;
    setIsProcessing(true);

    try {
      const motivoFinal = rejectNote.trim()
        ? `${rejectReason} - ${rejectNote.trim()}`
        : rejectReason;
      const nowStr = new Date().toISOString();

      const dataPayload = {
        confirmado: false,
        confirmado_por: null,
        rechazado: true,
        rechazado_por: currentOperatorName,
        motivo_rechazo: motivoFinal,
        fecha_rechazo: nowStr,
      };

      await supabase.from(rejectModalItem.tabla).update(dataPayload).eq('id', rejectModalItem.id);

      if (rejectModalItem.tabla === 'cda_pagos_bancarios') {
        await supabase
          .from('cda_pagos_diarios')
          .update(dataPayload)
          .eq('agencia', rejectModalItem.agencia)
          .eq('monto', rejectModalItem.monto);
      } else if (rejectModalItem.tabla === 'cda_pagos_diarios') {
        // If rejected, remove from supervisor cash if internal entry existed
        await supabase
          .from('cda_caja_efectivo_supervisor')
          .delete()
          .eq('pago_id', rejectModalItem.id);
      }

      setTransactions((prev) =>
        prev.map((t) =>
          t.id === rejectModalItem.id && t.tabla === rejectModalItem.tabla
            ? {
                ...t,
                confirmado: false,
                rechazado: true,
                rechazado_por: currentOperatorName,
                motivo_rechazo: motivoFinal,
                fecha_rechazo: nowStr,
              }
            : t
        )
      );

      setRejectModalItem(null);
      setRejectNote('');
      setMessage({ type: 'success', text: 'Transacción rechazada y guardada en auditoría.' });
    } catch (err: any) {
      console.error('Error rejecting item:', err);
      setMessage({ type: 'error', text: err?.message || 'Error al registrar el rechazo.' });
    } finally {
      setIsProcessing(false);
    }
  };

  // Confirm All Pending
  const handleConfirmAll = async () => {
    if (!pendingTransactions.length || !effectiveUserId) return;
    if (!window.confirm(`¿Confirmar todas las ${pendingTransactions.length} transacciones pendientes?`)) return;

    setIsProcessing(true);
    let count = 0;

    for (const item of pendingTransactions) {
      // Exclude supervisor deliveries requiring Taquilla confirmation
      if (
        item.metodo.toUpperCase().includes('SUPERVISOR') ||
        item.concepto.toUpperCase().includes('SUPERVISOR')
      ) {
        continue;
      }

      try {
        await executeConfirmTransaction(item);
        count++;
      } catch (e) {
        console.warn('Error in batch item:', e);
      }
    }

    confetti({
      particleCount: 70,
      spread: 80,
      origin: { y: 0.6 },
    });

    setMessage({ type: 'success', text: `¡Se confirmaron ${count} transacciones exitosamente!` });
    await loadData();
    setIsProcessing(false);
  };

  // Tab 3: Custody by Agency calculations
  const custodySummary = useMemo<CustodiaAgencia[]>(() => {
    const list: CustodiaAgencia[] = [];

    const cashEntries = cajaSupervisorRows.filter((r: any) =>
      ['ENTREGA_ADMIN', 'ENTREGA_COBRADOR'].includes(String(r.tipo_movimiento || '').toUpperCase().trim())
    );

    agenciesList.forEach((ag) => {
      // Cash movements for this agency
      let arrastreCop = 0, recaudadoCop = 0, liquidadoCop = 0, enRutaCop = 0;
      let custodiaUsd = 0, custodiaBs = 0;

      // Filter receipts
      const agCash = cashEntries.filter((r: any) => String(r.agencia || '').toUpperCase() === ag);
      agCash.forEach((r: any) => {
        const m = Number(r.monto || 0);
        const mon = normalizarMoneda(r.moneda);
        const tMov = String(r.tipo_movimiento || '').toUpperCase();
        const com = String(r.comentario || '').toUpperCase();
        const isRecibido = com.includes('[RECIBIDO EN CAJA CENTRAL');

        if (mon === 'COP') {
          liquidadoCop += m;
          if (tMov === 'ENTREGA_COBRADOR' && !isRecibido) {
            enRutaCop += m;
          }
        }
      });

      // Sum collected cash from transactions
      transactions
        .filter((t) => t.agencia === ag && t.categoria === 'Efectivo' && t.confirmado)
        .forEach((t) => {
          if (t.moneda === 'COP') recaudadoCop += t.monto;
          else if (t.moneda === 'USD') custodiaUsd += t.monto;
          else if (t.moneda === 'BS') custodiaBs += t.monto;
        });

      const custodiaTaqCop = Math.max(0, recaudadoCop - liquidadoCop);

      let status: 'custodia' | 'ruta' | 'al_dia' = 'al_dia';
      if (custodiaTaqCop > 0.01 || custodiaUsd > 0.01 || custodiaBs > 0.01) {
        status = 'custodia';
      } else if (enRutaCop > 0.01) {
        status = 'ruta';
      }

      list.push({
        agencia: ag,
        supervisor: 'Supervisor de Agencia',
        arrastre_cop: arrastreCop,
        recaudado_cop: recaudadoCop,
        liquidado_cop: liquidadoCop,
        custodia_taquilla_cop: custodiaTaqCop,
        en_ruta_cop: enRutaCop,
        custodia_usd: custodiaUsd,
        custodia_bs: custodiaBs,
        status,
      });
    });

    return list;
  }, [agenciesList, cajaSupervisorRows, transactions]);

  // Tab 3: Submit new cash settlement to Admin
  const handleCreateCashEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!effectiveUserId) return;

    const montoNum = Number(formMonto);
    if (!formAgencia || montoNum <= 0) {
      setMessage({ type: 'error', text: 'Seleccione agencia e ingrese un monto mayor a 0.' });
      return;
    }

    setIsSubmittingCash(true);

    try {
      const payload = {
        user_id: effectiveUserId,
        agencia: formAgencia,
        supervisor_nombre: formSupervisor.trim() || 'Supervisor',
        tipo_movimiento: 'ENTREGA_ADMIN',
        monto: montoNum,
        moneda: formMoneda,
        comentario: `${formNota.trim() || `Liquidación de efectivo de agencia ${formAgencia}`} [Recibido en Caja Central por: ${currentOperatorName}]`,
      };

      const { data, error } = await supabase
        .from('cda_caja_efectivo_supervisor')
        .insert(payload)
        .select()
        .single();

      if (error) throw error;

      confetti({ particleCount: 40, spread: 60 });
      setMessage({ type: 'success', text: `¡Entrada a caja de ${formMoneda} ${montoNum.toLocaleString()} registrada!` });

      setFormMonto('');
      setFormNota('');

      // Open receipt modal
      setReceiptModalItem({
        ...data,
        recibido_por: currentOperatorName,
      });

      await loadData();
    } catch (err: any) {
      console.error('Error recording cash entry:', err);
      setMessage({ type: 'error', text: err?.message || 'Error al registrar la entrada a caja.' });
    } finally {
      setIsSubmittingCash(false);
    }
  };

  // Tab 3: Mark collector delivery as received in central cash
  const handleReceiveCollectorCash = async (receiptId: number, currentComment: string) => {
    if (!window.confirm('¿Confirmar recepción de este efectivo en Caja Central de Administración?')) return;
    setIsProcessing(true);

    try {
      const updatedComment = `${currentComment} [Recibido en Caja Central por: ${currentOperatorName}]`;
      await supabase
        .from('cda_caja_efectivo_supervisor')
        .update({ comentario: updatedComment })
        .eq('id', receiptId);

      setMessage({ type: 'success', text: 'Efectivo recibido exitosamente en Caja Principal.' });
      await loadData();
    } catch (err: any) {
      console.error('Error updating collector receipt:', err);
      setMessage({ type: 'error', text: err?.message || 'Error al recibir en caja.' });
    } finally {
      setIsProcessing(false);
    }
  };

  // WhatsApp formatted receipt link
  const getWhatsAppReceiptUrl = (mov: any) => {
    const f_fmt = formatDate(mov.fecha || mov.created_at);
    const monto_val = Number(mov.monto || 0);
    const moneda_val = normalizarMoneda(mov.moneda);
    const agencia = String(mov.agencia || 'TODAS').toUpperCase();
    const supervisor = String(mov.supervisor_nombre || 'N/A');
    const admin_receptor = String(mov.recibido_por || currentOperatorName);
    const concepto = String(mov.comentario || 'Liquidación de efectivo');
    const recibo_id = String(mov.id || Date.now());

    const txt =
      `🏛️ *RECIBO OFICIAL DE ENTRADA A CAJA CENTRAL*\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `🆔 *Recibo:* #${recibo_id}\n` +
      `🏢 *Agencia:* ${agencia}\n` +
      `📅 *Fecha:* ${f_fmt}\n` +
      `👤 *Entregado por (Supervisor):* ${supervisor}\n` +
      `📥 *Recibido por (Admin):* ${admin_receptor}\n` +
      `💰 *Monto:* ${moneda_val} ${monto_val.toLocaleString('es-VE', { minimumFractionDigits: 2 })}\n` +
      `📝 *Concepto:* ${concepto}\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `✅ *Estatus:* INGRESADO A CAJA PRINCIPAL`;

    return `https://wa.me/?text=${encodeURIComponent(txt)}`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2">
            <span className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <ShieldCheck className="w-5 h-5" />
            </span>
            Pizarra de Confirmaciones
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Verificación y aprobación ágil de transferencias bancarias, puntos de venta, gastos y recaudaciones de efectivo.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Live Auto-sync Toggle Pill */}
          <button
            onClick={() => setAutoSyncEnabled(!autoSyncEnabled)}
            className={`px-3 py-2 rounded-xl border text-xs font-bold flex items-center gap-2 transition-all cursor-pointer shadow-sm ${
              autoSyncEnabled
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
                : 'bg-slate-800/80 border-slate-700 text-slate-400 hover:text-slate-200'
            }`}
            title={
              autoSyncEnabled
                ? 'Sincronización automática en tiempo real activa (clic para pausar)'
                : 'Sincronización automática en pausa (clic para activar)'
            }
          >
            <span className="relative flex h-2 w-2">
              {autoSyncEnabled && (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              )}
              <span
                className={`relative inline-flex rounded-full h-2 w-2 ${
                  autoSyncEnabled ? 'bg-emerald-500' : 'bg-slate-500'
                }`}
              ></span>
            </span>
            <span>{autoSyncEnabled ? 'En vivo' : 'En pausa'}</span>
          </button>

          {/* Relative last updated time */}
          <span className="text-[11px] text-slate-400 font-mono hidden sm:inline px-1">
            {secondsAgo < 5 ? 'Actualizado ahora' : `Hace ${secondsAgo}s`}
          </span>

          {/* Manual Sync Button */}
          <button
            onClick={() => loadData(false)}
            disabled={isLoading || isSilentUpdating}
            className="px-3.5 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex items-center gap-2 transition-all border border-slate-700 cursor-pointer disabled:opacity-50 shadow-sm"
            title="Sincronizar manualmente"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${
                isLoading || isSilentUpdating ? 'animate-spin text-emerald-400' : ''
              }`}
            />
            <span className="hidden sm:inline">Sincronizar</span>
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
            <XCircle className="w-5 h-5 shrink-0" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      {/* Top 3 Tabs Selector */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 pb-3">
        <button
          onClick={() => setActiveTab('rapidas')}
          className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-all cursor-pointer ${
            activeTab === 'rapidas'
              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <CheckCheck className="w-4 h-4" />
          Confirmaciones Rápidas
          <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 text-[10px] font-mono font-bold">
            {pendingTransactions.length} pend.
          </span>
        </button>

        <button
          onClick={() => setActiveTab('rechazados')}
          className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-all cursor-pointer ${
            activeTab === 'rechazados'
              ? 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <XCircle className="w-4 h-4" />
          Auditoría de Rechazados
          <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-400 text-[10px] font-mono font-bold">
            {rejectedTransactions.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('arqueo')}
          className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-all cursor-pointer ${
            activeTab === 'arqueo'
              ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <Banknote className="w-4 h-4" />
          Arqueo y Control de Efectivo
        </button>
      </div>

      {/* FILTER BAR (Tabs 1 and 2) */}
      {activeTab !== 'arqueo' && (
        <div className="bg-[#0D1B22] border border-slate-800 rounded-3xl p-4 sm:p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {/* Fechas */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                <Calendar className="w-3 h-3 text-cyan-400" />
                Desde
              </label>
              <input
                type="date"
                value={fechaDesde}
                onChange={(e) => setFechaDesde(e.target.value)}
                className="w-full bg-[#071217] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                <Calendar className="w-3 h-3 text-cyan-400" />
                Hasta
              </label>
              <input
                type="date"
                value={fechaHasta}
                onChange={(e) => setFechaHasta(e.target.value)}
                className="w-full bg-[#071217] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
              />
            </div>

            {/* Agencia */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                <Building2 className="w-3 h-3 text-emerald-400" />
                Agencia
              </label>
              <select
                value={selAgencia}
                onChange={(e) => setSelAgencia(e.target.value)}
                className="w-full bg-[#071217] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
              >
                <option value="Todas">Todas las Agencias</option>
                {agenciesList.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>

            {/* Cajero */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                <User className="w-3 h-3 text-purple-400" />
                Cajero
              </label>
              <select
                value={selCajero}
                onChange={(e) => setSelCajero(e.target.value)}
                className="w-full bg-[#071217] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
              >
                <option value="Todos">Todos los Cajeros</option>
                {cashiersList.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            {/* Categoría */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                <CreditCard className="w-3 h-3 text-amber-400" />
                Tipo / Origen
              </label>
              <select
                value={selCategoria}
                onChange={(e) => setSelCategoria(e.target.value)}
                className="w-full bg-[#071217] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
              >
                <option value="Todas">Todas las fuentes</option>
                <option value="Bancos">Bancos (Transferencia/POS)</option>
                <option value="Gastos">Gastos Operativos</option>
                <option value="Efectivo">Efectivo / Cobrador</option>
                <option value="Pago de Premios">Pago de Premios / Reposición</option>
              </select>
            </div>

            {/* Estado */}
            {activeTab === 'rapidas' && (
              <div className="space-y-1">
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                  <Filter className="w-3 h-3 text-rose-400" />
                  Estado
                </label>
                <select
                  value={selEstado}
                  onChange={(e) => setSelEstado(e.target.value as any)}
                  className="w-full bg-[#071217] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                >
                  <option value="Pendientes">⏳ Solo Pendientes</option>
                  <option value="Confirmados">✅ Solo Confirmados</option>
                  <option value="Rechazados">❌ Solo Rechazados</option>
                  <option value="Todos">Mostrar Todos</option>
                </select>
              </div>
            )}
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 border-t border-slate-800/60">
            <div className="relative w-full sm:w-80">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar por agencia, ref, pagador..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#071217] border border-slate-700 rounded-xl pl-8 pr-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
              />
            </div>

            <button
              onClick={() => {
                setFechaDesde(systemCycle.desde);
                setFechaHasta(systemCycle.hasta);
              }}
              className="text-xs text-cyan-400 hover:text-cyan-300 font-semibold flex items-center gap-1 cursor-pointer"
            >
              <Clock className="w-3.5 h-3.5" />
              Restablecer al Ciclo Actual ({systemCycle.desde} ~ {systemCycle.hasta})
            </button>
          </div>
        </div>
      )}

      {/* METRIC PILLS BANNER (Tab 1 & 2) */}
      {activeTab !== 'arqueo' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* General Counts */}
          <div className="bg-[#0D1B22] border border-slate-800 rounded-2xl p-4">
            <div className="text-[11px] font-bold uppercase text-slate-400 flex items-center justify-between">
              <span>Estado de Registros</span>
            </div>
            <div className="mt-2 space-y-0.5 text-xs font-mono">
              <div className="text-amber-400 font-semibold">⏳ {pendingTransactions.length} pend.</div>
              <div className="text-emerald-400 font-semibold">✅ {confirmedTransactions.length} conf.</div>
              <div className="text-rose-400 text-[10px]">❌ {rejectedTransactions.length} rech.</div>
            </div>
          </div>

          {/* Bolívares */}
          <div className="bg-[#0D1B22] border border-slate-800 rounded-2xl p-4">
            <div className="text-[11px] font-bold uppercase text-slate-400 flex items-center justify-between">
              <span>🇻🇪 Bolívares (BS)</span>
            </div>
            <div className="mt-2 space-y-0.5 text-xs font-mono">
              <div className="text-amber-400 font-semibold">Pend: {formatCurrency(totals.pending.bs, 'BS')}</div>
              <div className="text-emerald-400 font-semibold">Conf: {formatCurrency(totals.confirmed.bs, 'BS')}</div>
              <div className="text-rose-400 text-[10px]">Rech: {formatCurrency(totals.rejected.bs, 'BS')}</div>
            </div>
          </div>

          {/* Dólares */}
          <div className="bg-[#0D1B22] border border-slate-800 rounded-2xl p-4">
            <div className="text-[11px] font-bold uppercase text-slate-400 flex items-center justify-between">
              <span>💵 Dólares (USD)</span>
            </div>
            <div className="mt-2 space-y-0.5 text-xs font-mono">
              <div className="text-amber-400 font-semibold">Pend: {formatCurrency(totals.pending.usd, 'USD')}</div>
              <div className="text-emerald-400 font-semibold">Conf: {formatCurrency(totals.confirmed.usd, 'USD')}</div>
              <div className="text-rose-400 text-[10px]">Rech: {formatCurrency(totals.rejected.usd, 'USD')}</div>
            </div>
          </div>

          {/* Pesos */}
          <div className="bg-[#0D1B22] border border-slate-800 rounded-2xl p-4">
            <div className="text-[11px] font-bold uppercase text-slate-400 flex items-center justify-between">
              <span>🇨🇴 Pesos (COP)</span>
            </div>
            <div className="mt-2 space-y-0.5 text-xs font-mono">
              <div className="text-amber-400 font-semibold">Pend: {formatCurrency(totals.pending.cop, 'COP')}</div>
              <div className="text-emerald-400 font-semibold">Conf: {formatCurrency(totals.confirmed.cop, 'COP')}</div>
              <div className="text-rose-400 text-[10px]">Rech: {formatCurrency(totals.rejected.cop, 'COP')}</div>
            </div>
          </div>

          {/* Confirm All Action Button */}
          <div className="bg-[#0D1B22] border border-slate-800 rounded-2xl p-4 flex flex-col justify-center">
            {pendingTransactions.length > 0 ? (
              <button
                onClick={handleConfirmAll}
                disabled={isProcessing}
                className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-bold text-xs shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
              >
                <CheckCheck className="w-4 h-4" />
                Confirmar Todos ({pendingTransactions.length})
              </button>
            ) : (
              <div className="text-center py-2">
                <span className="text-xs font-semibold text-emerald-400 flex items-center justify-center gap-1">
                  <CheckCircle2 className="w-4 h-4" />
                  Al día (0 pendientes)
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 1: CONFIRMACIONES RÁPIDAS
      ========================================================================= */}
      {activeTab === 'rapidas' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs text-slate-400 px-1">
            <span>
              Mostrando <strong className="text-white">{displayItems.length}</strong> transacciones ({selEstado})
            </span>
          </div>

          {isLoading ? (
            <div className="text-center py-16 bg-[#0D1B22] border border-slate-800 rounded-3xl">
              <RefreshCw className="w-8 h-8 text-emerald-400 animate-spin mx-auto mb-3" />
              <p className="text-sm text-slate-400 font-medium">Cargando transacciones en tiempo real...</p>
            </div>
          ) : displayItems.length === 0 ? (
            <div className="text-center py-16 bg-[#0D1B22] border border-slate-800 rounded-3xl space-y-2">
              <CheckCircle2 className="w-10 h-10 text-emerald-400/60 mx-auto" />
              <h4 className="text-base font-bold text-white">¡Todo al día!</h4>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                No hay transacciones registradas con los filtros y estado seleccionados.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {displayItems.map((item, idx) => {
                const isSupDelivery =
                  item.metodo.toUpperCase().includes('SUPERVISOR') ||
                  item.concepto.toUpperCase().includes('SUPERVISOR');

                return (
                  <div
                    key={`${item.tabla}_${item.id}_${idx}`}
                    className={`bg-[#0D1B22] border rounded-2xl p-4 sm:p-5 transition-all hover:border-slate-700 flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                      item.confirmado
                        ? 'border-emerald-500/20 bg-emerald-950/10'
                        : item.rechazado
                        ? 'border-rose-500/20 bg-rose-950/10'
                        : 'border-slate-800'
                    }`}
                  >
                    {/* Item Details */}
                    <div className="space-y-1.5 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-400 text-[10px] font-mono font-bold">
                          #{idx + 1}
                        </span>

                        <span className="text-sm font-black text-white">{item.agencia}</span>

                        <span className="text-xs text-slate-400">• Cajero: <strong className="text-slate-300">{item.cajero_nombre}</strong></span>

                        <span className="text-xs text-slate-500">📅 {formatDate(item.fecha)}</span>

                        {/* Category Badge */}
                        <span className="px-2 py-0.5 rounded-md bg-cyan-500/10 text-cyan-400 text-[10px] font-bold border border-cyan-500/20">
                          {item.categoria}
                        </span>

                        {/* Status Badge */}
                        {item.confirmado && (
                          <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-400 text-[10px] font-bold border border-emerald-500/30 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" />
                            CONFIRMADO
                          </span>
                        )}
                        {item.rechazado && (
                          <span className="px-2 py-0.5 rounded-md bg-rose-500/15 text-rose-400 text-[10px] font-bold border border-rose-500/30 flex items-center gap-1">
                            <XCircle className="w-3 h-3" />
                            RECHAZADO
                          </span>
                        )}
                        {!item.confirmado && !item.rechazado && (
                          <span className="px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-400 text-[10px] font-bold border border-amber-500/30 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            PENDIENTE
                          </span>
                        )}
                      </div>

                      <div className="text-xs text-slate-400 flex flex-wrap items-center gap-3">
                        <span>Método: <strong className="text-slate-300">{item.metodo}</strong></span>
                        <span>Concepto: <strong className="text-slate-300">{item.concepto}</strong></span>
                        <span>Ref: <strong className="text-slate-300 font-mono">{item.referencia}</strong></span>
                        {item.pagador !== 'N/A' && <span>Pagador: <strong className="text-slate-300">{item.pagador}</strong></span>}
                      </div>

                      {/* Traceability: Collector QR */}
                      {(item.cobrador_nombre || item.qr_token) && (
                        <div className="inline-flex items-center gap-2 px-2 py-0.5 rounded-md bg-sky-500/10 border border-sky-500/20 text-[11px] text-sky-300 font-medium">
                          <span>🛵 Cobrador: {item.cobrador_nombre || 'Asignado'}</span>
                          {item.liquidado_admin ? (
                            <span className="text-emerald-400 font-bold">[💰 Liquidado Admin]</span>
                          ) : item.fecha_escaneo_cobrador ? (
                            <span className="text-sky-400 font-bold">[🛵 En Ruta]</span>
                          ) : (
                            <span className="text-amber-400 font-bold">[⏳ Pend. Escaneo]</span>
                          )}
                        </div>
                      )}

                      {/* Audit Details */}
                      {item.confirmado && item.confirmado_por && (
                        <div className="text-[11px] text-emerald-400/90 font-medium">
                          👤 Confirmado por: <strong>{item.confirmado_por}</strong>
                        </div>
                      )}
                      {item.rechazado && (
                        <div className="text-[11px] text-rose-400/90 space-y-0.5">
                          <div>🚫 Rechazado por: <strong>{item.rechazado_por || 'Administración'}</strong></div>
                          {item.motivo_rechazo && <div>⚠️ Motivo: <em>{item.motivo_rechazo}</em></div>}
                        </div>
                      )}
                    </div>

                    {/* Amount & Actions */}
                    <div className="flex md:flex-col items-center md:items-end justify-between md:justify-center gap-3 pt-3 md:pt-0 border-t md:border-t-0 border-slate-800">
                      <div className="text-right">
                        <div className="text-lg sm:text-xl font-black text-white font-mono">
                          {formatCurrency(item.monto, item.moneda)}
                        </div>
                        <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                          {item.moneda}
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex items-center gap-2">
                        {!item.confirmado && !item.rechazado && (
                          <>
                            {isSupDelivery ? (
                              <span className="px-3 py-1.5 rounded-xl bg-cyan-500/10 text-cyan-400 text-xs font-bold border border-cyan-500/20">
                                🛡️ Confirma Supervisor en Taquilla
                              </span>
                            ) : (
                              <>
                                <button
                                  onClick={() => handleConfirm(item)}
                                  disabled={isProcessing}
                                  className="px-3.5 py-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 text-xs font-bold border border-emerald-500/30 flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  Confirmar
                                </button>
                                <button
                                  onClick={() => setRejectModalItem(item)}
                                  disabled={isProcessing}
                                  className="px-3.5 py-2 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 text-xs font-bold border border-rose-500/30 flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                                >
                                  <XCircle className="w-3.5 h-3.5" />
                                  Rechazar
                                </button>
                              </>
                            )}
                          </>
                        )}

                        {item.confirmado && (
                          <button
                            onClick={() => handleRevert(item)}
                            disabled={isProcessing}
                            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer border border-slate-700 disabled:opacity-50"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            Revertir
                          </button>
                        )}

                        {item.rechazado && (
                          <>
                            <button
                              onClick={() => handleRevert(item)}
                              disabled={isProcessing}
                              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer border border-slate-700 disabled:opacity-50"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              Reabrir
                            </button>
                            <button
                              onClick={() => handleConfirm(item)}
                              disabled={isProcessing}
                              className="px-3 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 text-xs font-bold border border-emerald-500/30 flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Aprobar
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* =========================================================================
          TAB 2: AUDITORÍA DE RECHAZADOS
      ========================================================================= */}
      {activeTab === 'rechazados' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs text-slate-400 px-1">
            <span>
              Total Rechazados registrados: <strong className="text-rose-400">{rejectedTransactions.length}</strong>
            </span>
          </div>

          {rejectedTransactions.length === 0 ? (
            <div className="text-center py-16 bg-[#0D1B22] border border-slate-800 rounded-3xl space-y-2">
              <CheckCircle2 className="w-10 h-10 text-emerald-400/60 mx-auto" />
              <h4 className="text-base font-bold text-white">Cero Rechazos</h4>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                No hay transacciones marcadas como rechazadas en el rango y filtros actuales.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {rejectedTransactions.map((item, idx) => (
                <div
                  key={`rech_${item.tabla}_${item.id}_${idx}`}
                  className="bg-[#0D1B22] border border-rose-500/30 rounded-2xl p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <div className="space-y-1.5 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2 py-0.5 rounded-md bg-rose-500/20 text-rose-400 text-[10px] font-bold">
                        Rechazado #{idx + 1}
                      </span>
                      <span className="text-sm font-black text-white">{item.agencia}</span>
                      <span className="text-xs text-slate-400">• Cajero: <strong className="text-slate-300">{item.cajero_nombre}</strong></span>
                      <span className="text-xs text-slate-500">📅 {formatDate(item.fecha)}</span>
                    </div>

                    <div className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-xl p-2.5 space-y-1">
                      <div>
                        <strong>Motivo del Rechazo:</strong> {item.motivo_rechazo || 'Rechazado por Administración'}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        Auditor: <strong className="text-slate-300">{item.rechazado_por || 'Administración'}</strong>
                        {item.fecha_rechazo && (
                          <span> • Fecha de rechazo: {formatDate(item.fecha_rechazo)}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex md:flex-col items-center md:items-end justify-between md:justify-center gap-3">
                    <div className="text-right">
                      <div className="text-lg sm:text-xl font-black text-rose-400 font-mono">
                        {formatCurrency(item.monto, item.moneda)}
                      </div>
                      <div className="text-[10px] text-slate-400 font-bold uppercase">{item.moneda}</div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleRevert(item)}
                        disabled={isProcessing}
                        className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer border border-slate-700 disabled:opacity-50"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        Reabrir a Pendiente
                      </button>
                      <button
                        onClick={() => handleConfirm(item)}
                        disabled={isProcessing}
                        className="px-3.5 py-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 text-xs font-bold border border-emerald-500/30 flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Aprobar y Confirmar
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* =========================================================================
          TAB 3: ARQUEO Y CONTROL DE EFECTIVO
      ========================================================================= */}
      {activeTab === 'arqueo' && (
        <div className="space-y-6">
          {/* Header Description */}
          <div className="bg-gradient-to-r from-sky-950/40 via-slate-900 to-slate-900 border border-sky-500/20 rounded-3xl p-6">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Banknote className="w-5 h-5 text-sky-400" />
              Arqueo y Control de Custodia de Efectivo por Agencia
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Visibilidad en tiempo real del efectivo recaudado en taquillas, saldos en custodia del supervisor, fondos en ruta con cobradores y liquidaciones recibidas en caja principal.
            </p>
          </div>

          {/* Custody Table */}
          <div className="bg-[#0D1B22] border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
            <div className="p-4 sm:p-6 border-b border-slate-800 flex items-center justify-between">
              <h4 className="text-sm font-bold text-white uppercase tracking-wider">
                Estado de Custodia de Efectivo por Agencia
              </h4>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#071217] text-slate-400 border-b border-slate-800 font-bold uppercase tracking-wider">
                  <tr>
                    <th className="py-3.5 px-4">Agencia</th>
                    <th className="py-3.5 px-4">Recaudado (Ciclo)</th>
                    <th className="py-3.5 px-4">Liquidado a Admin</th>
                    <th className="py-3.5 px-4">Custodia Taquilla (COP)</th>
                    <th className="py-3.5 px-4">En Ruta (Cobrador)</th>
                    <th className="py-3.5 px-4">Custodia USD</th>
                    <th className="py-3.5 px-4">Custodia BS</th>
                    <th className="py-3.5 px-4 text-center">Estatus</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {custodySummary.map((row) => (
                    <tr key={row.agencia} className="hover:bg-slate-800/30 transition-colors font-mono">
                      <td className="py-3.5 px-4 font-sans font-bold text-white">
                        {row.agencia}
                      </td>
                      <td className="py-3.5 px-4 text-slate-300">
                        {formatCurrency(row.recaudado_cop, 'COP')}
                      </td>
                      <td className="py-3.5 px-4 text-slate-300">
                        {formatCurrency(row.liquidado_cop, 'COP')}
                      </td>
                      <td className="py-3.5 px-4 text-amber-400 font-bold">
                        {formatCurrency(row.custodia_taquilla_cop, 'COP')}
                      </td>
                      <td className="py-3.5 px-4 text-sky-400 font-bold">
                        {formatCurrency(row.en_ruta_cop, 'COP')}
                      </td>
                      <td className="py-3.5 px-4 text-emerald-400">
                        {formatCurrency(row.custodia_usd, 'USD')}
                      </td>
                      <td className="py-3.5 px-4 text-emerald-400">
                        {formatCurrency(row.custodia_bs, 'BS')}
                      </td>
                      <td className="py-3.5 px-4 text-center font-sans">
                        {row.status === 'custodia' && (
                          <span className="px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-400 text-[10px] font-bold border border-amber-500/30">
                            🟡 En Custodia Taquilla
                          </span>
                        )}
                        {row.status === 'ruta' && (
                          <span className="px-2.5 py-1 rounded-full bg-sky-500/15 text-sky-400 text-[10px] font-bold border border-sky-500/30">
                            🛵 En Ruta (Cobrador)
                          </span>
                        )}
                        {row.status === 'al_dia' && (
                          <span className="px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-400 text-[10px] font-bold border border-emerald-500/30">
                            🟢 En Caja Central / Al Día
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* New Cash Entry Form (Liquidación a Admin) */}
          <div className="bg-[#0D1B22] border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
            <div>
              <h4 className="text-base font-bold text-white flex items-center gap-2">
                <Banknote className="w-5 h-5 text-emerald-400" />
                Registrar Entrada de Dinero a Caja de Administración
              </h4>
              <p className="text-xs text-slate-400 mt-1">
                Registra la liquidación formal de efectivo entregada por un supervisor a administración y emite el comprobante oficial.
              </p>
            </div>

            <form onSubmit={handleCreateCashEntry} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300">Agencia *</label>
                  <select
                    value={formAgencia}
                    onChange={(e) => setFormAgencia(e.target.value)}
                    required
                    className="w-full bg-[#071217] border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-cyan-500"
                  >
                    <option value="">Seleccione Agencia...</option>
                    {agenciesList.map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300">Supervisor que Entrega</label>
                  <input
                    type="text"
                    placeholder="Nombre del supervisor"
                    value={formSupervisor}
                    onChange={(e) => setFormSupervisor(e.target.value)}
                    className="w-full bg-[#071217] border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300">Moneda *</label>
                  <select
                    value={formMoneda}
                    onChange={(e) => setFormMoneda(e.target.value as any)}
                    className="w-full bg-[#071217] border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-cyan-500"
                  >
                    <option value="COP">COP (Pesos Colombianos)</option>
                    <option value="USD">USD (Dólares Americanos)</option>
                    <option value="BS">BS (Bolívares)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300">Monto Recibido *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={formMonto}
                    onChange={(e) => setFormMonto(e.target.value)}
                    required
                    className="w-full bg-[#071217] border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white font-mono focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">Concepto / Observaciones</label>
                <input
                  type="text"
                  placeholder="Detalle o nota de la liquidación de efectivo..."
                  value={formNota}
                  onChange={(e) => setFormNota(e.target.value)}
                  className="w-full bg-[#071217] border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={isSubmittingCash}
                  className="px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-bold text-xs shadow-lg shadow-emerald-500/20 flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  {isSubmittingCash ? 'Registrando...' : 'Registrar Entrada a Caja y Emitir Recibo'}
                </button>
              </div>
            </form>
          </div>

          {/* Receipts History */}
          <div className="bg-[#0D1B22] border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
            <h4 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <FileText className="w-4 h-4 text-amber-400" />
              Historial de Comprobantes de Salidas y Entradas a Caja
            </h4>

            {cajaSupervisorRows.length === 0 ? (
              <p className="text-xs text-slate-400 py-6 text-center">
                Aún no se han registrado liquidaciones de efectivo de supervisores a la administración central.
              </p>
            ) : (
              <div className="space-y-3">
                {cajaSupervisorRows.map((rec) => {
                  const tMov = String(rec.tipo_movimiento || '').toUpperCase();
                  const com = String(rec.comentario || '');
                  const isCollector = tMov === 'ENTREGA_COBRADOR' || com.toUpperCase().includes('COBRADOR');
                  const isReceived = com.includes('[Recibido en Caja Central') || tMov === 'ENTREGA_ADMIN';

                  return (
                    <div
                      key={rec.id}
                      className="bg-[#071217] border border-slate-800 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded-md bg-cyan-500/10 text-cyan-400 text-[10px] font-mono font-bold">
                            Recibo #{rec.id}
                          </span>
                          <span className="text-sm font-bold text-white">{rec.agencia}</span>
                          <span className="text-xs text-slate-500">📅 {formatDate(rec.fecha || rec.created_at)}</span>
                        </div>
                        <div className="text-xs text-slate-400">
                          Supervisor: <strong className="text-slate-300">{rec.supervisor_nombre}</strong> • {com}
                        </div>
                      </div>

                      <div className="flex md:flex-col items-center md:items-end justify-between md:justify-center gap-2">
                        <div className="text-right">
                          <div className="text-base font-black text-emerald-400 font-mono">
                            {formatCurrency(rec.monto, rec.moneda)}
                          </div>
                          <div>
                            {isCollector && !isReceived ? (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-400 font-bold border border-sky-500/30">
                                🛵 EN CUSTODIA DE COBRADOR
                              </span>
                            ) : (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 font-bold border border-emerald-500/30">
                                🏛️ EN CAJA PRINCIPAL
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {isCollector && !isReceived && (
                            <button
                              onClick={() => handleReceiveCollectorCash(rec.id, rec.comentario)}
                              className="px-3 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 text-xs font-bold border border-emerald-500/30 flex items-center gap-1 transition-all cursor-pointer"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Recibir en Caja
                            </button>
                          )}

                          <button
                            onClick={() => setReceiptModalItem(rec)}
                            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer border border-slate-700"
                          >
                            <FileText className="w-3.5 h-3.5" />
                            Ver Recibo
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* =========================================================================
          REJECT MODAL
      ========================================================================= */}
      {rejectModalItem && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0D1B22] border border-rose-500/30 rounded-3xl p-6 sm:p-8 max-w-md w-full space-y-5 shadow-2xl animate-fade-in">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-2xl bg-rose-500/10 text-rose-400 border border-rose-500/20">
                <XCircle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Rechazar Transacción</h3>
                <p className="text-xs text-slate-400">
                  Agencia: {rejectModalItem.agencia} • {formatCurrency(rejectModalItem.monto, rejectModalItem.moneda)}
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">Motivo del Rechazo *</label>
                <select
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  className="w-full bg-[#071217] border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-rose-500"
                >
                  <option value="Comprobante no coincide / No cayó en cuenta">Comprobante no coincide / No cayó en cuenta</option>
                  <option value="Monto no coincide con el banco">Monto no coincide con el banco</option>
                  <option value="Referencia duplicada / Ya registrada">Referencia duplicada / Ya registrada</option>
                  <option value="Comprobante falso o alterado">Comprobante falso o alterado</option>
                  <option value="Pago no autorizado">Pago no autorizado</option>
                  <option value="Gasto no justificado">Gasto no justificado</option>
                  <option value="Otro motivo...">Otro motivo...</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">Nota Adicional (Opcional)</label>
                <textarea
                  rows={3}
                  value={rejectNote}
                  onChange={(e) => setRejectNote(e.target.value)}
                  placeholder="Detalles sobre por qué se rechaza..."
                  className="w-full bg-[#071217] border border-slate-700 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-rose-500 resize-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setRejectModalItem(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSubmitReject}
                disabled={isProcessing}
                className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-lg shadow-rose-600/20 flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
              >
                <XCircle className="w-4 h-4" />
                {isProcessing ? 'Guardando...' : 'Confirmar Rechazo'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          THERMAL RECEIPT MODAL (80mm)
      ========================================================================= */}
      {receiptModalItem && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#0D1B22] border border-slate-800 rounded-3xl p-6 max-w-sm w-full space-y-4 shadow-2xl animate-fade-in">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h4 className="text-sm font-bold text-white flex items-center gap-2">
                <FileText className="w-4 h-4 text-emerald-400" />
                Comprobante Oficial de Caja
              </h4>
              <button
                onClick={() => setReceiptModalItem(null)}
                className="text-slate-400 hover:text-white text-xs font-bold"
              >
                ✕
              </button>
            </div>

            {/* Thermal Ticket 80mm preview */}
            <div
              id="thermal-receipt"
              className="bg-white text-slate-900 rounded-xl p-5 shadow-inner font-mono text-xs space-y-3"
            >
              <div className="text-center border-b border-dashed border-slate-400 pb-2.5">
                <div className="text-[10px] font-bold text-slate-600 tracking-wider">MULTIBANCA EXPRESS</div>
                <div className="text-xs font-black uppercase">OPERADORA CMS • CAJA CENTRAL</div>
                <div className="text-[9px] text-slate-500">Recibo Oficial de Entrada a Caja</div>
              </div>

              <div className="space-y-1 text-[11px]">
                <div className="flex justify-between">
                  <span className="text-slate-500">Folio:</span>
                  <span className="font-bold">#{receiptModalItem.id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Fecha:</span>
                  <span>{formatDate(receiptModalItem.fecha || receiptModalItem.created_at)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Agencia:</span>
                  <span className="font-bold">{receiptModalItem.agencia}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Entregado por:</span>
                  <span>{receiptModalItem.supervisor_nombre || 'Supervisor'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Recibido por:</span>
                  <span>{receiptModalItem.recibido_por || currentOperatorName}</span>
                </div>
              </div>

              <div className="border-t border-b border-dashed border-slate-400 py-2.5 text-center bg-slate-50 rounded">
                <div className="text-[9px] font-bold uppercase text-slate-500">Monto Total Recibido</div>
                <div className="text-base font-black text-slate-900 mt-0.5">
                  {formatCurrency(receiptModalItem.monto, receiptModalItem.moneda)}
                </div>
              </div>

              <div className="text-[10px] space-y-1">
                <span className="text-slate-500">Concepto / Nota:</span>
                <p className="text-slate-800 italic bg-slate-100 p-2 rounded">
                  {receiptModalItem.comentario}
                </p>
              </div>

              <div className="border-t border-dashed border-slate-400 pt-6 grid grid-cols-2 gap-2 text-center text-[8px] text-slate-500">
                <div>
                  <div className="border-t border-slate-400 pt-1 font-bold text-slate-700">Entregado (Supervisor)</div>
                </div>
                <div>
                  <div className="border-t border-slate-400 pt-1 font-bold text-slate-700">Recibido (Admin)</div>
                </div>
              </div>
            </div>

            {/* Print and WhatsApp Buttons */}
            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                onClick={() => window.print()}
                className="py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center justify-center gap-1.5 transition-all border border-slate-700 cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                Imprimir Recibo
              </button>

              <a
                href={getWhatsAppReceiptUrl(receiptModalItem)}
                target="_blank"
                rel="noreferrer"
                className="py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-lg shadow-emerald-600/20"
              >
                <Share2 className="w-3.5 h-3.5" />
                WhatsApp
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
