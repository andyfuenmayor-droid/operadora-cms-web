import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { formatCurrency, normalizarMoneda } from '../../utils/formatters';
import {
  ShieldCheck,
  Users,
  Key,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  Plus,
  Trash2,
  Edit2,
  Lock,
  Clock,
  DollarSign,
  ChevronDown,
  ChevronUp,
  Building2,
  UserCheck,
  Sparkles,
} from 'lucide-react';
import confetti from 'canvas-confetti';

interface TaquillaUser {
  id: number;
  usuario: string;
  clave?: string;
  nombre_cajero?: string;
  rol: 'cajero' | 'supervisor' | 'agencia';
  agencia_id: number;
  activo: boolean;
}

interface AuditRow {
  agencia: string;
  sistema: string;
  venta_ofi: number;
  venta_taq: number;
  com_ofi: number;
  com_taq: number;
  prem_ofi: number;
  prem_taq: number;
  part_ofi: number;
  part_taq: number;
  gastos_ofi: number;
  gastos_taq: number;
  pagos_ofi: number;
  pagos_taq: number;
}

export const AuditTab: React.FC = () => {
  const { effectiveUserId, systemCycle } = useAuth();

  // Active currency tab
  const [activeCurrency, setActiveCurrency] = useState<'BS' | 'USD' | 'COP'>('BS');

  // Date filters
  const [fechaDesde, setFechaDesde] = useState(systemCycle.desde);
  const [fechaHasta, setFechaHasta] = useState(systemCycle.hasta);

  // Loaded data
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [agencies, setAgencies] = useState<any[]>([]);
  const [taquillaUsers, setTaquillaUsers] = useState<TaquillaUser[]>([]);
  const [salesOfficial, setSalesOfficial] = useState<any[]>([]);
  const [salesTaquilla, setSalesTaquilla] = useState<any[]>([]);
  const [expensesOfficial, setExpensesOfficial] = useState<any[]>([]);
  const [expensesTaquilla, setExpensesTaquilla] = useState<any[]>([]);
  const [paymentsOfficial, setPaymentsOfficial] = useState<any[]>([]);
  const [paymentsTaquilla, setPaymentsTaquilla] = useState<any[]>([]);

  // UI accordion state
  const [isCredentialsOpen, setIsCredentialsOpen] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Modal / Form state for Taquilla User
  const [newUserAgencyId, setNewUserAgencyId] = useState<number | null>(null);
  const [newUsuario, setNewUsuario] = useState('');
  const [newClave, setNewClave] = useState('');
  const [newNombreCajero, setNewNombreCajero] = useState('');
  const [newRol, setNewRol] = useState<'cajero' | 'supervisor' | 'agencia'>('cajero');

  // Edit user state
  const [editingUser, setEditingUser] = useState<TaquillaUser | null>(null);
  const [editRol, setEditRol] = useState<'cajero' | 'supervisor' | 'agencia'>('cajero');
  const [editActivo, setEditActivo] = useState(true);
  const [editClave, setEditClave] = useState('');

  const loadData = useCallback(async () => {
    if (!effectiveUserId) return;
    setIsLoading(true);
    setMessage(null);

    try {
      // Parallel fetch of all audit & comparison tables
      const [
        agRes,
        uRes,
        vOfiRes,
        vTaqRes,
        gOfiRes,
        gTaqRes,
        pOfiRes,
        pTaqRes,
      ] = await Promise.all([
        supabase
          .from('agencias')
          .select('id, nombre_agencia, auditoria_activa, participacion_ag, sistemas, monedas, usuario_taquilla')
          .eq('user_id', effectiveUserId)
          .order('id', { ascending: true }),
        supabase
          .from('taquilla_usuarios')
          .select('*')
          .eq('user_id', effectiveUserId),
        supabase
          .from('carga_actual')
          .select('*')
          .eq('user_id', effectiveUserId),
        supabase
          .from('cda_reportes_diarios')
          .select('*')
          .eq('user_id', effectiveUserId)
          .gte('fecha', fechaDesde)
          .lte('fecha', fechaHasta),
        supabase
          .from('gastos')
          .select('*')
          .eq('user_id', effectiveUserId),
        supabase
          .from('cda_gastos_diarios')
          .select('*')
          .eq('user_id', effectiveUserId)
          .gte('fecha', fechaDesde)
          .lte('fecha', fechaHasta),
        supabase
          .from('pagos_semana')
          .select('*')
          .eq('user_id', effectiveUserId),
        supabase
          .from('cda_pagos_diarios')
          .select('*')
          .eq('user_id', effectiveUserId)
          .gte('fecha', fechaDesde)
          .lte('fecha', fechaHasta),
      ]);

      setAgencies(agRes.data || []);
      setTaquillaUsers((uRes.data || []) as TaquillaUser[]);
      setSalesOfficial(vOfiRes.data || []);
      setSalesTaquilla(vTaqRes.data || []);
      setExpensesOfficial(gOfiRes.data || []);
      setExpensesTaquilla(gTaqRes.data || []);
      setPaymentsOfficial(pOfiRes.data || []);

      // Filter taquilla payments: confirmed, not rejected, not custody movements
      const rawPaymentsTaq = pTaqRes.data || [];
      const cleanPaymentsTaq = rawPaymentsTaq.filter((p: any) => {
        const isRech = Boolean(p.rechazado) || String(p.estado || '').toUpperCase() === 'RECHAZADO';
        const isConf = Boolean(p.confirmado) || Boolean(p.confirmado_supervisor);
        if (isRech || !isConf) return false;

        const tp = String(p.tipo_pago || '').toUpperCase();
        if (['COBRADOR', 'ENTREGADO A ADMIN', 'ENTREGA_ADMIN'].some((k) => tp.includes(k))) {
          return false;
        }
        return true;
      });
      setPaymentsTaquilla(cleanPaymentsTaq);
    } catch (err: any) {
      console.error('Error loading audit data:', err);
      setMessage({ type: 'error', text: err?.message || 'Error al cargar datos de auditoría.' });
    } finally {
      setIsLoading(false);
    }
  }, [effectiveUserId, fechaDesde, fechaHasta]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Auditable agencies list (auditoria_activa = true, or all if none marked)
  const auditableAgencies = useMemo(() => {
    const activeAgs = agencies.filter((a) => a.auditoria_activa);
    return activeAgs.length > 0 ? activeAgs : agencies;
  }, [agencies]);

  const auditableAgencyNames = useMemo(() => {
    return new Set(auditableAgencies.map((a) => String(a.nombre_agencia || '').trim().toUpperCase()));
  }, [auditableAgencies]);

  // Agency participation map
  const participationMap = useMemo(() => {
    const map: Record<string, number> = {};
    agencies.forEach((a) => {
      map[String(a.nombre_agencia || '').trim().toUpperCase()] = Number(a.participacion_ag || 50);
    });
    return map;
  }, [agencies]);

  // Compute audit comparison rows for active currency
  const auditRows = useMemo<AuditRow[]>(() => {
    const mapRows: Record<string, AuditRow> = {};

    const getKey = (ag: string, sis: string) => `${ag}___${sis}`;

    // 1. Process Carga Oficial
    salesOfficial.forEach((s: any) => {
      const mon = normalizarMoneda(s.moneda);
      if (mon !== activeCurrency) return;

      const ag = String(s.agencia || '').trim().toUpperCase();
      if (auditableAgencyNames.size > 0 && !auditableAgencyNames.has(ag)) return;

      const sis = String(s.sistema || 'GENERAL').trim().toUpperCase();
      const k = getKey(ag, sis);

      if (!mapRows[k]) {
        mapRows[k] = {
          agencia: ag,
          sistema: sis,
          venta_ofi: 0,
          venta_taq: 0,
          com_ofi: 0,
          com_taq: 0,
          prem_ofi: 0,
          prem_taq: 0,
          part_ofi: 0,
          part_taq: 0,
          gastos_ofi: 0,
          gastos_taq: 0,
          pagos_ofi: 0,
          pagos_taq: 0,
        };
      }

      mapRows[k].venta_ofi += Number(s.venta || 0);
      mapRows[k].com_ofi += Number(s.comision || 0);
      mapRows[k].prem_ofi += Number(s.premios || 0);
      mapRows[k].part_ofi += Number(s.util_ag || 0);
    });

    // 2. Process Taquilla Daily Reports
    salesTaquilla.forEach((s: any) => {
      const mon = normalizarMoneda(s.moneda);
      if (mon !== activeCurrency) return;

      const ag = String(s.nombre_agency || s.agencia || '').trim().toUpperCase();
      if (auditableAgencyNames.size > 0 && !auditableAgencyNames.has(ag)) return;

      const sis = String(s.sistema || 'GENERAL').trim().toUpperCase();
      const k = getKey(ag, sis);

      if (!mapRows[k]) {
        mapRows[k] = {
          agencia: ag,
          sistema: sis,
          venta_ofi: 0,
          venta_taq: 0,
          com_ofi: 0,
          com_taq: 0,
          prem_ofi: 0,
          prem_taq: 0,
          part_ofi: 0,
          part_taq: 0,
          gastos_ofi: 0,
          gastos_taq: 0,
          pagos_ofi: 0,
          pagos_taq: 0,
        };
      }

      const vTaq = Number(s.monto_venta || 0);
      const cTaq = Number(s.comision || 0);
      const pTaq = Number(s.monto_premios || 0);
      const pct = participationMap[ag] || 50;

      mapRows[k].venta_taq += vTaq;
      mapRows[k].com_taq += cTaq;
      mapRows[k].prem_taq += pTaq;
      mapRows[k].part_taq += Math.round((vTaq - cTaq - pTaq) * (pct / 100) * 100) / 100;
    });

    // 3. Process Gastos by Agency
    const gastosOfiByAg: Record<string, number> = {};
    expensesOfficial.forEach((g: any) => {
      const mon = normalizarMoneda(g.moneda);
      if (mon !== activeCurrency) return;
      const ag = String(g.agencia || '').trim().toUpperCase();
      gastosOfiByAg[ag] = (gastosOfiByAg[ag] || 0) + Number(g.monto || 0);
    });

    const gastosTaqByAg: Record<string, number> = {};
    expensesTaquilla.forEach((g: any) => {
      const mon = normalizarMoneda(g.moneda);
      if (mon !== activeCurrency) return;
      const ag = String(g.agencia || '').trim().toUpperCase();
      gastosTaqByAg[ag] = (gastosTaqByAg[ag] || 0) + Number(g.monto || 0);
    });

    // 4. Process Pagos by Agency
    const pagosOfiByAg: Record<string, number> = {};
    paymentsOfficial.forEach((p: any) => {
      const mon = normalizarMoneda(p.moneda);
      if (mon !== activeCurrency) return;
      const ag = String(p.agencia || '').trim().toUpperCase();
      pagosOfiByAg[ag] = (pagosOfiByAg[ag] || 0) + Number(p.monto || 0);
    });

    const pagosTaqByAg: Record<string, number> = {};
    paymentsTaquilla.forEach((p: any) => {
      const mon = normalizarMoneda(p.moneda);
      if (mon !== activeCurrency) return;
      const ag = String(p.agencia || '').trim().toUpperCase();
      pagosTaqByAg[ag] = (pagosTaqByAg[ag] || 0) + Number(p.monto || 0);
    });

    // Assign agency level expenses and payments to the first system of that agency
    const seenAgForExpenses = new Set<string>();
    const result = Object.values(mapRows);

    result.forEach((row) => {
      if (!seenAgForExpenses.has(row.agencia)) {
        row.gastos_ofi = gastosOfiByAg[row.agencia] || 0;
        row.gastos_taq = gastosTaqByAg[row.agencia] || 0;
        row.pagos_ofi = pagosOfiByAg[row.agencia] || 0;
        row.pagos_taq = pagosTaqByAg[row.agencia] || 0;
        seenAgForExpenses.add(row.agencia);
      }
    });

    return result.sort((a, b) => a.agencia.localeCompare(b.agencia) || a.sistema.localeCompare(b.sistema));
  }, [
    salesOfficial,
    salesTaquilla,
    expensesOfficial,
    expensesTaquilla,
    paymentsOfficial,
    paymentsTaquilla,
    activeCurrency,
    auditableAgencyNames,
    participationMap,
  ]);

  // System level difference metrics
  const systemMetrics = useMemo(() => {
    const systems = Array.from(new Set(auditRows.map((r) => r.sistema))).sort();

    return systems.map((sis) => {
      const rows = auditRows.filter((r) => r.sistema === sis);
      const vOfi = rows.reduce((acc, r) => acc + r.venta_ofi, 0);
      const vTaq = rows.reduce((acc, r) => acc + r.venta_taq, 0);
      const cOfi = rows.reduce((acc, r) => acc + r.com_ofi, 0);
      const cTaq = rows.reduce((acc, r) => acc + r.com_taq, 0);
      const pOfi = rows.reduce((acc, r) => acc + r.prem_ofi, 0);
      const pTaq = rows.reduce((acc, r) => acc + r.prem_taq, 0);

      return {
        sistema: sis,
        ventas: { ofi: vOfi, taq: vTaq, diff: vOfi - vTaq },
        comisiones: { ofi: cOfi, taq: cTaq, diff: cOfi - cTaq },
        premios: { ofi: pOfi, taq: pTaq, diff: pOfi - pTaq },
      };
    });
  }, [auditRows]);

  // Period totals
  const periodTotals = useMemo(() => {
    const vTot = auditRows.reduce((acc, r) => acc + r.venta_taq, 0);
    const cTot = auditRows.reduce((acc, r) => acc + r.com_taq, 0);
    const pTot = auditRows.reduce((acc, r) => acc + r.prem_taq, 0);
    const gTot = auditRows.reduce((acc, r) => acc + r.gastos_taq, 0);
    const pagTot = auditRows.reduce((acc, r) => acc + r.pagos_taq, 0);
    const sFinal = vTot - cTot - pTot - gTot - pagTot;

    return { vTot, cTot, pTot, gTot, pagTot, sFinal };
  }, [auditRows]);

  // Handlers for Taquilla Credentials
  const handleCreateTaquillaUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!effectiveUserId || !newUserAgencyId) return;

    if (!newUsuario.trim() || !newClave.trim()) {
      setMessage({ type: 'error', text: 'Usuario y clave requeridos.' });
      return;
    }

    setIsProcessing(true);
    try {
      const payload = {
        usuario: newUsuario.trim().toLowerCase(),
        clave: newClave.trim(),
        rol: newRol,
        agencia_id: newUserAgencyId,
        nombre_cajero: newNombreCajero.trim() || undefined,
        activo: true,
        user_id: effectiveUserId,
      };

      const { error } = await supabase.from('taquilla_usuarios').insert(payload);
      if (error) throw error;

      confetti({ particleCount: 35, spread: 60 });
      setMessage({ type: 'success', text: `Usuario '${newUsuario}' creado para la terminal.` });
      setNewUserAgencyId(null);
      setNewUsuario('');
      setNewClave('');
      setNewNombreCajero('');
      await loadData();
    } catch (err: any) {
      console.error('Error creating taquilla user:', err);
      setMessage({ type: 'error', text: err?.message || 'Error al crear usuario de taquilla.' });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUpdateTaquillaUser = async () => {
    if (!editingUser || !effectiveUserId) return;
    setIsProcessing(true);

    try {
      const payload: any = {
        rol: editRol,
        activo: editActivo,
      };
      if (editClave.trim()) {
        payload.clave = editClave.trim();
      }

      const { error } = await supabase
        .from('taquilla_usuarios')
        .update(payload)
        .eq('id', editingUser.id)
        .eq('user_id', effectiveUserId);

      if (error) throw error;

      setMessage({ type: 'success', text: `Usuario '${editingUser.usuario}' actualizado.` });
      setEditingUser(null);
      setEditClave('');
      await loadData();
    } catch (err: any) {
      console.error('Error updating taquilla user:', err);
      setMessage({ type: 'error', text: err?.message || 'Error al actualizar.' });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteTaquillaUser = async (userItem: TaquillaUser) => {
    if (!window.confirm(`¿Eliminar al usuario de taquilla '${userItem.usuario}'?`)) return;
    setIsProcessing(true);

    try {
      const { error } = await supabase
        .from('taquilla_usuarios')
        .delete()
        .eq('id', userItem.id)
        .eq('user_id', effectiveUserId);

      if (error) throw error;

      setMessage({ type: 'success', text: `Usuario '${userItem.usuario}' eliminado.` });
      await loadData();
    } catch (err: any) {
      console.error('Error deleting taquilla user:', err);
      setMessage({ type: 'error', text: err?.message || 'Error al eliminar.' });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="bg-gradient-to-r from-[#0D1B22] via-[#0F242C] to-[#0D1B22] border border-slate-800 rounded-3xl p-6 shadow-xl relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Auditoría Híbrida 360°</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
              Panel de Auditoría (Taquilla vs Carga Oficial)
            </h2>
            <p className="text-xs text-slate-400 max-w-xl">
              Comparativa por ciclo completo: cruce de ventas, comisiones, premios, gastos y cobros entre lo cargado en el CMS y lo reportado en vivo por las taquillas.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => loadData()}
              disabled={isLoading}
              className="p-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
              title="Actualizar datos"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-emerald-400' : ''}`} />
            </button>
          </div>
        </div>

        {/* Date Filter Strip */}
        <div className="mt-5 pt-4 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-slate-400 font-bold uppercase text-[10px]">Período de Auditoría:</span>
            <input
              type="date"
              value={fechaDesde}
              onChange={(e) => setFechaDesde(e.target.value)}
              className="bg-[#071217] border border-slate-700 rounded-xl px-2.5 py-1 text-white font-mono text-xs focus:outline-none focus:border-emerald-500"
            />
            <span className="text-slate-500">al</span>
            <input
              type="date"
              value={fechaHasta}
              onChange={(e) => setFechaHasta(e.target.value)}
              className="bg-[#071217] border border-slate-700 rounded-xl px-2.5 py-1 text-white font-mono text-xs focus:outline-none focus:border-emerald-500"
            />
          </div>

          <button
            onClick={() => {
              setFechaDesde(systemCycle.desde);
              setFechaHasta(systemCycle.hasta);
            }}
            className="text-emerald-400 hover:text-emerald-300 font-semibold flex items-center gap-1 cursor-pointer"
          >
            <Clock className="w-3.5 h-3.5" />
            Restablecer al Ciclo Actual ({systemCycle.desde} al {systemCycle.hasta})
          </button>
        </div>
      </div>

      {message && (
        <div
          className={`p-3.5 rounded-2xl border flex items-center gap-2.5 text-xs font-bold animate-fadeIn ${
            message.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
          }`}
        >
          {message.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
          <span>{message.text}</span>
        </div>
      )}

      {/* SECTION 1: CREDENTIALS MANAGER ACCORDION */}
      <div className="bg-[#0D1B22] border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
        <button
          onClick={() => setIsCredentialsOpen(!isCredentialsOpen)}
          className="w-full p-5 flex items-center justify-between text-left hover:bg-slate-800/40 transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <span>Gestión de Credenciales por Terminal de Taquilla</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 font-mono">
                  {taquillaUsers.length} cajeros registrados
                </span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Administra, crea y modifica las credenciales individuales de cajeros o supervisores por agencia.
              </p>
            </div>
          </div>
          <div className="text-slate-400">
            {isCredentialsOpen ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </div>
        </button>

        {isCredentialsOpen && (
          <div className="p-5 pt-0 border-t border-slate-800/80 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pt-3">
              {agencies.map((ag) => {
                const agUsers = taquillaUsers.filter((u) => u.agencia_id === ag.id);

                return (
                  <div key={ag.id} className="bg-[#071217] border border-slate-800 rounded-2xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-emerald-400" />
                        <span className="text-xs font-black text-white">{ag.nombre_agencia}</span>
                      </div>
                      <button
                        onClick={() => {
                          setNewUserAgencyId(ag.id);
                          setNewUsuario('');
                          setNewClave('');
                          setNewNombreCajero('');
                          setNewRol('cajero');
                        }}
                        className="px-2 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <Plus className="w-3 h-3" />
                        Nuevo
                      </button>
                    </div>

                    {/* New User Inline Form */}
                    {newUserAgencyId === ag.id && (
                      <form onSubmit={handleCreateTaquillaUser} className="p-3 rounded-xl bg-[#0D1B22] border border-slate-700 space-y-2.5">
                        <div className="text-[11px] font-bold text-white flex items-center justify-between">
                          <span>Crear Usuario en {ag.nombre_agencia}</span>
                          <button type="button" onClick={() => setNewUserAgencyId(null)} className="text-slate-400 hover:text-white">✕</button>
                        </div>
                        <input
                          type="text"
                          placeholder="Usuario (ej: cajero01)"
                          value={newUsuario}
                          onChange={(e) => setNewUsuario(e.target.value)}
                          required
                          className="w-full bg-[#071217] border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white"
                        />
                        <input
                          type="password"
                          placeholder="Contraseña"
                          value={newClave}
                          onChange={(e) => setNewClave(e.target.value)}
                          required
                          className="w-full bg-[#071217] border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white font-mono"
                        />
                        <input
                          type="text"
                          placeholder="Nombre del cajero (opcional)"
                          value={newNombreCajero}
                          onChange={(e) => setNewNombreCajero(e.target.value)}
                          className="w-full bg-[#071217] border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white"
                        />
                        <select
                          value={newRol}
                          onChange={(e) => setNewRol(e.target.value as any)}
                          className="w-full bg-[#071217] border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white"
                        >
                          <option value="cajero">Rol: Cajero</option>
                          <option value="supervisor">Rol: Supervisor</option>
                          <option value="agencia">Rol: Agencia</option>
                        </select>
                        <button
                          type="submit"
                          disabled={isProcessing}
                          className="w-full py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs"
                        >
                          Guardar Usuario
                        </button>
                      </form>
                    )}

                    {/* Users List for this Agency */}
                    <div className="space-y-1.5 max-h-48 overflow-y-auto">
                      {agUsers.length === 0 ? (
                        <p className="text-[11px] text-slate-500 italic py-2 text-center">Sin usuarios activos</p>
                      ) : (
                        agUsers.map((u) => {
                          const isSupervisor = u.rol === 'supervisor';
                          const isAgencia = u.rol === 'agencia';

                          return (
                            <div
                              key={u.id}
                              className="flex items-center justify-between p-2 rounded-xl bg-[#0D1B22]/80 border border-slate-800/80 text-xs"
                            >
                              <div>
                                <div className="font-mono font-bold text-slate-200 flex items-center gap-1.5">
                                  <span>{u.usuario}</span>
                                  <span
                                    className={`text-[9px] px-1.5 py-0.2 rounded font-sans font-black uppercase ${
                                      isAgencia
                                        ? 'bg-emerald-500/20 text-emerald-400'
                                        : isSupervisor
                                        ? 'bg-blue-500/20 text-blue-400'
                                        : 'bg-amber-500/20 text-amber-400'
                                    }`}
                                  >
                                    {u.rol}
                                  </span>
                                </div>
                                {u.nombre_cajero && (
                                  <span className="text-[10px] text-slate-400">{u.nombre_cajero}</span>
                                )}
                              </div>

                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => {
                                    setEditingUser(u);
                                    setEditRol(u.rol);
                                    setEditActivo(u.activo);
                                    setEditClave('');
                                  }}
                                  className="p-1 rounded text-slate-400 hover:text-white"
                                  title="Modificar"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => handleDeleteTaquillaUser(u)}
                                  className="p-1 rounded text-slate-400 hover:text-rose-400"
                                  title="Eliminar"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Edit User Modal */}
      {editingUser && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0D1B22] border border-slate-800 rounded-3xl p-6 max-w-sm w-full space-y-4 shadow-2xl">
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
              <Key className="w-4 h-4 text-emerald-400" />
              <span>Modificar Usuario: {editingUser.usuario}</span>
            </h4>

            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Rol</label>
              <select
                value={editRol}
                onChange={(e) => setEditRol(e.target.value as any)}
                className="w-full bg-[#071217] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
              >
                <option value="cajero">Cajero</option>
                <option value="supervisor">Supervisor</option>
                <option value="agencia">Agencia</option>
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Nueva Contraseña</label>
              <input
                type="password"
                placeholder="Dejar vacío = sin cambios"
                value={editClave}
                onChange={(e) => setEditClave(e.target.value)}
                className="w-full bg-[#071217] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono"
              />
            </div>

            <label className="flex items-center gap-2 text-xs text-slate-300">
              <input
                type="checkbox"
                checked={editActivo}
                onChange={(e) => setEditActivo(e.target.checked)}
                className="rounded border-slate-700 text-emerald-500"
              />
              <span>Usuario Activo</span>
            </label>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                className="flex-1 py-2 rounded-xl bg-slate-800 text-slate-300 font-bold text-xs"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleUpdateTaquillaUser}
                disabled={isProcessing}
                className="flex-1 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs"
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SECTION 2: COMPARATIVE AUDIT TABLE */}
      <div className="bg-[#0D1B22] border border-slate-800 rounded-3xl p-6 shadow-xl space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-extrabold text-white flex items-center gap-2">
              <span>⚖️</span>
              <span>Comparativa por Ciclo Completo</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Filtro por moneda activa • Diferencias calculadas: Oficial - Taquilla
            </p>
          </div>

          {/* Currency Switcher */}
          <div className="flex items-center gap-2 bg-[#071217] p-1.5 rounded-2xl border border-slate-800">
            {(['BS', 'USD', 'COP'] as const).map((mon) => (
              <button
                key={mon}
                onClick={() => setActiveCurrency(mon)}
                className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  activeCurrency === mon
                    ? 'bg-emerald-500 text-slate-950 shadow-md font-extrabold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {mon === 'BS' ? '🇻🇪 Bolívares (BS)' : mon === 'USD' ? '💵 Dólares (USD)' : '🇨🇴 Pesos (COP)'}
              </button>
            ))}
          </div>
        </div>

        {/* Audit Table */}
        {auditRows.length === 0 ? (
          <div className="text-center py-16 bg-[#071217] border border-slate-800/80 rounded-2xl">
            <CheckCircle2 className="w-10 h-10 text-emerald-400/60 mx-auto mb-2" />
            <h4 className="text-sm font-bold text-white">Sin movimientos auditables en {activeCurrency}</h4>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
              No se encontraron registros de ventas oficiales ni reportes de taquilla para este período en {activeCurrency}.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  <th className="py-3 px-3">Agencia</th>
                  <th className="py-3 px-3">Sistema</th>
                  <th className="py-3 px-3 text-right">Venta Ofi</th>
                  <th className="py-3 px-3 text-right">Venta Taq</th>
                  <th className="py-3 px-3 text-right">Com Ofi</th>
                  <th className="py-3 px-3 text-right">Com Taq</th>
                  <th className="py-3 px-3 text-right">Prem Ofi</th>
                  <th className="py-3 px-3 text-right">Prem Taq</th>
                  <th className="py-3 px-3 text-right">Part Ofi</th>
                  <th className="py-3 px-3 text-right">Part Taq</th>
                  <th className="py-3 px-3 text-right">Gto Ofi</th>
                  <th className="py-3 px-3 text-right">Gto Taq</th>
                  <th className="py-3 px-3 text-right">Pag Ofi</th>
                  <th className="py-3 px-3 text-right">Pag Taq</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {auditRows.map((r, idx) => (
                  <tr key={`${r.agencia}_${r.sistema}_${idx}`} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-2.5 px-3 font-bold font-sans text-white">{r.agencia}</td>
                    <td className="py-2.5 px-3 font-sans text-slate-300">
                      <span className="px-2 py-0.5 rounded bg-slate-800 text-[10px] font-bold">
                        {r.sistema}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right text-slate-300">{r.venta_ofi ? formatCurrency(r.venta_ofi, activeCurrency) : '-'}</td>
                    <td className="py-2.5 px-3 text-right text-sky-400 font-semibold">{r.venta_taq ? formatCurrency(r.venta_taq, activeCurrency) : '-'}</td>
                    <td className="py-2.5 px-3 text-right text-slate-400">{r.com_ofi ? formatCurrency(r.com_ofi, activeCurrency) : '-'}</td>
                    <td className="py-2.5 px-3 text-right text-slate-300">{r.com_taq ? formatCurrency(r.com_taq, activeCurrency) : '-'}</td>
                    <td className="py-2.5 px-3 text-right text-rose-400">{r.prem_ofi ? formatCurrency(r.prem_ofi, activeCurrency) : '-'}</td>
                    <td className="py-2.5 px-3 text-right text-rose-300 font-semibold">{r.prem_taq ? formatCurrency(r.prem_taq, activeCurrency) : '-'}</td>
                    <td className="py-2.5 px-3 text-right text-emerald-400">{r.part_ofi ? formatCurrency(r.part_ofi, activeCurrency) : '-'}</td>
                    <td className="py-2.5 px-3 text-right text-emerald-300 font-semibold">{r.part_taq ? formatCurrency(r.part_taq, activeCurrency) : '-'}</td>
                    <td className="py-2.5 px-3 text-right text-slate-400">{r.gastos_ofi ? formatCurrency(r.gastos_ofi, activeCurrency) : '-'}</td>
                    <td className="py-2.5 px-3 text-right text-slate-300">{r.gastos_taq ? formatCurrency(r.gastos_taq, activeCurrency) : '-'}</td>
                    <td className="py-2.5 px-3 text-right text-slate-400">{r.pagos_ofi ? formatCurrency(r.pagos_ofi, activeCurrency) : '-'}</td>
                    <td className="py-2.5 px-3 text-right text-slate-300">{r.pagos_taq ? formatCurrency(r.pagos_taq, activeCurrency) : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Totales y Diferencias por Sistema */}
        {systemMetrics.length > 0 && (
          <div className="space-y-3 pt-4 border-t border-slate-800">
            <h4 className="text-xs font-bold text-sky-400 uppercase tracking-wider">
              Totales por Sistema en {activeCurrency} (Diferencias Oficial vs Taquilla)
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {systemMetrics.map((sm) => (
                <div key={sm.sistema} className="bg-[#071217] border border-slate-800 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                    <span className="text-xs font-black text-white">{sm.sistema}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-sky-500/10 text-sky-400 font-bold">
                      {activeCurrency}
                    </span>
                  </div>

                  <div className="space-y-2 text-xs">
                    {/* Ventas */}
                    <div className="flex items-center justify-between font-mono">
                      <span className="text-slate-400 font-sans">Ventas:</span>
                      <div className="text-right">
                        <div className="text-white text-[11px]">Ofi: {formatCurrency(sm.ventas.ofi, activeCurrency)}</div>
                        <div className="text-sky-400 text-[11px]">Taq: {formatCurrency(sm.ventas.taq, activeCurrency)}</div>
                        <div className={`text-[10px] font-bold ${Math.abs(sm.ventas.diff) < 0.5 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {Math.abs(sm.ventas.diff) < 0.5 ? '✓ Cuadra' : `▲ Diff: ${formatCurrency(sm.ventas.diff, activeCurrency)}`}
                        </div>
                      </div>
                    </div>

                    {/* Premios */}
                    <div className="flex items-center justify-between font-mono pt-1 border-t border-slate-800/60">
                      <span className="text-slate-400 font-sans">Premios:</span>
                      <div className="text-right">
                        <div className="text-white text-[11px]">Ofi: {formatCurrency(sm.premios.ofi, activeCurrency)}</div>
                        <div className="text-rose-400 text-[11px]">Taq: {formatCurrency(sm.premios.taq, activeCurrency)}</div>
                        <div className={`text-[10px] font-bold ${Math.abs(sm.premios.diff) < 0.5 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {Math.abs(sm.premios.diff) < 0.5 ? '✓ Cuadra' : `▲ Diff: ${formatCurrency(sm.premios.diff, activeCurrency)}`}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* SECTION 3: DETAILED PERIOD SUMMARY (TAQUILLA TOTALS) */}
      <div className="bg-[#0D1B22] border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
        <h3 className="text-base font-extrabold text-white flex items-center gap-2">
          <span>📊</span>
          <span>Reporte Detallado del Período de Taquilla</span>
        </h3>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-2">
          <div className="bg-[#071217] border border-slate-800 rounded-2xl p-3.5 text-center">
            <span className="text-[10px] font-bold text-slate-400 uppercase">Total Ventas</span>
            <div className="text-base font-black text-sky-400 font-mono mt-1">
              {formatCurrency(periodTotals.vTot, activeCurrency)}
            </div>
          </div>

          <div className="bg-[#071217] border border-slate-800 rounded-2xl p-3.5 text-center">
            <span className="text-[10px] font-bold text-slate-400 uppercase">Total Comisión</span>
            <div className="text-base font-black text-slate-300 font-mono mt-1">
              {formatCurrency(periodTotals.cTot, activeCurrency)}
            </div>
          </div>

          <div className="bg-[#071217] border border-slate-800 rounded-2xl p-3.5 text-center">
            <span className="text-[10px] font-bold text-slate-400 uppercase">Total Premios</span>
            <div className="text-base font-black text-rose-400 font-mono mt-1">
              {formatCurrency(periodTotals.pTot, activeCurrency)}
            </div>
          </div>

          <div className="bg-[#071217] border border-slate-800 rounded-2xl p-3.5 text-center">
            <span className="text-[10px] font-bold text-slate-400 uppercase">Total Gastos</span>
            <div className="text-base font-black text-amber-400 font-mono mt-1">
              {formatCurrency(periodTotals.gTot, activeCurrency)}
            </div>
          </div>

          <div className="bg-[#071217] border border-slate-800 rounded-2xl p-3.5 text-center">
            <span className="text-[10px] font-bold text-slate-400 uppercase">Total Pagos</span>
            <div className="text-base font-black text-teal-400 font-mono mt-1">
              {formatCurrency(periodTotals.pagTot, activeCurrency)}
            </div>
          </div>

          <div className="bg-[#071217] border border-slate-800 rounded-2xl p-3.5 text-center">
            <span className="text-[10px] font-bold text-slate-400 uppercase">Saldo Final</span>
            <div className={`text-base font-black font-mono mt-1 ${periodTotals.sFinal >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {formatCurrency(periodTotals.sFinal, activeCurrency)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
export default AuditTab;
