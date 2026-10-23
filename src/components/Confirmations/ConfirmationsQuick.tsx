import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { normalizarMoneda, formatCurrency, formatDate, parseCleanReference, cleanReference } from '../../utils/formatters';
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
  RotateCcw,
  Bell,
  Sparkles,
  Code2,
  Landmark,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { notificationService } from '../../utils/notificationService';
import { realtimeBroadcast } from '../../utils/realtimeBroadcast';
import { ApiDocsModal } from '../Common/ApiDocsModal';
import { loadCurrencies, type CurrencyConfig } from '../../utils/currencies';
import { UI_LOCK } from '../../styles/uiDesignLock';

export const ConfirmationsQuick: React.FC = () => {
  const { effectiveUserId, user } = useAuth();

  // Filters state
  const [selAgencia, setSelAgencia] = useState('Todas');
  const [searchQuery, setSearchQuery] = useState('');

  // API Modal state
  const [showApiModal, setShowApiModal] = useState(false);

  // Data state
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transactions, setTransactions] = useState<ConfirmationTransaction[]>([]);
  const [agenciesList, setAgenciesList] = useState<string[]>([]);
  const [cashierMap, setCashierMap] = useState<Record<string, string>>({});
  const [activeCurrencies, setActiveCurrencies] = useState<CurrencyConfig[]>([]);

  // Reject modal state
  const [rejectModalItem, setRejectModalItem] = useState<ConfirmationTransaction | null>(null);
  const [rejectReason, setRejectReason] = useState('Comprobante no coincide / No cayó en cuenta');
  const [rejectNote, setRejectNote] = useState('');

  // Bulk confirmation state
  const [isBulkConfirming, setIsBulkConfirming] = useState(false);

  // Feedback message
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Live Sync
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(true);
  const [lastSyncTime, setLastSyncTime] = useState<Date>(new Date());
  const [secondsAgo, setSecondsAgo] = useState(0);
  const [isSilentUpdating, setIsSilentUpdating] = useState(false);
  const [recentlyArrivedIds, setRecentlyArrivedIds] = useState<Set<string>>(new Set());

  const markRecentlyArrived = useCallback((key: string) => {
    setRecentlyArrivedIds((prev) => new Set([...prev, key]));
    setTimeout(() => {
      setRecentlyArrivedIds((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }, 15000);
  }, []);

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
      // 1. Fetch agencies & bank accounts & active currencies
      const [{ data: agData }, { data: cbData }, currs] = await Promise.all([
        supabase
          .from('agencias')
          .select('id, nombre_agencia, cuentas_asignadas')
          .eq('user_id', effectiveUserId),
        supabase
          .from('cuentas_bancarias')
          .select('id, banco, titular, numero_cuenta, moneda, tipo_cuenta, agencia_asignada')
          .eq('user_id', effectiveUserId),
        loadCurrencies(effectiveUserId),
      ]);
      setActiveCurrencies(currs);

      const ags = (agData || [])
        .map((a: any) => String(a.nombre_agencia || '').trim().toUpperCase())
        .filter(Boolean);
      setAgenciesList(Array.from(new Set(ags)).sort());

      const agencyNameMap: Record<string, string> = {};
      const cashierMap: Record<string, string> = {};
      const cobradorMap: Record<string, string> = {};

      (agData || []).forEach((a: any) => {
        const aNom = String(a.nombre_agencia || '').trim().toUpperCase();
        agencyNameMap[String(a.id)] = aNom;
        cashierMap[`ag_${a.id}`] = `${aNom} (Taquilla)`;
        cashierMap[`AG_${a.id}`] = `${aNom} (Taquilla)`;
      });

      // 2. Fetch cashiers and collectors
      const [{ data: userData }, { data: cobData }] = await Promise.all([
        supabase.from('taquilla_usuarios').select('id, usuario, nombre_cajero'),
        supabase.from('cda_cobradores').select('id, usuario, nombre'),
      ]);

      (userData || []).forEach((u: any) => {
        cashierMap[String(u.id)] = String(u.nombre_cajero || u.usuario || `Cajero ${u.id}`);
      });

      (cobData || []).forEach((c: any) => {
        const cNom = String(c.nombre || c.usuario || '').trim();
        if (cNom) {
          cobradorMap[String(c.id)] = cNom;
          if (c.usuario) cobradorMap[String(c.usuario).trim().toLowerCase()] = cNom;
        }
        cashierMap[String(c.id)] = `Cobrador: ${cNom || c.id}`;
      });

      setCashierMap(cashierMap);

      const resolveCobrador = (r: any): string => {
        const cNomRaw = r.cobrador_nombre || r.cobrado_por || r.cobrador;
        if (cNomRaw && String(cNomRaw).trim().toUpperCase() !== 'ENTREGADO A COBRADOR' && String(cNomRaw).trim().toUpperCase() !== 'N/A') {
          return String(cNomRaw).trim();
        }
        if (r.cobrador_id && cobradorMap[String(r.cobrador_id)]) {
          return cobradorMap[String(r.cobrador_id)];
        }
        if (r.confirmado_por && String(r.confirmado_por).trim().toUpperCase() !== 'ENTREGADO A COBRADOR') {
          return String(r.confirmado_por).trim();
        }
        if (r.pagador && String(r.pagador).trim().toUpperCase() !== 'ENTREGADO A COBRADOR' && String(r.pagador).trim().toUpperCase() !== 'N/A') {
          return String(r.pagador).trim();
        }
        return '';
      };

      const resolveCashierName = (cid: string, agNom: string): string => {
        if (!cid || cid === 'N/A' || cid === 'null' || cid === 'undefined') {
          return agNom ? `${agNom} (Taquilla)` : 'Taquilla';
        }
        const cidClean = String(cid).trim();
        if (cidClean.toUpperCase() === 'API' || cidClean.toUpperCase() === 'API_EXTERNA') {
          return '⚡ API Externa (App / Web)';
        }
        if (cashierMap[cidClean]) return cashierMap[cidClean];
        if (cidClean.toLowerCase().startsWith('ag_')) {
          const rawAid = cidClean.slice(3);
          const nom = agencyNameMap[rawAid] || agNom;
          return nom ? `${nom} (Taquilla)` : `Agencia #${rawAid}`;
        }
        if (cidClean.length >= 20 && cidClean.includes('-')) {
          return agNom ? `${agNom} (Cajero)` : 'Cajero Taquilla';
        }
        return `Cajero ${cidClean}`;
      };

      const resolveBanco = (r: any, agStr: string): string => {
        const posStr = String(r.pos_o_cuenta || '').trim();
        if (posStr && posStr !== 'N/A' && !posStr.includes('Cuenta Operadora General')) {
          const rawB = posStr.split('|')[0].trim().replace('DISPOSITIVO: ', '');
          if (rawB) return rawB.toUpperCase();
        }
        const agObj = (agData || []).find((a: any) => String(a.nombre_agencia || '').trim().toUpperCase() === agStr);
        if (agObj?.cuentas_asignadas) {
          const m = agObj.cuentas_asignadas.match(/\[CUENTA\]\s*([A-Za-z0-9_-]+)/i);
          if (m && m[1]) return m[1].trim().toUpperCase();
        }
        const cbObj = (cbData || []).find((c: any) => String(c.agencia_asignada || '').trim().toUpperCase() === agStr);
        if (cbObj?.banco) return String(cbObj.banco).trim().toUpperCase();

        const monNorm = normalizarMoneda(r.moneda);
        if (monNorm === 'COP') return 'BANCOLOMBIA';
        if (monNorm === 'USD') return 'CITI BANK / ZELLE';
        return 'BANESCO';
      };

      // 3. Fetch transaction tables (only pending: confirmado === false && rechazado === false)
      const [pbRes, gdRes, gcRes, cgRes, pdRes, psRes, gsRes] = await Promise.all([
        supabase.from('cda_pagos_bancarios').select('*').eq('user_id', effectiveUserId),
        supabase.from('cda_gastos_diarios').select('*').eq('user_id', effectiveUserId),
        supabase.from('gastos').select('*').eq('user_id', effectiveUserId),
        supabase.from('cda_gastos').select('*').eq('user_id', effectiveUserId),
        supabase.from('cda_pagos_diarios').select('*').eq('user_id', effectiveUserId),
        supabase.from('pagos_semana').select('*').eq('user_id', effectiveUserId),
        supabase.from('gastos_semana').select('*').eq('user_id', effectiveUserId),
      ]);

      const list: ConfirmationTransaction[] = [];

      // Bancarios
      (pbRes.data || []).forEach((r: any) => {
        const isRech = !!r.rechazado || String(r.estado || '').toUpperCase() === 'RECHAZADO';
        const isConf = (!!r.confirmado || !!r.confirmado_supervisor) && !isRech;
        if (!isConf && !isRech) {
          const cid = String(r.cajero_id || r.user_id || '');
          const agStr = String(r.agencia || '').trim().toUpperCase();
          const met = String(r.metodo_pago || 'BANCO').trim().toUpperCase();
          const conc = String(r.concepto || 'Pago Bancario');
          const isPremio = ['PREMIO', 'PÉRDIDA', 'PERDIDA', 'ABONO', 'REPOSICION'].some((k) =>
            (conc + ' ' + met).toUpperCase().includes(k)
          );
          let cat = 'Bancos';
          if (isPremio) cat = 'Pago de Premios';
          else if (met.includes('PUNTO')) cat = 'Punto de Venta';

          const bancoNom = resolveBanco(r, agStr);

          list.push({
            id: r.id,
            tabla: 'cda_pagos_bancarios',
            categoria: cat,
            fecha: String(r.fecha || r.created_at || ''),
            agencia: agStr,
            cajero_id: cid,
            cajero_nombre: resolveCashierName(cid, agStr),
            metodo: met,
            banco: bancoNom,
            pos_o_cuenta: r.pos_o_cuenta || undefined,
            monto: parseFloat(r.monto) || 0,
            moneda: normalizarMoneda(r.moneda),
            referencia: cleanReference(r.referencia || 'N/A'),
            concepto: conc,
            pagador: String(r.datos_pagador || 'N/A'),
            confirmado: false,
            rechazado: false,
            created_at: String(r.created_at || ''),
          });
        }
      });

      // Process pagos_semana (CMS Manual Payments pending)
      (psRes.data || []).forEach((r: any) => {
        const isRech = !!r.rechazado || String(r.estado || '').toUpperCase() === 'RECHAZADO';
        const isConf = !!r.confirmado && !isRech;
        if (!isConf && !isRech) {
          const rawRef = String(r.referencia || 'N/A');
          const { cleanRef, extractedBank } = parseCleanReference(rawRef);
          const agStr = String(r.agencia || '').trim().toUpperCase();
          const tipoPagoStr = String(r.tipo_pago || 'PAGO').toUpperCase();
          const metRaw = String(r.metodo || 'BANCO').trim().toUpperCase();

          const isSyncedFromTaquilla = (pbRes.data || []).some((pb: any) => {
            const pbAg = String(pb.agencia || '').trim().toUpperCase();
            const pbMonto = Number(pb.monto || 0);
            const pbRef = String(pb.referencia || '').trim().toUpperCase();
            if (pbAg !== agStr || Math.abs(pbMonto - Number(r.monto || 0)) >= 0.01) {
              return false;
            }
            if (rawRef.toUpperCase().includes('CONFIRMADO BANCO')) {
              return true;
            }
            if (pbRef && pbRef !== 'N/A' && (rawRef.toUpperCase().includes(pbRef) || cleanRef.toUpperCase() === pbRef)) {
              return true;
            }
            return false;
          });

          if (!isSyncedFromTaquilla) {
            let cat = 'Bancos';
            if (tipoPagoStr.includes('PREMIO') || rawRef.includes('PREMIO')) {
              cat = 'Pago de Premios';
            } else if (metRaw.includes('EFECTIVO')) {
              cat = 'Efectivo';
            }

            const bancoNom = extractedBank
              ? extractedBank.split(' - ')[0].trim().toUpperCase()
              : resolveBanco(r, agStr);

            list.push({
              id: r.id,
              tabla: 'pagos_semana',
              categoria: cat,
              fecha: String(r.fecha || r.created_at || ''),
              agencia: agStr,
              cajero_id: 'CMS',
              cajero_nombre: 'Administración (CMS)',
              metodo: metRaw,
              banco: bancoNom,
              pos_o_cuenta: r.pos_o_cuenta || extractedBank || undefined,
              monto: parseFloat(r.monto) || 0,
              moneda: normalizarMoneda(r.moneda),
              referencia: cleanRef,
              concepto: tipoPagoStr === 'PAGO DE PREMIOS' ? 'Pago de Premios (CMS)' : 'Pago / Cobro Directo (CMS)',
              pagador: 'Operadora / CMS',
              confirmado: false,
              rechazado: false,
              created_at: String(r.created_at || ''),
            });
          }
        }
      });

      // Gastos
      const allGastos = [
        ...(gdRes.data || []).map((r: any) => ({ ...r, _table: 'cda_gastos_diarios' })),
        ...(gcRes.data || []).map((r: any) => ({ ...r, _table: 'gastos' })),
        ...(cgRes.data || []).map((r: any) => ({ ...r, _table: 'cda_gastos' })),
        ...(gsRes.data || []).map((r: any) => ({ ...r, _table: 'gastos_semana' })),
      ];

      allGastos.forEach((r: any) => {
        const isRech = !!r.rechazado || String(r.estado || '').toUpperCase() === 'RECHAZADO';
        const isConf = (!!r.confirmado || !!r.confirmado_supervisor) && !isRech;
        if (!isConf && !isRech) {
          const cid = String(r.cajero_id || r.user_id || '');
          const agStr = String(r.agencia || r.nombre_agency || '').trim().toUpperCase();
          const cNom = r._table === 'gastos_semana' ? 'Administración (CMS)' : resolveCashierName(cid, agStr);
          let rawConcepto = String(r.concepto || r.descripcion || 'Gasto Operativo').trim();
          let refStr = String(r.referencia || '').trim();
          if (!refStr || refStr === 'N/A') {
            const matchRef = rawConcepto.match(/\[REF:\s*([^\]]+)\]/i);
            if (matchRef) {
              refStr = cleanReference(matchRef[1].trim());
              rawConcepto = rawConcepto.replace(/\[REF:\s*[^\]]+\]/i, '').trim();
            } else {
              refStr = 'N/A';
            }
          } else {
            refStr = cleanReference(refStr);
          }

          list.push({
            id: r.id,
            tabla: r._table,
            categoria: 'Gastos',
            fecha: String(r.fecha || r.created_at || ''),
            agencia: agStr,
            cajero_id: cid || 'CMS',
            cajero_nombre: cNom,
            metodo: 'GASTO',
            monto: parseFloat(r.monto) || 0,
            moneda: normalizarMoneda(r.moneda),
            referencia: refStr,
            concepto: rawConcepto,
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
          const conc = String(r.concepto || '').toUpperCase();
          // Las entregas a supervisor son confirmaciones internas locales de la agencia/supervisor; no van a confirmaciones de admin
          if (tipo.includes('SUPERVISOR') || conc.includes('SUPERVISOR')) return;

          const cid = String(r.cajero_id || r.user_id || '');
          const agStr = String(r.agencia || r.nombre_agency || '').trim().toUpperCase();
          const isBanco = ['PUNTO', 'POS', 'TRANSFERENCIA', 'ZELLE', 'PAGO MOVIL', 'PAGO MÓVIL'].some((k) =>
            tipo.includes(k)
          );
          const isCobrador = tipo.includes('COBRADOR') || String(r.concepto || '').toUpperCase().includes('COBRADOR') || !!r.cobrador_id || !!r.cobrado_por || !!r.cobrador_nombre;

          let metodoFinal = tipo || 'EFECTIVO';
          let conceptoFinal = String(r.concepto || tipo || 'Pago Taquilla');
          let pagadorFinal = String(r.pagador || 'N/A');

          if (isCobrador) {
            const cobNombre = resolveCobrador(r);
            metodoFinal = cobNombre ? `COBRADOR (${cobNombre})` : 'COBRADOR';
            conceptoFinal = cobNombre ? `Cobrador: ${cobNombre}` : 'Entrega a Cobrador';
            pagadorFinal = cobNombre ? `Cobrador: ${cobNombre}` : 'Cobrador';
          }

          list.push({
            id: r.id,
            tabla: 'cda_pagos_diarios',
            categoria: isCobrador ? 'Efectivo' : isBanco ? 'Bancos' : 'Efectivo',
            fecha: String(r.fecha || r.created_at || ''),
            agencia: agStr,
            cajero_id: cid,
            cajero_nombre: resolveCashierName(cid, agStr),
            metodo: metodoFinal,
            monto: parseFloat(r.monto) || 0,
            moneda: normalizarMoneda(r.moneda),
            referencia: String(r.referencia || 'N/A'),
            concepto: conceptoFinal,
            pagador: pagadorFinal,
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

  // Realtime subscription & Heartbeat auto-sync
  useEffect(() => {
    if (!effectiveUserId || !autoSyncEnabled) return;

    // 1. Direct WebSocket Broadcast Listener (0ms instantáneo desde Taquilla POS)
    const unsubSocketBank = realtimeBroadcast.subscribe('NEW_BANK_PAYMENT', (data) => {
      const tagKey = `pago_banco_${data.id || data.referencia}`;
      notificationService.showNotification('🔔 Nuevo Pago Bancario de Taquilla', {
        body: `Agencia ${data.agencia || 'General'}: ${formatCurrency(Number(data.monto || 0), (data.moneda || 'BS') as any)} (Ref: ${data.referencia || 'N/A'})`,
        soundType: 'new_payment',
        toastType: 'payment',
        tag: tagKey,
      });
      if (data.id) markRecentlyArrived(`cda_pagos_bancarios_${data.id}`);
      loadData(true);
    });

    const unsubSocketCash = realtimeBroadcast.subscribe('NEW_CASH_PAYMENT', (data) => {
      const tagKey = `pago_efectivo_${data.id || data.referencia}`;
      notificationService.showNotification('💵 Nueva Entrega de Efectivo / Cobrador', {
        body: `Agencia ${data.agencia || 'General'}: ${formatCurrency(Number(data.monto || 0), (data.moneda || 'BS') as any)}`,
        soundType: 'new_payment',
        toastType: 'cash',
        tag: tagKey,
      });
      if (data.id) markRecentlyArrived(`cda_pagos_diarios_${data.id}`);
      loadData(true);
    });

    const unsubSocketAgency = realtimeBroadcast.subscribe('NEW_AGENCY_PAYMENT', (data) => {
      const tagKey = `pago_semana_${data.id || data.referencia}`;
      notificationService.showNotification(`🔔 Nuevo Pago de Agencia (${data.metodo_pago || 'BANCO'})`, {
        body: `Agencia ${data.agencia || 'General'}: ${formatCurrency(Number(data.monto || 0), (data.moneda || 'BS') as any)} (Ref: ${data.referencia || 'N/A'})`,
        soundType: 'new_payment',
        toastType: data.metodo_pago === 'EFECTIVO' ? 'cash' : 'payment',
        tag: tagKey,
      });
      if (data.id) markRecentlyArrived(`pagos_semana_${data.id}`);
      loadData(true);
    });

    const unsubSocketPrize = realtimeBroadcast.subscribe('NEW_PRIZE_PAYMENT', (data) => {
      const tagKey = `pago_semana_premio_${data.id || data.referencia}`;
      notificationService.showNotification('🏆 Nuevo Pago de Premios de Agencia', {
        body: `Agencia ${data.agencia || 'General'}: ${formatCurrency(Number(data.monto || 0), (data.moneda || 'BS') as any)} (Ref: ${data.referencia || 'N/A'})`,
        soundType: 'new_payment',
        toastType: 'payment',
        tag: tagKey,
      });
      if (data.id) markRecentlyArrived(`pagos_semana_${data.id}`);
      loadData(true);
    });

    const unsubSocketExpense = realtimeBroadcast.subscribe('NEW_EXPENSE', (data) => {
      const tbl = data.tabla || 'gastos';
      const tagKey = `gasto_${tbl}_${data.id || data.referencia || Date.now()}`;
      notificationService.showNotification('🧾 Nuevo Gasto por Agencia', {
        body: `Agencia ${data.agencia || 'General'}: ${formatCurrency(Number(data.monto || 0), (data.moneda || 'BS') as any)} • ${data.concepto || 'Gasto Operativo'}`,
        soundType: 'new_payment',
        toastType: 'expense',
        tag: tagKey,
      });
      if (data.id) markRecentlyArrived(`${tbl}_${data.id}`);
      loadData(true);
    });

    // 2. Supabase Postgres Changes Listener
    const channel = supabase
      .channel(`quick_conf_live_${effectiveUserId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cda_pagos_bancarios' }, (payload: any) => {
        if (payload.eventType === 'INSERT') {
          const row = payload.new;
          if (row.id) markRecentlyArrived(`cda_pagos_bancarios_${row.id}`);
          const isFromApi = String(row.cajero_id || '').toUpperCase() === 'API';
          notificationService.showNotification(
            isFromApi ? '⚡ Nuevo Pago de API Externa (App / Web)' : '🔔 Nuevo Pago Bancario de Taquilla',
            {
              body: `Agencia ${row.agencia || 'General'}: ${formatCurrency(Number(row.monto || 0), row.moneda as any)} (Ref: ${row.referencia || 'N/A'})${isFromApi ? ' • Requiere confirmación' : ''}`,
              soundType: 'new_payment',
              toastType: 'payment',
              tag: `pago_banco_${row.id || row.referencia}`,
            }
          );
        }
        loadData(true);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cda_gastos_diarios' }, (payload: any) => {
        if (payload.eventType === 'INSERT') {
          const row = payload.new;
          if (!row.confirmado && !row.rechazado) {
            if (row.id) markRecentlyArrived(`cda_gastos_diarios_${row.id}`);
            notificationService.showNotification('🧾 Nuevo Gasto Diario de Agencia', {
              body: `Agencia ${row.agencia || 'General'}: ${formatCurrency(Number(row.monto || 0), (row.moneda || 'BS') as any)} • ${row.concepto || row.descripcion || 'Gasto'}`,
              soundType: 'new_payment',
              toastType: 'expense',
              tag: `gasto_cda_gastos_diarios_${row.id}`,
            });
          }
        }
        loadData(true);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'gastos' }, (payload: any) => {
        if (payload.eventType === 'INSERT') {
          const row = payload.new;
          if (!row.confirmado && !row.rechazado) {
            if (row.id) markRecentlyArrived(`gastos_${row.id}`);
            notificationService.showNotification('🧾 Nuevo Gasto por Agencia', {
              body: `Agencia ${row.agencia || 'General'}: ${formatCurrency(Number(row.monto || 0), (row.moneda || 'BS') as any)} • ${row.concepto || 'Gasto'}`,
              soundType: 'new_payment',
              toastType: 'expense',
              tag: `gasto_gastos_${row.id}`,
            });
          }
        }
        loadData(true);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cda_gastos' }, () => loadData(true))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cda_pagos_diarios' }, (payload: any) => {
        if (payload.eventType === 'INSERT') {
          const row = payload.new;
          if (row.id) markRecentlyArrived(`cda_pagos_diarios_${row.id}`);
          notificationService.showNotification('💵 Nueva Entrega de Efectivo / Cobrador', {
            body: `Agencia ${row.agencia || 'General'}: ${formatCurrency(Number(row.monto || 0), row.moneda as any)}`,
            soundType: 'new_payment',
            toastType: 'cash',
            tag: `pago_efectivo_${row.id || row.referencia}`,
          });
        }
        loadData(true);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pagos_semana' }, (payload: any) => {
        if (payload.eventType === 'INSERT') {
          const row = payload.new;
          const isRech = Boolean(row.rechazado);
          const isConf = Boolean(row.confirmado);
          if (!isConf && !isRech) {
            const isPremio = String(row.tipo_pago || '').toUpperCase().includes('PREMIO') ||
              String(row.referencia || '').toUpperCase().includes('PREMIO');
            const notifTitle = isPremio ? '🏆 Nuevo Pago de Premios de Agencia' : `🔔 Nuevo Pago de Agencia (${row.metodo || 'BANCO'})`;
            const tagKey = isPremio ? `pago_semana_premio_${row.id || row.referencia}` : `pago_semana_${row.id || row.referencia}`;

            if (row.id) markRecentlyArrived(`pagos_semana_${row.id}`);
            notificationService.showNotification(notifTitle, {
              body: `Agencia ${row.agencia || 'General'}: ${formatCurrency(Number(row.monto || 0), (row.moneda || 'BS') as any)} (Ref: ${row.referencia || 'N/A'})`,
              soundType: 'new_payment',
              toastType: row.metodo === 'EFECTIVO' ? 'cash' : 'payment',
              tag: tagKey,
            });
          }
        }
        loadData(true);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'gastos_semana' }, () => loadData(true))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cda_caja_efectivo_supervisor' }, () => loadData(true))
      .subscribe();

    // Resilient background auto-sync polling every 8 seconds
    const intervalId = setInterval(() => {
      loadData(true);
    }, 8000);

    return () => {
      unsubSocketBank();
      unsubSocketCash();
      unsubSocketAgency();
      unsubSocketPrize();
      unsubSocketExpense();
      supabase.removeChannel(channel);
      clearInterval(intervalId);
    };
  }, [effectiveUserId, autoSyncEnabled, loadData, markRecentlyArrived]);

  // Relative time counter ("Actualizado hace X seg")
  useEffect(() => {
    const timer = setInterval(() => {
      const diff = Math.floor((Date.now() - lastSyncTime.getTime()) / 1000);
      setSecondsAgo(diff);
    }, 1000);
    return () => clearInterval(timer);
  }, [lastSyncTime]);

  // Auto-dismiss feedback message after 6 seconds
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => {
      setMessage(null);
    }, 6000);
    return () => clearTimeout(timer);
  }, [message]);

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
    const byCurr: Record<string, number> = {};
    activeCurrencies.forEach((c) => {
      byCurr[c.codigo] = 0;
    });
    filteredTransactions.forEach((tx) => {
      byCurr[tx.moneda] = (byCurr[tx.moneda] || 0) + tx.monto;
    });
    return { count: filteredTransactions.length, byCurr };
  }, [filteredTransactions, activeCurrencies]);

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

      // Broadcast immediately via WebSocket to Taquilla Web
      realtimeBroadcast.broadcast('PAYMENT_CONFIRMED', {
        id: tx.id,
        tabla: tx.tabla,
        agencia: tx.agencia,
        monto: tx.monto,
        moneda: tx.moneda,
        referencia: tx.referencia,
        confirmado_por: currentUser,
        created_at: new Date().toISOString(),
      });

      confetti({ particleCount: 50, spread: 65, origin: { y: 0.7 } });
      const formattedMonto = formatCurrency(tx.monto, tx.moneda);
      setMessage({
        type: 'success',
        text: `¡Aprobado con éxito! ${tx.agencia} • ${formattedMonto} [${tx.metodo}] confirmado e ingresado a caja.`,
      });
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

      // Broadcast immediately via WebSocket to Taquilla Web
      realtimeBroadcast.broadcast('PAYMENT_REJECTED', {
        id: rejectModalItem.id,
        tabla: rejectModalItem.tabla,
        agencia: rejectModalItem.agencia,
        monto: rejectModalItem.monto,
        moneda: rejectModalItem.moneda,
        referencia: rejectModalItem.referencia,
        rechazado_por: currentUser,
        motivo_rechazo: finalReason,
        created_at: new Date().toISOString(),
      });

      const rejMonto = formatCurrency(rejectModalItem.monto, rejectModalItem.moneda);
      setMessage({
        type: 'success',
        text: `Transacción de ${rejectModalItem.agencia} por ${rejMonto} fue rechazada (${finalReason}).`,
      });
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

      realtimeBroadcast.broadcast('DATA_CHANGED', {
        created_at: new Date().toISOString(),
      });

      await loadData();
    } catch (err: any) {
      console.error('Bulk confirm error:', err);
      setMessage({ type: 'error', text: 'Ocurrió un error al procesar la confirmación masiva.' });
    } finally {
      setIsBulkConfirming(false);
    }
  };

  return (
    <div className={UI_LOCK.pageContainer}>
      {/* Header & Actions */}
      <div id="tour-confirmaciones-header" className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-[#0D1B22] p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-sm transition-colors">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              <CheckCheck className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
                <span>Confirmaciones</span>
                <span className="px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20 text-xs font-bold font-mono">
                  {metrics.count} pendientes
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Pizarra operativa: Verificación y aprobación rápida en 1 clic de transferencias, puntos de venta, gastos y efectivo.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Live Auto-sync Toggle Pill */}
          <button
            onClick={() => setAutoSyncEnabled(!autoSyncEnabled)}
            className={`px-3 py-2 rounded-xl border text-xs font-bold flex items-center gap-2 transition-all cursor-pointer shadow-sm ${
              autoSyncEnabled
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20'
                : 'bg-slate-100 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
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
                  autoSyncEnabled ? 'bg-emerald-500' : 'bg-slate-400'
                }`}
              ></span>
            </span>
            <span>{autoSyncEnabled ? 'En vivo' : 'En pausa'}</span>
          </button>

          {/* Relative last updated time */}
          <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono hidden sm:inline px-1">
            {secondsAgo < 5 ? 'Actualizado ahora' : `Hace ${secondsAgo}s`}
          </span>

          {/* External API / Connect Apps Button */}
          <button
            onClick={() => setShowApiModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 text-purple-700 dark:text-purple-300 text-xs font-bold transition-all border border-purple-500/30 cursor-pointer shadow-sm"
            title="Credenciales y webhook de API para conectar aplicaciones móviles o externas"
          >
            <Code2 className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
            <span className="hidden sm:inline">Conectar Apps / API</span>
          </button>

          {/* Manual Sync Button */}
          <button
            onClick={() => loadData(false)}
            disabled={isLoading || isSilentUpdating}
            className={UI_LOCK.buttonSecondary}
            title="Sincronizar manualmente"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 ${isLoading || isSilentUpdating ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Sincronizar</span>
          </button>

          {metrics.count > 0 && (
            <button
              onClick={handleBulkConfirmAll}
              disabled={isBulkConfirming || isProcessing}
              className={UI_LOCK.buttonPrimary}
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{isBulkConfirming ? 'Confirmando...' : `Confirmar Todos (${metrics.count})`}</span>
            </button>
          )}
        </div>
      </div>

      {/* Messages / Avisos de Confirmación */}
      {message && (
        <div
          className={`p-4 rounded-2xl text-sm font-bold border flex items-center justify-between shadow-lg transition-all animate-fade-in ${
            message.type === 'success'
              ? 'bg-emerald-50 border-emerald-300 text-emerald-900 dark:bg-emerald-950/70 dark:text-emerald-300 dark:border-emerald-500/40'
              : 'bg-rose-50 border-rose-300 text-rose-900 dark:bg-rose-950/70 dark:text-rose-300 dark:border-rose-500/40'
          }`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`p-2 rounded-xl shrink-0 ${
                message.type === 'success'
                  ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                  : 'bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/30'
              }`}
            >
              {message.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
            </div>
            <span className="text-xs sm:text-sm font-extrabold tracking-wide">{message.text}</span>
          </div>
          <button
            onClick={() => setMessage(null)}
            className="text-slate-400 hover:text-slate-700 dark:hover:text-white p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition-all cursor-pointer font-black text-xs ml-3 shrink-0"
            title="Cerrar aviso"
          >
            ✕
          </button>
        </div>
      )}

      {/* Metrics Row - Dynamic Currencies */}
      <div id="tour-confirmaciones-metrics" className={UI_LOCK.kpiGrid(activeCurrencies.length + 1)}>
        <div className="p-4 rounded-2xl bg-white dark:bg-[#0D1B22] border border-slate-200/80 dark:border-slate-800/80 shadow-xs flex items-center gap-3.5 transition-colors">
          <div className="p-3 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 shrink-0">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Total Pendientes</div>
            <div className="text-2xl font-black text-amber-600 dark:text-amber-400 font-mono mt-0.5">{metrics.count}</div>
          </div>
        </div>

        {activeCurrencies.map((curr) => {
          const montoPend = metrics.byCurr[curr.codigo] || 0;
          return (
            <div key={curr.codigo} className="p-4 rounded-2xl bg-white dark:bg-[#0D1B22] border border-slate-200/80 dark:border-slate-800/80 shadow-xs flex items-center gap-3.5 transition-colors">
              <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shrink-0">
                <DollarSign className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider truncate">
                  Pendiente {curr.nombre} ({curr.codigo})
                </div>
                <div className="text-lg font-black text-slate-900 dark:text-white font-mono mt-0.5 truncate">
                  {formatCurrency(montoPend, curr.codigo)}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Quick Filters */}
      <div className="p-4 rounded-2xl bg-white dark:bg-[#0D1B22] border border-slate-200/80 dark:border-slate-800/80 shadow-sm flex flex-col md:flex-row items-center gap-3.5 transition-colors">
        <div className="w-full md:w-64">
          <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Agencia</label>
          <div className="relative">
            <select
              value={selAgencia}
              onChange={(e) => setSelAgencia(e.target.value)}
              className="w-full pl-3 pr-8 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700/80 rounded-xl text-xs font-bold text-slate-900 dark:text-white focus:outline-hidden focus:border-emerald-500 cursor-pointer"
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
          <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Buscar</label>
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Buscar por referencia, pagador, concepto o método..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700/80 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-hidden focus:border-emerald-500"
            />
          </div>
        </div>
      </div>

      {/* Pending Items List */}
      {isLoading ? (
        <div className="p-12 text-center bg-white dark:bg-[#0D1B22] rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-sm">
          <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-xs text-slate-500 dark:text-slate-400">Cargando transacciones pendientes...</p>
        </div>
      ) : filteredTransactions.length === 0 ? (
        <div className="p-16 text-center bg-white dark:bg-[#0D1B22] rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-sm flex flex-col items-center justify-center">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-4">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-black text-slate-900 dark:text-white tracking-tight">¡Todo al día!</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mt-1">
            No hay transacciones pendientes por confirmar con los filtros seleccionados.
          </p>
        </div>
      ) : (
        <div id="tour-confirmaciones-board" className="space-y-3">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500 dark:text-slate-400 px-1">
            <span>Mostrando {filteredTransactions.length} registros pendientes:</span>
          </div>

          <div className="grid grid-cols-1 gap-3">
            {filteredTransactions.map((tx) => {
              const isBanco = tx.categoria === 'Bancos' || tx.categoria === 'Punto de Venta';
              const isGasto = tx.categoria === 'Gastos';
              const itemKey = `${tx.tabla}_${tx.id}`;
              const isRecentlyArrived = recentlyArrivedIds.has(itemKey);

              return (
                <div
                  key={itemKey}
                  className={`p-4 rounded-2xl transition-all shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4 group ${
                    isRecentlyArrived
                      ? 'bg-emerald-50 dark:bg-[#0f2425] border-2 border-emerald-400 ring-2 ring-emerald-500/50 shadow-[0_0_35px_rgba(16,185,129,0.35)] animate-pulse'
                      : 'bg-white dark:bg-[#0D1B22] border border-slate-200/80 dark:border-slate-800/90 hover:border-emerald-500/40'
                  }`}
                >
                  {/* Left: Info details */}
                  <div className="space-y-2 flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        <span>{tx.agencia}</span>
                      </span>

                      {isRecentlyArrived && (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-emerald-500 text-white dark:text-black shadow-md flex items-center gap-1 animate-bounce">
                          <Sparkles className="w-3 h-3" />
                          <span>¡NUEVO ENTRANTE!</span>
                        </span>
                      )}

                      {(tx.cajero_id === 'API' || tx.cajero_nombre?.includes('API')) && (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-purple-500/10 dark:bg-purple-500/20 text-purple-700 dark:text-purple-300 border border-purple-500/40 shadow-xs flex items-center gap-1">
                          <Code2 className="w-3 h-3 text-purple-600 dark:text-purple-400" />
                          <span>API EXTERNA (APP/WEB)</span>
                        </span>
                      )}

                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider ${
                          isGasto
                            ? 'bg-rose-500/10 dark:bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30'
                            : isBanco
                            ? 'bg-sky-500/10 dark:bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-500/30'
                            : 'bg-emerald-500/10 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30'
                        }`}
                      >
                        {tx.categoria}
                      </span>

                      <span className="px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20 text-[10px] font-bold flex items-center gap-1">
                        <Clock className="w-2.5 h-2.5" />
                        <span>{tx.metodo.includes('COBRADOR') ? '🛵 Por Recoger (Cobrador)' : 'Pendiente'}</span>
                      </span>

                      <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">{formatDate(tx.fecha)}</span>
                    </div>

                    {/* Metadata Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs text-slate-700 dark:text-slate-300 pt-1">
                      <div>
                        <span className="text-[10px] text-slate-400 dark:text-slate-500 uppercase block font-bold">Origen / Cajero</span>
                        <span className={`font-semibold truncate block ${tx.cajero_id === 'API' || tx.cajero_nombre?.includes('API') ? 'text-purple-600 dark:text-purple-300 font-bold' : 'text-slate-800 dark:text-slate-200'}`}>
                          {tx.cajero_nombre || 'Taquilla'}
                        </span>
                      </div>

                      <div>
                        <span className="text-[10px] text-slate-400 dark:text-slate-500 uppercase block font-bold">Banco Destino</span>
                        {tx.banco ? (
                          <div className="flex items-center gap-1 mt-0.5">
                            <span className="px-2 py-0.5 rounded bg-sky-500/10 dark:bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-500/30 text-[10px] font-black uppercase inline-flex items-center gap-1">
                              <Landmark className="w-3 h-3 text-sky-600 dark:text-sky-400" />
                              <span>{tx.banco}</span>
                            </span>
                          </div>
                        ) : (
                          <span className="font-semibold text-slate-500 dark:text-slate-400">
                            {tx.categoria === 'Gastos' ? 'Caja Operativa' : 'Banco'}
                          </span>
                        )}
                      </div>

                      <div>
                        <span className="text-[10px] text-slate-400 dark:text-slate-500 uppercase block font-bold">Método</span>
                        <span className="font-semibold text-slate-800 dark:text-slate-200 truncate block">{tx.metodo}</span>
                      </div>

                      <div>
                        <span className="text-[10px] text-slate-400 dark:text-slate-500 uppercase block font-bold">Referencia</span>
                        <span className="font-mono font-bold text-amber-700 dark:text-amber-300 break-all">{tx.referencia}</span>
                      </div>

                      <div>
                        <span className="text-[10px] text-slate-400 dark:text-slate-500 uppercase block font-bold">Pagador / Concepto</span>
                        <span className="text-slate-700 dark:text-slate-300 truncate block">
                          {tx.pagador !== 'N/A' ? tx.pagador : tx.concepto}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Right: Amount & Actions */}
                  <div className="flex items-center justify-between lg:justify-end gap-4 shrink-0 pt-3 lg:pt-0 border-t lg:border-t-0 border-slate-200 dark:border-slate-800">
                    <div className="text-right">
                      <div className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold tracking-wider">Monto</div>
                      <div className="text-xl font-black text-emerald-600 dark:text-emerald-400 font-mono">
                        {formatCurrency(tx.monto, tx.moneda)}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleConfirmSingle(tx)}
                        disabled={isProcessing}
                        className={UI_LOCK.buttonPrimary}
                        title="Aprobar transacción"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Aprobar</span>
                      </button>

                      <button
                        onClick={() => handleOpenRejectModal(tx)}
                        disabled={isProcessing}
                        className="px-3 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-500/30 text-xs font-bold flex items-center gap-1 transition-all cursor-pointer"
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

      {/* API Documentation and Connection Modal */}
      <ApiDocsModal isOpen={showApiModal} onClose={() => setShowApiModal(false)} />
    </div>
  );
};
