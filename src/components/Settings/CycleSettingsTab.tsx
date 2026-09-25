import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { Calendar, Save, CheckCircle2, AlertCircle, RefreshCw, Layers, Clock, Sun, Moon, Palette, Sparkles } from 'lucide-react';
import confetti from 'canvas-confetti';

export const CycleSettingsTab: React.FC = () => {
  const { effectiveUserId, systemCycle, refreshSystemCycle } = useAuth();
  const { setTheme, isLight, resetToAutoTheme, isManualTheme } = useTheme();
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
            <span>Configuración de Ciclo Operativo</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Define las fechas maestras y la numeración de semana para la consolidación de saldos y cierres de la operadora.
          </p>
        </div>

        {/* Current status chip */}
        <div className="flex items-center gap-2 bg-[#0D1B22] border border-slate-800 p-2 rounded-2xl shrink-0 self-start sm:self-auto">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse ml-1" />
          <div className="text-left pr-2">
            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Ciclo Activo</div>
            <div className="text-xs font-black text-white">Semana {systemCycle.semana} ({systemCycle.tipo})</div>
          </div>
        </div>
      </div>

      {/* Main Form Card */}
      <div className="bg-[#0D1B22] border border-slate-800 rounded-3xl p-6 shadow-xl relative overflow-hidden">
        {message && (
          <div
            className={`p-4 rounded-2xl mb-6 text-xs sm:text-sm font-semibold flex items-center gap-3 animate-fadeIn ${
              message.type === 'success'
                ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                : 'bg-red-500/10 border border-red-500/20 text-red-400'
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

        <form onSubmit={handleSave} className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {/* Tipo de Cierre */}
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-cyan-400" />
                <span>Modalidad de Cierre</span>
              </label>
              <div className="grid grid-cols-2 gap-2 p-1 bg-[#071217] rounded-2xl border border-slate-800">
                <button
                  type="button"
                  onClick={() => setTipoCierre('SEMANAL')}
                  className={`py-2 px-3 rounded-xl text-xs font-bold transition-all ${
                    tipoCierre === 'SEMANAL'
                      ? 'bg-cyan-500 text-black shadow-md font-black'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Semanal
                </button>
                <button
                  type="button"
                  onClick={() => setTipoCierre('DIARIO')}
                  className={`py-2 px-3 rounded-xl text-xs font-bold transition-all ${
                    tipoCierre === 'DIARIO'
                      ? 'bg-cyan-500 text-black shadow-md font-black'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Diario
                </button>
              </div>
            </div>

            {/* Número de Semana */}
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-cyan-400" />
                <span>Identificador / Semana No.</span>
              </label>
              <input
                type="text"
                value={semanaNo}
                onChange={(e) => setSemanaNo(e.target.value)}
                placeholder="Ej. 12, 12-A, D-24"
                className="w-full bg-[#071217] border border-slate-800 rounded-2xl px-4 py-2.5 text-sm text-white font-mono placeholder:text-slate-600 focus:outline-none focus:border-cyan-500/50"
              />
            </div>

            {/* Fecha Desde */}
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-emerald-400" />
                <span>Fecha Inicio de Ciclo</span>
              </label>
              <input
                type="date"
                value={fechaDesde}
                onChange={(e) => setFechaDesde(e.target.value)}
                className="w-full bg-[#071217] border border-slate-800 rounded-2xl px-4 py-2.5 text-sm text-white font-mono focus:outline-none focus:border-emerald-500/50"
              />
            </div>

            {/* Fecha Hasta */}
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-emerald-400" />
                <span>Fecha Cierre de Ciclo</span>
              </label>
              <input
                type="date"
                value={fechaHasta}
                onChange={(e) => setFechaHasta(e.target.value)}
                className="w-full bg-[#071217] border border-slate-800 rounded-2xl px-4 py-2.5 text-sm text-white font-mono focus:outline-none focus:border-emerald-500/50"
              />
            </div>
          </div>

          {/* Selector de Apariencia y Tema */}
          <div className="pt-4 border-t border-slate-800/80 space-y-3">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
              <Palette className="w-4 h-4 text-emerald-400" />
              <span>Apariencia y Tema Visual</span>
            </label>
            <p className="text-xs text-slate-400">
              Selecciona el estilo visual. La opción automática adapta el tema según tu explorador y el horario (modo claro de 7:00 AM a 6:59 PM y modo oscuro de 7:00 PM a 7:00 AM).
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
              {/* Opción Automático */}
              <div
                onClick={resetToAutoTheme}
                className={`p-3.5 rounded-2xl border cursor-pointer transition-all flex flex-col justify-between ${
                  !isManualTheme
                    ? 'bg-cyan-500/10 border-cyan-500/50 ring-1 ring-cyan-500/40 shadow-lg'
                    : 'bg-[#071217] border-slate-800 hover:border-slate-700 opacity-70 hover:opacity-100'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                      <span>Automático</span>
                      <span className="text-[9px] font-mono uppercase px-1 py-0.2 rounded bg-cyan-500/20 text-cyan-300">Horario</span>
                    </h4>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      Claro (7am - 7pm) / Oscuro (7pm - 7am)
                    </p>
                  </div>
                </div>
                {!isManualTheme && (
                  <div className="mt-2 text-[10px] text-cyan-400 font-bold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                    Activo actualmente
                  </div>
                )}
              </div>

              {/* Opción Modo Oscuro */}
              <div
                onClick={() => setTheme('dark')}
                className={`p-3.5 rounded-2xl border cursor-pointer transition-all flex flex-col justify-between ${
                  isManualTheme && !isLight
                    ? 'bg-[#0a1820] border-emerald-500/50 ring-1 ring-emerald-500/40 shadow-lg'
                    : 'bg-[#071217] border-slate-800 hover:border-slate-700 opacity-70 hover:opacity-100'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-200">
                    <Moon className="w-4 h-4 text-indigo-400" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                      <span>Modo Oscuro</span>
                      <span className="text-[9px] font-mono uppercase px-1 py-0.2 rounded bg-slate-800 text-slate-400">Manual</span>
                    </h4>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      Fondo oscuro (#071217) permanente
                    </p>
                  </div>
                </div>
                {isManualTheme && !isLight && (
                  <div className="mt-2 text-[10px] text-emerald-400 font-bold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    Fijado manualmente
                  </div>
                )}
              </div>

              {/* Opción Modo Claro */}
              <div
                onClick={() => setTheme('light')}
                className={`p-3.5 rounded-2xl border cursor-pointer transition-all flex flex-col justify-between ${
                  isManualTheme && isLight
                    ? 'bg-amber-500/10 border-amber-500/50 ring-1 ring-amber-500/40 shadow-lg'
                    : 'bg-[#071217] border-slate-800 hover:border-slate-700 opacity-70 hover:opacity-100'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
                    <Sun className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                      <span>Vista Clara</span>
                      <span className="text-[9px] font-mono uppercase px-1 py-0.2 rounded bg-amber-500/10 text-amber-400">Manual</span>
                    </h4>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      Fondo claro (#F8FAFC) permanente
                    </p>
                  </div>
                </div>
                {isManualTheme && isLight && (
                  <div className="mt-2 text-[10px] text-amber-400 font-bold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                    Fijado manualmente
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-800/80 flex justify-end">
            <button
              type="submit"
              disabled={isSaving}
              className="w-full sm:w-auto px-6 py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-sm transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <Save className={`w-4 h-4 ${isSaving ? 'animate-spin' : ''}`} />
              <span>{isSaving ? 'Guardando...' : 'Guardar Ciclo Operativo'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
