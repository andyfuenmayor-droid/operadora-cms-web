import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { formatCurrency, formatDate, normalizarMoneda } from '../../utils/formatters';
import type { Agency, Currency } from '../../types';
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
  Building2
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

export const PaymentsTab: React.FC = () => {
  const { effectiveUserId, systemCycle, user } = useAuth();

  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [payments, setPayments] = useState<PaymentItem[]>([]);
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [currencies, setCurrencies] = useState<Currency[]>([]);

  // Filters
  const [filterAgency, setFilterAgency] = useState('Todas');
  const [filterMethod, setFilterMethod] = useState('Todos');
  const [filterStatus, setFilterStatus] = useState<'Todos' | 'Confirmados' | 'Pendientes' | 'Rechazados'>('Todos');
  const [searchQuery, setSearchQuery] = useState('');

  // Form State
  const [formAgencia, setFormAgencia] = useState('');
  const [formMoneda, setFormMoneda] = useState('USD');
  const [formTipoPago, setFormTipoPago] = useState<'PAGO' | 'PAGO DE PREMIOS'>('PAGO');
  const [formMetodo, setFormMetodo] = useState('TRANSFERENCIA');
  const [formMonto, setFormMonto] = useState('');
  const [formReferencia, setFormReferencia] = useState('');
  const [formFecha, setFormFecha] = useState(systemCycle.hasta);

  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadData = async () => {
    if (!effectiveUserId) return;
    setIsLoading(true);
    setMessage(null);

    try {
      const [psRes, pbRes, pdRes, agRes, monRes] = await Promise.all([
        supabase.from('pagos_semana').select('*').eq('user_id', effectiveUserId).order('id', { ascending: false }),
        supabase.from('cda_pagos_bancarios').select('*').eq('user_id', effectiveUserId).order('id', { ascending: false }),
        supabase.from('cda_pagos_diarios').select('*').eq('user_id', effectiveUserId).order('id', { ascending: false }),
        supabase.from('agencias').select('*').eq('user_id', effectiveUserId).order('nombre_agencia', { ascending: true }),
        supabase.from('monedas').select('*').eq('user_id', effectiveUserId).order('id', { ascending: true }),
      ]);

      setAgencies(agRes.data || []);
      setCurrencies(monRes.data || []);

      if (agRes.data && agRes.data.length > 0 && !formAgencia) {
        setFormAgencia(agRes.data[0].nombre_agencia);
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
  };

  useEffect(() => {
    loadData();
  }, [effectiveUserId]);

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

    const montoNum = Number(formMonto);
    if (!formAgencia || montoNum <= 0) {
      setMessage({ type: 'error', text: 'Seleccione agencia e ingrese un monto mayor a 0.' });
      return;
    }

    setIsProcessing(true);

    try {
      const payload = {
        user_id: effectiveUserId,
        agencia: formAgencia,
        moneda: formMoneda,
        tipo_pago: formTipoPago === 'PAGO DE PREMIOS' ? 'Pago de Premios' : 'Pago',
        metodo: formMetodo,
        monto: montoNum,
        referencia: formReferencia.trim().toUpperCase() || 'PAGO DIRECTO',
        confirmado: true,
        confirmado_por: user?.nombre || user?.email?.split('@')[0] || 'Administrador',
        rechazado: false,
        fecha: formFecha || new Date().toISOString(),
      };

      const { error } = await supabase.from('pagos_semana').insert(payload);
      if (error) throw error;

      confetti({ particleCount: 40, spread: 60 });
      setMessage({ type: 'success', text: `¡Pago de ${formMoneda} ${montoNum.toLocaleString()} registrado exitosamente!` });

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

      {/* Manual Payment Entry Form */}
      <div className="bg-[#0D1B22] border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <Plus className="w-4 h-4 text-emerald-400" />
          Registrar Pago / Cobro Directo
        </h3>

        <form onSubmit={handleSavePayment} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300">Agencia *</label>
              <select
                value={formAgencia}
                onChange={(e) => setFormAgencia(e.target.value)}
                required
                className="w-full bg-[#071217] border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-emerald-500"
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
                className="w-full bg-[#071217] border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-emerald-500"
              >
                {currencies.map((m) => (
                  <option key={m.id} value={m.nombre_moneda}>
                    {m.nombre_moneda} ({m.simbolo})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300">Tipo de Movimiento *</label>
              <select
                value={formTipoPago}
                onChange={(e) => setFormTipoPago(e.target.value as any)}
                required
                className="w-full bg-[#071217] border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-emerald-500"
              >
                <option value="PAGO">PAGO (Cobranza a la Agencia)</option>
                <option value="PAGO DE PREMIOS">PAGO DE PREMIOS (Reposición a favor)</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300">Método de Pago *</label>
              <select
                value={formMetodo}
                onChange={(e) => setFormMetodo(e.target.value)}
                required
                className="w-full bg-[#071217] border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-emerald-500"
              >
                <option value="TRANSFERENCIA">TRANSFERENCIA</option>
                <option value="PAGO MOVIL">PAGO MÓVIL</option>
                <option value="EFECTIVO">EFECTIVO</option>
                <option value="PUNTO DE VENTA">PUNTO DE VENTA (POS)</option>
                <option value="ZELLE">ZELLE</option>
                <option value="BANCO">BANCO</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
                className="w-full bg-[#071217] border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300">Referencia / Banco</label>
              <input
                type="text"
                placeholder="Ej: REF 123456 - BANESCO"
                value={formReferencia}
                onChange={(e) => setFormReferencia(e.target.value)}
                className="w-full bg-[#071217] border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300">Fecha del Pago</label>
              <input
                type="date"
                value={formFecha}
                onChange={(e) => setFormFecha(e.target.value)}
                className="w-full bg-[#071217] border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isProcessing}
              className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-bold text-xs shadow-lg shadow-emerald-500/20 flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
              {isProcessing ? 'Guardando...' : 'Registrar Pago'}
            </button>
          </div>
        </form>
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
