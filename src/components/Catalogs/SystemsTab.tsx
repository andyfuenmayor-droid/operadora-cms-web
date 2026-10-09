import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import type { BetSystem } from '../../types';
import { formatCurrency } from '../../utils/formatters';
import {
  Layers,
  Plus,
  Trash2,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Edit2,
  Tag,
  FileSpreadsheet,
  Percent,
  TrendingUp,
  Wallet
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
        },
      };

      if (effectiveUserId) {
        await saveSystemKeywords(effectiveUserId, updatedKeywords);
      }
      setSystemKeywords(updatedKeywords);

      setSuccessMsg(`✅ Proveedor '${cleanNombre}' guardado exitosamente con sus comisiones, participaciones y saldos iniciales.`);
      setNombre('');
      setColVenta('');
      setColPremio('');
      setColAgencia('');
      setComisionComercializador('0');
      setParticipacionComercializador('0');
      setSaldoInicialBs('0');
      setSaldoInicialUsd('0');
      setSaldoInicialCop('0');
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

  const handleDeleteSystem = async (id: number, sysName: string) => {
    if (!window.confirm(`¿Está seguro de eliminar el proveedor / sistema '${sysName}'?`)) return;

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
            Configuración de proveedores de apuestas: Comisión Comercializador, Participación Comercializador, Saldos Iniciales y mapeo de columnas para importación.
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

      {/* Form: Add System with Complete Operator/Commercializer Config */}
      <div className="bg-[#0D1B22] border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
        <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-300 flex items-center gap-2">
          <Plus className="w-4 h-4 text-emerald-400" />
          <span>Añadir Nuevo Sistema / Proveedor</span>
        </h3>

        <form onSubmit={handleAddSystem} className="space-y-4">
          {/* Row 1: Identificación y Columnas de Archivo */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-bold text-white flex items-center gap-1">
                <span>Nombre del Sistema *</span>
              </label>
              <input
                type="text"
                value={nombre}
                onChange={(e) => handleNombreChange(e.target.value)}
                placeholder="EJ: KENO, BETM3, HIPISMO"
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

          {/* Row 2: Comisión y Participación Comercializador + Saldos Iniciales de Arrastre */}
          <div className="p-3.5 rounded-xl bg-[#071217]/80 border border-slate-800/80 space-y-3">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <TrendingUp className="w-3.5 h-3.5 text-amber-400" />
              <span>Condiciones del Comercializador y Saldos Iniciales con el Proveedor</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-amber-300 flex items-center gap-1">
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
                  className="w-full bg-[#0D1B22] border border-amber-500/30 rounded-xl px-3 py-2 text-xs text-amber-200 font-mono font-bold focus:outline-none focus:border-amber-400"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-indigo-300 flex items-center gap-1">
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
                  className="w-full bg-[#0D1B22] border border-indigo-500/30 rounded-xl px-3 py-2 text-xs text-indigo-200 font-mono font-bold focus:outline-none focus:border-indigo-400"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-300 flex items-center gap-1">
                  <Wallet className="w-3 h-3 text-amber-400" />
                  <span>Saldo Inicial (BS)</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={saldoInicialBs}
                  onChange={(e) => setSaldoInicialBs(e.target.value)}
                  placeholder="0.00 Bs."
                  className="w-full bg-[#0D1B22] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-300 flex items-center gap-1">
                  <Wallet className="w-3 h-3 text-emerald-400" />
                  <span>Saldo Inicial (USD)</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={saldoInicialUsd}
                  onChange={(e) => setSaldoInicialUsd(e.target.value)}
                  placeholder="0.00 $"
                  className="w-full bg-[#0D1B22] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-300 flex items-center gap-1">
                  <Wallet className="w-3 h-3 text-cyan-400" />
                  <span>Saldo Inicial (COP)</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={saldoInicialCop}
                  onChange={(e) => setSaldoInicialCop(e.target.value)}
                  placeholder="0.00 COP"
                  className="w-full bg-[#0D1B22] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-1">
            <p className="text-[11px] text-slate-400">
              💡 La comisión y participación se aplicarán automáticamente en los módulos de <strong className="text-slate-200">Venta Operadora</strong> y <strong className="text-slate-200">Reporte Operadora</strong>.
            </p>
            <button
              type="submit"
              disabled={saving}
              className="w-full sm:w-auto py-2.5 px-6 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold text-xs tracking-wide transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 shrink-0"
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
            Sistemas Registrados y Proveedores ({systems.length})
          </h4>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-[#071217] text-slate-400 font-bold uppercase text-[11px]">
                <th className="py-3 px-3.5 w-14">ID</th>
                <th className="py-3 px-3.5 min-w-[130px]">Sistema / Proveedor</th>
                <th className="py-3 px-3.5 min-w-[160px]">Comisión Comercializador</th>
                <th className="py-3 px-3.5 min-w-[170px]">Participación Comercializador</th>
                <th className="py-3 px-3.5 min-w-[190px]">Saldos Iniciales (Arrastre)</th>
                <th className="py-3 px-3.5 min-w-[190px]">Palabras Clave Archivos</th>
                <th className="py-3 px-3.5 text-right w-24">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {systems.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500 font-sans">
                    No hay sistemas registrados aún.
                  </td>
                </tr>
              ) : (
                systems.map((s) => {
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

                  return (
                    <tr key={s.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="py-3 px-3.5 font-mono font-bold text-slate-400">#{s.id}</td>
                      <td className="py-3 px-3.5 font-sans font-black text-white text-sm tracking-wide">
                        🎰 {s.nombre_sistema}
                      </td>

                      {/* Comisión Comercializador */}
                      <td className="py-3 px-3.5 font-sans">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 font-bold text-xs">
                          <Percent className="w-3 h-3 text-amber-400" />
                          <span>{comPct.toFixed(2)}%</span>
                        </span>
                      </td>

                      {/* Participación Comercializador */}
                      <td className="py-3 px-3.5 font-sans">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 font-bold text-xs">
                          <Percent className="w-3 h-3 text-indigo-400" />
                          <span>{partPct.toFixed(2)}%</span>
                        </span>
                      </td>

                      {/* Saldos Iniciales Arrastre */}
                      <td className="py-3 px-3.5 font-mono">
                        <div className="flex flex-col gap-1 text-[11px]">
                          <span className="text-slate-300">
                            🇻🇪 <span className="text-slate-400">BS:</span> {formatCurrency(bsInit, 'BS')}
                          </span>
                          <span className="text-slate-300">
                            💵 <span className="text-slate-400">USD:</span> {formatCurrency(usdInit, 'USD')}
                          </span>
                          <span className="text-slate-300">
                            🇨🇴 <span className="text-slate-400">COP:</span> {formatCurrency(copInit, 'COP')}
                          </span>
                        </div>
                      </td>

                      {/* Palabras clave de mapeo */}
                      <td className="py-3 px-3.5 text-[11px]">
                        <div className="flex flex-col gap-1">
                          <span className="text-amber-300/90 font-mono">
                            ID: <span className="font-semibold text-slate-300">{conf.agencia || 'Agent / Nombre'}</span>
                          </span>
                          <span className="text-cyan-300/90 font-mono">
                            Venta: <span className="font-semibold text-slate-300">{conf.venta || 'Venta'}</span>
                          </span>
                          <span className="text-rose-300/90 font-mono">
                            Premio: <span className="font-semibold text-slate-300">{conf.premio || 'Premio'}</span>
                          </span>
                        </div>
                      </td>

                      {/* Acciones */}
                      <td className="py-3 px-3.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleOpenEdit(s)}
                            className="p-1.5 rounded-lg hover:bg-cyan-500/20 text-slate-400 hover:text-cyan-400 transition-colors cursor-pointer"
                            title="Editar configuración y palabras clave"
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

      {/* Edit System Modal */}
      {editingSystem && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0D1B22] border border-cyan-500/30 rounded-3xl p-6 max-w-lg w-full space-y-4 shadow-2xl animate-fade-in max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-cyan-400" />
                <span>Configurar Proveedor: <span className="text-emerald-400">{editingSystem.nombre_sistema}</span></span>
              </h3>
              <button
                onClick={() => setEditingSystem(null)}
                className="text-slate-400 hover:text-white text-xs font-bold"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-300">
              Ajusta las condiciones de liquidación con el comercializador, saldos iniciales y los nombres de columnas de importación para este sistema.
            </p>

            <form onSubmit={handleSaveEditKeywords} className="space-y-4">
              {/* Condiciones Comercializador */}
              <div className="p-3.5 rounded-2xl bg-[#071217] border border-slate-800 space-y-3">
                <div className="text-[11px] font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5" />
                  <span>Condiciones de Liquidación</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-amber-300 flex items-center gap-1">
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
                      className="w-full bg-[#0D1B22] border border-amber-500/40 rounded-xl px-3 py-2 text-xs text-amber-200 font-mono font-bold focus:outline-none focus:border-amber-400"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-indigo-300 flex items-center gap-1">
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
                      className="w-full bg-[#0D1B22] border border-indigo-500/40 rounded-xl px-3 py-2 text-xs text-indigo-200 font-mono font-bold focus:outline-none focus:border-indigo-400"
                    />
                  </div>
                </div>
              </div>

              {/* Saldos Iniciales por Moneda */}
              <div className="p-3.5 rounded-2xl bg-[#071217] border border-slate-800 space-y-3">
                <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                  <Wallet className="w-3.5 h-3.5" />
                  <span>Saldos Iniciales de Arrastre con el Proveedor</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-300">🇻🇪 Saldo BS</label>
                    <input
                      type="number"
                      step="0.01"
                      value={editSaldoInicialBs}
                      onChange={(e) => setEditSaldoInicialBs(e.target.value)}
                      className="w-full bg-[#0D1B22] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-300">💵 Saldo USD</label>
                    <input
                      type="number"
                      step="0.01"
                      value={editSaldoInicialUsd}
                      onChange={(e) => setEditSaldoInicialUsd(e.target.value)}
                      className="w-full bg-[#0D1B22] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-300">🇨🇴 Saldo COP</label>
                    <input
                      type="number"
                      step="0.01"
                      value={editSaldoInicialCop}
                      onChange={(e) => setEditSaldoInicialCop(e.target.value)}
                      className="w-full bg-[#0D1B22] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>
              </div>

              {/* Palabras clave de Importación */}
              <div className="p-3.5 rounded-2xl bg-[#071217] border border-slate-800 space-y-3">
                <div className="text-[11px] font-bold uppercase tracking-wider text-cyan-400 flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5" />
                  <span>Columnas de Archivos (Excel / CSV / PDF)</span>
                </div>

                <div className="space-y-2">
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
                      className="w-full bg-[#0D1B22] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-cyan-500"
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
                      className="w-full bg-[#0D1B22] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-cyan-500"
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
                      className="w-full bg-[#0D1B22] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                </div>
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
                  className="px-5 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs shadow-md transition-all cursor-pointer disabled:opacity-50"
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
