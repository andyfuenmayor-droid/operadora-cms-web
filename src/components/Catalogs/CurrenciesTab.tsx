import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import {
  Coins,
  Plus,
  Trash2,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Globe,
  Sparkles,
  Pencil,
  RotateCcw,
  X,
  Save,
} from 'lucide-react';
import {
  loadCurrencies,
  saveCurrencies,
  resetToDefaultCurrencies,
  normalizeCurrency,
  getCurrencyFlag,
  getCurrencyBadgeClasses,
  type CurrencyConfig,
} from '../../utils/currencies';
import { UI_LOCK } from '../../styles/uiDesignLock';

export const CurrenciesTab: React.FC = () => {
  const { effectiveUserId } = useAuth();
  const [currencies, setCurrencies] = useState<CurrencyConfig[]>([]);
  const [loading, setLoading] = useState(false);

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
      const list = await loadCurrencies(effectiveUserId);
      setCurrencies(list);
    } catch (err: any) {
      console.error('Error fetching currencies:', err);
    } finally {
      setLoading(false);
    }
  }, [effectiveUserId]);

  useEffect(() => {
    fetchCurrencies();
  }, [fetchCurrencies]);

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

    if (currencies.some((c) => c.codigo === cleanCodigo)) {
      setErrorMsg(`La moneda '${cleanCodigo}' ya está registrada y activa en el sistema.`);
      return;
    }

    setSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const newEntry: CurrencyConfig = {
        codigo: cleanCodigo,
        nombre: cleanNombre,
        simbolo: cleanSimbolo,
        decimales: numDecimales,
        es_default: false,
      };

      const updatedList = [...currencies, newEntry];
      await saveCurrencies(updatedList, effectiveUserId);

      if (effectiveUserId) {
        try {
          await supabase.from('monedas').insert({
            Nombre_Moneda: cleanCodigo,
            Simbolo: cleanSimbolo,
            user_id: effectiveUserId,
          });
        } catch (_) {}
      }

      setCurrencies(updatedList);
      setSuccessMsg(`✅ Moneda '${cleanCodigo}' (${cleanNombre}) registrada exitosamente. Ahora está disponible en todo el sistema.`);
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

  const handleDeleteCurrency = async (curr: CurrencyConfig) => {
    if (currencies.length <= 1) {
      alert('No es posible eliminar la única moneda activa. El ecosistema requiere al menos una (1) moneda configurada para operar.');
      return;
    }

    if (!window.confirm(`¿Está seguro de eliminar la divisa '${curr.codigo}' (${curr.nombre || curr.codigo}) del ecosistema? Se removerá de los selectores activos.`)) {
      return;
    }

    setSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const updatedList = currencies.filter((c) => c.codigo !== curr.codigo);
      await saveCurrencies(updatedList, effectiveUserId);

      if (effectiveUserId) {
        try {
          await supabase
            .from('monedas')
            .delete()
            .eq('user_id', effectiveUserId)
            .eq('Nombre_Moneda', curr.codigo);

          if (curr.id) {
            await supabase
              .from('monedas')
              .delete()
              .eq('user_id', effectiveUserId)
              .eq('id', curr.id);
          }
        } catch (_) {}
      }

      setCurrencies(updatedList);
      setSuccessMsg(`🗑️ Moneda '${curr.codigo}' eliminada exitosamente del ecosistema.`);
    } catch (err: any) {
      alert(`Error al eliminar: ${err?.message}`);
      setErrorMsg(err?.message || 'Error al eliminar la moneda.');
    } finally {
      setSaving(false);
    }
  };

  const handleResetDefaults = async () => {
    if (!window.confirm('¿Desea restaurar las monedas base (BS, USD, COP)? Esto reincorporará las 3 divisas predeterminadas al catálogo del suscriptor.')) {
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const resetList = await resetToDefaultCurrencies(effectiveUserId);
      setCurrencies(resetList);
      setSuccessMsg('✅ Monedas base (BS, USD, COP) restauradas con éxito en el ecosistema.');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Error al restaurar monedas base.');
    } finally {
      setLoading(false);
    }
  };

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
            onClick={handleResetDefaults}
            disabled={loading || saving}
            className="p-2.5 rounded-xl bg-amber-50 hover:bg-amber-100 dark:bg-amber-500/10 dark:hover:bg-amber-500/20 border border-amber-200 dark:border-amber-500/30 text-amber-700 dark:text-amber-300 transition-colors cursor-pointer flex items-center gap-2 text-xs font-bold disabled:opacity-50"
            title="Restaurar monedas base estándar (BS, USD, COP)"
          >
            <RotateCcw className="w-4 h-4 text-amber-500 dark:text-amber-400" />
            <span>Restaurar Base (BS/USD/COP)</span>
          </button>
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
          <p className="font-bold text-emerald-800 dark:text-emerald-300 mb-1">Arquitectura Multi-Empresa SaaS 100% Dinámica</p>
          <p className="text-emerald-700 dark:text-slate-400 leading-relaxed">
            Todas las divisas (incluidas <strong>BS, USD y COP</strong>) son totalmente editables y eliminables según las operaciones de su empresa. Las monedas activas se sincronizan automáticamente con los selectores de Agencias, Grupos, Sistemas/Operadoras, Cuentas Bancarias, Pagos, Gastos y Centro de Cierre.
          </p>
        </div>
      </div>

      {/* Form: Add Currency */}
      <div id="tour-monedas-form" className="bg-white dark:bg-[#0D1B22] border border-slate-200/80 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
        <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-800 dark:text-slate-300 mb-4 flex items-center gap-2">
          <Plus className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
          <span>Añadir Nueva Moneda al Sistema</span>
        </h3>

        <form onSubmit={handleAddCurrency} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-600 dark:text-slate-400 mb-1">
                Código ISO / Siglas *
              </label>
              <input
                type="text"
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                placeholder="Ej: USDT, EUR, BRL"
                className="w-full bg-white dark:bg-[#071217] border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 uppercase focus:outline-hidden focus:border-emerald-500 font-black tracking-wider"
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
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Ej: Tether USD, Euro"
                className="w-full bg-white dark:bg-[#071217] border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-hidden focus:border-emerald-500 font-semibold"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-600 dark:text-slate-400 mb-1">
                Símbolo / Prefijo
              </label>
              <input
                type="text"
                value={simbolo}
                onChange={(e) => setSimbolo(e.target.value)}
                placeholder="Ej: ₮, €, R$"
                className="w-full bg-white dark:bg-[#071217] border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-hidden focus:border-emerald-500 font-bold"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-600 dark:text-slate-400 mb-1">
                Decimales
              </label>
              <select
                value={decimales}
                onChange={(e) => setDecimales(e.target.value)}
                className="w-full bg-white dark:bg-[#071217] border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-hidden focus:border-emerald-500 font-bold"
              >
                <option value="2">2 decimales (Estándar / USD / USDT / EUR)</option>
                <option value="0">0 decimales (Sin centavos / COP / CLP)</option>
                <option value="4">4 decimales (Precisión extendida)</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={saving}
              className={UI_LOCK.buttonPrimary + ' text-xs'}
            >
              {saving ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  <span>REGISTRAR Y HABILITAR MONEDA</span>
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
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-emerald-600 dark:text-cyan-400" />
            <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-800 dark:text-slate-300">
              Monedas Habilitadas en el Ecosistema ({currencies.length})
            </h4>
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
              {currencies.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    Cargando monedas...
                  </td>
                </tr>
              ) : (
                currencies.map((c) => {
                  const flag = getCurrencyFlag(c.codigo);
                  const badgeClasses = getCurrencyBadgeClasses(c.codigo);

                  return (
                    <tr key={c.codigo} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/30 transition-colors">
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
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800/40">
                          <CheckCircle2 className="w-3 h-3 text-emerald-500 dark:text-emerald-400" />
                          <span>Habilitada</span>
                        </span>
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
                          <button
                            onClick={() => handleDeleteCurrency(c)}
                            disabled={currencies.length <= 1}
                            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                              currencies.length <= 1
                                ? 'opacity-30 cursor-not-allowed text-slate-400 dark:text-slate-600'
                                : 'hover:bg-rose-50 dark:hover:bg-rose-500/20 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400'
                            }`}
                            title={
                              currencies.length <= 1
                                ? 'Mínimo 1 moneda requerida para operar'
                                : `Eliminar ${c.codigo}`
                            }
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
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

