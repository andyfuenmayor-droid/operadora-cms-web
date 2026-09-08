import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import type { BetSystem } from '../../types';
import { Layers, Plus, Trash2, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';

export const SystemsTab: React.FC = () => {
  const { effectiveUserId } = useAuth();
  const [systems, setSystems] = useState<BetSystem[]>([]);
  const [loading, setLoading] = useState(false);
  const [nombre, setNombre] = useState('');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const fetchSystems = useCallback(async () => {
    if (!effectiveUserId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('sistemas')
        .select('*')
        .eq('user_id', effectiveUserId)
        .order('id', { ascending: true });

      if (error) throw error;
      setSystems(data || []);
    } catch (err: any) {
      console.error('Error fetching systems:', err);
    } finally {
      setLoading(false);
    }
  }, [effectiveUserId]);

  useEffect(() => {
    fetchSystems();
  }, [fetchSystems]);

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
      setSuccessMsg(`✅ Sistema '${cleanNombre}' guardado exitosamente.`);
      setNombre('');
      fetchSystems();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Error al guardar el sistema.');
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
            <span>Gestión de Sistemas de Apuestas</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Plataformas y proveedores de juego asociados a sus agencias (ej. BETM3, Loterías, Hipismo).
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

      {/* Form: Add System */}
      <div className="bg-[#0D1B22] border border-slate-800 rounded-2xl p-5 shadow-lg">
        <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-300 mb-3 flex items-center gap-2">
          <Plus className="w-4 h-4 text-emerald-400" />
          <span>Añadir Nuevo Sistema</span>
        </h3>

        <form onSubmit={handleAddSystem} className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Ej: BETM3, HIPISMO, ANIMALITOS"
            className="flex-1 bg-[#071217] border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white placeholder-slate-500 uppercase focus:outline-none focus:border-emerald-500 font-bold"
          />

          <button
            type="submit"
            disabled={saving}
            className="py-2 px-5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold text-xs tracking-wide transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
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
        </form>

        {errorMsg && (
          <div className="mt-3 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-semibold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="mt-3 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}
      </div>

      {/* Systems Table */}
      <div className="bg-[#0D1B22] border border-slate-800 rounded-2xl overflow-hidden shadow-lg">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-300">
            Sistemas Registrados ({systems.length})
          </h4>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-[#071217] text-slate-400 font-bold uppercase text-[11px]">
                <th className="py-3 px-4 w-20">ID</th>
                <th className="py-3 px-4">Nombre del Sistema</th>
                <th className="py-3 px-4 text-right w-24">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {systems.length === 0 ? (
                <tr>
                  <td colSpan={3} className="py-8 text-center text-slate-500">
                    No hay sistemas registrados aún.
                  </td>
                </tr>
              ) : (
                systems.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-slate-400">#{s.id}</td>
                    <td className="py-3 px-4 font-black text-white text-sm tracking-wide">
                      {s.nombre_sistema}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => handleDeleteSystem(s.id, s.nombre_sistema)}
                        className="p-1.5 rounded-lg hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
                        title="Eliminar sistema"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
