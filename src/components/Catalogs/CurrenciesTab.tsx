import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import type { MasterCurrency } from '../../types';
import {
  Coins,
  Plus,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Globe,
  Sparkles,
  Pencil,
  RotateCcw,
  X,
  Save,
  Eye,
  EyeOff,
} from 'lucide-react';
import {
  loadCurrencies,
  loadAllCurrencies,
  saveCurrencies,
  resetToDefaultCurrencies,
  normalizeCurrency,
  getCurrencyFlag,
  getCurrencyBadgeClasses,
  loadMasterCurrencies,
  contributeMasterCurrency,
  type CurrencyConfig,
} from '../../utils/currencies';
import { UI_LOCK } from '../../styles/uiDesignLock';

export const CurrenciesTab: React.FC = () => {
  const { effectiveUserId } = useAuth();
  const [currencies, setCurrencies] = useState<CurrencyConfig[]>([]);
  const [masterCurrencies, setMasterCurrencies] = useState<MasterCurrency[]>([]);
  const [loading, setLoading] = useState(false);
  const [currencyFilter, setCurrencyFilter] = useState<'TODAS' | 'ACTIVAS' | 'OCULTAS'>('TODAS');

  // Form states (Añadir)
  const [codigo, setCodigo] = useState('');
  const [nombre, setNombre] = useState('');
  const [simbolo, setSimbolo] = useState('');
  const [decimales, setDecimales] = useState('2');

  // Edit Modal state
  const [editingCurrency, setEditingCurrency] = useState<CurrencyConfig | null>(null);
  const [editCodigo, setEditCodigo] = useState('');
  const [editNombre, setEditNombre] = useState('');
  const [editSimbolo, setEditSimbolo] = useState('');
  const [editDecimales, setEditDecimales] = useState('2');

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const fetchCurrencies = useCallback(async () => {
    setLoading(true);
    try {
      const [list, masters] = await Promise.all([
        loadAllCurrencies(effectiveUserId),
        loadMasterCurrencies(),
      ]);
      setCurrencies(list);
      setMasterCurrencies(masters);
    } catch (err: any) {
      console.error('Error fetching currencies:', err);
    } finally {
      setLoading(false);
    }
  }, [effectiveUserId]);

  useEffect(() => {
    fetchCurrencies();
  }, [fetchCurrencies]);

  const handleSelectMasterCurrency = (m: MasterCurrency) => {
    setCodigo(m.codigo);
    setNombre(m.nombre);
    setSimbolo(m.simbolo);
    setDecimales(String(m.decimales ?? 2));
  };

  const handleAddCurrency = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCodigo = normalizeCurrency(codigo.trim().toUpperCase());
    const cleanNombre = nombre.trim() || cleanCodigo;
    const cleanSimbolo = simbolo.trim() || cleanCodigo;
    const numDecimales = parseInt(decimales, 10) || 2;

    if (!cleanCodigo) {
      setErrorMsg('Por favor ingrese el código de la moneda (ej: USDT, EUR).');
      return;
    }

    const existing = currencies.find((c) => c.codigo === cleanCodigo);
    if (existing && existing.activo !== false) {
      setErrorMsg(`La moneda '${cleanCodigo}' ya está registrada y activa en el sistema.`);
      return;
    }

    setSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      let updatedList: CurrencyConfig[];

      if (existing && existing.activo === false) {
        // Reactivar divisa oculta
        updatedList = currencies.map((c) =>
          c.codigo === cleanCodigo
            ? { ...c, nombre: cleanNombre, simbolo: cleanSimbolo, decimales: numDecimales, activo: true }
            : c
        );
      } else {
        // Nueva divisa
        const newEntry: CurrencyConfig = {
          codigo: cleanCodigo,
          nombre: cleanNombre,
          simbolo: cleanSimbolo,
          decimales: numDecimales,
          es_default: false,
          activo: true,
        };
        updatedList = [...currencies, newEntry];
      }

      await saveCurrencies(updatedList, effectiveUserId);

      if (effectiveUserId) {

        try {
          await supabase.from('monedas').upsert({
            Nombre_Moneda: cleanCodigo,
            Simbolo: cleanSimbolo,
            user_id: effectiveUserId,
            activo: true,
          });
        } catch (_) {}
      }

      setCurrencies(updatedList);
      setSuccessMsg(`✅ Moneda '${cleanCodigo}' (${cleanNombre}) guardada y habilitada exitosamente en el ecosistema.`);
      setCodigo('');
      setNombre('');
      setSimbolo('');
      setDecimales('2');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Error al guardar la moneda.');
    } finally {
      setSaving(false);
    }
  };

  const handleStartEdit = (curr: CurrencyConfig) => {
    setEditingCurrency(curr);
    setEditCodigo(curr.codigo);
    setEditNombre(curr.nombre || curr.codigo);
    setEditSimbolo(curr.simbolo || curr.codigo);
    setEditDecimales(String(curr.decimales ?? 2));
    setErrorMsg(null);
    setSuccessMsg(null);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCurrency) return;

    const cleanCodigo = normalizeCurrency(editCodigo.trim().toUpperCase());
    const cleanNombre = editNombre.trim() || cleanCodigo;
    const cleanSimbolo = editSimbolo.trim() || cleanCodigo;
    const numDecimales = parseInt(editDecimales, 10);

    if (!cleanCodigo) {
      setErrorMsg('El código de la moneda no puede estar vacío.');
      return;
    }

    if (
      cleanCodigo !== editingCurrency.codigo &&
      currencies.some((c) => c.codigo === cleanCodigo)
    ) {
      setErrorMsg(`Ya existe otra moneda registrada con el código '${cleanCodigo}'.`);
      return;
    }

    setSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const oldCode = editingCurrency.codigo;
      const updatedList = currencies.map((c) => {
        if (c.codigo === oldCode) {
          return {
            ...c,
            codigo: cleanCodigo,
            nombre: cleanNombre,
            simbolo: cleanSimbolo,
            decimales: isNaN(numDecimales) ? 2 : numDecimales,
          };
        }
        return c;
      });

      await saveCurrencies(updatedList, effectiveUserId);

      if (effectiveUserId) {
        try {
          if (editingCurrency.id) {
            await supabase
              .from('monedas')
              .update({
                Nombre_Moneda: cleanCodigo,
                Simbolo: cleanSimbolo,
              })
              .eq('id', editingCurrency.id)
              .eq('user_id', effectiveUserId);
          } else {
            await supabase.from('monedas').upsert({
              Nombre_Moneda: cleanCodigo,
              Simbolo: cleanSimbolo,
              user_id: effectiveUserId,
            });
          }
        } catch (_) {}
      }

      setCurrencies(updatedList);
      setSuccessMsg(`✅ Moneda '${cleanCodigo}' (${cleanNombre}) actualizada correctamente.`);
      setEditingCurrency(null);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Error al actualizar la moneda.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActiveCurrency = async (curr: CurrencyConfig) => {
    const isCurrentlyActive = curr.activo !== false;

    if (isCurrentlyActive) {
      const activeCount = currencies.filter((c) => c.activo !== false).length;
      if (activeCount <= 1) {
        alert('No es posible ocultar la única moneda activa. El ecosistema requiere al menos una (1) divisa habilitada para operar.');
        return;
      }

      if (!window.confirm(`¿Está seguro de ocultar la divisa '${curr.codigo}' (${curr.nombre || curr.codigo})? Dejará de aparecer en ventas, agencias y cierres para este usuario, pero conservará su historial intacto.`)) {
        return;
      }
    }

    setSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const updatedList = currencies.map((c) =>
        c.codigo === curr.codigo ? { ...c, activo: !isCurrentlyActive } : c
      );
      await saveCurrencies(updatedList, effectiveUserId);

      if (effectiveUserId) {
        try {
          await supabase
            .from('monedas')
            .update({ activo: !isCurrentlyActive } as any)
            .eq('user_id', effectiveUserId)
            .eq('Nombre_Moneda', curr.codigo);
        } catch (_) {}
      }

      setCurrencies(updatedList);
      setSuccessMsg(
        isCurrentlyActive
          ? `👁️‍🗨️ Moneda '${curr.codigo}' ocultada exitosamente. Ya no aparecerá en selectores de ventas ni agencias.`
          : `✅ Moneda '${curr.codigo}' reactivada exitosamente.`
      );
    } catch (err: any) {
      alert(`Error al cambiar estado: ${err?.message}`);
      setErrorMsg(err?.message || 'Error al cambiar estado de la moneda.');
    } finally {
      setSaving(false);
    }
  };

  const filteredCurrencies = useMemo(() => {
    if (currencyFilter === 'ACTIVAS') return currencies.filter((c) => c.activo !== false);
    if (currencyFilter === 'OCULTAS') return currencies.filter((c) => c.activo === false);
    return currencies;
  }, [currencies, currencyFilter]);

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div>
          <h2 className="text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
            <Coins className="w-5 h-5 text-emerald-500 dark:text-emerald-400" />
            <span>Gestión Dinámica de Monedas y Divisas</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Administra las monedas operativas de la comercializadora (fiat y cripto). Cada suscriptor tiene control 100% independiente sobre qué monedas operar, editar o eliminar.
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={fetchCurrencies}
            disabled={loading}
            className="p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors cursor-pointer flex items-center gap-2 text-xs font-bold"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-emerald-500 dark:text-emerald-400' : ''}`} />
            <span>Actualizar</span>
          </button>
        </div>
      </div>

      {/* Explanatory banner */}
      <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-500/30 rounded-2xl p-4 text-xs text-emerald-900 dark:text-slate-300 flex items-start gap-3 shadow-xs">
        <Sparkles className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
        <div>
          <p className="font-bold text-emerald-800 dark:text-emerald-300 mb-1">Catálogo de Monedas Oficiales Centralizado</p>
          <p className="text-emerald-700 dark:text-slate-400 leading-relaxed">
            Las monedas son administradas y certificadas globalmente desde SaaS Master. Cada suscriptor puede habilitar o desactivar las monedas con las que opera su comercializadora.
          </p>
        </div>
      </div>

      {/* Form: Add Currency from Master Catalog */}
      <div id="tour-monedas-form" className="bg-white dark:bg-[#0D1B22] border border-slate-200/80 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
        <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-800 dark:text-slate-300 flex items-center gap-2">
          <Plus className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
          <span>Habilitar Moneda desde el Catálogo Padre</span>
        </h3>

        <form onSubmit={handleAddCurrency} className="space-y-4">
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#071217] border border-slate-200 dark:border-slate-800 space-y-2.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <label className="text-xs font-bold text-slate-800 dark:text-white flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-emerald-500" />
                <span>Monedas Disponibles en el Catálogo Padre:</span>
              </label>
              <span className="text-[11px] text-slate-400">
                Haz clic en una divisa para seleccionarla y habilitarla en tu banca
              </span>
            </div>

            {masterCurrencies.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2">
                {masterCurrencies.map((m) => {
                  const isRegistered = currencies.some((c) => c.codigo === m.codigo && c.activo !== false);
                  const isSelected = codigo.toUpperCase() === m.codigo.toUpperCase();
                  return (
                    <button
                      key={m.codigo}
                      type="button"
                      onClick={() => handleSelectMasterCurrency(m)}
                      className={`text-xs px-3 py-1.5 rounded-xl font-mono font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                        isSelected
                          ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20 ring-2 ring-emerald-400'
                          : isRegistered
                          ? 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300 hover:bg-slate-300'
                          : 'bg-emerald-50 text-emerald-700 border border-emerald-300 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/30 hover:bg-emerald-100'
                      }`}
                    >
                      <span>+{m.codigo}</span>
                      <span className="text-[11px] font-sans opacity-85">({m.nombre})</span>
                      {isRegistered && <span className="text-[10px] opacity-75 font-sans">(Activa)</span>}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-amber-500">Cargando catálogo maestro de monedas...</p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-600 dark:text-slate-400 mb-1">
                Código ISO / Siglas (Certificado)
              </label>
              <input
                type="text"
                value={codigo}
                readOnly
                placeholder="Elige una divisa arriba"
                className="w-full bg-slate-100 dark:bg-[#071217]/60 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-emerald-600 dark:text-emerald-400 uppercase font-black tracking-wider cursor-not-allowed focus:outline-hidden"
                required
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-600 dark:text-slate-400 mb-1">
                Nombre de la Moneda
              </label>
              <input
                type="text"
                value={nombre}
                readOnly
                placeholder="Automático"
                className="w-full bg-slate-100 dark:bg-[#071217]/60 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-slate-600 dark:text-slate-400 cursor-not-allowed focus:outline-hidden font-semibold"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-600 dark:text-slate-400 mb-1">
                Símbolo / Prefijo
              </label>
              <input
                type="text"
                value={simbolo}
                readOnly
                placeholder="Automático"
                className="w-full bg-slate-100 dark:bg-[#071217]/60 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-slate-600 dark:text-slate-400 cursor-not-allowed focus:outline-hidden font-bold"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-600 dark:text-slate-400 mb-1">
                Decimales
              </label>
              <input
                type="text"
                value={`${decimales} decimales`}
                readOnly
                className="w-full bg-slate-100 dark:bg-[#071217]/60 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-slate-600 dark:text-slate-400 cursor-not-allowed focus:outline-hidden font-bold"
              />
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={saving || !codigo}
              className={UI_LOCK.buttonPrimary + ' text-xs'}
            >
              {saving ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  <span>HABILITAR MONEDA EN MI BANCA</span>
                </>
              )}
            </button>
          </div>
        </form>

        {errorMsg && (
          <div className="mt-4 p-3 rounded-xl bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-500/10 dark:border-rose-500/30 dark:text-rose-400 text-xs font-semibold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="mt-4 p-3 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:border-emerald-500/30 dark:text-emerald-400 text-xs font-semibold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}
      </div>

      {/* Currencies Grid / Table */}
      <div id="tour-monedas-table" className="bg-white dark:bg-[#0D1B22] border border-slate-200/80 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-emerald-600 dark:text-cyan-400" />
            <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-800 dark:text-slate-300">
              Monedas Registradas ({filteredCurrencies.length})
            </h4>
          </div>

          {/* Filtros: Todas / Activas / Ocultas */}
          <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-[#071217] rounded-xl border border-slate-200 dark:border-slate-800">
            <button
              onClick={() => setCurrencyFilter('TODAS')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                currencyFilter === 'TODAS'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Todas ({currencies.length})
            </button>
            <button
              onClick={() => setCurrencyFilter('ACTIVAS')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                currencyFilter === 'ACTIVAS'
                  ? 'bg-emerald-500 text-white shadow-xs'
                  : 'text-slate-500 hover:text-emerald-600 dark:hover:text-emerald-400'
              }`}
            >
              Activas ({currencies.filter((c) => c.activo !== false).length})
            </button>
            <button
              onClick={() => setCurrencyFilter('OCULTAS')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                currencyFilter === 'OCULTAS'
                  ? 'bg-amber-500 text-white shadow-xs'
                  : 'text-slate-500 hover:text-amber-600 dark:hover:text-amber-400'
              }`}
            >
              Ocultas ({currencies.filter((c) => c.activo === false).length})
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#071217] text-slate-600 dark:text-slate-400 font-bold uppercase text-[11px]">
                <th className="py-3.5 px-4 w-32">Divisa</th>
                <th className="py-3.5 px-4">Nombre Oficial</th>
                <th className="py-3.5 px-4 w-28">Símbolo</th>
                <th className="py-3.5 px-4 w-28">Decimales</th>
                <th className="py-3.5 px-4 w-36">Estado</th>
                <th className="py-3.5 px-4 text-right w-28">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/80 dark:divide-slate-800/60 font-sans">
              {filteredCurrencies.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    {currencyFilter === 'OCULTAS'
                      ? 'No hay monedas ocultas actualmente.'
                      : currencyFilter === 'ACTIVAS'
                      ? 'No hay monedas activas registradas.'
                      : 'No hay monedas registradas.'}
                  </td>
                </tr>
              ) : (
                filteredCurrencies.map((c) => {
                  const flag = getCurrencyFlag(c.codigo);
                  const badgeClasses = getCurrencyBadgeClasses(c.codigo);
                  const isActive = c.activo !== false;

                  return (
                    <tr
                      key={c.codigo}
                      className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/30 transition-colors ${
                        !isActive ? 'opacity-60 bg-slate-50/50 dark:bg-slate-900/30' : ''
                      }`}
                    >
                      <td className="py-3 px-4 font-black text-sm tracking-wide">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-black ${badgeClasses}`}>
                          <span>{flag}</span>
                          <span>{c.codigo}</span>
                        </span>
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-900 dark:text-white">
                        {c.nombre || c.codigo}
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-slate-700 dark:text-slate-300">
                        {c.simbolo || c.codigo}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-500 dark:text-slate-400">
                        {c.decimales ?? 2}
                      </td>
                      <td className="py-3 px-4">
                        {isActive ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800/40">
                            <CheckCircle2 className="w-3 h-3 text-emerald-500 dark:text-emerald-400" />
                            <span>Activa</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-300 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400">
                            <EyeOff className="w-3 h-3 text-slate-400" />
                            <span>Oculta</span>
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleStartEdit(c)}
                            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-300 hover:text-emerald-600 dark:hover:text-cyan-400 transition-colors cursor-pointer"
                            title={`Editar ${c.codigo}`}
                          >
                            <Pencil className="w-4 h-4" />
                          </button>

                          {/* Botón Activar / Ocultar (En lugar de eliminar) */}
                          {isActive ? (
                            <button
                              onClick={() => handleToggleActiveCurrency(c)}
                              className="p-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 dark:bg-amber-500/10 dark:hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-500/30 transition-colors cursor-pointer"
                              title="Ocultar divisa (no se elimina, pero deja de aparecer en los selectores de ventas y agencias)"
                            >
                              <EyeOff className="w-4 h-4" />
                            </button>
                          ) : (
                            <button
                              onClick={() => handleToggleActiveCurrency(c)}
                              className="p-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30 transition-colors cursor-pointer"
                              title="Reactivar divisa y hacerla visible"
                            >
                              <Eye className="w-4 h-4" />
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

      {/* Edit Currency Modal */}
      {editingCurrency && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#0D1B22] border border-slate-200 dark:border-emerald-500/30 rounded-3xl p-6 max-w-lg w-full space-y-4 shadow-2xl animate-fade-in">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Pencil className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
                <span>
                  Editar Moneda: <span className="text-emerald-600 dark:text-emerald-400 font-black">{editingCurrency.codigo}</span>
                </span>
              </h3>
              <button
                onClick={() => setEditingCurrency(null)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-white p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300">
              Modifica la nomenclatura oficial, símbolo representativo o precisión decimal de esta moneda para su comercializadora.
            </p>

            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase text-slate-600 dark:text-slate-400 mb-1">
                    Código ISO / Siglas *
                  </label>
                  <input
                    type="text"
                    value={editCodigo}
                    onChange={(e) => setEditCodigo(e.target.value)}
                    placeholder="Ej: USDT"
                    className="w-full bg-white dark:bg-[#071217] border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-white uppercase focus:outline-hidden focus:border-emerald-500 font-black tracking-wider"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase text-slate-600 dark:text-slate-400 mb-1">
                    Nombre Oficial
                  </label>
                  <input
                    type="text"
                    value={editNombre}
                    onChange={(e) => setEditNombre(e.target.value)}
                    placeholder="Ej: Tether USD"
                    className="w-full bg-white dark:bg-[#071217] border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-hidden focus:border-emerald-500 font-semibold"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase text-slate-600 dark:text-slate-400 mb-1">
                    Símbolo / Prefijo
                  </label>
                  <input
                    type="text"
                    value={editSimbolo}
                    onChange={(e) => setEditSimbolo(e.target.value)}
                    placeholder="Ej: ₮, $, Bs."
                    className="w-full bg-white dark:bg-[#071217] border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-hidden focus:border-emerald-500 font-bold"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase text-slate-600 dark:text-slate-400 mb-1">
                    Decimales
                  </label>
                  <select
                    value={editDecimales}
                    onChange={(e) => setEditDecimales(e.target.value)}
                    className="w-full bg-white dark:bg-[#071217] border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-hidden focus:border-emerald-500 font-bold"
                  >
                    <option value="2">2 decimales (Estándar)</option>
                    <option value="0">0 decimales (Sin centavos)</option>
                    <option value="4">4 decimales (Precisión extendida)</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingCurrency(null)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs cursor-pointer transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className={UI_LOCK.buttonPrimary + ' text-xs'}
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{saving ? 'Guardando...' : 'GUARDAR CAMBIOS'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

