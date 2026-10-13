import React from 'react';
import { createPortal } from 'react-dom';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { Printer, X, ShieldCheck, Building2, Store } from 'lucide-react';

export interface IndividualAgencyActaData {
  agencyName: string;
  agencyId?: number;
  periodo: string;
  fechaCierre?: string;
  moneda: string;
  saldoAnterior: number;
  ventaBruta: number;
  comision: number;
  premios: number;
  ventaNeta: number;
  participacionPct: number;
  participacionMonto: number;
  utilidadOperadora: number;
  cobros: number;
  gastos: number;
  saldoFinal: number;
  status: 'AL DÍA' | 'DEUDA PENDIENTE' | 'SALDO A FAVOR';
}

interface IndividualAgencyActaModalProps {
  isOpen?: boolean;
  onClose: () => void;
  actaData: IndividualAgencyActaData;
  userName?: string;
  companyName?: string;
}

export const IndividualAgencyActaModal: React.FC<IndividualAgencyActaModalProps> = ({
  isOpen = true,
  onClose,
  actaData,
  userName = 'Administración',
  companyName = 'CORPORACION CALENDARIO, CA',
}) => {
  if (!isOpen) return null;

  const todayFormatted = new Date().toLocaleDateString('es-VE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

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

    const {
      agencyName,
      periodo,
      moneda,
      saldoAnterior,
      ventaBruta,
      comision,
      premios,
      ventaNeta,
      participacionPct,
      participacionMonto,
      utilidadOperadora,
      cobros,
      gastos,
      saldoFinal,
      status,
    } = actaData;

    doc.open();
    doc.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Acta de Finiquito y Liquidación - ${agencyName} (${moneda})</title>
          <meta charset="utf-8" />
          <style>
            @page {
              size: letter portrait;
              margin: 1.5cm;
            }
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
              color: #0f172a;
              background: #fff;
              font-size: 11pt;
              line-height: 1.4;
              margin: 0;
              padding: 0;
            }
            .header {
              border-bottom: 2px solid #0f172a;
              padding-bottom: 12px;
              margin-bottom: 16px;
              display: flex;
              justify-content: space-between;
              align-items: flex-start;
            }
            .company {
              font-size: 16pt;
              font-weight: 900;
              letter-spacing: 0.5px;
            }
            .title {
              font-size: 12pt;
              font-weight: bold;
              color: #047857;
              text-transform: uppercase;
              margin-top: 2px;
            }
            .meta {
              text-align: right;
              font-size: 9pt;
              color: #475569;
            }
            .agency-box {
              background: #f8fafc;
              border: 1px solid #cbd5e1;
              border-radius: 8px;
              padding: 12px 16px;
              margin-bottom: 18px;
              display: flex;
              justify-content: space-between;
            }
            .agency-title {
              font-size: 13pt;
              font-weight: 900;
              color: #0f172a;
            }
            .agency-sub {
              font-size: 9pt;
              color: #64748b;
            }
            .status-badge {
              display: inline-block;
              padding: 4px 10px;
              border-radius: 20px;
              font-size: 9pt;
              font-weight: bold;
              text-transform: uppercase;
              background: ${saldoFinal > 0 ? '#fee2e2; color: #b91c1c;' : saldoFinal < 0 ? '#d1fae5; color: #047857;' : '#e2e8f0; color: #334155;'};
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-bottom: 20px;
              font-size: 10pt;
            }
            th, td {
              padding: 8px 12px;
              border-bottom: 1px solid #e2e8f0;
            }
            th {
              background: #f1f5f9;
              font-weight: 800;
              text-transform: uppercase;
              font-size: 8pt;
              color: #475569;
              text-align: left;
            }
            td.mono {
              font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
              text-align: right;
            }
            tr.highlight {
              background: #f8fafc;
              font-weight: bold;
            }
            tr.final-row {
              background: #ecfdf5;
              border-top: 2px solid #047857;
              border-bottom: 2px solid #047857;
            }
            .final-amount {
              font-size: 13pt;
              font-weight: 900;
              color: ${saldoFinal > 0 ? '#b91c1c' : '#047857'};
            }
            .signatures {
              margin-top: 60px;
              display: flex;
              justify-content: space-between;
              page-break-inside: avoid;
            }
            .sign-box {
              width: 42%;
              text-align: center;
              border-top: 1px solid #0f172a;
              padding-top: 8px;
            }
            .sign-title {
              font-weight: bold;
              font-size: 10pt;
            }
            .sign-sub {
              font-size: 8pt;
              color: #64748b;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <div class="company">${companyName}</div>
              <div class="title">Acta Oficial de Finiquito y Liquidación Semanal</div>
            </div>
            <div class="meta">
              <div><strong>Ciclo / Período:</strong> ${periodo}</div>
              <div><strong>Fecha de Emisión:</strong> ${todayFormatted}</div>
              <div><strong>Auditor / Responsable:</strong> ${userName}</div>
            </div>
          </div>

          <div class="agency-box">
            <div>
              <div class="agency-title">${agencyName}</div>
              <div class="agency-sub">Punto de Venta / Concesionario Autorizado • Moneda: <strong>${moneda}</strong></div>
            </div>
            <div>
              <span class="status-badge">${status}</span>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th>Concepto / Rubro Operativo</th>
                <th style="text-align: center;">Incidencia</th>
                <th style="text-align: right;">Monto Liquidado</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>Saldo de Arrastre Anterior</strong></td>
                <td style="text-align: center;">Inicial</td>
                <td class="mono">${formatCurrency(saldoAnterior, moneda)}</td>
              </tr>
              <tr>
                <td>Venta Bruta Global</td>
                <td style="text-align: center;">Operativo</td>
                <td class="mono">${formatCurrency(ventaBruta, moneda)}</td>
              </tr>
              <tr>
                <td>Comisión Taquilla (-)</td>
                <td style="text-align: center;">Deducción</td>
                <td class="mono" style="color: #b91c1c;">-${formatCurrency(comision, moneda)}</td>
              </tr>
              <tr>
                <td>Premios Pagados en Taquilla (-)</td>
                <td style="text-align: center;">Deducción</td>
                <td class="mono" style="color: #b91c1c;">-${formatCurrency(premios, moneda)}</td>
              </tr>
              <tr class="highlight">
                <td><strong>Venta Neta del Ciclo</strong></td>
                <td style="text-align: center;">Venta - Com. - Premios</td>
                <td class="mono"><strong>${formatCurrency(ventaNeta, moneda)}</strong></td>
              </tr>
              ${
                participacionPct > 0
                  ? `
              <tr>
                <td>Participación Concesionario (${participacionPct}%)</td>
                <td style="text-align: center;">Abono Taquilla</td>
                <td class="mono" style="color: #047857;">+${formatCurrency(participacionMonto, moneda)}</td>
              </tr>
              `
                  : ''
              }
              <tr>
                <td>Cobros Ordinarios y Liquidaciones Taquilla (-)</td>
                <td style="text-align: center;">Cobro Registrado</td>
                <td class="mono" style="color: #0284c7;">-${formatCurrency(cobros, moneda)}</td>
              </tr>
              <tr>
                <td>Gastos Operativos Deductibles (-)</td>
                <td style="text-align: center;">Gasto Aprobado</td>
                <td class="mono" style="color: #b91c1c;">-${formatCurrency(gastos, moneda)}</td>
              </tr>
              <tr class="final-row">
                <td><strong style="font-size: 11pt;">BALANCE FINAL A LIQUIDAR / SALDO DEFINITIVO</strong></td>
                <td style="text-align: center; font-weight: bold;">CIERRE AUDITADO</td>
                <td class="mono final-amount">${formatCurrency(saldoFinal, moneda)}</td>
              </tr>
            </tbody>
          </table>

          <div style="font-size: 8.5pt; color: #64748b; margin-top: 10px;">
            * Nota: El presente documento constituye el acta oficial de liquidación y finiquito para el período indicado. Ambas partes declaran la conformidad de los montos expresados.
          </div>

          <div class="signatures">
            <div class="sign-box">
              <div class="sign-title">Responsable de Taquilla / Concesionario</div>
              <div class="sign-sub">Firma y C.I. Conforme (${agencyName})</div>
            </div>
            <div class="sign-box">
              <div class="sign-title">Administración y Finanzas</div>
              <div class="sign-sub">Firma Autorizada • ${companyName}</div>
            </div>
          </div>
        </body>
      </html>
    `);
    doc.close();

    setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      setTimeout(() => document.body.removeChild(iframe), 2000);
    }, 400);
  };

  const modalContent = (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-[#0D1B22] border border-slate-800 rounded-3xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Store className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-white">
                Acta de Finiquito y Liquidación
              </h3>
              <p className="text-xs text-slate-400">
                {actaData.agencyName} • {actaData.periodo} • {actaData.moneda}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-4 text-xs font-mono">
          <div className="bg-[#071217] border border-slate-800 rounded-2xl p-4 flex items-center justify-between font-sans">
            <div>
              <div className="text-sm font-black text-white">{actaData.agencyName}</div>
              <div className="text-[11px] text-slate-400">Punto de Venta Oficial • Moneda: {actaData.moneda}</div>
            </div>
            <span
              className={`px-3 py-1 rounded-full text-xs font-black uppercase ${
                actaData.saldoFinal > 0
                  ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                  : actaData.saldoFinal < 0
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'bg-slate-800 text-slate-400'
              }`}
            >
              {actaData.status}
            </span>
          </div>

          <div className="bg-[#071217] border border-slate-800 rounded-2xl p-4 space-y-2">
            <div className="flex justify-between text-slate-400">
              <span>Saldo Arrastre Anterior:</span>
              <span className="text-slate-200">{formatCurrency(actaData.saldoAnterior, actaData.moneda)}</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Venta Bruta:</span>
              <span className="text-slate-200">{formatCurrency(actaData.ventaBruta, actaData.moneda)}</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Comisión Taquilla (-):</span>
              <span className="text-rose-400">-{formatCurrency(actaData.comision, actaData.moneda)}</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Premios Pagados (-):</span>
              <span className="text-rose-400">-{formatCurrency(actaData.premios, actaData.moneda)}</span>
            </div>
            <div className="flex justify-between text-slate-200 font-bold border-t border-slate-800 pt-1.5">
              <span>Venta Neta Ciclo:</span>
              <span>{formatCurrency(actaData.ventaNeta, actaData.moneda)}</span>
            </div>
            {actaData.participacionPct > 0 && (
              <div className="flex justify-between text-emerald-400">
                <span>Participación Concesionario ({actaData.participacionPct}%):</span>
                <span>+{formatCurrency(actaData.participacionMonto, actaData.moneda)}</span>
              </div>
            )}
            <div className="flex justify-between text-slate-400">
              <span>Cobros Ordinarios / Bancos (-):</span>
              <span className="text-sky-400">-{formatCurrency(actaData.cobros, actaData.moneda)}</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Gastos Operativos (-):</span>
              <span className="text-rose-400">-{formatCurrency(actaData.gastos, actaData.moneda)}</span>
            </div>
            <div className="flex justify-between items-center text-sm font-black border-t border-slate-700 pt-2 text-white">
              <span>Balance Final:</span>
              <span
                className={
                  actaData.saldoFinal > 0
                    ? 'text-rose-400'
                    : actaData.saldoFinal < 0
                    ? 'text-emerald-400'
                    : 'text-slate-300'
                }
              >
                {formatCurrency(actaData.saldoFinal, actaData.moneda)}
              </span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 flex items-center justify-between gap-3 bg-[#0A161C]">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-bold text-xs transition-colors cursor-pointer"
          >
            Cerrar
          </button>
          <button
            onClick={handlePrint}
            className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs flex items-center gap-2 transition-all cursor-pointer shadow-lg shadow-emerald-500/20"
          >
            <Printer className="w-4 h-4" />
            <span>Imprimir / Exportar PDF</span>
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};
