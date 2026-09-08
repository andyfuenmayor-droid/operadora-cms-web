import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { formatCurrency, formatDate, cleanAgencyName } from '../../utils/formatters';
import type { DailySaleItem, Agency, BetSystem, Currency } from '../../types';
import {
  TrendingUp,
  FileSpreadsheet,
  Plus,
  Trash2,
  RefreshCw,
  Calendar,
  Building2,
  DollarSign,
  CheckCircle2,
  AlertTriangle,
  Upload,
  Layers,
  ChevronDown
} from 'lucide-react';
import confetti from 'canvas-confetti';

export const SalesEntryTab: React.FC = () => {
  const { effectiveUserId, systemCycle } = useAuth();

  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [sales, setSales] = useState<DailySaleItem[]>([]);
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [systems, setSystems] = useState<BetSystem[]>([]);
  const [currencies, setCurrencies] = useState<Currency[]>([]);

  // Filters
  const [filterAgency, setFilterAgency] = useState('Todas');
  const [filterSystem, setFilterSystem] = useState('Todos');
  const [filterCurrency, setFilterCurrency] = useState('Todas');
  const [filterDate, setFilterDate] = useState(systemCycle.hasta);

  // Manual Form
  const [formAgencia, setFormAgencia] = useState('');
  const [formSistema, setFormSistema] = useState('');
  const [formMoneda, setFormMoneda] = useState('USD');
  const [formFecha, setFormFecha] = useState(systemCycle.hasta);
  const [formVenta, setFormVenta] = useState('');
  const [formPremios, setFormPremios] = useState('');
  const [formComisionPct, setFormComisionPct] = useState('10');
  const [formPartPct, setFormPartPct] = useState('50');

  // Bulk Import
  const [isBulkOpen, setIsBulkOpen] = useState(false);
  const [bulkFileDate, setBulkFileDate] = useState(systemCycle.hasta);
  const [bulkRows, setBulkRows] = useState<any[]>([]);
  const [bulkError, setBulkError] = useState<string | null>(null);

  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadData = async () => {
    if (!effectiveUserId) return;
    setIsLoading(true);
    setMessage(null);

    try {
      const [salesRes, agRes, sisRes, monRes] = await Promise.all([
        supabase.from('carga_actual').select('*').eq('user_id', effectiveUserId).order('id', { ascending: false }),
        supabase.from('agencias').select('*').eq('user_id', effectiveUserId).order('nombre_agencia', { ascending: true }),
        supabase.from('sistemas').select('*').eq('user_id', effectiveUserId).order('nombre_sistema', { ascending: true }),
        supabase.from('monedas').select('*').eq('user_id', effectiveUserId).order('id', { ascending: true }),
      ]);

      setSales(salesRes.data || []);
      setAgencies(agRes.data || []);
      setSystems(sisRes.data || []);
      setCurrencies(monRes.data || []);

      if (agRes.data && agRes.data.length > 0 && !formAgencia) {
        setFormAgencia(agRes.data[0].nombre_agencia);
      }
      if (sisRes.data && sisRes.data.length > 0 && !formSistema) {
        setFormSistema(sisRes.data[0].nombre_sistema);
      }
    } catch (err: any) {
      console.error('Error loading sales data:', err);
      setMessage({ type: 'error', text: err?.message || 'Error al cargar ventas.' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [effectiveUserId]);

  // When selected agency changes in manual form, auto-fill commission & participation
  useEffect(() => {
    const ag = agencies.find((a) => a.nombre_agencia === formAgencia);
    if (ag) {
      setFormComisionPct(String(ag.comision || 10));
      setFormPartPct(String(ag.participacion_ag || 50));
    }
  }, [formAgencia, agencies]);

  // Calculations for manual entry
  const calculatedManual = useMemo(() => {
    const v = Number(formVenta) || 0;
    const p = Number(formPremios) || 0;
    const cPct = Number(formComisionPct) || 0;
    const partPct = Number(formPartPct) || 0;

    const comision = Math.round((v * (cPct / 100)) * 100) / 100;
    const neto = Math.round((v - comision - p) * 100) / 100;
    const utilAg = Math.round((neto * (partPct / 100)) * 100) / 100;
    const utilOp = Math.round((neto - utilAg) * 100) / 100;

    return { comision, neto, utilAg, utilOp };
  }, [formVenta, formPremios, formComisionPct, formPartPct]);

  // Filtered sales
  const filteredSales = useMemo(() => {
    return sales.filter((s) => {
      if (filterAgency !== 'Todas' && s.agencia !== filterAgency) return false;
      if (filterSystem !== 'Todos' && s.sistema !== filterSystem) return false;
      if (filterCurrency !== 'Todas' && s.moneda !== filterCurrency) return false;
      return true;
    });
  }, [sales, filterAgency, filterSystem, filterCurrency]);

  // Grouped executive metrics
  const groupedMetrics = useMemo(() => {
    const map: Record<string, { venta: number; comision: number; premios: number; neto: number; util_op: number; util_ag: number }> = {};

    filteredSales.forEach((s) => {
      const key = `${s.sistema || 'Global'} - ${s.moneda || 'USD'}`;
      if (!map[key]) {
        map[key] = { venta: 0, comision: 0, premios: 0, neto: 0, util_op: 0, util_ag: 0 };
      }
      map[key].venta += Number(s.venta || 0);
      map[key].comision += Number(s.comision || 0);
      map[key].premios += Number(s.premios || 0);
      map[key].neto += Number(s.neto || 0);
      map[key].util_op += Number(s.util_op || 0);
      map[key].util_ag += Number(s.util_ag || 0);
    });

    return Object.entries(map).map(([key, vals]) => ({
      key,
      ...vals,
    }));
  }, [filteredSales]);

  // Submit Single Manual Sale
  const handleSaveManualSale = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!effectiveUserId) return;

    if (!formAgencia || !formSistema || !formMoneda) {
      setMessage({ type: 'error', text: 'Seleccione agencia, sistema y moneda.' });
      return;
    }

    setIsProcessing(true);

    try {
      const payload = {
        user_id: effectiveUserId,
        agencia: formAgencia,
        sistema: formSistema,
        moneda: formMoneda,
        venta: Number(formVenta) || 0,
        premios: Number(formPremios) || 0,
        comision: calculatedManual.comision,
        neto: calculatedManual.neto,
        util_op: calculatedManual.utilOp,
        util_ag: calculatedManual.utilAg,
        fecha: formFecha,
      };

      const { error } = await supabase.from('carga_actual').insert(payload);
      if (error) throw error;

      confetti({ particleCount: 40, spread: 60 });
      setMessage({ type: 'success', text: `¡Movimiento de venta de ${formAgencia} guardado exitosamente!` });

      setFormVenta('');
      setFormPremios('');
      await loadData();
    } catch (err: any) {
      console.error('Error inserting sale:', err);
      setMessage({ type: 'error', text: err?.message || 'Error al guardar la venta.' });
    } finally {
      setIsProcessing(false);
    }
  };

  // Delete single sale record
  const handleDeleteSale = async (id: number) => {
    if (!window.confirm('¿Eliminar este registro de venta?')) return;
    setIsProcessing(true);

    try {
      const { error } = await supabase.from('carga_actual').delete().eq('id', id).eq('user_id', effectiveUserId);
      if (error) throw error;

      setMessage({ type: 'success', text: 'Registro de venta eliminado.' });
      await loadData();
    } catch (err: any) {
      console.error('Error deleting sale:', err);
      setMessage({ type: 'error', text: err?.message || 'Error al eliminar.' });
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle CSV/Text bulk paste or file parsing
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setBulkError(null);
    const reader = new FileReader();

    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
        if (lines.length < 2) {
          setBulkError('El archivo no contiene suficientes filas.');
          return;
        }

        const delimiter = lines[0].includes(';') ? ';' : ',';
        const headers = lines[0].split(delimiter).map((h) => h.trim().toUpperCase());

        const parsed: any[] = [];
        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(delimiter).map((c) => c.trim());
          if (cols.length < 2) continue;

          const agRaw = cleanAgencyName(cols[0]);
          if (!agRaw || agRaw === 'TOTAL') continue;

          // Match agency in system
          const matchedAg = agencies.find((a) => cleanAgencyName(a.nombre_agencia) === agRaw);
          if (!matchedAg) continue;

          const venta = parseFloat(cols[1]?.replace(',', '.') || '0') || 0;
          const premios = parseFloat(cols[2]?.replace(',', '.') || '0') || 0;
          const comPct = matchedAg.comision || 10;
          const partPct = matchedAg.participacion_ag || 50;

          const com = Math.round((venta * (comPct / 100)) * 100) / 100;
          const neto = Math.round((venta - com - premios) * 100) / 100;
          const uAg = Math.round((neto * (partPct / 100)) * 100) / 100;
          const uOp = Math.round((neto - uAg) * 100) / 100;

          parsed.push({
            user_id: effectiveUserId,
            agencia: matchedAg.nombre_agencia,
            sistema: systems[0]?.nombre_sistema || 'BETM3',
            moneda: 'BS',
            venta,
            premios,
            comision: com,
            neto,
            util_op: uOp,
            util_ag: uAg,
            fecha: bulkFileDate,
          });
        }

        if (parsed.length === 0) {
          setBulkError('No se encontraron agencias coincidentes en el archivo.');
        } else {
          setBulkRows(parsed);
        }
      } catch (err: any) {
        setBulkError('Error al interpretar el archivo: ' + err.message);
      }
    };

    reader.readAsText(file);
  };

  // Save Bulk Import Rows
  const handleSaveBulk = async () => {
    if (bulkRows.length === 0 || !effectiveUserId) return;
    setIsProcessing(true);

    try {
      const { error } = await supabase.from('carga_actual').insert(bulkRows);
      if (error) throw error;

      confetti({ particleCount: 60, spread: 70 });
      setMessage({ type: 'success', text: `¡Se cargaron ${bulkRows.length} movimientos de agencias con éxito!` });

      setBulkRows([]);
      setIsBulkOpen(false);
      await loadData();
    } catch (err: any) {
      console.error('Error inserting bulk rows:', err);
      setMessage({ type: 'error', text: err?.message || 'Error al guardar carga masiva.' });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2">
            <span className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <TrendingUp className="w-5 h-5" />
            </span>
            Gestión de Ventas y Movimientos
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Registro diario de venta bruta, comisiones, premios y utilidades por sistema y moneda en el ciclo activo.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => loadData()}
            disabled={isLoading}
            className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex items-center gap-1.5 transition-all border border-slate-700 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            Actualizar
          </button>

          <button
            onClick={() => setIsBulkOpen(!isBulkOpen)}
            className="px-4 py-2.5 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 font-bold text-xs flex items-center gap-2 transition-all cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Carga Masiva (Excel/CSV)
          </button>
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
            <AlertTriangle className="w-5 h-5 shrink-0" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      {/* Bulk Upload Expander */}
      {isBulkOpen && (
        <div className="bg-[#0D1B22] border border-cyan-500/30 rounded-3xl p-6 shadow-xl space-y-4 animate-fade-in">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Upload className="w-4 h-4 text-cyan-400" />
              Importar Reporte de Sistema (CSV)
            </h3>
            <button
              onClick={() => setIsBulkOpen(false)}
              className="text-slate-400 hover:text-white text-xs font-bold"
            >
              ✕
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">Asignar este archivo a la fecha:</label>
              <input
                type="date"
                value={bulkFileDate}
                onChange={(e) => setBulkFileDate(e.target.value)}
                className="w-full bg-[#071217] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">Seleccionar archivo CSV:</label>
              <input
                type="file"
                accept=".csv,.txt"
                onChange={handleFileUpload}
                className="w-full text-xs text-slate-400 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-cyan-500/20 file:text-cyan-300 hover:file:bg-cyan-500/30 cursor-pointer"
              />
            </div>
          </div>

          {bulkError && <p className="text-xs text-rose-400 font-semibold">{bulkError}</p>}

          {bulkRows.length > 0 && (
            <div className="space-y-3 pt-2">
              <div className="text-xs text-emerald-400 font-bold">
                ✓ Se reconocieron {bulkRows.length} agencias para importar:
              </div>

              <div className="max-h-48 overflow-y-auto border border-slate-800 rounded-xl bg-[#071217]">
                <table className="w-full text-left text-[11px]">
                  <thead className="text-slate-400 border-b border-slate-800 uppercase font-mono">
                    <tr>
                      <th className="p-2">Agencia</th>
                      <th className="p-2">Venta</th>
                      <th className="p-2">Comisión</th>
                      <th className="p-2">Premios</th>
                      <th className="p-2">Neto</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80 font-mono">
                    {bulkRows.map((r, i) => (
                      <tr key={i}>
                        <td className="p-2 font-sans font-semibold text-white">{r.agencia}</td>
                        <td className="p-2">{formatCurrency(r.venta, r.moneda)}</td>
                        <td className="p-2 text-emerald-400">{formatCurrency(r.comision, r.moneda)}</td>
                        <td className="p-2 text-rose-400">{formatCurrency(r.premios, r.moneda)}</td>
                        <td className="p-2 font-bold text-white">{formatCurrency(r.neto, r.moneda)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end">
                <button
                  onClick={handleSaveBulk}
                  disabled={isProcessing}
                  className="px-5 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs shadow-lg shadow-cyan-600/20 flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                >
                  <Upload className="w-3.5 h-3.5" />
                  {isProcessing ? 'Guardando...' : `Guardar ${bulkRows.length} Registros`}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Consolidated Financial Cards by System & Currency */}
      <div className="space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
          Consolidado General de Cargas (Ciclo Activo)
        </h3>

        {groupedMetrics.length === 0 ? (
          <div className="bg-[#0D1B22] border border-slate-800 rounded-2xl p-6 text-center text-xs text-slate-400">
            No hay movimientos de venta registrados para este ciclo.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {groupedMetrics.map((gm) => (
              <div
                key={gm.key}
                className="bg-[#0D1B22] border border-slate-800 rounded-3xl p-5 shadow-lg space-y-4"
              >
                <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                  <span className="text-xs font-black text-emerald-400">📍 {gm.key}</span>
                  <span className="text-[10px] text-slate-400 uppercase font-mono font-bold">Resumen</span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center text-xs font-mono">
                  <div className="bg-[#071217] p-2 rounded-xl border border-slate-800/80">
                    <span className="text-[9px] text-slate-500 uppercase block font-sans">Venta</span>
                    <strong className="text-white text-xs">{gm.venta.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</strong>
                  </div>

                  <div className="bg-[#071217] p-2 rounded-xl border border-slate-800/80">
                    <span className="text-[9px] text-slate-500 uppercase block font-sans">Comisión</span>
                    <strong className="text-emerald-400 text-xs">{gm.comision.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</strong>
                  </div>

                  <div className="bg-[#071217] p-2 rounded-xl border border-slate-800/80">
                    <span className="text-[9px] text-slate-500 uppercase block font-sans">Premios</span>
                    <strong className="text-rose-400 text-xs">{gm.premios.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</strong>
                  </div>

                  <div className="bg-[#071217] p-2 rounded-xl border border-slate-800/80">
                    <span className="text-[9px] text-slate-500 uppercase block font-sans">Neto</span>
                    <strong className="text-white text-xs">{gm.neto.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</strong>
                  </div>

                  <div className="bg-[#071217] p-2 rounded-xl border border-slate-800/80">
                    <span className="text-[9px] text-slate-500 uppercase block font-sans">Util. Op</span>
                    <strong className="text-cyan-400 text-xs">{gm.util_op.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</strong>
                  </div>

                  <div className="bg-[#071217] p-2 rounded-xl border border-slate-800/80">
                    <span className="text-[9px] text-slate-500 uppercase block font-sans">Util. Ag</span>
                    <strong className="text-amber-400 text-xs">{gm.util_ag.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</strong>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Manual Sale Entry Form */}
      <div className="bg-[#0D1B22] border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <Plus className="w-4 h-4 text-emerald-400" />
          Registro Manual Individual de Movimiento
        </h3>

        <form onSubmit={handleSaveManualSale} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300">Agencia *</label>
              <select
                value={formAgencia}
                onChange={(e) => setFormAgencia(e.target.value)}
                required
                className="w-full bg-[#071217] border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-emerald-500"
              >
                {agencies.map((a) => (
                  <option key={a.id} value={a.nombre_agencia}>
                    {a.nombre_agencia}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300">Sistema *</label>
              <select
                value={formSistema}
                onChange={(e) => setFormSistema(e.target.value)}
                required
                className="w-full bg-[#071217] border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-emerald-500"
              >
                {systems.map((s) => (
                  <option key={s.id} value={s.nombre_sistema}>
                    {s.nombre_sistema}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300">Moneda *</label>
              <select
                value={formMoneda}
                onChange={(e) => setFormMoneda(e.target.value)}
                required
                className="w-full bg-[#071217] border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-emerald-500"
              >
                {currencies.map((m) => (
                  <option key={m.id} value={m.nombre_moneda}>
                    {m.nombre_moneda} ({m.simbolo})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300">Fecha del Movimiento *</label>
              <input
                type="date"
                required
                value={formFecha}
                onChange={(e) => setFormFecha(e.target.value)}
                className="w-full bg-[#071217] border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300">Venta Bruta *</label>
              <input
                type="number"
                step="0.01"
                min="0"
                required
                placeholder="0.00"
                value={formVenta}
                onChange={(e) => setFormVenta(e.target.value)}
                className="w-full bg-[#071217] border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300">Premios Pagados</label>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={formPremios}
                onChange={(e) => setFormPremios(e.target.value)}
                className="w-full bg-[#071217] border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300">Comisión Agencia %</label>
              <input
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={formComisionPct}
                onChange={(e) => setFormComisionPct(e.target.value)}
                className="w-full bg-[#071217] border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300">Participación Agencia %</label>
              <input
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={formPartPct}
                onChange={(e) => setFormPartPct(e.target.value)}
                className="w-full bg-[#071217] border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          {/* Auto-calculated preview banner */}
          <div className="grid grid-cols-4 gap-2 bg-[#071217] p-3 rounded-2xl border border-slate-800 text-center text-xs font-mono">
            <div>
              <span className="text-[10px] text-slate-500 uppercase block font-sans">Comisión</span>
              <strong className="text-emerald-400">{formatCurrency(calculatedManual.comision, formMoneda)}</strong>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 uppercase block font-sans">Neto</span>
              <strong className="text-white">{formatCurrency(calculatedManual.neto, formMoneda)}</strong>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 uppercase block font-sans">Utilidad Op</span>
              <strong className="text-cyan-400">{formatCurrency(calculatedManual.utilOp, formMoneda)}</strong>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 uppercase block font-sans">Utilidad Ag</span>
              <strong className="text-amber-400">{formatCurrency(calculatedManual.utilAg, formMoneda)}</strong>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isProcessing}
              className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-bold text-xs shadow-lg shadow-emerald-500/20 flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
              {isProcessing ? 'Guardando...' : 'Registrar Venta'}
            </button>
          </div>
        </form>
      </div>

      {/* Detailed Sales Records Table */}
      <div className="bg-[#0D1B22] border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
        <div className="p-4 sm:p-6 border-b border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
          <h4 className="text-sm font-bold text-white uppercase tracking-wider">
            Movimientos Registrados ({filteredSales.length})
          </h4>

          {/* Table Filters */}
          <div className="flex items-center gap-2">
            <select
              value={filterAgency}
              onChange={(e) => setFilterAgency(e.target.value)}
              className="bg-[#071217] border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white"
            >
              <option value="Todas">Todas las Agencias</option>
              {agencies.map((a) => (
                <option key={a.id} value={a.nombre_agencia}>
                  {a.nombre_agencia}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#071217] text-slate-400 border-b border-slate-800 font-bold uppercase tracking-wider">
              <tr>
                <th className="py-3.5 px-4">Agencia</th>
                <th className="py-3.5 px-4">Sistema</th>
                <th className="py-3.5 px-4">Fecha</th>
                <th className="py-3.5 px-4 text-right">Venta</th>
                <th className="py-3.5 px-4 text-right">Comisión</th>
                <th className="py-3.5 px-4 text-right">Premios</th>
                <th className="py-3.5 px-4 text-right">Neto</th>
                <th className="py-3.5 px-4 text-right">Util. Op</th>
                <th className="py-3.5 px-4 text-right">Util. Ag</th>
                <th className="py-3.5 px-4 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 font-mono">
              {filteredSales.map((s) => (
                <tr key={s.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="py-3.5 px-4 font-sans font-bold text-white">{s.agencia}</td>
                  <td className="py-3.5 px-4 text-slate-300">{s.sistema}</td>
                  <td className="py-3.5 px-4 text-slate-500 font-sans">{formatDate(s.fecha)}</td>
                  <td className="py-3.5 px-4 text-right text-white font-bold">{formatCurrency(s.venta || 0, s.moneda)}</td>
                  <td className="py-3.5 px-4 text-right text-emerald-400">{formatCurrency(s.comision || 0, s.moneda)}</td>
                  <td className="py-3.5 px-4 text-right text-rose-400">{formatCurrency(s.premios || 0, s.moneda)}</td>
                  <td className="py-3.5 px-4 text-right text-white font-bold">{formatCurrency(s.neto || 0, s.moneda)}</td>
                  <td className="py-3.5 px-4 text-right text-cyan-400 font-bold">{formatCurrency(s.util_op || 0, s.moneda)}</td>
                  <td className="py-3.5 px-4 text-right text-amber-400">{formatCurrency(s.util_ag || 0, s.moneda)}</td>
                  <td className="py-3.5 px-4 text-center">
                    <button
                      onClick={() => handleDeleteSale(s.id)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                      title="Eliminar movimiento"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
