import React from 'react';
import { formatCurrency } from '../../utils/formatters';
import { Printer, X, ShieldCheck } from 'lucide-react';

export interface PreClosureAgencyRow {
  ag_id: number;
  entidad: string;
  moneda: 'BS' | 'USD' | 'COP';
  saldo_anterior: number;
  venta_bruta: number;
  comision: number;
  premios_taquilla: number;
  venta_neta: number;
  gastos: number;
  cobrador_ruta: number;
  cobrador_liquidado?: number;
  cobrador_en_ruta?: number;
  efectivo_taquilla: number;
  bancos: number;
  reposicion_premios: number;
  pagos_netos: number;
  saldo_final: number;
  status: 'pagado' | 'pendiente' | 'favor';
}

interface DeliveryReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  systemCycle: { semana: string; desde: string; hasta: string; tipo: string };
  userName?: string;
  companyName?: string;
  auditRows: PreClosureAgencyRow[];
  totalsByCurrency: Record<string, {
    saldoAnterior: number;
    ventaNeta: number;
    gastos: number;
    cobradorRuta: number;
    cobradorLiquidado?: number;
    cobradorEnRuta?: number;
    efectivoTaquilla: number;
    bancos: number;
    reposicionPremios: number;
    saldoFinal: number;
  }>;
}

