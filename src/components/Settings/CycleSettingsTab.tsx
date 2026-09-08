import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { Calendar, Save, CheckCircle2, AlertCircle, RefreshCw, Layers, Clock } from 'lucide-react';
import confetti from 'canvas-confetti';

export const CycleSettingsTab: React.FC = () => {
  const { effectiveUserId, systemCycle, refreshSystemCycle } = useAuth();
  const [fechaDesde, setFechaDesde] = useState(systemCycle.desde);
  const [fechaHasta, setFechaHasta] = useState(systemCycle.hasta);
  const [tipoCierre, setTipoCierre] = useState<'SEMANAL' | 'DIARIO'>(systemCycle.tipo);
  const [semanaNo, setSemanaNo] = useState(systemCycle.semana);

  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    setFechaDesde(systemCycle.desde);
    setFechaHasta(systemCycle.hasta);
    setTipoCierre(systemCycle.tipo);
    setSemanaNo(systemCycle.semana);
  }, [systemCycle]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!effectiveUserId) return;

    if (!fechaDesde || !fechaHasta || !semanaNo.trim()) {
      setMessage({ type: 'error', text: 'Todos los campos del ciclo operativo son obligatorios.' });
      return;
    }

    if (fechaDesde > fechaHasta) {
      setMessage({ type: 'error', text: 'La fecha de inicio no puede ser posterior a la fecha de fin.' });
      return;
    }

    setIsSaving(true);
    setMessage(null);

    try {
      // Clean existing configs for this user
      await supabase
        .from('config_sistema')
        .delete()
        .eq('user_id', effectiveUserId);

      // Insert fresh configs
      const records = [
        { user_id: effectiveUserId, parametro: 'fecha_desde', valor: fechaDesde },
        { user_id: effectiveUserId, parametro: 'fecha_hasta', valor: fechaHasta },
        { user_id: effectiveUserId, parametro: 'tipo_cierre', valor: tipoCierre.toUpperCase() },
        { user_id: effectiveUserId, parametro: 'semana_no', valor: semanaNo.trim() },
      ];

      const { error } = await supabase
        .from('config_sistema')
        .insert(records);

      if (error) throw error;

      await refreshSystemCycle();

      confetti({
        particleCount: 50,
        spread: 60,
        origin: { y: 0.7 },
      });

      setMessage({ type: 'success', text: '¡Ciclo de trabajo guardado y sincronizado exitosamente!' });
    } catch (err: any) {
      console.error('Error saving cycle:', err);
      setMessage({ type: 'error', text: err?.message || 'Error al guardar la configuración del ciclo.' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2">
            <span className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              <Calendar className="w-5 h-5" />
            </span>
            Ajustes del Ciclo Operativo
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Configura el rango de fechas de trabajo, el modo de operación (semanal/diario) y el identificador de ciclo.
          </p>
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
            <AlertCircle className="w-5 h-5 shrink-0" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      {/* Cycle Preview Banner */}
      <div className="bg-gradient-to-r from-cyan-950/40 via-slate-900 to-slate-900 border border-cyan-500/20 rounded-3xl p-6 relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 w-64 bg-cyan-500/5 blur-3xl pointer-events-none" />
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-cyan-400 bg-cyan-400/10 px-2.5 py-1 rounded-full border border-cyan-400/20">
              Ciclo Activo en Sistema
            </span>
            <h3 className="text-lg font-bold text-white mt-2 flex items-center gap-2">
              <Clock className="w-4 h-4 text-slate-400" />
              {systemCycle.tipo === 'SEMANAL' ? `Semana ${systemCycle.semana}` : `Operación Diaria ${systemCycle.semana}`}
            </h3>
            <p className="text-xs text-slate-400 font-mono mt-1">
              Rango actual: <span className="text-cyan-300 font-semibold">{systemCycle.desde}</span> hasta{' '}
              <span className="text-cyan-300 font-semibold">{systemCycle.hasta}</span>
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => refreshSystemCycle()}
              className="px-4 py-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex items-center gap-2 transition-all border border-slate-700"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Recargar Estado
            </button>
          </div>
        </div>
      </div>

      {/* Form Card */}
      <div className="bg-[#0D1B22] border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl">
        <h3 className="text-base font-bold text-white mb-4 flex items-center gap-2">
          <Layers className="w-4 h-4 text-emerald-400" />
          Editar Parámetros de Ciclo
        </h3>

        <form onSubmit={handleSave} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Fecha Desde */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-cyan-400" />
                Fecha de Inicio (Desde)
              </label>
              <input
                type="date"
                value={fechaDesde}
                onChange={(e) => setFechaDesde(e.target.value)}
                required
                className="w-full bg-[#071217] border border-slate-700 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-cyan-500 transition-colors"
              />
            </div>

            {/* Fecha Hasta */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-cyan-400" />
                Fecha de Fin (Hasta)
              </label>
              <input
                type="date"
                value={fechaHasta}
                onChange={(e) => setFechaHasta(e.target.value)}
                required
                className="w-full bg-[#071217] border border-slate-700 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-cyan-500 transition-colors"
              />
            </div>

            {/* Modo de Operación */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300">
                Modo de Operación
              </label>
              <select
                value={tipoCierre}
                onChange={(e) => setTipoCierre(e.target.value as 'SEMANAL' | 'DIARIO')}
                className="w-full bg-[#071217] border border-slate-700 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-cyan-500 transition-colors"
              >
                <option value="SEMANAL">SEMANAL (Lunes a Domingo / Corte Periódico)</option>
                <option value="DIARIO">DIARIO (Corte y arqueo por jornada diaria)</option>
              </select>
            </div>

            {/* Identificador Semana / Día */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300">
                Identificador (Ej: 01, 35, 2026-W36)
              </label>
              <input
                type="text"
                value={semanaNo}
                onChange={(e) => setSemanaNo(e.target.value)}
                placeholder="01"
                required
                className="w-full bg-[#071217] border border-slate-700 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-cyan-500 transition-colors"
              />
            </div>
          </div>

          <div className="pt-4 border-t border-slate-800/80 flex justify-end">
            <button
              type="submit"
              disabled={isSaving}
              className="px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-bold text-sm shadow-lg shadow-emerald-500/20 flex items-center gap-2 transition-all disabled:opacity-50 cursor-pointer"
            >
              <Save className="w-4 h-4" />
              {isSaving ? 'Guardando...' : 'Guardar Ciclo de Trabajo'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
