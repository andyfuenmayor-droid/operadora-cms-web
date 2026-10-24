import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { formatCurrency } from '../../utils/formatters';
import { loadCurrencies, getCurrencyBadgeClasses, getCurrencyFlag, type CurrencyConfig } from '../../utils/currencies';
import { loadSaaSActiveSystems } from '../../utils/sistemas';
import { loadSaaSGroups, saveSaaSGroups } from '../../utils/grupos';
import { UI_LOCK } from '../../styles/uiDesignLock';
import type { Agency, BetSystem, Grupo } from '../../types';
import {
  Handshake,
  Plus,
  Search,
  Edit2,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  X,
  Save,
  Users,
  Store,
  Sliders,
  DollarSign,
  ShieldAlert,
  Percent,
  Check,
  Building2,
  CheckCheck,
} from 'lucide-react';
import confetti from 'canvas-confetti';

export const GroupsTab: React.FC = () => {
  const { effectiveUserId } = useAuth();

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Data states
  const [groups, setGroups] = useState<Grupo[]>([]);
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [systems, setSystems] = useState<BetSystem[]>([]);
  const [currencies, setCurrencies] = useState<CurrencyConfig[]>([]);

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<Grupo | null>(null);

  // Form states
  const [nombreGrupo, setNombreGrupo] = useState('');
  const [codigo, setCodigo] = useState('');
  const [responsable, setResponsable] = useState('');
  const [telefono, setTelefono] = useState('');
  const [emailAcceso, setEmailAcceso] = useState('');
  const [passwordAcceso, setPasswordAcceso] = useState('1234');
  const [selectedMonedas, setSelectedMonedas] = useState<string[]>([]);
  const [comisionDefault, setComisionDefault] = useState('15');
  const [participacionDefault, setParticipacionDefault] = useState('30');
  const [condicionesSistemas, setCondicionesSistemas] = useState<Record<string, { comision?: number; participacion?: number }>>({});
  const [saldoBs, setSaldoBs] = useState('0');
  const [saldoUsd, setSaldoUsd] = useState('0');
  const [saldoCop, setSaldoCop] = useState('0');
  const [saldosDinamicos, setSaldosDinamicos] = useState<Record<string, string>>({});

  // Tree Manager Modal state (Assign Agencies in Bulk)
  const [treeModalGroup, setTreeModalGroup] = useState<Grupo | null>(null);
  const [selectedAgencyIds, setSelectedAgencyIds] = useState<number[]>([]);
  const [treeSearch, setTreeSearch] = useState('');
  const [savingTree, setSavingTree] = useState(false);

  // Helper: Persist groups to both localStorage and Supabase config_sistema
  const saveGroupsPersistently = async (updatedList: Grupo[], userId: string) => {
    await saveSaaSGroups(userId, updatedList);
  };

  // Helper: Load groups from all storage tiers with currency sanitization
  const loadGroupsPersistently = async (userId: string, activeCurrs?: CurrencyConfig[]): Promise<Grupo[]> => {
    return await loadSaaSGroups(userId, activeCurrs);
  };

  // Load all data
  const loadData = useCallback(async () => {
    if (!effectiveUserId) return;
    setLoading(true);
    setMessage(null);

    try {
      // 1. Cargar divisas habilitadas del suscriptor SaaS
      const currList = await loadCurrencies(effectiveUserId);
      setCurrencies(currList);

      // 2. Cargar sistemas habilitados, agencias y catálogo de grupos
      const [sysList, agRes, loadedGroups] = await Promise.all([
        loadSaaSActiveSystems(effectiveUserId),
        supabase.from('agencias').select('*').eq('user_id', effectiveUserId).order('nombre_agencia', { ascending: true }),
        loadSaaSGroups(effectiveUserId, currList),
      ]);

      setSystems(sysList);
      setAgencies(agRes.data || []);
      setGroups(loadedGroups);
    } catch (err: any) {
      console.error('Error loading groups data:', err);
      setMessage({ type: 'error', text: err?.message || 'Error al cargar datos.' });
    } finally {
      setLoading(false);
    }
  }, [effectiveUserId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Open Create Modal
  const handleOpenCreate = () => {
    setEditingGroup(null);
    setNombreGrupo('');
    setCodigo('');
    setResponsable('');
    setTelefono('');
    setEmailAcceso('');
    setPasswordAcceso('1234');
    const activeCodes = currencies.map((c) => c.codigo);
    setSelectedMonedas(activeCodes);
    setComisionDefault('15');
    setParticipacionDefault('30');
    setCondicionesSistemas({});
    setSaldoBs('0');
    setSaldoUsd('0');
    setSaldoCop('0');
    const initialDyn: Record<string, string> = {};
    activeCodes.forEach((c) => {
      initialDyn[c] = '0';
    });
    setSaldosDinamicos(initialDyn);
    setIsModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEdit = (grp: Grupo) => {
    setEditingGroup(grp);
    setNombreGrupo(grp.nombre_grupo);
    setCodigo(grp.codigo || '');
    setResponsable(grp.responsable || '');
    setTelefono(grp.telefono || '');
    setEmailAcceso(grp.email_acceso || '');
    setPasswordAcceso(grp.password_acceso || '1234');
    const activeCodes = currencies.map((c) => c.codigo);
    const assigned = grp.monedas
      ? grp.monedas
          .split(',')
          .map((m) => m.trim().toUpperCase())
          .filter((m) => activeCodes.includes(m))
      : activeCodes;
    setSelectedMonedas(assigned.length > 0 ? assigned : activeCodes);
    setComisionDefault(String(grp.comision_pct_default ?? 15));
    setParticipacionDefault(String(grp.participacion_pct_default ?? 30));

    let conds: Record<string, any> = {};
    try {
      conds = typeof grp.condiciones_sistemas === 'string' ? JSON.parse(grp.condiciones_sistemas) : (grp.condiciones_sistemas || {});
    } catch (_) {
      conds = {};
    }
    setCondicionesSistemas(conds);

    let dynSaldos: Record<string, any> = {};
    try {
      dynSaldos = typeof grp.saldos_iniciales_json === 'string' ? JSON.parse(grp.saldos_iniciales_json) : (grp.saldos_iniciales_json || {});
    } catch (_) {
      dynSaldos = {};
    }
    const formattedDyn: Record<string, string> = {};
    if (grp.saldo_inicial_bs) formattedDyn['BS'] = String(grp.saldo_inicial_bs);
    if (grp.saldo_inicial_usd) formattedDyn['USD'] = String(grp.saldo_inicial_usd);
    if (grp.saldo_inicial_cop && activeCodes.includes('COP')) formattedDyn['COP'] = String(grp.saldo_inicial_cop);
    Object.entries(dynSaldos).forEach(([k, v]) => {
      if (activeCodes.includes(k)) {
        formattedDyn[k] = String(v);
      }
    });
    setSaldosDinamicos(formattedDyn);

    setIsModalOpen(true);
  };

  // Toggle Moneda selection
  const toggleMoneda = (code: string) => {
    setSelectedMonedas((prev) =>
      prev.includes(code) ? prev.filter((m) => m !== code) : [...prev, code]
    );
  };

  // Save Group (Create / Update)
  const handleSaveGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanNombre = nombreGrupo.trim().toUpperCase();
    if (!cleanNombre) {
      alert('Por favor ingrese el nombre del Grupo.');
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      const activeCodes = currencies.map((c) => c.codigo);
      const sanitizedMonedas = selectedMonedas.filter((m) => activeCodes.includes(m));
      const finalMonedas = sanitizedMonedas.length > 0 ? sanitizedMonedas : activeCodes;

      const parsedDynSaldos: Record<string, number> = {};
      finalMonedas.forEach((m) => {
        const num = parseFloat(saldosDinamicos[m] || '0');
        parsedDynSaldos[m] = isNaN(num) ? 0 : num;
      });

      const payload: Partial<Grupo> = {
        user_id: effectiveUserId,
        nombre_grupo: cleanNombre,
        codigo: codigo.trim().toUpperCase() || undefined,
        responsable: responsable.trim() || undefined,
        telefono: telefono.trim() || undefined,
        email_acceso: emailAcceso.trim().toLowerCase() || undefined,
        password_acceso: passwordAcceso.trim() || '1234',
        monedas: finalMonedas.join(','),
        comision_pct_default: parseFloat(comisionDefault) || 0,
        participacion_pct_default: parseFloat(participacionDefault) || 0,
        condiciones_sistemas: JSON.stringify(condicionesSistemas),
        saldo_inicial_bs: parsedDynSaldos['BS'] ?? 0,
        saldo_inicial_usd: parsedDynSaldos['USD'] ?? 0,
        saldo_inicial_cop: activeCodes.includes('COP') ? (parsedDynSaldos['COP'] ?? 0) : 0,
        saldos_iniciales_json: JSON.stringify(parsedDynSaldos),
        activo: editingGroup?.activo ?? true,
        agencias_ids: editingGroup?.agencias_ids || [],
      };

      const savedId = editingGroup?.id || Date.now();
      const updatedList = editingGroup
        ? groups.map((g) => (g.id === editingGroup.id ? ({ ...g, ...payload, id: g.id } as Grupo) : g))
        : [...groups, { ...payload, id: savedId } as Grupo];

      // Actualizar estado local de inmediato para respuesta instantánea en UI
      setGroups(updatedList);

      // Guardar de forma persistente en almacenamiento multicapa
      await saveGroupsPersistently(updatedList, effectiveUserId);

      // Intentar actualizar o insertar en tabla física si existe
      try {
        if (editingGroup) {
          await supabase
            .from('grupos')
            .update(payload)
            .eq('id', editingGroup.id)
            .eq('user_id', effectiveUserId);
        } else {
          await supabase
            .from('grupos')
            .insert({ ...payload, id: savedId });
        }
      } catch (_) {}

      confetti({ particleCount: 35, spread: 60 });
      setMessage({
        type: 'success',
        text: `✅ Grupo '${cleanNombre}' ${editingGroup ? 'actualizado' : 'creado'} exitosamente.`,
      });
      setIsModalOpen(false);
    } catch (err: any) {
      console.error('Error saving group:', err);
      setMessage({ type: 'error', text: err?.message || 'Error al guardar el grupo.' });
    } finally {
      setSaving(false);
    }
  };

  // Open Tree Manager Modal (Bulk Agency Assignment)
  const handleOpenTreeManager = (grp: Grupo) => {
    setTreeModalGroup(grp);
    setTreeSearch('');
    // Find all agencies currently belonging to this group
    const daughterIds = agencies
      .filter((a) => (grp.agencias_ids && grp.agencias_ids.includes(a.id)) || a.grupo_id === grp.id || a.grupo_nombre?.toUpperCase() === grp.nombre_grupo.toUpperCase())
      .map((a) => a.id);
    setSelectedAgencyIds(daughterIds);
  };

  // Save Bulk Agency Assignment
  const handleSaveTreeAssignment = async () => {
    if (!treeModalGroup || !effectiveUserId) return;
    setSavingTree(true);

    try {
      const gId = treeModalGroup.id;
      const gNom = treeModalGroup.nombre_grupo;

      // 1. Guardar los IDs en el propio grupo y actualizar estado
      const updatedGroups = groups.map((g) => {
        if (g.id === gId) {
          return { ...g, agencias_ids: selectedAgencyIds };
        }
        return g;
      });
      setGroups(updatedGroups);
      await saveGroupsPersistently(updatedGroups, effectiveUserId);

      // 2. Intentar actualizar tabla agencias en Supabase si las columnas existen
      try {
        for (const ag of agencies) {
          const shouldBelong = selectedAgencyIds.includes(ag.id);
          const currentlyBelongs = (treeModalGroup.agencias_ids && treeModalGroup.agencias_ids.includes(ag.id)) || ag.grupo_id === gId || ag.grupo_nombre?.toUpperCase() === gNom.toUpperCase();

          if (shouldBelong && !currentlyBelongs) {
            await supabase
              .from('agencias')
              .update({ grupo_id: gId, grupo_nombre: gNom })
              .eq('id', ag.id)
              .eq('user_id', effectiveUserId);
          } else if (!shouldBelong && currentlyBelongs) {
            await supabase
              .from('agencias')
              .update({ grupo_id: null, grupo_nombre: null })
              .eq('id', ag.id)
              .eq('user_id', effectiveUserId);
          }
        }
      } catch (colErr) {
        console.warn('Columnas grupo_id/grupo_nombre no existen en tabla agencias, usando mapeo persistido en grupo:', colErr);
      }

      confetti({ particleCount: 30, spread: 50 });
      setMessage({
        type: 'success',
        text: `✅ Árbol del Grupo '${gNom}' actualizado: ${selectedAgencyIds.length} agencias asignadas.`,
      });
      setTreeModalGroup(null);
    } catch (err: any) {
      console.error('Error saving agency tree:', err);
      alert(`Error al guardar árbol: ${err?.message}`);
    } finally {
      setSavingTree(false);
    }
  };

  // Toggle active group status
  const handleToggleActive = async (grp: Grupo) => {
    try {
      const nextActive = !grp.activo;
      const updated = groups.map((g) => (g.id === grp.id ? { ...g, activo: nextActive } : g));
      setGroups(updated);
      await saveGroupsPersistently(updated, effectiveUserId);

      try {
        await supabase
          .from('grupos')
          .update({ activo: nextActive })
          .eq('id', grp.id)
          .eq('user_id', effectiveUserId);
      } catch (_) {}

      setMessage({
        type: 'success',
        text: `Grupo '${grp.nombre_grupo}' ${nextActive ? 'activado' : 'desactivado'}.`,
      });
    } catch (err: any) {
      alert(`Error: ${err?.message}`);
    }
  };

  // Delete group
  const handleDeleteGroup = async (grp: Grupo) => {
    if (!window.confirm(`¿Está seguro de eliminar el Grupo '${grp.nombre_grupo}'?`)) return;
    try {
      const updated = groups.filter((g) => g.id !== grp.id);
      setGroups(updated);
      await saveGroupsPersistently(updated, effectiveUserId);

      try {
        await supabase
          .from('grupos')
          .delete()
          .eq('id', grp.id)
          .eq('user_id', effectiveUserId);
      } catch (_) {}

      setMessage({
        type: 'success',
        text: `Grupo '${grp.nombre_grupo}' eliminado correctamente.`,
      });
    } catch (err: any) {
      alert(`Error: ${err?.message}`);
    }
  };

  // Filtered groups
  const filteredGroups = useMemo(() => {
    return groups.filter((g) => {
      const q = searchQuery.toLowerCase();
      return (
        g.nombre_grupo.toLowerCase().includes(q) ||
        (g.codigo && g.codigo.toLowerCase().includes(q)) ||
        (g.responsable && g.responsable.toLowerCase().includes(q))
      );
    });
  }, [groups, searchQuery]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className={UI_LOCK.headerCard}>
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20">
            <Handshake className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">
              Gestión de Grupos (Intermediarios / Sub-Comercializadores)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Administra redes de agencias intermediadas, asigna comisiones de diferencial (overriding) y liquida utilidades compartidas.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadData}
            disabled={loading}
            className="p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors flex items-center gap-1.5 text-xs font-semibold border border-slate-300 dark:border-slate-700 cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-emerald-500' : ''}`} />
            <span className="hidden sm:inline">Refrescar</span>
          </button>

          <button
            onClick={handleOpenCreate}
            className={UI_LOCK.buttonPrimary + ' text-xs'}
          >
            <Plus className="w-4 h-4" />
            <span>NUEVO GRUPO</span>
          </button>
        </div>
      </div>

      {/* Message Alert */}
      {message && (
        <div
          className={`p-3.5 rounded-xl border text-xs font-semibold flex items-center gap-2 ${
            message.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-500/10 dark:border-emerald-500/30 dark:text-emerald-400'
              : 'bg-rose-50 border-rose-200 text-rose-800 dark:bg-rose-500/10 dark:border-rose-500/30 dark:text-rose-400'
          }`}
        >
          {message.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
          <span>{message.text}</span>
        </div>
      )}

      {/* Search & Stats Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por grupo, código o responsable..."
            className={UI_LOCK.input + ' pl-9 text-xs font-medium'}
          />
        </div>

        <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 self-end sm:self-auto font-mono">
          <span>Total Grupos: <strong className="text-slate-900 dark:text-white">{groups.length}</strong></span>
          <span>•</span>
          <span>Activos: <strong className="text-emerald-600 dark:text-emerald-400">{groups.filter((g) => g.activo !== false).length}</strong></span>
          <span>•</span>
          <span>Agencias en Grupos: <strong className="text-cyan-600 dark:text-cyan-400">{agencies.filter((a) => Boolean(a.grupo_id || a.grupo_nombre) || groups.some((g) => g.agencias_ids?.includes(a.id))).length}</strong></span>
        </div>
      </div>

      {/* Groups Grid / Cards */}
      {filteredGroups.length === 0 ? (
        <div className={UI_LOCK.card + ' p-12 text-center'}>
          <Handshake className="w-12 h-12 text-slate-400 dark:text-slate-600 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1">No hay grupos registrados</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto mb-5">
            Crea intermediarios o sub-comercializadores para agrupar agencias y liquidar comisiones y utilidades diferenciales.
          </p>
          <button
            onClick={handleOpenCreate}
            className={UI_LOCK.buttonPrimary + ' text-xs'}
          >
            <Plus className="w-4 h-4" />
            <span>CREAR PRIMER GRUPO</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredGroups.map((grp) => {
            const daughterCount = agencies.filter(
              (a) => (grp.agencias_ids && grp.agencias_ids.includes(a.id)) || a.grupo_id === grp.id || a.grupo_nombre?.toUpperCase() === grp.nombre_grupo.toUpperCase()
            ).length;

            const activeCodes = currencies.length > 0 ? currencies.map((c) => c.codigo) : ['BS', 'USD'];
            const grpMonedas = grp.monedas
              ? grp.monedas
                  .split(',')
                  .map((m) => m.trim().toUpperCase())
                  .filter((m) => activeCodes.includes(m))
              : activeCodes;

            return (
              <div
                key={grp.id}
                className={UI_LOCK.card + ` p-4 transition-all flex flex-col justify-between hover:border-emerald-500/40 ${
                  grp.activo !== false ? '' : 'border-rose-300 dark:border-rose-900/30 opacity-70'
                }`}
              >
                <div>
                  {/* Top card header */}
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-black text-slate-900 dark:text-white tracking-wide">{grp.nombre_grupo}</span>
                        {grp.codigo && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                            {grp.codigo}
                          </span>
                        )}
                      </div>
                      {grp.responsable && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1">
                          <span>Resp:</span>
                          <strong className="text-slate-800 dark:text-slate-200">{grp.responsable}</strong>
                        </p>
                      )}
                    </div>

                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                        grp.activo !== false
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20'
                          : 'bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20'
                      }`}
                    >
                      {grp.activo !== false ? 'ACTIVO' : 'INACTIVO'}
                    </span>
                  </div>

                  {/* Conditions Pills */}
                  <div className="grid grid-cols-2 gap-2 my-3 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800/80 text-xs">
                    <div>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold block uppercase">Comisión Default</span>
                      <strong className="text-emerald-600 dark:text-emerald-400 font-mono text-sm">{grp.comision_pct_default || 0}%</strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold block uppercase">Participación</span>
                      <strong className="text-cyan-600 dark:text-cyan-400 font-mono text-sm">{grp.participacion_pct_default || 0}%</strong>
                    </div>
                  </div>

                  {/* Assigned Currencies */}
                  <div className="mb-3">
                    <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase block mb-1">Divisas Activas:</span>
                    <div className="flex flex-wrap gap-1">
                      {grpMonedas.map((m) => (
                        <span
                          key={m}
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-black ${getCurrencyBadgeClasses(m)}`}
                        >
                          <span>{getCurrencyFlag(m)}</span>
                          <span>{m}</span>
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Daughter Agencies Tag */}
                  <div className="flex items-center justify-between text-xs py-2 border-t border-slate-200 dark:border-slate-800/60 font-mono">
                    <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1">
                      <Store className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                      <span>Agencias Hijas:</span>
                    </span>
                    <span className="font-bold text-slate-800 dark:text-white px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800">
                      {daughterCount} agencias
                    </span>
                  </div>
                </div>

                {/* Card Actions */}
                <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-200 dark:border-slate-800 mt-2">
                  <button
                    onClick={() => handleOpenTreeManager(grp)}
                    className="flex-1 py-1.5 px-2.5 rounded-xl bg-cyan-50 hover:bg-cyan-100 dark:bg-cyan-950/60 dark:hover:bg-cyan-900/80 text-cyan-800 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800/50 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    title="Asignar agencias a este grupo"
                  >
                    <Users className="w-3.5 h-3.5" />
                    <span>Asignar Agencias ({daughterCount})</span>
                  </button>

                  <button
                    onClick={() => handleOpenEdit(grp)}
                    className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
                    title="Editar Grupo"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => handleToggleActive(grp)}
                    className={`p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer ${
                      grp.activo !== false ? 'hover:bg-rose-50 text-slate-500 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400 dark:hover:bg-rose-500/20' : 'hover:bg-emerald-50 text-emerald-600 dark:text-emerald-400 dark:hover:bg-emerald-500/20'
                    }`}
                    title={grp.activo !== false ? 'Desactivar Grupo' : 'Activar Grupo'}
                  >
                    <ShieldAlert className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => handleDeleteGroup(grp)}
                    className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-rose-50 text-slate-400 hover:text-rose-600 dark:hover:bg-rose-500/20 dark:hover:text-rose-400 transition-colors cursor-pointer"
                    title="Eliminar Grupo"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: CREAR / EDITAR GRUPO                                             */}
      {/* ========================================================================= */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 overflow-y-auto">
          <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-3xl shadow-2xl overflow-hidden my-6">
            <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-900/60">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20">
                  <Handshake className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    {editingGroup ? `Editar Grupo: ${editingGroup.nombre_grupo}` : 'Nuevo Grupo (Intermediario)'}
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Define la configuración financiera y comisiones para esta red de agencias.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveGroup} className="p-6 space-y-5 text-xs">
              {/* Sección 1: Datos Generales */}
              <div className="space-y-3">
                <h4 className="text-[11px] font-bold uppercase text-emerald-600 dark:text-emerald-400 tracking-wider flex items-center gap-1.5">
                  <Building2 className="w-4 h-4" />
                  <span>1. Datos Generales del Grupo</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">Nombre del Grupo / Razón Social *</label>
                    <input
                      type="text"
                      value={nombreGrupo}
                      onChange={(e) => setNombreGrupo(e.target.value)}
                      placeholder="Ej: GRUPO OCCIDENTE, CONSORCIO MARACAIBO"
                      className={UI_LOCK.input + ' font-bold uppercase'}
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">Código / Sigla</label>
                    <input
                      type="text"
                      value={codigo}
                      onChange={(e) => setCodigo(e.target.value)}
                      placeholder="Ej: G-OCC, C-MCB"
                      className={UI_LOCK.input + ' font-bold uppercase'}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">Responsable / Representante</label>
                    <input
                      type="text"
                      value={responsable}
                      onChange={(e) => setResponsable(e.target.value)}
                      placeholder="Ej: Juan Pérez"
                      className={UI_LOCK.input}
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">Teléfono / WhatsApp</label>
                    <input
                      type="text"
                      value={telefono}
                      onChange={(e) => setTelefono(e.target.value)}
                      placeholder="Ej: +58 414 1234567"
                      className={UI_LOCK.input + ' font-mono'}
                    />
                  </div>
                </div>
              </div>

              {/* Sección 2: Monedas Habilitadas */}
              <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                <label className="block text-slate-700 dark:text-slate-300 font-bold">
                  2. Divisas Autorizadas para el Grupo (Multi-Divisa Dinámica)
                </label>
                <div className="flex flex-wrap gap-2">
                  {currencies.map((c) => {
                    const isSelected = selectedMonedas.includes(c.codigo);
                    return (
                      <button
                        type="button"
                        key={c.codigo}
                        onClick={() => toggleMoneda(c.codigo)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 border transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-emerald-50 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 border-emerald-500 shadow-sm'
                            : 'bg-slate-100 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-800'
                        }`}
                      >
                        <span>{getCurrencyFlag(c.codigo)}</span>
                        <span>{c.codigo}</span>
                        {isSelected && <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 ml-0.5" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Sección 3: Reglas de Liquidación y Overriding */}
              <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800">
                <h4 className="text-[11px] font-bold uppercase text-cyan-600 dark:text-cyan-400 tracking-wider flex items-center gap-1.5">
                  <Percent className="w-4 h-4" />
                  <span>3. Porcentajes de Comisión y Participación al Grupo</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800">
                    <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                      % Comisión Pactada al Grupo (Base) *
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        max="100"
                        value={comisionDefault}
                        onChange={(e) => setComisionDefault(e.target.value)}
                        className={UI_LOCK.input + ' font-mono font-bold text-sm'}
                        required
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">%</span>
                    </div>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                      El grupo gana: <code>% Grupo - % Agencia Hija</code> sobre la venta.
                    </p>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800">
                    <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                      % Participación en Utilidad Neta (Base) *
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        max="100"
                        value={participacionDefault}
                        onChange={(e) => setParticipacionDefault(e.target.value)}
                        className={UI_LOCK.input + ' font-mono font-bold text-sm'}
                        required
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">%</span>
                    </div>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                      Reparto sobre la utilidad limpia tras premios y comisiones.
                    </p>
                  </div>
                </div>

                {/* Overriding conditions per system/operator */}
                {systems.length > 0 && (
                  <div className="mt-3 p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/30 border border-slate-200 dark:border-slate-800 space-y-2.5">
                    <span className="text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase block">
                      Condiciones Específicas por Casa Operadora / Sistema (Opcional):
                    </span>
                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                      {systems.map((sys) => {
                        const curEntry = condicionesSistemas[sys.nombre_sistema] || {};
                        return (
                          <div
                            key={sys.nombre_sistema}
                            className="flex items-center justify-between gap-3 p-2 rounded-xl bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700"
                          >
                            <span className="font-bold text-slate-800 dark:text-white text-xs">{sys.nombre_sistema}</span>
                            <div className="flex items-center gap-2">
                              <div className="flex items-center gap-1">
                                <span className="text-[10px] text-slate-500">Com:</span>
                                <input
                                  type="number"
                                  step="0.5"
                                  placeholder={comisionDefault}
                                  value={curEntry.comision ?? ''}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setCondicionesSistemas((prev) => ({
                                      ...prev,
                                      [sys.nombre_sistema]: {
                                        ...prev[sys.nombre_sistema],
                                        comision: val ? parseFloat(val) : undefined,
                                      },
                                    }));
                                  }}
                                  className="w-16 bg-slate-50 dark:bg-[#071217] border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-900 dark:text-white font-mono font-bold text-right"
                                />
                                <span className="text-[10px] text-slate-500">%</span>
                              </div>

                              <div className="flex items-center gap-1">
                                <span className="text-[10px] text-slate-500">Part:</span>
                                <input
                                  type="number"
                                  step="0.5"
                                  placeholder={participacionDefault}
                                  value={curEntry.participacion ?? ''}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setCondicionesSistemas((prev) => ({
                                      ...prev,
                                      [sys.nombre_sistema]: {
                                        ...prev[sys.nombre_sistema],
                                        participacion: val ? parseFloat(val) : undefined,
                                      },
                                    }));
                                  }}
                                  className="w-16 bg-slate-50 dark:bg-[#071217] border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-900 dark:text-white font-mono font-bold text-right"
                                />
                                <span className="text-[10px] text-slate-500">%</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Sección 4: Arrastres Iniciales Dinámicos */}
              <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800">
                <h4 className="text-[11px] font-bold uppercase text-amber-600 dark:text-amber-400 tracking-wider flex items-center gap-1.5">
                  <DollarSign className="w-4 h-4" />
                  <span>4. Saldos Iniciales / Arrastre del Grupo</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {selectedMonedas.map((cur) => (
                    <div key={cur} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800">
                      <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1 flex items-center gap-1.5">
                        <span>{getCurrencyFlag(cur)}</span>
                        <span>Arrastre Inicial ({cur})</span>
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={saldosDinamicos[cur] || ''}
                        onChange={(e) =>
                          setSaldosDinamicos((prev) => ({
                            ...prev,
                            [cur]: e.target.value,
                          }))
                        }
                        placeholder="0.00"
                        className={UI_LOCK.input + ' font-mono font-bold'}
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Botones de acción modal */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  disabled={saving}
                  className={UI_LOCK.buttonPrimary + ' text-xs'}
                >
                  {saving ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      <span>{editingGroup ? 'ACTUALIZAR GRUPO' : 'GUARDAR GRUPO'}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: GESTOR DE ÁRBOL DE AGENCIAS EN LOTE                              */}
      {/* ========================================================================= */}
      {treeModalGroup && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 overflow-y-auto">
          <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden my-6">
            <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-900/60">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-cyan-50 text-cyan-700 border border-cyan-200 dark:bg-cyan-500/10 dark:text-cyan-400 dark:border-cyan-500/20">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Asignar Agencias: {treeModalGroup.nombre_grupo}
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Selecciona en lote las agencias que operan bajo este intermediario.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setTreeModalGroup(null)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Buscador de agencias */}
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={treeSearch}
                  onChange={(e) => setTreeSearch(e.target.value)}
                  placeholder="Filtrar agencias por nombre..."
                  className={UI_LOCK.input + ' pl-9 text-xs'}
                />
              </div>

              {/* Acciones de selección rápida */}
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-mono">
                <span>
                  Seleccionadas: <strong className="text-cyan-600 dark:text-cyan-400">{selectedAgencyIds.length}</strong> de {agencies.length}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedAgencyIds(agencies.map((a) => a.id))}
                    className="text-[11px] text-cyan-600 dark:text-cyan-400 hover:underline font-bold"
                  >
                    Marcar Todas
                  </button>
                  <span>•</span>
                  <button
                    type="button"
                    onClick={() => setSelectedAgencyIds([])}
                    className="text-[11px] text-slate-500 dark:text-slate-400 hover:underline font-bold"
                  >
                    Desmarcar
                  </button>
                </div>
              </div>

              {/* Lista con scroll y checkboxes */}
              <div className="border border-slate-200 dark:border-slate-800 rounded-2xl bg-slate-50/50 dark:bg-[#071217] max-h-80 overflow-y-auto divide-y divide-slate-200 dark:divide-slate-800/60 p-1">
                {agencies
                  .filter((a) => a.nombre_agencia.toLowerCase().includes(treeSearch.toLowerCase()))
                  .map((ag) => {
                    const isChecked = selectedAgencyIds.includes(ag.id);
                    const otherGroupObj = groups.find((g) => g.id !== treeModalGroup.id && g.agencias_ids?.includes(ag.id));
                    const currentOtherGroup =
                      otherGroupObj
                        ? otherGroupObj.nombre_grupo
                        : (ag.grupo_nombre && ag.grupo_nombre.toUpperCase() !== treeModalGroup.nombre_grupo.toUpperCase()
                          ? ag.grupo_nombre
                          : null);

                    return (
                      <label
                        key={ag.id}
                        className={`flex items-center justify-between p-3 rounded-xl cursor-pointer transition-colors ${
                          isChecked ? 'bg-cyan-50 dark:bg-cyan-950/30' : 'hover:bg-slate-100 dark:hover:bg-slate-800/40'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {
                              setSelectedAgencyIds((prev) =>
                                isChecked ? prev.filter((id) => id !== ag.id) : [...prev, ag.id]
                              );
                            }}
                            className="w-4 h-4 rounded text-emerald-600 focus:ring-0 cursor-pointer"
                          />
                          <div>
                            <span className="text-xs font-bold text-slate-900 dark:text-white">{ag.nombre_agencia}</span>
                            {currentOtherGroup && (
                              <span className="text-[10px] text-amber-600 dark:text-amber-400 block font-mono">
                                Actualmente en: {currentOtherGroup}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                            Com: {ag.comision || 0}% • Part: {ag.participacion_ag || 0}%
                          </span>
                        </div>
                      </label>
                    );
                  })}
              </div>

              {/* Botones de acción modal árbol */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setTreeModalGroup(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Cancelar
                </button>

                <button
                  type="button"
                  onClick={handleSaveTreeAssignment}
                  disabled={savingTree}
                  className={UI_LOCK.buttonPrimary + ' text-xs'}
                >
                  {savingTree ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <CheckCheck className="w-4 h-4" />
                      <span>APLICAR ASIGNACIÓN ({selectedAgencyIds.length})</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
