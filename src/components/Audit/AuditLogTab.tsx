import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  fetchAuditLogs,
  type AuditLogEntry,
  logAuditEvent,
} from '../../utils/auditLogger';
import {
  ShieldCheck,
  Search,
  Filter,
  RefreshCw,
  Download,
  AlertTriangle,
  Info,
  Calendar,
  User,
  ArrowUpDown,
  X,
  FileSpreadsheet,
  CheckCircle2,
  Clock,
} from 'lucide-react';

export const AuditLogTab: React.FC = () => {
  const { user, effectiveUserId } = useAuth();
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedModule, setSelectedModule] = useState<string>('TODOS');
  const [selectedImpact, setSelectedImpact] = useState<string>('TODOS');
  const [selectedEntry, setSelectedEntry] = useState<AuditLogEntry | null>(null);

  const loadLogs = async () => {
    if (!effectiveUserId) return;
    setIsLoading(true);
    try {
      const data = await fetchAuditLogs(effectiveUserId);
      setLogs(data);
    } catch (e) {
      console.error('Error loading audit logs:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, [effectiveUserId]);

  const filteredLogs = useMemo(() => {
    return logs.filter((l) => {
      if (selectedModule !== 'TODOS' && l.modulo !== selectedModule) return false;
      if (selectedImpact !== 'TODOS' && l.impacto_financiero !== selectedImpact) return false;

      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const inDesc = (l.descripcion || '').toLowerCase().includes(q);
        const inEnt = (l.entidad_afectada || '').toLowerCase().includes(q);
        const inUser = (l.usuario || '').toLowerCase().includes(q);
        const inAction = (l.tipo_accion || '').toLowerCase().includes(q);
        return inDesc || inEnt || inUser || inAction;
      }
      return true;
    });
  }, [logs, selectedModule, selectedImpact, searchTerm]);

  // KPIs
  const highImpactCount = useMemo(
    () => logs.filter((l) => l.impacto_financiero === 'ALTO').length,
    [logs]
  );
  const affectedAgenciesCount = useMemo(() => {
    const s = new Set(
      logs.filter((l) => l.modulo === 'AGENCIAS').map((l) => l.entidad_afectada)
    );
    return s.size;
  }, [logs]);

  const handleExportCSV = () => {
    if (filteredLogs.length === 0) return;
    const headers = ['Fecha/Hora', 'Usuario', 'Modulo', 'Accion', 'Entidad Afectada', 'Impacto', 'Descripcion'];
    const rows = filteredLogs.map((l) => [
      `"${new Date(l.timestamp).toLocaleString('es-VE')}"`,
      `"${l.usuario}"`,
      `"${l.modulo}"`,
      `"${l.tipo_accion}"`,
      `"${l.entidad_afectada}"`,
      `"${l.impacto_financiero}"`,
      `"${(l.descripcion || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Log_Auditoria_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* 1. Header Banner */}
      <div className="bg-gradient-to-r from-[#0D1B22] via-[#0F242C] to-[#0D1B22] border border-slate-800 rounded-3xl p-6 shadow-2xl relative overflow-hidden">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 relative z-10">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Bitácora Oficial de Seguridad Financiera</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2.5">
              <span>Registro de Auditoría y Cambios</span>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono font-normal">
                {logs.length} eventos registrados
              </span>
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 max-w-2xl">
              Trazabilidad inmutable de cambios en agencias, comisiones, participaciones, recálculos de ventas y movimientos que alteran balances.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={handleExportCSV}
              disabled={filteredLogs.length === 0}
              className="px-4 py-2.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-2 transition-all cursor-pointer shadow-lg shadow-emerald-500/20 disabled:opacity-50"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Exportar CSV</span>
            </button>
            <button
              onClick={loadLogs}
              disabled={isLoading}
              className="p-2.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all border border-slate-700 cursor-pointer"
              title="Actualizar registro"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-emerald-400' : ''}`} />
            </button>
          </div>
        </div>

        {/* 3 Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-5 mt-5 border-t border-slate-800/80">
          <div className="bg-[#071217]/80 border border-slate-800 p-3 rounded-2xl flex items-center gap-3">
            <div className="p-2 rounded-xl bg-slate-800 text-slate-300">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[10px] uppercase font-bold text-slate-400">Total Eventos</div>
              <div className="text-base font-black text-white font-mono">{logs.length}</div>
            </div>
          </div>
          <div className="bg-[#071217]/80 border border-slate-800 p-3 rounded-2xl flex items-center gap-3">
            <div className="p-2 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[10px] uppercase font-bold text-slate-400">Impacto Alto</div>
              <div className="text-base font-black text-rose-400 font-mono">{highImpactCount}</div>
            </div>
          </div>
          <div className="bg-[#071217]/80 border border-slate-800 p-3 rounded-2xl flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[10px] uppercase font-bold text-slate-400">Agencias Auditadas</div>
              <div className="text-base font-black text-amber-300 font-mono">{affectedAgenciesCount}</div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Filter Bar */}
      <div className="bg-[#0D1B22] border border-slate-800 rounded-3xl p-4 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar por agencia, usuario, descripción o acción..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-[#071217] border border-slate-700/80 rounded-xl text-white placeholder-slate-500 text-xs focus:outline-none focus:border-emerald-500"
          />
        </div>

        {/* Module Filters */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {['TODOS', 'AGENCIAS', 'VENTAS', 'PAGOS', 'GASTOS', 'CIERRES'].map((mod) => (
            <button
              key={mod}
              onClick={() => setSelectedModule(mod)}
              className={`px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer ${
                selectedModule === mod
                  ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                  : 'bg-slate-800/80 text-slate-400 hover:text-white'
              }`}
            >
              {mod}
            </button>
          ))}
        </div>

        {/* Impact Filter */}
        <div className="flex items-center gap-1.5">
          {['TODOS', 'ALTO', 'MEDIO', 'BAJO'].map((imp) => (
            <button
              key={imp}
              onClick={() => setSelectedImpact(imp)}
              className={`px-2.5 py-1 rounded-xl text-[11px] font-bold transition-all cursor-pointer ${
                selectedImpact === imp
                  ? 'bg-slate-200 text-slate-950 font-black'
                  : 'bg-slate-800/40 text-slate-400 hover:text-white'
              }`}
            >
              {imp}
            </button>
          ))}
        </div>
      </div>

      {/* 3. Table of Events */}
      <div className="bg-[#0D1B22] border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
        {filteredLogs.length === 0 ? (
          <div className="py-12 text-center text-slate-400 text-xs">
            {isLoading
              ? 'Cargando eventos de auditoría...'
              : 'No se encontraron registros de auditoría con los filtros aplicados.'}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-800/80 bg-[#071217]">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-[11px] uppercase tracking-wider text-slate-400 bg-slate-900/60">
                  <th className="py-3 px-3.5 font-bold">Fecha / Hora</th>
                  <th className="py-3 px-3 font-bold">Módulo</th>
                  <th className="py-3 px-3 font-bold">Entidad Afectada</th>
                  <th className="py-3 px-3 font-bold">Descripción</th>
                  <th className="py-3 px-3 font-bold">Usuario</th>
                  <th className="py-3 px-3 font-bold text-center">Impacto</th>
                  <th className="py-3 px-3 font-bold text-right">Detalle</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {filteredLogs.map((l) => (
                  <tr key={l.id || l.timestamp} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-2.5 px-3.5 text-slate-300 text-[11px] whitespace-nowrap">
                      {new Date(l.timestamp).toLocaleString('es-VE', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </td>
                    <td className="py-2.5 px-3">
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded font-sans ${
                        l.modulo === 'AGENCIAS'
                          ? 'bg-purple-500/10 text-purple-300 border border-purple-500/20'
                          : l.modulo === 'VENTAS'
                          ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'
                          : l.modulo === 'PAGOS'
                          ? 'bg-sky-500/10 text-sky-300 border border-sky-500/20'
                          : l.modulo === 'CIERRES'
                          ? 'bg-amber-500/10 text-amber-300 border border-amber-500/20'
                          : 'bg-slate-700/30 text-slate-300 border border-slate-700/50'
                      }`}>
                        {l.modulo}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-bold text-white font-sans truncate max-w-[150px]">
                      {l.entidad_afectada}
                    </td>
                    <td className="py-2.5 px-3 text-slate-300 font-sans text-xs max-w-[320px] truncate" title={l.descripcion}>
                      {l.descripcion}
                    </td>
                    <td className="py-2.5 px-3 text-slate-400 text-[11px] truncate max-w-[140px]" title={l.usuario}>
                      {l.usuario}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span className={`text-[9px] font-black px-2 py-0.5 rounded-full font-sans uppercase ${
                        l.impacto_financiero === 'ALTO'
                          ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                          : l.impacto_financiero === 'MEDIO'
                          ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                          : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      }`}>
                        {l.impacto_financiero}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      {(l.valor_anterior || l.valor_nuevo) ? (
                        <button
                          onClick={() => setSelectedEntry(l)}
                          className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[10px] font-bold text-slate-200 transition-colors cursor-pointer"
                        >
                          Ver JSON
                        </button>
                      ) : (
                        <span className="text-slate-600 text-[10px]">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* JSON Comparison Modal */}
      {selectedEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#0D1B22] border border-slate-800 rounded-3xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-extrabold text-white">Detalle de Modificación</h3>
                <p className="text-xs text-slate-400">
                  {selectedEntry.entidad_afectada} • {selectedEntry.tipo_accion}
                </p>
              </div>
              <button
                onClick={() => setSelectedEntry(null)}
                className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 text-xs">
              <div className="p-3 rounded-xl bg-[#071217] border border-slate-800 text-slate-300">
                <strong>Descripción:</strong> {selectedEntry.descripcion}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <span className="text-[11px] font-bold text-rose-400">Valor Anterior (Antes):</span>
                  <pre className="p-3 rounded-xl bg-[#071217] border border-rose-500/20 text-slate-300 font-mono text-[10px] overflow-x-auto max-h-60">
                    {JSON.stringify(selectedEntry.valor_anterior, null, 2) || 'N/A'}
                  </pre>
                </div>
                <div className="space-y-1">
                  <span className="text-[11px] font-bold text-emerald-400">Valor Nuevo (Después):</span>
                  <pre className="p-3 rounded-xl bg-[#071217] border border-emerald-500/20 text-slate-300 font-mono text-[10px] overflow-x-auto max-h-60">
                    {JSON.stringify(selectedEntry.valor_nuevo, null, 2) || 'N/A'}
                  </pre>
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-slate-800 flex justify-end bg-[#0A161C]">
              <button
                onClick={() => setSelectedEntry(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs transition-colors cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
