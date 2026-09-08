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
  const { effectiveUserId, systemCycle } = useAuth();

  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [expenses, setExpenses] = useState<ExpenseItem[]>([]);
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [currencies, setCurrencies] = useState<Currency[]>([]);

  // Filters
  const [filterAgency, setFilterAgency] = useState('Todas');
  const [filterCurrency, setFilterCurrency] = useState('Todas');
  const [searchQuery, setSearchQuery] = useState('');

  // Form State
  const [formAgencia, setFormAgencia] = useState('');
  const [formMoneda, setFormMoneda] = useState('USD');
  const [formMonto, setFormMonto] = useState('');
  const [formConcepto, setFormConcepto] = useState('');
  const [formReferencia, setFormReferencia] = useState('');
  const [formFecha, setFormFecha] = useState(systemCycle.hasta);

  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

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

      setAgencies(agRes.data || []);
      setCurrencies(monRes.data || []);

      if (agRes.data && agRes.data.length > 0 && !formAgencia) {
        setFormAgencia(agRes.data[0].nombre_agencia);
      }

      const list: ExpenseItem[] = [];

      (gRes.data || []).forEach((r: any) => {
        list.push({
          id: r.id,
          tabla: 'gastos',
          agencia: String(r.agencia || r.nombre_agency || '').trim().toUpperCase(),
          moneda: normalizarMoneda(r.moneda),
          monto: Number(r.monto || 0),
          concepto: String(r.concepto || r.descripcion || 'Gasto Operativo'),
          referencia: String(r.referencia || 'N/A'),
          confirmado: Boolean(r.confirmado),
          fecha: String(r.fecha || r.created_at || ''),
        });
      });

      (gdRes.data || []).forEach((r: any) => {
        list.push({
          id: r.id,
          tabla: 'cda_gastos_diarios',
          agencia: String(r.agencia || '').trim().toUpperCase(),
          moneda: normalizarMoneda(r.moneda),
          monto: Number(r.monto || 0),
          concepto: String(r.concepto || 'Gasto Taquilla'),
          referencia: String(r.referencia || 'N/A'),
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

  // Expenses totals by currency
  const currencyTotals = useMemo(() => {
    let bs = 0, usd = 0, cop = 0;
    expenses.forEach((e) => {
      if (e.moneda === 'BS') bs += e.monto;
      else if (e.moneda === 'USD') usd += e.monto;
      else if (e.moneda === 'COP') cop += e.monto;
    });
    return { bs, usd, cop };
  }, [expenses]);

  // Filtered expenses
  const filteredExpenses = useMemo(() => {
    return expenses.filter((e) => {
      if (filterAgency !== 'Todas' && e.agencia !== filterAgency) return false;
      if (filterCurrency !== 'Todas' && e.moneda !== filterCurrency) return false;

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
  }, [expenses, filterAgency, filterCurrency, searchQuery]);

  // Submit New Expense
  const handleSaveExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!effectiveUserId) return;

    const montoNum = Number(formMonto);
    if (!formAgencia || montoNum <= 0 || !formConcepto.trim()) {
      setMessage({ type: 'error', text: 'Complete los campos obligatorios y un monto mayor a 0.' });
      return;
    }

    setIsProcessing(true);

    try {
      const payload = {
        user_id: effectiveUserId,
        agencia: formAgencia,
        moneda: formMoneda,
        monto: montoNum,
        concepto: formConcepto.trim(),
        referencia: formReferencia.trim().toUpperCase() || 'GASTO DIRECTO',
        confirmado: true,
        fecha: formFecha || new Date().toISOString(),
      };

      const { error } = await supabase.from('gastos').insert(payload);
      if (error) throw error;

      confetti({ particleCount: 35, spread: 50 });
      setMessage({ type: 'success', text: `¡Gasto de ${formMoneda} ${montoNum.toLocaleString()} registrado con éxito!` });

      setFormMonto('');
      setFormConcepto('');
      setFormReferencia('');
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
          <h2 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2">
            <span className="p-2 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20">
              <Banknote className="w-5 h-5" />
            </span>
            Gestión de Gastos Operativos
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Control y registro de gastos operacionales descontables en el estado de cuenta de cada agencia.
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

      {/* Totals by Currency Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-[#0D1B22] border border-slate-800 rounded-2xl p-4 text-center">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total Gastos (BS)</div>
          <div className="text-xl font-black text-white font-mono mt-1">
            {formatCurrency(currencyTotals.bs, 'BS')}
          </div>
        </div>

        <div className="bg-[#0D1B22] border border-slate-800 rounded-2xl p-4 text-center">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total Gastos (USD)</div>
          <div className="text-xl font-black text-emerald-400 font-mono mt-1">
            {formatCurrency(currencyTotals.usd, 'USD')}
          </div>
        </div>

        <div className="bg-[#0D1B22] border border-slate-800 rounded-2xl p-4 text-center">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total Gastos (COP)</div>
          <div className="text-xl font-black text-cyan-400 font-mono mt-1">
            {formatCurrency(currencyTotals.cop, 'COP')}
          </div>
        </div>
      </div>

      {/* Manual Expense Form */}
      <div className="bg-[#0D1B22] border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <Plus className="w-4 h-4 text-rose-400" />
          Registrar Gasto Operativo
        </h3>

        <form onSubmit={handleSaveExpense} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300">Agencia *</label>
              <select
                value={formAgencia}
                onChange={(e) => setFormAgencia(e.target.value)}
                required
                className="w-full bg-[#071217] border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-rose-500"
              >
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
                className="w-full bg-[#071217] border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-rose-500"
              >
                {currencies.map((m) => (
                  <option key={m.id} value={m.nombre_moneda}>
                    {m.nombre_moneda} ({m.simbolo})
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

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isProcessing}
              className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-rose-600 to-rose-500 text-white font-bold text-xs shadow-lg shadow-rose-600/20 flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
              {isProcessing ? 'Guardando...' : 'Registrar Gasto'}
            </button>
          </div>
        </form>
      </div>

      {/* Expenses Table */}
      <div className="bg-[#0D1B22] border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
        <div className="p-4 sm:p-6 border-b border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
          <h4 className="text-sm font-bold text-white uppercase tracking-wider">
            Gastos Registrados ({filteredExpenses.length})
          </h4>

          <div className="flex items-center gap-2">
            <select
              value={filterAgency}
              onChange={(e) => setFilterAgency(e.target.value)}
              className="bg-[#071217] border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white"
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
                <th className="py-3.5 px-4">Concepto</th>
                <th className="py-3.5 px-4">Referencia</th>
                <th className="py-3.5 px-4 text-right">Monto</th>
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
        </div>
      </div>
    </div>
  );
};
