import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { Printer, X, Receipt, ShieldCheck, Building2, Filter, Layers } from 'lucide-react';
import type { ConsolidatedExpenseItem } from '../../utils/consolidations';

export interface AgencyExpensesActaModalProps {
  isOpen?: boolean;
  onClose: () => void;
  systemCycle: { semana: string; desde: string; hasta: string; tipo: string };
  userName?: string;
  companyName?: string;
  items: ConsolidatedExpenseItem[];
}

export const AgencyExpensesActaModal: React.FC<AgencyExpensesActaModalProps> = ({
  isOpen = true,
  onClose,
  systemCycle,
  userName = 'Administración',
  companyName = 'CORPORACION CALENDARIO, CA',
  items,
}) => {
  const [selectedCurrency, setSelectedCurrency] = useState<'ALL' | 'BS' | 'USD' | 'COP'>('ALL');
  const [selectedAgency, setSelectedAgency] = useState<string>('ALL');

  const todayFormatted = new Date().toLocaleDateString('es-VE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  // Extract unique agency names
  const agencyOptions = useMemo(() => {
    const set = new Set<string>();
    items.forEach((item) => {
      if (item.agencia) set.add(item.agencia.trim().toUpperCase());
    });
    return Array.from(set).sort();
  }, [items]);

  // Filtered expenses
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchMon = selectedCurrency === 'ALL' || item.moneda === selectedCurrency;
      const matchAg = selectedAgency === 'ALL' || item.agencia.trim().toUpperCase() === selectedAgency;
      return matchMon && matchAg;
    });
  }, [items, selectedCurrency, selectedAgency]);

  // Global Totals by Currency
  const totalsByCurrency = useMemo(() => {
    const res: Record<string, { total: number; count: number }> = {
      BS: { total: 0, count: 0 },
      USD: { total: 0, count: 0 },
      COP: { total: 0, count: 0 },
    };

    items.forEach((item) => {
      if (res[item.moneda]) {
        res[item.moneda].total += Number(item.monto || 0);
        res[item.moneda].count += 1;
      }
    });

    return res;
  }, [items]);

  // Summary by Agency & Currency
  const agencySummaries = useMemo(() => {
    const map = new Map<string, { agencia: string; moneda: string; total: number; count: number }>();
    items.forEach((item) => {
      const key = `${item.agencia.trim().toUpperCase()}_${item.moneda}`;
      if (!map.has(key)) {
        map.set(key, {
          agencia: item.agencia.trim().toUpperCase(),
          moneda: item.moneda,
          total: 0,
          count: 0,
        });
      }
      const rec = map.get(key)!;
      rec.total += Number(item.monto || 0);
      rec.count += 1;
    });
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [items]);

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
      alert('Error inicializando el motor de impresión.');
      return;
    }

    const rowsHtml = items
      .map(
        (r, idx) => `
      <tr>
        <td style="text-align: center; color: #64748b;">${idx + 1}</td>
        <td style="text-align: left; font-weight: bold;">${r.agencia}</td>
        <td style="text-align: center; font-weight: bold;">${r.moneda}</td>
        <td style="text-align: left;">${r.concepto || 'Gasto Operativo'}</td>
        <td style="text-align: center;">${r.fecha || '-'}</td>
        <td style="text-align: right; font-weight: 800; color: #b91c1c;">${formatCurrency(r.monto, r.moneda)}</td>
        <td style="text-align: center; color: #047857; font-weight: 600;">CONFIRMADO</td>
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
            <span style="font-size: 9px; color: #64748b;">${d.count} gasto(s)</span>
          </div>
          <div style="font-size: 13px; font-family: monospace; font-weight: 900; color: #b91c1c; text-align: center; padding: 4px 0;">
            ${formatCurrency(d.total, mon as any)}
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
          <title>Acta_Gastos_Agencias_${systemCycle.semana}_${systemCycle.desde}_al_${systemCycle.hasta}</title>
          <style>
            @page {
              size: portrait;
              margin: 10mm;
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
              color: #b91c1c;
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
              margin-top: 10px;
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
              font-size: 9px;
              margin-bottom: 12px;
            }
            th {
              background: #f1f5f9;
              border-top: 1px solid #cbd5e1;
              border-bottom: 1.5px solid #0f172a;
              padding: 4px 5px;
              font-weight: 800;
              text-transform: uppercase;
            }
            td {
              border-bottom: 1px solid #e2e8f0;
              padding: 3.5px 5px;
              font-family: monospace;
            }
            .signatures-row {
              display: grid;
              grid-template-columns: repeat(3, 1fr);
              gap: 20px;
              text-align: center;
              margin-top: 20px;
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
            <div class="company-name">MULTIBANCA EXPRESS</div>
            <div class="acta-title">ACTA OFICIAL DE GASTOS OPERATIVOS DE AGENCIAS</div>
            <div class="cycle-badge">
              SEMANA ${systemCycle.semana} (${systemCycle.desde} AL ${systemCycle.hasta})
            </div>
            <div class="meta-row">
              <span><strong>Suscriptor:</strong> ${companyName}</span>
              <span><strong>Emisión:</strong> ${todayFormatted}</span>
              <span><strong>Auditor Responsable:</strong> ${userName}</span>
            </div>
          </div>

          <div class="section-header">1. RESUMEN CONSOLIDADO DE GASTOS DE AGENCIAS POR MONEDA</div>
          <div class="summary-cards-grid">
            ${summariesHtml}
          </div>

          <div class="section-header">2. RELACIÓN DETALLADA DE COMPROBANTES DE GASTOS CONFIRMADOS (${items.length})</div>
          <table>
            <thead>
              <tr>
                <th style="width: 25px; text-align: center;">#</th>
                <th style="text-align: left;">Agencia</th>
                <th style="text-align: center;">Mon</th>
                <th style="text-align: left;">Concepto / Detalle</th>
                <th style="text-align: center;">Fecha</th>
                <th style="text-align: right;">Monto</th>
                <th style="text-align: center;">Estado</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>

          <div class="signatures-row">
            <div>
              <div class="sig-line">${userName}</div>
              <div class="sig-role">Auditor Responsable</div>
            </div>
            <div>
              <div class="sig-line">Supervisión de Agencias</div>
              <div class="sig-role">Verificación y Control</div>
            </div>
            <div>
              <div class="sig-line">Gerencia de Operaciones</div>
              <div class="sig-role">Aprobación Final</div>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-fade-in font-sans">
      <div className="bg-[#0D1B22] border border-slate-800 rounded-3xl w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-gradient-to-r from-rose-950/40 via-slate-900/60 to-slate-900/80">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-rose-500/20 text-rose-400 border border-rose-500/30">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-white flex items-center gap-2">
                <span>Acta Oficial de Gastos de Agencias</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-rose-500/20 text-rose-300 border border-rose-500/30">
                  Semana {systemCycle.semana}
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Erogaciones y gastos operativos confirmados en taquillas ({systemCycle.desde} al {systemCycle.hasta})
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-emerald-500/20 transition-all cursor-pointer"
              title="Imprimir documento oficial en PDF"
            >
              <Printer className="w-4 h-4" />
              <span>Imprimir / Guardar PDF</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              title="Cerrar modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5">
          {/* Section 1: Consolidated Cards */}
          <div className="space-y-2">
            <h4 className="text-xs font-black uppercase tracking-wider text-amber-400 border-b border-slate-800 pb-1 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5" />
              <span>1. Total Gastos Operativos de Agencias por Moneda</span>
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {['BS', 'USD', 'COP'].map((mon) => {
                const tot = totalsByCurrency[mon];
                if (!tot) return null;
                return (
                  <div key={mon} className="p-3.5 rounded-2xl bg-[#071217] border border-slate-800 space-y-1">
                    <div className="flex justify-between items-center text-xs font-bold text-slate-300">
                      <span className="text-amber-400">{mon}</span>
                      <span className="text-[10px] text-slate-500 font-mono">{tot.count} comprobante(s)</span>
                    </div>
                    <div className="text-2xl font-black font-mono text-rose-400">
                      {formatCurrency(tot.total, mon as any)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Section 2: Filters */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-[#071217] p-3 rounded-2xl border border-slate-800/80">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 font-bold flex items-center gap-1">
                <Filter className="w-3.5 h-3.5" /> Filtros:
              </span>
              <div className="flex gap-1">
                {(['ALL', 'BS', 'USD', 'COP'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setSelectedCurrency(m)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold font-mono transition-colors ${
                      selectedCurrency === m
                        ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                        : 'text-slate-400 hover:text-white bg-slate-800/50'
                    }`}
                  >
                    {m === 'ALL' ? 'Todas' : m}
                  </button>
                ))}
              </div>
            </div>

            <select
              value={selectedAgency}
              onChange={(e) => setSelectedAgency(e.target.value)}
              className="bg-[#0D1B22] border border-slate-700 text-xs text-white rounded-xl px-3 py-1.5 focus:outline-none focus:border-rose-500"
            >
              <option value="ALL">Todas las Agencias ({agencyOptions.length})</option>
              {agencyOptions.map((ag) => (
                <option key={ag} value={ag}>
                  {ag}
                </option>
              ))}
            </select>
          </div>

          {/* Section 3: Detailed Table */}
          <div className="border border-slate-800 rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-[#071217] text-slate-400 border-b border-slate-800 font-bold uppercase tracking-wider text-[11px]">
                  <tr>
                    <th className="py-2.5 px-3">Agencia</th>
                    <th className="py-2.5 px-2 text-center">Moneda</th>
                    <th className="py-2.5 px-3">Concepto / Detalle</th>
                    <th className="py-2.5 px-3 text-center">Fecha</th>
                    <th className="py-2.5 px-3 text-right">Monto</th>
                    <th className="py-2.5 px-3 text-center">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 font-mono text-xs">
                  {filteredItems.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-500 font-sans">
                        No se encontraron gastos de agencias para los filtros seleccionados.
                      </td>
                    </tr>
                  ) : (
                    filteredItems.map((item, idx) => (
                      <tr key={item.id || idx} className="hover:bg-slate-800/30 transition-colors">
                        <td className="py-2 px-3 text-white font-sans font-bold">{item.agencia}</td>
                        <td className="py-2 px-2 text-center text-amber-400 font-bold">{item.moneda}</td>
                        <td className="py-2 px-3 text-slate-300 font-sans">{item.concepto || 'Gasto Operativo'}</td>
                        <td className="py-2 px-3 text-center text-slate-400">{item.fecha || '-'}</td>
                        <td className="py-2 px-3 text-right font-black text-rose-400">
                          {formatCurrency(item.monto, item.moneda)}
                        </td>
                        <td className="py-2 px-3 text-center">
                          <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-sans font-bold">
                            Confirmado
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-[#071217] flex items-center justify-between">
          <div className="text-xs text-slate-400 font-mono">
            Total mostrados: <strong className="text-white">{filteredItems.length}</strong> comprobante(s)
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs transition-colors cursor-pointer"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
