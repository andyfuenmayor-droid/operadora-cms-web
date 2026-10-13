import React from 'react';
import { createPortal } from 'react-dom';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { Printer, X, Globe, ShieldCheck } from 'lucide-react';
import type { OperatorSettlementRow, OperatorSettlementTotals } from '../../utils/operatorSettlement';

export interface OperatorDeliveryReportModalProps {
  isOpen?: boolean;
  onClose: () => void;
  systemCycle: { semana: string; desde: string; hasta: string; tipo: string };
  userName?: string;
  companyName?: string;
  operatorGroups: {
    sistema: string;
    rows: OperatorSettlementRow[];
    hasDeuda: boolean;
    hasFavor: boolean;
  }[];
  totalsByCurrency: Record<string, OperatorSettlementTotals>;
}

export const OperatorDeliveryReportModal: React.FC<OperatorDeliveryReportModalProps> = ({
  isOpen = true,
  onClose,
  systemCycle,
  userName = 'Administración',
  companyName = 'CORPORACION CALENDARIO, CA',
  operatorGroups,
  totalsByCurrency,
}) => {
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

    // Build Table Rows by Operator
    let rowsHtml = '';
    operatorGroups.forEach((group) => {
      // Header for operator
      rowsHtml += `
        <tr style="background: #f1f5f9; font-weight: 900; border-top: 1.5px solid #0f172a; border-bottom: 1px solid #cbd5e1;">
          <td colspan="13" style="text-align: left; padding: 5px 6px; font-size: 10px; color: #0f172a;">
            🌐 <strong>${group.sistema}</strong> (${group.rows.length} ${group.rows.length === 1 ? 'Moneda' : 'Monedas Activas'})
          </td>
        </tr>
      `;

      group.rows.forEach((r) => {
        const isDeuda = r.balanceFinal > 0.01;
        const isFavor = r.balanceFinal < -0.01;
        const estadoTxt = isDeuda ? 'A PAGAR' : isFavor ? 'A FAVOR' : 'SOLVENTE';
        const estadoColor = isDeuda ? '#b91c1c' : isFavor ? '#047857' : '#475569';

        rowsHtml += `
          <tr>
            <td style="text-align: left; padding-left: 14px; font-weight: 600; color: #334155;">↳ ${r.sistema}</td>
            <td style="text-align: center; font-weight: 700; color: #0f172a;">${r.moneda}</td>
            <td style="text-align: right;">${formatCurrency(r.venta, r.moneda as any)}</td>
            <td style="text-align: right; color: #b45309;">${r.premio > 0 ? `-${formatCurrency(r.premio, r.moneda as any)}` : '-'}</td>
            <td style="text-align: right; font-weight: 700; color: ${r.utilidadBruta >= 0 ? '#047857' : '#b91c1c'};">${formatCurrency(r.utilidadBruta, r.moneda as any)}</td>
            <td style="text-align: right; color: #0891b2; font-weight: 600;">${formatCurrency(r.difCom, r.moneda as any)}</td>
            <td style="text-align: right; color: ${r.partCom >= 0 ? '#047857' : '#b91c1c'};">${formatCurrency(r.partCom, r.moneda as any)}</td>
            <td style="text-align: right; font-weight: 900; color: #047857; background: #f0fdf4;">${formatCurrency(r.totalCom, r.moneda as any)}</td>
            <td style="text-align: right; font-weight: 700; color: ${r.netoOperadora >= 0 ? '#b45309' : '#b91c1c'};">${formatCurrency(r.netoOperadora, r.moneda as any)}</td>
            <td style="text-align: right; color: #475569;">${formatCurrency(r.saldoInit, r.moneda as any)}</td>
            <td style="text-align: right; color: #0891b2;">${r.pagosNetos !== 0 ? `-${formatCurrency(r.pagosNetos, r.moneda as any)}` : '-'}</td>
            <td style="text-align: right; font-weight: 900; font-size: 10px; color: ${estadoColor};">${formatCurrency(r.balanceFinal, r.moneda as any)}</td>
            <td style="text-align: center; font-weight: 800; font-size: 8.5px; color: ${estadoColor};">${estadoTxt}</td>
          </tr>
        `;
      });
    });

    // Summary boxes HTML
    const summariesHtml = ['BS', 'USD', 'COP']
      .map((mon) => {
        const tot = totalsByCurrency[mon];
        if (!tot || (tot.count === 0 && tot.venta === 0 && Math.abs(tot.balanceFinal) < 0.01)) return '';
        const isDeuda = tot.balanceFinal > 0.01;
        const isFavor = tot.balanceFinal < -0.01;
        return `
        <div style="border: 1px solid #cbd5e1; border-radius: 6px; padding: 6px 8px; background: #f8fafc;">
          <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #e2e8f0; padding-bottom: 3px; margin-bottom: 4px; font-weight: bold;">
            <span style="font-size: 11px; color: #0f172a;">${mon} (${tot.count} ${tot.count === 1 ? 'operadora' : 'operadoras'})</span>
            <span style="font-size: 9px; color: #64748b;">Totales Generales</span>
          </div>
          <div style="font-size: 9.5px; font-family: monospace; line-height: 1.4;">
            <div style="display: flex; justify-content: space-between;"><span style="color: #64748b;">Venta Bruta:</span><span>${formatCurrency(tot.venta, mon as any)}</span></div>
            <div style="display: flex; justify-content: space-between;"><span style="color: #64748b;">Premios:</span><span style="color: #b45309;">-${formatCurrency(tot.premios, mon as any)}</span></div>
            <div style="display: flex; justify-content: space-between;"><span style="color: #64748b;">Utilidad Bruta (GGR):</span><span style="color: ${tot.ggr >= 0 ? '#047857' : '#b91c1c'}; font-weight: bold;">${formatCurrency(tot.ggr, mon as any)}</span></div>
            <div style="display: flex; justify-content: space-between;"><span style="color: #64748b;">Ganancia Comercializador:</span><span style="color: #047857; font-weight: bold;">+${formatCurrency(tot.totalComercializador, mon as any)}</span></div>
            <div style="display: flex; justify-content: space-between;"><span style="color: #64748b;">Utilidad Casa (60%):</span><span style="color: #b45309;">${formatCurrency(tot.netoOperadora, mon as any)}</span></div>
            <div style="display: flex; justify-content: space-between;"><span style="color: #64748b;">Arrastre Inicial:</span><span>${formatCurrency(tot.saldoInit, mon as any)}</span></div>
            <div style="display: flex; justify-content: space-between; border-top: 1px solid #cbd5e1; padding-top: 3px; margin-top: 3px; font-weight: bold;">
              <span>Balance Final Neto:</span>
              <span style="color: ${isDeuda ? '#b91c1c' : isFavor ? '#047857' : '#0f172a'}; font-size: 10px;">${formatCurrency(tot.balanceFinal, mon as any)}</span>
            </div>
          </div>
        </div>
      `;
      })
      .join('');

    doc.open();
    doc.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Acta_PreCierre_Casas_Operadoras_Semana_${systemCycle.semana}_${systemCycle.desde}_al_${systemCycle.hasta}</title>
          <style>
            @page {
              size: landscape;
              margin: 8mm;
            }
            * {
              box-sizing: border-box;
              margin: 0;
              padding: 0;
            }
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
              color: #0f172a;
              background: #ffffff;
              padding: 4px;
              font-size: 10px;
            }
            .header-wrap {
              text-align: center;
              border-bottom: 2px solid #0f172a;
              padding-bottom: 6px;
              margin-bottom: 10px;
            }
            .company-name {
              font-size: 14px;
              font-weight: 900;
              letter-spacing: 0.5px;
              text-transform: uppercase;
            }
            .acta-title {
              font-size: 12px;
              font-weight: 800;
              color: #d97706;
              margin-top: 2px;
              text-transform: uppercase;
            }
            .meta-row {
              display: flex;
              justify-content: space-between;
              margin-top: 6px;
              font-size: 9.5px;
              color: #475569;
            }
            .summary-cards-grid {
              display: grid;
              grid-template-columns: repeat(3, 1fr);
              gap: 8px;
              margin-bottom: 10px;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              font-size: 9px;
              margin-bottom: 10px;
            }
            th {
              background: #f1f5f9;
              border-top: 1px solid #cbd5e1;
              border-bottom: 1.5px solid #0f172a;
              padding: 4px 5px;
              font-weight: 800;
              text-transform: uppercase;
              font-size: 8.5px;
            }
            td {
              border-bottom: 1px solid #e2e8f0;
              padding: 3.5px 5px;
              font-family: monospace;
              font-size: 9px;
            }
            .statement-card {
              border: 1px solid #cbd5e1;
              border-radius: 6px;
              padding: 6px 10px;
              background: #f8fafc;
              font-size: 8.5px;
              line-height: 1.35;
              margin-bottom: 14px;
            }
            .signatures-row {
              display: grid;
              grid-template-columns: repeat(3, 1fr);
              gap: 20px;
              text-align: center;
              margin-top: 14px;
              page-break-inside: avoid;
            }
            .sig-line {
              border-top: 1.2px solid #0f172a;
              padding-top: 3px;
              font-weight: bold;
              font-size: 9.5px;
            }
            .sig-role {
              font-size: 8.5px;
              color: #475569;
            }
          </style>
        </head>
        <body>
          <div class="header-wrap">
            <div class="company-name">${companyName}</div>
            <div class="acta-title">ACTA OFICIAL DE ARQUEO Y PRE-CIERRE DE CASAS OPERADORAS</div>
            <div style="font-size: 10px; font-weight: bold; color: #334155; margin-top: 2px;">
              MODELO DUAL OPCIÓN B • PARTICIPACIÓN (40%) + DIFERENCIAL COMISIÓN
            </div>
            <div class="meta-row">
              <span><strong>Ciclo:</strong> ${systemCycle.tipo === 'SEMANAL' ? 'Semana' : 'Ciclo'} ${systemCycle.semana} (${formatDate(systemCycle.desde)} al ${formatDate(systemCycle.hasta)})</span>
              <span><strong>Comercializador:</strong> ${userName}</span>
              <span><strong>Fecha de Emisión:</strong> ${todayFormatted}</span>
            </div>
          </div>

          <div class="summary-cards-grid">
            ${summariesHtml}
          </div>

          <table>
            <thead>
              <tr>
                <th style="text-align: left;">Casa Operadora</th>
                <th style="text-align: center;">Moneda</th>
                <th style="text-align: right;">Venta</th>
                <th style="text-align: right;">Premios</th>
                <th style="text-align: right;">GGR</th>
                <th style="text-align: right;">Dif. Com</th>
                <th style="text-align: right;">Part. 40%</th>
                <th style="text-align: right; background: #e2e8f0;">Total Comercializador</th>
                <th style="text-align: right;">Util. Casa (60%)</th>
                <th style="text-align: right;">Arrastre</th>
                <th style="text-align: right;">Pagos Netos</th>
                <th style="text-align: right;">Balance Final</th>
                <th style="text-align: center;">Estado</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>

          <div class="statement-card">
            <strong>CERTIFICACIÓN Y CONCILIACIÓN OPERATIVA:</strong>
            La presente Acta Oficial certifica la posición contable, ventas, premios liquidados y saldos de arrastre de cada Casa Operadora (Proveedor) para el ciclo correspondiente. Los balances expresados representan el compromiso contractual liquidable entre las partes conforme al modelo de participación acordado.
          </div>

          <div class="signatures-row">
            <div>
              <div class="sig-line">ADMINISTRACIÓN / COMERCIALIZADOR</div>
              <div class="sig-role">${userName}</div>
              <div style="font-size: 8px; color: #94a3b8; margin-top: 15px;">Firma y Sello</div>
            </div>
            <div>
              <div class="sig-line">AUDITORÍA Y CONTROL DE GESTIÓN</div>
              <div class="sig-role">Revisión y Cuadre de Arqueo</div>
              <div style="font-size: 8px; color: #94a3b8; margin-top: 15px;">Firma y Sello</div>
            </div>
            <div>
              <div class="sig-line">REPRESENTANTE CASA MATRIZ / PROVEEDOR</div>
              <div class="sig-role">Conformidad de Liquidación</div>
              <div style="font-size: 8px; color: #94a3b8; margin-top: 15px;">Firma y Sello</div>
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
      }, 2000);
    }, 300);
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-[#0D1B22] border border-slate-200 dark:border-slate-800 rounded-3xl max-w-5xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden text-slate-900 dark:text-white">
        {/* Header Modal Bar */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-[#08151D]">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-black uppercase tracking-wider font-mono">
                Acta Oficial de Arqueo y Pre-Cierre • Casas Operadoras
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Semana {systemCycle.semana} ({formatDate(systemCycle.desde)} al {formatDate(systemCycle.hasta)}) • Vista previa para Impresión / PDF
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs uppercase tracking-wider flex items-center gap-1.5 shadow-md shadow-amber-500/20 transition-all cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Imprimir / Guardar en PDF</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Preview Container */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 bg-slate-100 dark:bg-[#071318]">
          {/* Printable Document Paper Card */}
          <div className="bg-white dark:bg-[#0D1B22] border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-8 shadow-sm space-y-6">
            {/* Header Document */}
            <div className="text-center pb-4 border-b-2 border-slate-900 dark:border-slate-700 space-y-1">
              <div className="text-base font-black uppercase tracking-wide text-slate-900 dark:text-white">
                {companyName}
              </div>
              <div className="text-sm font-extrabold text-amber-600 dark:text-amber-400 uppercase tracking-wider font-mono">
                Acta Oficial de Arqueo y Pre-Cierre de Casas Operadoras
              </div>
              <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 font-mono">
                Modelo Dual Opción B • Participación 40% + Diferencial Comisión
              </div>
              <div className="flex flex-wrap justify-between items-center pt-2 text-xs text-slate-600 dark:text-slate-400">
                <span><strong>Período:</strong> Semana {systemCycle.semana} ({formatDate(systemCycle.desde)} al {formatDate(systemCycle.hasta)})</span>
                <span><strong>Comercializador:</strong> {userName}</span>
                <span><strong>Emisión:</strong> {todayFormatted}</span>
              </div>
            </div>

            {/* Summaries Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {['BS', 'USD', 'COP'].map((mon) => {
                const tot = totalsByCurrency[mon];
                if (!tot || (tot.count === 0 && tot.venta === 0 && Math.abs(tot.balanceFinal) < 0.01)) return null;
                const flag = mon === 'BS' ? '🇻🇪' : mon === 'USD' ? '🇺🇸' : '🇨🇴';
                const isDeuda = tot.balanceFinal > 0.01;
                const isFavor = tot.balanceFinal < -0.01;

                return (
                  <div key={`modal_tot_${mon}`} className="bg-slate-50 dark:bg-[#071318] border border-slate-200 dark:border-slate-800/80 rounded-xl p-3 space-y-1 text-xs font-mono">
                    <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-800 pb-1 font-bold">
                      <span className="text-slate-900 dark:text-white flex items-center gap-1">
                        <span>{flag}</span> {mon}
                      </span>
                      <span className="text-[10px] text-slate-500 font-sans">{tot.count} operadoras</span>
                    </div>
                    <div className="space-y-0.5 text-[11px] pt-1">
                      <div className="flex justify-between text-slate-600 dark:text-slate-400">
                        <span>Venta Bruta:</span>
                        <span className="text-slate-900 dark:text-slate-200">{formatCurrency(tot.venta, mon as any)}</span>
                      </div>
                      <div className="flex justify-between text-slate-600 dark:text-slate-400">
                        <span>Premios:</span>
                        <span className="text-amber-600 dark:text-amber-400">-{formatCurrency(tot.premios, mon as any)}</span>
                      </div>
                      <div className="flex justify-between text-slate-600 dark:text-slate-400">
                        <span>GGR:</span>
                        <span className={`font-bold ${tot.ggr >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>{formatCurrency(tot.ggr, mon as any)}</span>
                      </div>
                      <div className="flex justify-between text-slate-600 dark:text-slate-400">
                        <span>Ganancia Com:</span>
                        <span className="text-emerald-600 dark:text-emerald-400 font-bold">+{formatCurrency(tot.totalComercializador, mon as any)}</span>
                      </div>
                      <div className="flex justify-between text-slate-600 dark:text-slate-400">
                        <span>Util. Casa (60%):</span>
                        <span className="text-amber-600 dark:text-amber-400 font-semibold">{formatCurrency(tot.netoOperadora, mon as any)}</span>
                      </div>
                      <div className="flex justify-between pt-1 border-t border-slate-200 dark:border-slate-800 font-bold">
                        <span className="text-slate-900 dark:text-white">Balance Final:</span>
                        <span className={isDeuda ? 'text-rose-600 dark:text-rose-400' : isFavor ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-700 dark:text-slate-300'}>
                          {formatCurrency(tot.balanceFinal, mon as any)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Detailed Table */}
            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-100 dark:bg-[#071217] text-slate-700 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800 font-bold uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="py-2.5 px-3">Casa Operadora</th>
                    <th className="py-2.5 px-2 text-center">Moneda</th>
                    <th className="py-2.5 px-2.5 text-right">Venta</th>
                    <th className="py-2.5 px-2.5 text-right">Premios</th>
                    <th className="py-2.5 px-2.5 text-right">GGR</th>
                    <th className="py-2.5 px-2.5 text-right">Dif. Com</th>
                    <th className="py-2.5 px-2.5 text-right">Part. 40%</th>
                    <th className="py-2.5 px-2.5 text-right text-emerald-600 dark:text-emerald-400">Ganancia Com.</th>
                    <th className="py-2.5 px-2.5 text-right">Util. Casa (60%)</th>
                    <th className="py-2.5 px-2.5 text-right">Arrastre</th>
                    <th className="py-2.5 px-2.5 text-right">Pagos Netos</th>
                    <th className="py-2.5 px-3 text-right font-black">Balance Final</th>
                    <th className="py-2.5 px-2 text-center">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800/80 font-mono text-[11px]">
                  {operatorGroups.map((group) => {
                    return (
                      <React.Fragment key={`doc_group_${group.sistema}`}>
                        <tr className="bg-slate-100/90 dark:bg-[#050E13] font-bold">
                          <td colSpan={13} className="py-2 px-3 text-slate-900 dark:text-white font-sans text-xs">
                            🌐 <strong>{group.sistema}</strong> ({group.rows.length} {group.rows.length === 1 ? 'Moneda' : 'Monedas Activas'})
                          </td>
                        </tr>
                        {group.rows.map((r) => {
                          const isDeuda = r.balanceFinal > 0.01;
                          const isFavor = r.balanceFinal < -0.01;
                          const flag = r.moneda === 'BS' ? '🇻🇪' : r.moneda === 'USD' ? '🇺🇸' : '🇨🇴';

                          return (
                            <tr key={`doc_row_${r.sistema}_${r.moneda}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                              <td className="py-2 px-3 pl-6 font-sans text-slate-600 dark:text-slate-300">↳ {r.sistema}</td>
                              <td className="py-2 px-2 text-center font-bold">
                                <span className="inline-flex items-center gap-1">
                                  <span>{flag}</span>
                                  <span>{r.moneda}</span>
                                </span>
                              </td>
                              <td className="py-2 px-2.5 text-right text-slate-900 dark:text-slate-200">{formatCurrency(r.venta, r.moneda as any)}</td>
                              <td className="py-2 px-2.5 text-right text-amber-600 dark:text-amber-400">{r.premio > 0 ? `-${formatCurrency(r.premio, r.moneda as any)}` : '-'}</td>
                              <td className={`py-2 px-2.5 text-right font-bold ${r.utilidadBruta >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>{formatCurrency(r.utilidadBruta, r.moneda as any)}</td>
                              <td className="py-2 px-2.5 text-right text-cyan-600 dark:text-cyan-400 font-semibold">{formatCurrency(r.difCom, r.moneda as any)}</td>
                              <td className={`py-2 px-2.5 text-right font-semibold ${r.partCom >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>{formatCurrency(r.partCom, r.moneda as any)}</td>
                              <td className="py-2 px-2.5 text-right font-black text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/5">{formatCurrency(r.totalCom, r.moneda as any)}</td>
                              <td className={`py-2 px-2.5 text-right font-bold ${r.netoOperadora >= 0 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400'}`}>{formatCurrency(r.netoOperadora, r.moneda as any)}</td>
                              <td className="py-2 px-2.5 text-right text-slate-600 dark:text-slate-400">{formatCurrency(r.saldoInit, r.moneda as any)}</td>
                              <td className="py-2 px-2.5 text-right text-cyan-600 dark:text-cyan-400">{r.pagosNetos !== 0 ? `-${formatCurrency(r.pagosNetos, r.moneda as any)}` : '-'}</td>
                              <td className={`py-2 px-3 text-right font-black ${isDeuda ? 'text-rose-600 dark:text-rose-400' : isFavor ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-700 dark:text-slate-300'}`}>{formatCurrency(r.balanceFinal, r.moneda as any)}</td>
                              <td className="py-2 px-2 text-center">
                                <span className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase ${
                                  isDeuda
                                    ? 'bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-400'
                                    : isFavor
                                    ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400'
                                    : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-400'
                                }`}>
                                  {isDeuda ? 'A Pagar' : isFavor ? 'A Favor' : 'Solvente'}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Certificación Legal */}
            <div className="p-3.5 bg-slate-50 dark:bg-[#071318] border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-600 dark:text-slate-400 leading-relaxed font-sans">
              <strong>CERTIFICACIÓN Y CONCILIACIÓN OPERATIVA:</strong> La presente Acta Oficial certifica la posición contable, ventas brutas, premios liquidados y saldos de arrastre de cada Casa Operadora para el ciclo auditado. Los balances reflejan la posición final bajo el Modelo Dual Opción B.
            </div>

            {/* Signatures */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-6 text-center font-sans">
              <div className="space-y-1">
                <div className="border-t-2 border-slate-900 dark:border-slate-400 pt-2 font-bold text-xs text-slate-900 dark:text-white">
                  ADMINISTRACIÓN / COMERCIALIZADOR
                </div>
                <div className="text-[11px] text-slate-500">{userName}</div>
              </div>
              <div className="space-y-1">
                <div className="border-t-2 border-slate-900 dark:border-slate-400 pt-2 font-bold text-xs text-slate-900 dark:text-white">
                  AUDITORÍA Y CONTROL FINANCIERO
                </div>
                <div className="text-[11px] text-slate-500">Revisión y Arqueo</div>
              </div>
              <div className="space-y-1">
                <div className="border-t-2 border-slate-900 dark:border-slate-400 pt-2 font-bold text-xs text-slate-900 dark:text-white">
                  REPRESENTANTE CASA MATRIZ
                </div>
                <div className="text-[11px] text-slate-500">Conformidad Operativa</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
