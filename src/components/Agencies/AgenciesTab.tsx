import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { formatCurrency, formatDate, cleanAgencyName } from '../../utils/formatters';
import type { Agency, BetSystem, Currency, BankAccount, PaymentDevice, TaquillaUser } from '../../types';
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
  CheckCheck,
  List,
  LayoutGrid,
  Smartphone,
  Users,
  UserCheck,
} from 'lucide-react';
import confetti from 'canvas-confetti';

/**
 * Parsea y formatea las cuentas y dispositivos bancarios al modo Ultra Compacto:
 * Ejemplo: "2 - [CUENTA] BANESCO ( BS) | ANDYS FUENMAYOR" -> "Banesco (BS)"
 */
export const parseAccountDisplay = (
  raw: string,
  accounts: BankAccount[] = [],
  devices: PaymentDevice[] = []
) => {
  if (!raw || typeof raw !== 'string') return null;
  const str = raw.trim();
  if (!str || str === 'NINGUNA') return null;

  const idMatch = str.match(/^(\d+)\s*-\s*/);
  const idNum = idMatch ? parseInt(idMatch[1], 10) : null;
  const matchedAcc = idNum ? accounts.find((a) => a.id === idNum) : null;
  const matchedDev = idNum ? devices.find((d) => d.id === idNum) : null;

  const isPos =
    /pos|dispositivo|punto de venta/i.test(str) ||
    Boolean(matchedDev) ||
    Boolean(matchedAcc && /dispositivo|pos/i.test(matchedAcc.tipo_cuenta || ''));

  let banco = '';
  let tipoCuenta = '';
  let moneda = '';
  let titular = '';
  let numero = '';

  if (matchedAcc) {
    banco = matchedAcc.banco;
    tipoCuenta = matchedAcc.tipo_cuenta || '';
    moneda = (matchedAcc.moneda || '').trim().toUpperCase();
    titular = matchedAcc.titular || '';
    numero = matchedAcc.numero_cuenta || '';
  } else if (matchedDev) {
    banco = matchedDev.alias_nombre || matchedDev.nombre_dispositivo || matchedDev.alias || 'POS';
    tipoCuenta = 'POS';
    moneda = (matchedDev.moneda || '').trim().toUpperCase();
  } else {
    // Fallback parser from raw string
    const withoutId = str.replace(/^(\d+)\s*-\s*/, '');
    const parts = withoutId.split('|');
    const mainPart = parts[0].trim();
    titular = parts[1] ? parts[1].trim() : '';

    const monMatch = str.match(/\b(BS|USD|COP|EUR|USDT|VES)\b/i);
    moneda = monMatch ? monMatch[1].trim().toUpperCase() : '';

    const bracketMatches = mainPart.match(/\[([^\]]+)\]/g);
    if (bracketMatches) {
      bracketMatches.forEach((bm) => {
        const inner = bm.replace(/\[|\]/g, '').trim();
        if (/corriente|ahorro|pago\s*movil|zelle|pos/i.test(inner)) {
          tipoCuenta = inner;
        }
      });
    }

    banco = mainPart
      .replace(/\[[^\]]+\]/g, '')
      .replace(/\([^)]+\)/g, '')
      .replace(/DISPOSITIVO:\s*/i, '')
      .trim();
  }

  // Clean bank name
  if (isPos) {
    if (titular && titular.toUpperCase().includes('POS')) {
      banco = titular.replace(/\s*GLO$/i, '');
    } else if (!banco || /punto de venta/i.test(banco)) {
      banco = titular || 'POS Bancolombia';
    }
  }

  // Title case for bank
  banco = banco
    .toLowerCase()
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  if (isPos) {
    banco = banco.replace(/^(Pos|pos)\s*/i, 'POS ');
    if (!banco.startsWith('POS ')) banco = `POS ${banco}`;
  }

  // Format tipoCuenta cleanly
  let tipoClean = tipoCuenta.trim();
  if (/pago\s*m[oó]vil/i.test(tipoClean)) tipoClean = 'Pago Móvil';
  else if (/ahorros?/i.test(tipoClean)) tipoClean = 'Ahorro';
  else if (/corriente/i.test(tipoClean)) tipoClean = 'Corriente';
  else if (/zelle/i.test(tipoClean)) tipoClean = 'Zelle';
  else if (/dispositivo/i.test(tipoClean)) tipoClean = '';
  else if (tipoClean) {
    tipoClean = tipoClean
      .toLowerCase()
      .split(' ')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }

  // Short title with tipo de cuenta
  let shortTitle = '';
  if (isPos) {
    shortTitle = moneda ? `${banco} (${moneda})` : banco;
  } else if (tipoClean) {
    shortTitle = moneda ? `${banco} • ${tipoClean} (${moneda})` : `${banco} • ${tipoClean}`;
  } else {
    shortTitle = moneda ? `${banco} (${moneda})` : banco;
  }

  const tooltipParts = [shortTitle];
  if (titular) tooltipParts.push(`Titular: ${titular}`);
  if (numero) tooltipParts.push(`Nº: ${numero}`);
  if (idNum) tooltipParts.push(`ID: #${idNum}`);

  return {
    isPos,
    banco,
    tipoCuenta: tipoClean,
    moneda,
    titular,
    numero,
    shortTitle,
    tooltip: tooltipParts.join(' • '),
    id: idNum,
  };
};