export const DeliveryReportModal: React.FC<DeliveryReportModalProps> = ({
  isOpen,
  onClose,
  systemCycle,
  userName = 'Administración',
  companyName = 'CORPORACION CALENDARIO, CA',
  auditRows,
  totalsByCurrency,
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

    const rowsHtml = auditRows
      .map(
        (r) => `
      <tr>
        <td style="text-align: left; font-weight: bold;">${r.entidad}</td>
        <td style="text-align: center; font-weight: bold;">${r.moneda}</td>
        <td style="text-align: right;">${formatCurrency(r.saldo_anterior, r.moneda)}</td>
        <td style="text-align: right; color: ${r.venta_neta >= 0 ? '#047857' : '#b91c1c'}; font-weight: 600;">${formatCurrency(r.venta_neta, r.moneda)}</td>
        <td style="text-align: right; color: #b91c1c;">${r.gastos > 0 ? formatCurrency(r.gastos, r.moneda) : '-'}</td>
        <td style="text-align: right; color: #d97706; font-weight: 600;">${r.cobrador_en_ruta && r.cobrador_en_ruta > 0 ? formatCurrency(r.cobrador_en_ruta, r.moneda) : '-'}</td>
        <td style="text-align: right; color: #059669; font-weight: 600;">${r.cobrador_liquidado && r.cobrador_liquidado > 0 ? formatCurrency(r.cobrador_liquidado, r.moneda) : '-'}</td>
        <td style="text-align: right; color: #0284c7;">${r.efectivo_taquilla > 0 ? formatCurrency(r.efectivo_taquilla, r.moneda) : '-'}</td>
        <td style="text-align: right; color: #0f766e;">${r.bancos > 0 ? formatCurrency(r.bancos, r.moneda) : '-'}</td>
        <td style="text-align: right; color: #b45309; font-weight: bold;">${r.reposicion_premios > 0 ? `+${formatCurrency(r.reposicion_premios, r.moneda)}` : '-'}</td>
        <td style="text-align: right; font-weight: 900; color: ${r.saldo_final >= 0 ? '#047857' : '#b91c1c'};">${formatCurrency(r.saldo_final, r.moneda)}</td>
      </tr>
    `
      )
      .join('');

    const summariesHtml = ['BS', 'USD', 'COP']
      .map((mon) => {
        const d = totalsByCurrency[mon];
        if (!d) return '';
        return `
        <div style="border: 1px solid #cbd5e1; border-radius: 6px; padding: 6px 8px; background: #f8fafc;">
          <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #e2e8f0; padding-bottom: 3px; margin-bottom: 4px; font-weight: bold;">
            <span style="font-size: 11px; color: #0f172a;">${mon}</span>
            <span style="font-size: 9px; color: #64748b;">Consolidado</span>
          </div>
          <div style="font-size: 9.5px; font-family: monospace; line-height: 1.4;">
            <div style="display: flex; justify-content: space-between;"><span style="color: #64748b;">Arrastre:</span><span>${formatCurrency(d.saldoAnterior, mon as any)}</span></div>
            <div style="display: flex; justify-content: space-between;"><span style="color: #64748b;">Venta Neta:</span><span>${formatCurrency(d.ventaNeta, mon as any)}</span></div>
            <div style="display: flex; justify-content: space-between;"><span style="color: #64748b;">Gastos:</span><span style="color: #b91c1c;">${formatCurrency(d.gastos, mon as any)}</span></div>
            ${(d.cobradorEnRuta || 0) > 0 ? `<div style="display: flex; justify-content: space-between;"><span style="color: #d97706;">En Ruta:</span><span style="color: #d97706; font-weight: bold;">${formatCurrency(d.cobradorEnRuta || 0, mon as any)}</span></div>` : ''}
            ${(d.cobradorLiquidado || 0) > 0 ? `<div style="display: flex; justify-content: space-between;"><span style="color: #059669;">Liquidado Admin:</span><span style="color: #059669; font-weight: bold;">${formatCurrency(d.cobradorLiquidado || 0, mon as any)}</span></div>` : ''}
            ${d.efectivoTaquilla > 0 ? `<div style="display: flex; justify-content: space-between;"><span style="color: #64748b;">Efec Taquilla:</span><span style="color: #0284c7;">${formatCurrency(d.efectivoTaquilla, mon as any)}</span></div>` : ''}
            ${d.bancos > 0 ? `<div style="display: flex; justify-content: space-between;"><span style="color: #64748b;">Bancos:</span><span style="color: #0f766e;">${formatCurrency(d.bancos, mon as any)}</span></div>` : ''}
            ${d.reposicionPremios > 0 ? `<div style="display: flex; justify-content: space-between;"><span style="color: #64748b;">Reposición:</span><span style="color: #b45309; font-weight: bold;">+${formatCurrency(d.reposicionPremios, mon as any)}</span></div>` : ''}
            <div style="display: flex; justify-content: space-between; border-top: 1px solid #cbd5e1; padding-top: 2px; margin-top: 2px; font-weight: bold;">
              <span>Saldo Final:</span>
              <span style="color: ${d.saldoFinal >= 0 ? '#047857' : '#b91c1c'};">${formatCurrency(d.saldoFinal, mon as any)}</span>
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
          <title>Acta_Oficial_Entrega_${systemCycle.semana}_${systemCycle.desde}_al_${systemCycle.hasta}</title>
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
              color: #b45309;
              margin-top: 2px;
              text-transform: uppercase;
            }
            .cycle-badge {
              font-size: 10px;
              font-weight: bold;
              color: #334155;
            }
            .meta-row {
              display: flex;
              justify-content: space-between;
              margin-top: 6px;
              font-size: 9.5px;
              color: #475569;
            }
            .section-header {
              font-size: 10px;
              font-weight: 800;
              text-transform: uppercase;
              border-bottom: 1px solid #94a3b8;
              padding-bottom: 2px;
              margin-top: 8px;
              margin-bottom: 6px;
              color: #1e293b;
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
              font-size: 9.5px;
              margin-bottom: 10px;
            }
            th {
              background: #f1f5f9;
              border-top: 1px solid #cbd5e1;
              border-bottom: 1.5px solid #0f172a;
              padding: 4px 5px;
              font-weight: 800;
              text-transform: uppercase;
              font-size: 9px;
            }
            td {
              border-bottom: 1px solid #e2e8f0;
              padding: 3.5px 5px;
              font-family: monospace;
              font-size: 9.5px;
            }
            .statement-card {
              border: 1px solid #cbd5e1;
              border-radius: 6px;
              padding: 6px 10px;
              background: #f8fafc;
              font-size: 9px;
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
            .sig-ci {
              font-size: 8.5px;
              color: #64748b;
              margin-top: 6px;
            }
          </style>
        </head>
        <body>
          <div class="header-wrap">
            <div class="company-name">MULTIBANCA EXPRESS</div>
            <div class="acta-title">ACTA OFICIAL DE ENTREGA, ARQUEO Y RECEPCIÓN DE FONDOS</div>
            <div class="cycle-badge">
              ${systemCycle.tipo === 'SEMANAL' ? `SEMANA ${systemCycle.semana}` : `CICLO ${systemCycle.semana}`} (${systemCycle.desde} AL ${systemCycle.hasta})
            </div>
            <div class="meta-row">
              <span><strong>Suscriptor:</strong> ${companyName}</span>
              <span><strong>Emisión:</strong> ${todayFormatted}</span>
              <span><strong>Auditor Responsable:</strong> ${userName}</span>
            </div>
          </div>

          <div class="section-header">1. RESUMEN CONSOLIDADO DE MOVIMIENTOS Y RENDICIÓN</div>
          <div class="summary-cards-grid">
            ${summariesHtml}
          </div>

          <div class="section-header">2. DESGLOSE INDIVIDUAL DE PUNTOS DE VENTA (AGENCIAS)</div>
          <table>
            <thead>
              <tr>
                <th style="text-align: left;">Agencia</th>
                <th style="text-align: center;">Mon</th>
                <th style="text-align: right;">Arrastre</th>
                <th style="text-align: right;">Vta Neta</th>
                <th style="text-align: right;">Gastos</th>
                <th style="text-align: right; color: #d97706;">🛵 En Ruta</th>
                <th style="text-align: right; color: #059669;">🏛️ Liquidado Admin</th>
                <th style="text-align: right;">💵 Efectivo</th>
                <th style="text-align: right;">🏛️ Bancos</th>
                <th style="text-align: right;">🏆 Reposición</th>
                <th style="text-align: right;">Saldo Final</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>

          <div class="statement-card">
            <strong>DECLARACIÓN DE CONFORMIDAD Y AUDITORÍA:</strong><br/>
            Por medio de la presente acta se hace constar la verificación formal de los cobros en efectivo recaudados por cobradores de ruta, entregas directas en taquillas, transferencias bancarias y reposiciones de premios correspondientes al ciclo auditado, declarando plena conformidad con los saldos de arrastre resultantes que serán traspasados al siguiente período.
          </div>

          <div class="signatures-row">
            <div>
              <div class="sig-line">ENTREGADO POR</div>
              <div class="sig-role">Operador de Confirmaciones</div>
              <div class="sig-ci">C.I: ____________________</div>
            </div>
            <div>
              <div class="sig-line">RECIBIDO POR</div>
              <div class="sig-role">Caja Central / Administración</div>
              <div class="sig-ci">C.I: ____________________</div>
            </div>
            <div>
              <div class="sig-line">AUDITADO POR</div>
              <div class="sig-role">Contabilidad / Auditoría</div>
              <div class="sig-ci">C.I: ____________________</div>
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
        if (document.body.contains(iframe)) {
          document.body.removeChild(iframe);
        }
      }, 1500);
    }, 250);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 overflow-y-auto animate-fade-in">
      <div className="bg-[#0D1B22] border border-amber-500/30 rounded-3xl max-w-4xl w-full p-6 sm:p-8 shadow-2xl space-y-6 relative overflow-hidden">
        {/* Modal Action Bar */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-amber-500/15 text-amber-400 border border-amber-500/30">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-black text-white">
                Acta Oficial de Entrega y Arqueo de Fondos
              </h3>
              <p className="text-xs text-slate-400">
                Documento legal de rendición y traspaso de fondos del ciclo operativo.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-extrabold text-xs shadow-lg shadow-emerald-500/20 flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Imprimir / Guardar PDF</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              title="Cerrar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* PREVIEW DOCUMENT BODY */}
        <div className="space-y-6 font-sans text-xs text-slate-200">
          {/* Document Header */}
          <div className="text-center border-b-2 border-slate-700 pb-4 space-y-1">
            <div className="text-base sm:text-lg font-black tracking-wider uppercase text-white">
              MULTIBANCA EXPRESS
            </div>
            <div className="text-sm font-bold text-amber-400 uppercase">
              ACTA OFICIAL DE ENTREGA, ARQUEO Y RECEPCIÓN DE FONDOS
            </div>
            <div className="text-xs font-mono font-bold text-slate-300">
              {systemCycle.tipo === 'SEMANAL' ? `SEMANA ${systemCycle.semana}` : `CICLO DIARIO ${systemCycle.semana}`} ({systemCycle.desde} AL {systemCycle.hasta})
            </div>
            <div className="text-[11px] text-slate-400 flex justify-between pt-2">
              <span><strong>Suscriptor:</strong> {companyName}</span>
              <span><strong>Emisión:</strong> {todayFormatted}</span>
              <span><strong>Auditor Responsable:</strong> {userName}</span>
            </div>
          </div>

          {/* Section 1: Executive Summary */}
          <div className="space-y-2">
            <h4 className="text-xs font-black uppercase tracking-wider text-amber-400 border-b border-slate-800 pb-1">
              1. RESUMEN CONSOLIDADO DE MOVIMIENTOS Y RENDICIÓN
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {['BS', 'USD', 'COP'].map((mon) => {
                const data = totalsByCurrency[mon];
                if (!data) return null;

                return (
                  <div
                    key={mon}
                    className="p-3 rounded-2xl bg-[#071217] border border-slate-800 space-y-1.5"
                  >
                    <div className="flex justify-between items-center border-b border-slate-800/80 pb-1">
                      <span className="font-extrabold text-amber-400">{mon}</span>
                      <span className="text-[10px] text-slate-400 font-mono">Consolidado</span>
                    </div>

                    <div className="text-[11px] space-y-0.5 font-mono">
                      <div className="flex justify-between">
                        <span className="text-slate-400">Arrastre Inicial:</span>
                        <span>{formatCurrency(data.saldoAnterior, mon as any)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Venta Neta:</span>
                        <span className={data.ventaNeta >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                          {formatCurrency(data.ventaNeta, mon as any)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Gastos:</span>
                        <span className="text-rose-400">{formatCurrency(data.gastos, mon as any)}</span>
                      </div>
                      {(data.cobradorEnRuta || 0) > 0 && (
                        <div className="flex justify-between">
                          <span className="text-amber-400/90">🛵 En Ruta:</span>
                          <span className="text-amber-400 font-bold">{formatCurrency(data.cobradorEnRuta || 0, mon as any)}</span>
                        </div>
                      )}
                      {(data.cobradorLiquidado || 0) > 0 && (
                        <div className="flex justify-between">
                          <span className="text-emerald-400/90">🏛️ Liquidado Admin:</span>
                          <span className="text-emerald-400 font-bold">{formatCurrency(data.cobradorLiquidado || 0, mon as any)}</span>
                        </div>
                      )}
                      {data.efectivoTaquilla > 0 && (
                        <div className="flex justify-between">
                          <span className="text-slate-400">Efectivo Taquilla:</span>
                          <span className="text-sky-300">{formatCurrency(data.efectivoTaquilla, mon as any)}</span>
                        </div>
                      )}
                      {data.bancos > 0 && (
                        <div className="flex justify-between">
                          <span className="text-slate-400">Bancos (Cobros):</span>
                          <span className="text-cyan-400">{formatCurrency(data.bancos, mon as any)}</span>
                        </div>
                      )}
                      {data.reposicionPremios > 0 && (
                        <div className="flex justify-between">
                          <span className="text-slate-400">Reposición Premios:</span>
                          <span className="text-amber-400 font-bold">+{formatCurrency(data.reposicionPremios, mon as any)}</span>
                        </div>
                      )}
                      <div className="flex justify-between pt-1 border-t border-slate-800 font-bold">
                        <span className="text-slate-300">Saldo Final:</span>
                        <span className={data.saldoFinal >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                          {formatCurrency(data.saldoFinal, mon as any)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Section 2: Detailed Matrix */}
          <div className="space-y-2">
            <h4 className="text-xs font-black uppercase tracking-wider text-amber-400 border-b border-slate-800 pb-1">
              2. DESGLOSE INDIVIDUAL DE PUNTOS DE VENTA (AGENCIAS)
            </h4>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-[11px] border-collapse">
                <thead>
                  <tr className="border-b border-slate-700 bg-slate-900/60 text-slate-300 font-bold uppercase">
                    <th className="py-2 px-2">Agencia</th>
                    <th className="py-2 px-1 text-center">Mon</th>
                    <th className="py-2 px-2 text-right">Arrastre</th>
                    <th className="py-2 px-2 text-right">Vta Neta</th>
                    <th className="py-2 px-2 text-right">Gastos</th>
                    <th className="py-2 px-2 text-right text-amber-400">🛵 En Ruta</th>
                    <th className="py-2 px-2 text-right text-emerald-400">🏛️ Liq. Admin</th>
                    <th className="py-2 px-2 text-right text-sky-300">💵 Efectivo</th>
                    <th className="py-2 px-2 text-right text-cyan-400">🏛️ Bancos</th>
                    <th className="py-2 px-2 text-right text-amber-400">🏆 Reposición</th>
                    <th className="py-2 px-2 text-right font-black">Saldo Final</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 font-mono">
                  {auditRows.map((r, idx) => (
                    <tr key={`${r.entidad}_${r.moneda}_${idx}`} className="hover:bg-slate-800/20">
                      <td className="py-1.5 px-2 font-sans font-bold text-white truncate max-w-[140px]">
                        {r.entidad}
                      </td>
                      <td className="py-1.5 px-1 text-center text-slate-400 font-bold">
                        {r.moneda}
                      </td>
                      <td className="py-1.5 px-2 text-right text-slate-400">
                        {formatCurrency(r.saldo_anterior, r.moneda)}
                      </td>
                      <td className={`py-1.5 px-2 text-right ${r.venta_neta >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {formatCurrency(r.venta_neta, r.moneda)}
                      </td>
                      <td className="py-1.5 px-2 text-right text-rose-400">
                        {r.gastos > 0 ? formatCurrency(r.gastos, r.moneda) : '-'}
                      </td>
                      <td className="py-1.5 px-2 text-right text-amber-400">
                        {r.cobrador_en_ruta && r.cobrador_en_ruta > 0 ? formatCurrency(r.cobrador_en_ruta, r.moneda) : '-'}
                      </td>
                      <td className="py-1.5 px-2 text-right text-emerald-400 font-bold">
                        {r.cobrador_liquidado && r.cobrador_liquidado > 0 ? formatCurrency(r.cobrador_liquidado, r.moneda) : '-'}
                      </td>
                      <td className="py-1.5 px-2 text-right text-sky-300">
                        {r.efectivo_taquilla > 0 ? formatCurrency(r.efectivo_taquilla, r.moneda) : '-'}
                      </td>
                      <td className="py-1.5 px-2 text-right text-cyan-400">
                        {r.bancos > 0 ? formatCurrency(r.bancos, r.moneda) : '-'}
                      </td>
                      <td className="py-1.5 px-2 text-right text-amber-400 font-bold">
                        {r.reposicion_premios > 0 ? `+${formatCurrency(r.reposicion_premios, r.moneda)}` : '-'}
                      </td>
                      <td className={`py-1.5 px-2 text-right font-black ${r.saldo_final >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {formatCurrency(r.saldo_final, r.moneda)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Section 3: Conformity Statement */}
          <div className="p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800 text-[11px] leading-relaxed">
            <strong>DECLARACIÓN DE CONFORMIDAD Y AUDITORÍA:</strong>
            <p className="text-slate-300 mt-1">
              Por medio de la presente acta se hace constar la verificación formal de los cobros en efectivo recaudados por cobradores de ruta, entregas directas en taquillas, transferencias bancarias y reposiciones de premios correspondientes al ciclo auditado, declarando plena conformidad con los saldos de arrastre resultantes que serán traspasados al siguiente período.
            </p>
          </div>

          {/* Section 4: Signatures */}
          <div className="pt-8 grid grid-cols-3 gap-6 text-center text-[11px]">
            <div className="space-y-1">
              <div className="border-t border-slate-500 pt-1 font-bold text-white">
                ENTREGADO POR
              </div>
              <div className="text-slate-400 text-[10px]">Operador de Confirmaciones</div>
              <div className="text-[10px] text-slate-500 pt-3">C.I: ____________________</div>
            </div>

            <div className="space-y-1">
              <div className="border-t border-slate-500 pt-1 font-bold text-white">
                RECIBIDO POR
              </div>
              <div className="text-slate-400 text-[10px]">Caja Central / Administración</div>
              <div className="text-[10px] text-slate-500 pt-3">C.I: ____________________</div>
            </div>

            <div className="space-y-1">
              <div className="border-t border-slate-500 pt-1 font-bold text-white">
                AUDITADO POR
              </div>
              <div className="text-slate-400 text-[10px]">Contabilidad / Auditoría</div>
              <div className="text-[10px] text-slate-500 pt-3">C.I: ____________________</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
