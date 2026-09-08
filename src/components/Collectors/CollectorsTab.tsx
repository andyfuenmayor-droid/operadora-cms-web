import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { formatCurrency, formatDate } from '../../utils/formatters';
import type { Collector } from '../../types';
import {
  Bike,
  Users,
  UserPlus,
  MapPin,
  DollarSign,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Search,
  Filter,
  RefreshCw,
  QrCode,
  Building2,
  Phone,
  ShieldCheck,
  Trash2,
  Edit2,
  Key,
  Save,
  CheckCheck
} from 'lucide-react';
import confetti from 'canvas-confetti';

export const CollectorsTab: React.FC = () => {
  const { effectiveUserId, systemCycle, user } = useAuth();

  // Sub-tabs: 'list' | 'new' | 'routes' | 'settlement'
  const [activeTab, setActiveTab] = useState<'list' | 'new' | 'routes' | 'settlement'>('list');

  // Loaded data
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [collectors, setCollectors] = useState<Collector[]>([]);
  const [agenciesList, setAgenciesList] = useState<{ id: number; nombre: string }[]>([]);
  const [routesMap, setRoutesMap] = useState<Record<number, string[]>>({});
  const [qrPayments, setQrPayments] = useState<any[]>([]);

  // Search & Filters in Tab 1
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  // New Collector Form (Tab 2)
  const [newNombre, setNewNombre] = useState('');
  const [newCedula, setNewCedula] = useState('');
  const [newTelefono, setNewTelefono] = useState('');
  const [newUsuario, setNewUsuario] = useState('');
  const [newClave, setNewClave] = useState('');
  const [newClaveConfirm, setNewClaveConfirm] = useState('');
  const [newActivo, setNewActivo] = useState(true);
  const [newSelectedAgencies, setNewSelectedAgencies] = useState<string[]>([]);
  const [isSubmittingNew, setIsSubmittingNew] = useState(false);

  // Edit Collector Modal
  const [editCollectorItem, setEditCollectorItem] = useState<Collector | null>(null);
  const [editNombre, setEditNombre] = useState('');
  const [editCedula, setEditCedula] = useState('');
  const [editTelefono, setEditTelefono] = useState('');
  const [editActivo, setEditActivo] = useState(true);
  const [editClave, setEditClave] = useState('');

  // Delete Collector Modal
  const [deleteCollectorItem, setDeleteCollectorItem] = useState<Collector | null>(null);

  // Route Assignment Tab (Tab 3)
  const [selectedCollectorForRoute, setSelectedCollectorForRoute] = useState<number | null>(null);
  const [assignedAgenciesForRoute, setAssignedAgenciesForRoute] = useState<string[]>([]);
  const [isSavingRoute, setIsSavingRoute] = useState(false);

  // QR Liquidations Tab (Tab 4) Filters
  const [liqFechaDesde, setLiqFechaDesde] = useState(systemCycle.desde);
  const [liqFechaHasta, setLiqFechaHasta] = useState(systemCycle.hasta);
  const [liqStatusFilter, setLiqStatusFilter] = useState<'all' | 'pending' | 'scanned' | 'liquidated'>('all');
  const [liqCollectorFilter, setLiqCollectorFilter] = useState('ALL');

  // Feedback message
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Load everything
  const loadData = async () => {
    if (!effectiveUserId) return;
    setIsLoading(true);
    setMessage(null);

    try {
      // 1. Fetch Agencies
      const { data: agData } = await supabase
        .from('agencias')
        .select('id, nombre_agencia')
        .eq('user_id', effectiveUserId);

      const ags = (agData || [])
        .map((a: any) => ({
          id: a.id,
          nombre: String(a.nombre_agencia || '').trim().toUpperCase(),
        }))
        .filter((a) => Boolean(a.nombre));
      setAgenciesList(ags);

      // 2. Fetch Collectors
      const { data: cobData, error: cobErr } = await supabase
        .from('cda_cobradores')
        .select('*')
        .eq('user_id', effectiveUserId)
        .order('id', { ascending: false });

      if (cobErr) throw cobErr;
      setCollectors(cobData || []);

      if (cobData && cobData.length > 0 && selectedCollectorForRoute === null) {
        setSelectedCollectorForRoute(cobData[0].id);
      }

      // 3. Fetch Assigned Routes
      const { data: routeData } = await supabase
        .from('cda_cobrador_agencias')
        .select('cobrador_id, nombre_agencia')
        .eq('user_id', effectiveUserId);

      const rMap: Record<number, string[]> = {};
      (routeData || []).forEach((r: any) => {
        const cid = r.cobrador_id;
        const agName = String(r.nombre_agencia || '').trim().toUpperCase();
        if (!rMap[cid]) rMap[cid] = [];
        if (agName && !rMap[cid].includes(agName)) {
          rMap[cid].push(agName);
        }
      });
      setRoutesMap(rMap);

      // 4. Fetch QR Payments
      const { data: qrData } = await supabase
        .from('cda_pagos_diarios')
        .select('*')
        .eq('user_id', effectiveUserId)
        .order('id', { ascending: false });

      const filteredQr = (qrData || []).filter((r: any) => {
        return Boolean(r.qr_token) || String(r.tipo_pago || '').toUpperCase().includes('COBRADOR');
      });
      setQrPayments(filteredQr);
    } catch (err: any) {
      console.error('Error loading collectors data:', err);
      setMessage({ type: 'error', text: err?.message || 'Error al cargar los datos de cobradores.' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [effectiveUserId]);

  // Sync route assignment when selectedCollectorForRoute changes
  useEffect(() => {
    if (selectedCollectorForRoute !== null) {
      setAssignedAgenciesForRoute(routesMap[selectedCollectorForRoute] || []);
    }
  }, [selectedCollectorForRoute, routesMap]);

  // Filtered collectors for Tab 1
  const filteredCollectors = useMemo(() => {
    return collectors.filter((c) => {
      if (statusFilter === 'active' && !c.activo) return false;
      if (statusFilter === 'inactive' && c.activo) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const routes = (routesMap[c.id] || []).join(' ').toLowerCase();
        const match =
          c.nombre.toLowerCase().includes(q) ||
          c.usuario.toLowerCase().includes(q) ||
          String(c.cedula_identidad || '').toLowerCase().includes(q) ||
          String(c.telefono || '').toLowerCase().includes(q) ||
          routes.includes(q);
        if (!match) return false;
      }

      return true;
    });
  }, [collectors, statusFilter, searchQuery, routesMap]);

  // Register New Collector (Tab 2)
  const handleRegisterNew = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!effectiveUserId) return;

    if (!newNombre.trim() || !newCedula.trim() || !newTelefono.trim() || !newUsuario.trim() || !newClave.trim()) {
      setMessage({ type: 'error', text: 'Todos los campos obligatorios deben completarse.' });
      return;
    }

    if (newClave.length < 4) {
      setMessage({ type: 'error', text: 'La contraseña debe tener al menos 4 caracteres.' });
      return;
    }

    if (newClave !== newClaveConfirm) {
      setMessage({ type: 'error', text: 'Las contraseñas no coinciden.' });
      return;
    }

    setIsSubmittingNew(true);
    setMessage(null);

    try {
      // 1. Verify unique username
      const { data: existing } = await supabase
        .from('cda_cobradores')
        .select('id')
        .eq('usuario', newUsuario.trim().toLowerCase());

      if (existing && existing.length > 0) {
        setMessage({ type: 'error', text: `El usuario @${newUsuario} ya está en uso. Elija otro.` });
        setIsSubmittingNew(false);
        return;
      }

      // 2. Insert collector
      const payload = {
        user_id: effectiveUserId,
        nombre: newNombre.trim(),
        cedula_identidad: newCedula.trim(),
        telefono: newTelefono.trim(),
        usuario: newUsuario.trim().toLowerCase(),
        clave: newClave.trim(),
        activo: newActivo,
      };

      const { data: inserted, error: insErr } = await supabase
        .from('cda_cobradores')
        .insert(payload)
        .select()
        .single();

      if (insErr) throw insErr;

      // 3. Assign initial routes if selected
      if (newSelectedAgencies.length > 0 && inserted) {
        const routesPayload = newSelectedAgencies.map((agName) => {
          const agObj = agenciesList.find((a) => a.nombre === agName);
          return {
            user_id: effectiveUserId,
            cobrador_id: inserted.id,
            agencia_id: agObj?.id || null,
            nombre_agencia: agName,
          };
        });

        await supabase.from('cda_cobrador_agencias').insert(routesPayload);
      }

      confetti({ particleCount: 50, spread: 60 });
      setMessage({ type: 'success', text: `¡Cobrador ${newNombre} (@${newUsuario}) registrado exitosamente!` });

      // Reset form
      setNewNombre('');
      setNewCedula('');
      setNewTelefono('');
      setNewUsuario('');
      setNewClave('');
      setNewClaveConfirm('');
      setNewSelectedAgencies([]);

      await loadData();
      setActiveTab('list');
    } catch (err: any) {
      console.error('Error creating collector:', err);
      setMessage({ type: 'error', text: err?.message || 'Error al registrar el cobrador.' });
    } finally {
      setIsSubmittingNew(false);
    }
  };

  // Open Edit Modal
  const handleOpenEdit = (c: Collector) => {
    setEditCollectorItem(c);
    setEditNombre(c.nombre);
    setEditCedula(c.cedula_identidad || '');
    setEditTelefono(c.telefono || '');
    setEditActivo(c.activo);
    setEditClave('');
  };

  // Submit Edit
  const handleSubmitEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editCollectorItem || !effectiveUserId) return;

    if (!editNombre.trim()) {
      setMessage({ type: 'error', text: 'El nombre no puede estar vacío.' });
      return;
    }

    setIsProcessing(true);

    try {
      const payload: any = {
        nombre: editNombre.trim(),
        cedula_identidad: editCedula.trim(),
        telefono: editTelefono.trim(),
        activo: editActivo,
      };

      if (editClave.trim()) {
        if (editClave.trim().length < 4) {
          setMessage({ type: 'error', text: 'La nueva contraseña debe tener al menos 4 caracteres.' });
          setIsProcessing(false);
          return;
        }
        payload.clave = editClave.trim();
      }

      const { error } = await supabase
        .from('cda_cobradores')
        .update(payload)
        .eq('id', editCollectorItem.id)
        .eq('user_id', effectiveUserId);

      if (error) throw error;

      setMessage({ type: 'success', text: `Cobrador ${editNombre} actualizado correctamente.` });
      setEditCollectorItem(null);
      await loadData();
    } catch (err: any) {
      console.error('Error updating collector:', err);
      setMessage({ type: 'error', text: err?.message || 'Error al actualizar.' });
    } finally {
      setIsProcessing(false);
    }
  };

  // Submit Delete
  const handleSubmitDelete = async () => {
    if (!deleteCollectorItem || !effectiveUserId) return;
    setIsProcessing(true);

    try {
      // 1. Delete route assignments
      await supabase
        .from('cda_cobrador_agencias')
        .delete()
        .eq('cobrador_id', deleteCollectorItem.id)
        .eq('user_id', effectiveUserId);

      // 2. Delete collector
      await supabase
        .from('cda_cobradores')
        .delete()
        .eq('id', deleteCollectorItem.id)
        .eq('user_id', effectiveUserId);

      setMessage({ type: 'success', text: `Cobrador ${deleteCollectorItem.nombre} eliminado con éxito.` });
      setDeleteCollectorItem(null);
      await loadData();
    } catch (err: any) {
      console.error('Error deleting collector:', err);
      setMessage({ type: 'error', text: err?.message || 'Error al eliminar el cobrador.' });
    } finally {
      setIsProcessing(false);
    }
  };

  // Save Route Assignment (Tab 3)
  const handleSaveRoute = async () => {
    if (!selectedCollectorForRoute || !effectiveUserId) return;
    setIsSavingRoute(true);

    try {
      // 1. Remove previous assignments
      await supabase
        .from('cda_cobrador_agencias')
        .delete()
        .eq('cobrador_id', selectedCollectorForRoute)
        .eq('user_id', effectiveUserId);

      // 2. Insert newly selected agencies
      if (assignedAgenciesForRoute.length > 0) {
        const payload = assignedAgenciesForRoute.map((agName) => {
          const agObj = agenciesList.find((a) => a.nombre === agName);
          return {
            user_id: effectiveUserId,
            cobrador_id: selectedCollectorForRoute,
            agencia_id: agObj?.id || null,
            nombre_agencia: agName,
          };
        });

        await supabase.from('cda_cobrador_agencias').insert(payload);
      }

      confetti({ particleCount: 40, spread: 60 });
      setMessage({ type: 'success', text: '¡Asignación de ruta actualizada exitosamente!' });
      await loadData();
    } catch (err: any) {
      console.error('Error saving routes:', err);
      setMessage({ type: 'error', text: err?.message || 'Error al guardar la ruta.' });
    } finally {
      setIsSavingRoute(false);
    }
  };

  // Settle QR Payment to Admin (Tab 4)
  const handleSettleQrToAdmin = async (paymentItem: any) => {
    if (!effectiveUserId) return;
    if (!window.confirm(`¿Liquidar a Administración el pago de ${paymentItem.moneda} ${paymentItem.monto} de ${paymentItem.agencia}?`)) return;

    setIsProcessing(true);

    try {
      const nowStr = new Date().toISOString();
      const adminName = user?.nombre || user?.email?.split('@')[0] || 'Administración';

      // 1. Update cda_pagos_diarios
      await supabase
        .from('cda_pagos_diarios')
        .update({
          liquidado_admin: true,
          fecha_liquidacion_admin: nowStr,
          confirmado: true,
        })
        .eq('id', paymentItem.id);

      // 2. Insert into cda_caja_efectivo_supervisor as settled
      await supabase.from('cda_caja_efectivo_supervisor').insert({
        user_id: effectiveUserId,
        pago_id: paymentItem.id,
        agencia: paymentItem.agencia,
        supervisor_nombre: paymentItem.cobrador_nombre || 'Cobrador de Ruta',
        tipo_movimiento: 'ENTREGA_COBRADOR',
        monto: paymentItem.monto,
        moneda: paymentItem.moneda,
        comentario: `Liquidación de efectivo PIN: ${paymentItem.qr_token || paymentItem.id} [Recibido en Caja Central por: ${adminName}]`,
      });

      confetti({ particleCount: 35, spread: 50 });
      setMessage({ type: 'success', text: '¡Recaudación QR liquidada a Administración exitosamente!' });
      await loadData();
    } catch (err: any) {
      console.error('Error settling QR payment:', err);
      setMessage({ type: 'error', text: err?.message || 'Error al liquidar el pago QR.' });
    } finally {
      setIsProcessing(false);
    }
  };

  // QR Payments filtered
  const filteredQrPayments = useMemo(() => {
    return qrPayments.filter((item) => {
      const f = (item.fecha || item.created_at || '').slice(0, 10);
      if (liqFechaDesde && f < liqFechaDesde) return false;
      if (liqFechaHasta && f > liqFechaHasta) return false;

      if (liqCollectorFilter !== 'ALL' && item.cobrador_nombre !== liqCollectorFilter) return false;

      if (liqStatusFilter === 'pending' && (item.liquidado_admin || item.fecha_escaneo_cobrador)) return false;
      if (liqStatusFilter === 'scanned' && (!item.fecha_escaneo_cobrador || item.liquidado_admin)) return false;
      if (liqStatusFilter === 'liquidated' && !item.liquidado_admin) return false;

      return true;
    });
  }, [qrPayments, liqFechaDesde, liqFechaHasta, liqCollectorFilter, liqStatusFilter]);

  // Agency Coverage Matrix (Tab 3)
  const coverageMatrix = useMemo(() => {
    const collectorNameMap: Record<number, string> = {};
    collectors.forEach((c) => {
      collectorNameMap[c.id] = `${c.nombre} (@${c.usuario})`;
    });

    return agenciesList.map((ag) => {
      const assigned: string[] = [];
      Object.entries(routesMap).forEach(([cidStr, ags]) => {
        if (ags.includes(ag.nombre)) {
          assigned.push(collectorNameMap[Number(cidStr)] || `Cobrador ${cidStr}`);
        }
      });

      return {
        agencia: ag.nombre,
        cobradores: assigned,
        cubierta: assigned.length > 0,
      };
    });
  }, [agenciesList, routesMap, collectors]);

  // KPIs
  const totalCollectors = collectors.length;
  const activeCount = collectors.filter((c) => c.activo).length;
  const inactiveCount = totalCollectors - activeCount;
  const totalAgenciesInRoute = Object.values(routesMap).reduce((acc, curr) => acc + curr.length, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2">
            <span className="p-2 rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20">
              <Bike className="w-5 h-5" />
            </span>
            Gestión y Liquidación de Cobradores
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Administración centralizada de cobradores de ruta, asignación de agencias y control de liquidación de recaudaciones QR.
          </p>
        </div>

        <button
          onClick={() => loadData()}
          disabled={isLoading}
          className="px-4 py-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex items-center gap-2 transition-all border border-slate-700 cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          Sincronizar
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

      {/* Sub-tabs Bar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 pb-3">
        <button
          onClick={() => setActiveTab('list')}
          className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-all cursor-pointer ${
            activeTab === 'list'
              ? 'bg-sky-500/10 text-sky-400 border border-sky-500/30'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <Users className="w-4 h-4" />
          Cobradores Registrados
          <span className="px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-400 text-[10px] font-mono font-bold">
            {totalCollectors}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('new')}
          className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-all cursor-pointer ${
            activeTab === 'new'
              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <UserPlus className="w-4 h-4" />
          Registrar Nuevo
        </button>

        <button
          onClick={() => setActiveTab('routes')}
          className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-all cursor-pointer ${
            activeTab === 'routes'
              ? 'bg-purple-500/10 text-purple-400 border border-purple-500/30'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <MapPin className="w-4 h-4" />
          Asignación de Rutas
        </button>

        <button
          onClick={() => setActiveTab('settlement')}
          className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-all cursor-pointer ${
            activeTab === 'settlement'
              ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <QrCode className="w-4 h-4" />
          Liquidación de Recaudaciones QR
          <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 text-[10px] font-mono font-bold">
            {qrPayments.length}
          </span>
        </button>
      </div>

      {/* =========================================================================
          TAB 1: COBRADORES REGISTRADOS
      ========================================================================= */}
      {activeTab === 'list' && (
        <div className="space-y-6">
          {/* KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-[#0D1B22] border border-slate-800 rounded-2xl p-4 text-center">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total Cobradores</div>
              <div className="text-xl font-black text-sky-400 mt-1 flex items-center justify-center gap-1">
                <Bike className="w-4 h-4" />
                {totalCollectors}
              </div>
            </div>

            <div className="bg-[#0D1B22] border border-slate-800 rounded-2xl p-4 text-center">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Activos en Servicio</div>
              <div className="text-xl font-black text-emerald-400 mt-1 flex items-center justify-center gap-1">
                <CheckCircle2 className="w-4 h-4" />
                {activeCount}
              </div>
            </div>

            <div className="bg-[#0D1B22] border border-slate-800 rounded-2xl p-4 text-center">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Inactivos / Pausa</div>
              <div className="text-xl font-black text-rose-400 mt-1 flex items-center justify-center gap-1">
                <XCircle className="w-4 h-4" />
                {inactiveCount}
              </div>
            </div>

            <div className="bg-[#0D1B22] border border-slate-800 rounded-2xl p-4 text-center">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Agencias en Ruta</div>
              <div className="text-xl font-black text-amber-400 mt-1 flex items-center justify-center gap-1">
                <Building2 className="w-4 h-4" />
                {totalAgenciesInRoute}
              </div>
            </div>
          </div>

          {/* Search & Filter Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-[#0D1B22] border border-slate-800 rounded-2xl p-4">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar por nombre, @usuario, cédula..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#071217] border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-xs text-white focus:outline-none focus:border-sky-500"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <span className="text-xs text-slate-400 shrink-0">Filtrar:</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="bg-[#071217] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-500"
              >
                <option value="all">Todos los Estados</option>
                <option value="active">Solo Activos</option>
                <option value="inactive">Solo Inactivos</option>
              </select>
            </div>
          </div>

          {/* Collectors List */}
          {isLoading ? (
            <div className="text-center py-16 bg-[#0D1B22] border border-slate-800 rounded-3xl">
              <RefreshCw className="w-8 h-8 text-sky-400 animate-spin mx-auto mb-3" />
              <p className="text-sm text-slate-400 font-medium">Cargando cobradores...</p>
            </div>
          ) : filteredCollectors.length === 0 ? (
            <div className="text-center py-16 bg-[#0D1B22] border border-slate-800 rounded-3xl space-y-3">
              <Bike className="w-12 h-12 text-slate-600 mx-auto" />
              <h4 className="text-base font-bold text-white">No se encontraron cobradores</h4>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                Registra un nuevo cobrador desde la pestaña correspondiente para habilitar recaudaciones por ruta.
              </p>
              <button
                onClick={() => setActiveTab('new')}
                className="px-4 py-2 rounded-xl bg-sky-500/20 text-sky-400 border border-sky-500/30 text-xs font-bold hover:bg-sky-500/30 cursor-pointer transition-all inline-flex items-center gap-1.5"
              >
                <UserPlus className="w-3.5 h-3.5" />
                Registrar Primer Cobrador
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredCollectors.map((c) => {
                const assignedAgs = routesMap[c.id] || [];

                return (
                  <div
                    key={c.id}
                    className="bg-[#0D1B22] border border-slate-800 hover:border-slate-700 rounded-2xl p-4 sm:p-5 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
                  >
                    {/* Collector Info */}
                    <div className="space-y-1.5 flex-1">
                      <div className="flex items-center gap-2.5">
                        <span className="text-base font-black text-white">{c.nombre}</span>

                        {c.activo ? (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 text-[10px] font-bold border border-emerald-500/30 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            ACTIVO
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-400 text-[10px] font-bold border border-rose-500/30">
                            INACTIVO
                          </span>
                        )}
                      </div>

                      <div className="text-xs text-slate-400 flex flex-wrap items-center gap-3">
                        <span>
                          Usuario: <strong className="text-sky-400 font-mono">@{c.usuario}</strong>
                        </span>
                        <span>• Cédula: <strong className="text-slate-300">{c.cedula_identidad || 'N/A'}</strong></span>
                        <span>• Teléfono: <strong className="text-slate-300">{c.telefono || 'N/A'}</strong></span>
                        <span>• Registro: <strong className="text-slate-500">{formatDate(c.created_at)}</strong></span>
                      </div>

                      {/* Routes Chips */}
                      <div className="pt-1 flex flex-wrap items-center gap-1.5">
                        <span className="text-[11px] font-bold text-slate-400 mr-1">Ruta ({assignedAgs.length}):</span>
                        {assignedAgs.length > 0 ? (
                          assignedAgs.map((ag) => (
                            <span
                              key={ag}
                              className="px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-400 text-[10px] font-semibold border border-blue-500/20"
                            >
                              🏢 {ag}
                            </span>
                          ))
                        ) : (
                          <span className="text-[11px] text-amber-400/80 italic">⚠️ Sin agencias asignadas</span>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 pt-3 md:pt-0 border-t md:border-t-0 border-slate-800 justify-end">
                      <button
                        onClick={() => handleOpenEdit(c)}
                        className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex items-center gap-1.5 transition-all border border-slate-700 cursor-pointer"
                      >
                        <Edit2 className="w-3.5 h-3.5 text-cyan-400" />
                        Editar
                      </button>

                      <button
                        onClick={() => setDeleteCollectorItem(c)}
                        className="px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs font-semibold flex items-center gap-1.5 transition-all border border-rose-500/20 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Borrar
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* =========================================================================
          TAB 2: REGISTRAR NUEVO COBRADOR
      ========================================================================= */}
      {activeTab === 'new' && (
        <div className="max-w-3xl mx-auto bg-[#0D1B22] border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl">
          <div className="flex items-center gap-3 mb-6 pb-4 border-b border-slate-800">
            <div className="p-3 rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <UserPlus className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Registrar Nuevo Cobrador de Ruta</h3>
              <p className="text-xs text-slate-400">
                Crea credenciales de acceso para que el cobrador se autentique y liquide pagos QR en agencias.
              </p>
            </div>
          </div>

          <form onSubmit={handleRegisterNew} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Personal Data */}
              <div className="space-y-4">
                <h4 className="text-xs font-bold uppercase text-slate-400 tracking-wider">
                  👤 Datos Personales
                </h4>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">Nombre Completo *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej: Carlos Mendoza"
                    value={newNombre}
                    onChange={(e) => setNewNombre(e.target.value)}
                    className="w-full bg-[#071217] border border-slate-700 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">Cédula de Identidad *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej: V-12345678"
                    value={newCedula}
                    onChange={(e) => setNewCedula(e.target.value)}
                    className="w-full bg-[#071217] border border-slate-700 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">Teléfono / WhatsApp *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej: 04141234567"
                    value={newTelefono}
                    onChange={(e) => setNewTelefono(e.target.value)}
                    className="w-full bg-[#071217] border border-slate-700 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* Login Credentials */}
              <div className="space-y-4">
                <h4 className="text-xs font-bold uppercase text-slate-400 tracking-wider">
                  🔐 Credenciales de Acceso
                </h4>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">Usuario (Login) *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej: cmendoza"
                    value={newUsuario}
                    onChange={(e) => setNewUsuario(e.target.value)}
                    className="w-full bg-[#071217] border border-slate-700 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">Contraseña *</label>
                  <input
                    type="password"
                    required
                    placeholder="Mínimo 4 caracteres"
                    value={newClave}
                    onChange={(e) => setNewClave(e.target.value)}
                    className="w-full bg-[#071217] border border-slate-700 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">Confirmar Contraseña *</label>
                  <input
                    type="password"
                    required
                    placeholder="Repita la contraseña"
                    value={newClaveConfirm}
                    onChange={(e) => setNewClaveConfirm(e.target.value)}
                    className="w-full bg-[#071217] border border-slate-700 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="pt-2">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-300">
                    <input
                      type="checkbox"
                      checked={newActivo}
                      onChange={(e) => setNewActivo(e.target.checked)}
                      className="w-4 h-4 rounded text-emerald-500 focus:ring-0 bg-[#071217] border-slate-700"
                    />
                    Cobrador Activo inmediatamente
                  </label>
                </div>
              </div>
            </div>

            {/* Initial Route Assignment */}
            <div className="pt-4 border-t border-slate-800 space-y-3">
              <h4 className="text-xs font-bold uppercase text-slate-400 tracking-wider flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-purple-400" />
                Asignación Inicial de Ruta (Opcional)
              </h4>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto p-2 bg-[#071217] rounded-xl border border-slate-800">
                {agenciesList.map((ag) => {
                  const isChecked = newSelectedAgencies.includes(ag.nombre);
                  return (
                    <label
                      key={ag.id}
                      className={`flex items-center gap-2 p-2 rounded-lg text-xs cursor-pointer transition-colors ${
                        isChecked
                          ? 'bg-purple-500/15 text-purple-300 font-semibold'
                          : 'text-slate-400 hover:bg-slate-800/50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setNewSelectedAgencies([...newSelectedAgencies, ag.nombre]);
                          } else {
                            setNewSelectedAgencies(newSelectedAgencies.filter((a) => a !== ag.nombre));
                          }
                        }}
                        className="rounded text-purple-500 bg-slate-900 border-slate-700 focus:ring-0"
                      />
                      <span className="truncate">{ag.nombre}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end pt-4 border-t border-slate-800">
              <button
                type="submit"
                disabled={isSubmittingNew}
                className="px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-bold text-xs shadow-lg shadow-emerald-500/20 flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {isSubmittingNew ? 'Registrando...' : 'Registrar Cobrador'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* =========================================================================
          TAB 3: ASIGNACIÓN DE RUTAS
      ========================================================================= */}
      {activeTab === 'routes' && (
        <div className="space-y-6">
          <div className="bg-[#0D1B22] border border-slate-800 rounded-3xl p-6 shadow-xl space-y-5">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <MapPin className="w-5 h-5 text-purple-400" />
                Asignación de Rutas por Cobrador
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Selecciona el cobrador para vincular o actualizar las agencias bajo su responsabilidad de cobranza.
              </p>
            </div>

            {/* Collector Selector */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300">Seleccionar Cobrador:</label>
              <select
                value={selectedCollectorForRoute || ''}
                onChange={(e) => setSelectedCollectorForRoute(Number(e.target.value))}
                className="w-full sm:w-80 bg-[#071217] border border-slate-700 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-purple-500"
              >
                {collectors.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.activo ? '🟢' : '🔴'} {c.nombre} (@{c.usuario})
                  </option>
                ))}
              </select>
            </div>

            {/* Agencies Checklist */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase text-slate-400 tracking-wider">
                  Agencias asignadas ({assignedAgenciesForRoute.length} de {agenciesList.length})
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setAssignedAgenciesForRoute(agenciesList.map((a) => a.nombre))}
                    className="text-[11px] text-purple-400 hover:text-purple-300 font-semibold"
                  >
                    Seleccionar Todas
                  </button>
                  <span className="text-slate-600">|</span>
                  <button
                    type="button"
                    onClick={() => setAssignedAgenciesForRoute([])}
                    className="text-[11px] text-slate-400 hover:text-slate-300"
                  >
                    Limpiar
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 p-4 bg-[#071217] rounded-2xl border border-slate-800">
                {agenciesList.map((ag) => {
                  const isChecked = assignedAgenciesForRoute.includes(ag.nombre);
                  return (
                    <label
                      key={ag.id}
                      className={`flex items-center gap-2 p-2.5 rounded-xl text-xs cursor-pointer transition-colors border ${
                        isChecked
                          ? 'bg-purple-500/15 border-purple-500/30 text-purple-300 font-bold'
                          : 'border-transparent text-slate-400 hover:bg-slate-800/40'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setAssignedAgenciesForRoute([...assignedAgenciesForRoute, ag.nombre]);
                          } else {
                            setAssignedAgenciesForRoute(assignedAgenciesForRoute.filter((a) => a !== ag.nombre));
                          }
                        }}
                        className="rounded text-purple-500 bg-slate-900 border-slate-700 focus:ring-0"
                      />
                      <span className="truncate">{ag.nombre}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end">
              <button
                onClick={handleSaveRoute}
                disabled={isSavingRoute}
                className="px-6 py-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs shadow-lg shadow-purple-600/20 flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {isSavingRoute ? 'Guardando...' : 'Guardar Asignación de Ruta'}
              </button>
            </div>
          </div>

          {/* Coverage Matrix Table */}
          <div className="bg-[#0D1B22] border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
            <div className="p-4 sm:p-6 border-b border-slate-800">
              <h4 className="text-sm font-bold text-white uppercase tracking-wider">
                Matriz General de Cobertura de Agencias
              </h4>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#071217] text-slate-400 border-b border-slate-800 font-bold uppercase tracking-wider">
                  <tr>
                    <th className="py-3.5 px-4">Agencia</th>
                    <th className="py-3.5 px-4">Cobradores Asignados</th>
                    <th className="py-3.5 px-4 text-center">Estado de Cobertura</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {coverageMatrix.map((row) => (
                    <tr key={row.agencia} className="hover:bg-slate-800/30 transition-colors">
                      <td className="py-3.5 px-4 font-bold text-white flex items-center gap-2">
                        <Building2 className="w-3.5 h-3.5 text-slate-400" />
                        {row.agencia}
                      </td>
                      <td className="py-3.5 px-4 text-slate-300">
                        {row.cobradores.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {row.cobradores.map((cn) => (
                              <span
                                key={cn}
                                className="px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-400 text-[10px] font-semibold border border-purple-500/20"
                              >
                                {cn}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-amber-400/80 italic text-[11px]">⚠️ Sin cobrador asignado</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        {row.cubierta ? (
                          <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 text-[10px] font-bold border border-emerald-500/30">
                            Cubierta
                          </span>
                        ) : (
                          <span className="px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 text-[10px] font-bold border border-amber-500/30">
                            Sin Cobertura
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 4: LIQUIDACIÓN DE RECAUDACIONES QR
      ========================================================================= */}
      {activeTab === 'settlement' && (
        <div className="space-y-6">
          {/* Header */}
          <div className="bg-[#0D1B22] border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <QrCode className="w-5 h-5 text-amber-400" />
              Liquidación de Recaudaciones QR de Cobradores
            </h3>
            <p className="text-xs text-slate-400">
              Monitorea los pagos de taquilla registrados con token QR, valida los escaneos en ruta y liquida los fondos recaudados a la administración central.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-2">
              <div className="space-y-1">
                <label className="text-[11px] font-bold uppercase text-slate-400">Desde</label>
                <input
                  type="date"
                  value={liqFechaDesde}
                  onChange={(e) => setLiqFechaDesde(e.target.value)}
                  className="w-full bg-[#071217] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold uppercase text-slate-400">Hasta</label>
                <input
                  type="date"
                  value={liqFechaHasta}
                  onChange={(e) => setLiqFechaHasta(e.target.value)}
                  className="w-full bg-[#071217] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold uppercase text-slate-400">Filtrar por Estado</label>
                <select
                  value={liqStatusFilter}
                  onChange={(e) => setLiqStatusFilter(e.target.value as any)}
                  className="w-full bg-[#071217] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                >
                  <option value="all">Todos los Estados</option>
                  <option value="pending">⏳ Pendientes de Escaneo</option>
                  <option value="scanned">🛵 Escaneados en Ruta (Por Liquidar)</option>
                  <option value="liquidated">💰 Liquidados a Admin</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold uppercase text-slate-400">Cobrador</label>
                <select
                  value={liqCollectorFilter}
                  onChange={(e) => setLiqCollectorFilter(e.target.value)}
                  className="w-full bg-[#071217] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                >
                  <option value="ALL">Todos los Cobradores</option>
                  {collectors.map((c) => (
                    <option key={c.id} value={c.nombre}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* QR Payments List */}
          {filteredQrPayments.length === 0 ? (
            <div className="text-center py-16 bg-[#0D1B22] border border-slate-800 rounded-3xl space-y-2">
              <QrCode className="w-10 h-10 text-slate-600 mx-auto" />
              <h4 className="text-base font-bold text-white">No hay recaudaciones QR</h4>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                No se registraron pagos con token QR de cobrador en el rango de fechas seleccionado.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredQrPayments.map((p) => {
                const isLiquidated = Boolean(p.liquidado_admin);
                const isScanned = Boolean(p.fecha_escaneo_cobrador);

                return (
                  <div
                    key={p.id}
                    className="bg-[#0D1B22] border border-slate-800 hover:border-slate-700 rounded-2xl p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4"
                  >
                    <div className="space-y-1.5 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-400 text-[10px] font-mono font-bold">
                          PIN: {p.qr_token || `#${p.id}`}
                        </span>
                        <span className="text-sm font-black text-white">{p.agencia}</span>
                        <span className="text-xs text-slate-500">📅 {formatDate(p.fecha || p.created_at)}</span>

                        {isLiquidated ? (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 text-[10px] font-bold border border-emerald-500/30">
                            💰 Liquidado a Admin
                          </span>
                        ) : isScanned ? (
                          <span className="px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-400 text-[10px] font-bold border border-sky-500/30">
                            🛵 En Ruta (Escaneado)
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 text-[10px] font-bold border border-amber-500/30">
                            ⏳ Pendiente de Escaneo
                          </span>
                        )}
                      </div>

                      <div className="text-xs text-slate-400">
                        Cobrador: <strong className="text-slate-300">{p.cobrador_nombre || 'Asignado'}</strong> • Concepto: {p.concepto}
                      </div>

                      {p.fecha_escaneo_cobrador && (
                        <div className="text-[11px] text-sky-400 font-mono">
                          Escaneado: {formatDate(p.fecha_escaneo_cobrador)}
                        </div>
                      )}
                    </div>

                    <div className="flex md:flex-col items-center md:items-end justify-between md:justify-center gap-2">
                      <div className="text-right">
                        <div className="text-lg font-black text-white font-mono">
                          {formatCurrency(p.monto, p.moneda)}
                        </div>
                        <div className="text-[10px] text-slate-400 font-bold uppercase">{p.moneda}</div>
                      </div>

                      <div>
                        {!isLiquidated && (
                          <button
                            onClick={() => handleSettleQrToAdmin(p)}
                            disabled={isProcessing}
                            className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-bold text-xs shadow-lg shadow-emerald-500/20 flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                          >
                            <DollarSign className="w-3.5 h-3.5" />
                            Liquidar a Admin
                          </button>
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
          EDIT COLLECTOR MODAL
      ========================================================================= */}
      {editCollectorItem && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0D1B22] border border-slate-800 rounded-3xl p-6 sm:p-8 max-w-md w-full space-y-4 shadow-2xl animate-fade-in">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Edit2 className="w-4 h-4 text-cyan-400" />
              Editar Cobrador: {editCollectorItem.nombre}
            </h3>

            <form onSubmit={handleSubmitEdit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">Nombre Completo *</label>
                <input
                  type="text"
                  required
                  value={editNombre}
                  onChange={(e) => setEditNombre(e.target.value)}
                  className="w-full bg-[#071217] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">Cédula</label>
                <input
                  type="text"
                  value={editCedula}
                  onChange={(e) => setEditCedula(e.target.value)}
                  className="w-full bg-[#071217] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">Teléfono</label>
                <input
                  type="text"
                  value={editTelefono}
                  onChange={(e) => setEditTelefono(e.target.value)}
                  className="w-full bg-[#071217] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">
                  Nueva Contraseña (dejar en blanco para conservar la actual)
                </label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={editClave}
                  onChange={(e) => setEditClave(e.target.value)}
                  className="w-full bg-[#071217] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-300">
                  <input
                    type="checkbox"
                    checked={editActivo}
                    onChange={(e) => setEditActivo(e.target.checked)}
                    className="w-4 h-4 rounded text-emerald-500 bg-[#071217] border-slate-700 focus:ring-0"
                  />
                  Cobrador Activo en Servicio
                </label>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditCollectorItem(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isProcessing}
                  className="px-5 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs shadow-lg shadow-cyan-600/20 transition-all cursor-pointer disabled:opacity-50"
                >
                  {isProcessing ? 'Guardando...' : 'Guardar Cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          DELETE COLLECTOR MODAL
      ========================================================================= */}
      {deleteCollectorItem && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0D1B22] border border-rose-500/30 rounded-3xl p-6 max-w-sm w-full space-y-4 shadow-2xl animate-fade-in">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-2xl bg-rose-500/10 text-rose-400 border border-rose-500/20">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">¿Eliminar Cobrador?</h3>
                <p className="text-xs text-slate-400">
                  @{deleteCollectorItem.usuario} ({deleteCollectorItem.nombre})
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-300">
              Esta acción eliminará al cobrador y todas sus asignaciones de ruta de forma irreversible.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeleteCollectorItem(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSubmitDelete}
                disabled={isProcessing}
                className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-lg shadow-rose-600/20 transition-all cursor-pointer disabled:opacity-50"
              >
                {isProcessing ? 'Eliminando...' : 'Sí, Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
