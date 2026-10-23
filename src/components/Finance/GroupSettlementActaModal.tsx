import React from 'react';
import { createPortal } from 'react-dom';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { Printer, X, ShieldCheck, Handshake, Share2, Copy, Check } from 'lucide-react';
import type { GroupClosureRow } from '../../lib/closureEngineLock';

interface GroupSettlementActaModalProps {
  isOpen?: boolean;
  onClose: () => void;
  row: GroupClosureRow;
  semana?: string;
  periodo?: string;
  companyName?: string;
}

export const GroupSettlementActaModal: React.FC<GroupSettlementActaModalProps> = ({
  isOpen = true,
  onClose,
  row,
  semana = '41',
  periodo = '',
  companyName = 'OPERADORA DE APUESTAS & MULTIBANCA',
}) => {
  const [copied, setCopied] = React.useState(false);

  if (!isOpen) return null;

  const todayFormatted = new Date().toLocaleDateString('es-VE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  const generateWhatsAppMessage = () => {
    const statusText =
      row.saldoFinal > 0
        ? `🔴 Saldo a Pagar al Grupo: ${formatCurrency(row.saldoFinal, row.moneda)}`
        : row.saldoFinal < 0
        ? `🟢 Saldo a Favor Comercializadora: ${formatCurrency(Math.abs(row.saldoFinal), row.moneda)}`
        : `⚪ Saldo Liquidado / Al Día (0.00)`;

    const msg = [
      `🤝 *ACTA OFICIAL DE LIQUIDACIÓN DE GRUPO*`,
      `🏢 *${companyName}*`,
      `📅 *Semana:* ${semana} ${periodo ? `(${periodo})` : ''}`,
      `🏷️ *Grupo / Intermediario:* ${row.grupoNombre}`,
      `💰 *Moneda:* ${row.moneda}`,
      `----------------------------------------`,
      `📊 *RESUMEN DE RED DE AGENCIAS:*`,
      `• Agencias en Red: ${row.agenciasHijas.length} agencias`,
      `• Venta Bruta Red: ${formatCurrency(row.ventaBrutaArbol, row.moneda)}`,
      `• Premios Red: -${formatCurrency(row.premiosArbol, row.moneda)}`,
      `• Utilidad Bruta (GGR): ${formatCurrency(row.utilidadBrutaArbol, row.moneda)}`,
      `• Comisiones Agencias: -${formatCurrency(row.comisionAgenciasHijas, row.moneda)}`,
      `----------------------------------------`,
      `💼 *BENEFICIOS PACTADOS DEL GRUPO:*`,
      `• Dif. Comisión Grupo: +${formatCurrency(row.diferencialComisionGrupo, row.moneda)}`,
      row.diferencialParticipacionGrupo > 0
        ? `• Dif. Participación Grupo: +${formatCurrency(row.diferencialParticipacionGrupo, row.moneda)}`
        : null,
      `⭐ *GANANCIA TOTAL GRUPO:* ${formatCurrency(row.gananciaTotalGrupo, row.moneda)}`,
      `----------------------------------------`,
      `💳 *CUENTA Y LIQUIDACIÓN:*`,
      `• Saldo Inicial Arrastre: ${formatCurrency(row.saldoInicial, row.moneda)}`,
      `• Pagos / Liquidaciones: -${formatCurrency(row.pagosLiquidados, row.moneda)}`,
      `🏁 *ESTADO FINAL:*`,
      statusText,
      `----------------------------------------`,
      `🏛️ _Emitido por Administración Oficial el ${todayFormatted}_`,
    ]
      .filter(Boolean)
      .join('\n');

    return msg;
  };

  const handleCopyWhatsApp = () => {
    const text = generateWhatsAppMessage();
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

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

    doc.open();
    doc.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Acta de Liquidación - Grupo ${row.grupoNombre} (${row.moneda})</title>
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
              font-size: 10.5pt;
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
              font-size: 15pt;
              font-weight: 900;
              letter-spacing: 0.5px;
            }
            .title {
              font-size: 11pt;
              font-weight: bold;
              color: #6b21a8;
              text-transform: uppercase;
              margin-top: 4px;
            }
            .badge {
              display: inline-block;
              padding: 4px 10px;
              border-radius: 9999px;
              font-weight: bold;
              font-size: 9pt;
              text-transform: uppercase;
              border: 1px solid #cbd5e1;
            }
            .section-title {
              font-size: 10pt;
              font-weight: 800;
              text-transform: uppercase;
              color: #475569;
              margin-top: 14px;
              margin-bottom: 6px;
              border-bottom: 1px solid #e2e8f0;
              padding-bottom: 2px;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-bottom: 12px;
            }
            th, td {
              padding: 6px 8px;
              text-align: left;
              border-bottom: 1px solid #f1f5f9;
              font-size: 10pt;
            }
            th {
              background: #f8fafc;
              font-weight: 700;
              color: #334155;
            }
            .text-right { text-align: right; }
            .font-mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
            .font-bold { font-weight: bold; }
            .total-row {
              background: #faf5ff;
              font-weight: 800;
              border-top: 2px solid #6b21a8;
              border-bottom: 2px solid #6b21a8;
            }
            .footer-signatures {
              margin-top: 48px;
              display: flex;
              justify-content: space-between;
              gap: 40px;
            }
            .sign-box {
              flex: 1;
              border-top: 1px solid #0f172a;
              text-align: center;
              padding-top: 8px;
              font-size: 9pt;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <div class="company">${companyName}</div>
              <div class="title">Acta Oficial de Liquidación de Grupo / Sub-Comercializador</div>
              <div style="font-size: 9pt; color: #64748b; margin-top: 2px;">
                Semana: <strong>${semana}</strong> ${periodo ? `• Periodo: ${periodo}` : ''} • Fecha: ${todayFormatted}
              </div>
            </div>
            <div style="text-align: right;">
              <span class="badge" style="background: #f3e8ff; color: #6b21a8; border-color: #d8b4fe;">
                ${row.grupoNombre} (${row.moneda})
              </span>
            </div>
          </div>

          <div class="section-title">1. Rendimiento de la Red de Agencias (${row.agenciasHijas.length} agencias)</div>
          <table>
            <thead>
              <tr>
                <th>Concepto de Red</th>
                <th class="text-right">Monto (${row.moneda})</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Venta Bruta Total de la Red</td>
                <td class="text-right font-mono">${formatCurrency(row.ventaBrutaArbol, row.moneda)}</td>
              </tr>
              <tr>
                <td>Premios Pagados por Agencias</td>
                <td class="text-right font-mono">-${formatCurrency(row.premiosArbol, row.moneda)}</td>
              </tr>
              <tr style="background: #f8fafc; font-weight: 600;">
                <td>Utilidad Bruta de la Red (GGR)</td>
                <td class="text-right font-mono">${formatCurrency(row.utilidadBrutaArbol, row.moneda)}</td>
              </tr>
              <tr>
                <td>Comisiones Pagadas a Agencias Hijas</td>
                <td class="text-right font-mono">-${formatCurrency(row.comisionAgenciasHijas, row.moneda)}</td>
              </tr>
            </tbody>
          </table>

          <div class="section-title">2. Liquidación y Ganancia del Grupo</div>
          <table>
            <thead>
              <tr>
                <th>Detalle de Beneficios Pactados</th>
                <th class="text-right">Monto Ganado (${row.moneda})</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Diferencial de Comisión del Grupo (Overriding)</td>
                <td class="text-right font-mono font-bold" style="color: #047857;">+${formatCurrency(row.diferencialComisionGrupo, row.moneda)}</td>
              </tr>
              <tr>
                <td>Diferencial de Participación en Utilidad (Profit Split)</td>
                <td class="text-right font-mono font-bold" style="color: #047857;">+${formatCurrency(row.diferencialParticipacionGrupo, row.moneda)}</td>
              </tr>
              <tr class="total-row">
                <td style="color: #581c87;">GANANCIA NETA TOTAL DEL GRUPO</td>
                <td class="text-right font-mono font-bold" style="color: #581c87; font-size: 11pt;">${formatCurrency(row.gananciaTotalGrupo, row.moneda)}</td>
              </tr>
            </tbody>
          </table>

          <div class="section-title">3. Estado de Cuenta y Saldo Final</div>
          <table>
            <tbody>
              <tr>
                <td>Saldo Inicial Arrastrado de Semana Anterior</td>
                <td class="text-right font-mono">${formatCurrency(row.saldoInicial, row.moneda)}</td>
              </tr>
              <tr>
                <td>(+) Ganancia Total Neta del Grupo en el Ciclo</td>
                <td class="text-right font-mono">+${formatCurrency(row.gananciaTotalGrupo, row.moneda)}</td>
              </tr>
              <tr>
                <td>(-) Pagos / Adelantos y Liquidaciones Recibidas</td>
                <td class="text-right font-mono">-${formatCurrency(row.pagosLiquidados, row.moneda)}</td>
              </tr>
              <tr class="total-row" style="background: #f1f5f9; border-color: #0f172a;">
                <td style="font-size: 11pt;">SALDO FINAL A FECHA DE CORTE</td>
                <td class="text-right font-mono font-bold" style="font-size: 12pt; ${row.saldoFinal > 0 ? 'color: #b91c1c;' : 'color: #047857;'}">
                  ${formatCurrency(row.saldoFinal, row.moneda)}
                </td>
              </tr>
            </tbody>
          </table>

          <div style="font-size: 9pt; color: #64748b; margin-top: 10px;">
            Agencias hijas en esta red: ${row.agenciasHijas.join(', ') || 'Ninguna registrada'}.
          </div>

          <div class="footer-signatures">
            <div class="sign-box">
              <strong>POR LA COMERCIALIZADORA</strong><br />
              Firma y Sello Autorizado
            </div>
            <div class="sign-box">
              <strong>POR EL GRUPO / SUB-COMERCIALIZADOR</strong><br />
              ${row.grupoNombre}
            </div>
          </div>
        </body>
      </html>
    `);
    doc.close();

    setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      setTimeout(() => {
        document.body.removeChild(iframe);
      }, 1000);
    }, 250);
  };

  const modalContent = (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-[#0B1519] border border-slate-800 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-[#071217]">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
              <Handshake className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-white flex items-center gap-2">
                <span>Acta de Liquidación de Grupo</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 font-mono">
                  {row.moneda}
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Semana {semana} • {row.grupoNombre}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-4 text-xs font-mono custom-scrollbar">
          {/* Card Resumen Grupo */}
          <div className="bg-[#071217] border border-slate-800 rounded-2xl p-4 flex items-center justify-between font-sans">
            <div>
              <div className="text-sm font-black text-white flex items-center gap-2">
                <span>🤝 {row.grupoNombre}</span>
              </div>
              <div className="text-[11px] text-slate-400">
                Red: {row.agenciasHijas.length} agencias hijas • Moneda: {row.moneda}
              </div>
            </div>
            <span
              className={`px-3 py-1 rounded-full text-xs font-black uppercase ${
                row.saldoFinal > 0
                  ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                  : row.saldoFinal < 0
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'bg-slate-800 text-slate-400'
              }`}
            >
              {row.saldoFinal > 0
                ? 'SALDO A PAGAR'
                : row.saldoFinal < 0
                ? 'SALDO A FAVOR'
                : 'AL DÍA'}
            </span>
          </div>

          {/* Agencias Hijas */}
          {row.agenciasHijas.length > 0 && (
            <div className="bg-[#071217]/50 border border-slate-800/80 rounded-xl p-3">
              <span className="text-[10px] text-slate-400 font-sans block mb-1.5 font-bold uppercase tracking-wider">
                Agencias en el Árbol del Grupo:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {row.agenciasHijas.map((ag) => (
                  <span
                    key={ag}
                    className="px-2 py-0.5 rounded bg-slate-800/80 text-slate-300 text-[10px] border border-slate-700/60"
                  >
                    🏢 {ag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Tabla de Arqueo y Ganancias */}
          <div className="bg-[#071217] border border-slate-800 rounded-2xl p-4 space-y-2">
            <div className="flex justify-between text-slate-400">
              <span>Venta Bruta Total Red:</span>
              <span className="text-slate-200">{formatCurrency(row.ventaBrutaArbol, row.moneda)}</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Premios Pagados Red (-):</span>
              <span className="text-rose-400">-{formatCurrency(row.premiosArbol, row.moneda)}</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Comisiones Pagadas a Agencias (-):</span>
              <span className="text-rose-400">-{formatCurrency(row.comisionAgenciasHijas, row.moneda)}</span>
            </div>
            <div className="flex justify-between text-slate-300 font-bold border-t border-slate-800/80 pt-2">
              <span>Utilidad Bruta Red (GGR):</span>
              <span>{formatCurrency(row.utilidadBrutaArbol, row.moneda)}</span>
            </div>

            <div className="my-2 border-t border-purple-500/20 pt-2 space-y-1.5 bg-purple-950/10 p-2.5 rounded-xl border">
              <div className="flex justify-between text-purple-300">
                <span>Diferencial Comisión Grupo (+):</span>
                <span className="font-bold">+{formatCurrency(row.diferencialComisionGrupo, row.moneda)}</span>
              </div>
              {row.diferencialParticipacionGrupo > 0 && (
                <div className="flex justify-between text-purple-300">
                  <span>Diferencial Participación Grupo (+):</span>
                  <span className="font-bold">+{formatCurrency(row.diferencialParticipacionGrupo, row.moneda)}</span>
                </div>
              )}
              <div className="flex justify-between text-emerald-400 font-black text-xs pt-1 border-t border-purple-500/30">
                <span>Ganancia Neta Total Grupo:</span>
                <span>+{formatCurrency(row.gananciaTotalGrupo, row.moneda)}</span>
              </div>
            </div>

            <div className="flex justify-between text-slate-400">
              <span>Saldo Arrastre Anterior:</span>
              <span className="text-slate-200">{formatCurrency(row.saldoInicial, row.moneda)}</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Pagos / Adelantos Recibidos (-):</span>
              <span className="text-sky-400">-{formatCurrency(row.pagosLiquidados, row.moneda)}</span>
            </div>

            <div className="flex justify-between items-center text-sm font-black border-t border-slate-700 pt-2.5 text-white">
              <span>Saldo Final a Liquidar:</span>
              <span
                className={
                  row.saldoFinal > 0
                    ? 'text-rose-400'
                    : row.saldoFinal < 0
                    ? 'text-emerald-400'
                    : 'text-slate-300'
                }
              >
                {formatCurrency(row.saldoFinal, row.moneda)}
              </span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 flex items-center justify-between gap-3 bg-[#071217]">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-bold text-xs transition-colors cursor-pointer"
          >
            Cerrar
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyWhatsApp}
              className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition-all cursor-pointer ${
                copied
                  ? 'bg-emerald-500 text-slate-950 font-black'
                  : 'bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 border border-emerald-500/30'
              }`}
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              <span>{copied ? '¡Copiado!' : 'Copiar WhatsApp'}</span>
            </button>

            <button
              onClick={handlePrint}
              className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-black text-xs flex items-center gap-2 transition-all cursor-pointer shadow-lg shadow-purple-600/20"
            >
              <Printer className="w-4 h-4" />
              <span>Imprimir / PDF</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};
