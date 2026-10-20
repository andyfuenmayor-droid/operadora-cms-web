import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  fetchAuditLogs,
  type AuditLogEntry,
  logAuditEvent,
  extractAuditAmount,
  shortenAuditDescription,
  clearAuditLogsCache,
} from '../../utils/auditLogger';
import { realtimeBroadcast } from '../../utils/realtimeBroadcast';
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
  Printer,
} from 'lucide-react';

export const AuditLogTab: React.FC = () => {
  const { user, profile, effectiveUserId, systemCycle } = useAuth();
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCycle, setSelectedCycle] = useState<string>('CICLO_ACTUAL');
  const [selectedModule, setSelectedModule] = useState<string>('TODOS');
  const [selectedImpact, setSelectedImpact] = useState<string>('TODOS');
  const [selectedEntry, setSelectedEntry] = useState<AuditLogEntry | null>(null);

  const loadLogs = async (forceRefresh = false) => {
    if (!effectiveUserId) return;
    setIsLoading(true);
    try {
      const data = await fetchAuditLogs(effectiveUserId, forceRefresh);
      setLogs(data);
    } catch (e) {
      console.error('Error loading audit logs:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();

    // Re-sync whenever a payment, expense, or agency is modified anywhere in the platform
    const unsub = realtimeBroadcast.subscribe('DATA_CHANGED', () => {
      loadLogs();
    });

    return () => {
      try {
        unsub();
      } catch (_) {}
    };
  }, [effectiveUserId]);

  // Distinct weeks detected in audit logs
  const distinctWeeks = useMemo(() => {
    const s = new Set<string>();
    logs.forEach((l) => {
      if (l.semana_ciclo) s.add(String(l.semana_ciclo));
    });
    if (systemCycle?.semana) s.add(String(systemCycle.semana));
    return Array.from(s).sort((a, b) => Number(b) - Number(a));
  }, [logs, systemCycle?.semana]);

  const filteredLogs = useMemo(() => {
    return logs.filter((l) => {
      // 1. Cycle / Semana filter
      if (selectedCycle === 'CICLO_ACTUAL') {
        const activeSem = String(systemCycle?.semana || '');
        if (activeSem && l.semana_ciclo && String(l.semana_ciclo) !== activeSem) {
          return false;
        }
      } else if (selectedCycle !== 'TODOS') {
        if (String(l.semana_ciclo || '') !== selectedCycle) return false;
      }

      // 2. Module filter
      if (selectedModule !== 'TODOS' && l.modulo !== selectedModule) return false;

      // 3. Impact filter
      if (selectedImpact !== 'TODOS' && l.impacto_financiero !== selectedImpact) return false;

      // 4. Search query
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const inDesc = (l.descripcion || '').toLowerCase().includes(q);
        const inEnt = (l.entidad_afectada || '').toLowerCase().includes(q);
        const inUser = (l.usuario || '').toLowerCase().includes(q);
        const inAction = (l.tipo_accion || '').toLowerCase().includes(q);
        const inSem = (l.semana_ciclo || '').toLowerCase().includes(q);
        const inAmt = (extractAuditAmount(l)?.montoStr || '').toLowerCase().includes(q);
        return inDesc || inEnt || inUser || inAction || inSem || inAmt;
      }
      return true;
    });
  }, [logs, selectedCycle, systemCycle?.semana, selectedModule, selectedImpact, searchTerm]);

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
    const headers = ['Fecha/Hora', 'Semana Ciclo', 'Usuario', 'Modulo', 'Accion', 'Entidad Afectada', 'Monto', 'Impacto', 'Descripcion'];
    const rows = filteredLogs.map((l) => {
      const amt = extractAuditAmount(l);
      return [
        `"${new Date(l.timestamp).toLocaleString('es-VE')}"`,
        `"${l.semana_ciclo ? `Semana ${l.semana_ciclo}` : 'N/A'}"`,
        `"${l.usuario}"`,
        `"${l.modulo}"`,
        `"${l.tipo_accion}"`,
        `"${l.entidad_afectada}"`,
        `"${amt ? amt.montoStr : '-'}"`,
        `"${l.impacto_financiero}"`,
        `"${(l.descripcion || '').replace(/"/g, '""')}"`,
      ];
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Log_Auditoria_Semana_${selectedCycle}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Imprimir Acta Oficial de Auditoría en formato PDF
  const handlePrintPDF = () => {
    if (filteredLogs.length === 0) return;

    const companyName = (profile?.nombre_banca || profile?.banca || 'CORPORACION CALENDARIO, CA').toUpperCase();
    const auditorName = user?.email || 'Administración';
    const ahora = new Date().toLocaleString('es-VE', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });

    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc) {
      window.print();
      return;
    }

    const rowsHtml = filteredLogs.map((l, idx) => {
      const fecha = new Date(l.timestamp).toLocaleString('es-VE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });

      const impactColor =
        l.impacto_financiero === 'ALTO'
          ? '#e11d48'
          : l.impacto_financiero === 'MEDIO'
          ? '#d97706'
          : '#2563eb';

      const impactBg =
        l.impacto_financiero === 'ALTO'
          ? '#ffe4e6'
          : l.impacto_financiero === 'MEDIO'
          ? '#fef3c7'
          : '#dbeafe';

      const amt = extractAuditAmount(l);

      return `
        <tr style="background: ${idx % 2 === 0 ? '#ffffff' : '#f8fafc'}; border-bottom: 1px solid #e2e8f0;">
          <td style="padding: 7px 8px; font-family: monospace; font-size: 8.5pt; color: #334155; white-space: nowrap;">${fecha}</td>
          <td style="padding: 7px 8px; font-weight: bold; font-size: 8pt; color: #0284c7; text-align: center;">${l.semana_ciclo ? `Sem. ${l.semana_ciclo}` : '-'}</td>
          <td style="padding: 7px 8px; font-weight: bold; font-size: 8.5pt; color: #1e293b;">${l.modulo}</td>
          <td style="padding: 7px 8px; font-weight: 600; font-size: 8.5pt; color: #0f172a;">${l.entidad_afectada}</td>
          <td style="padding: 7px 8px; font-size: 8.5pt; color: #0f172a; line-height: 1.35;">${shortenAuditDescription(l.descripcion)}</td>
          <td style="padding: 7px 8px; font-weight: bold; font-family: monospace; font-size: 8.5pt; color: #047857; text-align: right; white-space: nowrap;">${amt ? amt.montoStr : '-'}</td>
          <td style="padding: 7px 8px; font-size: 8pt; color: #475569; font-family: monospace;">${l.usuario}</td>
          <td style="padding: 7px 8px; text-align: center;">
            <span style="display: inline-block; padding: 2px 7px; border-radius: 9999px; font-size: 7.5pt; font-weight: 800; text-transform: uppercase; color: ${impactColor}; background: ${impactBg}; border: 1px solid ${impactColor}40;">
              ${l.impacto_financiero}
            </span>
          </td>
        </tr>
      `;
    }).join('');

    doc.open();
    doc.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Acta y Registro Oficial de Auditoria - ${companyName}</title>
          <meta charset="utf-8" />
          <style>
            @page {
              size: letter landscape;
              margin: 1.2cm;
            }
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
              color: #0f172a;
              background: #fff;
              font-size: 9pt;
              line-height: 1.35;
              margin: 0;
              padding: 0;
            }
            .header {
              border-bottom: 2px solid #0f172a;
              padding-bottom: 10px;
              margin-bottom: 14px;
              display: flex;
              justify-content: space-between;
              align-items: flex-start;
            }
            .company {
              font-size: 14pt;
              font-weight: 900;
              letter-spacing: -0.02em;
              color: #0f172a;
              margin: 0 0 2px 0;
            }
            .doc-title {
              font-size: 11pt;
              font-weight: 800;
              color: #047857;
              text-transform: uppercase;
              letter-spacing: 0.04em;
              margin: 0 0 2px 0;
            }
            .doc-sub {
              font-size: 8pt;
              color: #64748b;
              margin: 0;
            }
            .kpis {
              display: grid;
              grid-template-columns: repeat(4, 1fr);
              gap: 10px;
              margin-bottom: 14px;
            }
            .kpi-box {
              background: #f8fafc;
              border: 1px solid #cbd5e1;
              border-radius: 8px;
              padding: 8px 10px;
            }
            .kpi-lbl {
              font-size: 7pt;
              font-weight: 700;
              text-transform: uppercase;
              color: #64748b;
            }
            .kpi-val {
              font-size: 11pt;
              font-weight: 900;
              color: #0f172a;
              margin-top: 1px;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-bottom: 16px;
            }
            th {
              background: #0f172a;
              color: #fff;
              font-size: 8pt;
              font-weight: 800;
              text-transform: uppercase;
              letter-spacing: 0.03em;
              padding: 7px 8px;
              text-align: left;
            }
            .signatures {
              margin-top: 35px;
              display: grid;
              grid-template-columns: 1fr 1fr 1fr;
              gap: 40px;
              page-break-inside: avoid;
            }
            .sig-line {
              border-top: 1px solid #334155;
              padding-top: 5px;
              text-align: center;
              font-size: 8pt;
            }
            .sig-title {
              font-weight: 800;
              color: #0f172a;
            }
            .sig-sub {
              color: #64748b;
              font-size: 7.5pt;
            }
            .footer {
              margin-top: 18px;
              border-top: 1px dashed #cbd5e1;
              padding-top: 8px;
              display: flex;
              justify-content: space-between;
              font-size: 7.5pt;
              color: #64748b;
              page-break-inside: avoid;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <h1 class="company">${companyName}</h1>
              <div class="doc-title">Bitácora Oficial de Seguridad Financiera y Auditoría</div>
              <p class="doc-sub">Registro inmutable de trazabilidad de cambios en condiciones, comisiones, participaciones y cierres</p>
            </div>
            <div style="text-align: right; font-size: 8pt; color: #475569;">
              <div><strong>Fecha de Emisión:</strong> ${ahora}</div>
              <div><strong>Usuario Auditor:</strong> ${auditorName}</div>
              <div><strong>Filtro Activo:</strong> Módulo: ${selectedModule} • Impacto: ${selectedImpact}</div>
            </div>
          </div>

          <div class="kpis">
            <div class="kpi-box">
              <div class="kpi-lbl">Total Registros Auditados</div>
              <div class="kpi-val">${filteredLogs.length}</div>
            </div>
            <div class="kpi-box">
              <div class="kpi-lbl">Eventos de Alto Impacto</div>
              <div class="kpi-val" style="color: #e11d48;">${filteredLogs.filter((l) => l.impacto_financiero === 'ALTO').length}</div>
            </div>
            <div class="kpi-box">
              <div class="kpi-lbl">Agencias Involucradas</div>
              <div class="kpi-val" style="color: #047857;">${new Set(filteredLogs.filter((l) => l.modulo === 'AGENCIAS').map((l) => l.entidad_afectada)).size}</div>
            </div>
            <div class="kpi-box">
              <div class="kpi-lbl">Estado de Certificación</div>
              <div class="kpi-val" style="color: #059669; font-size: 9.5pt;">AUDITADO Y SELLADO</div>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th style="width: 13%;">Fecha / Hora</th>
                <th style="width: 7%; text-align: center;">Semana</th>
                <th style="width: 8%;">Módulo</th>
                <th style="width: 13%;">Entidad Afectada</th>
                <th style="width: 28%;">Descripción de la Operación</th>
                <th style="width: 11%; text-align: right;">Monto</th>
                <th style="width: 11%;">Usuario</th>
                <th style="width: 9%; text-align: center;">Impacto</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>

          <div class="signatures">
            <div>
              <div class="sig-line">
                <div class="sig-title">Auditor Contable / Administrador</div>
                <div class="sig-sub">${auditorName}</div>
              </div>
            </div>
            <div>
              <div class="sig-line">
                <div class="sig-title">Control de Operaciones y Sistemas</div>
                <div class="sig-sub">Validación y Verificación Técnica</div>
              </div>
            </div>
            <div>
              <div class="sig-line">
                <div class="sig-title">Dirección General / Gerencia</div>
                <div class="sig-sub">${companyName}</div>
              </div>
            </div>
          </div>

          <div class="footer">
            <span>Bitácora de Auditoría Oficial • Sistema Integrado Multibanca Express CMS</span>
            <span>Documento Oficial Certificado • Trazabilidad Inmutable</span>
          </div>
        </body>
      </html>
    `);
    doc.close();

    setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      setTimeout(() => {
        if (document.body.contains(iframe)) {
          document.body.removeChild(iframe);
        }
      }, 2000);
    }, 350);
  };

  return (
    <div className="space-y-6">
      {/* 1. Header Banner */}
      <div id="tour-auditoria-header" className="bg-gradient-to-r from-[#0D1B22] via-[#0F242C] to-[#0D1B22] border border-slate-800 rounded-3xl p-6 shadow-2xl relative overflow-hidden">
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
              onClick={handlePrintPDF}
              disabled={filteredLogs.length === 0}
              className="px-4 py-2.5 rounded-2xl bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white font-black text-xs uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer shadow-lg shadow-sky-600/20 disabled:opacity-50"
              title="Imprimir Acta y Bitácora Oficial en PDF"
            >
              <Printer className="w-4 h-4" />
              <span>Imprimir PDF</span>
            </button>
            <button
              onClick={handleExportCSV}
              disabled={filteredLogs.length === 0}
              className="px-4 py-2.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-2 transition-all cursor-pointer shadow-lg shadow-emerald-500/20 disabled:opacity-50"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Exportar CSV</span>
            </button>
            <button
              onClick={() => loadLogs(true)}
              disabled={isLoading}
              className="p-2.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all border border-slate-700 cursor-pointer"
              title="Actualizar y Sincronizar (Limpiar Caché)"
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

      {/* 2. Cycle / Period Filter Selector */}
      <div className="bg-[#0D1B22] border border-slate-800 rounded-3xl p-4 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-bold text-slate-400 flex items-center gap-1 mr-1">
            <Calendar className="w-4 h-4 text-emerald-400" />
            <span>Ciclo Auditado:</span>
          </span>

          <button
            onClick={() => setSelectedCycle('CICLO_ACTUAL')}
            className={`px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              selectedCycle === 'CICLO_ACTUAL'
                ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                : 'bg-[#071217] text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <span>🎯</span>
            <span>Ciclo Actual (Semana {systemCycle?.semana})</span>
          </button>

          <button
            onClick={() => setSelectedCycle('TODOS')}
            className={`px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              selectedCycle === 'TODOS'
                ? 'bg-sky-500 text-slate-950 shadow-md shadow-sky-500/20'
                : 'bg-[#071217] text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <span>📜</span>
            <span>Histórico Completo ({logs.length})</span>
          </button>

          {distinctWeeks
            .filter((w) => w !== String(systemCycle?.semana))
            .map((w) => (
              <button
                key={w}
                onClick={() => setSelectedCycle(w)}
                className={`px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer ${
                  selectedCycle === w
                    ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                    : 'bg-[#071217] text-slate-400 hover:text-white border border-slate-800'
                }`}
              >
                Semana {w}
              </button>
            ))}
        </div>

        <div className="text-xs text-slate-400 font-mono">
          Eventos en vista: <strong className="text-emerald-400">{filteredLogs.length}</strong>
        </div>
      </div>

      {/* 3. Search & Module Filter Bar */}
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

      {/* 4. Table of Events */}
      <div id="tour-auditoria-table" className="bg-[#0D1B22] border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
        {filteredLogs.length === 0 ? (
          <div className="py-12 text-center text-slate-400 text-xs">
            {isLoading
              ? 'Cargando eventos de auditoría...'
              : 'No se encontraron registros de auditoría para este ciclo o filtros aplicados.'}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-800/80 bg-[#071217]">
            <table className="w-full min-w-[760px] text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-[11px] uppercase tracking-wider text-slate-400 bg-slate-900/60">
                  <th className="py-3 px-3.5 font-bold">Fecha / Hora</th>
                  <th className="py-3 px-3 font-bold text-center">Semana</th>
                  <th className="py-3 px-3 font-bold">Módulo</th>
                  <th className="py-3 px-3 font-bold">Entidad Afectada</th>
                  <th className="py-3 px-3 font-bold">Descripción</th>
                  <th className="py-3 px-3 font-bold text-right text-emerald-400">Monto</th>
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
                    <td className="py-2.5 px-3 text-center">
                      <span className="text-[10px] font-black px-2 py-0.5 rounded bg-slate-800/90 text-sky-400 border border-slate-700 font-mono">
                        {l.semana_ciclo ? `Sem. ${l.semana_ciclo}` : '-'}
                      </span>
                    </td>
                    <td className="py-2.5 px-3">
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded font-sans ${
                        l.modulo === 'AGENCIAS'
                          ? 'bg-purple-500/10 text-purple-300 border border-purple-500/20'
                          : l.modulo === 'VENTAS'
                          ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'
                          : l.modulo === 'PAGOS'
                          ? 'bg-sky-500/10 text-sky-300 border border-sky-500/20'
                          : l.modulo === 'GASTOS'
                          ? 'bg-rose-500/10 text-rose-300 border border-rose-500/20'
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
                    <td className="py-2.5 px-3 text-slate-300 font-sans text-xs max-w-[260px] truncate" title={l.descripcion}>
                      {shortenAuditDescription(l.descripcion)}
                    </td>
                    <td className="py-2.5 px-3 font-mono font-bold text-right text-emerald-400 whitespace-nowrap">
                      {extractAuditAmount(l)?.montoStr || <span className="text-slate-600 font-sans font-normal">-</span>}
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
