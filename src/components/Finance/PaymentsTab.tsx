import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { formatCurrency, formatDate, normalizarMoneda } from '../../utils/formatters';
import type { Agency, Currency, BankAccount } from '../../types';
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
  Coins
} from 'lucide-react';
import confetti from 'canvas-confetti';

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
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [sales, setSales] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);

  // Filters
  const [filterAgency, setFilterAgency] = useState('Todas');
  const [filterMethod, setFilterMethod] = useState('Todos');
  const [filterStatus, setFilterStatus] = useState<'Todos' | 'Confirmados' | 'Pendientes' | 'Rechazados'>('Todos');
  const [searchQuery, setSearchQuery] = useState('');

  // Form State matching Streamlit pagos_gastos.py
  const [formAgencia, setFormAgencia] = useState('');
  const [formMoneda, setFormMoneda] = useState('BS');
  const [formMetodo, setFormMetodo] = useState<'BANCO' | 'EFECTIVO' | 'OTRO'>('BANCO');
  const [formTipoOperacion, setFormTipoOperacion] = useState<'Pago' | 'Pago de Premios'>('Pago');
  const [formBancoSel, setFormBancoSel] = useState('');
  const [formMonto, setFormMonto] = useState('');
  const [formReferencia, setFormReferencia] = useState('');
  const [formConfirmDirecta, setFormConfirmDirecta] = useState(false);
  const [formFecha, setFormFecha] = useState(systemCycle?.hasta || new Date().toISOString().split('T')[0]);

  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  const loadData = useCallback(async () => {
    if (!effectiveUserId) return;
    setIsLoading(true);
    setMessage(null);

    try {
      const [psRes, pbRes, pdRes, agRes, monRes, cbRes, salesRes, expRes] = await Promise.all([
        supabase.from('pagos_semana').select('*').eq('user_id', effectiveUserId).order('id', { ascending: false }),
        supabase.from('cda_pagos_bancarios').select('*').eq('user_id', effectiveUserId).order('id', { ascending: false }),
        supabase.from('cda_pagos_diarios').select('*').eq('user_id', effectiveUserId).order('id', { ascending: false }),
        supabase.from('agencias').select('*').eq('user_id', effectiveUserId).order('nombre_agencia', { ascending: true }),
        supabase.from('monedas').select('*').eq('user_id', effectiveUserId).order('id', { ascending: true }),
        supabase.from('cuentas_bancarias').select('*').eq('user_id', effectiveUserId).order('banco', { ascending: true }),
        supabase.from('carga_actual').select('*').eq('user_id', effectiveUserId),
        supabase.from('gastos_semana').select('*').eq('user_id', effectiveUserId),
      ]);

      const loadedAgencies = agRes.data || [];
      setAgencies(loadedAgencies);
      setCurrencies(monRes.data || []);
      setBankAccounts(cbRes.data || []);
      setSales(salesRes.data || []);
      setExpenses(expRes.data || []);

      if (loadedAgencies.length > 0) {
        setFormAgencia((prev) => {
          if (prev && loadedAgencies.some((a) => String(a?.nombre_agencia || '').trim().toUpperCase() === String(prev || '').trim().toUpperCase())) {
            return prev;
          }
          return loadedAgencies[0].nombre_agencia;
        });
      }

      const list: PaymentItem[] = [];

      // Process pagos_semana
      (psRes.data || []).forEach((r: any) => {
        list.push({
          id: r.id,
          tabla: 'pagos_semana',
          agencia: String(r.agencia || '').trim().toUpperCase(),
          moneda: normalizarMoneda(r.moneda),
          tipo_pago: String(r.tipo_pago || 'PAGO').toUpperCase(),
          metodo: String(r.metodo || 'BANCO').toUpperCase(),
          monto: Number(r.monto || 0),
          referencia: String(r.referencia || 'N/A'),
          confirmado: Boolean(r.confirmado),
          rechazado: Boolean(r.rechazado),
          motivo_rechazo: r.motivo_rechazo,
          fecha: String(r.fecha || r.created_at || ''),
        });
      });

      // Also include cda_pagos_bancarios if not already in pagos_semana (scoped by agency)
      const existingKeys = new Set(list.map((p) => `${p.agencia}_${p.referencia.toUpperCase()}`));

      (pbRes.data || []).forEach((r: any) => {
        const agUpper = String(r.agencia || '').trim().toUpperCase();
        const refUpper = String(r.referencia || '').toUpperCase();
        const k = `${agUpper}_${refUpper}`;
        if (!existingKeys.has(k) && refUpper !== 'N/A') {
          list.push({
            id: r.id,
            tabla: 'cda_pagos_bancarios',
            agencia: agUpper,
            moneda: normalizarMoneda(r.moneda),
            tipo_pago: 'PAGO',
            metodo: String(r.metodo_pago || 'TRANSFERENCIA').toUpperCase(),
            monto: Number(r.monto || 0),
            referencia: refUpper || 'N/A',
            confirmado: Boolean(r.confirmado),
            rechazado: Boolean(r.rechazado),
            motivo_rechazo: r.motivo_rechazo,
            fecha: String(r.fecha || r.created_at || ''),
          });
        }
      });

      setPayments(list);
    } catch (err: any) {
      console.error('Error loading payments:', err);
      setMessage({ type: 'error', text: err?.message || 'Error al cargar pagos.' });
    } finally {
      setIsLoading(false);
    }
  }, [effectiveUserId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Selected agency object
  const selectedAgencyObj = useMemo(() => {
    return agencies.find((a) => String(a?.nombre_agencia || '').trim().toUpperCase() === String(formAgencia || '').trim().toUpperCase());
  }, [agencies, formAgencia]);

  // Available currencies for selected agency
  const availableAgencyCurrencies = useMemo(() => {
    if (!selectedAgencyObj) return ['BS', 'USD', 'COP'];
    const assigned = parseList(selectedAgencyObj.monedas);
    if (assigned.length === 0 || assigned.includes('TODAS')) {
      return currencies.length > 0 ? currencies.map((c) => c.nombre_moneda) : ['BS', 'USD', 'COP'];
    }
    return assigned;
  }, [selectedAgencyObj, currencies]);

  // Ensure formMoneda matches available currencies
  useEffect(() => {
    if (availableAgencyCurrencies.length > 0 && !availableAgencyCurrencies.includes(formMoneda)) {
      setFormMoneda(availableAgencyCurrencies[0]);
    }
  }, [availableAgencyCurrencies, formMoneda]);

  // Live Balances per Agency for BS, USD, COP (matching Streamlit pagos_gastos.py)
  const agencyBalances = useMemo(() => {
    if (!selectedAgencyObj) return { BS: 0, USD: 0, COP: 0 };
    const agNom = String(selectedAgencyObj.nombre_agencia || '').trim().toUpperCase();
    const partAg = Number(selectedAgencyObj.participacion_ag || 0) / 100;

    const result = { BS: 0, USD: 0, COP: 0 };

    (['BS', 'USD', 'COP'] as const).forEach((m) => {
      const colIni = m === 'BS' ? 'saldo_inicial_bs' : m === 'USD' ? 'saldo_inicial_usd' : 'saldo_inicial_cop';
      const sIni = Number(selectedAgencyObj[colIni] || 0);

      // Ventas
      const agSales = sales.filter((s) => String(s.agencia || '').trim().toUpperCase() === agNom && normalizarMoneda(s.moneda) === m);
      const vNeto = agSales.reduce((acc, curr) => acc + Number(curr.neto || 0), 0);
      const uNeta = Math.round((vNeto * (1 - partAg)) * 100) / 100;

      // Gastos
      const agGastos = expenses.filter((g) => String(g.agencia || '').trim().toUpperCase() === agNom && normalizarMoneda(g.moneda) === m);
      const gTot = agGastos.reduce((acc, curr) => acc + Number(curr.monto || 0), 0);

      // Pagos ordinarios recibidos (disminuyen saldo deudor)
      const pCobros = payments
        .filter((p) => String(p.agencia || '').trim().toUpperCase() === agNom && normalizarMoneda(p.moneda) === m && !String(p.tipo_pago || '').toUpperCase().includes('PREMIO') && p.confirmado)
        .reduce((acc, curr) => acc + Number(curr.monto || 0), 0);

      // Reposición de premios pagados por operadora (aumenta o resta)
      const pPremios = payments
        .filter((p) => String(p.agencia || '').trim().toUpperCase() === agNom && normalizarMoneda(p.moneda) === m && String(p.tipo_pago || '').toUpperCase().includes('PREMIO') && p.confirmado)
        .reduce((acc, curr) => acc + Number(curr.monto || 0), 0);

      const pNetos = pCobros - pPremios;
      const finalBalance = Math.round((sIni + uNeta - gTot - pNetos) * 100) / 100;
      result[m] = finalBalance;
    });

    return result;
  }, [selectedAgencyObj, sales, expenses, payments]);

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

  // Method metrics summary
  const methodMetrics = useMemo(() => {
    const map: Record<string, number> = {};
    payments.forEach((p) => {
      const key = `${p.metodo} (${p.moneda})`;
      map[key] = (map[key] || 0) + p.monto;
    });
    return Object.entries(map).map(([k, total]) => ({ key: k, total }));
  }, [payments]);

  // Filtered payments
  const filteredPayments = useMemo(() => {
    return payments.filter((p) => {
      if (filterAgency !== 'Todas' && p.agencia !== filterAgency) return false;
      if (filterMethod !== 'Todos' && p.metodo !== filterMethod) return false;

      if (filterStatus === 'Confirmados' && !p.confirmado) return false;
      if (filterStatus === 'Pendientes' && (p.confirmado || p.rechazado)) return false;
      if (filterStatus === 'Rechazados' && !p.rechazado) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const match =
          p.agencia.toLowerCase().includes(q) ||
          p.referencia.toLowerCase().includes(q) ||
          p.metodo.toLowerCase().includes(q);
        if (!match) return false;
      }

      return true;
    });
  }, [payments, filterAgency, filterMethod, filterStatus, searchQuery]);

  // Submit New Payment
  const handleSavePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!effectiveUserId) return;

    const montoNum = parseFloat(String(formMonto).replace(',', '.')) || 0;
    if (!formAgencia || montoNum <= 0) {
      setMessage({ type: 'error', text: 'Seleccione una agencia e ingrese un monto mayor a 0.' });
      return;
    }

    setIsProcessing(true);

    try {
      let metodoDb = 'BANCO';
      let refCompleta = 'BANCO';

      if (formMetodo === 'EFECTIVO') {
        metodoDb = 'EFECTIVO';
        refCompleta = 'EFECTIVO';
      } else if (formMetodo === 'OTRO') {
        metodoDb = 'OTRO';
        const refTxt = formReferencia.trim() ? ` - Ref: ${formReferencia.trim().toUpperCase()}` : '';
        refCompleta = `OTRO CANAL${refTxt}`;
      } else {
        metodoDb = 'BANCO';
        const refTxt = formReferencia.trim() ? ` - Ref: ${formReferencia.trim().toUpperCase()}` : '';
        refCompleta = formBancoSel ? `${formBancoSel}${refTxt}` : (formReferencia.trim().toUpperCase() || 'BANCO');
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

      const { error } = await supabase.from('pagos_semana').insert(payload);
      if (error) throw error;

      if (formConfirmDirecta) {
        confetti({ particleCount: 50, spread: 60 });
        setMessage({
          type: 'success',
          text: `✅ ${tipoDb} de ${formMoneda} ${montoNum.toLocaleString('es-VE', { minimumFractionDigits: 2 })} registrado y confirmado exitosamente.`,
        });
      } else {
        setMessage({
          type: 'info',
          text: `⏳ ${tipoDb} de ${formMoneda} ${montoNum.toLocaleString('es-VE', { minimumFractionDigits: 2 })} registrado como PENDIENTE. Por favor verifícalo en la Pizarra de Confirmaciones.`,
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
    setFormMonto('');
    setFormReferencia('');
    setFormConfirmDirecta(false);
    setMessage({ type: 'success', text: 'Pantalla de pago limpiada.' });
  };

  // Delete Payment
  const handleDeletePayment = async (item: PaymentItem) => {
    if (!window.confirm(`¿Eliminar este pago de ${item.moneda} ${item.monto} de ${item.agencia}?`)) return;
    setIsProcessing(true);

    try {
      const { error } = await supabase.from(item.tabla).delete().eq('id', item.id).eq('user_id', effectiveUserId);
      if (error) throw error;

      setMessage({ type: 'success', text: 'Pago eliminado correctamente.' });
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
          <h2 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2">
            <span className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              <CreditCard className="w-5 h-5" />
            </span>
            Gestión de Cobranzas y Pagos
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Registro de cobros recibidos y abonos de premios para el balance de agencias.
          </p>
        </div>

        <button
          onClick={() => loadData()}
          disabled={isLoading}
          className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex items-center gap-1.5 transition-all border border-slate-700 cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          Actualizar
        </button>
      </div>

      {message && (
        <div
          className={`p-4 rounded-2xl border flex items-center gap-3 text-sm animate-fade-in ${
            message.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
              : message.type === 'info'
              ? 'bg-cyan-500/10 border-cyan-500/20 text-cyan-300'
              : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
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

      {/* Income Summary by Method Cards */}
      <div className="space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
          Resumen de Ingresos por Método de Pago
        </h3>

        {methodMetrics.length === 0 ? (
          <div className="bg-[#0D1B22] border border-slate-800 rounded-2xl p-6 text-center text-xs text-slate-400">
            No hay pagos registrados para este ciclo.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {methodMetrics.map((m) => (
              <div
                key={m.key}
                className="bg-[#0D1B22] border border-slate-800 rounded-2xl p-3.5 text-center shadow-lg"
              >
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 truncate">
                  {m.key}
                </div>
                <div className="text-sm font-black text-white font-mono mt-1">
                  {m.total.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Redesigned Payment Entry Form matching Streamlit pagos_gastos.py */}
      <div className="bg-[#0D1B22] border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-2xl space-y-5">
        {/* Header & Agency Picker */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-800">
          <div>
            <h3 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
              <span className="text-xl">📝</span>
              Nuevo Registro de Pago
            </h3>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-300 shrink-0">🎯 Seleccionar Agencia:</span>
            <select
              value={formAgencia}
              onChange={(e) => setFormAgencia(e.target.value)}
              className="bg-[#071217] border border-slate-700 focus:border-emerald-500 rounded-xl px-3.5 py-2 text-xs font-bold text-white focus:outline-none cursor-pointer min-w-[220px]"
            >
              {agencies.map((a) => (
                <option key={a.id} value={a.nombre_agencia}>
                  {a.id} - {a.nombre_agencia}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Live Agency Balances Banner */}
        <div className="space-y-2">
          <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
            <span>📄</span> Estado Actual: <span className="text-white font-black">{formAgencia || 'Agencia'}</span>
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-[#071217] border border-slate-800 p-3.5 rounded-2xl">
              <div className="text-[11px] font-bold text-slate-400 uppercase">Saldo BS</div>
              <div className={`text-xl sm:text-2xl font-black font-mono mt-0.5 ${agencyBalances.BS > 0.5 ? 'text-white' : 'text-emerald-400'}`}>
                {agencyBalances.BS.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>

            <div className="bg-[#071217] border border-slate-800 p-3.5 rounded-2xl">
              <div className="text-[11px] font-bold text-slate-400 uppercase">Saldo USD</div>
              <div className={`text-xl sm:text-2xl font-black font-mono mt-0.5 ${agencyBalances.USD > 0.5 ? 'text-white' : 'text-emerald-400'}`}>
                {agencyBalances.USD.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>

            <div className="bg-[#071217] border border-slate-800 p-3.5 rounded-2xl">
              <div className="text-[11px] font-bold text-slate-400 uppercase">Saldo COP</div>
              <div className={`text-xl sm:text-2xl font-black font-mono mt-0.5 ${agencyBalances.COP > 0.5 ? 'text-white' : 'text-emerald-400'}`}>
                {agencyBalances.COP.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
          </div>
        </div>

        <form onSubmit={handleSavePayment} className="space-y-4 pt-2 border-t border-slate-800">
          {/* Row of Currency, Payment Channel and Operation Type */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                <span>🟡</span> Moneda
              </label>
              <select
                value={formMoneda}
                onChange={(e) => setFormMoneda(e.target.value)}
                required
                className="w-full bg-[#071217] border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white font-bold focus:outline-none focus:border-emerald-500 cursor-pointer"
              >
                {availableAgencyCurrencies.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                <span>💳</span> Forma de Pago / Canal
              </label>
              <select
                value={formMetodo}
                onChange={(e) => setFormMetodo(e.target.value as any)}
                required
                className="w-full bg-[#071217] border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white font-bold focus:outline-none focus:border-emerald-500 cursor-pointer"
              >
                <option value="BANCO">BANCO</option>
                <option value="EFECTIVO">EFECTIVO</option>
                <option value="OTRO">OTRO</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                <span>📑</span> Tipo de Operación
              </label>
              <select
                value={formTipoOperacion}
                onChange={(e) => setFormTipoOperacion(e.target.value as any)}
                required
                className="w-full bg-[#071217] border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white font-bold focus:outline-none focus:border-emerald-500 cursor-pointer"
              >
                <option value="Pago">Pago</option>
                <option value="Pago de Premios">Pago de Premios</option>
              </select>
            </div>
          </div>

          {/* Conditional Bank / Account Selector */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
              <span>🏛️</span> {formTipoOperacion === 'Pago de Premios' ? 'Cuenta a Debitar' : 'Banco / Cuenta Destino'}
            </label>
            <select
              value={formBancoSel}
              onChange={(e) => setFormBancoSel(e.target.value)}
              disabled={formMetodo === 'EFECTIVO' || formMetodo === 'OTRO'}
              className="w-full bg-[#071217] border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white font-bold focus:outline-none focus:border-emerald-500 disabled:opacity-60 cursor-pointer"
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
              <label className="text-xs font-bold text-slate-300">Monto *</label>
              <input
                type="number"
                step="0.01"
                min="0"
                required
                placeholder="0,00"
                value={formMonto}
                onChange={(e) => setFormMonto(e.target.value)}
                className="w-full bg-[#071217] border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
              />
            </div>

            {formMetodo !== 'EFECTIVO' ? (
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-300">N° Referencia / Comprobante</label>
                <input
                  type="text"
                  placeholder="Ej: 123456"
                  value={formReferencia}
                  onChange={(e) => setFormReferencia(e.target.value)}
                  className="w-full bg-[#071217] border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>
            ) : (
              <div className="space-y-1 opacity-50">
                <label className="text-xs font-bold text-slate-400">N° Referencia / Comprobante</label>
                <input
                  type="text"
                  disabled
                  value="EFECTIVO"
                  className="w-full bg-[#071217] border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-slate-500 font-mono cursor-not-allowed"
                />
              </div>
            )}

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-300">Fecha del Pago</label>
              <input
                type="date"
                value={formFecha}
                onChange={(e) => setFormFecha(e.target.value)}
                className="w-full bg-[#071217] border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
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
              className="w-4 h-4 rounded border-slate-700 text-emerald-500 focus:ring-emerald-500 bg-[#071217] cursor-pointer"
            />
            <label htmlFor="conf_directa" className="text-xs font-semibold text-slate-300 cursor-pointer flex items-center gap-1">
              <span>⚡</span> Confirmar de inmediato (omitir Pizarra de Confirmaciones)
            </label>
          </div>

          {/* Primary Action Button */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={isProcessing}
              className="w-full py-3 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-sm shadow-xl shadow-emerald-500/20 flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
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
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs flex items-center gap-1.5 transition-all border border-slate-700 cursor-pointer"
          >
            🧹 LIMPIAR PANTALLA
          </button>
        </div>
      </div>

      {/* Payments Table */}
      <div className="bg-[#0D1B22] border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
        <div className="p-4 sm:p-6 border-b border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
          <h4 className="text-sm font-bold text-white uppercase tracking-wider">
            Pagos Registrados ({filteredPayments.length})
          </h4>

          {/* Table Filters */}
          <div className="flex items-center gap-2">
            <select
              value={filterAgency}
              onChange={(e) => setFilterAgency(e.target.value)}
              className="bg-[#071217] border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white cursor-pointer"
            >
              <option value="Todas">Todas las Agencias</option>
              {agencies.map((a) => (
                <option key={a.id} value={a.nombre_agencia}>
                  {a.nombre_agencia}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#071217] text-slate-400 border-b border-slate-800 font-bold uppercase tracking-wider">
              <tr>
                <th className="py-3.5 px-4">Agencia</th>
                <th className="py-3.5 px-4">Método</th>
                <th className="py-3.5 px-4">Tipo</th>
                <th className="py-3.5 px-4">Referencia</th>
                <th className="py-3.5 px-4 text-right">Monto</th>
                <th className="py-3.5 px-4 text-center">Estado</th>
                <th className="py-3.5 px-4">Fecha</th>
                <th className="py-3.5 px-4 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 font-mono">
              {filteredPayments.map((p) => (
                <tr key={`${p.tabla}_${p.id}`} className="hover:bg-slate-800/30 transition-colors">
                  <td className="py-3.5 px-4 font-sans font-bold text-white">{p.agencia}</td>
                  <td className="py-3.5 px-4 text-slate-300 font-sans">{p.metodo}</td>
                  <td className="py-3.5 px-4 font-sans">
                    <span
                      className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                        p.tipo_pago.includes('PREMIO')
                          ? 'bg-amber-500/10 text-amber-400'
                          : 'bg-cyan-500/10 text-cyan-400'
                      }`}
                    >
                      {p.tipo_pago}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-slate-400 text-xs font-mono">{p.referencia}</td>
                  <td className="py-3.5 px-4 text-right font-bold text-white">
                    {formatCurrency(p.monto, p.moneda)}
                  </td>
                  <td className="py-3.5 px-4 text-center font-sans">
                    {p.confirmado ? (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 text-[10px] font-bold border border-emerald-500/30">
                        ✅ Confirmado
                      </span>
                    ) : p.rechazado ? (
                      <span className="px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-400 text-[10px] font-bold border border-rose-500/30">
                        ❌ Rechazado
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 text-[10px] font-bold border border-amber-500/30">
                        ⏳ Pendiente
                      </span>
                    )}
                  </td>
                  <td className="py-3.5 px-4 text-slate-500 font-sans">{formatDate(p.fecha)}</td>
                  <td className="py-3.5 px-4 text-center">
                    <button
                      onClick={() => handleDeletePayment(p)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                      title="Eliminar Pago"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default PaymentsTab;
