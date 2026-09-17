import React, { useState, useMemo } from 'react';
import { formatCurrency, formatDate, normalizarMoneda } from '../../utils/formatters';
import { Printer, X, Bike, Filter, User, ShieldCheck } from 'lucide-react';

export interface CollectorDailyPaymentItem {
  id: string;
  fecha: string;
  agencia: string;
  moneda: 'BS' | 'USD' | 'COP';
  monto: number;
  qr_token?: string;
  referencia?: string;
  cobrador_nombre?: string;
  cobrador_id?: string | number;
  liquidado_admin?: boolean;
  confirmado_supervisor?: boolean;
  fecha_escaneo_cobrador?: string;
}

interface CollectorDeliveryActaModalProps {
  isOpen?: boolean;
  onClose: () => void;
  systemCycle: { semana: string; desde: string; hasta: string; tipo: string };
  userName?: string;
  companyName?: string;
  collectors: { id: string | number; nombre: string; usuario?: string }[];
  dailyPayments: CollectorDailyPaymentItem[];
}

export const CollectorDeliveryActaModal: React.FC<CollectorDeliveryActaModalProps> = ({
  isOpen = true,
  onClose,
  systemCycle,
  userName = 'Administración',
  companyName = 'CORPORACION CALENDARIO, CA',
  collectors,
  dailyPayments,
}) => {
  const [selectedCollector, setSelectedCollector] = useState<string>('ALL');
  const [selectedCurrency, setSelectedCurrency] = useState<'ALL' | 'BS' | 'USD' | 'COP'>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<'ALL' | 'LIQUIDADO' | 'EN_RUTA'>('ALL');

  // Unique list of collectors found in data or passed
  const collectorOptions = useMemo(() => {
    const map = new Map<string, string>();
    collectors.forEach((c) => {
      map.set(String(c.id), c.nombre || c.usuario || `Cobrador #${c.id}`);
    });
    dailyPayments.forEach((p) => {
      const cId = String(p.cobrador_id || p.cobrador_nombre || '');
      if (cId && !map.has(cId)) {
        map.set(cId, p.cobrador_nombre || `Cobrador ${cId}`);
      }
    });
    return Array.from(map.entries()).map(([id, nombre]) => ({ id, nombre }));
  }, [collectors, dailyPayments]);

  // Filter items
  const filteredItems = useMemo(() => {
    return dailyPayments.filter((p) => {
      // Filter collector
      if (selectedCollector !== 'ALL') {
        const matchId = String(p.cobrador_id) === selectedCollector;
        const matchName = String(p.cobrador_nombre || '').toLowerCase() === selectedCollector.toLowerCase();
        if (!matchId && !matchName) return false;
      }

      // Filter currency
      if (selectedCurrency !== 'ALL' && normalizarMoneda(p.moneda) !== selectedCurrency) {
        return false;
      }

      // Filter status
      if (selectedStatus === 'LIQUIDADO' && !p.liquidado_admin) return false;
      if (selectedStatus === 'EN_RUTA' && p.liquidado_admin) return false;

      return true;
    });
  }, [dailyPayments, selectedCollector, selectedCurrency, selectedStatus]);

  // Summaries by Currency (COP, USD, BS)
  const summariesByCurrency = useMemo(() => {
    const res: Record<string, {
      totalRecaudado: number;
      liquidadoAdmin: number;
      enRuta: number;
      totalCobros: number;
    }> = {
      COP: { totalRecaudado: 0, liquidadoAdmin: 0, enRuta: 0, totalCobros: 0 },
      USD: { totalRecaudado: 0, liquidadoAdmin: 0, enRuta: 0, totalCobros: 0 },
      BS: { totalRecaudado: 0, liquidadoAdmin: 0, enRuta: 0, totalCobros: 0 },
    };

    // Calculate based on collector filter
    dailyPayments.forEach((p) => {
      if (selectedCollector !== 'ALL') {
        const matchId = String(p.cobrador_id) === selectedCollector;
        const matchName = String(p.cobrador_nombre || '').toLowerCase() === selectedCollector.toLowerCase();
        if (!matchId && !matchName) return;
      }

      const mon = normalizarMoneda(p.moneda);
      if (!res[mon]) return;

      res[mon].totalCobros++;
      res[mon].totalRecaudado += p.monto;
      if (p.liquidado_admin) {
        res[mon].liquidadoAdmin += p.monto;
      } else {
        res[mon].enRuta += p.monto;
      }
    });

    return res;
  }, [dailyPayments, selectedCollector]);

  const activeCollectorName = useMemo(() => {
    if (selectedCollector === 'ALL') return 'TODOS LOS COBRADORES DE RUTA';
    const found = collectorOptions.find((c) => c.id === selectedCollector);
    return found ? found.nombre.toUpperCase() : `COBRADOR ${selectedCollector}`;
  }, [selectedCollector, collectorOptions]);

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

    const rowsHtml = filteredItems
      .map(
        (r, idx) => `
      <tr>
        <td style="text-align: center; color: #64748b;">${idx + 1}</td>
        <td style="text-align: center;">${formatDate(r.fecha_escaneo_cobrador || r.fecha)}</td>
        <td style="text-align: left; font-weight: bold;">${r.agencia}</td>
        <td style="text-align: left; font-family: monospace; font-size: 8.5px;">${r.qr_token || r.referencia || '-'}</td>
        <td style="text-align: left; font-size: 9px;">${r.cobrador_nombre || 'Cobrador de Ruta'}</td>
        <td style="text-align: center; font-weight: bold;">${r.moneda}</td>
        <td style="text-align: right; font-weight: 900; color: #047857;">
          ${formatCurrency(r.monto, r.moneda)}
        </td>
        <td style="text-align: center;">
          <span style="font-weight: 800; font-size: 8.5px; padding: 2px 6px; border-radius: 4px; ${
            r.liquidado_admin
              ? 'background: #dcfce7; color: #15803d;'
              : 'background: #fef3c7; color: #b45309;'
          }">
            ${r.liquidado_admin ? 'LIQUIDADO ADMIN' : 'EN RUTA (PENDIENTE)'}
          </span>
        </td>
      </tr>
    `
      )
      .join('');

    const summariesHtml = ['COP', 'USD', 'BS']
      .map((mon) => {
        const d = summariesByCurrency[mon];
        if (!d || d.totalRecaudado === 0) return '';
        return `
        <div style="border: 1px solid #cbd5e1; border-radius: 6px; padding: 6px 8px; background: #f8fafc;">
          <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #e2e8f0; padding-bottom: 3px; margin-bottom: 4px; font-weight: bold;">
            <span style="font-size: 11px; color: #0f172a;">${mon}</span>
            <span style="font-size: 9px; color: #64748b;">${d.totalCobros} Recaudaciones</span>
          </div>
          <div style="font-size: 9.5px; font-family: monospace; line-height: 1.4;">
            <div style="display: flex; justify-content: space-between;"><span style="color: #64748b;">Total Recaudado:</span><span style="font-weight: bold;">${formatCurrency(d.totalRecaudado, mon as any)}</span></div>
            <div style="display: flex; justify-content: space-between;"><span style="color: #64748b;">🏛️ Liquidado en Caja:</span><span style="color: #047857; font-weight: bold;">${formatCurrency(d.liquidadoAdmin, mon as any)}</span></div>
            <div style="display: flex; justify-content: space-between; border-top: 1px solid #cbd5e1; padding-top: 2px; margin-top: 2px; font-weight: bold;">
              <span style="color: #b45309;">🛵 Pendiente En Ruta:</span>
              <span style="color: #b45309;">${formatCurrency(d.enRuta, mon as any)}</span>
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
          <title>Acta_Entrega_Cobrador_${activeCollectorName.replace(/\s+/g, '_')}_${systemCycle.semana}</title>
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
              color: #9333ea;
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
            <div class="acta-title">ACTA OFICIAL DE ENTREGA Y RENDICIÓN - COBRADOR DE RUTA</div>
            <div class="cycle-badge">
              ${systemCycle.tipo === 'SEMANAL' ? `SEMANA ${systemCycle.semana}` : `CICLO ${systemCycle.semana}`} (${systemCycle.desde} AL ${systemCycle.hasta})
            </div>
            <div class="meta-row">
              <span><strong>Suscriptor:</strong> ${companyName}</span>
              <span><strong>Cobrador / Responsable:</strong> ${activeCollectorName}</span>
              <span><strong>Emisión:</strong> ${todayFormatted}</span>
            </div>
          </div>

          <div class="section-header">1. RESUMEN DE RECAUDACIÓN Y LIQUIDACIÓN EN CAJA</div>
          <div class="summary-cards-grid">
            ${summariesHtml || '<div style="padding: 10px; color: #64748b;">Sin movimientos registrados para este cobrador.</div>'}
          </div>

          <div class="section-header">2. DESGLOSE INDIVIDUAL DE RECAUDACIONES EN PUNTOS DE VENTA (${filteredItems.length})</div>
          <table>
            <thead>
              <tr>
                <th style="width: 25px; text-align: center;">#</th>
                <th style="text-align: center;">Fecha/Hora</th>
                <th style="text-align: left;">Agencia</th>
                <th style="text-align: left;">Comprobante / Token QR</th>
                <th style="text-align: left;">Cobrador</th>
                <th style="text-align: center;">Mon</th>
                <th style="text-align: right;">Monto Cobrado</th>
                <th style="text-align: center;">Estado Liquidación</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml || '<tr><td colspan="8" style="text-align: center; padding: 10px;">No se encontraron recaudaciones con los filtros aplicados.</td></tr>'}
            </tbody>
          </table>

          <div class="statement-card">
            <strong>DECLARACIÓN JURADA DE RENDICIÓN Y ENTREGA DE VALORES:</strong><br/>
            El Cobrador de Ruta suscrito certifica haber recaudado en físico los importes detallados de cada agencia mediante el sistema de validación QR, y hace constar la entrega material a Caja Central / Administración de los montos clasificados como LIQUIDADOS, asumiendo plena responsabilidad sobre los valores que aún figuren pendientes EN RUTA.
          </div>

          <div class="signatures-row">
            <div>
              <div class="sig-line">ENTREGADO POR</div>
              <div class="sig-role">Supervisor / Cobrador de Ruta</div>
              <div class="sig-ci">C.I: ____________________</div>
            </div>
            <div>
              <div class="sig-line">RECIBIDO POR</div>
              <div class="sig-role">Caja Central / Administración</div>
              <div class="sig-ci">C.I: ____________________</div>
            </div>
            <div>
              <div class="sig-line">AUDITADO POR</div>
              <div class="sig-role">Auditoría / Supervisor de Ruta</div>
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
      <div className="bg-[#0D1B22] border border-purple-500/30 rounded-3xl max-w-5xl w-full p-6 sm:p-8 shadow-2xl space-y-6 relative overflow-hidden">
        {/* Top Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-purple-500/15 text-purple-400 border border-purple-500/30">
              <Bike className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-black text-white">
                Acta Oficial de Entrega y Liquidación - Cobrador de Ruta
              </h3>
              <p className="text-xs text-slate-400">
                Descargo de efectivo recaudado por cobradores en agencias y liquidación en caja central.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-purple-500 to-indigo-500 hover:from-purple-400 hover:to-indigo-400 text-white font-extrabold text-xs shadow-lg shadow-purple-500/20 flex items-center gap-1.5 transition-all cursor-pointer"
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

        {/* Filter Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-[#071217] p-3 rounded-2xl border border-slate-800/80">
          {/* Collector Picker */}
          <div className="flex items-center gap-2 min-w-[240px]">
            <User className="w-4 h-4 text-purple-400" />
            <div className="flex-1">
              <label className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">
                Cobrador de Ruta:
              </label>
              <select
                value={selectedCollector}
                onChange={(e) => setSelectedCollector(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 text-white text-xs rounded-xl px-2.5 py-1.5 focus:outline-none focus:border-purple-500"
              >
                <option value="ALL">🛵 Todos los Cobradores (Consolidado General)</option>
                {collectorOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    👤 {c.nombre}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Quick Filters */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Status Filter */}
            <div className="flex items-center bg-slate-900 rounded-xl p-1 border border-slate-800 text-[11px]">
              {(['ALL', 'LIQUIDADO', 'EN_RUTA'] as const).map((st) => (
                <button
                  key={st}
                  onClick={() => setSelectedStatus(st)}
                  className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                    selectedStatus === st
                      ? 'bg-purple-500 text-white shadow'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {st === 'ALL' ? 'Todos' : st === 'LIQUIDADO' ? '🏛️ Liquidados' : '🛵 En Ruta'}
                </button>
              ))}
            </div>

            {/* Currency Filter */}
            <div className="flex items-center bg-slate-900 rounded-xl p-1 border border-slate-800 text-[11px]">
              {(['ALL', 'COP', 'USD', 'BS'] as const).map((mon) => (
                <button
                  key={mon}
                  onClick={() => setSelectedCurrency(mon)}
                  className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                    selectedCurrency === mon
                      ? 'bg-amber-500 text-slate-950 shadow'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {mon}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* PREVIEW DOCUMENT */}
        <div className="space-y-6 font-sans text-xs text-slate-200">
          {/* Document Header */}
          <div className="text-center border-b-2 border-slate-700 pb-4 space-y-1">
            <div className="text-base sm:text-lg font-black tracking-wider uppercase text-white">
              MULTIBANCA EXPRESS
            </div>
            <div className="text-sm font-bold text-purple-400 uppercase">
              ACTA OFICIAL DE ENTREGA Y RENDICIÓN - COBRADOR DE RUTA
            </div>
            <div className="text-xs font-mono font-bold text-slate-300">
              {systemCycle.tipo === 'SEMANAL' ? `SEMANA ${systemCycle.semana}` : `CICLO ${systemCycle.semana}`} ({systemCycle.desde} AL ${systemCycle.hasta})
            </div>
            <div className="text-[11px] text-slate-400 flex justify-between pt-2">
              <span><strong>Suscriptor:</strong> {companyName}</span>
              <span><strong>Cobrador / Responsable:</strong> {activeCollectorName}</span>
              <span><strong>Emisión:</strong> {todayFormatted}</span>
            </div>
          </div>

          {/* Section 1: Consolidated KPI Cards */}
          <div className="space-y-2">
            <h4 className="text-xs font-black uppercase tracking-wider text-purple-400 border-b border-slate-800 pb-1">
              1. RESUMEN DE RECAUDACIÓN Y LIQUIDACIÓN EN CAJA
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {['COP', 'USD', 'BS'].map((mon) => {
                const data = summariesByCurrency[mon];
                if (!data || data.totalRecaudado === 0) return null;

                return (
                  <div key={mon} className="p-3 rounded-2xl bg-[#071217] border border-slate-800 space-y-1.5">
                    <div className="flex justify-between items-center border-b border-slate-800/80 pb-1">
                      <span className="font-extrabold text-purple-400">{mon}</span>
                      <span className="text-[10px] text-slate-400 font-mono">{data.totalCobros} Recaudaciones</span>
                    </div>

                    <div className="text-[11px] space-y-0.5 font-mono">
                      <div className="flex justify-between">
                        <span className="text-slate-400">Total Recaudado en Ruta:</span>
                        <span className="text-white font-bold">{formatCurrency(data.totalRecaudado, mon as any)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">🏛️ Liquidado a Caja Admin:</span>
                        <span className="text-emerald-400 font-bold">{formatCurrency(data.liquidadoAdmin, mon as any)}</span>
                      </div>
                      <div className="flex justify-between pt-1 border-t border-slate-800 font-bold">
                        <span className="text-amber-400">🛵 Saldo Pendiente en Ruta:</span>
                        <span className="text-amber-400">{formatCurrency(data.enRuta, mon as any)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Section 2: Detailed Matrix */}
          <div className="space-y-2">
            <div className="flex justify-between items-center border-b border-slate-800 pb-1">
              <h4 className="text-xs font-black uppercase tracking-wider text-purple-400">
                2. DESGLOSE INDIVIDUAL DE RECAUDACIONES EN PUNTOS DE VENTA ({filteredItems.length})
              </h4>
              <span className="text-[10px] text-slate-400 font-mono">Mostrando {filteredItems.length} recibos</span>
            </div>

            <div className="overflow-x-auto max-h-[350px] overflow-y-auto border border-slate-800/80 rounded-2xl">
              <table className="w-full text-left text-[11px] border-collapse">
                <thead className="sticky top-0 bg-slate-900 border-b border-slate-700 text-slate-300 font-bold uppercase">
                  <tr>
                    <th className="py-2 px-2 text-center">#</th>
                    <th className="py-2 px-2 text-center">Fecha / Hora</th>
                    <th className="py-2 px-2">Agencia</th>
                    <th className="py-2 px-2">Comprobante / Token QR</th>
                    <th className="py-2 px-2">Cobrador</th>
                    <th className="py-2 px-1 text-center">Mon</th>
                    <th className="py-2 px-2 text-right">Monto</th>
                    <th className="py-2 px-2 text-center">Estado Liquidación</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80 font-mono">
                  {filteredItems.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-6 text-center text-slate-500 font-sans">
                        No se encontraron recaudaciones de cobrador para los filtros seleccionados.
                      </td>
                    </tr>
                  ) : (
                    filteredItems.map((r, idx) => (
                      <tr key={`${r.id}_${idx}`} className="hover:bg-slate-800/25">
                        <td className="py-1.5 px-2 text-center text-slate-500">{idx + 1}</td>
                        <td className="py-1.5 px-2 text-center text-slate-300">
                          {formatDate(r.fecha_escaneo_cobrador || r.fecha)}
                        </td>
                        <td className="py-1.5 px-2 font-sans font-bold text-white truncate max-w-[140px]">
                          {r.agencia}
                        </td>
                        <td className="py-1.5 px-2 text-slate-400 font-mono text-[10px] truncate max-w-[160px]">
                          {r.qr_token || r.referencia || '-'}
                        </td>
                        <td className="py-1.5 px-2 text-slate-300 font-sans text-[10px] truncate max-w-[130px]">
                          {r.cobrador_nombre || 'Cobrador de Ruta'}
                        </td>
                        <td className="py-1.5 px-1 text-center font-bold text-slate-300">{r.moneda}</td>
                        <td className="py-1.5 px-2 text-right font-black text-emerald-400">
                          {formatCurrency(r.monto, r.moneda)}
                        </td>
                        <td className="py-1.5 px-2 text-center">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase ${
                              r.liquidado_admin
                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                            }`}
                          >
                            {r.liquidado_admin ? '🏛️ Liquidado Admin' : '🛵 En Ruta'}
                          </span>
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
            <strong>DECLARACIÓN JURADA DE RENDICIÓN Y ENTREGA DE VALORES:</strong>
            <p className="text-slate-300 mt-1">
              El Cobrador de Ruta suscrito certifica haber recaudado en físico los importes detallados de cada agencia mediante el sistema de validación QR, y hace constar la entrega material a Caja Central / Administración de los montos clasificados como LIQUIDADOS, asumiendo plena responsabilidad sobre los valores que aún figuren pendientes EN RUTA.
            </p>
          </div>

          {/* Section 4: Signatures */}
          <div className="pt-6 grid grid-cols-3 gap-6 text-center text-[11px]">
            <div className="space-y-1">
              <div className="border-t border-slate-500 pt-1 font-bold text-white">
                ENTREGADO POR
              </div>
              <div className="text-slate-400 text-[10px]">Supervisor / Cobrador de Ruta</div>
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
              <div className="text-slate-400 text-[10px]">Auditoría / Supervisor de Ruta</div>
              <div className="text-[10px] text-slate-500 pt-3">C.I: ____________________</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
