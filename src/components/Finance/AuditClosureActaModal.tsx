import React from 'react';
import { createPortal } from 'react-dom';
import { Printer, X, ShieldCheck, AlertTriangle, Calendar, User, FileText, CheckCircle2 } from 'lucide-react';
import type { AuditLogEntry } from '../../utils/auditLogger';

interface AuditClosureActaModalProps {
  isOpen?: boolean;
  onClose: () => void;
  systemCycle: { semana: string; desde: string; hasta: string; tipo?: string };
  userName?: string;
  companyName?: string;
  auditLogs: AuditLogEntry[];
  fechaCierre?: string;
  closureSummary?: {
    totalAgencias?: number;
    totalOperadoras?: number;
  };
}

export const AuditClosureActaModal: React.FC<AuditClosureActaModalProps> = ({
  isOpen = true,
  onClose,
  systemCycle,
  userName = 'Administración',
  companyName = 'CORPORACION CALENDARIO, CA',
  auditLogs,
  fechaCierre,
  closureSummary,
}) => {
  if (!isOpen) return null;

  const fechaImpresion = new Date().toLocaleString('es-VE', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  const highImpactCount = auditLogs.filter((l) => l.impacto_financiero === 'ALTO').length;
  const deletedPaymentsCount = auditLogs.filter((l) => l.tipo_accion === 'ELIMINAR_PAGO_AGENCIA').length;
  const deletedExpensesCount = auditLogs.filter((l) => l.tipo_accion === 'ELIMINAR_GASTO_AGENCIA' || l.tipo_accion === 'ELIMINACION_GASTO_ADMINISTRATIVO').length;
  const affectedAgenciesCount = new Set(auditLogs.filter((l) => l.modulo === 'AGENCIAS' || l.modulo === 'PAGOS' || l.modulo === 'GASTOS').map((l) => l.entidad_afectada)).size;

  const handlePrint = () => {
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

    const rowsHtml = auditLogs.map((l, idx) => {
      const fechaStr = new Date(l.timestamp).toLocaleString('es-VE', {
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

      return `
        <tr style="background: ${idx % 2 === 0 ? '#ffffff' : '#f8fafc'}; border-bottom: 1px solid #e2e8f0;">
          <td style="padding: 7px 8px; font-family: monospace; font-size: 8.5pt; color: #334155; white-space: nowrap;">${fechaStr}</td>
          <td style="padding: 7px 8px; font-weight: bold; font-size: 8pt; color: #0284c7; text-align: center;">Sem. ${l.semana_ciclo || systemCycle.semana}</td>
          <td style="padding: 7px 8px; font-weight: bold; font-size: 8.5pt; color: #1e293b;">${l.modulo}</td>
          <td style="padding: 7px 8px; font-weight: 600; font-size: 8.5pt; color: #0f172a;">${l.entidad_afectada}</td>
          <td style="padding: 7px 8px; font-size: 8.5pt; color: #0f172a; line-height: 1.35;">${l.descripcion}</td>
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
          <title>Acta Oficial de Auditoría y Cierre - Semana ${systemCycle.semana} - ${companyName}</title>
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
              font-size: 8.5pt;
              color: #64748b;
              margin: 0;
            }
            .kpis {
              display: grid;
              grid-template-columns: repeat(5, 1fr);
              gap: 10px;
              margin-bottom: 14px;
            }
            .kpi-box {
              background: #f8fafc;
              border: 1px solid #e2e8f0;
              border-radius: 8px;
              padding: 8px 10px;
              text-align: center;
            }
            .kpi-lbl {
              font-size: 7pt;
              text-transform: uppercase;
              font-weight: 800;
              color: #64748b;
              margin-bottom: 3px;
            }
            .kpi-val {
              font-size: 13pt;
              font-weight: 900;
              color: #0f172a;
              font-family: monospace;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 10px;
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
              <div class="doc-title">Acta Oficial de Auditoría de Cierre Operativo</div>
              <p class="doc-sub">
                Certificación inmutable de eventos, modificaciones, eliminaciones y balance del ciclo operativo • 
                <strong>Semana ${systemCycle.semana} (${systemCycle.desde} al ${systemCycle.hasta})</strong>
              </p>
            </div>
            <div style="text-align: right; font-size: 8pt; color: #475569;">
              <div><strong>Fecha de Emisión:</strong> ${fechaImpresion}</div>
              <div><strong>Fecha de Cierre:</strong> ${fechaCierre ? new Date(fechaCierre).toLocaleString('es-VE') : fechaImpresion}</div>
              <div><strong>Auditor Responsable:</strong> ${userName}</div>
              <div><strong>Estado:</strong> INMUTABLE / CERRADO</div>
            </div>
          </div>

          <div class="kpis">
            <div class="kpi-box">
              <div class="kpi-lbl">Total Eventos</div>
              <div class="kpi-val">${auditLogs.length}</div>
            </div>
            <div class="kpi-box">
              <div class="kpi-lbl">Impacto Alto</div>
              <div class="kpi-val" style="color: #e11d48;">${highImpactCount}</div>
            </div>
            <div class="kpi-box">
              <div class="kpi-lbl">Pagos Eliminados</div>
              <div class="kpi-val" style="color: #d97706;">${deletedPaymentsCount}</div>
            </div>
            <div class="kpi-box">
              <div class="kpi-lbl">Gastos Eliminados</div>
              <div class="kpi-val" style="color: #d97706;">${deletedExpensesCount}</div>
            </div>
            <div class="kpi-box">
              <div class="kpi-lbl">Agencias Auditadas</div>
              <div class="kpi-val" style="color: #047857;">${affectedAgenciesCount}</div>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th style="width: 13%;">Fecha / Hora</th>
                <th style="width: 8%; text-align: center;">Semana</th>
                <th style="width: 9%;">Módulo</th>
                <th style="width: 14%;">Entidad Afectada</th>
                <th style="width: 36%;">Descripción de la Operación / Modificación</th>
                <th style="width: 11%;">Usuario</th>
                <th style="width: 9%; text-align: center;">Impacto</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml.length > 0 ? rowsHtml : `
                <tr>
                  <td colspan="7" style="padding: 16px; text-align: center; color: #64748b; font-style: italic;">
                    No se registraron incidentes o modificaciones manuales durante este ciclo operativo.
                  </td>
                </tr>
              `}
            </tbody>
          </table>

          <div class="signatures">
            <div>
              <div class="sig-line">
                <div class="sig-title">Auditor Contable / Responsable</div>
                <div class="sig-sub">${userName}</div>
              </div>
            </div>
            <div>
              <div class="sig-line">
                <div class="sig-title">Control de Operaciones y Seguridad</div>
                <div class="sig-sub">Verificación de Cierre y Trazabilidad</div>
              </div>
            </div>
            <div>
              <div class="sig-line">
                <div class="sig-title">Dirección General / Casa Matriz</div>
                <div class="sig-sub">${companyName}</div>
              </div>
            </div>
          </div>

          <div class="footer">
            <span>Acta Oficial de Auditoría y Cierre Semanal • Sistema Integrado Multibanca Express CMS</span>
            <span>Certificado Criptográfico de Trazabilidad Inmutable</span>
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

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/80 backdrop-blur-md animate-fade-in">
      <div className="bg-[#0D1B22] border border-slate-800 rounded-3xl w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
          <div className="flex items-center gap-3">
            <span className="p-2.5 rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <ShieldCheck className="w-6 h-6" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-black text-white">
                  Acta Oficial de Auditoría de Cierre
                </h3>
                <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 uppercase tracking-wider font-mono">
                  Semana {systemCycle.semana}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Período: <strong className="text-white">{systemCycle.desde}</strong> al <strong className="text-white">{systemCycle.hasta}</strong> • {companyName}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-xs flex items-center gap-2 transition-all cursor-pointer shadow-lg shadow-emerald-500/20"
            >
              <Printer className="w-4 h-4" />
              <span>Imprimir Acta (PDF)</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
          {/* KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="bg-[#071217] p-3 rounded-2xl border border-slate-800 text-center">
              <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Total Eventos</span>
              <span className="text-base font-black text-white font-mono">{auditLogs.length}</span>
            </div>
            <div className="bg-[#071217] p-3 rounded-2xl border border-slate-800 text-center">
              <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Impacto Alto</span>
              <span className="text-base font-black text-rose-400 font-mono">{highImpactCount}</span>
            </div>
            <div className="bg-[#071217] p-3 rounded-2xl border border-slate-800 text-center">
              <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Pagos Eliminados</span>
              <span className="text-base font-black text-amber-400 font-mono">{deletedPaymentsCount}</span>
            </div>
            <div className="bg-[#071217] p-3 rounded-2xl border border-slate-800 text-center">
              <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Gastos Eliminados</span>
              <span className="text-base font-black text-amber-400 font-mono">{deletedExpensesCount}</span>
            </div>
            <div className="bg-[#071217] p-3 rounded-2xl border border-slate-800 text-center col-span-2 sm:col-span-1">
              <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Agencias Auditadas</span>
              <span className="text-base font-black text-emerald-400 font-mono">{affectedAgenciesCount}</span>
            </div>
          </div>

          {/* Table */}
          <div className="border border-slate-800 rounded-2xl overflow-hidden bg-[#071217]">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-900/80 text-slate-400 text-[10px] uppercase tracking-wider border-b border-slate-800">
                  <th className="py-2.5 px-3 font-bold">Fecha / Hora</th>
                  <th className="py-2.5 px-2 font-bold text-center">Semana</th>
                  <th className="py-2.5 px-3 font-bold">Módulo</th>
                  <th className="py-2.5 px-3 font-bold">Entidad Afectada</th>
                  <th className="py-2.5 px-3 font-bold">Descripción</th>
                  <th className="py-2.5 px-3 font-bold">Usuario</th>
                  <th className="py-2.5 px-3 font-bold text-center">Impacto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono text-xs">
                {auditLogs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-500 font-sans italic">
                      No se registraron incidentes o modificaciones manuales en esta semana cerrada.
                    </td>
                  </tr>
                ) : (
                  auditLogs.map((l) => (
                    <tr key={l.id || l.timestamp} className="hover:bg-slate-800/30 transition-colors">
                      <td className="py-2.5 px-3 text-slate-300 text-[11px] whitespace-nowrap">
                        {new Date(l.timestamp).toLocaleString('es-VE', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="py-2.5 px-2 text-center">
                        <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-slate-800 text-sky-400 border border-slate-700">
                          {l.semana_ciclo || systemCycle.semana}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                          {l.modulo}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-bold text-white font-sans">
                        {l.entidad_afectada}
                      </td>
                      <td className="py-2.5 px-3 text-slate-300 font-sans text-xs">
                        {l.descripcion}
                      </td>
                      <td className="py-2.5 px-3 text-slate-400 text-[11px]">
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
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/60 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Documento Oficial Certificado con Trazabilidad Inmutable</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-bold transition-all cursor-pointer"
          >
            Cerrar Vista
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
