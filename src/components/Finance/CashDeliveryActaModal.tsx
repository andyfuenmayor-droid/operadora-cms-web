import React, { useState, useMemo } from 'react';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { Printer, X, Banknote, ShieldCheck, Bike, Building2, Filter, ArrowDownLeft, ArrowUpRight } from 'lucide-react';

export interface CashDeliveryAuditItem {
  id: string;
  fecha: string;
  agencia: string;
  modalidad: 'TAQUILLA' | 'COBRADOR_RUTA';
  tipo: 'ENTRADA' | 'SALIDA'; // ENTRADA = Recaudación; SALIDA = Gasto en efectivo
  referencia: string;
  concepto?: string;
  custodio?: string;
  moneda: 'BS' | 'USD' | 'COP';
  monto: number;
  confirmado_supervisor?: boolean;
  liquidado_admin?: boolean;
}

export interface CashDeliveryActaModalProps {
  isOpen?: boolean;
  onClose: () => void;
  systemCycle: { semana: string; desde: string; hasta: string; tipo: string };
  userName?: string;
  companyName?: string;
  items: CashDeliveryAuditItem[];
}

export const CashDeliveryActaModal: React.FC<CashDeliveryActaModalProps> = ({
  isOpen = true,
  onClose,
  systemCycle,
  userName = 'Supervisor de Caja',
  companyName = 'CORPORACION CALENDARIO, CA',
  items,
}) => {
  const [selectedCurrency, setSelectedCurrency] = useState<'ALL' | 'BS' | 'USD' | 'COP'>('ALL');
  const [selectedChannel, setSelectedChannel] = useState<'ALL' | 'TAQUILLA' | 'COBRADOR_RUTA'>('ALL');

  const todayFormatted = new Date().toLocaleDateString('es-VE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  // Filter items
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchMon = selectedCurrency === 'ALL' || item.moneda === selectedCurrency;
      const matchChan = selectedChannel === 'ALL' || item.modalidad === selectedChannel;
      return matchMon && matchChan;
    });
  }, [items, selectedCurrency, selectedChannel]);

  // Summaries by Channel & Currency
  const channelSummaries = useMemo(() => {
    const res: Record<string, Record<'TAQUILLA' | 'COBRADOR_RUTA', { entradas: number; salidas: number; neto: number; count: number }>> = {
      BS: {
        TAQUILLA: { entradas: 0, salidas: 0, neto: 0, count: 0 },
        COBRADOR_RUTA: { entradas: 0, salidas: 0, neto: 0, count: 0 },
      },
      USD: {
        TAQUILLA: { entradas: 0, salidas: 0, neto: 0, count: 0 },
        COBRADOR_RUTA: { entradas: 0, salidas: 0, neto: 0, count: 0 },
      },
      COP: {
        TAQUILLA: { entradas: 0, salidas: 0, neto: 0, count: 0 },
        COBRADOR_RUTA: { entradas: 0, salidas: 0, neto: 0, count: 0 },
      },
    };

    items.forEach((item) => {
      if (!res[item.moneda]) return;
      const chan = item.modalidad;
      if (item.tipo === 'ENTRADA') {
        res[item.moneda][chan].entradas += item.monto;
      } else {
        res[item.moneda][chan].salidas += item.monto;
      }
      res[item.moneda][chan].count += 1;
      res[item.moneda][chan].neto = Math.round((res[item.moneda][chan].entradas - res[item.moneda][chan].salidas) * 100) / 100;
    });

    return res;
  }, [items]);

  // Global Totals by Currency
  const totalsByCurrency = useMemo(() => {
    const res: Record<string, { entradas: number; salidas: number; totalEntregado: number; count: number }> = {
      BS: { entradas: 0, salidas: 0, totalEntregado: 0, count: 0 },
      USD: { entradas: 0, salidas: 0, totalEntregado: 0, count: 0 },
      COP: { entradas: 0, salidas: 0, totalEntregado: 0, count: 0 },
    };

    items.forEach((item) => {
      if (!res[item.moneda]) return;
      if (item.tipo === 'ENTRADA') {
        res[item.moneda].entradas += item.monto;
      } else {
        res[item.moneda].salidas += item.monto;
      }
      res[item.moneda].count += 1;
      res[item.moneda].totalEntregado = Math.round((res[item.moneda].entradas - res[item.moneda].salidas) * 100) / 100;
    });

    return res;
  }, [items]);

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Por favor permita las ventanas emergentes para imprimir el acta de efectivo.');
      return;
    }

    const htmlContent = `
      <!DOCTYPE html>
      <html lang="es">
        <head>
          <meta charset="utf-8">
          <title>Acta Oficial de Entrega y Rendición de Efectivo en Bóveda - Ciclo ${systemCycle.semana}</title>
          <style>
            @page {
              size: letter landscape;
              margin: 8mm 10mm;
            }
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
              color: #0f172a;
              background: #fff;
              font-size: 9.5px;
              line-height: 1.3;
              margin: 0;
              padding: 0;
            }
            .header-box {
              border-bottom: 2px solid #0f172a;
              padding-bottom: 6px;
              margin-bottom: 8px;
            }
            .company-title {
              font-size: 13px;
              font-weight: 900;
              text-transform: uppercase;
              letter-spacing: 0.5px;
            }
            .doc-title {
              font-size: 11px;
              font-weight: 800;
              color: #047857;
              margin-top: 2px;
            }
            .section-header {
              font-size: 10px;
              font-weight: 800;
              text-transform: uppercase;
              border-bottom: 1.5px solid #0f172a;
              padding-bottom: 2px;
              margin-top: 10px;
              margin-bottom: 6px;
              color: #1e293b;
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
              padding: 3px 5px;
              font-family: monospace;
              font-size: 9px;
            }
            .statement-card {
              border: 1px solid #cbd5e1;
              border-radius: 6px;
              padding: 6px 10px;
              background: #f8fafc;
              font-size: 9px;
              line-height: 1.35;
              margin-bottom: 12px;
            }
            .signatures-row {
              display: grid;
              grid-template-columns: repeat(3, 1fr);
              gap: 20px;
              text-align: center;
              margin-top: 16px;
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
          <div class="header-box">
            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
              <div>
                <div class="company-title">${companyName}</div>
                <div class="doc-title">ACTA OFICIAL DE ENTREGA Y RENDICIÓN DE EFECTIVO EN BÓVEDA / CAJA CENTRAL</div>
                <div style="font-size: 8.5px; color: #64748b; margin-top: 1px;">
                  Arqueo de Efectivo Físico Recaudado en Taquillas y Rutas de Cobranza del Período
                </div>
              </div>
              <div style="text-align: right; font-size: 9px; font-mono;">
                <div><strong>Fecha Emisión:</strong> ${todayFormatted}</div>
                <div><strong>Ciclo:</strong> ${systemCycle.tipo === 'SEMANAL' ? `Semana ${systemCycle.semana}` : `Ciclo ${systemCycle.semana}`}</div>
                <div><strong>Rango:</strong> ${systemCycle.desde} al ${systemCycle.hasta}</div>
              </div>
            </div>
          </div>

          <!-- Section 1: Summary Table by Channel -->
          <div class="section-header">1. RESUMEN DE EFECTIVO ENTREGADO POR CANAL Y MONEDA</div>
          <table>
            <thead>
              <tr>
                <th style="text-align: center;">Moneda</th>
                <th style="text-align: right;">💵 Efectivo Taquilla (Directo)</th>
                <th style="text-align: right;">🛵 Recaudación en Ruta (Cobradores)</th>
                <th style="text-align: right;">📉 Salidas / Gastos Efectivo</th>
                <th style="text-align: right;">Total Efectivo Neto a Bóveda</th>
              </tr>
            </thead>
            <tbody>
              ${Object.entries(totalsByCurrency).map(([mon, t]) => {
                const chan = channelSummaries[mon];
                const taqEntradas = chan?.TAQUILLA?.entradas || 0;
                const cobEntradas = chan?.COBRADOR_RUTA?.entradas || 0;
                return `
                  <tr style="background: #f8fafc; font-weight: bold;">
                    <td style="text-align: center; font-size: 10px;">${mon}</td>
                    <td style="text-align: right; color: #0284c7;">${formatCurrency(taqEntradas, mon as any)}</td>
                    <td style="text-align: right; color: #9333ea;">${formatCurrency(cobEntradas, mon as any)}</td>
                    <td style="text-align: right; color: #b91c1c;">${formatCurrency(t.salidas, mon as any)}</td>
                    <td style="text-align: right; font-size: 10.5px; font-black; color: #047857;">
                      ${formatCurrency(t.totalEntregado, mon as any)}
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>

          <!-- Section 2: Detailed Deliveries -->
          <div class="section-header">2. RELACIÓN DETALLADA DE ENTREGAS DE EFECTIVO (${filteredItems.length})</div>
          <table>
            <thead>
              <tr>
                <th style="text-align: center; width: 25px;">#</th>
                <th style="text-align: center; width: 65px;">Fecha</th>
                <th style="text-align: left;">Agencia de Origen</th>
                <th style="text-align: center; width: 90px;">Modalidad</th>
                <th style="text-align: left;">Recibo / Token QR / Detalle</th>
                <th style="text-align: left;">Custodio / Responsable</th>
                <th style="text-align: center; width: 35px;">Mon</th>
                <th style="text-align: right;">Monto Efectivo</th>
                <th style="text-align: center; width: 75px;">Estatus</th>
              </tr>
            </thead>
            <tbody>
              ${filteredItems.map((r, idx) => `
                <tr>
                  <td style="text-align: center; color: #64748b;">${idx + 1}</td>
                  <td style="text-align: center;">${formatDate(r.fecha)}</td>
                  <td style="font-family: sans-serif; font-weight: bold; text-align: left;">${r.agencia}</td>
                  <td style="text-align: center;">
                    <span style="font-size: 8px; font-weight: 800; text-transform: uppercase; color: ${r.modalidad === 'COBRADOR_RUTA' ? '#7e22ce' : '#0369a1'};">
                      ${r.modalidad === 'COBRADOR_RUTA' ? '🛵 COBRADOR RUTA' : '💵 TAQUILLA'}
                    </span>
                  </td>
                  <td style="text-align: left; font-size: 8.5px; color: #475569;">${r.referencia || r.concepto || '-'}</td>
                  <td style="text-align: left; font-size: 8.5px; color: #334155;">${r.custodio || userName}</td>
                  <td style="text-align: center; font-weight: bold;">${r.moneda}</td>
                  <td style="text-align: right; font-weight: bold; color: ${r.tipo === 'ENTRADA' ? '#047857' : '#b91c1c'};">
                    ${formatCurrency(r.monto, r.moneda)}
                  </td>
                  <td style="text-align: center; font-weight: bold; color: #047857;">RECIBIDO</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <!-- Section 3: Conformity Statement -->
          <div class="statement-card">
            <strong>DECLARACIÓN JURADA DE ARQUEO Y RECEPCIÓN DE VALORES EN FÍSICO:</strong>
            <p style="margin: 3px 0 0 0; color: #334155;">
              Por medio de la presente acta se hace constar la entrega material y física del papel moneda y valores en efectivo recaudados directamente en las cajas taquillas de las agencias y por los cobradores autorizados de ruta durante el ciclo operativo, certificando que el monto total asentado coincide íntegramente con el conteo físico efectuado en presencia de las partes firmantes y ha sido ingresado en la bóveda de Caja Central / Tesorería.
            </p>
          </div>

          <!-- Section 4: Signatures -->
          <div class="signatures-row">
            <div>
              <div class="sig-line">ENTREGADO POR</div>
              <div class="sig-role">Supervisor / Custodio de Efectivo en Ruta</div>
              <div class="sig-ci">C.I: ____________________</div>
            </div>
            <div>
              <div class="sig-line">RECIBIDO POR</div>
              <div class="sig-role">Caja Central / Tesorería</div>
              <div class="sig-ci">C.I: ____________________</div>
            </div>
            <div>
              <div class="sig-line">AUDITADO POR</div>
              <div class="sig-role">Contraloría / Auditoría Interna</div>
              <div class="sig-ci">C.I: ____________________</div>
            </div>
          </div>
        </body>
      </html>
    `;

    printWindow.document.open();
    printWindow.document.write(htmlContent);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-fade-in overflow-y-auto">
      <div className="bg-[#071510] border border-emerald-500/30 rounded-3xl max-w-5xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden relative my-auto">
        {/* Header Modal */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-gradient-to-r from-emerald-950/40 via-slate-900 to-slate-900">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <Banknote className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
                Acta Oficial de Entrega y Rendición de Efectivo
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-mono">
                  {systemCycle.tipo === 'SEMANAL' ? `Semana ${systemCycle.semana}` : `Ciclo ${systemCycle.semana}`}
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Arqueo de billetes y efectivo físico entregado a Caja Central / Tesorería (Taquillas y Cobradores)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-xs shadow-lg shadow-emerald-500/20 flex items-center gap-1.5 transition-all cursor-pointer"
              title="Imprimir o Guardar como PDF"
            >
              <Printer className="w-4 h-4" />
              <span>Imprimir Acta</span>
            </button>

            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
              title="Cerrar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Filter Controls Bar */}
        <div className="p-3 bg-slate-900/90 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
          {/* Currency Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-bold uppercase text-slate-400">Moneda:</span>
            {(['ALL', 'BS', 'USD', 'COP'] as const).map((mon) => (
              <button
                key={mon}
                onClick={() => setSelectedCurrency(mon)}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  selectedCurrency === mon
                    ? 'bg-emerald-500 text-slate-950 font-black'
                    : 'text-slate-400 hover:text-white bg-slate-800/60'
                }`}
              >
                {mon === 'ALL' ? 'Todas' : mon}
              </button>
            ))}
          </div>

          {/* Channel Filter (Taquilla vs Cobradores) */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-bold uppercase text-slate-400">Canal de Efectivo:</span>
            <button
              onClick={() => setSelectedChannel('ALL')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                selectedChannel === 'ALL'
                  ? 'bg-emerald-500 text-slate-950 font-black'
                  : 'text-slate-400 hover:text-white bg-slate-800/60'
              }`}
            >
              Todos ({items.length})
            </button>
            <button
              onClick={() => setSelectedChannel('TAQUILLA')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                selectedChannel === 'TAQUILLA'
                  ? 'bg-sky-500 text-slate-950 font-black'
                  : 'text-slate-400 hover:text-white bg-slate-800/60'
              }`}
            >
              💵 Taquilla Directa ({items.filter((i) => i.modalidad === 'TAQUILLA').length})
            </button>
            <button
              onClick={() => setSelectedChannel('COBRADOR_RUTA')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                selectedChannel === 'COBRADOR_RUTA'
                  ? 'bg-purple-500 text-white font-black'
                  : 'text-slate-400 hover:text-white bg-slate-800/60'
              }`}
            >
              🛵 Cobradores de Ruta ({items.filter((i) => i.modalidad === 'COBRADOR_RUTA').length})
            </button>
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-6">
          {/* Section 1: Summary Table by Currency and Channel */}
          <div className="space-y-2">
            <div className="flex justify-between items-center border-b border-slate-800 pb-1">
              <h4 className="text-xs font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                <Banknote className="w-3.5 h-3.5" />
                1. RESUMEN DE EFECTIVO ENTREGADO POR CANAL Y MONEDA
              </h4>
              <span className="text-[10px] text-slate-400 font-mono">Bóveda / Caja Central</span>
            </div>

            <div className="overflow-x-auto border border-slate-800 rounded-2xl">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-[#05110d] border-b border-slate-800 text-slate-400 font-bold uppercase text-[10px]">
                  <tr>
                    <th className="py-2.5 px-3 text-center">Moneda</th>
                    <th className="py-2.5 px-3 text-right">💵 Taquilla Directa</th>
                    <th className="py-2.5 px-3 text-right">🛵 Recaudado Cobradores</th>
                    <th className="py-2.5 px-3 text-right">📉 Salidas / Gastos Efectivo</th>
                    <th className="py-2.5 px-3 text-right">Total Efectivo a Bóveda</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80 font-mono text-[11px]">
                  {(['BS', 'USD', 'COP'] as const).map((mon) => {
                    const t = totalsByCurrency[mon];
                    const chan = channelSummaries[mon];
                    const taq = chan?.TAQUILLA?.entradas || 0;
                    const cob = chan?.COBRADOR_RUTA?.entradas || 0;
                    if (!t || (t.entradas === 0 && t.salidas === 0)) return null;

                    return (
                      <tr key={mon} className="hover:bg-slate-800/30 transition-colors">
                        <td className="py-2.5 px-3 text-center font-bold text-white text-xs">{mon}</td>
                        <td className="py-2.5 px-3 text-right font-semibold text-sky-400">
                          {formatCurrency(taq, mon)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-semibold text-purple-400">
                          {formatCurrency(cob, mon)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-semibold text-rose-400">
                          {formatCurrency(t.salidas, mon)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-black text-emerald-400 text-sm">
                          {formatCurrency(t.totalEntregado, mon)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Section 2: Detailed Deliveries */}
          <div className="space-y-2">
            <div className="flex justify-between items-center border-b border-slate-800 pb-1">
              <h4 className="text-xs font-black uppercase tracking-wider text-emerald-400">
                2. RELACIÓN DETALLADA DE ENTREGAS EN FÍSICO ({filteredItems.length})
              </h4>
              <span className="text-[10px] text-slate-400 font-mono">Mostrando {filteredItems.length} comprobantes</span>
            </div>

            <div className="overflow-x-auto max-h-[350px] overflow-y-auto border border-slate-800 rounded-2xl">
              <table className="w-full text-left text-[11px] border-collapse">
                <thead className="sticky top-0 bg-slate-900 border-b border-slate-700 text-slate-300 font-bold uppercase text-[10px]">
                  <tr>
                    <th className="py-2 px-2 text-center">#</th>
                    <th className="py-2 px-2 text-center">Fecha</th>
                    <th className="py-2 px-2">Agencia de Origen</th>
                    <th className="py-2 px-2 text-center">Modalidad</th>
                    <th className="py-2 px-2">Recibo / Token QR / Concepto</th>
                    <th className="py-2 px-2">Custodio / Responsable</th>
                    <th className="py-2 px-1 text-center">Mon</th>
                    <th className="py-2 px-2 text-right">Monto Efectivo</th>
                    <th className="py-2 px-2 text-center">Estatus</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80 font-mono">
                  {filteredItems.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-6 text-center text-slate-500 font-sans">
                        No se encontraron entregas de efectivo para los filtros seleccionados.
                      </td>
                    </tr>
                  ) : (
                    filteredItems.map((r, idx) => (
                      <tr key={`${r.id}_${idx}`} className="hover:bg-slate-800/25 transition-colors">
                        <td className="py-1.5 px-2 text-center text-slate-500">{idx + 1}</td>
                        <td className="py-1.5 px-2 text-center text-slate-300">{formatDate(r.fecha)}</td>
                        <td className="py-1.5 px-2 font-sans font-bold text-white truncate max-w-[140px]">
                          {r.agencia}
                        </td>
                        <td className="py-1.5 px-2 text-center">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase ${
                              r.modalidad === 'COBRADOR_RUTA'
                                ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                                : 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
                            }`}
                          >
                            {r.modalidad === 'COBRADOR_RUTA' ? '🛵 COBRADOR' : '💵 TAQUILLA'}
                          </span>
                        </td>
                        <td className="py-1.5 px-2 text-slate-400 font-mono text-[10px] truncate max-w-[160px]">
                          {r.referencia || r.concepto || '-'}
                        </td>
                        <td className="py-1.5 px-2 text-slate-300 text-[10px] truncate max-w-[130px]">
                          {r.custodio || userName}
                        </td>
                        <td className="py-1.5 px-1 text-center font-bold text-slate-300">{r.moneda}</td>
                        <td
                          className={`py-1.5 px-2 text-right font-black ${
                            r.tipo === 'ENTRADA' ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {formatCurrency(r.monto, r.moneda)}
                        </td>
                        <td className="py-1.5 px-2 text-center text-emerald-400 font-bold text-[10px]">
                          RECIBIDO
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Section 3: Conformity Statement */}
          <div className="p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800 text-[11px] leading-relaxed">
            <strong>DECLARACIÓN JURADA DE ARQUEO Y RECEPCIÓN DE VALORES EN FÍSICO:</strong>
            <p className="text-slate-300 mt-1">
              Por medio de la presente acta se hace constar la entrega material y física del papel moneda y valores en efectivo recaudados directamente en las cajas taquillas de las agencias y por los cobradores autorizados de ruta durante el ciclo operativo, certificando que el monto total asentado coincide íntegramente con el conteo físico efectuado en presencia de las partes firmantes y ha sido ingresado en la bóveda de Caja Central / Tesorería.
            </p>
          </div>

          {/* Section 4: Signatures */}
          <div className="pt-6 grid grid-cols-3 gap-6 text-center text-[11px]">
            <div className="space-y-1">
              <div className="border-t border-slate-500 pt-1 font-bold text-white">
                ENTREGADO POR
              </div>
              <div className="text-slate-400 text-[10px]">Supervisor / Custodio de Efectivo en Ruta</div>
              <div className="text-[10px] text-slate-500 pt-3">C.I: ____________________</div>
            </div>

            <div className="space-y-1">
              <div className="border-t border-slate-500 pt-1 font-bold text-white">
                RECIBIDO POR
              </div>
              <div className="text-slate-400 text-[10px]">Caja Central / Tesorería</div>
              <div className="text-[10px] text-slate-500 pt-3">C.I: ____________________</div>
            </div>

            <div className="space-y-1">
              <div className="border-t border-slate-500 pt-1 font-bold text-white">
                AUDITADO POR
              </div>
              <div className="text-slate-400 text-[10px]">Contraloría / Auditoría Interna</div>
              <div className="text-[10px] text-slate-500 pt-3">C.I: ____________________</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
