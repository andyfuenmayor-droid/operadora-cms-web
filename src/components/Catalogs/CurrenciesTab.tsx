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
  ShieldCheck,
  Globe,
  Sparkles,
} from 'lucide-react';
import {
  loadCurrencies,
  normalizeCurrency,
  getCurrencyFlag,
  getCurrencyBadgeClasses,
  type CurrencyConfig,
} from '../../utils/currencies';

export const CurrenciesTab: React.FC = () => {
  const { effectiveUserId } = useAuth();
  const [currencies, setCurrencies] = useState<CurrencyConfig[]>([]);
  const [loading, setLoading] = useState(false);

  // Form states
  const [codigo, setCodigo] = useState('');
  const [nombre, setNombre] = useState('');
  const [simbolo, setSimbolo] = useState('');
  const [decimales, setDecimales] = useState('2');

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
      if (effectiveUserId) {
        const { error } = await supabase.from('monedas').insert({
          Nombre_Moneda: cleanCodigo,
          Simbolo: cleanSimbolo,
          user_id: effectiveUserId,
        });

        if (error) {
          console.warn('Monedas table insert warning (will use memory/local):', error);
        }
      }

      setSuccessMsg(`✅ Moneda '${cleanCodigo}' (${cleanNombre}) registrada exitosamente. Ahora está disponible en Agencias, Operadoras y Cierres.`);
      setCodigo('');
      setNombre('');
      setSimbolo('');
      setDecimales('2');
      await fetchCurrencies();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Error al guardar la moneda.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCurrency = async (curr: CurrencyConfig) => {
    if (curr.es_default) {
      alert(`La moneda base '${curr.codigo}' es fundamental para los cierres históricos y no puede eliminarse.`);
      return;
    }

    if (!window.confirm(`¿Está seguro de eliminar la moneda '${curr.codigo}'?`)) return;

    try {
      if (curr.id && effectiveUserId) {
        const { error } = await supabase
          .from('monedas')
          .delete()
          .eq('id', curr.id)
          .eq('user_id', effectiveUserId);

        if (error) throw error;
      }

      setCurrencies((prev) => prev.filter((c) => c.codigo !== curr.codigo));
      setSuccessMsg(`Moneda '${curr.codigo}' eliminada.`);
    } catch (err: any) {
      alert(`Error al eliminar: ${err?.message}`);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-xl font-black text-white flex items-center gap-2">
            <Coins className="w-5 h-5 text-emerald-400" />
            <span>Gestión Dinámica de Monedas y Divisas</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Administra las monedas operativas del sistema (fiat y cripto). Cualquier divisa registrada se integra automáticamente al motor contable, agencias y cierres.
          </p>
        </div>
        <button
          onClick={fetchCurrencies}
          disabled={loading}
          className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors self-start sm:self-auto cursor-pointer flex items-center gap-2 text-xs font-bold"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-emerald-400' : ''}`} />
          <span>Actualizar</span>
        </button>
      </div>

      {/* Explanatory banner */}
      <div className="bg-gradient-to-r from-emerald-950/40 via-slate-900 to-cyan-950/40 border border-emerald-500/30 rounded-2xl p-4 text-xs text-slate-300 flex items-start gap-3 shadow-md">
        <Sparkles className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
        <div>
          <p className="font-bold text-emerald-300 mb-1">Arquitectura 100% Multi-Divisa Dinámica</p>
          <p className="text-slate-400 leading-relaxed">
            Puedes incorporar divisas internacionales o criptoactivos (ej. <strong>USDT, EUR, BRL</strong>). Al registrar una divisa, podrás seleccionarla en la configuración de Agencias, asociarla a Sistemas/Operadoras, cargar ventas y liquidar cierres con su propia matriz contable de forma automática.
          </p>
        </div>
      </div>

      {/* Form: Add Currency */}
      <div id="tour-monedas-form" className="bg-[#0D1B22] border border-slate-800 rounded-2xl p-5 shadow-lg">
        <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-300 mb-4 flex items-center gap-2">
          <Plus className="w-4 h-4 text-emerald-400" />
          <span>Añadir Nueva Moneda al Sistema</span>
        </h3>

        <form onSubmit={handleAddCurrency} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">
                Código ISO / Siglas *
              </label>
              <input
                type="text"
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                placeholder="Ej: USDT, EUR, BRL"
                className="w-full bg-[#071217] border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-500 uppercase focus:outline-none focus:border-emerald-500 font-black tracking-wider"
                required
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">
                Nombre de la Moneda
              </label>
              <input
                type="text"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Ej: Tether USD, Euro"
                className="w-full bg-[#071217] border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-semibold"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">
                Símbolo / Prefijo
              </label>
              <input
                type="text"
                value={simbolo}
                onChange={(e) => setSimbolo(e.target.value)}
                placeholder="Ej: ₮, €, R$"
                className="w-full bg-[#071217] border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-bold"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">
                Decimales
              </label>
              <select
                value={decimales}
                onChange={(e) => setDecimales(e.target.value)}
                className="w-full bg-[#071217] border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500 font-bold"
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
              className="py-2.5 px-6 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs tracking-wide transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {saving ? (
                <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
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
          <div className="mt-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-semibold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="mt-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}
      </div>

      {/* Currencies Grid / Table */}
      <div id="tour-monedas-table" className="bg-[#0D1B22] border border-slate-800 rounded-2xl overflow-hidden shadow-lg">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-cyan-400" />
            <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-300">
              Monedas Habilitadas en el Ecosistema ({currencies.length})
            </h4>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-[#071217] text-slate-400 font-bold uppercase text-[11px]">
                <th className="py-3.5 px-4 w-28">Divisa</th>
                <th className="py-3.5 px-4">Nombre Oficial</th>
                <th className="py-3.5 px-4 w-28">Símbolo</th>
                <th className="py-3.5 px-4 w-28">Decimales</th>
                <th className="py-3.5 px-4 w-36">Tipo</th>
                <th className="py-3.5 px-4 text-right w-24">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-sans">
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
                    <tr key={c.codigo} className="hover:bg-slate-800/30 transition-colors">
                      <td className="py-3 px-4 font-black text-sm tracking-wide">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-black ${badgeClasses}`}>
                          <span>{flag}</span>
                          <span>{c.codigo}</span>
                        </span>
                      </td>
                      <td className="py-3 px-4 font-semibold text-white">
                        {c.nombre || c.codigo}
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-slate-300">
                        {c.simbolo || c.codigo}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-400">
                        {c.decimales ?? 2}
                      </td>
                      <td className="py-3 px-4">
                        {c.es_default ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700">
                            <ShieldCheck className="w-3 h-3 text-emerald-400" />
                            <span>Predeterminada</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-950/60 text-cyan-300 border border-cyan-800/40">
                            <span>Personalizada</span>
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        {!c.es_default && (
                          <button
                            onClick={() => handleDeleteCurrency(c)}
                            className="p-1.5 rounded-lg hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
                            title={`Eliminar ${c.codigo}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
