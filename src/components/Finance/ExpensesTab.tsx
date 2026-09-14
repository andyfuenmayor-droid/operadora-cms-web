import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { formatCurrency, formatDate, normalizarMoneda } from '../../utils/formatters';
import type { Agency, Currency } from '../../types';
import {
  Banknote,
  Plus,
  Trash2,
  RefreshCw,
  Search,
  Filter,
  DollarSign,
  Building2,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';
import confetti from 'canvas-confetti';

interface ExpenseItem {
  id: number;
  tabla: string;
  agencia: string;
  moneda: string;
  monto: number;
  concepto: string;
  referencia: string;
  confirmado: boolean;
  fecha: string;
}

export const ExpensesTab: React.FC = () => {
  const { effectiveUserId, systemCycle, user } = useAuth();

  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [expenses, setExpenses] = useState<ExpenseItem[]>([]);
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [currencies, setCurrencies] = useState<Currency[]>([]);

  // Filters
  const [filterPeriod, setFilterPeriod] = useState<'ciclo' | 'todos'>('ciclo');
  const [filterAgency, setFilterAgency] = useState('Todas');
  const [filterCurrency, setFilterCurrency] = useState('Todas');
  const [searchQuery, setSearchQuery] = useState('');

  // Form State
  const [formAgencia, setFormAgencia] = useState('');
  const [formMoneda, setFormMoneda] = useState('BS');
  const [formMonto, setFormMonto] = useState('');
  const [formConcepto, setFormConcepto] = useState('');
  const [formReferencia, setFormReferencia] = useState('');
  const [formFecha, setFormFecha] = useState(systemCycle.hasta || '');
  const [formConfirmDirecta, setFormConfirmDirecta] = useState(false);

  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Selected agency object
  const selectedAgencyObj = useMemo(() => {
    return agencies.find(
      (a) => String(a?.nombre_agencia || '').trim().toUpperCase() === String(formAgencia || '').trim().toUpperCase()
    );
  }, [agencies, formAgencia]);

  // Available currencies for selected agency
  const availableAgencyCurrencies = useMemo(() => {
    if (!selectedAgencyObj) return ['BS', 'USD', 'COP'];
    const raw = String(selectedAgencyObj.monedas || '').toUpperCase();
    const parts = raw
      .split(',')
      .map((m) => m.trim())
      .filter(Boolean);
    if (parts.length === 0 || parts.includes('TODAS')) {
      return ['BS', 'USD', 'COP'];
    }
    return parts;
  }, [selectedAgencyObj]);

  // Ensure formMoneda matches available currencies of the selected agency
  useEffect(() => {
    if (availableAgencyCurrencies.length > 0 && !availableAgencyCurrencies.includes(formMoneda)) {
      setFormMoneda(availableAgencyCurrencies[0]);
    }
  }, [availableAgencyCurrencies, formMoneda]);

  // Update default form date when systemCycle changes
  useEffect(() => {
    if (systemCycle.hasta && !formFecha) {
      setFormFecha(systemCycle.hasta);
    }
  }, [systemCycle.hasta, formFecha]);

  const loadData = async () => {
    if (!effectiveUserId) return;
    setIsLoading(true);
    setMessage(null);

    try {
      const [gRes, gdRes, agRes, monRes] = await Promise.all([
        supabase.from('gastos').select('*').eq('user_id', effectiveUserId).order('id', { ascending: false }),
        supabase.from('cda_gastos_diarios').select('*').eq('user_id', effectiveUserId).order('id', { ascending: false }),
        supabase.from('agencias').select('*').eq('user_id', effectiveUserId).order('nombre_agencia', { ascending: true }),
        supabase.from('monedas').select('*').eq('user_id', effectiveUserId).order('id', { ascending: true }),
      ]);

      const loadedAgencies = agRes.data || [];
      setAgencies(loadedAgencies);
      setCurrencies(monRes.data || []);

      const list: ExpenseItem[] = [];

      (gRes.data || []).forEach((r: any) => {
        let rawConcepto = String(r.concepto || r.descripcion || 'Gasto Operativo').trim();
        let refStr = 'N/A';
        const matchRef = rawConcepto.match(/\[REF:\s*([^\]]+)\]/i);
        if (matchRef) {
          refStr = matchRef[1].trim();
          rawConcepto = rawConcepto.replace(/\[REF:\s*[^\]]+\]/i, '').trim();
        }

        list.push({
          id: r.id,
          tabla: 'gastos',
          agencia: String(r.agencia || r.nombre_agency || '').trim().toUpperCase(),
          moneda: normalizarMoneda(r.moneda),
          monto: Number(r.monto || 0),
          concepto: rawConcepto,
          referencia: refStr,
          confirmado: Boolean(r.confirmado),
          fecha: String(r.fecha || r.created_at || ''),
        });
      });

      (gdRes.data || []).forEach((r: any) => {
        let rawConcepto = String(r.concepto || r.descripcion || 'Gasto Taquilla').trim();
        let refStr = 'N/A';
        const matchRef = rawConcepto.match(/\[REF:\s*([^\]]+)\]/i);
        if (matchRef) {
          refStr = matchRef[1].trim();
          rawConcepto = rawConcepto.replace(/\[REF:\s*[^\]]+\]/i, '').trim();
        }

        list.push({
          id: r.id,
          tabla: 'cda_gastos_diarios',
          agencia: String(r.agencia || r.nombre_agency || '').trim().toUpperCase(),
          moneda: normalizarMoneda(r.moneda),
          monto: Number(r.monto || 0),
          concepto: rawConcepto,
          referencia: refStr,
          confirmado: Boolean(r.confirmado),
          fecha: String(r.fecha || r.created_at || ''),
        });
      });

      setExpenses(list);
    } catch (err: any) {
      console.error('Error loading expenses:', err);
      setMessage({ type: 'error', text: err?.message || 'Error al cargar gastos.' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [effectiveUserId]);

  // Expenses totals by currency (scoped to current view filter)
  const currencyTotals = useMemo(() => {
    let bs = 0, usd = 0, cop = 0;
    let pendBs = 0, pendUsd = 0, pendCop = 0;
    const targetList = expenses.filter((e) => {
      if (filterPeriod === 'ciclo' && e.tabla === 'cda_gastos_diarios') {
        const fStr = e.fecha.slice(0, 10);
        return (!systemCycle.desde || fStr >= systemCycle.desde) && (!systemCycle.hasta || fStr <= systemCycle.hasta);
      }
      return true;
    });

    targetList.forEach((e) => {
      if (e.confirmado) {
        if (e.moneda === 'BS') bs += e.monto;
        else if (e.moneda === 'USD') usd += e.monto;
        else if (e.moneda === 'COP') cop += e.monto;
      } else {
        if (e.moneda === 'BS') pendBs += e.monto;
        else if (e.moneda === 'USD') pendUsd += e.monto;
        else if (e.moneda === 'COP') pendCop += e.monto;
      }
    });
    return { bs, usd, cop, pendBs, pendUsd, pendCop };
  }, [expenses, filterPeriod, systemCycle.desde, systemCycle.hasta]);

  // Filtered expenses list
  const filteredExpenses = useMemo(() => {
    return expenses.filter((e) => {
      // 1. Period filter: default 'ciclo' filters by active operative cycle
      if (filterPeriod === 'ciclo') {
        // 'gastos' table records always belong to the active open cycle
        if (e.tabla === 'cda_gastos_diarios') {
          const fStr = e.fecha.slice(0, 10);
          const enRango = (!systemCycle.desde || fStr >= systemCycle.desde) && (!systemCycle.hasta || fStr <= systemCycle.hasta);
          if (!enRango) return false;
        }
      }

      // 2. Agency filter
      if (filterAgency !== 'Todas' && e.agencia !== filterAgency) return false;

      // 3. Currency filter
      if (filterCurrency !== 'Todas' && e.moneda !== filterCurrency) return false;

      // 4. Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const match =
          e.agencia.toLowerCase().includes(q) ||
          e.concepto.toLowerCase().includes(q) ||
          e.referencia.toLowerCase().includes(q);
        if (!match) return false;
      }

      return true;
    });
  }, [expenses, filterPeriod, systemCycle.desde, systemCycle.hasta, filterAgency, filterCurrency, searchQuery]);

  // Submit New Expense
  const handleSaveExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!effectiveUserId) return;

    const montoNum = Number(formMonto);
    if (!formAgencia || montoNum <= 0 || !formConcepto.trim()) {
      setMessage({ type: 'error', text: 'Seleccione una agencia, complete el concepto y un monto mayor a 0.' });
      return;
    }

    setIsProcessing(true);

    try {
      const conceptoFinal = formReferencia.trim()
        ? `${formConcepto.trim().toUpperCase()} [REF: ${formReferencia.trim().toUpperCase()}]`
        : formConcepto.trim().toUpperCase();

      const adminNom = user?.nombre || user?.email?.split('@')[0] || 'ADMIN';

      const payload = {
        user_id: effectiveUserId,
        agencia: formAgencia,
        moneda: formMoneda,
        monto: montoNum,
        concepto: conceptoFinal,
        tipo: 'Agencia',
        confirmado: Boolean(formConfirmDirecta),
        confirmado_por: formConfirmDirecta ? adminNom : null,
        rechazado: false,
        fecha: formFecha || new Date().toISOString().slice(0, 10),
      };

      const { error } = await supabase.from('gastos').insert(payload);
      if (error) throw error;

      if (formConfirmDirecta) {
        confetti({ particleCount: 35, spread: 50 });
        setMessage({
          type: 'success',
          text: `✅ Gasto de ${formMoneda} ${montoNum.toLocaleString('es-VE', { minimumFractionDigits: 2 })} registrado y confirmado exitosamente.`,
        });
      } else {
        setMessage({
          type: 'info',
          text: `⏳ Gasto de ${formMoneda} ${montoNum.toLocaleString('es-VE', { minimumFractionDigits: 2 })} registrado como PENDIENTE. Por favor verifícalo en la Pizarra de Confirmaciones.`,
        });
      }

      setFormAgencia('');
      setFormMonto('');
      setFormConcepto('');
      setFormReferencia('');
      setFormConfirmDirecta(false);
      await loadData();
    } catch (err: any) {
      console.error('Error inserting expense:', err);
      setMessage({ type: 'error', text: err?.message || 'Error al registrar el gasto.' });
    } finally {
      setIsProcessing(false);
    }
  };

  // Delete Expense
  const handleDeleteExpense = async (item: ExpenseItem) => {
    if (!window.confirm(`¿Eliminar este gasto de ${item.moneda} ${item.monto} de ${item.agencia}?`)) return;
    setIsProcessing(true);

    try {
      const { error } = await supabase.from(item.tabla).delete().eq('id', item.id).eq('user_id', effectiveUserId);
      if (error) throw error;

      setMessage({ type: 'success', text: 'Gasto eliminado correctamente.' });
      await loadData();
    } catch (err: any) {
      console.error('Error deleting expense:', err);
      setMessage({ type: 'error', text: err?.message || 'Error al eliminar el gasto.' });
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
            <span className="p-2 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20">
              <Banknote className="w-5 h-5" />
            </span>
            <h2 className="text-xl sm:text-2xl font-black text-white">
              Gastos por Agencia
            </h2>
            <span className="text-[11px] px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-mono font-bold">
              {systemCycle.tipo === 'SEMANAL' ? `Semana ${systemCycle.semana}` : `Operación Diaria ${systemCycle.semana}`} ({systemCycle.desde} al {systemCycle.hasta})
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Control y registro de gastos operacionales descontables en el estado de cuenta de cada agencia para el ciclo operativo.
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
              ? 'bg-amber-500/10 border-amber-500/20 text-amber-400'
              : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 shrink-0" />
          ) : message.type === 'info' ? (
            <span className="text-base shrink-0">⏳</span>
          ) : (
            <AlertTriangle className="w-5 h-5 shrink-0" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      {/* Totals by Currency Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-[#0D1B22] border border-slate-800 rounded-2xl p-4 text-center">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Total Gastos (BS) {filterPeriod === 'ciclo' ? `• Semana ${systemCycle.semana}` : '• Histórico'}
          </div>
          <div className="text-xl font-black text-white font-mono mt-1">
            {formatCurrency(currencyTotals.bs, 'BS')}
          </div>
          {currencyTotals.pendBs > 0 && (
            <div className="mt-1.5">
              <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 text-[10px] font-bold border border-amber-500/30">
                ⏳ {formatCurrency(currencyTotals.pendBs, 'BS')} por confirmar
              </span>
            </div>
          )}
        </div>

        <div className="bg-[#0D1B22] border border-slate-800 rounded-2xl p-4 text-center">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Total Gastos (USD) {filterPeriod === 'ciclo' ? `• Semana ${systemCycle.semana}` : '• Histórico'}
          </div>
          <div className="text-xl font-black text-emerald-400 font-mono mt-1">
            {formatCurrency(currencyTotals.usd, 'USD')}
          </div>
          {currencyTotals.pendUsd > 0 && (
            <div className="mt-1.5">
              <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 text-[10px] font-bold border border-amber-500/30">
                ⏳ {formatCurrency(currencyTotals.pendUsd, 'USD')} por confirmar
              </span>
            </div>
          )}
        </div>

        <div className="bg-[#0D1B22] border border-slate-800 rounded-2xl p-4 text-center">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Total Gastos (COP) {filterPeriod === 'ciclo' ? `• Semana ${systemCycle.semana}` : '• Histórico'}
          </div>
          <div className="text-xl font-black text-cyan-400 font-mono mt-1">
            {formatCurrency(currencyTotals.cop, 'COP')}
          </div>
          {currencyTotals.pendCop > 0 && (
            <div className="mt-1.5">
              <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 text-[10px] font-bold border border-amber-500/30">
                ⏳ {formatCurrency(currencyTotals.pendCop, 'COP')} por confirmar
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Manual Expense Form */}
      <div className="bg-[#0D1B22] border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <Plus className="w-4 h-4 text-rose-400" />
          Registrar Gasto por Agencia
        </h3>

        <form onSubmit={handleSaveExpense} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300">Agencia *</label>
              <select
                value={formAgencia}
                onChange={(e) => setFormAgencia(e.target.value)}
                required
                className="w-full bg-[#071217] border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-rose-500 cursor-pointer"
              >
                <option value="">-- Seleccione una Agencia --</option>
                {agencies.map((a) => (
                  <option key={a.id} value={a.nombre_agencia}>
                    {a.nombre_agencia}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300">Moneda *</label>
              <select
                value={formMoneda}
                onChange={(e) => setFormMoneda(e.target.value)}
                required
                className="w-full bg-[#071217] border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-rose-500 cursor-pointer"
              >
                {availableAgencyCurrencies.map((m) => (
                  <option key={m} value={m}>
                    {m === 'BS' ? 'BS (Bolívares)' : m === 'USD' ? 'USD (Dólares)' : m === 'COP' ? 'COP (Pesos)' : m}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300">Monto *</label>
              <input
                type="number"
                step="0.01"
                min="0"
                required
                placeholder="0.00"
                value={formMonto}
                onChange={(e) => setFormMonto(e.target.value)}
                className="w-full bg-[#071217] border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white font-mono focus:outline-none focus:border-rose-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300">Fecha</label>
              <input
                type="date"
                value={formFecha}
                onChange={(e) => setFormFecha(e.target.value)}
                className="w-full bg-[#071217] border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-rose-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300">Concepto / Descripción *</label>
              <input
                type="text"
                required
                placeholder="Ej: Pago de internet, papelería, mantenimiento..."
                value={formConcepto}
                onChange={(e) => setFormConcepto(e.target.value)}
                className="w-full bg-[#071217] border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-rose-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300">Referencia / Comprobante</label>
              <input
                type="text"
                placeholder="Ej: FACTURA 4920"
                value={formReferencia}
                onChange={(e) => setFormReferencia(e.target.value)}
                className="w-full bg-[#071217] border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-rose-500"
              />
            </div>
          </div>

          {/* Direct Confirmation Checkbox */}
          <div className="flex items-center gap-2.5 pt-1">
            <input
              type="checkbox"
              id="gasto_conf_directa"
              checked={formConfirmDirecta}
              onChange={(e) => setFormConfirmDirecta(e.target.checked)}
              className="w-4 h-4 rounded border-slate-700 text-rose-500 focus:ring-rose-500 bg-[#071217] cursor-pointer"
            />
            <label htmlFor="gasto_conf_directa" className="text-xs font-semibold text-slate-300 cursor-pointer flex items-center gap-1">
              <span>⚡</span> Confirmar de inmediato (omitir Pizarra de Confirmaciones)
            </label>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isProcessing}
              className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-rose-600 to-rose-500 text-white font-bold text-xs shadow-lg shadow-rose-600/20 flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
              {isProcessing ? 'Guardando...' : 'Registrar Gasto por Agencia'}
            </button>
          </div>
        </form>
      </div>

      {/* Expenses Table */}
      <div className="bg-[#0D1B22] border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
        <div className="p-4 sm:p-6 border-b border-slate-800 flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-bold text-white uppercase tracking-wider">
                Gastos Registrados por Agencia ({filteredExpenses.length})
              </h4>
              <span className="text-xs text-slate-500 font-mono">
                {filterPeriod === 'ciclo' ? `(Semana ${systemCycle.semana})` : `(Histórico)`}
              </span>
            </div>

            {/* Period Selector: Ciclo Actual vs Histórico */}
            <div className="inline-flex rounded-xl bg-[#071217] p-1 border border-slate-800 text-xs font-semibold self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setFilterPeriod('ciclo')}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  filterPeriod === 'ciclo'
                    ? 'bg-rose-600 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                🎯 Ciclo Actual (Semana {systemCycle.semana})
              </button>
              <button
                type="button"
                onClick={() => setFilterPeriod('todos')}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  filterPeriod === 'todos'
                    ? 'bg-rose-600 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                📜 Histórico Completo ({expenses.length})
              </button>
            </div>
          </div>

          {/* Search and Dropdown Filters */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder="Buscar por concepto o referencia..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#071217] border border-slate-700 rounded-xl pl-8 pr-3 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-rose-500"
              />
            </div>

            <select
              value={filterAgency}
              onChange={(e) => setFilterAgency(e.target.value)}
              className="bg-[#071217] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-rose-500 cursor-pointer"
            >
              <option value="Todas">Todas las Agencias</option>
              {agencies.map((a) => (
                <option key={a.id} value={a.nombre_agencia}>
                  {a.nombre_agencia}
                </option>
              ))}
            </select>

            <select
              value={filterCurrency}
              onChange={(e) => setFilterCurrency(e.target.value)}
              className="bg-[#071217] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-rose-500 cursor-pointer"
            >
              <option value="Todas">Todas las Monedas</option>
              <option value="BS">BS (Bolívares)</option>
              <option value="USD">USD (Dólares)</option>
              <option value="COP">COP (Pesos)</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          {filteredExpenses.length === 0 ? (
            <div className="p-10 text-center space-y-2">
              <Banknote className="w-8 h-8 text-slate-600 mx-auto" />
              <p className="text-xs font-semibold text-slate-300">
                {filterPeriod === 'ciclo'
                  ? `No hay gastos registrados en el ciclo operativo actual (Semana ${systemCycle.semana}: ${systemCycle.desde} al ${systemCycle.hasta}).`
                  : 'No se encontraron gastos con los filtros seleccionados.'}
              </p>
              {filterPeriod === 'ciclo' && expenses.length > 0 && (
                <button
                  type="button"
                  onClick={() => setFilterPeriod('todos')}
                  className="text-xs text-rose-400 hover:underline pt-1 inline-block cursor-pointer font-medium"
                >
                  Ver los {expenses.length} gastos del historial anterior
                </button>
              )}
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="bg-[#071217] text-slate-400 border-b border-slate-800 font-bold uppercase tracking-wider">
                <tr>
                  <th className="py-3.5 px-4">Agencia</th>
                  <th className="py-3.5 px-4">Concepto</th>
                  <th className="py-3.5 px-4">Referencia</th>
                  <th className="py-3.5 px-4 text-right">Monto</th>
                  <th className="py-3.5 px-4 text-center">Estado</th>
                  <th className="py-3.5 px-4">Fecha</th>
                  <th className="py-3.5 px-4 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 font-mono">
                {filteredExpenses.map((ex) => (
                  <tr key={`${ex.tabla}_${ex.id}`} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-3.5 px-4 font-sans font-bold text-white">{ex.agencia}</td>
                    <td className="py-3.5 px-4 font-sans text-slate-300">{ex.concepto}</td>
                    <td className="py-3.5 px-4 text-slate-400 text-xs font-mono">{ex.referencia}</td>
                    <td className="py-3.5 px-4 text-right font-bold text-rose-400">
                      {formatCurrency(ex.monto, ex.moneda)}
                    </td>
                    <td className="py-3.5 px-4 text-center font-sans">
                      {ex.confirmado ? (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 text-[10px] font-bold border border-emerald-500/30">
                          ✅ Confirmado
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 text-[10px] font-bold border border-amber-500/30">
                          ⏳ Pendiente
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-slate-500 font-sans">{formatDate(ex.fecha)}</td>
                    <td className="py-3.5 px-4 text-center">
                      <button
                        onClick={() => handleDeleteExpense(ex)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                        title="Eliminar Gasto"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};