export const AgenciesTab: React.FC = () => {
  const { effectiveUserId, profile } = useAuth();

  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [systems, setSystems] = useState<BetSystem[]>([]);
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [devices, setDevices] = useState<PaymentDevice[]>([]);

  // View Mode: 'linear' (Table, default) vs 'cards' (Grid)
  const [viewMode, setViewMode] = useState<'linear' | 'cards'>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('cms_agencies_view_mode');
        if (saved === 'linear' || saved === 'cards') return saved;
      } catch (_) {}
    }
    return 'linear';
  });

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
  const [formCondicionesSistemas, setFormCondicionesSistemas] = useState<Record<string, { comision?: number | string; participacion?: number | string; codigo?: string }>>({});
  const [formCuentasAsignadas, setFormCuentasAsignadas] = useState<string[]>([]);
  const [formUsuarioTaquilla, setFormUsuarioTaquilla] = useState('');
  const [formClaveTaquilla, setFormClaveTaquilla] = useState('1234');

  // Terminal users state (Cajeros y Supervisores POS)
  const [taquillaUsers, setTaquillaUsers] = useState<TaquillaUser[]>([]);
  const [terminalUsersModalAgency, setTerminalUsersModalAgency] = useState<Agency | null>(null);

  // New terminal user form
  const [newUsuario, setNewUsuario] = useState('');
  const [newClave, setNewClave] = useState('');
  const [newNombreCajero, setNewNombreCajero] = useState('');
  const [newRol, setNewRol] = useState<'cajero' | 'supervisor'>('cajero');

  // Edit terminal user form
  const [editingUser, setEditingUser] = useState<TaquillaUser | null>(null);
  const [editRol, setEditRol] = useState<'cajero' | 'supervisor'>('cajero');
  const [editClave, setEditClave] = useState('');
  const [editActivo, setEditActivo] = useState(true);

  // Load all agencies and catalogs
  const loadData = async () => {
    if (!effectiveUserId) return;
    setIsLoading(true);
    setMessage(null);

    try {
      const [agRes, sisRes, monRes, cbRes, dispRes, tuRes] = await Promise.all([
        supabase.from('agencias').select('*').eq('user_id', effectiveUserId).order('id', { ascending: true }),
        supabase.from('sistemas').select('*').eq('user_id', effectiveUserId).order('nombre_sistema', { ascending: true }),
        supabase.from('monedas').select('*').eq('user_id', effectiveUserId).order('id', { ascending: true }),
        supabase.from('cuentas_bancarias').select('*').eq('user_id', effectiveUserId).order('id', { ascending: true }),
        supabase.from('dispositivos_pago').select('*').eq('user_id', effectiveUserId).order('id', { ascending: true }),
        supabase.from('taquilla_usuarios').select('*').eq('user_id', effectiveUserId).order('id', { ascending: true }),
      ]);

      const rawMonedas = monRes.data || [];
      const normalizedMonedas: Currency[] = rawMonedas.map((m: any) => ({
        id: m.id,
        nombre_moneda: String(m.Nombre_Moneda || m.nombre_moneda || m.moneda || '').trim().toUpperCase(),
        simbolo: String(m.Simbolo || m.simbolo || '').trim(),
        user_id: m.user_id,
        created_at: m.created_at,
      }));

      const finalMonedas: Currency[] = normalizedMonedas.some((m) => m.nombre_moneda)
        ? normalizedMonedas.filter((m) => m.nombre_moneda)
        : [
            { id: 1, nombre_moneda: 'BS', simbolo: 'Bs.' },
            { id: 2, nombre_moneda: 'USD', simbolo: '$' },
            { id: 3, nombre_moneda: 'COP', simbolo: 'COP' },
          ];

      setAgencies(agRes.data || []);
      setSystems(sisRes.data || []);
      setCurrencies(finalMonedas);
      setBankAccounts(cbRes.data || []);
      setDevices(dispRes.data || []);
      setTaquillaUsers(tuRes.data || []);
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
      const tipoClean = cb.tipo_cuenta ? ` [${cb.tipo_cuenta}]` : '';
      const monClean = (cb.moneda || '').trim().toUpperCase();
      const label = `${cb.id} - [CUENTA] ${cb.banco}${tipoClean} (${monClean}) | ${cb.titular}`;
      list.push(label);
    });

    devices.forEach((d) => {
      const label = `${d.id} - [POS] ${d.nombre_dispositivo || d.alias || 'POS'} [${d.tipo_dispositivo || 'POS'}] (${(d.moneda || 'USD').trim().toUpperCase()})`;
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
    setFormMonedas(currencies.map((m) => m.nombre_moneda).filter(Boolean));
    setFormComision('10');
    setFormParticipacion('50');
    setFormCondicionesSistemas({});
    setFormCuentasAsignadas([]);
    setFormUsuarioTaquilla('');
    setFormClaveTaquilla('1234');

    setIsNewModalOpen(true);
  };

  // Open Edit Agency Modal
  const handleOpenEdit = (ag: Agency) => {
    setEditModalAgency(ag);
    setFormNombre(ag.nombre_agencia);
    setFormSistemas(ag.sistemas ? ag.sistemas.split(',').map((s) => s.trim()).filter(Boolean) : []);
    setFormMonedas(ag.monedas ? ag.monedas.split(',').map((m) => m.trim().toUpperCase()).filter(Boolean) : []);
    setFormComision(String(ag.comision !== undefined && ag.comision !== null ? ag.comision : 10));
    setFormParticipacion(String(ag.participacion_ag !== undefined && ag.participacion_ag !== null ? ag.participacion_ag : 0));

    try {
      const cond = ag.condiciones_sistemas;
      setFormCondicionesSistemas(
        typeof cond === 'string' ? JSON.parse(cond) : ((cond as any) || {})
      );
    } catch {
      setFormCondicionesSistemas({});
    }

    setFormCuentasAsignadas(
      ag.cuentas_asignadas && ag.cuentas_asignadas !== 'NINGUNA'
        ? ag.cuentas_asignadas.split(',').map((c) => c.trim())
        : []
    );
    setFormUsuarioTaquilla(ag.usuario_taquilla || '');
    setFormClaveTaquilla(ag.clave_taquilla || '1234');
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

  // Handlers for Terminal Users (Cajeros y Supervisores POS)
  const handleCreateTaquillaUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!effectiveUserId || !terminalUsersModalAgency) return;

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
        agencia_id: terminalUsersModalAgency.id,
        nombre_cajero: newNombreCajero.trim() || undefined,
        activo: true,
        user_id: effectiveUserId,
      };

      const { error } = await supabase.from('taquilla_usuarios').insert(payload);
      if (error) throw error;

      confetti({ particleCount: 35, spread: 60 });
      setMessage({ type: 'success', text: `Usuario '${newUsuario}' creado como ${newRol}.` });
      setNewUsuario('');
      setNewClave('');
      setNewNombreCajero('');
      setNewRol('cajero');
      await loadData();
    } catch (err: any) {
      console.error('Error creating taquilla user:', err);
      setMessage({ type: 'error', text: err?.message || 'Error al crear usuario.' });
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
      setMessage({ type: 'error', text: err?.message || 'Error al actualizar usuario.' });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteTaquillaUser = async (userItem: TaquillaUser) => {
    if (!window.confirm(`¿Eliminar al usuario de taquilla '${userItem.usuario}' (${userItem.rol})?`)) return;
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
      setMessage({ type: 'error', text: err?.message || 'Error al eliminar usuario.' });
    } finally {
      setIsProcessing(false);
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
        condiciones_sistemas: (() => {
          const cleaned: Record<string, any> = {};
          formSistemas.forEach((s) => {
            const item = formCondicionesSistemas[s];
            if (item) {
              const entry: any = {};
              if (item.codigo && String(item.codigo).trim()) entry.codigo = String(item.codigo).trim();
              if (item.comision !== undefined && item.comision !== null && item.comision !== '') {
                entry.comision = Number(item.comision);
              }
              if (item.participacion !== undefined && item.participacion !== null && item.participacion !== '') {
                entry.participacion = Number(item.participacion);
              }
              if (Object.keys(entry).length > 0) cleaned[s] = entry;
            }
          });
          return JSON.stringify(cleaned);
        })(),
        cuentas_asignadas: formCuentasAsignadas.length > 0 ? formCuentasAsignadas.join(', ') : 'NINGUNA',
        usuario_taquilla: formUsuarioTaquilla.trim().toLowerCase(),
        clave_taquilla: formClaveTaquilla.trim(),
      };

      if (!editModalAgency) {
        payload.saldo_inicial_bs = 0;
        payload.saldo_inicial_usd = 0;
        payload.saldo_inicial_cop = 0;
      }

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
        (a.cuentas_asignadas || '').toLowerCase().includes(q) ||
        (a.cuentas_asignadas || '')
          .split(',')
          .some((acc) => parseAccountDisplay(acc, bankAccounts, devices)?.shortTitle.toLowerCase().includes(q))
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

      {/* Search Bar & View Mode Switcher */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar agencia por nombre, sistema, moneda, usuario POS..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#0D1B22] border border-slate-800 rounded-2xl pl-9 pr-4 py-2.5 text-xs text-white focus:outline-none focus:border-emerald-500 transition-colors"
          />
        </div>

        {/* View Mode Toggle */}
        <div className="flex items-center gap-1 bg-[#0D1B22] p-1 rounded-2xl border border-slate-800 shrink-0 self-end sm:self-auto">
          <button
            type="button"
            onClick={() => {
              setViewMode('linear');
              try { localStorage.setItem('cms_agencies_view_mode', 'linear'); } catch (_) {}
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              viewMode === 'linear'
                ? 'bg-emerald-500 text-slate-950 font-black shadow-md shadow-emerald-500/20'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
            title="Vista Tabla"
          >
            <List className="w-3.5 h-3.5" />
            <span>Tabla</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setViewMode('cards');
              try { localStorage.setItem('cms_agencies_view_mode', 'cards'); } catch (_) {}
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              viewMode === 'cards'
                ? 'bg-emerald-500 text-slate-950 font-black shadow-md shadow-emerald-500/20'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
            title="Vista Tarjetas"
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span>Tarjetas</span>
          </button>
        </div>
      </div>

      {/* Agencies Cards or Linear Table */}
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
      ) : viewMode === 'linear' ? (
        /* Tabla de Agencias */
        <div className="bg-[#0D1B22] border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
          <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <Building2 className="w-4 h-4" />
              </span>
              <div>
                <h4 className="text-xs sm:text-sm font-black text-white uppercase tracking-wider">
                  Listado de Agencias ({filteredAgencies.length})
                </h4>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Resumen de configuración y accesos por agencia
                </p>
              </div>
            </div>
            <span className="px-3 py-1 rounded-full bg-slate-800/80 text-slate-300 font-mono text-xs font-bold border border-slate-700">
              {filteredAgencies.length} de {agencies.length} agencias
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="sticky top-0 bg-[#071217] text-slate-400 font-bold uppercase text-[10px] tracking-wider border-b border-slate-800">
                <tr>
                  <th className="py-3 px-3 text-center w-12">#</th>
                  <th className="py-3 px-4 min-w-[140px]">Agencia</th>
                  <th className="py-3 px-4 text-center w-32">Comisión / Part.</th>
                  <th className="py-3 px-4 min-w-[150px]">Sistemas</th>
                  <th className="py-3 px-4 text-center w-28">Monedas</th>
                  <th className="py-3 px-4 min-w-[260px]">Cuentas / Bancos</th>
                  <th className="py-3 px-4 min-w-[180px]">Acceso POS</th>
                  <th className="py-3 px-4 text-center w-24">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 font-mono">
                {filteredAgencies.map((ag) => {
                  const sisArr = ag.sistemas ? ag.sistemas.split(',').map((s) => s.trim()).filter(Boolean) : [];
                  const monArr = ag.monedas ? ag.monedas.split(',').map((m) => m.trim()).filter(Boolean) : [];
                  const accArr =
                    ag.cuentas_asignadas && ag.cuentas_asignadas !== 'NINGUNA'
                      ? ag.cuentas_asignadas.split(',').map((c) => c.trim()).filter(Boolean)
                      : [];

                  return (
                    <tr key={ag.id} className="hover:bg-slate-800/30 transition-colors group">
                      {/* ID */}
                      <td className="py-3 px-3 text-center text-slate-400 font-bold font-mono text-xs">
                        #{ag.id}
                      </td>

                      {/* Agency Name */}
                      <td className="py-3 px-4 font-sans">
                        <span className="font-extrabold text-white text-xs whitespace-nowrap">
                          {ag.nombre_agencia}
                        </span>
                      </td>

                      {/* Comision / Participacion */}
                      <td className="py-3 px-4 text-center">
                        {(() => {
                          let customComs: { sys: string; com: number }[] = [];
                          try {
                            const c = typeof ag.condiciones_sistemas === 'string' ? JSON.parse(ag.condiciones_sistemas) : ag.condiciones_sistemas;
                            if (c) {
                              sisArr.forEach((s) => {
                                if (c[s]?.comision !== undefined && c[s]?.comision !== null && c[s]?.comision !== '') {
                                  customComs.push({ sys: s, com: Number(c[s].comision) });
                                }
                              });
                            }
                          } catch (_) {}

                          if (customComs.length === 0) {
                            return (
                              <div className="inline-flex items-center gap-1 font-mono text-[11px]">
                                <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 font-bold border border-emerald-500/20" title="Comisión General">
                                  {ag.comision}%
                                </span>
                                <span className="text-slate-600">/</span>
                                <span className="px-2 py-0.5 rounded-md bg-cyan-500/10 text-cyan-400 font-bold border border-cyan-500/20" title="Participación de Agencia">
                                  {ag.participacion_ag}%
                                </span>
                              </div>
                            );
                          }

                          return (
                            <div className="flex flex-col items-center gap-1 font-mono">
                              <div className="flex flex-wrap gap-1 justify-center max-w-[170px]">
                                {sisArr.map((s) => {
                                  let sysC: number | null = null;
                                  try {
                                    const c = typeof ag.condiciones_sistemas === 'string' ? JSON.parse(ag.condiciones_sistemas) : ag.condiciones_sistemas;
                                    if (c?.[s]?.comision !== undefined && c?.[s]?.comision !== null && c?.[s]?.comision !== '') {
                                      sysC = Number(c[s].comision);
                                    }
                                  } catch (_) {}
                                  const effective = sysC !== null ? sysC : ag.comision;
                                  const isCustom = sysC !== null;
                                  return (
                                    <span
                                      key={s}
                                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                        isCustom
                                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                          : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                      }`}
                                      title={isCustom ? `Comisión personalizada para ${s}` : `Comisión general`}
                                    >
                                      {s}: {effective}%
                                    </span>
                                  );
                                })}
                              </div>
                              <span className="text-[10px] text-cyan-400 font-semibold" title="Participación Agencia">
                                Part: {ag.participacion_ag}%
                              </span>
                            </div>
                          );
                        })()}
                      </td>

                      {/* Sistemas */}
                      <td className="py-3 px-4 font-sans">
                        <div className="flex flex-wrap gap-1.5 items-center">
                          {sisArr.map((s) => {
                            let cod = '';
                            let sysCom: number | null = null;
                            try {
                              const c = typeof ag.condiciones_sistemas === 'string' ? JSON.parse(ag.condiciones_sistemas) : ag.condiciones_sistemas;
                              if (c?.[s]?.codigo) cod = String(c[s].codigo).trim();
                              if (c?.[s]?.comision !== undefined && c?.[s]?.comision !== null && c?.[s]?.comision !== '') {
                                sysCom = Number(c[s].comision);
                              }
                            } catch (_) {}

                            const effectiveCom = sysCom !== null ? sysCom : ag.comision;

                            return (
                              <span
                                key={s}
                                title={cod ? `Equivalencia en ${s}: ${cod} • Comisión: ${effectiveCom}%` : `En ${s} • Comisión: ${effectiveCom}%`}
                                className="px-2 py-1 rounded-md text-[10px] font-bold bg-[#071217] text-slate-300 border border-slate-800 whitespace-nowrap inline-flex items-center gap-1.5"
                              >
                                <span className="text-emerald-400">🎰 {s}</span>
                                {cod && (
                                  <span className="text-[9px] font-mono text-cyan-300 bg-cyan-950/70 px-1 py-0.2 rounded border border-cyan-800/40">
                                    {cod}
                                  </span>
                                )}
                                <span
                                  className={`text-[9px] font-mono font-bold px-1.5 py-0.2 rounded ${
                                    sysCom !== null
                                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                      : 'bg-slate-800 text-slate-400 border border-slate-700/50'
                                  }`}
                                  title={sysCom !== null ? `Comisión específica para ${s}` : `Comisión general de la agencia`}
                                >
                                  {effectiveCom}% com
                                </span>
                              </span>
                            );
                          })}
                        </div>
                      </td>

                      {/* Monedas */}
                      <td className="py-3 px-4 text-center font-sans">
                        <div className="flex flex-wrap gap-1 justify-center items-center">
                          {monArr.map((m) => (
                            <span
                              key={m}
                              className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 whitespace-nowrap"
                            >
                              🪙 {m}
                            </span>
                          ))}
                        </div>
                      </td>

                      {/* Cuentas Bancarias / Dispositivos (Ultra Compacto) */}
                      <td className="py-3 px-4 font-sans">
                        {accArr.length > 0 ? (
                          (() => {
                            const parsedFirst = parseAccountDisplay(accArr[0], bankAccounts, devices);
                            const remaining = accArr
                              .slice(1)
                              .map((a) => parseAccountDisplay(a, bankAccounts, devices)?.shortTitle || a);
                            const fullTooltip = accArr
                              .map((a) => {
                                const p = parseAccountDisplay(a, bankAccounts, devices);
                                return p ? p.tooltip : a;
                              })
                              .join('\n');

                            return (
                              <div className="flex flex-col gap-0.5" title={fullTooltip}>
                                <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-cyan-300">
                                  {parsedFirst?.isPos ? (
                                    <Smartphone className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                                  ) : (
                                    <CreditCard className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                                  )}
                                  <span className="whitespace-nowrap font-bold text-cyan-300">
                                    {parsedFirst?.shortTitle || accArr[0]}
                                  </span>
                                </div>
                                {accArr.length > 1 && (
                                  <span className="text-[10px] text-slate-400 font-mono">
                                    +{accArr.length - 1} más ({remaining.join(', ')})
                                  </span>
                                )}
                              </div>
                            );
                          })()
                        ) : (
                          <span className="text-[11px] text-slate-500 italic">Ningún método</span>
                        )}
                      </td>

                      {/* Acceso POS (Maestro + Sub-usuarios) */}
                      <td className="py-3 px-4 font-sans">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-1.5 text-[11px]">
                            <Key className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                            <span className="font-bold text-white font-mono">{ag.usuario_taquilla || 'N/A'}</span>
                            <span className="text-[10px] text-slate-400 font-mono">({ag.clave_taquilla || '****'})</span>
                          </div>
                          {(() => {
                            const agUsers = taquillaUsers.filter((u) => u.agencia_id === ag.id);
                            const cajerosCount = agUsers.filter((u) => u.rol === 'cajero').length;
                            const supervisoresCount = agUsers.filter((u) => u.rol === 'supervisor').length;
                            return (
                              <button
                                type="button"
                                onClick={() => setTerminalUsersModalAgency(ag)}
                                className="inline-flex items-center gap-1 text-[10px] text-sky-400 hover:text-sky-300 font-bold cursor-pointer hover:underline"
                                title="Ver y gestionar cajeros y supervisores"
                              >
                                <Users className="w-3 h-3" />
                                {agUsers.length === 0 ? (
                                  <span>+ Asignar Cajero / Supervisor</span>
                                ) : (
                                  <span>{agUsers.length} usuario{agUsers.length > 1 ? 's' : ''} ({cajerosCount} cajero{cajerosCount !== 1 ? 's' : ''}, {supervisoresCount} sup.)</span>
                                )}
                              </button>
                            );
                          })()}
                        </div>
                      </td>

                      {/* Acciones */}
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => setTerminalUsersModalAgency(ag)}
                            className="p-1.5 rounded-xl bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 transition-all cursor-pointer border border-sky-500/20"
                            title="Gestionar Cajeros y Supervisores POS"
                          >
                            <Users className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleOpenEdit(ag)}
                            className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all cursor-pointer border border-slate-700"
                            title="Editar Agencia"
                          >
                            <Edit2 className="w-3.5 h-3.5 text-cyan-400" />
                          </button>
                          <button
                            onClick={() => setDeleteModalAgency(ag)}
                            className="p-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 transition-all cursor-pointer border border-rose-500/20"
                            title="Eliminar Agencia"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Vista Tarjetas (Grid) */
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
                      {(() => {
                        let customComs: { sys: string; com: number }[] = [];
                        try {
                          const c = typeof ag.condiciones_sistemas === 'string' ? JSON.parse(ag.condiciones_sistemas) : ag.condiciones_sistemas;
                          if (c) {
                            sisArr.forEach((s) => {
                              if (c[s]?.comision !== undefined && c[s]?.comision !== null && c[s]?.comision !== '') {
                                customComs.push({ sys: s, com: Number(c[s].comision) });
                              }
                            });
                          }
                        } catch (_) {}

                        if (customComs.length > 0) {
                          return (
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-slate-400">Comisiones:</span>
                              {sisArr.map((s) => {
                                let sysC: number | null = null;
                                try {
                                  const c = typeof ag.condiciones_sistemas === 'string' ? JSON.parse(ag.condiciones_sistemas) : ag.condiciones_sistemas;
                                  if (c?.[s]?.comision !== undefined && c?.[s]?.comision !== null && c?.[s]?.comision !== '') {
                                    sysC = Number(c[s].comision);
                                  }
                                } catch (_) {}
                                const effective = sysC !== null ? sysC : ag.comision;
                                const isCustom = sysC !== null;
                                return (
                                  <span
                                    key={s}
                                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                      isCustom
                                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                        : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                    }`}
                                  >
                                    {s}: {effective}%
                                  </span>
                                );
                              })}
                              <span>• Part. Ag: <strong className="text-cyan-400">{ag.participacion_ag}%</strong></span>
                            </div>
                          );
                        }

                        return (
                          <>
                            <span>Comisión: <strong className="text-emerald-400">{ag.comision}%</strong></span>
                            <span>• Part. Ag: <strong className="text-cyan-400">{ag.participacion_ag}%</strong></span>
                          </>
                        );
                      })()}
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
                  <div className="space-y-1.5">
                    <span className="text-[11px] font-bold text-slate-400 block">Sistemas y Comisiones:</span>
                    <div className="flex flex-wrap gap-1.5 items-center">
                      {sisArr.map((s) => {
                        let cod = '';
                        let sysCom: number | null = null;
                        try {
                          const c = typeof ag.condiciones_sistemas === 'string' ? JSON.parse(ag.condiciones_sistemas) : ag.condiciones_sistemas;
                          if (c?.[s]?.codigo) cod = String(c[s].codigo).trim();
                          if (c?.[s]?.comision !== undefined && c?.[s]?.comision !== null && c?.[s]?.comision !== '') {
                            sysCom = Number(c[s].comision);
                          }
                        } catch (_) {}

                        const effectiveCom = sysCom !== null ? sysCom : ag.comision;

                        return (
                          <span
                            key={s}
                            title={cod ? `Equivalencia en ${s}: ${cod} • Comisión: ${effectiveCom}%` : `En ${s} • Comisión: ${effectiveCom}%`}
                            className="px-2 py-1 rounded-lg bg-[#071217] text-slate-300 text-[10px] font-semibold border border-slate-800 inline-flex items-center gap-1.5"
                          >
                            <span className="text-emerald-400 font-bold">🎰 {s}</span>
                            {cod && (
                              <span className="text-[9px] font-mono text-cyan-300 bg-cyan-950/80 px-1 py-0.5 rounded border border-cyan-800/40">
                                {cod}
                              </span>
                            )}
                            <span
                              className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded ${
                                sysCom !== null
                                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                  : 'bg-slate-800 text-slate-400 border border-slate-700/50'
                              }`}
                              title={sysCom !== null ? `Comisión personalizada para ${s}` : `Comisión general de la agencia`}
                            >
                              {effectiveCom}% com
                            </span>
                          </span>
                        );
                      })}
                    </div>
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

                {/* Assigned Accounts & POS (Ultra Compacto) */}
                <div className="text-xs space-y-1">
                  <span className="text-[11px] font-bold text-slate-400 block">
                    Cuentas Bancarias y Dispositivos de Cobro ({accArr.length}):
                  </span>
                  {accArr.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {accArr.map((acc) => {
                        const parsed = parseAccountDisplay(acc, bankAccounts, devices);
                        return (
                          <span
                            key={acc}
                            title={parsed?.tooltip || acc}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-cyan-500/10 text-cyan-300 text-xs font-semibold border border-cyan-500/20"
                          >
                            {parsed?.isPos ? (
                              <Smartphone className="w-3 h-3 text-cyan-400 shrink-0" />
                            ) : (
                              <CreditCard className="w-3 h-3 text-cyan-400 shrink-0" />
                            )}
                            <span className="text-cyan-300 font-bold">{parsed?.shortTitle || acc}</span>
                          </span>
                        );
                      })}
                    </div>
                  ) : (
                    <span className="text-[11px] text-slate-500 italic">Ningún método asignado</span>
                  )}
                </div>

                {/* Credentials Banner */}
                <div className="pt-2 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
                  <div className="flex items-center gap-1.5">
                    <Key className="w-3.5 h-3.5 text-amber-400" />
                    <span>
                      Acceso POS: <strong className="text-white font-mono">{ag.usuario_taquilla || 'N/A'}</strong> (PIN: <strong className="text-white font-mono">{ag.clave_taquilla || '****'}</strong>)
                    </span>
                  </div>

                  {(() => {
                    const agUsers = taquillaUsers.filter((u) => u.agencia_id === ag.id);
                    return (
                      <button
                        type="button"
                        onClick={() => setTerminalUsersModalAgency(ag)}
                        className="px-2.5 py-1 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/20 text-[11px] font-bold flex items-center gap-1 transition-all cursor-pointer"
                      >
                        <Users className="w-3 h-3" />
                        <span>{agUsers.length} Usuarios POS</span>
                      </button>
                    );
                  })()}
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
                    {currencies.map((m) => {
                      const monCode = (m.nombre_moneda || '').trim().toUpperCase();
                      if (!monCode) return null;
                      const isChecked = formMonedas.some((fm) => fm.trim().toUpperCase() === monCode);
                      const displayLabel = m.simbolo && m.simbolo !== monCode ? `${monCode} (${m.simbolo})` : monCode;

                      return (
                        <label key={m.id || monCode} className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setFormMonedas([...formMonedas.filter((item) => item.toUpperCase() !== monCode), monCode]);
                              } else {
                                setFormMonedas(formMonedas.filter((item) => item.toUpperCase() !== monCode));
                              }
                            }}
                            className="rounded text-amber-500 bg-slate-900 border-slate-700 focus:ring-0"
                          />
                          <span className="font-semibold text-white">{displayLabel}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Equivalencias por Sistema (Mapeo de Terminales y Proveedores) */}
              {formSistemas.length > 0 && (
                <div className="space-y-2.5 p-3.5 bg-[#071217] rounded-2xl border border-slate-800">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                    <label className="text-xs font-bold text-white flex items-center gap-1.5">
                      <span className="text-cyan-400">🏷️</span>
                      <span>Condiciones y Equivalencias por Sistema (Comisión y Mapeo)</span>
                    </label>
                    <span className="text-[10px] text-slate-400 font-normal">
                      Configura el código/ID y comisión particular de cada proveedor
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Personaliza la <strong>Comisión %</strong> y el <strong>código/ID</strong> para cada sistema. Si la comisión del sistema se deja vacía, se aplicará la <strong>Comisión % General</strong> ({formComision || 0}%).
                  </p>

                  <div className="space-y-2.5 pt-1">
                    {formSistemas.map((sysName) => {
                      const currentCodigo = formCondicionesSistemas[sysName]?.codigo || '';
                      const currentComision = formCondicionesSistemas[sysName]?.comision !== undefined && formCondicionesSistemas[sysName]?.comision !== null
                        ? String(formCondicionesSistemas[sysName]?.comision)
                        : '';
                      const currentParticipacion = formCondicionesSistemas[sysName]?.participacion !== undefined && formCondicionesSistemas[sysName]?.participacion !== null
                        ? String(formCondicionesSistemas[sysName]?.participacion)
                        : '';

                      return (
                        <div key={sysName} className="bg-[#0D1B22] p-3 rounded-xl border border-slate-800/80 space-y-2.5">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-emerald-400 text-xs flex items-center gap-1.5">
                              <span>🎰 {sysName}</span>
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono">
                              Comisión efectiva: <strong className="text-amber-300">{currentComision !== '' ? `${currentComision}%` : `${formComision || 0}% (General)`}</strong>
                            </span>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                            <div className="space-y-1 sm:col-span-1">
                              <label className="text-[10px] font-semibold text-slate-400 block">
                                ID / Usuario en Reporte
                              </label>
                              <input
                                type="text"
                                placeholder={
                                  sysName.toUpperCase().includes('GATO')
                                    ? 'Ej: chucho@banklot.net o 502'
                                    : sysName.toUpperCase().includes('BET')
                                    ? 'Ej: CHUCHO o 045'
                                    : 'Ej: ID / Código en sistema'
                                }
                                value={currentCodigo}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setFormCondicionesSistemas((prev) => ({
                                    ...prev,
                                    [sysName]: {
                                      ...(prev[sysName] || {}),
                                      codigo: val,
                                    },
                                  }));
                                }}
                                className="w-full bg-[#071217] border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono placeholder:text-slate-600 focus:outline-none focus:border-cyan-500"
                              />
                            </div>

                            <div className="space-y-1">
                              <label className="text-[10px] font-semibold text-slate-400 block">
                                Comisión % para {sysName}
                              </label>
                              <input
                                type="number"
                                step="0.1"
                                min="0"
                                max="100"
                                placeholder={`General (${formComision || 0}%)`}
                                value={currentComision}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setFormCondicionesSistemas((prev) => {
                                    const next = { ...prev };
                                    if (val === '') {
                                      const { comision, ...rest } = next[sysName] || {};
                                      next[sysName] = rest;
                                    } else {
                                      next[sysName] = {
                                        ...(next[sysName] || {}),
                                        comision: Number(val),
                                      };
                                    }
                                    return next;
                                  });
                                }}
                                className="w-full bg-[#071217] border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs text-amber-300 font-mono placeholder:text-slate-600 focus:outline-none focus:border-amber-500"
                              />
                            </div>

                            <div className="space-y-1">
                              <label className="text-[10px] font-semibold text-slate-400 block">
                                Participación Agencia %
                              </label>
                              <input
                                type="number"
                                step="0.1"
                                min="0"
                                max="100"
                                placeholder={`General (${formParticipacion || 0}%)`}
                                value={currentParticipacion}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setFormCondicionesSistemas((prev) => {
                                    const next = { ...prev };
                                    if (val === '') {
                                      const { participacion, ...rest } = next[sysName] || {};
                                      next[sysName] = rest;
                                    } else {
                                      next[sysName] = {
                                        ...(next[sysName] || {}),
                                        participacion: Number(val),
                                      };
                                    }
                                    return next;
                                  });
                                }}
                                className="w-full bg-[#071217] border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs text-cyan-300 font-mono placeholder:text-slate-600 focus:outline-none focus:border-cyan-500"
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

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

              {/* Accounts & Devices Assignment */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-300">
                  Dispositivos de Cobro y Cuentas Bancarias Asignadas
                </label>
                <div className="p-3 bg-[#071217] rounded-xl border border-slate-800 max-h-48 overflow-y-auto space-y-1.5">
                  {accountOptions.length === 0 ? (
                    <span className="text-xs text-slate-500 italic">No hay cuentas ni dispositivos registrados.</span>
                  ) : (
                    accountOptions.map((opt) => {
                      const parsed = parseAccountDisplay(opt, bankAccounts, devices);
                      const optId = opt.match(/^(\d+)\s*-\s*/)?.[1];
                      const isChecked = formCuentasAsignadas.some((item) => {
                        const itemId = item.match(/^(\d+)\s*-\s*/)?.[1];
                        return optId && itemId ? optId === itemId : item.trim() === opt.trim();
                      });

                      return (
                        <label
                          key={opt}
                          title={parsed?.tooltip || opt}
                          className="flex items-center gap-2.5 text-xs text-slate-300 cursor-pointer p-1.5 rounded-lg hover:bg-slate-800/50 transition-colors"
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                const withoutSame = formCuentasAsignadas.filter((item) => {
                                  const itemId = item.match(/^(\d+)\s*-\s*/)?.[1];
                                  return optId && itemId ? optId !== itemId : item.trim() !== opt.trim();
                                });
                                setFormCuentasAsignadas([...withoutSame, opt]);
                              } else {
                                setFormCuentasAsignadas(
                                  formCuentasAsignadas.filter((item) => {
                                    const itemId = item.match(/^(\d+)\s*-\s*/)?.[1];
                                    return optId && itemId ? optId !== itemId : item.trim() !== opt.trim();
                                  })
                                );
                              }
                            }}
                            className="rounded text-cyan-500 bg-slate-900 border-slate-700 focus:ring-0"
                          />
                          <div className="flex items-center gap-1.5 flex-1 min-w-0">
                            {parsed?.isPos ? (
                              <Smartphone className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                            ) : (
                              <CreditCard className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                            )}
                            <span className="font-bold text-white text-xs">
                              {parsed?.shortTitle || opt}
                            </span>
                            {parsed?.titular && (
                              <span className="text-[11px] text-slate-400 truncate">
                                — {parsed.titular}
                              </span>
                            )}
                          </div>
                        </label>
                      );
                    })
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
      {/* =========================================================================
          TERMINAL USERS MODAL (Cajeros y Supervisores POS)
      ========================================================================= */}
      {terminalUsersModalAgency && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#0D1B22] border border-slate-800 rounded-3xl p-6 sm:p-8 max-w-xl w-full space-y-5 shadow-2xl animate-fade-in my-8">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    Terminales y Accesos POS: <span className="text-emerald-400 font-black">{terminalUsersModalAgency.nombre_agencia}</span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    Cajeros y Supervisores de Taquilla Web POS para esta agencia.
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setTerminalUsersModalAgency(null);
                  setEditingUser(null);
                }}
                className="text-slate-400 hover:text-white text-xs font-bold p-1 rounded-lg hover:bg-slate-800 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Acceso Principal de la Agencia */}
            <div className="p-3 bg-[#071217] rounded-2xl border border-slate-800/80 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <Key className="w-4 h-4 text-amber-400 shrink-0" />
                <div>
                  <span className="text-slate-400 text-[10px] uppercase font-bold block">Acceso Maestro Agencia</span>
                  <span className="font-mono font-bold text-white">{terminalUsersModalAgency.usuario_taquilla || 'Sin usuario'}</span>
                  <span className="text-slate-400 font-mono text-[11px] ml-1">({terminalUsersModalAgency.clave_taquilla || '****'})</span>
                </div>
              </div>
              <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 text-[10px] font-bold border border-emerald-500/20">
                Rol: Agencia
              </span>
            </div>

            {/* List of sub-cashiers and supervisors */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <UserCheck className="w-3.5 h-3.5 text-sky-400" />
                  <span>Usuarios Asignados ({taquillaUsers.filter((u) => u.agencia_id === terminalUsersModalAgency.id).length})</span>
                </h4>
              </div>

              {(() => {
                const agUsers = taquillaUsers.filter((u) => u.agencia_id === terminalUsersModalAgency.id);
                if (agUsers.length === 0) {
                  return (
                    <div className="p-4 rounded-xl bg-[#071217] border border-dashed border-slate-800 text-center text-xs text-slate-400">
                      No hay cajeros ni supervisores adicionales registrados. Puedes crear uno abajo.
                    </div>
                  );
                }

                return (
                  <div className="space-y-2 max-h-56 overflow-y-auto">
                    {agUsers.map((u) => {
                      const isSupervisor = u.rol === 'supervisor';
                      return (
                        <div
                          key={u.id}
                          className="flex items-center justify-between p-3 rounded-xl bg-[#071217] border border-slate-800 text-xs hover:border-slate-700 transition-colors"
                        >
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-white">{u.usuario}</span>
                              <span
                                className={`text-[9px] px-2 py-0.5 rounded-md font-extrabold uppercase ${
                                  isSupervisor
                                    ? 'bg-blue-500/10 text-blue-400 border border-blue-500/30'
                                    : 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                                }`}
                              >
                                {u.rol}
                              </span>
                              {!u.activo && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 font-bold">
                                  Inactivo
                                </span>
                              )}
                            </div>
                            {u.nombre_cajero && (
                              <div className="text-[11px] text-slate-400">{u.nombre_cajero}</div>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => {
                                setEditingUser(u);
                                setEditRol((u.rol as any) === 'supervisor' ? 'supervisor' : 'cajero');
                                setEditActivo(u.activo ?? true);
                                setEditClave('');
                              }}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                              title="Modificar Rol o Clave"
                            >
                              <Edit2 className="w-3.5 h-3.5 text-cyan-400" />
                            </button>
                            <button
                              onClick={() => handleDeleteTaquillaUser(u)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                              title="Eliminar Usuario"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>

            {/* Create New User Form */}
            <form onSubmit={handleCreateTaquillaUser} className="p-4 bg-[#071217] rounded-2xl border border-slate-800 space-y-3 pt-3">
              <span className="text-xs font-bold text-white block">
                + Crear Nuevo Usuario (Cajero o Supervisor)
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="text-[10px] font-semibold text-slate-400 block mb-1">Rol</label>
                  <select
                    value={newRol}
                    onChange={(e) => setNewRol(e.target.value as any)}
                    className="w-full bg-[#0D1B22] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-500 font-semibold"
                  >
                    <option value="cajero">Cajero (Operador POS)</option>
                    <option value="supervisor">Supervisor (Control y Pizarra)</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-semibold text-slate-400 block mb-1">Nombre / Identificador</label>
                  <input
                    type="text"
                    placeholder="Ej: Turno Mañana / Juan"
                    value={newNombreCajero}
                    onChange={(e) => setNewNombreCajero(e.target.value)}
                    className="w-full bg-[#0D1B22] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-500"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-semibold text-slate-400 block mb-1">Usuario de Acceso *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej: juan_pos"
                    value={newUsuario}
                    onChange={(e) => setNewUsuario(e.target.value)}
                    className="w-full bg-[#0D1B22] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-sky-500"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-semibold text-slate-400 block mb-1">Clave / PIN *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej: 123456"
                    value={newClave}
                    onChange={(e) => setNewClave(e.target.value)}
                    className="w-full bg-[#0D1B22] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-sky-500"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-1">
                <button
                  type="submit"
                  disabled={isProcessing}
                  className="px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs shadow-md transition-all cursor-pointer disabled:opacity-50"
                >
                  {isProcessing ? 'Creando...' : 'Crear Usuario'}
                </button>
              </div>
            </form>

            <div className="flex justify-end pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setTerminalUsersModalAgency(null);
                  setEditingUser(null);
                }}
                className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs transition-all cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Single Terminal User Modal */}
      {editingUser && (
        <div className="fixed inset-0 z-60 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-[#0D1B22] border border-slate-800 rounded-3xl p-6 max-w-sm w-full space-y-4 shadow-2xl">
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
              <Key className="w-4 h-4 text-sky-400" />
              <span>Editar Usuario: <code className="text-sky-400">{editingUser.usuario}</code></span>
            </h4>

            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Modificar Rol</label>
              <select
                value={editRol}
                onChange={(e) => setEditRol(e.target.value as any)}
                className="w-full bg-[#071217] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-semibold"
              >
                <option value="cajero">Cajero (Operador POS)</option>
                <option value="supervisor">Supervisor (Control y Pizarra)</option>
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Nueva Clave (opcional)</label>
              <input
                type="text"
                placeholder="dejar vacío = sin cambios"
                value={editClave}
                onChange={(e) => setEditClave(e.target.value)}
                className="w-full bg-[#071217] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono"
              />
            </div>

            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={editActivo}
                onChange={(e) => setEditActivo(e.target.checked)}
                className="rounded text-sky-500 bg-slate-900 border-slate-700 focus:ring-0"
              />
              <span>Usuario Activo (Habilitado para Login)</span>
            </label>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                className="px-3 py-1.5 rounded-xl text-xs text-slate-400 hover:text-white"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleUpdateTaquillaUser}
                disabled={isProcessing}
                className="px-4 py-1.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs disabled:opacity-50"
              >
                {isProcessing ? 'Guardando...' : 'Actualizar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
