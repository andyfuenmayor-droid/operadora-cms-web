import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import type { BetSystem, MasterSystem } from '../../types';
import { formatCurrency } from '../../utils/formatters';
import {
  Layers,
  Plus,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Edit2,
  Tag,
  FileSpreadsheet,
  Percent,
  TrendingUp,
  Wallet,
  Eye,
  EyeOff,
  Sparkles,
  Globe,
  RotateCcw
} from 'lucide-react';
import {
  loadSystemKeywords,
  saveSystemKeywords,
  DEFAULT_SYSTEM_KEYWORDS,
  type SystemKeywordsMap,
  type SystemKeywordConfig
} from '../../utils/systemKeywords';
import { loadCurrencies, type CurrencyConfig } from '../../utils/currencies';
import {
  loadMasterSystems,
  contributeMasterSystem,
  loadAllSaaSSystems,
  toggleSystemActiveStatus
} from '../../utils/sistemas';
import { UI_LOCK } from '../../styles/uiDesignLock';

export const SystemsTab: React.FC = () => {
  const { effectiveUserId } = useAuth();
  const [systems, setSystems] = useState<BetSystem[]>([]);
  const [masterSystems, setMasterSystems] = useState<MasterSystem[]>([]);
  const [activeCurrencies, setActiveCurrencies] = useState<CurrencyConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [systemFilter, setSystemFilter] = useState<'TODOS' | 'ACTIVOS' | 'OCULTOS'>('TODOS');

  // New System Form States
  const [nombre, setNombre] = useState('');
  const [colVenta, setColVenta] = useState('');
  const [colPremio, setColPremio] = useState('');
  const [colAgencia, setColAgencia] = useState('');
  const [comisionComercializador, setComisionComercializador] = useState('0');
  const [participacionComercializador, setParticipacionComercializador] = useState('0');
  const [saldoInicialBs, setSaldoInicialBs] = useState('0');
  const [saldoInicialUsd, setSaldoInicialUsd] = useState('0');
  const [saldoInicialCop, setSaldoInicialCop] = useState('0');
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Keywords & Edit States
  const [systemKeywords, setSystemKeywords] = useState<SystemKeywordsMap>(DEFAULT_SYSTEM_KEYWORDS);
  const [editingSystem, setEditingSystem] = useState<BetSystem | null>(null);
  const [editColVenta, setEditColVenta] = useState('');
  const [editColPremio, setEditColPremio] = useState('');
  const [editColAgencia, setEditColAgencia] = useState('');
  const [editComisionComercializador, setEditComisionComercializador] = useState('0');
  const [editParticipacionComercializador, setEditParticipacionComercializador] = useState('0');
  const [editSaldoInicialBs, setEditSaldoInicialBs] = useState('0');
  const [editSaldoInicialUsd, setEditSaldoInicialUsd] = useState('0');
  const [editSaldoInicialCop, setEditSaldoInicialCop] = useState('0');

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const fetchSystems = useCallback(async () => {
    if (!effectiveUserId) return;
    setLoading(true);
    try {
      const [loadedSystems, keywordsMap, currs, masters] = await Promise.all([
        loadAllSaaSSystems(effectiveUserId),
        loadSystemKeywords(effectiveUserId),
        loadCurrencies(effectiveUserId),
        loadMasterSystems(),
      ]);

      setActiveCurrencies(currs);
      setSystems(loadedSystems);
      setSystemKeywords(keywordsMap);
      setMasterSystems(masters);
    } catch (err: any) {
      console.error('Error fetching systems:', err);
    } finally {
      setLoading(false);
    }
  }, [effectiveUserId]);

  useEffect(() => {
    fetchSystems();
  }, [fetchSystems]);

  // Auto-fill suggested column names when typing or selecting system name
  const handleNombreChange = (val: string) => {
    setNombre(val);
    setShowSuggestions(true);
    const upper = val.trim().toUpperCase();

    // Check if matches master system
    const matchedMaster = masterSystems.find(m => m.nombre_sistema.toUpperCase() === upper);
    if (matchedMaster) {
      if (!colVenta) setColVenta(matchedMaster.col_venta);
      if (!colPremio) setColPremio(matchedMaster.col_premio);
      if (!colAgencia) setColAgencia(matchedMaster.col_agencia);
      return;
    }

    if (upper.includes('KENO')) {
      if (!colVenta) setColVenta('Total accepted');
      if (!colPremio) setColPremio('Total paid');
      if (!colAgencia) setColAgencia('Agent');
    } else if (upper.includes('GATO')) {
      if (!colVenta) setColVenta('VENTAS');
      if (!colPremio) setColPremio('PREMIOS');
      if (!colAgencia) setColAgencia('USUARIO');
    } else if (upper.includes('BET')) {
      if (!colVenta) setColVenta('Venta');
      if (!colPremio) setColPremio('Premio');
      if (!colAgencia) setColAgencia('Nombre');
    }
  };

  const handleSelectMasterSuggestion = (m: MasterSystem) => {
    setNombre(m.nombre_sistema);
    setColAgencia(m.col_agencia);
    setColVenta(m.col_venta);
    setColPremio(m.col_premio);
    setShowSuggestions(false);
  };

  const handleAddSystem = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanNombre = nombre.trim().toUpperCase();
    if (!cleanNombre) {
      setErrorMsg('Por favor ingrese el nombre del sistema.');
      return;
    }

    const existingSys = systems.find((s) => s.nombre_sistema.toUpperCase() === cleanNombre);
    if (existingSys && existingSys.activo !== false) {
      setErrorMsg(`El sistema '${cleanNombre}' ya está registrado y activo.`);
      return;
    }

    setSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      if (existingSys && existingSys.activo === false) {
        // Reactivar el sistema oculto
        await toggleSystemActiveStatus(effectiveUserId!, cleanNombre, true);
      } else {
        // Insertar nuevo sistema
        const { error } = await supabase.from('sistemas').insert({
          nombre_sistema: cleanNombre,
          user_id: effectiveUserId,
          activo: true,
        });
        if (error) throw error;
      }

      // Save custom keywords and commercializer configurations
      const updatedKeywords: SystemKeywordsMap = {
        ...systemKeywords,
        [cleanNombre]: {
          venta: colVenta.trim() || 'Venta',
          premio: colPremio.trim() || 'Premio',
          agencia: colAgencia.trim() || 'Agencia',
          comision_comercializador: Number(comisionComercializador) || 0,
          participacion_comercializador: Number(participacionComercializador) || 0,
          saldo_inicial_bs: Number(saldoInicialBs) || 0,
          saldo_inicial_usd: Number(saldoInicialUsd) || 0,
          saldo_inicial_cop: Number(saldoInicialCop) || 0,
          activo: true,
        },
      };

      if (effectiveUserId) {
        await saveSystemKeywords(effectiveUserId, updatedKeywords);
        // Retroalimentar la Tabla Padre Global en segundo plano
        contributeMasterSystem({
          nombre_sistema: cleanNombre,
          col_agencia: colAgencia.trim() || 'Agencia',
          col_venta: colVenta.trim() || 'Venta',
          col_premio: colPremio.trim() || 'Premio',
        }, effectiveUserId);
      }
      setSystemKeywords(updatedKeywords);

      setSuccessMsg(`✅ Proveedor '${cleanNombre}' guardado y activado exitosamente en el ecosistema.`);
      setNombre('');
      setColVenta('');
      setColPremio('');
      setColAgencia('');
      setComisionComercializador('0');
      setParticipacionComercializador('0');
      setSaldoInicialBs('0');
      setSaldoInicialUsd('0');
      setSaldoInicialCop('0');
      setShowSuggestions(false);
      await fetchSystems();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Error al guardar el sistema.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (s: BetSystem) => {
    if (!effectiveUserId) return;
    const isCurrentlyActive = s.activo !== false;
    const actionLabel = isCurrentlyActive ? 'ocultar' : 'reactivar';

    if (isCurrentlyActive) {
      if (!window.confirm(`¿Está seguro de ocultar/desactivar el proveedor '${s.nombre_sistema}'? Dejará de aparecer en ventas, agencias y taquillas para este usuario, pero conservará su historial intacto.`)) {
        return;
      }
    }

    setSaving(true);
    try {
      await toggleSystemActiveStatus(effectiveUserId, s.nombre_sistema, !isCurrentlyActive);
      setSystems((prev) =>
        prev.map((item) =>
          item.nombre_sistema.toUpperCase() === s.nombre_sistema.toUpperCase()
            ? { ...item, activo: !isCurrentlyActive }
            : item
        )
      );
      setSuccessMsg(
        isCurrentlyActive
          ? `👁️‍🗨️ Sistema '${s.nombre_sistema}' ocultado correctamente. Ya no aparecerá en ventas, agencias ni taquillas.`
          : `✅ Sistema '${s.nombre_sistema}' reactivado exitosamente.`
      );
    } catch (err: any) {
      alert(`Error al ${actionLabel}: ${err?.message || 'Error desconocido'}`);
      setErrorMsg(`Error al ${actionLabel}: ${err?.message || 'Error desconocido'}`);
    } finally {
      setSaving(false);
    }
  };

  const handleOpenEdit = (s: BetSystem) => {
    setEditingSystem(s);
    const conf: SystemKeywordConfig = systemKeywords[s.nombre_sistema] || {
      venta: 'Venta',
      premio: 'Premio',
      agencia: 'Agencia',
      comision_comercializador: 0,
      participacion_comercializador: 0,
      saldo_inicial_bs: 0,
      saldo_inicial_usd: 0,
      saldo_inicial_cop: 0,
    };
    setEditColVenta(conf.venta || '');
    setEditColPremio(conf.premio || '');
    setEditColAgencia(conf.agencia || '');
    setEditComisionComercializador(String(conf.comision_comercializador ?? 0));
    setEditParticipacionComercializador(String(conf.participacion_comercializador ?? 0));
    setEditSaldoInicialBs(String(conf.saldo_inicial_bs ?? 0));
    setEditSaldoInicialUsd(String(conf.saldo_inicial_usd ?? 0));
    setEditSaldoInicialCop(String(conf.saldo_inicial_cop ?? 0));
  };

  const handleSaveEditKeywords = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSystem || !effectiveUserId) return;
    setSaving(true);

    try {
      const updatedKeywords: SystemKeywordsMap = {
        ...systemKeywords,
        [editingSystem.nombre_sistema]: {
          venta: editColVenta.trim() || 'Venta',
          premio: editColPremio.trim() || 'Premio',
          agencia: editColAgencia.trim() || 'Agencia',
          comision_comercializador: Number(editComisionComercializador) || 0,
          participacion_comercializador: Number(editParticipacionComercializador) || 0,
          saldo_inicial_bs: Number(editSaldoInicialBs) || 0,
          saldo_inicial_usd: Number(editSaldoInicialUsd) || 0,
          saldo_inicial_cop: Number(editSaldoInicialCop) || 0,
          activo: editingSystem.activo !== false,
        },
      };

      await saveSystemKeywords(effectiveUserId, updatedKeywords);
      setSystemKeywords(updatedKeywords);
      setSuccessMsg(`✅ Configuración de '${editingSystem.nombre_sistema}' actualizada correctamente.`);
      setEditingSystem(null);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Error al actualizar configuración de proveedor.');
    } finally {
      setSaving(false);
    }
  };

  const filteredSystems = useMemo(() => {
    if (systemFilter === 'ACTIVOS') return systems.filter((s) => s.activo !== false);
    if (systemFilter === 'OCULTOS') return systems.filter((s) => s.activo === false);
    return systems;
  }, [systems, systemFilter]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div>
          <h2 className="text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
            <Layers className="w-5 h-5 text-emerald-500 dark:text-emerald-400" />
            <span>Gestión de Sistemas y Proveedores</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Configuración de proveedores de apuestas: Comisión Comercializador, Participación Comercializador, Saldos Iniciales y mapeo de columnas para importación.
          </p>
        </div>
        <button
          onClick={fetchSystems}
          disabled={loading}
          className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors self-start sm:self-auto cursor-pointer"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-emerald-500 dark:text-emerald-400' : ''}`} />
        </button>
      </div>

      {/* Form: Add System with Complete Operator/Commercializer Config */}
      <div id="tour-sistemas-form" className="bg-white dark:bg-[#0D1B22] border border-slate-200/80 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
        <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-800 dark:text-slate-300 flex items-center gap-2">
          <Plus className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
          <span>Añadir Nuevo Sistema / Proveedor</span>
        </h3>

        <form onSubmit={handleAddSystem} className="space-y-4">
          {/* Row 1: Identificación y Columnas de Archivo */}
          <div id="tour-sistemas-form-inputs" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-800 dark:text-white flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                <span>Nombre del Sistema *</span>
              </label>
              <input
                type="text"
                value={nombre}
                onChange={(e) => handleNombreChange(e.target.value)}
                onFocus={() => setShowSuggestions(true)}
                placeholder="EJ: KENO, BETM3, HIPISMO"
                className="w-full bg-white dark:bg-[#071217] border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 uppercase focus:outline-hidden focus:border-emerald-500 font-bold"
              />
              {/* Sugerencias desde la Tabla Padre Global */}
              {masterSystems.length > 0 && (
                <div className="mt-1.5 flex flex-wrap items-center gap-1">
                  <span className="text-[10px] text-slate-400 font-sans flex items-center gap-0.5">
                    <Globe className="w-2.5 h-2.5 text-slate-400" /> Catálogo Padre:
                  </span>
                  {masterSystems.slice(0, 8).map((m) => {
                    const isRegistered = systems.some(
                      (s) => s.nombre_sistema.toUpperCase() === m.nombre_sistema.toUpperCase()
                    );
                    return (
                      <button
                        key={m.nombre_sistema}
                        type="button"
                        onClick={() => handleSelectMasterSuggestion(m)}
                        className={`text-[10px] px-2 py-0.5 rounded-md font-mono font-bold transition-all cursor-pointer ${
                          nombre.toUpperCase() === m.nombre_sistema.toUpperCase()
                            ? 'bg-emerald-500 text-white shadow-xs'
                            : isRegistered
                            ? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 hover:bg-slate-200'
                            : 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 hover:bg-emerald-100'
                        }`}
                        title={`Sugerido de la Tabla Padre: Agencia: ${m.col_agencia} | Venta: ${m.col_venta} | Premio: ${m.col_premio}`}
                      >
                        +{m.nombre_sistema}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                <Tag className="w-3 h-3 text-amber-500 dark:text-amber-400" />
                <span>Columna de Agencia / ID</span>
              </label>
              <input
                type="text"
                value={colAgencia}
                onChange={(e) => setColAgencia(e.target.value)}
                placeholder="Ej: Agent, Nombre, USUARIO"
                className="w-full bg-white dark:bg-[#071217] border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white font-mono placeholder-slate-400 dark:placeholder-slate-600 focus:outline-hidden focus:border-cyan-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                <Tag className="w-3 h-3 text-cyan-500 dark:text-cyan-400" />
                <span>Columna de Ventas</span>
              </label>
              <input
                type="text"
                value={colVenta}
                onChange={(e) => setColVenta(e.target.value)}
                placeholder="Ej: Total accepted, Venta, Jugado"
                className="w-full bg-white dark:bg-[#071217] border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white font-mono placeholder-slate-400 dark:placeholder-slate-600 focus:outline-hidden focus:border-cyan-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                <Tag className="w-3 h-3 text-rose-500 dark:text-rose-400" />
                <span>Columna de Premios</span>
              </label>
              <input
                type="text"
                value={colPremio}
                onChange={(e) => setColPremio(e.target.value)}
                placeholder="Ej: Total paid, Premio, Pagados"
                className="w-full bg-white dark:bg-[#071217] border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white font-mono placeholder-slate-400 dark:placeholder-slate-600 focus:outline-hidden focus:border-cyan-500"
              />
            </div>
          </div>

          {/* Row 2: Comisión y Participación Comercializador + Saldos Iniciales de Arrastre */}
          <div id="tour-sistemas-form-conditions" className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#071217]/80 border border-slate-200 dark:border-slate-800/80 space-y-3">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 flex items-center gap-2">
              <TrendingUp className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
              <span>Condiciones del Comercializador y Saldos Iniciales con el Proveedor</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-amber-700 dark:text-amber-300 flex items-center gap-1">
                  <Percent className="w-3 h-3" />
                  <span>% Comisión Comercializador</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={comisionComercializador}
                  onChange={(e) => setComisionComercializador(e.target.value)}
                  placeholder="0.00 %"
                  className="w-full bg-white dark:bg-[#0D1B22] border border-amber-300 dark:border-amber-500/30 rounded-xl px-3 py-2 text-xs text-amber-800 dark:text-amber-200 font-mono font-bold focus:outline-hidden focus:border-amber-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-indigo-700 dark:text-indigo-300 flex items-center gap-1">
                  <Percent className="w-3 h-3" />
                  <span>% Participación Comercializador</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={participacionComercializador}
                  onChange={(e) => setParticipacionComercializador(e.target.value)}
                  placeholder="0.00 %"
                  className="w-full bg-white dark:bg-[#0D1B22] border border-indigo-300 dark:border-indigo-500/30 rounded-xl px-3 py-2 text-xs text-indigo-800 dark:text-indigo-200 font-mono font-bold focus:outline-hidden focus:border-indigo-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                  <Wallet className="w-3 h-3 text-amber-500 dark:text-amber-400" />
                  <span>Saldo Inicial (BS)</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={saldoInicialBs}
                  onChange={(e) => setSaldoInicialBs(e.target.value)}
                  placeholder="0.00 Bs."
                  className="w-full bg-white dark:bg-[#0D1B22] border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white font-mono focus:outline-hidden focus:border-emerald-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                  <Wallet className="w-3 h-3 text-emerald-500 dark:text-emerald-400" />
                  <span>Saldo Inicial (USD)</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={saldoInicialUsd}
                  onChange={(e) => setSaldoInicialUsd(e.target.value)}
                  placeholder="0.00 $"
                  className="w-full bg-white dark:bg-[#0D1B22] border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white font-mono focus:outline-hidden focus:border-emerald-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                  <Wallet className="w-3 h-3 text-cyan-500 dark:text-cyan-400" />
                  <span>Saldo Inicial (COP)</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={saldoInicialCop}
                  onChange={(e) => setSaldoInicialCop(e.target.value)}
                  placeholder="0.00 COP"
                  className="w-full bg-white dark:bg-[#0D1B22] border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white font-mono focus:outline-hidden focus:border-emerald-500"
                />
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-1">
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              💡 Los sistemas nuevos se agregan a tu cuenta y retroalimentan la Tabla Padre Global para nuevos usuarios.
            </p>
            <button
              type="submit"
              disabled={saving}
              className={UI_LOCK.buttonPrimary + ' w-full sm:w-auto text-xs'}
            >
              {saving ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  <span>GUARDAR SISTEMA</span>
                </>
              )}
            </button>
          </div>
        </form>

        {errorMsg && (
          <div className="p-3 rounded-xl bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-500/10 dark:border-rose-500/30 dark:text-rose-400 text-xs font-semibold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="p-3 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:border-emerald-500/30 dark:text-emerald-400 text-xs font-semibold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}
      </div>

      {/* Systems Table */}
      <div id="tour-sistemas-table" className="bg-white dark:bg-[#0D1B22] border border-slate-200/80 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-800 dark:text-slate-300">
              Sistemas Registrados y Proveedores ({filteredSystems.length})
            </h4>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Los sistemas ocultos no aparecen en ventas, agencias ni taquillas, pero conservan sus datos históricos.
            </p>
          </div>

          {/* Filtros: Todos / Activos / Ocultos */}
          <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-[#071217] rounded-xl border border-slate-200 dark:border-slate-800">
            <button
              onClick={() => setSystemFilter('TODOS')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                systemFilter === 'TODOS'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Todos ({systems.length})
            </button>
            <button
              onClick={() => setSystemFilter('ACTIVOS')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                systemFilter === 'ACTIVOS'
                  ? 'bg-emerald-500 text-white shadow-xs'
                  : 'text-slate-500 hover:text-emerald-600 dark:hover:text-emerald-400'
              }`}
            >
              Activos ({systems.filter((s) => s.activo !== false).length})
            </button>
            <button
              onClick={() => setSystemFilter('OCULTOS')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                systemFilter === 'OCULTOS'
                  ? 'bg-amber-500 text-white shadow-xs'
                  : 'text-slate-500 hover:text-amber-600 dark:hover:text-amber-400'
              }`}
            >
              Ocultos ({systems.filter((s) => s.activo === false).length})
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#071217] text-slate-600 dark:text-slate-400 font-bold uppercase text-[11px]">
                <th className="py-3 px-3.5 w-14">ID</th>
                <th className="py-3 px-3.5 min-w-[150px]">Sistema / Proveedor</th>
                <th className="py-3 px-3.5 min-w-[150px]">Comisión Comercializador</th>
                <th className="py-3 px-3.5 min-w-[160px]">Participación Comercializador</th>
                <th className="py-3 px-3.5 min-w-[180px]">Saldos Iniciales (Arrastre)</th>
                <th className="py-3 px-3.5 min-w-[180px]">Palabras Clave Archivos</th>
                <th className="py-3 px-3.5 text-right w-28">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/80 dark:divide-slate-800/60 font-mono">
              {filteredSystems.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500 font-sans">
                    {systemFilter === 'OCULTOS'
                      ? 'No hay sistemas ocultos actualmente.'
                      : systemFilter === 'ACTIVOS'
                      ? 'No hay sistemas activos registrados.'
                      : 'No hay sistemas registrados aún.'}
                  </td>
                </tr>
              ) : (
                filteredSystems.map((s) => {
                  const conf = systemKeywords[s.nombre_sistema] || DEFAULT_SYSTEM_KEYWORDS[s.nombre_sistema] || {
                    venta: 'Venta',
                    premio: 'Premio',
                    agencia: 'Agencia',
                    comision_comercializador: 0,
                    participacion_comercializador: 0,
                    saldo_inicial_bs: 0,
                    saldo_inicial_usd: 0,
                    saldo_inicial_cop: 0,
                  };

                  const comPct = Number(conf.comision_comercializador || 0);
                  const partPct = Number(conf.participacion_comercializador || 0);
                  const bsInit = Number(conf.saldo_inicial_bs || 0);
                  const usdInit = Number(conf.saldo_inicial_usd || 0);
                  const copInit = Number(conf.saldo_inicial_cop || 0);
                  const isActive = s.activo !== false;

                  return (
                    <tr
                      key={s.id}
                      className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/30 transition-colors ${
                        !isActive ? 'opacity-60 bg-slate-50/50 dark:bg-slate-900/30' : ''
                      }`}
                    >
                      <td className="py-3 px-3.5 font-mono font-bold text-slate-500 dark:text-slate-400">#{s.id}</td>
                      <td className="py-3 px-3.5 font-sans">
                        <div className="flex items-center gap-2">
                          <span className="font-black text-slate-900 dark:text-white text-sm tracking-wide">
                            🎰 {s.nombre_sistema}
                          </span>
                          {isActive ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:border-emerald-500/30 dark:text-emerald-400">
                              Activo
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-300 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400">
                              Oculto
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Comisión Comercializador */}
                      <td className="py-3 px-3.5 font-sans">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-500/10 dark:border-amber-500/30 dark:text-amber-300 font-bold text-xs">
                          <Percent className="w-3 h-3 text-amber-500 dark:text-amber-400" />
                          <span>{comPct.toFixed(2)}%</span>
                        </span>
                      </td>

                      {/* Participación Comercializador */}
                      <td className="py-3 px-3.5 font-sans">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-indigo-50 text-indigo-700 border border-indigo-200 dark:bg-indigo-500/10 dark:border-indigo-500/30 dark:text-indigo-300 font-bold text-xs">
                          <Percent className="w-3 h-3 text-indigo-500 dark:text-indigo-400" />
                          <span>{partPct.toFixed(2)}%</span>
                        </span>
                      </td>

                      {/* Saldos Iniciales Arrastre */}
                      <td className="py-3 px-3.5 font-mono">
                        <div className="flex flex-col gap-1 text-[11px]">
                          <span className="text-slate-800 dark:text-slate-300">
                            🇻🇪 <span className="text-slate-500 dark:text-slate-400">BS:</span> {formatCurrency(bsInit, 'BS')}
                          </span>
                          <span className="text-slate-800 dark:text-slate-300">
                            💵 <span className="text-slate-500 dark:text-slate-400">USD:</span> {formatCurrency(usdInit, 'USD')}
                          </span>
                          <span className="text-slate-800 dark:text-slate-300">
                            🇨🇴 <span className="text-slate-500 dark:text-slate-400">COP:</span> {formatCurrency(copInit, 'COP')}
                          </span>
                        </div>
                      </td>

                      {/* Palabras clave de mapeo */}
                      <td className="py-3 px-3.5 text-[11px]">
                        <div className="flex flex-col gap-1">
                          <span className="text-amber-700 dark:text-amber-400 font-mono font-bold">
                            ID: <span className="font-bold text-slate-900 dark:text-white">{conf.agencia || 'Agent / Nombre'}</span>
                          </span>
                          <span className="text-cyan-700 dark:text-cyan-400 font-mono font-bold">
                            Venta: <span className="font-bold text-slate-900 dark:text-white">{conf.venta || 'Venta'}</span>
                          </span>
                          <span className="text-rose-700 dark:text-rose-400 font-mono font-bold">
                            Premio: <span className="font-bold text-slate-900 dark:text-white">{conf.premio || 'Premio'}</span>
                          </span>
                        </div>
                      </td>

                      {/* Acciones */}
                      <td className="py-3 px-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleOpenEdit(s)}
                            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-cyan-500/20 text-slate-500 dark:text-slate-400 hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors cursor-pointer"
                            title="Editar configuración y palabras clave"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>

                          {/* Botón Activar / Ocultar (En lugar de eliminar) */}
                          {isActive ? (
                            <button
                              onClick={() => handleToggleActive(s)}
                              className="p-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 dark:bg-amber-500/10 dark:hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-500/30 transition-colors cursor-pointer"
                              title="Ocultar sistema (no se elimina, pero deja de aparecer en ventas, agencias y taquillas)"
                            >
                              <EyeOff className="w-3.5 h-3.5" />
                            </button>
                          ) : (
                            <button
                              onClick={() => handleToggleActive(s)}
                              className="p-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30 transition-colors cursor-pointer"
                              title="Reactivar sistema y hacerlo visible"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit System Modal */}
      {editingSystem && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#0D1B22] border border-slate-200 dark:border-emerald-500/30 rounded-3xl p-6 max-w-lg w-full space-y-4 shadow-2xl animate-fade-in max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
                <span>Configurar Proveedor: <span className="text-emerald-600 dark:text-emerald-400">{editingSystem.nombre_sistema}</span></span>
              </h3>
              <button
                onClick={() => setEditingSystem(null)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-white text-xs font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300">
              Ajusta las condiciones de liquidación con el comercializador, saldos iniciales y los nombres de columnas de importación para este sistema.
            </p>

            <form onSubmit={handleSaveEditKeywords} className="space-y-4">
              {/* Condiciones Comercializador */}
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-[#071217] border border-slate-200 dark:border-slate-800 space-y-3">
                <div className="text-[11px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5" />
                  <span>Condiciones de Liquidación</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-amber-800 dark:text-amber-300 flex items-center gap-1">
                      <Percent className="w-3 h-3" />
                      <span>% Comisión Comercializador</span>
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      value={editComisionComercializador}
                      onChange={(e) => setEditComisionComercializador(e.target.value)}
                      className="w-full bg-white dark:bg-[#0D1B22] border border-slate-300 dark:border-amber-500/40 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-amber-200 font-mono font-bold focus:outline-hidden focus:border-amber-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-indigo-800 dark:text-indigo-300 flex items-center gap-1">
                      <Percent className="w-3 h-3" />
                      <span>% Participación Comercializador</span>
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      value={editParticipacionComercializador}
                      onChange={(e) => setEditParticipacionComercializador(e.target.value)}
                      className="w-full bg-white dark:bg-[#0D1B22] border border-slate-300 dark:border-indigo-500/40 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-indigo-200 font-mono font-bold focus:outline-hidden focus:border-indigo-500"
                    />
                  </div>
                </div>
              </div>

              {/* Saldos Iniciales por Moneda */}
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-[#071217] border border-slate-200 dark:border-slate-800 space-y-3">
                <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                  <Wallet className="w-3.5 h-3.5" />
                  <span>Saldos Iniciales de Arrastre con el Proveedor</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {(activeCurrencies.length === 0 || activeCurrencies.some((c) => c.codigo === 'BS')) && (
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">🇻🇪 Saldo BS</label>
                      <input
                        type="number"
                        step="0.01"
                        value={editSaldoInicialBs}
                        onChange={(e) => setEditSaldoInicialBs(e.target.value)}
                        className="w-full bg-white dark:bg-[#0D1B22] border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white font-mono focus:outline-hidden focus:border-emerald-500"
                      />
                    </div>
                  )}

                  {(activeCurrencies.length === 0 || activeCurrencies.some((c) => c.codigo === 'USD')) && (
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">💵 Saldo USD</label>
                      <input
                        type="number"
                        step="0.01"
                        value={editSaldoInicialUsd}
                        onChange={(e) => setEditSaldoInicialUsd(e.target.value)}
                        className="w-full bg-white dark:bg-[#0D1B22] border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white font-mono focus:outline-hidden focus:border-emerald-500"
                      />
                    </div>
                  )}

                  {(activeCurrencies.length === 0 || activeCurrencies.some((c) => c.codigo === 'COP')) && (
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">🇨🇴 Saldo COP</label>
                      <input
                        type="number"
                        step="0.01"
                        value={editSaldoInicialCop}
                        onChange={(e) => setEditSaldoInicialCop(e.target.value)}
                        className="w-full bg-white dark:bg-[#0D1B22] border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white font-mono focus:outline-hidden focus:border-emerald-500"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Palabras clave de Importación */}
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-[#071217] border border-slate-200 dark:border-slate-800 space-y-3">
                <div className="text-[11px] font-bold uppercase tracking-wider text-cyan-700 dark:text-cyan-400 flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5" />
                  <span>Columnas de Archivos (Excel / CSV / PDF)</span>
                </div>

                <div className="space-y-2">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                      <Tag className="w-3 h-3 text-amber-500 dark:text-amber-400" />
                      <span>Columna de Agencia / ID</span>
                    </label>
                    <input
                      type="text"
                      value={editColAgencia}
                      onChange={(e) => setEditColAgencia(e.target.value)}
                      placeholder="Ej: Agent, Nombre, USUARIO"
                      className="w-full bg-white dark:bg-[#0D1B22] border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white font-mono focus:outline-hidden focus:border-cyan-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                      <Tag className="w-3 h-3 text-cyan-500 dark:text-cyan-400" />
                      <span>Columna de Ventas</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={editColVenta}
                      onChange={(e) => setEditColVenta(e.target.value)}
                      placeholder="Ej: Total accepted, Venta, VENTAS"
                      className="w-full bg-white dark:bg-[#0D1B22] border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white font-mono focus:outline-hidden focus:border-cyan-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                      <Tag className="w-3 h-3 text-rose-500 dark:text-rose-400" />
                      <span>Columna de Premios</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={editColPremio}
                      onChange={(e) => setEditColPremio(e.target.value)}
                      placeholder="Ej: Total paid, Premio, PREMIOS"
                      className="w-full bg-white dark:bg-[#0D1B22] border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white font-mono focus:outline-hidden focus:border-cyan-500"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingSystem(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className={UI_LOCK.buttonPrimary + ' text-xs'}
                >
                  {saving ? 'Guardando...' : 'Guardar Configuración'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
