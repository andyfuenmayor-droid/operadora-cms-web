import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { formatCurrency, formatDate, cleanAgencyName } from '../../utils/formatters';
import type { Agency, BetSystem, Currency, BankAccount, PaymentDevice } from '../../types';
import {
  Building2,
  Plus,
  Search,
  Edit2,
  Trash2,
  Key,
  CreditCard,
  Layers,
  DollarSign,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  XCircle,
  Save,
  ShieldAlert,
  Sliders,
  CheckCheck
} from 'lucide-react';
import confetti from 'canvas-confetti';

export const AgenciesTab: React.FC = () => {
  const { effectiveUserId, profile } = useAuth();

  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [systems, setSystems] = useState<BetSystem[]>([]);
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [devices, setDevices] = useState<PaymentDevice[]>([]);

  const [searchQuery, setSearchQuery] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Modals state
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [editModalAgency, setEditModalAgency] = useState<Agency | null>(null);
  const [deleteModalAgency, setDeleteModalAgency] = useState<Agency | null>(null);

  // Form fields (used for both New & Edit)
  const [formNombre, setFormNombre] = useState('');
  const [formSistemas, setFormSistemas] = useState<string[]>([]);
  const [formMonedas, setFormMonedas] = useState<string[]>([]);
  const [formComision, setFormComision] = useState('10');
  const [formParticipacion, setFormParticipacion] = useState('50');
  const [formCondicionesSistemas, setFormCondicionesSistemas] = useState<Record<string, { comision: number; participacion: number }>>({});
  const [formSaldoBs, setFormSaldoBs] = useState('0');
  const [formSaldoUsd, setFormSaldoUsd] = useState('0');
  const [formSaldoCop, setFormSaldoCop] = useState('0');
  const [formCuentasAsignadas, setFormCuentasAsignadas] = useState<string[]>([]);
  const [formUsuarioTaquilla, setFormUsuarioTaquilla] = useState('');
  const [formClaveTaquilla, setFormClaveTaquilla] = useState('1234');
  const [formAuditoriaActiva, setFormAuditoriaActiva] = useState(false);

  // Load all agencies and catalogs
  const loadData = async () => {
    if (!effectiveUserId) return;
    setIsLoading(true);
    setMessage(null);

    try {
      const [agRes, sisRes, monRes, cbRes, dispRes] = await Promise.all([
        supabase.from('agencias').select('*').eq('user_id', effectiveUserId).order('id', { ascending: true }),
        supabase.from('sistemas').select('*').eq('user_id', effectiveUserId).order('nombre_sistema', { ascending: true }),
        supabase.from('monedas').select('*').eq('user_id', effectiveUserId).order('id', { ascending: true }),
        supabase.from('cuentas_bancarias').select('*').eq('user_id', effectiveUserId),
        supabase.from('dispositivos_pago').select('*').eq('user_id', effectiveUserId),
      ]);

      setAgencies(agRes.data || []);
      setSystems(sisRes.data || []);
      setCurrencies(monRes.data || []);
      setBankAccounts(cbRes.data || []);
      setDevices(dispRes.data || []);
    } catch (err: any) {
      console.error('Error loading agencies data:', err);
      setMessage({ type: 'error', text: err?.message || 'Error al cargar los datos de agencias.' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [effectiveUserId]);

  // Combined accounts & POS options for assignment multiselect
  const accountOptions = useMemo(() => {
    const list: string[] = [];

    bankAccounts.forEach((cb) => {
      const label = `${cb.id} - [CUENTA] ${cb.banco} (${cb.moneda}) | ${cb.titular}`;
      list.push(label);
    });

    devices.forEach((d) => {
      const label = `${d.id} - [POS] ${d.nombre_dispositivo || d.alias || 'POS'} [${d.tipo_dispositivo || 'POS'}] (${d.moneda || 'USD'})`;
      list.push(label);
    });

    return list;
  }, [bankAccounts, devices]);

  // Check agency limit from SaaS subscription
  const agencyLimit = profile?.limite_agencias || 5;
  const isLimitReached = agencies.length >= agencyLimit;

  // Open New Agency Modal
  const handleOpenNew = () => {
    if (isLimitReached) {
      setMessage({
        type: 'error',
        text: `Has alcanzado el límite de tu plan (${agencies.length}/${agencyLimit} agencias). Mejora tu suscripción en el Administrador Comercial.`,
      });
      return;
    }

    setFormNombre('');
    setFormSistemas(systems.map((s) => s.nombre_sistema));
    setFormMonedas(currencies.map((m) => m.nombre_moneda));
    setFormComision('10');
    setFormParticipacion('50');
    setFormCondicionesSistemas({});
    setFormSaldoBs('0');
    setFormSaldoUsd('0');
    setFormSaldoCop('0');
    setFormCuentasAsignadas([]);
    setFormUsuarioTaquilla('');
    setFormClaveTaquilla('1234');
    setFormAuditoriaActiva(false);

    setIsNewModalOpen(true);
  };

  // Open Edit Agency Modal
  const handleOpenEdit = (ag: Agency) => {
    setEditModalAgency(ag);
    setFormNombre(ag.nombre_agencia);
    setFormSistemas(ag.sistemas ? ag.sistemas.split(',').map((s) => s.trim()) : []);
    setFormMonedas(ag.monedas ? ag.monedas.split(',').map((m) => m.trim()) : []);
    setFormComision(String(ag.comision || 10));
    setFormParticipacion(String(ag.participacion_ag || 50));

    try {
      const cond = ag.condiciones_sistemas;
      setFormCondicionesSistemas(
        typeof cond === 'string' ? JSON.parse(cond) : ((cond as any) || {})
      );
    } catch {
      setFormCondicionesSistemas({});
    }

    setFormSaldoBs(String(ag.saldo_inicial_bs || 0));
    setFormSaldoUsd(String(ag.saldo_inicial_usd || 0));
    setFormSaldoCop(String(ag.saldo_inicial_cop || 0));
    setFormCuentasAsignadas(
      ag.cuentas_asignadas && ag.cuentas_asignadas !== 'NINGUNA'
        ? ag.cuentas_asignadas.split(',').map((c) => c.trim())
        : []
    );
    setFormUsuarioTaquilla(ag.usuario_taquilla || '');
    setFormClaveTaquilla(ag.clave_taquilla || '1234');
    setFormAuditoriaActiva(Boolean(ag.auditoria_activa));
  };

  // Auto-fill taquilla username when agency name changes in New Modal
  const handleNameChange = (val: string) => {
    const clean = val.toUpperCase();
    setFormNombre(clean);
    if (!editModalAgency) {
      const userSug = `${clean.toLowerCase().replace(/[^a-z0-9]/g, '_')}_pos`;
      setFormUsuarioTaquilla(userSug);
    }
  };

  // Save (Create or Update)
  const handleSaveAgency = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!effectiveUserId) return;

    if (!formNombre.trim() || formSistemas.length === 0 || formMonedas.length === 0) {
      setMessage({ type: 'error', text: 'Debe ingresar el nombre, al menos un sistema y una moneda.' });
      return;
    }

    setIsProcessing(true);
    setMessage(null);

    try {
      const payload: any = {
        user_id: effectiveUserId,
        nombre_agencia: formNombre.trim().toUpperCase(),
        sistemas: formSistemas.join(', '),
        monedas: formMonedas.join(', '),
        comision: Number(formComision),
        participacion_ag: Number(formParticipacion),
        condiciones_sistemas: JSON.stringify(formCondicionesSistemas),
        saldo_inicial_bs: Number(formSaldoBs),
        saldo_inicial_usd: Number(formSaldoUsd),
        saldo_inicial_cop: Number(formSaldoCop),
        cuentas_asignadas: formCuentasAsignadas.length > 0 ? formCuentasAsignadas.join(', ') : 'NINGUNA',
        usuario_taquilla: formUsuarioTaquilla.trim().toLowerCase(),
        clave_taquilla: formClaveTaquilla.trim(),
        auditoria_activa: formAuditoriaActiva,
      };

      let targetAgId: number;

      if (editModalAgency) {
        // Update existing agency
        const { error: upErr } = await supabase
          .from('agencias')
          .update(payload)
          .eq('id', editModalAgency.id)
          .eq('user_id', effectiveUserId);

        if (upErr) throw upErr;
        targetAgId = editModalAgency.id;
        setMessage({ type: 'success', text: `¡Agencia ${formNombre} actualizada exitosamente!` });
        setEditModalAgency(null);
      } else {
        // Insert new agency
        const { data: insData, error: insErr } = await supabase
          .from('agencias')
          .insert(payload)
          .select()
          .single();

        if (insErr) throw insErr;
        targetAgId = insData.id;
        confetti({ particleCount: 50, spread: 60 });
        setMessage({ type: 'success', text: `¡Agencia ${formNombre} registrada exitosamente!` });
        setIsNewModalOpen(false);
      }

      // Sync assigned bank accounts & devices
      if (formCuentasAsignadas.length > 0) {
        const assignedIds = formCuentasAsignadas
          .map((item) => parseInt(item.split(' - ')[0], 10))
          .filter((id) => !isNaN(id));

        if (assignedIds.length > 0) {
          await supabase
            .from('cuentas_bancarias')
            .update({ agencia_asignada: formNombre, metodos_aceptados: `AGENCIA: ${formNombre}` })
            .eq('user_id', effectiveUserId)
            .in('id', assignedIds);

          await supabase
            .from('dispositivos_pago')
            .update({ agencia_asignada: formNombre })
            .eq('user_id', effectiveUserId)
            .in('id', assignedIds);
        }
      }

      // Sync credential in taquilla_usuarios
      if (formUsuarioTaquilla.trim() && formClaveTaquilla.trim()) {
        const { data: existingUser } = await supabase
          .from('taquilla_usuarios')
          .select('id')
          .ilike('usuario', formUsuarioTaquilla.trim())
          .eq('user_id', effectiveUserId);

        if (existingUser && existingUser.length > 0) {
          await supabase
            .from('taquilla_usuarios')
            .update({
              usuario: formUsuarioTaquilla.trim(),
              clave: formClaveTaquilla.trim(),
              agencia_id: targetAgId,
              nombre_cajero: formNombre,
              rol: 'agencia',
              activo: true,
            })
            .eq('id', existingUser[0].id);
        } else {
          await supabase.from('taquilla_usuarios').insert({
            user_id: effectiveUserId,
            usuario: formUsuarioTaquilla.trim(),
            clave: formClaveTaquilla.trim(),
            agencia_id: targetAgId,
            nombre_cajero: formNombre,
            rol: 'agencia',
            activo: true,
          });
        }
      }

      await loadData();
    } catch (err: any) {
      console.error('Error saving agency:', err);
      setMessage({ type: 'error', text: err?.message || 'Error al guardar la agencia.' });
    } finally {
      setIsProcessing(false);
    }
  };

  // Delete Agency
  const handleDeleteAgency = async () => {
    if (!deleteModalAgency || !effectiveUserId) return;
    setIsProcessing(true);

    try {
      // 1. Delete taquilla user
      await supabase
        .from('taquilla_usuarios')
        .delete()
        .eq('agencia_id', deleteModalAgency.id)
        .eq('user_id', effectiveUserId);

      // 2. Unassign bank accounts
      await supabase
        .from('cuentas_bancarias')
        .update({ agencia_asignada: 'NINGUNA' })
        .eq('agencia_asignada', deleteModalAgency.nombre_agencia)
        .eq('user_id', effectiveUserId);

      // 3. Delete agency
      await supabase
        .from('agencias')
        .delete()
        .eq('id', deleteModalAgency.id)
        .eq('user_id', effectiveUserId);

      setMessage({ type: 'success', text: `Agencia ${deleteModalAgency.nombre_agencia} eliminada correctamente.` });
      setDeleteModalAgency(null);
      await loadData();
    } catch (err: any) {
      console.error('Error deleting agency:', err);
      setMessage({ type: 'error', text: err?.message || 'Error al eliminar la agencia.' });
    } finally {
      setIsProcessing(false);
    }
  };

  // Filtered agencies
  const filteredAgencies = useMemo(() => {
    if (!searchQuery.trim()) return agencies;
    const q = searchQuery.toLowerCase();
    return agencies.filter((a) => {
      return (
        a.nombre_agencia.toLowerCase().includes(q) ||
        (a.sistemas || '').toLowerCase().includes(q) ||
        (a.monedas || '').toLowerCase().includes(q) ||
        (a.usuario_taquilla || '').toLowerCase().includes(q) ||
        (a.cuentas_asignadas || '').toLowerCase().includes(q)
      );
    });
  }, [agencies, searchQuery]);

  return (
    <div className="space-y-6">
      {/* Header & Quota Card */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2">
            <span className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Building2 className="w-5 h-5" />
            </span>
            Gestión de Agencias
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Administración completa de agencias taquilleras, comisiones, monedas, cuentas asignadas y credenciales de acceso POS.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => loadData()}
            disabled={isLoading}
            className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex items-center gap-1.5 transition-all border border-slate-700 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            Actualizar
          </button>

          <button
            onClick={handleOpenNew}
            disabled={isLimitReached}
            className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-bold text-xs shadow-lg shadow-emerald-500/20 flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            Nueva Agencia
          </button>
        </div>
      </div>

      {/* Plan Quota Banner */}
      <div className="bg-[#0D1B22] border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-bold text-white">
              Cuota de Agencias de tu Plan SaaS: <span className="text-cyan-400 font-mono font-black">{agencies.length}</span> / {agencyLimit}
            </div>
            <p className="text-[11px] text-slate-400">
              {isLimitReached
                ? '⚠️ Has utilizado el 100% del cupo de agencias disponible para tu suscripción actual.'
                : `Tienes disponibilidad para registrar ${agencyLimit - agencies.length} agencia(s) adicional(es).`}
            </p>
          </div>
        </div>

        <div className="w-full sm:w-48 bg-[#071217] rounded-full h-2.5 border border-slate-800 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              isLimitReached ? 'bg-rose-500' : 'bg-gradient-to-r from-emerald-500 to-cyan-500'
            }`}
            style={{ width: `${Math.min(100, (agencies.length / agencyLimit) * 100)}%` }}
          />
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

      {/* Search Bar */}
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="Buscar agencia por nombre, sistema, moneda, usuario POS..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full bg-[#0D1B22] border border-slate-800 rounded-2xl pl-9 pr-4 py-3 text-xs text-white focus:outline-none focus:border-emerald-500 transition-colors"
        />
      </div>

      {/* Agencies Cards Grid */}
      {isLoading ? (
        <div className="text-center py-16 bg-[#0D1B22] border border-slate-800 rounded-3xl">
          <RefreshCw className="w-8 h-8 text-emerald-400 animate-spin mx-auto mb-3" />
          <p className="text-sm text-slate-400 font-medium">Cargando agencias...</p>
        </div>
      ) : filteredAgencies.length === 0 ? (
        <div className="text-center py-16 bg-[#0D1B22] border border-slate-800 rounded-3xl space-y-3">
          <Building2 className="w-12 h-12 text-slate-600 mx-auto" />
          <h4 className="text-base font-bold text-white">No se encontraron agencias</h4>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            Registra tu primera agencia para comenzar a operar la plataforma multimoneda y taquilla web.
          </p>
          <button
            onClick={handleOpenNew}
            className="px-4 py-2 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-bold hover:bg-emerald-500/30 cursor-pointer transition-all inline-flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            Registrar Agencia
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredAgencies.map((ag) => {
            const sisArr = ag.sistemas ? ag.sistemas.split(',').map((s) => s.trim()) : [];
            const monArr = ag.monedas ? ag.monedas.split(',').map((m) => m.trim()) : [];
            const accArr =
              ag.cuentas_asignadas && ag.cuentas_asignadas !== 'NINGUNA'
                ? ag.cuentas_asignadas.split(',').map((c) => c.trim())
                : [];

            return (
              <div
                key={ag.id}
                className="bg-[#0D1B22] border border-slate-800 hover:border-slate-700 rounded-3xl p-5 sm:p-6 transition-all shadow-lg space-y-4"
              >
                {/* Header Card */}
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-400 text-[10px] font-mono font-bold">
                        #{ag.id}
                      </span>
                      <h3 className="text-base font-black text-white">{ag.nombre_agencia}</h3>
                    </div>

                    <div className="text-xs text-slate-400 mt-1 flex flex-wrap items-center gap-2 font-mono">
                      <span>Comisión: <strong className="text-emerald-400">{ag.comision}%</strong></span>
                      <span>• Part. Ag: <strong className="text-cyan-400">{ag.participacion_ag}%</strong></span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleOpenEdit(ag)}
                      className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all cursor-pointer"
                      title="Editar Agencia"
                    >
                      <Edit2 className="w-3.5 h-3.5 text-cyan-400" />
                    </button>

                    <button
                      onClick={() => setDeleteModalAgency(ag)}
                      className="p-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 transition-all cursor-pointer"
                      title="Eliminar Agencia"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Systems & Currencies Chips */}
                <div className="space-y-2 text-xs">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] font-bold text-slate-400">Sistemas:</span>
                    {sisArr.map((s) => (
                      <span
                        key={s}
                        className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 text-[10px] font-semibold border border-emerald-500/20"
                      >
                        🎰 {s}
                      </span>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] font-bold text-slate-400">Monedas:</span>
                    {monArr.map((m) => (
                      <span
                        key={m}
                        className="px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-400 text-[10px] font-semibold border border-amber-500/20"
                      >
                        🪙 {m}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Initial Balances */}
                <div className="grid grid-cols-3 gap-2 bg-[#071217] p-2.5 rounded-2xl border border-slate-800/80 text-center text-xs font-mono">
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase block">Saldo Bs</span>
                    <strong className="text-white">{formatCurrency(ag.saldo_inicial_bs || 0, 'BS')}</strong>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase block">Saldo USD</span>
                    <strong className="text-emerald-400">{formatCurrency(ag.saldo_inicial_usd || 0, 'USD')}</strong>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase block">Saldo COP</span>
                    <strong className="text-cyan-400">{formatCurrency(ag.saldo_inicial_cop || 0, 'COP')}</strong>
                  </div>
                </div>

                {/* Assigned Accounts & POS */}
                <div className="text-xs space-y-1">
                  <span className="text-[11px] font-bold text-slate-400 block">
                    Cuentas Bancarias y Dispositivos de Cobro ({accArr.length}):
                  </span>
                  {accArr.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {accArr.map((acc) => (
                        <span
                          key={acc}
                          className="px-2 py-0.5 rounded-md bg-cyan-500/10 text-cyan-300 text-[10px] font-semibold border border-cyan-500/20"
                        >
                          💳 {acc}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-[11px] text-slate-500 italic">Ningún método asignado</span>
                  )}
                </div>

                {/* Credentials Banner */}
                <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
                  <div className="flex items-center gap-1.5">
                    <Key className="w-3.5 h-3.5 text-amber-400" />
                    <span>
                      Acceso POS: <strong className="text-white font-mono">{ag.usuario_taquilla || 'N/A'}</strong> (PIN: <strong className="text-white font-mono">{ag.clave_taquilla || '****'}</strong>)
                    </span>
                  </div>

                  {ag.auditoria_activa && (
                    <span className="px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-400 text-[10px] font-bold border border-purple-500/30">
                      Auditoría
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* =========================================================================
          NEW & EDIT MODAL
      ========================================================================= */}
      {(isNewModalOpen || editModalAgency) && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#0D1B22] border border-slate-800 rounded-3xl p-6 sm:p-8 max-w-2xl w-full space-y-6 shadow-2xl animate-fade-in my-8">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Building2 className="w-5 h-5 text-emerald-400" />
                {editModalAgency ? `Editar Agencia: ${editModalAgency.nombre_agencia}` : 'Registrar Nueva Agencia'}
              </h3>
              <button
                onClick={() => {
                  setIsNewModalOpen(false);
                  setEditModalAgency(null);
                }}
                className="text-slate-400 hover:text-white text-xs font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveAgency} className="space-y-5">
              {/* Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">Nombre de la Agencia *</label>
                <input
                  type="text"
                  required
                  placeholder="Ej: AGENCIA CENTRO 01"
                  value={formNombre}
                  onChange={(e) => handleNameChange(e.target.value)}
                  className="w-full bg-[#071217] border border-slate-700 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* Systems & Currencies Checkboxes */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-300">Sistemas Permitidos *</label>
                  <div className="p-3 bg-[#071217] rounded-xl border border-slate-800 max-h-36 overflow-y-auto space-y-1.5">
                    {systems.map((s) => (
                      <label key={s.id} className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formSistemas.includes(s.nombre_sistema)}
                          onChange={(e) => {
                            if (e.target.checked) setFormSistemas([...formSistemas, s.nombre_sistema]);
                            else setFormSistemas(formSistemas.filter((item) => item !== s.nombre_sistema));
                          }}
                          className="rounded text-emerald-500 bg-slate-900 border-slate-700 focus:ring-0"
                        />
                        <span>{s.nombre_sistema}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-300">Monedas Permitidas *</label>
                  <div className="p-3 bg-[#071217] rounded-xl border border-slate-800 max-h-36 overflow-y-auto space-y-1.5">
                    {currencies.map((m) => (
                      <label key={m.id} className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formMonedas.includes(m.nombre_moneda)}
                          onChange={(e) => {
                            if (e.target.checked) setFormMonedas([...formMonedas, m.nombre_moneda]);
                            else setFormMonedas(formMonedas.filter((item) => item !== m.nombre_moneda));
                          }}
                          className="rounded text-amber-500 bg-slate-900 border-slate-700 focus:ring-0"
                        />
                        <span>{m.nombre_moneda} ({m.simbolo})</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              {/* Commission and Participation */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">Comisión % (General)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    value={formComision}
                    onChange={(e) => setFormComision(e.target.value)}
                    className="w-full bg-[#071217] border border-slate-700 rounded-xl px-4 py-2.5 text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">Participación Agencia %</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    value={formParticipacion}
                    onChange={(e) => setFormParticipacion(e.target.value)}
                    className="w-full bg-[#071217] border border-slate-700 rounded-xl px-4 py-2.5 text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* Initial Balances */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-300">Saldos Iniciales de Arrastre</label>
                <div className="grid grid-cols-3 gap-3">
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Saldo Bs"
                    value={formSaldoBs}
                    onChange={(e) => setFormSaldoBs(e.target.value)}
                    className="w-full bg-[#071217] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
                  />
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Saldo USD"
                    value={formSaldoUsd}
                    onChange={(e) => setFormSaldoUsd(e.target.value)}
                    className="w-full bg-[#071217] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
                  />
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Saldo COP"
                    value={formSaldoCop}
                    onChange={(e) => setFormSaldoCop(e.target.value)}
                    className="w-full bg-[#071217] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* Accounts & Devices Assignment */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-300">
                  Dispositivos de Cobro y Cuentas Bancarias Asignadas
                </label>
                <div className="p-3 bg-[#071217] rounded-xl border border-slate-800 max-h-36 overflow-y-auto space-y-1.5">
                  {accountOptions.length === 0 ? (
                    <span className="text-xs text-slate-500 italic">No hay cuentas ni dispositivos registrados.</span>
                  ) : (
                    accountOptions.map((opt) => (
                      <label key={opt} className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formCuentasAsignadas.includes(opt)}
                          onChange={(e) => {
                            if (e.target.checked) setFormCuentasAsignadas([...formCuentasAsignadas, opt]);
                            else setFormCuentasAsignadas(formCuentasAsignadas.filter((item) => item !== opt));
                          }}
                          className="rounded text-cyan-500 bg-slate-900 border-slate-700 focus:ring-0"
                        />
                        <span>{opt}</span>
                      </label>
                    ))
                  )}
                </div>
              </div>

              {/* POS Credentials */}
              <div className="pt-2 border-t border-slate-800 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">Usuario Acceso Taquilla POS</label>
                  <input
                    type="text"
                    required
                    value={formUsuarioTaquilla}
                    onChange={(e) => setFormUsuarioTaquilla(e.target.value)}
                    className="w-full bg-[#071217] border border-slate-700 rounded-xl px-4 py-2.5 text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">Clave / PIN de Acceso</label>
                  <input
                    type="text"
                    required
                    value={formClaveTaquilla}
                    onChange={(e) => setFormClaveTaquilla(e.target.value)}
                    className="w-full bg-[#071217] border border-slate-700 rounded-xl px-4 py-2.5 text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setIsNewModalOpen(false);
                    setEditModalAgency(null);
                  }}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isProcessing}
                  className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-bold text-xs shadow-lg shadow-emerald-500/20 transition-all cursor-pointer disabled:opacity-50"
                >
                  {isProcessing ? 'Guardando...' : editModalAgency ? 'Guardar Cambios' : 'Registrar Agencia'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          DELETE MODAL
      ========================================================================= */}
      {deleteModalAgency && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0D1B22] border border-rose-500/30 rounded-3xl p-6 max-w-sm w-full space-y-4 shadow-2xl animate-fade-in">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-2xl bg-rose-500/10 text-rose-400 border border-rose-500/20">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">¿Eliminar Agencia?</h3>
                <p className="text-xs text-slate-400">{deleteModalAgency.nombre_agencia}</p>
              </div>
            </div>

            <p className="text-xs text-slate-300">
              Esta acción eliminará la agencia y sus credenciales de taquilla de forma irreversible.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeleteModalAgency(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDeleteAgency}
                disabled={isProcessing}
                className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-lg shadow-rose-600/20 transition-all cursor-pointer disabled:opacity-50"
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
