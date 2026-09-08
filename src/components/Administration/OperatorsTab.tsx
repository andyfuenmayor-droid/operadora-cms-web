import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { formatCurrency, formatDate } from '../../utils/formatters';
import {
  Trophy,
  Save,
  Plus,
  RefreshCw,
  Layers,
  DollarSign,
  TrendingUp,
  CheckCircle2,
  AlertTriangle,
  History,
  Building2
} from 'lucide-react';
import confetti from 'canvas-confetti';

interface OperadoraResult {
  id: number;
  fecha: string;
  sistema: string;
  moneda: string;
  venta_bruta: number;
  premios: number;
  comision_manual: number;
  participacion_manual: number;
  utilidad_final_casa: number;
}

export const OperatorsTab: React.FC = () => {
  const { effectiveUserId } = useAuth();

  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [sales, setSales] = useState<any[]>([]);
  const [history, setHistory] = useState<OperadoraResult[]>([]);

  // Selection
  const [selectedSistema, setSelectedSistema] = useState('');
  const [selectedMoneda, setSelectedMoneda] = useState('');

  // Manual Adjustments
  const [comisionFija, setComisionFija] = useState('0');
  const [participacionComercializador, setParticipacionComercializador] = useState('0');

  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadData = async () => {
    if (!effectiveUserId) return;
    setIsLoading(true);
    setMessage(null);

    try {
      const [vRes, hRes] = await Promise.all([
        supabase.from('carga_actual').select('*').eq('user_id', effectiveUserId),
        supabase.from('resultados_operadora').select('*').eq('user_id', effectiveUserId).order('id', { ascending: false }),
      ]);

      const salesData = vRes.data || [];
      setSales(salesData);
      setHistory(hRes.data || []);

      if (salesData.length > 0) {
        const uniqueSis = Array.from(new Set(salesData.map((s: any) => String(s.sistema || '').toUpperCase()))).filter(Boolean);
        if (uniqueSis.length > 0 && !selectedSistema) {
          setSelectedSistema(uniqueSis[0]);
          const monForSis = Array.from(
            new Set(salesData.filter((s: any) => String(s.sistema || '').toUpperCase() === uniqueSis[0]).map((s: any) => String(s.moneda || '').toUpperCase()))
          ).filter(Boolean);
          if (monForSis.length > 0 && !selectedMoneda) {
            setSelectedMoneda(monForSis[0]);
          }
        }
      }
    } catch (err: any) {
      console.error('Error loading operator data:', err);
      setMessage({ type: 'error', text: err?.message || 'Error al cargar datos de operadora.' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [effectiveUserId]);

  // Unique systems available from current sales
  const availableSystems = useMemo(() => {
    return Array.from(new Set(sales.map((s) => String(s.sistema || '').toUpperCase()))).filter(Boolean).sort();
  }, [sales]);

  // Available currencies for selected system
  const availableCurrencies = useMemo(() => {
    return Array.from(
      new Set(
        sales
          .filter((s) => String(s.sistema || '').toUpperCase() === selectedSistema)
          .map((s) => String(s.moneda || '').toUpperCase())
      )
    ).filter(Boolean).sort();
  }, [sales, selectedSistema]);

  // Auto-select currency when system changes
  useEffect(() => {
    if (availableCurrencies.length > 0 && !availableCurrencies.includes(selectedMoneda)) {
      setSelectedMoneda(availableCurrencies[0]);
    }
  }, [selectedSistema, availableCurrencies]);

  // Financial aggregates for the selected system and currency
  const financialData = useMemo(() => {
    const matching = sales.filter(
      (s) =>
        String(s.sistema || '').toUpperCase() === selectedSistema &&
        String(s.moneda || '').toUpperCase() === selectedMoneda
    );

    const ventaBruta = matching.reduce((sum, curr) => sum + Number(curr.venta || 0), 0);
    const premios = matching.reduce((sum, curr) => sum + Number(curr.premios || 0), 0);

    const cFija = Number(comisionFija) || 0;
    const pComercializador = Number(participacionComercializador) || 0;

    const utilidadFinal = Math.round(((ventaBruta - premios) - cFija - pComercializador) * 100) / 100;

    return {
      ventaBruta: Math.round(ventaBruta * 100) / 100,
      premios: Math.round(premios * 100) / 100,
      utilidadFinal,
    };
  }, [sales, selectedSistema, selectedMoneda, comisionFija, participacionComercializador]);

  // Save Settlement with Commercializer
  const handleSaveSettlement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!effectiveUserId || !selectedSistema || !selectedMoneda) return;

    setIsProcessing(true);

    try {
      const payload = {
        user_id: effectiveUserId,
        fecha: new Date().toISOString().slice(0, 10),
        sistema: selectedSistema,
        moneda: selectedMoneda,
        venta_bruta: financialData.ventaBruta,
        premios: financialData.premios,
        comision_manual: Number(comisionFija) || 0,
        participacion_manual: Number(participacionComercializador) || 0,
        utilidad_final_casa: financialData.utilidadFinal,
      };

      const { error } = await supabase.from('resultados_operadora').insert(payload);
      if (error) throw error;

      confetti({ particleCount: 50, spread: 60 });
      setMessage({ type: 'success', text: `¡Liquidación de ${selectedSistema} (${selectedMoneda}) guardada exitosamente!` });

      setComisionFija('0');
      setParticipacionComercializador('0');
      await loadData();
    } catch (err: any) {
      console.error('Error saving operator settlement:', err);
      setMessage({ type: 'error', text: err?.message || 'Error al guardar liquidación de operadora.' });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2">
            <span className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <Trophy className="w-5 h-5" />
            </span>
            Venta y Liquidación de Operadora
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Consolidado general de ventas por sistema, premios de agencias y liquidación neta con el comercializador.
          </p>
        </div>

        <button
          onClick={() => loadData()}
          disabled={isLoading}
          className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex items-center gap-1.5 transition-all border border-slate-700 cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          Actualizar
        </button>
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
            <AlertTriangle className="w-5 h-5 shrink-0" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      {availableSystems.length === 0 ? (
        <div className="bg-[#0D1B22] border border-slate-800 rounded-3xl p-12 text-center space-y-3">
          <Trophy className="w-12 h-12 text-slate-600 mx-auto" />
          <h4 className="text-base font-bold text-white">No hay ventas registradas</h4>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            Registra o importa ventas en el módulo de Ventas y Movimientos para generar liquidaciones de operadora por sistema.
          </p>
        </div>
      ) : (
        <div className="bg-[#0D1B22] border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl space-y-6">
          {/* Selectors */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">🎯 Seleccionar Sistema</label>
              <select
                value={selectedSistema}
                onChange={(e) => setSelectedSistema(e.target.value)}
                className="w-full bg-[#071217] border border-slate-700 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-amber-500"
              >
                {availableSystems.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">🪙 Moneda</label>
              <select
                value={selectedMoneda}
                onChange={(e) => setSelectedMoneda(e.target.value)}
                className="w-full bg-[#071217] border border-slate-700 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-amber-500"
              >
                {availableCurrencies.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Aggregates Metrics Banner */}
          <div className="grid grid-cols-2 gap-4 pt-2">
            <div className="bg-[#071217] border border-slate-800 rounded-2xl p-4 text-center">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Venta Bruta Consolidada</div>
              <div className="text-xl sm:text-2xl font-black text-white font-mono mt-1">
                {formatCurrency(financialData.ventaBruta, selectedMoneda as any)}
              </div>
            </div>

            <div className="bg-[#071217] border border-slate-800 rounded-2xl p-4 text-center">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total Premios Agencias</div>
              <div className="text-xl sm:text-2xl font-black text-rose-400 font-mono mt-1">
                {formatCurrency(financialData.premios, selectedMoneda as any)}
              </div>
            </div>
          </div>

          {/* Adjustments Form */}
          <form onSubmit={handleSaveSettlement} className="space-y-6 pt-2 border-t border-slate-800">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              🖋️ Ajustes de Liquidación con Comercializador
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">Comisión Fija Comercializador</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={comisionFija}
                  onChange={(e) => setComisionFija(e.target.value)}
                  className="w-full bg-[#071217] border border-slate-700 rounded-xl px-4 py-2.5 text-xs text-white font-mono focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">Participación Comercializador</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={participacionComercializador}
                  onChange={(e) => setParticipacionComercializador(e.target.value)}
                  className="w-full bg-[#071217] border border-slate-700 rounded-xl px-4 py-2.5 text-xs text-white font-mono focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            {/* Big Net Result Badge */}
            <div
              className={`p-6 rounded-2xl text-center border transition-all ${
                financialData.utilidadFinal >= 0
                  ? 'bg-emerald-500/10 border-emerald-500/30'
                  : 'bg-rose-500/10 border-rose-500/30'
              }`}
            >
              <span
                className={`text-[11px] font-bold uppercase tracking-wider block ${
                  financialData.utilidadFinal >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {financialData.utilidadFinal >= 0 ? 'UTILIDAD NETA OPERADORA' : 'PÉRDIDA NETA OPERADORA'}
              </span>
              <div
                className={`text-3xl sm:text-4xl font-black font-mono mt-1 ${
                  financialData.utilidadFinal >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {formatCurrency(financialData.utilidadFinal, selectedMoneda as any)}
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={isProcessing}
                className="px-6 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20 flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {isProcessing ? 'Guardando...' : 'Guardar Cierre con Comercializador'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* History of Operator Settlements */}
      <div className="bg-[#0D1B22] border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
          <History className="w-4 h-4 text-amber-400" />
          Historial de Liquidaciones Guardadas ({history.length})
        </h4>

        {history.length === 0 ? (
          <p className="text-xs text-slate-500 italic py-4 text-center">
            No se han guardado cierres con comercializadores aún.
          </p>
        ) : (
          <div className="space-y-2">
            {history.map((h) => (
              <div
                key={h.id}
                className="bg-[#071217] border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-mono"
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2 font-sans">
                    <span className="font-bold text-white">{h.sistema}</span>
                    <span className="text-slate-500">• 📅 {formatDate(h.fecha)}</span>
                  </div>
                  <div className="text-slate-400 text-[11px]">
                    Venta: {formatCurrency(h.venta_bruta, h.moneda as any)} | Premios: {formatCurrency(h.premios, h.moneda as any)}
                  </div>
                </div>

                <div className="text-right">
                  <div
                    className={`text-sm font-black ${
                      h.utilidad_final_casa >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {formatCurrency(h.utilidad_final_casa, h.moneda as any)}
                  </div>
                  <span className="text-[10px] text-slate-500 font-sans">Utilidad Casa</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
