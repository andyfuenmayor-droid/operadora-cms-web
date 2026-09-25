import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { Printer, X, ShieldCheck, Filter } from 'lucide-react';

export interface ConfirmationAuditItem {
  id: string;
  fecha: string;
  agencia: string;
  categoria: 'BANCO' | 'GASTO' | 'REPOSICION' | 'EFECTIVO';
  referencia: string;
  moneda: 'BS' | 'USD' | 'COP';
  monto: number;
  confirmado_por?: string;
  banco?: string;
}

interface ConfirmationOperatorActaModalProps {
  isOpen?: boolean;
  onClose: () => void;
  systemCycle: { semana: string; desde: string; hasta: string; tipo: string };
  userName?: string;
  companyName?: string;
  items: ConfirmationAuditItem[];
}

export const ConfirmationOperatorActaModal: React.FC<ConfirmationOperatorActaModalProps> = ({
  isOpen = true,
  onClose,
  systemCycle,
  userName = 'Operador de Confirmaciones',
  companyName = 'CORPORACION CALENDARIO, CA',
  items,
}) => {
  const [selectedCurrency, setSelectedCurrency] = useState<'ALL' | 'BS' | 'USD' | 'COP'>('ALL');
  const [selectedCategory, setSelectedCategory] = useState<'ALL' | 'BANCO' | 'GASTO' | 'REPOSICION' | 'EFECTIVO'>('ALL');

  // Filtered items
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchMon = selectedCurrency === 'ALL' || item.moneda === selectedCurrency;
      const matchCat = selectedCategory === 'ALL' || item.categoria === selectedCategory;
      return matchMon && matchCat;
    });
  }, [items, selectedCurrency, selectedCategory]);

  // Summaries by Currency (BS, USD, COP)
  const summariesByCurrency = useMemo(() => {
    const res: Record<string, {
      bancos: number;
      gastos: number;
      reposicion: number;
      efectivo: number;
      totalMovimientos: number;
    }> = {
      BS: { bancos: 0, gastos: 0, reposicion: 0, efectivo: 0, totalMovimientos: 0 },
      USD: { bancos: 0, gastos: 0, reposicion: 0, efectivo: 0, totalMovimientos: 0 },
      COP: { bancos: 0, gastos: 0, reposicion: 0, efectivo: 0, totalMovimientos: 0 },
    };

    items.forEach((item) => {
      const mon = item.moneda;
      if (!res[mon]) return;
      res[mon].totalMovimientos++;
      if (item.categoria === 'BANCO') res[mon].bancos += item.monto;
      else if (item.categoria === 'GASTO') res[mon].gastos += item.monto;
      else if (item.categoria === 'REPOSICION') res[mon].reposicion += item.monto;
      else if (item.categoria === 'EFECTIVO') res[mon].efectivo += item.monto;
    });

    return res;
  }, [items]);

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
        <td style="text-align: center;">${formatDate(r.fecha)}</td>
        <td style="text-align: left; font-weight: bold;">${r.agencia}</td>
        <td style="text-align: center;">
          <span style="font-weight: 700; font-size: 8.5px; padding: 2px 5px; border-radius: 4px; ${
            r.categoria === 'BANCO'
              ? 'background: #e0f2fe; color: #0369a1;'
              : r.categoria === 'GASTO'
              ? 'background: #fee2e2; color: #b91c1c;'
              : r.categoria === 'REPOSICION'
              ? 'background: #fef3c7; color: #b45309;'
              : 'background: #dcfce7; color: #15803d;'
          }">
            ${r.categoria === 'BANCO' ? 'BANCO' : r.categoria === 'GASTO' ? 'GASTO' : r.categoria === 'REPOSICION' ? 'REPOSICIÓN' : 'EFECTIVO'}
          </span>
        </td>
        <td style="text-align: left; font-family: monospace;">${r.referencia || '-'}</td>
        <td style="text-align: center; font-weight: bold;">${r.moneda}</td>
        <td style="text-align: right; font-weight: 900; color: ${
          r.categoria === 'GASTO' ? '#b91c1c' : r.categoria === 'REPOSICION' ? '#b45309' : '#047857'
        };">
          ${formatCurrency(r.monto, r.moneda)}
        </td>
        <td style="text-align: left; font-size: 8.5px; color: #475569;">${r.confirmado_por || userName}</td>
        <td style="text-align: center; font-weight: bold; color: #047857;">VERIFICADO</td>
      </tr>
    `
      )
      .join('');

    const summariesHtml = ['BS', 'USD', 'COP']
      .map((mon) => {
        const d = summariesByCurrency[mon];
        if (!d || (d.bancos === 0 && d.gastos === 0 && d.reposicion === 0 && d.efectivo === 0)) return '';
        return `
        <div style="border: 1px solid #cbd5e1; border-radius: 6px; padding: 6px 8px; background: #f8fafc;">
          <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #e2e8f0; padding-bottom: 3px; margin-bottom: 4px; font-weight: bold;">
            <span style="font-size: 11px; color: #0f172a;">${mon}</span>
            <span style="font-size: 9px; color: #64748b;">${d.totalMovimientos} Verificados</span>
          </div>
          <div style="font-size: 9.5px; font-family: monospace; line-height: 1.4;">
            <div style="display: flex; justify-content: space-between;"><span style="color: #64748b;">🏛️ Bancos Auditados:</span><span style="color: #0369a1; font-weight: 600;">${formatCurrency(d.bancos, mon as any)}</span></div>
            <div style="display: flex; justify-content: space-between;"><span style="color: #64748b;">💵 Efectivo Taquilla:</span><span style="color: #047857; font-weight: 600;">${formatCurrency(d.efectivo, mon as any)}</span></div>
            <div style="display: flex; justify-content: space-between;"><span style="color: #64748b;">📉 Gastos Verificados:</span><span style="color: #b91c1c;">${formatCurrency(d.gastos, mon as any)}</span></div>
            <div style="display: flex; justify-content: space-between;"><span style="color: #64748b;">🏆 Reposición Premios:</span><span style="color: #b45309; font-weight: 600;">+${formatCurrency(d.reposicion, mon as any)}</span></div>
            <div style="display: flex; justify-content: space-between; border-top: 1px solid #cbd5e1; padding-top: 2px; margin-top: 2px; font-weight: bold;">
              <span>Total Ingreso Neto:</span>
              <span style="color: #0f172a;">${formatCurrency(d.bancos + d.efectivo - d.gastos, mon as any)}</span>
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
          <title>Acta_Operador_Confirmaciones_${systemCycle.semana}_${systemCycle.desde}_al_${systemCycle.hasta}</title>
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
              color: #0284c7;
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
            <div class="acta-title">ACTA OFICIAL DE RENDICIÓN Y AUDITORÍA - OPERADOR DE CONFIRMACIONES</div>
            <div class="cycle-badge">
              ${systemCycle.tipo === 'SEMANAL' ? `SEMANA ${systemCycle.semana}` : `CICLO ${systemCycle.semana}`} (${systemCycle.desde} AL ${systemCycle.hasta})
            </div>
            <div class="meta-row">
              <span><strong>Suscriptor:</strong> ${companyName}</span>
              <span><strong>Emisión:</strong> ${todayFormatted}</span>
              <span><strong>Operador Auditor:</strong> ${userName}</span>
            </div>
          </div>

          <div class="section-header">1. RESUMEN CONSOLIDADO DE VALIDACIONES POR MONEDA</div>
          <div class="summary-cards-grid">
            ${summariesHtml}
          </div>

          <div class="section-header">2. DESGLOSE DETALLADO DE MOVIMIENTOS AUDITADOS Y VERIFICADOS (${filteredItems.length})</div>
          <table>
            <thead>
              <tr>
                <th style="width: 25px; text-align: center;">#</th>
                <th style="text-align: center;">Fecha</th>
                <th style="text-align: left;">Agencia</th>
                <th style="text-align: center;">Categoría</th>
                <th style="text-align: left;">Referencia / Comprobante</th>
                <th style="text-align: center;">Mon</th>
                <th style="text-align: right;">Monto Auditado</th>
                <th style="text-align: left;">Confirmado Por</th>
                <th style="text-align: center;">Estado</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml || '<tr><td colspan="9" style="text-align: center; padding: 10px;">No se registraron movimientos en este filtro.</td></tr>'}
            </tbody>
          </table>

          <div class="statement-card">
            <strong>DECLARACIÓN JURADA DE FE PÚBLICA Y CONFORMIDAD AUDITADA:</strong><br/>
            El Operador de Confirmaciones suscrito declara bajo fe de juramento haber cotejado y validado cada uno de los comprobantes bancarios, transferencias, egresos operativos y reposiciones de premios asentados en la presente acta contra los extractos de cuentas bancarias y libros de caja correspondientes al ciclo auditado, certificando su autenticidad e integridad para el cierre formal del período.
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

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-hidden">
      {/* Backdrop for full window */}
      <div
        data-modal-backdrop="true"
        onClick={onClose}
        className="fixed inset-0 cursor-pointer transition-opacity"
      />

      <div className="relative z-10 bg-[#0D1B22] border border-sky-500/30 rounded-3xl max-w-5xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-fade-in">
        {/* Top Header */}
        <div className="flex items-center justify-between border-b border-slate-800 p-4 sm:p-6 shrink-0 bg-[#0D1B22]/95">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-sky-500/15 text-sky-400 border border-sky-500/30">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-black text-white">
                Acta de Rendición del Operador de Confirmaciones
              </h3>
              <p className="text-xs text-slate-400">
                Respaldo oficial de transferencias bancarias, gastos y reposiciones auditadas.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-sky-500 to-teal-500 hover:from-sky-400 hover:to-teal-400 text-slate-950 font-extrabold text-xs shadow-lg shadow-sky-500/20 flex items-center gap-1.5 transition-all cursor-pointer"
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

        {/* Scrollable Body */}
        <div className="p-4 sm:p-8 overflow-y-auto flex-1 space-y-6">

        {/* Filter Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-[#071217] p-3 rounded-2xl border border-slate-800/80">
          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-[11px] font-bold text-slate-400 uppercase">Filtrar:</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Category Filter */}
            <div className="flex items-center bg-slate-900 rounded-xl p-1 border border-slate-800 text-[11px]">
              {(['ALL', 'BANCO', 'GASTO', 'REPOSICION', 'EFECTIVO'] as const).map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                    selectedCategory === cat ? 'bg-sky-500 text-slate-950 shadow' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {cat === 'ALL' ? 'Todas' : cat === 'BANCO' ? 'Bancos' : cat === 'GASTO' ? 'Gastos' : cat === 'REPOSICION' ? 'Reposición' : 'Efectivo'}
                </button>
              ))}
            </div>

            {/* Currency Filter */}
            <div className="flex items-center bg-slate-900 rounded-xl p-1 border border-slate-800 text-[11px]">
              {(['ALL', 'BS', 'USD', 'COP'] as const).map((mon) => (
                <button
                  key={mon}
                  onClick={() => setSelectedCurrency(mon)}
                  className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                    selectedCurrency === mon ? 'bg-amber-500 text-slate-950 shadow' : 'text-slate-400 hover:text-white'
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
            <div className="text-sm font-bold text-sky-400 uppercase">
              ACTA OFICIAL DE RENDICIÓN Y AUDITORÍA - OPERADOR DE CONFIRMACIONES
            </div>
            <div className="text-xs font-mono font-bold text-slate-300">
              {systemCycle.tipo === 'SEMANAL' ? `SEMANA ${systemCycle.semana}` : `CICLO ${systemCycle.semana}`} ({systemCycle.desde} AL {systemCycle.hasta})
            </div>
            <div className="text-[11px] text-slate-400 flex justify-between pt-2">
              <span><strong>Suscriptor:</strong> {companyName}</span>
              <span><strong>Emisión:</strong> {todayFormatted}</span>
              <span><strong>Operador Auditor:</strong> {userName}</span>
            </div>
          </div>

          {/* Section 1: Consolidated KPI Cards */}
          <div className="space-y-2">
            <h4 className="text-xs font-black uppercase tracking-wider text-sky-400 border-b border-slate-800 pb-1">
              1. RESUMEN CONSOLIDADO DE VALIDACIONES
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {['BS', 'USD', 'COP'].map((mon) => {
                const data = summariesByCurrency[mon];
                if (!data || (data.bancos === 0 && data.gastos === 0 && data.reposicion === 0 && data.efectivo === 0)) return null;

                return (
                  <div key={mon} className="p-3 rounded-2xl bg-[#071217] border border-slate-800 space-y-1.5">
                    <div className="flex justify-between items-center border-b border-slate-800/80 pb-1">
                      <span className="font-extrabold text-sky-400">{mon}</span>
                      <span className="text-[10px] text-slate-400 font-mono">{data.totalMovimientos} Verificados</span>
                    </div>

                    <div className="text-[11px] space-y-0.5 font-mono">
                      <div className="flex justify-between">
                        <span className="text-slate-400">🏛️ Bancos Auditados:</span>
                        <span className="text-sky-400 font-bold">{formatCurrency(data.bancos, mon as any)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">💵 Efectivo Taquilla:</span>
                        <span className="text-emerald-400 font-bold">{formatCurrency(data.efectivo, mon as any)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">📉 Gastos Verificados:</span>
                        <span className="text-rose-400 font-bold">{formatCurrency(data.gastos, mon as any)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">🏆 Reposición Premios:</span>
                        <span className="text-amber-400 font-bold">+{formatCurrency(data.reposicion, mon as any)}</span>
                      </div>
                      <div className="flex justify-between pt-1 border-t border-slate-800 font-bold">
                        <span className="text-slate-300">Neto Ingreso Auditado:</span>
                        <span className="text-white">{formatCurrency(data.bancos + data.efectivo - data.gastos, mon as any)}</span>
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
              <h4 className="text-xs font-black uppercase tracking-wider text-sky-400">
                2. MOVIMIENTOS DETALLADOS AUDITADOS ({filteredItems.length})
              </h4>
              <span className="text-[10px] text-slate-400 font-mono">Mostrando {filteredItems.length} registros</span>
            </div>

            <div className="overflow-x-auto max-h-[350px] overflow-y-auto border border-slate-800/80 rounded-2xl">
              <table className="w-full text-left text-[11px] border-collapse">
                <thead className="sticky top-0 bg-slate-900 border-b border-slate-700 text-slate-300 font-bold uppercase">
                  <tr>
                    <th className="py-2 px-2 text-center">#</th>
                    <th className="py-2 px-2 text-center">Fecha</th>
                    <th className="py-2 px-2">Agencia</th>
                    <th className="py-2 px-2 text-center">Categoría</th>
                    <th className="py-2 px-2">Referencia / Detalle</th>
                    <th className="py-2 px-1 text-center">Mon</th>
                    <th className="py-2 px-2 text-right">Monto</th>
                    <th className="py-2 px-2">Confirmado Por</th>
                    <th className="py-2 px-2 text-center">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80 font-mono">
                  {filteredItems.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-6 text-center text-slate-500 font-sans">
                        No hay movimientos confirmados que coincidan con los filtros seleccionados.
                      </td>
                    </tr>
                  ) : (
                    filteredItems.map((r, idx) => (
                      <tr key={`${r.id}_${idx}`} className="hover:bg-slate-800/25">
                        <td className="py-1.5 px-2 text-center text-slate-500">{idx + 1}</td>
                        <td className="py-1.5 px-2 text-center text-slate-300">{formatDate(r.fecha)}</td>
                        <td className="py-1.5 px-2 font-sans font-bold text-white truncate max-w-[130px]">
                          {r.agencia}
                        </td>
                        <td className="py-1.5 px-2 text-center">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase ${
                              r.categoria === 'BANCO'
                                ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
                                : r.categoria === 'GASTO'
                                ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                                : r.categoria === 'REPOSICION'
                                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            }`}
                          >
                            {r.categoria === 'BANCO' ? 'BANCO' : r.categoria === 'GASTO' ? 'GASTO' : r.categoria === 'REPOSICION' ? 'REPOSICIÓN' : 'EFECTIVO'}
                          </span>
                        </td>
                        <td className="py-1.5 px-2 text-slate-400 font-mono text-[10px] truncate max-w-[150px]">
                          {r.referencia || '-'}
                        </td>
                        <td className="py-1.5 px-1 text-center font-bold text-slate-300">{r.moneda}</td>
                        <td
                          className={`py-1.5 px-2 text-right font-black ${
                            r.categoria === 'GASTO'
                              ? 'text-rose-400'
                              : r.categoria === 'REPOSICION'
                              ? 'text-amber-400'
                              : 'text-emerald-400'
                          }`}
                        >
                          {formatCurrency(r.monto, r.moneda)}
                        </td>
                        <td className="py-1.5 px-2 text-slate-400 text-[10px] truncate max-w-[110px]">
                          {r.confirmado_por || userName}
                        </td>
                        <td className="py-1.5 px-2 text-center text-emerald-400 font-bold text-[10px]">
                          VERIFICADO
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
            <strong>DECLARACIÓN JURADA DE FE PÚBLICA Y CONFORMIDAD AUDITADA:</strong>
            <p className="text-slate-300 mt-1">
              El Operador de Confirmaciones suscrito declara bajo fe de juramento haber cotejado y validado cada uno de los comprobantes bancarios, transferencias, egresos operativos y reposiciones de premios asentados en la presente acta contra los extractos de cuentas bancarias y libros de caja correspondientes al ciclo auditado, certificando su autenticidad e integridad para el cierre formal del período.
            </p>
          </div>

          {/* Section 4: Signatures */}
          <div className="pt-6 grid grid-cols-3 gap-6 text-center text-[11px]">
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
  </div>,
  document.body
);
};
