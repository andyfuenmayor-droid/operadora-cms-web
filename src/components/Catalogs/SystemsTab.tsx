import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import type { BetSystem } from '../../types';
import {
  Layers,
  Plus,
  Trash2,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Edit2,
  Tag,
  FileSpreadsheet
} from 'lucide-react';
import {
  loadSystemKeywords,
  saveSystemKeywords,
  DEFAULT_SYSTEM_KEYWORDS,
  type SystemKeywordsMap,
  type SystemKeywordConfig
} from '../../utils/systemKeywords';

export const SystemsTab: React.FC = () => {
  const { effectiveUserId } = useAuth();
  const [systems, setSystems] = useState<BetSystem[]>([]);
  const [loading, setLoading] = useState(false);
  const [nombre, setNombre] = useState('');
  const [colVenta, setColVenta] = useState('');
  const [colPremio, setColPremio] = useState('');
  const [colAgencia, setColAgencia] = useState('');

  const [systemKeywords, setSystemKeywords] = useState<SystemKeywordsMap>(DEFAULT_SYSTEM_KEYWORDS);
  const [editingSystem, setEditingSystem] = useState<BetSystem | null>(null);
  const [editColVenta, setEditColVenta] = useState('');
  const [editColPremio, setEditColPremio] = useState('');
  const [editColAgencia, setEditColAgencia] = useState('');

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const fetchSystems = useCallback(async () => {
    if (!effectiveUserId) return;
    setLoading(true);
    try {
      const [sysRes, keywordsMap] = await Promise.all([
        supabase
          .from('sistemas')
          .select('*')
          .eq('user_id', effectiveUserId)
          .order('id', { ascending: true }),
        loadSystemKeywords(effectiveUserId)
      ]);

      if (sysRes.error) throw sysRes.error;
      setSystems(sysRes.data || []);
      setSystemKeywords(keywordsMap);
    } catch (err: any) {
      console.error('Error fetching systems:', err);
    } finally {
      setLoading(false);
    }
  }, [effectiveUserId]);

  useEffect(() => {
    fetchSystems();
  }, [fetchSystems]);

  // Auto-fill suggested column names when typing system name in Add form
  const handleNombreChange = (val: string) => {
    setNombre(val);
    const upper = val.trim().toUpperCase();
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

  const handleAddSystem = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanNombre = nombre.trim().toUpperCase();
    if (!cleanNombre) {
      setErrorMsg('Por favor ingrese el nombre del sistema.');
      return;
    }

    if (systems.some((s) => s.nombre_sistema.toUpperCase() === cleanNombre)) {
      setErrorMsg(`El sistema '${cleanNombre}' ya está registrado.`);
      return;
    }

    setSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const { error } = await supabase.from('sistemas').insert({
        nombre_sistema: cleanNombre,
        user_id: effectiveUserId,
      });

      if (error) throw error;

      // Save custom keywords for this system
      const updatedKeywords: SystemKeywordsMap = {
        ...systemKeywords,
        [cleanNombre]: {
          venta: colVenta.trim() || 'Venta',
          premio: colPremio.trim() || 'Premio',
          agencia: colAgencia.trim() || 'Agencia',
        },
      };

      if (effectiveUserId) {
        await saveSystemKeywords(effectiveUserId, updatedKeywords);
      }
      setSystemKeywords(updatedKeywords);

      setSuccessMsg(`✅ Sistema '${cleanNombre}' guardado exitosamente con sus palabras clave de reporte.`);
      setNombre('');
      setColVenta('');
      setColPremio('');
      setColAgencia('');
      await fetchSystems();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Error al guardar el sistema.');
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
    };
    setEditColVenta(conf.venta || '');
    setEditColPremio(conf.premio || '');
    setEditColAgencia(conf.agencia || '');
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
        },
      };

      await saveSystemKeywords(effectiveUserId, updatedKeywords);
      setSystemKeywords(updatedKeywords);
      setSuccessMsg(`✅ Palabras clave de '${editingSystem.nombre_sistema}' actualizadas correctamente.`);
      setEditingSystem(null);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Error al actualizar palabras clave.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSystem = async (id: number, sysName: string) => {
    if (!window.confirm(`¿Está seguro de eliminar el sistema '${sysName}'?`)) return;

    try {
      const { error } = await supabase
        .from('sistemas')
        .delete()
        .eq('id', id)
        .eq('user_id', effectiveUserId);

      if (error) throw error;
      setSystems((prev) => prev.filter((s) => s.id !== id));
      setSuccessMsg(`Sistema '${sysName}' eliminado.`);
    } catch (err: any) {
      alert(`Error al eliminar: ${err?.message}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-xl font-black text-white flex items-center gap-2">
            <Layers className="w-5 h-5 text-emerald-400" />
            <span>Gestión de Sistemas y Proveedores</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Configuración de proveedores de apuestas y mapeo dinámico de palabras clave para importar reportes (Excel, CSV, PDF).
          </p>
        </div>
        <button
          onClick={fetchSystems}
          disabled={loading}
          className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors self-start sm:self-auto cursor-pointer"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-emerald-400' : ''}`} />
        </button>
      </div>

      {/* Form: Add System with Dynamic Column Keywords */}
      <div className="bg-[#0D1B22] border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
        <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-300 flex items-center gap-2">
          <Plus className="w-4 h-4 text-emerald-400" />
          <span>Añadir Nuevo Sistema / Proveedor</span>
        </h3>

        <form onSubmit={handleAddSystem} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="sm:col-span-1 space-y-1">
              <label className="text-xs font-bold text-white flex items-center gap-1">
                <span>Nombre del Sistema *</span>
              </label>
              <input
                type="text"
                value={nombre}
                onChange={(e) => handleNombreChange(e.target.value)}
                placeholder="Ej: KENO, BETM3, HIPISMO"
                className="w-full bg-[#071217] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 uppercase focus:outline-none focus:border-emerald-500 font-bold"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1">
                <Tag className="w-3 h-3 text-amber-400" />
                <span>Columna de Agencia / ID</span>
              </label>
              <input
                type="text"
                value={colAgencia}
                onChange={(e) => setColAgencia(e.target.value)}
                placeholder="Ej: Agent, Nombre, USUARIO"
                className="w-full bg-[#071217] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono placeholder-slate-600 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1">
                <Tag className="w-3 h-3 text-cyan-400" />
                <span>Columna de Ventas</span>
              </label>
              <input
                type="text"
                value={colVenta}
                onChange={(e) => setColVenta(e.target.value)}
                placeholder="Ej: Total accepted, Venta, Jugado"
                className="w-full bg-[#071217] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono placeholder-slate-600 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1">
                <Tag className="w-3 h-3 text-rose-400" />
                <span>Columna de Premios</span>
              </label>
              <input
                type="text"
                value={colPremio}
                onChange={(e) => setColPremio(e.target.value)}
                placeholder="Ej: Total paid, Premio, Pagados"
                className="w-full bg-[#071217] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono placeholder-slate-600 focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <p className="text-[11px] text-slate-400">
              💡 Estas palabras clave le indicarán al motor cómo leer las columnas de ventas y premios en los reportes de este proveedor.
            </p>
            <button
              type="submit"
              disabled={saving}
              className="py-2.5 px-5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold text-xs tracking-wide transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {saving ? (
                <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
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
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-semibold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}
      </div>

      {/* Systems Table */}
      <div className="bg-[#0D1B22] border border-slate-800 rounded-2xl overflow-hidden shadow-lg">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-300">
            Sistemas Registrados y Palabras Clave ({systems.length})
          </h4>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-[#071217] text-slate-400 font-bold uppercase text-[11px]">
                <th className="py-3 px-4 w-16">ID</th>
                <th className="py-3 px-4 min-w-[120px]">Sistema</th>
                <th className="py-3 px-4 min-w-[140px]">Columna Agencia</th>
                <th className="py-3 px-4 min-w-[140px]">Columna Ventas</th>
                <th className="py-3 px-4 min-w-[140px]">Columna Premios</th>
                <th className="py-3 px-4 text-right w-24">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {systems.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500 font-sans">
                    No hay sistemas registrados aún.
                  </td>
                </tr>
              ) : (
                systems.map((s) => {
                  const conf = systemKeywords[s.nombre_sistema] || DEFAULT_SYSTEM_KEYWORDS[s.nombre_sistema] || {
                    venta: 'Venta',
                    premio: 'Premio',
                    agencia: 'Agencia',
                  };

                  return (
                    <tr key={s.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-slate-400">#{s.id}</td>
                      <td className="py-3 px-4 font-sans font-black text-white text-sm tracking-wide">
                        🎰 {s.nombre_sistema}
                      </td>
                      <td className="py-3 px-4 text-amber-300">
                        <span className="px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20">
                          {conf.agencia || 'Agent / Nombre'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-cyan-300 font-bold">
                        <span className="px-2 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/20">
                          {conf.venta || 'Venta'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-rose-300 font-bold">
                        <span className="px-2 py-0.5 rounded bg-rose-500/10 border border-rose-500/20">
                          {conf.premio || 'Premio'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleOpenEdit(s)}
                            className="p-1.5 rounded-lg hover:bg-cyan-500/20 text-slate-400 hover:text-cyan-400 transition-colors cursor-pointer"
                            title="Editar palabras clave de reporte"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteSystem(s.id, s.nombre_sistema)}
                            className="p-1.5 rounded-lg hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
                            title="Eliminar sistema"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
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

      {/* Edit Keywords Modal */}
      {editingSystem && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0D1B22] border border-cyan-500/30 rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl animate-fade-in">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-cyan-400" />
                <span>Palabras Clave de Reporte: <span className="text-emerald-400">{editingSystem.nombre_sistema}</span></span>
              </h3>
              <button
                onClick={() => setEditingSystem(null)}
                className="text-slate-400 hover:text-white text-xs font-bold"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-300">
              Define los nombres de las columnas con los que este proveedor exporta sus reportes en Excel, CSV o PDF.
            </p>

            <form onSubmit={handleSaveEditKeywords} className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300 flex items-center gap-1">
                  <Tag className="w-3 h-3 text-amber-400" />
                  <span>Columna de Agencia / ID</span>
                </label>
                <input
                  type="text"
                  value={editColAgencia}
                  onChange={(e) => setEditColAgencia(e.target.value)}
                  placeholder="Ej: Agent, Nombre, USUARIO"
                  className="w-full bg-[#071217] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300 flex items-center gap-1">
                  <Tag className="w-3 h-3 text-cyan-400" />
                  <span>Columna de Ventas</span>
                </label>
                <input
                  type="text"
                  required
                  value={editColVenta}
                  onChange={(e) => setEditColVenta(e.target.value)}
                  placeholder="Ej: Total accepted, Venta, VENTAS"
                  className="w-full bg-[#071217] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300 flex items-center gap-1">
                  <Tag className="w-3 h-3 text-rose-400" />
                  <span>Columna de Premios</span>
                </label>
                <input
                  type="text"
                  required
                  value={editColPremio}
                  onChange={(e) => setEditColPremio(e.target.value)}
                  placeholder="Ej: Total paid, Premio, PREMIOS"
                  className="w-full bg-[#071217] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingSystem(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs shadow-md transition-all cursor-pointer disabled:opacity-50"
                >
                  {saving ? 'Guardando...' : 'Guardar Palabras Clave'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
