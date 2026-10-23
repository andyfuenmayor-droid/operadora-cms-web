import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { formatCurrency, formatDate, normalizarMoneda, cleanReference } from '../../utils/formatters';
import { getConsolidatedExpenses, getConsolidatedPayments, type ConsolidatedPaymentItem } from '../../utils/consolidations';
import type { Agency, Currency, BankAccount } from '../../types';
import { loadCurrencies, type CurrencyConfig } from '../../utils/currencies';
import { UI_LOCK } from '../../styles/uiDesignLock';
import { notificationService } from '../../utils/notificationService';
import { realtimeBroadcast } from '../../utils/realtimeBroadcast';
import {
  CreditCard,
  Plus,
  Trash2,
  RefreshCw,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  Clock,
  DollarSign,
  Building2,
  Landmark,
  Wallet,
  Send,
  RotateCcw,
  Zap,
  Layers,
  Coins,
  TrendingUp,
  AlertCircle,
  Code2,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { ApiDocsModal } from '../Common/ApiDocsModal';
import { logAuditEvent } from '../../utils/auditLogger';

interface PaymentItem {
  id: number;
  tabla: string;
  agencia: string;
  moneda: string;
  tipo_pago: string;
  metodo: string;
  monto: number;
  referencia: string;
  confirmado: boolean;
  rechazado: boolean;
  motivo_rechazo?: string;
  fecha: string;
}

// Safe helper to parse lists of strings from arrays or comma strings
function parseList(val: any): string[] {
  if (!val) return [];
  if (Array.isArray(val)) return val.map((v) => String(v ?? '').trim().toUpperCase()).filter(Boolean);
  if (typeof val === 'string') return val.split(',').map((v) => String(v ?? '').trim().toUpperCase()).filter(Boolean);
  return [String(val ?? '').trim().toUpperCase()].filter(Boolean);
}

export const PaymentsTab: React.FC = () => {
  const { effectiveUserId, systemCycle, user } = useAuth();

  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [payments, setPayments] = useState<PaymentItem[]>([]);
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [currencies, setCurrencies] = useState<CurrencyConfig[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [sales, setSales] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [consolidatedPayments, setConsolidatedPayments] = useState<ConsolidatedPaymentItem[]>([]);

  // Period Filter: default 'ciclo' filters by active operative cycle
  const [filterPeriod, setFilterPeriod] = useState<'ciclo' | 'todos'>('ciclo');

  // Filters
  const [filterAgency, setFilterAgency] = useState('Todas');
  const [filterMethod, setFilterMethod] = useState('Todos');
  const [filterStatus, setFilterStatus] = useState<'Todos' | 'Confirmados' | 'Pendientes' | 'Rechazados'>('Todos');
  const [searchQuery, setSearchQuery] = useState('');

  // Form State matching Streamlit pagos_gastos.py (Opción neutral por defecto)
  const [formAgencia, setFormAgencia] = useState('');
  const [formMoneda, setFormMoneda] = useState('BS');
  const [formMetodo, setFormMetodo] = useState<string>('BANCO');
  const [formTipoOperacion, setFormTipoOperacion] = useState<'Pago' | 'Pago de Premios'>('Pago');
  const [formBancoSel, setFormBancoSel] = useState('');
  const [formMonto, setFormMonto] = useState('');
  const [formReferencia, setFormReferencia] = useState('');
  const [formConfirmDirecta, setFormConfirmDirecta] = useState(false);
  const [formFecha, setFormFecha] = useState(systemCycle?.hasta || new Date().toISOString().split('T')[0]);

  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [showApiModal, setShowApiModal] = useState(false);

  // Sync form date if system cycle updates
  useEffect(() => {
    if (systemCycle?.hasta && !formFecha) {
      setFormFecha(systemCycle.hasta);
    }
  }, [systemCycle?.hasta, formFecha]);

  const loadData = useCallback(async () => {
    if (!effectiveUserId) return;
    setIsLoading(true);
    setMessage(null);

    try {
      const [psRes, pbRes, pdRes, agRes, loadedCurrs, cbRes, salesRes, gConsolidated, pConsolidated] = await Promise.all([
        supabase.from('pagos_semana').select('*').eq('user_id', effectiveUserId).order('id', { ascending: false }),
        supabase.from('cda_pagos_bancarios').select('*').eq('user_id', effectiveUserId).order('id', { ascending: false }),
        supabase.from('cda_pagos_diarios').select('*').eq('user_id', effectiveUserId).order('id', { ascending: false }),
        supabase.from('agencias').select('*').eq('user_id', effectiveUserId).order('id', { ascending: true }),
        loadCurrencies(effectiveUserId),
        supabase.from('cuentas_bancarias').select('*').eq('user_id', effectiveUserId).order('banco', { ascending: true }),
        supabase.from('carga_actual').select('*').eq('user_id', effectiveUserId),
        getConsolidatedExpenses(effectiveUserId, { fechaDesde: systemCycle.desde, fechaHasta: systemCycle.hasta }),
        getConsolidatedPayments(effectiveUserId, { fechaDesde: systemCycle.desde, fechaHasta: systemCycle.hasta }),
      ]);

      const loadedAgencies = agRes.data || [];
      setAgencies(loadedAgencies);
      setCurrencies(loadedCurrs || []);
      setBankAccounts(cbRes.data || []);
      setSales(salesRes.data || []);
      setExpenses(gConsolidated);
      setConsolidatedPayments(pConsolidated);

      // Opción neutral por defecto: solo conservar agencia si el usuario ya la había seleccionado
      setFormAgencia((prev) => {
        if (prev && loadedAgencies.some((a) => String(a?.nombre_agencia || '').trim().toUpperCase() === String(prev || '').trim().toUpperCase())) {
          return prev;
        }
        return '';
      });

      const list: PaymentItem[] = [];

      // Mapeo inteligente para deduplicación estricta por AGENCIA
      const psRefsByAgency = new Map<string, Set<string>>();
      const psUnrefKeys = new Set<string>();

      // 1. Process pagos_semana (manuales en CMS y confirmados sincronizados)
      (psRes.data || []).forEach((r: any) => {
        const agUpper = String(r.agencia || '').trim().toUpperCase();
        const monNorm = normalizarMoneda(r.moneda);
        const mto = Math.round((Number(r.monto) || 0) * 100) / 100;
        const refRaw = String(r.referencia || 'N/A').trim().toUpperCase();
        const fechaRaw = String(r.fecha || r.created_at || '').trim();
        const fCorta = fechaRaw.slice(0, 10);

        if (refRaw && refRaw !== 'N/A') {
          if (!psRefsByAgency.has(agUpper)) {
            psRefsByAgency.set(agUpper, new Set());
          }
          psRefsByAgency.get(agUpper)!.add(refRaw);
        } else if (agUpper && mto > 0) {
          psUnrefKeys.add(`${agUpper}_${mto}_${monNorm}_${fCorta}`);
        }

        list.push({
          id: r.id,
          tabla: 'pagos_semana',
          agencia: agUpper,
          moneda: monNorm,
          tipo_pago: String(r.tipo_pago || 'PAGO').toUpperCase(),
          metodo: String(r.metodo || 'BANCO').toUpperCase(),
          monto: mto,
          referencia: refRaw,
          confirmado: Boolean(r.confirmado),
          rechazado: Boolean(r.rechazado),
          motivo_rechazo: r.motivo_rechazo,
          fecha: fechaRaw,
        });
      });

      // 2. Also include cda_pagos_bancarios SOLO si no fue ya registrado en pagos_semana
      (pbRes.data || []).forEach((r: any) => {
        const agUpper = String(r.agencia || '').trim().toUpperCase();
        const refUpper = String(r.referencia || '').trim().toUpperCase();
        const mto = Math.round((Number(r.monto) || 0) * 100) / 100;
        const monNorm = normalizarMoneda(r.moneda);
        const fechaRaw = String(r.fecha || r.created_at || '').trim();
        const fCorta = fechaRaw.slice(0, 10);

        // Deduplicar contra pagos_semana para esta misma agencia
        let yaEnPs = false;
        const agencyRefs = psRefsByAgency.get(agUpper);
        if (agencyRefs && refUpper && refUpper !== 'N/A') {
          for (const psRef of agencyRefs) {
            if (
              psRef === refUpper ||
              psRef.includes(`REF: ${refUpper}`) ||
              (refUpper.length >= 4 && psRef.includes(refUpper))
            ) {
              yaEnPs = true;
              break;
            }
          }
        } else if (psUnrefKeys.has(`${agUpper}_${mto}_${monNorm}_${fCorta}`)) {
          yaEnPs = true;
        }

        if (yaEnPs) return;

        list.push({
          id: r.id,
          tabla: 'cda_pagos_bancarios',
          agencia: agUpper,
          moneda: monNorm,
          tipo_pago: 'PAGO',
          metodo: String(r.metodo_pago || 'TRANSFERENCIA').toUpperCase(),
          monto: mto,
          referencia: refUpper || 'N/A',
          confirmado: Boolean(r.confirmado),
          rechazado: Boolean(r.rechazado),
          motivo_rechazo: r.motivo_rechazo,
          fecha: fechaRaw,
        });

        // Registrar en referencias vistas para evitar duplicaciones posteriores
        if (refUpper && refUpper !== 'N/A') {
          if (!psRefsByAgency.has(agUpper)) psRefsByAgency.set(agUpper, new Set());
          psRefsByAgency.get(agUpper)!.add(refUpper);
        } else if (agUpper && mto > 0) {
          psUnrefKeys.add(`${agUpper}_${mto}_${monNorm}_${fCorta}`);
        }
      });

      // 3. Also include cda_pagos_diarios (efectivo y cobros diarios de taquilla)
      (pdRes.data || []).forEach((r: any) => {
        const agUpper = String(r.agencia || '').trim().toUpperCase();
        if (!agUpper) return;
        const tipoP = String(r.tipo_pago || 'EFECTIVO').trim().toUpperCase();
        // Skip administrative internal custody transfers
        if (['COBRADOR', 'ENTREGADO A ADMIN', 'ENTREGA_ADMIN'].some((k) => tipoP.includes(k))) {
          return;
        }

        const mto = Math.round((Number(r.monto) || 0) * 100) / 100;
        const monNorm = normalizarMoneda(r.moneda);
        const refUpper = String(r.referencia || r.qr_token || 'N/A').trim().toUpperCase();
        const fechaRaw = String(r.fecha || r.created_at || '').trim();
        const fCorta = fechaRaw.slice(0, 10);

        // Deduplicar inteligentemente contra pagos existentes
        let yaRegistrado = false;
        const agencyRefs = psRefsByAgency.get(agUpper);
        if (agencyRefs && refUpper && refUpper !== 'N/A') {
          for (const psRef of agencyRefs) {
            if (
              psRef === refUpper ||
              psRef.includes(`REF: ${refUpper}`) ||
              (refUpper.length >= 4 && psRef.includes(refUpper))
            ) {
              yaRegistrado = true;
              break;
            }
          }
        } else if (psUnrefKeys.has(`${agUpper}_${mto}_${monNorm}_${fCorta}`)) {
          yaRegistrado = true;
        }

        if (yaRegistrado) return;

        const isRech = Boolean(r.rechazado) || String(r.estado || '').toUpperCase() === 'RECHAZADO';
        const isConf = (Boolean(r.confirmado) || Boolean(r.confirmado_supervisor)) && !isRech;

        list.push({
          id: r.id,
          tabla: 'cda_pagos_diarios',
          agencia: agUpper,
          moneda: monNorm,
          tipo_pago: 'PAGO',
          metodo: tipoP,
          monto: mto,
          referencia: refUpper,
          confirmado: isConf,
          rechazado: isRech,
          motivo_rechazo: r.motivo_rechazo,
          fecha: fechaRaw,
        });

        if (refUpper !== 'N/A') {
          if (!psRefsByAgency.has(agUpper)) psRefsByAgency.set(agUpper, new Set());
          psRefsByAgency.get(agUpper)!.add(refUpper);
        } else if (agUpper && mto > 0) {
          psUnrefKeys.add(`${agUpper}_${mto}_${monNorm}_${fCorta}`);
        }
      });

      setPayments(list);
    } catch (err: any) {
      console.error('Error loading payments:', err);
      setMessage({ type: 'error', text: err?.message || 'Error al cargar pagos.' });
    } finally {
      setIsLoading(false);
    }
  }, [effectiveUserId, systemCycle.desde, systemCycle.hasta]);

  useEffect(() => {
    loadData();

    if (!effectiveUserId) return;

    // Real-time synchronization
    const channel = supabase
      .channel('realtime_payments_tab')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pagos_semana' }, () => loadData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cda_pagos_bancarios' }, () => loadData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cda_pagos_diarios' }, () => loadData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'gastos' }, () => loadData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cda_gastos_diarios' }, () => loadData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'carga_actual' }, () => loadData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agencias' }, () => loadData())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadData, effectiveUserId]);

  // Selected agency object
  const selectedAgencyObj = useMemo(() => {
    if (!formAgencia) return null;
    return agencies.find((a) => String(a?.nombre_agencia || '').trim().toUpperCase() === String(formAgencia || '').trim().toUpperCase()) || null;
  }, [agencies, formAgencia]);

  // Available currencies for selected agency
  const availableAgencyCurrencies = useMemo(() => {
    const activeCodes = currencies.length > 0 ? currencies.map((c) => c.codigo) : ['BS', 'USD', 'COP'];
    if (!selectedAgencyObj) return activeCodes;
    const assigned = parseList(selectedAgencyObj.monedas);
    if (assigned.length === 0 || assigned.includes('TODAS')) {
      return activeCodes;
    }
    return assigned.filter((m) => activeCodes.includes(m));
  }, [selectedAgencyObj, currencies]);

  // Ensure formMoneda matches available currencies
  useEffect(() => {
    if (availableAgencyCurrencies.length > 0 && !availableAgencyCurrencies.includes(formMoneda)) {
      setFormMoneda(availableAgencyCurrencies[0]);
    }
  }, [availableAgencyCurrencies, formMoneda]);

  // Live Balances per Agency for BS, USD, COP (matching PreClosureAuditTab and WeeklyClosureTab exactly)
  const agencyBalances = useMemo(() => {
    if (!selectedAgencyObj) return { BS: 0, USD: 0, COP: 0 };
    const agNom = String(selectedAgencyObj.nombre_agencia || '').trim().toUpperCase();

    const result = { BS: 0, USD: 0, COP: 0 };

    (['BS', 'USD', 'COP'] as const).forEach((m) => {
      const colIni = m === 'BS' ? 'saldo_inicial_bs' : m === 'USD' ? 'saldo_inicial_usd' : 'saldo_inicial_cop';
      const sIni = Number(selectedAgencyObj[colIni] || 0);

      // Ventas / Utilidad operativa neta del ciclo
      const agSales = sales.filter((s) => String(s.agencia || '').trim().toUpperCase() === agNom && normalizarMoneda(s.moneda) === m);
      const vNeto = agSales.reduce((acc, curr) => acc + Number(curr.neto !== undefined && curr.neto !== null ? curr.neto : curr.util_op || 0), 0);

      // Gastos (solo confirmados en el ciclo)
      const agGastos = expenses.filter((g) => String(g.agencia || '').trim().toUpperCase() === agNom && normalizarMoneda(g.moneda) === m && Boolean(g.confirmado));
      const gTot = agGastos.reduce((acc, curr) => acc + Number(curr.monto || 0), 0);

      // Pagos y Cobros confirmados en el ciclo (utilizando la consolidación unificada)
      const agPayments = consolidatedPayments.filter((p) => String(p.agencia || '').trim().toUpperCase() === agNom && normalizarMoneda(p.moneda) === m && Boolean(p.confirmado));
      let pPremios = 0;
      let pCobros = 0;
      agPayments.forEach((p) => {
        const mto = Number(p.monto || 0);
        const tipo = String(p.tipo_pago || '').toUpperCase();
        if (tipo.includes('PREMIO')) pPremios += mto;
        else pCobros += mto;
      });

      // Saldo Final = Arrastre Inicial + Venta Neta - Gastos - Cobros + Premios
      const finalBalance = Math.round((sIni + vNeto - gTot - pCobros + pPremios) * 100) / 100;
      result[m] = finalBalance;
    });

    return result;
  }, [selectedAgencyObj, sales, expenses, consolidatedPayments]);

  // Audit breakdown details for the selected agency (for transparent inspection)
  const agencyAuditDetails = useMemo(() => {
    if (!selectedAgencyObj) return null;
    const agNom = String(selectedAgencyObj.nombre_agencia || '').trim().toUpperCase();
    const details: Record<string, { sIni: number; vNeto: number; gTot: number; pCobros: number; pPremios: number; finalBalance: number }> = {};

    (['BS', 'USD', 'COP'] as const).forEach((m) => {
      const colIni = m === 'BS' ? 'saldo_inicial_bs' : m === 'USD' ? 'saldo_inicial_usd' : 'saldo_inicial_cop';
      const sIni = Number(selectedAgencyObj[colIni] || 0);

      const agSales = sales.filter((s) => String(s.agencia || '').trim().toUpperCase() === agNom && normalizarMoneda(s.moneda) === m);
      const vNeto = agSales.reduce((acc, curr) => acc + Number(curr.neto !== undefined && curr.neto !== null ? curr.neto : curr.util_op || 0), 0);

      const agGastos = expenses.filter((g) => String(g.agencia || '').trim().toUpperCase() === agNom && normalizarMoneda(g.moneda) === m && Boolean(g.confirmado));
      const gTot = agGastos.reduce((acc, curr) => acc + Number(curr.monto || 0), 0);

      const agPayments = consolidatedPayments.filter((p) => String(p.agencia || '').trim().toUpperCase() === agNom && normalizarMoneda(p.moneda) === m && Boolean(p.confirmado));
      let pPremios = 0;
      let pCobros = 0;
      agPayments.forEach((p) => {
        const mto = Number(p.monto || 0);
        const tipo = String(p.tipo_pago || '').toUpperCase();
        if (tipo.includes('PREMIO')) pPremios += mto;
        else pCobros += mto;
      });

      const finalBalance = Math.round((sIni + vNeto - gTot - pCobros + pPremios) * 100) / 100;
      details[m] = { sIni, vNeto, gTot, pCobros, pPremios, finalBalance };
    });

    return details;
  }, [selectedAgencyObj, sales, expenses, consolidatedPayments]);

  // Agency transit payments (payments reported in the active cycle but not yet confirmed)
  const agencyTransit = useMemo(() => {
    if (!selectedAgencyObj) return { BS: 0, USD: 0, COP: 0 };
    const agNom = String(selectedAgencyObj.nombre_agencia || '').trim().toUpperCase();
    const result = { BS: 0, USD: 0, COP: 0 };

    (['BS', 'USD', 'COP'] as const).forEach((m) => {
      result[m] = payments
        .filter((p) => {
          const matchAg = String(p.agencia || '').trim().toUpperCase() === agNom;
          const matchMon = normalizarMoneda(p.moneda) === m;
          const isPending = !p.confirmado && !p.rechazado;
          const fStr = (p.fecha || '').slice(0, 10);
          const inCycle = (!systemCycle.desde || fStr >= systemCycle.desde) && (!systemCycle.hasta || fStr <= systemCycle.hasta);
          return matchAg && matchMon && isPending && inCycle;
        })
        .reduce((acc, curr) => acc + Number(curr.monto || 0), 0);
    });

    return result;
  }, [selectedAgencyObj, payments, systemCycle.desde, systemCycle.hasta]);

  // Bank Accounts / Destination Accounts filtered by Currency
  const bankAccountOptions = useMemo(() => {
    if (formMetodo === 'EFECTIVO') {
      return ['EFECTIVO'];
    }
    if (formMetodo === 'OTRO') {
      return ['OTRO CANAL / AJUSTE'];
    }

    const mapaMonedas: Record<string, string> = {
      'BOLIVARES': 'BS', 'BOLÍVARES': 'BS', 'BS': 'BS',
      'DOLARES': 'USD', 'DÓLARES': 'USD', 'USD': 'USD',
      'PESOS': 'COP', 'COP': 'COP'
    };

    const opts: string[] = [];
    bankAccounts.forEach((cb) => {
      const mRaw = String(cb.moneda || '').trim().toUpperCase();
      const mNorm = mapaMonedas[mRaw] || mRaw;
      if (mNorm === formMoneda) {
        const bNom = String(cb.banco || 'BANCO').trim().toUpperCase();
        const titNom = String(cb.titular || '').trim().toUpperCase();
        const numC = String(cb.numero_cuenta || '').trim();
        const last4 = numC.length >= 4 ? ` [${numC.slice(-4)}]` : (numC ? ` [${numC}]` : '');
        const lbl = `${bNom}${titNom ? ` - ${titNom}` : ''}${last4}`;
        if (!opts.includes(lbl)) {
          opts.push(lbl);
        }
      }
    });

    if (opts.length === 0) {
      const sugeridos = ['BANESCO', 'MERCANTIL', 'BANCO DE VENEZUELA', 'PROVINCIAL', 'BNC', 'ZELLE', 'PAGO MOVIL', 'POS', 'BINANCE'];
      return sugeridos;
    }
    return opts;
  }, [formMetodo, formMoneda, bankAccounts]);

  // Ensure formBancoSel default
  useEffect(() => {
    if (bankAccountOptions.length > 0 && (!formBancoSel || !bankAccountOptions.includes(formBancoSel))) {
      setFormBancoSel(bankAccountOptions[0]);
    }
  }, [bankAccountOptions, formBancoSel]);

  const activeCurrenciesList = useMemo(() => {
    if (currencies && currencies.length > 0) {
      return currencies.map((c) => (c.codigo || '').trim().toUpperCase()).filter(Boolean);
    }
    return ['BS', 'USD', 'COP'];
  }, [currencies]);

  // Currency Totals: Dinero Entrante Confirmado vs En Tránsito (scoped to active period)
  const currencyTotals = useMemo(() => {
    const totals: Record<string, { confirmado: number; transito: number; total: number }> = {};
    activeCurrenciesList.forEach((c) => {
      totals[c] = { confirmado: 0, transito: 0, total: 0 };
    });

    payments.forEach((p) => {
      if (filterPeriod === 'ciclo') {
        const fStr = (p.fecha || '').slice(0, 10);
        const enRango = (!systemCycle.desde || fStr >= systemCycle.desde) && (!systemCycle.hasta || fStr <= systemCycle.hasta);
        if (!enRango) return;
      }

      const m = normalizarMoneda(p.moneda);
      if (!totals[m]) {
        totals[m] = { confirmado: 0, transito: 0, total: 0 };
      }

      if (p.confirmado) {
        totals[m].confirmado += p.monto;
      } else if (!p.rechazado) {
        totals[m].transito += p.monto;
      }
      totals[m].total = totals[m].confirmado + totals[m].transito;
    });

    return totals;
  }, [payments, filterPeriod, systemCycle.desde, systemCycle.hasta, activeCurrenciesList]);

  // Method metrics summary (scoped to period, with confirmed vs transit breakdown)
  const methodMetrics = useMemo(() => {
    const map: Record<string, { confirmado: number; transito: number; moneda: string; metodo: string }> = {};

    payments.forEach((p) => {
      if (filterPeriod === 'ciclo') {
        const fStr = (p.fecha || '').slice(0, 10);
        const enRango = (!systemCycle.desde || fStr >= systemCycle.desde) && (!systemCycle.hasta || fStr <= systemCycle.hasta);
        if (!enRango) return;
      }

      const key = `${p.metodo} (${p.moneda})`;
      if (!map[key]) {
        map[key] = { confirmado: 0, transito: 0, moneda: p.moneda, metodo: p.metodo };
      }

      if (p.confirmado) {
        map[key].confirmado += p.monto;
      } else if (!p.rechazado) {
        map[key].transito += p.monto;
      }
    });

    return Object.entries(map).map(([k, val]) => ({
      key: k,
      metodo: val.metodo,
      moneda: val.moneda,
      confirmado: val.confirmado,
      transito: val.transito,
      total: val.confirmado + val.transito,
    }));
  }, [payments, filterPeriod, systemCycle.desde, systemCycle.hasta]);

  // Filtered payments
  const filteredPayments = useMemo(() => {
    return payments.filter((p) => {
      // 1. Period filter
      if (filterPeriod === 'ciclo') {
        const fStr = (p.fecha || '').slice(0, 10);
        const enRango = (!systemCycle.desde || fStr >= systemCycle.desde) && (!systemCycle.hasta || fStr <= systemCycle.hasta);
        if (!enRango) return false;
      }

      // 2. Agency filter
      if (filterAgency !== 'Todas' && p.agencia !== filterAgency) return false;

      // 3. Method filter
      if (filterMethod !== 'Todos' && p.metodo !== filterMethod) return false;

      // 4. Status filter
      if (filterStatus === 'Confirmados' && !p.confirmado) return false;
      if (filterStatus === 'Pendientes' && (p.confirmado || p.rechazado)) return false;
      if (filterStatus === 'Rechazados' && !p.rechazado) return false;

      // 5. Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const match =
          p.agencia.toLowerCase().includes(q) ||
          p.referencia.toLowerCase().includes(q) ||
          p.metodo.toLowerCase().includes(q) ||
          p.tipo_pago.toLowerCase().includes(q);
        if (!match) return false;
      }

      return true;
    });
  }, [payments, filterPeriod, systemCycle.desde, systemCycle.hasta, filterAgency, filterMethod, filterStatus, searchQuery]);

  // Submit New Payment
  const handleSavePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!effectiveUserId) return;

    if (!formAgencia) {
      setMessage({ type: 'error', text: 'Por favor, seleccione una agencia para registrar el pago.' });
      return;
    }

    const montoNum = parseFloat(String(formMonto).replace(',', '.')) || 0;
    if (montoNum <= 0) {
      setMessage({ type: 'error', text: 'Ingrese un monto mayor a 0.' });
      return;
    }

    setIsProcessing(true);

    try {
      let metodoDb = formMetodo;
      let refCompleta = formReferencia.trim().toUpperCase() || formMetodo;

      if (formMetodo === 'EFECTIVO') {
        metodoDb = 'EFECTIVO';
        refCompleta = 'EFECTIVO';
      } else if (formMetodo === 'OTRO') {
        metodoDb = 'OTRO';
        const refTxt = formReferencia.trim() ? ` - Ref: ${formReferencia.trim().toUpperCase()}` : '';
        refCompleta = `OTRO CANAL${refTxt}`;
      } else {
        const refTxt = formReferencia.trim() ? ` - Ref: ${formReferencia.trim().toUpperCase()}` : '';
        refCompleta = formBancoSel ? `${formBancoSel}${refTxt}` : (formReferencia.trim().toUpperCase() || formMetodo);
      }

      const tipoDb = formTipoOperacion === 'Pago de Premios' ? 'Pago de Premios' : 'Pago';
      const adminNom = user?.nombre || user?.email?.split('@')[0] || 'ADMIN';

      const payload = {
        user_id: effectiveUserId,
        agencia: formAgencia,
        moneda: formMoneda,
        tipo_pago: tipoDb,
        metodo: metodoDb,
        monto: montoNum,
        referencia: refCompleta.toUpperCase().trim(),
        confirmado: Boolean(formConfirmDirecta),
        confirmado_por: formConfirmDirecta ? adminNom : null,
        rechazado: false,
        fecha: formFecha ? `${formFecha} ${new Date().toTimeString().split(' ')[0]}` : new Date().toISOString(),
      };

      const { data: insertedData, error } = await supabase
        .from('pagos_semana')
        .insert(payload)
        .select()
        .single();
      if (error) throw error;

      if (formConfirmDirecta) {
        confetti({ particleCount: 50, spread: 60 });
        notificationService.playSound('confirmed');
        setMessage({
          type: 'success',
          text: `✅ ${tipoDb} de ${formMoneda} ${montoNum.toLocaleString('es-VE', { minimumFractionDigits: 2 })} registrado como DINERO ENTRANTE CONFIRMADO.`,
        });
      } else {
        const isPremio = tipoDb === 'Pago de Premios';
        const eventType = isPremio ? 'NEW_PRIZE_PAYMENT' : 'NEW_AGENCY_PAYMENT';
        const notifTitle = isPremio ? '🏆 Nuevo Pago de Premios de Agencia' : `🔔 Nuevo Pago de Agencia (${metodoDb})`;
        const notifBody = `Agencia ${formAgencia}: ${formatCurrency(montoNum, formMoneda as any)} (Ref: ${refCompleta.toUpperCase().trim()})`;

        // 1. Broadcast instantáneo por WebSocket a Confirmaciones
        try {
          await realtimeBroadcast.broadcast(eventType, {
            id: insertedData?.id,
            tabla: 'pagos_semana',
            agencia: formAgencia,
            monto: montoNum,
            moneda: formMoneda,
            referencia: refCompleta.toUpperCase().trim(),
            metodo_pago: metodoDb,
            tipo_pago: tipoDb,
            concepto: isPremio ? 'Pago de Premios' : 'Pago de Agencia',
            confirmado: false,
            created_at: payload.fecha,
          });
        } catch (bErr) {
          console.warn('[PaymentsTab] Error broadcasting payment:', bErr);
        }

        // 2. Alerta sonora local y notificación in-app inmediata
        notificationService.showNotification(notifTitle, {
          body: notifBody,
          soundType: 'new_payment',
          toastType: metodoDb === 'EFECTIVO' ? 'cash' : 'payment',
          tag: `pago_semana_${insertedData?.id || Date.now()}`,
        });

        setMessage({
          type: 'info',
          text: `⏳ ${tipoDb} de ${formMoneda} ${montoNum.toLocaleString('es-VE', { minimumFractionDigits: 2 })} registrado EN TRÁNSITO (enviado a Pizarra de Confirmaciones).`,
        });
      }

      setFormMonto('');
      setFormReferencia('');
      await loadData();
    } catch (err: any) {
      console.error('Error inserting payment:', err);
      setMessage({ type: 'error', text: err?.message || 'Error al registrar el pago.' });
    } finally {
      setIsProcessing(false);
    }
  };

  // Clear Screen Handler
  const handleClearScreen = () => {
    setFormAgencia('');
    setFormMonto('');
    setFormReferencia('');
    setFormConfirmDirecta(false);
    setMessage({ type: 'success', text: 'Pantalla de pago restablecida a opción inicial neutra.' });
  };

  // Delete Payment with Bidirectional Cascading and Realtime Broadcast
  const handleDeletePayment = async (item: PaymentItem) => {
    if (!window.confirm(`¿Eliminar este pago de ${item.moneda} ${formatCurrency(item.monto, item.moneda as any)} de la agencia ${item.agencia}?`)) return;
    setIsProcessing(true);

    try {
      // 1. Si el pago proviene de pagos_semana
      if (item.tabla === 'pagos_semana') {
        const { error: psErr } = await supabase
          .from('pagos_semana')
          .delete()
          .eq('id', item.id)
          .eq('user_id', effectiveUserId);
        if (psErr) throw psErr;

        // Extraer número de referencia si tiene formato "REF: 123456 - PAGADOR [✅ CONFIRMADO BANCO]"
        const refMatch = item.referencia.match(/REF:\s*([A-Za-z0-9_-]+)/i);
        const refLimpia = refMatch ? refMatch[1].trim() : (item.referencia !== 'N/A' && !item.referencia.includes(' ') ? item.referencia.trim() : '');

        // Buscar y eliminar contraparte en cda_pagos_bancarios
        try {
          const { data: pbCandidates } = await supabase
            .from('cda_pagos_bancarios')
            .select('id, referencia, monto, agencia')
            .eq('user_id', effectiveUserId)
            .ilike('agencia', item.agencia);

          if (pbCandidates && pbCandidates.length > 0) {
            const matches = pbCandidates.filter((pb: any) => {
              const pbMonto = Number(pb.monto || 0);
              const mtoDiff = Math.abs(pbMonto - item.monto);
              if (mtoDiff > 0.05) return false;
              if (refLimpia && pb.referencia && String(pb.referencia).toUpperCase().includes(refLimpia.toUpperCase())) return true;
              if (pb.referencia && item.referencia.toUpperCase().includes(String(pb.referencia).toUpperCase())) return true;
              return true;
            });

            for (const match of matches) {
              await supabase.from('cda_pagos_bancarios').delete().eq('id', match.id);
              try {
                await realtimeBroadcast.broadcast('PAYMENT_REJECTED', {
                  id: match.id,
                  tabla: 'cda_pagos_bancarios',
                  agencia: item.agencia,
                  monto: item.monto,
                  moneda: item.moneda,
                  referencia: match.referencia,
                });
              } catch (bErr) {
                console.warn('Broadcast error on payment delete:', bErr);
              }
            }
          }
        } catch (pbErr) {
          console.warn('Error cascading delete to cda_pagos_bancarios:', pbErr);
        }

        // Buscar y eliminar contraparte en cda_pagos_diarios
        try {
          const { data: pdCandidates } = await supabase
            .from('cda_pagos_diarios')
            .select('id, referencia, monto, agencia')
            .eq('user_id', effectiveUserId)
            .ilike('agencia', item.agencia);

          if (pdCandidates && pdCandidates.length > 0) {
            const matches = pdCandidates.filter((pd: any) => {
              const pdMonto = Number(pd.monto || 0);
              return Math.abs(pdMonto - item.monto) < 0.05;
            });
            for (const match of matches) {
              await supabase.from('cda_pagos_diarios').delete().eq('id', match.id);
            }
          }
        } catch (pdErr) {
          console.warn('Error cascading delete to cda_pagos_diarios:', pdErr);
        }
      }
      // 2. Si el pago proviene de cda_pagos_bancarios
      else if (item.tabla === 'cda_pagos_bancarios') {
        const { error: pbErr } = await supabase
          .from('cda_pagos_bancarios')
          .delete()
          .eq('id', item.id)
          .eq('user_id', effectiveUserId);
        if (pbErr) throw pbErr;

        // Buscar y eliminar contraparte en pagos_semana
        try {
          const { data: psCandidates } = await supabase
            .from('pagos_semana')
            .select('id, referencia, monto, agencia')
            .eq('user_id', effectiveUserId)
            .ilike('agencia', item.agencia);

          if (psCandidates && psCandidates.length > 0) {
            const matches = psCandidates.filter((ps: any) => {
              const psMonto = Number(ps.monto || 0);
              if (Math.abs(psMonto - item.monto) > 0.05) return false;
              const psRef = String(ps.referencia || '').toUpperCase();
              if (item.referencia !== 'N/A' && psRef.includes(item.referencia.toUpperCase())) return true;
              return true;
            });
            for (const match of matches) {
              await supabase.from('pagos_semana').delete().eq('id', match.id);
            }
          }
        } catch (psErr) {
          console.warn('Error cascading delete to pagos_semana:', psErr);
        }

        try {
          await realtimeBroadcast.broadcast('PAYMENT_REJECTED', {
            id: item.id,
            tabla: 'cda_pagos_bancarios',
            agencia: item.agencia,
            monto: item.monto,
            moneda: item.moneda,
            referencia: item.referencia,
          });
        } catch (bErr) {
          console.warn('Broadcast error on payment delete:', bErr);
        }
      }
      // 3. Si el pago proviene de cda_pagos_diarios
      else if (item.tabla === 'cda_pagos_diarios') {
        const { error: pdErr } = await supabase
          .from('cda_pagos_diarios')
          .delete()
          .eq('id', item.id)
          .eq('user_id', effectiveUserId);
        if (pdErr) throw pdErr;

        // Buscar y eliminar contraparte en pagos_semana
        try {
          const { data: psCandidates } = await supabase
            .from('pagos_semana')
            .select('id, referencia, monto, agencia')
            .eq('user_id', effectiveUserId)
            .ilike('agencia', item.agencia);

          if (psCandidates && psCandidates.length > 0) {
            const matches = psCandidates.filter((ps: any) => {
              const psMonto = Number(ps.monto || 0);
              return Math.abs(psMonto - item.monto) < 0.05;
            });
            for (const match of matches) {
              await supabase.from('pagos_semana').delete().eq('id', match.id);
            }
          }
        } catch (psErr) {
          console.warn('Error cascading delete to pagos_semana:', psErr);
        }
      }

      // Notificar cambio de datos general a toda la plataforma
      try {
        await realtimeBroadcast.broadcast('DATA_CHANGED', {
          modulo: 'PAGOS',
          accion: 'DELETE',
          agencia: item.agencia,
          monto: item.monto,
          moneda: item.moneda,
        });
      } catch (e) {
        console.warn('DATA_CHANGED broadcast warning:', e);
      }

      // Registrar evento inmutable de auditoría con la semana ciclo activa
      try {
        const cleanRef = cleanReference(item.referencia) || item.referencia || 'N/A';
        await logAuditEvent({
          user_id: effectiveUserId,
          usuario: user?.email || user?.nombre || 'ADMIN',
          modulo: 'PAGOS',
          tipo_accion: 'ELIMINAR_PAGO_AGENCIA',
          entidad_afectada: item.agencia,
          monto: Number(item.monto),
          moneda: item.moneda,
          descripcion: `Eliminación bidireccional de Pago [${item.metodo}] por ${formatCurrency(item.monto, item.moneda as any)} (Ref: ${cleanRef}, Tipo: ${item.tipo_pago}, Origen: ${item.tabla}) de la agencia ${item.agencia}.`,
          impacto_financiero: 'ALTO',
          semana_ciclo: String(systemCycle?.semana || ''),
          ciclo_periodo: systemCycle?.desde && systemCycle?.hasta ? `${systemCycle.desde} al ${systemCycle.hasta}` : undefined,
          valor_anterior: {
            id: item.id,
            tabla: item.tabla,
            agencia: item.agencia,
            moneda: item.moneda,
            monto: item.monto,
            tipo_pago: item.tipo_pago,
            metodo: item.metodo,
            referencia: item.referencia,
            confirmado: item.confirmado,
            rechazado: item.rechazado,
            fecha: item.fecha,
          },
          valor_nuevo: { eliminado: true, sincronizado_taquilla: true, fecha_eliminacion: new Date().toISOString() },
        });
      } catch (auditErr) {
        console.warn('Could not register audit event for deleted payment:', auditErr);
      }

      setMessage({ type: 'success', text: 'Pago eliminado y sincronizado en tiempo real con Taquilla y Confirmados correctamente.' });
      await loadData();
    } catch (err: any) {
      console.error('Error deleting payment:', err);
      setMessage({ type: 'error', text: err?.message || 'Error al eliminar el pago.' });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              <CreditCard className="w-5 h-5" />
            </span>
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
              Gestión de Cobranzas y Pagos
            </h2>
            <span className="text-[11px] px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/50 font-mono font-bold">
              {systemCycle.tipo === 'SEMANAL' ? `Semana ${systemCycle.semana}` : `Operación Diaria ${systemCycle.semana}`} ({systemCycle.desde} al {systemCycle.hasta})
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Registro de cobros recibidos y abonos de premios para el balance de agencias del ciclo operativo.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Connect Apps / API Button */}
          <button
            onClick={() => setShowApiModal(true)}
            className={UI_LOCK.buttonSecondary + ' text-xs font-semibold flex items-center gap-1.5'}
            title="Credenciales y webhook de API para conectar aplicaciones externas"
          >
            <Code2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>Conectar Apps / API</span>
          </button>

          <button
            onClick={() => loadData()}
            disabled={isLoading}
            className={UI_LOCK.buttonSecondary + ' text-xs font-semibold flex items-center gap-1.5'}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            Actualizar
          </button>
        </div>
      </div>

      {message && (
        <div
          className={`p-4 rounded-2xl border flex items-center gap-3 text-sm animate-fade-in ${
            message.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-500/20 text-emerald-800 dark:text-emerald-400'
              : message.type === 'info'
              ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-500/20 text-amber-800 dark:text-amber-300'
              : 'bg-rose-50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-500/20 text-rose-800 dark:text-rose-400'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 shrink-0" />
          ) : message.type === 'info' ? (
            <Clock className="w-5 h-5 shrink-0" />
          ) : (
            <XCircle className="w-5 h-5 shrink-0" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      {/* KPI Overview by Currency: Dinero Entrante Confirmado vs En Tránsito */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <Coins className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            Ingresos Totales por Moneda {filterPeriod === 'ciclo' ? `• Semana ${systemCycle.semana}` : '• Histórico'}
          </h3>
          <span className="text-[11px] font-mono text-slate-400 dark:text-slate-500">
            Identificación de Dinero Entrante vs Fondos en Tránsito
          </span>
        </div>

        <div className={UI_LOCK.kpiGrid(activeCurrenciesList.length)}>
          {activeCurrenciesList.map((curr) => {
            const data = currencyTotals[curr] || { confirmado: 0, transito: 0, total: 0 };
            return (
              <div key={curr} className={UI_LOCK.card + ' p-4 shadow-sm flex flex-col justify-between'}>
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Cobros Recibidos ({curr})
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-[10px] font-bold border border-emerald-200 dark:border-emerald-500/20 font-mono">
                      {curr}
                    </span>
                  </div>
                  <div className="mt-2">
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> Dinero Entrante (Confirmado):
                    </div>
                    <div className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white font-mono mt-0.5">
                      {formatCurrency(data.confirmado, curr as any)}
                    </div>
                  </div>
                </div>
                <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
                    <Clock className="w-3 h-3 text-amber-500" /> En Tránsito:
                  </span>
                  {data.transito > 0 ? (
                    <span className="px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-500/15 text-amber-800 dark:text-amber-400 text-[10px] font-bold border border-amber-300 dark:border-amber-500/30 font-mono animate-pulse">
                      ⏳ {formatCurrency(data.transito, curr as any)}
                    </span>
                  ) : (
                    <span className="text-[10px] font-mono text-slate-400 font-semibold">
                      {formatCurrency(0, curr as any)}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Income Summary by Method Cards */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Resumen de Ingresos por Método de Pago {filterPeriod === 'ciclo' ? `• Semana ${systemCycle.semana}` : '• Histórico'}
          </h3>
          <span className="text-[11px] text-slate-400 dark:text-slate-500 font-mono">
            {methodMetrics.length} canal(es) activo(s)
          </span>
        </div>

        {methodMetrics.length === 0 ? (
          <div className={UI_LOCK.card + ' p-6 text-center text-xs text-slate-500 dark:text-slate-400'}>
            No hay pagos registrados para este ciclo.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {methodMetrics.map((m) => (
              <div
                key={m.key}
                className={UI_LOCK.card + ' p-3.5 text-center shadow-sm flex flex-col justify-between'}
              >
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 truncate" title={m.key}>
                    {m.key}
                  </div>
                  <div className="text-sm font-black text-slate-900 dark:text-white font-mono mt-1" title="Dinero Entrante (Confirmado)">
                    {m.confirmado.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                  </div>
                </div>
                <div className="mt-2 pt-1.5 border-t border-slate-100 dark:border-slate-800/80">
                  {m.transito > 0 ? (
                    <span className="text-[10px] font-bold font-mono text-amber-500 truncate block" title={`En tránsito: ${m.transito.toLocaleString('es-VE', { minimumFractionDigits: 2 })}`}>
                      ⏳ {m.transito.toLocaleString('es-VE', { minimumFractionDigits: 0 })} en tránsito
                    </span>
                  ) : (
                    <span className="text-[9px] font-semibold text-emerald-600 dark:text-emerald-400/80 block">
                      ✅ Confirmado
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Redesigned Payment Entry Form matching Streamlit pagos_gastos.py */}
      <div id="tour-pagos-form" className={UI_LOCK.card + ' p-5 sm:p-6 shadow-md space-y-5'}>
        {/* Header & Agency Picker with Neutral Initial Option */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
              <span className="text-xl">📝</span>
              Nuevo Registro de Pago
            </h3>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300 shrink-0">🎯 Seleccionar Agencia:</span>
            <select
              value={formAgencia}
              onChange={(e) => setFormAgencia(e.target.value)}
              className={UI_LOCK.select + ' min-w-[240px]'}
            >
              <option value="">-- Seleccione una Agencia --</option>
              {agencies.map((a) => (
                <option key={a.id} value={a.nombre_agencia}>
                  {a.id} - {a.nombre_agencia}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Live Agency Balances Banner */}
        {selectedAgencyObj ? (
          <div className="space-y-2 animate-fade-in">
            <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <span>📄</span> Estado Actual: <span className="text-slate-900 dark:text-white font-black">{formAgencia}</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {availableAgencyCurrencies.map((m) => {
                const bal = agencyBalances[m as 'BS' | 'USD' | 'COP'] || 0;
                const det = agencyAuditDetails ? agencyAuditDetails[m as 'BS' | 'USD' | 'COP'] : null;
                const transit = agencyTransit[m as 'BS' | 'USD' | 'COP'] || 0;
                const isFavor = bal < -0.05;
                const isDeuda = bal > 0.05;

                return (
                  <div key={m} className="bg-slate-50 dark:bg-[#071217] border border-slate-200 dark:border-slate-800 p-3.5 rounded-2xl flex flex-col justify-between shadow-sm">
                    <div>
                      <div className="flex justify-between items-center gap-1">
                        <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase">Saldo {m}</span>
                        {isFavor ? (
                          <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-cyan-50 dark:bg-cyan-500/20 text-cyan-700 dark:text-cyan-400 border border-cyan-200 dark:border-cyan-500/30">
                            🔵 A Favor Agencia
                          </span>
                        ) : isDeuda ? (
                          <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-rose-50 dark:bg-rose-500/20 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-500/30">
                            🔴 Debe a Operadora
                          </span>
                        ) : (
                          <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30">
                            🟢 Al Día
                          </span>
                        )}
                      </div>

                      <div
                        className={`text-xl sm:text-2xl font-black font-mono mt-1 ${
                          isFavor ? 'text-cyan-600 dark:text-cyan-400' : isDeuda ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'
                        }`}
                      >
                        {bal.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {m === 'BS' ? 'Bs.' : m}
                      </div>

                      {det && (
                        <div className="mt-2.5 pt-2 border-t border-slate-200 dark:border-slate-800/80 text-[10px] text-slate-500 dark:text-slate-400 space-y-0.5 font-mono">
                          <div className="flex justify-between">
                            <span>Arrastre Inicial:</span>
                            <span className="text-slate-700 dark:text-slate-300 font-semibold">{formatCurrency(det.sIni, m as any)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Venta Neta (+):</span>
                            <span className="text-emerald-600 dark:text-emerald-400 font-semibold">+{formatCurrency(det.vNeto, m as any)}</span>
                          </div>
                          {det.gTot > 0 && (
                            <div className="flex justify-between">
                              <span>Gastos (-):</span>
                              <span className="text-rose-600 dark:text-rose-400 font-semibold">-{formatCurrency(det.gTot, m as any)}</span>
                            </div>
                          )}
                          <div className="flex justify-between">
                            <span>Cobros Ciclo (-):</span>
                            <span className="text-cyan-600 dark:text-cyan-400 font-semibold">-{formatCurrency(det.pCobros, m as any)}</span>
                          </div>
                          {det.pPremios > 0 && (
                            <div className="flex justify-between">
                              <span>Premios Repuestos (+):</span>
                              <span className="text-amber-600 dark:text-amber-400 font-semibold">+{formatCurrency(det.pPremios, m as any)}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {transit > 0 && (
                      <div className="mt-2.5 pt-1.5 border-t border-slate-200 dark:border-slate-800/80">
                        <span className="text-[10px] font-bold font-mono text-amber-500 block">
                          ⏳ {transit.toLocaleString('es-VE', { minimumFractionDigits: 2 })} en tránsito
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <span>📄</span> Estado Actual: <span className="text-amber-600 dark:text-amber-400 font-bold">Ninguna agencia seleccionada</span>
            </h4>

            <div className="bg-slate-50 dark:bg-[#071217] border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl p-5 text-center">
              <Building2 className="w-6 h-6 text-slate-400 dark:text-slate-500 mx-auto mb-1.5 opacity-60" />
              <p className="text-xs font-bold text-slate-900 dark:text-white">Opción neutral por defecto</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 max-w-md mx-auto">
                Seleccione una agencia en el selector para consultar sus saldos en vivo ({activeCurrenciesList.join(', ')}) y registrar el pago.
              </p>
            </div>
          </div>
        )}

        <form onSubmit={handleSavePayment} className="space-y-4 pt-2 border-t border-slate-200 dark:border-slate-800">
          {/* Row of Currency, Payment Channel and Operation Type */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <span>🟡</span> Moneda
              </label>
              <select
                value={formMoneda}
                onChange={(e) => setFormMoneda(e.target.value)}
                required
                className={UI_LOCK.select}
              >
                {availableAgencyCurrencies.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <span>💳</span> Forma de Pago / Canal
              </label>
              <select
                value={formMetodo}
                onChange={(e) => setFormMetodo(e.target.value as any)}
                required
                className={UI_LOCK.select}
              >
                <option value="BANCO">BANCO</option>
                <option value="TRANSFERENCIA BANCARIA">TRANSFERENCIA BANCARIA</option>
                <option value="PAGO MÓVIL">PAGO MÓVIL</option>
                <option value="EFECTIVO">EFECTIVO</option>
                <option value="OTRO">OTRO</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <span>📑</span> Tipo de Operación
              </label>
              <select
                value={formTipoOperacion}
                onChange={(e) => setFormTipoOperacion(e.target.value as any)}
                required
                className={UI_LOCK.select}
              >
                <option value="Pago">Pago</option>
                <option value="Pago de Premios">Pago de Premios</option>
              </select>
            </div>
          </div>

          {/* Conditional Bank / Account Selector */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <span>🏛️</span> {formTipoOperacion === 'Pago de Premios' ? 'Cuenta a Debitar' : 'Banco / Cuenta Destino'}
            </label>
            <select
              value={formBancoSel}
              onChange={(e) => setFormBancoSel(e.target.value)}
              disabled={formMetodo === 'EFECTIVO' || formMetodo === 'OTRO'}
              className={UI_LOCK.select + ' disabled:opacity-50'}
            >
              {bankAccountOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>

          {/* Amount, Reference and Date */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Monto *</label>
              <input
                type="number"
                step="0.01"
                min="0"
                required
                placeholder="0,00"
                value={formMonto}
                onChange={(e) => setFormMonto(e.target.value)}
                className={UI_LOCK.input + ' font-mono'}
              />
            </div>

            {formMetodo !== 'EFECTIVO' ? (
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">N° Referencia / Comprobante</label>
                <input
                  type="text"
                  placeholder="Ej: 123456"
                  value={formReferencia}
                  onChange={(e) => setFormReferencia(e.target.value)}
                  className={UI_LOCK.input + ' font-mono'}
                />
              </div>
            ) : (
              <div className="space-y-1 opacity-50">
                <label className="text-xs font-bold text-slate-400">N° Referencia / Comprobante</label>
                <input
                  type="text"
                  disabled
                  value="EFECTIVO"
                  className={UI_LOCK.input + ' font-mono cursor-not-allowed opacity-60'}
                />
              </div>
            )}

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Fecha del Pago</label>
              <input
                type="date"
                value={formFecha}
                onChange={(e) => setFormFecha(e.target.value)}
                className={UI_LOCK.input + ' font-mono'}
              />
            </div>
          </div>

          {/* Direct Confirmation Checkbox */}
          <div className="flex items-center gap-2.5 pt-1">
            <input
              type="checkbox"
              id="conf_directa"
              checked={formConfirmDirecta}
              onChange={(e) => setFormConfirmDirecta(e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 dark:border-slate-700 text-emerald-600 focus:ring-emerald-500 bg-white dark:bg-[#071217] cursor-pointer"
            />
            <label htmlFor="conf_directa" className="text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer flex items-center gap-1">
              <span>⚡</span> Confirmar de inmediato (omitir Pizarra de Confirmaciones)
            </label>
          </div>

          {/* Primary Action Button */}
          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              disabled={isProcessing}
              className={UI_LOCK.buttonPrimary + ' text-xs flex items-center justify-center gap-2'}
            >
              <span>🚀</span>
              {isProcessing ? 'Procesando...' : 'REGISTRAR PAGO'}
            </button>
          </div>
        </form>

        {/* Clear Screen Auxiliary Button */}
        <div className="pt-2 flex justify-start">
          <button
            type="button"
            onClick={handleClearScreen}
            className={UI_LOCK.buttonSecondary + ' text-xs font-bold flex items-center gap-1.5'}
          >
            🧹 RESTABLECER / LIMPIAR PANTALLA
          </button>
        </div>
      </div>

      {/* Payments Table */}
      <div id="tour-pagos-table" className={UI_LOCK.card + ' overflow-hidden shadow-sm'}>
        <div className="p-4 sm:p-6 border-b border-slate-200 dark:border-slate-800 flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                Pagos y Cobros Registrados ({filteredPayments.length})
              </h4>
              <span className="text-xs text-slate-400 dark:text-slate-500 font-mono">
                {filterPeriod === 'ciclo' ? `(Semana ${systemCycle.semana})` : `(Histórico)`}
              </span>
            </div>

            {/* Period Selector: Ciclo Actual vs Histórico */}
            <div className="inline-flex rounded-xl bg-slate-100 dark:bg-[#071217] p-1 border border-slate-200 dark:border-slate-800 text-xs font-semibold self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setFilterPeriod('ciclo')}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  filterPeriod === 'ciclo'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                🎯 Ciclo Actual (Semana {systemCycle.semana})
              </button>
              <button
                type="button"
                onClick={() => setFilterPeriod('todos')}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  filterPeriod === 'todos'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                📜 Histórico Completo ({payments.length})
              </button>
            </div>
          </div>

          {/* Search, Agency Filter, Method Filter, Status Filter */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
              <input
                type="text"
                placeholder="Buscar agencia, ref, método..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={UI_LOCK.input + ' pl-8 text-xs'}
              />
            </div>

            <div>
              <select
                value={filterAgency}
                onChange={(e) => setFilterAgency(e.target.value)}
                className={UI_LOCK.select}
              >
                <option value="Todas">Todas las Agencias</option>
                {agencies.map((a) => (
                  <option key={a.id} value={a.nombre_agencia}>
                    {a.nombre_agencia}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <select
                value={filterMethod}
                onChange={(e) => setFilterMethod(e.target.value)}
                className={UI_LOCK.select}
              >
                <option value="Todos">Todos los Métodos</option>
                <option value="BANCO">BANCO</option>
                <option value="PAGO MOVIL">PAGO MÓVIL</option>
                <option value="TRANSFERENCIA">TRANSFERENCIA</option>
                <option value="EFECTIVO">EFECTIVO</option>
                <option value="PUNTO DE VENTA">PUNTO DE VENTA</option>
                <option value="OTRO">OTRO</option>
              </select>
            </div>

            <div>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as any)}
                className={UI_LOCK.select}
              >
                <option value="Todos">Todos los Estados</option>
                <option value="Confirmados">✅ Dinero Entrante (Confirmado)</option>
                <option value="Pendientes">⏳ Dinero en Tránsito (Pendiente)</option>
                <option value="Rechazados">❌ Rechazados</option>
              </select>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className={UI_LOCK.tableThead}>
              <tr>
                <th className="py-3.5 px-4">Agencia</th>
                <th className="py-3.5 px-4">Método</th>
                <th className="py-3.5 px-4">Tipo</th>
                <th className="py-3.5 px-4">Referencia</th>
                <th className="py-3.5 px-4 text-right">Monto</th>
                <th className="py-3.5 px-4 text-center">Estado / Flujo</th>
                <th className="py-3.5 px-4">Fecha</th>
                <th className="py-3.5 px-4 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 font-mono">
              {filteredPayments.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-500 font-sans">
                    No se encontraron pagos con los filtros seleccionados.
                  </td>
                </tr>
              ) : (
                filteredPayments.map((p) => (
                  <tr key={`${p.tabla}_${p.id}`} className={UI_LOCK.tableTr}>
                    <td className="py-3.5 px-4 font-sans font-bold text-slate-900 dark:text-white">{p.agencia}</td>
                    <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300 font-sans">{p.metodo}</td>
                    <td className="py-3.5 px-4 font-sans">
                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                          p.tipo_pago.includes('PREMIO')
                            ? 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/20'
                            : 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20'
                        }`}
                      >
                        {p.tipo_pago}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-slate-500 dark:text-slate-400 text-xs font-mono" title={p.referencia}>
                      {cleanReference(p.referencia)}
                    </td>
                    <td className="py-3.5 px-4 text-right font-bold text-slate-900 dark:text-white">
                      {formatCurrency(p.monto, p.moneda)}
                    </td>
                    <td className="py-3.5 px-4 text-center font-sans">
                      {p.confirmado ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 text-[10px] font-bold border border-emerald-200 dark:border-emerald-500/30">
                          <CheckCircle2 className="w-3 h-3" /> Entrante (Confirmado)
                        </span>
                      ) : p.rechazado ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-50 dark:bg-rose-500/15 text-rose-700 dark:text-rose-400 text-[10px] font-bold border border-rose-200 dark:border-rose-500/30">
                          <XCircle className="w-3 h-3" /> Rechazado
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 dark:bg-amber-500/15 text-amber-800 dark:text-amber-400 text-[10px] font-bold border border-amber-200 dark:border-amber-500/30 animate-pulse">
                          <Clock className="w-3 h-3" /> En Tránsito
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-slate-500 dark:text-slate-400 font-sans">{formatDate(p.fecha)}</td>
                    <td className="py-3.5 px-4 text-center">
                      <button
                        onClick={() => handleDeletePayment(p)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors cursor-pointer"
                        title="Eliminar Pago"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* External Apps & API Connection Modal */}
      <ApiDocsModal isOpen={showApiModal} onClose={() => setShowApiModal(false)} />
    </div>
  );
};

export default PaymentsTab;
