import React, { useState, useMemo } from 'react';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { Printer, X, ShieldCheck, Landmark, Filter, ArrowDownLeft, ArrowUpRight, TrendingUp, TrendingDown, Layers } from 'lucide-react';

export interface BankTransactionAuditItem {
  id: string;
  fecha: string;
  agencia: string;
  banco: string;
  cuenta?: string;
  tipo: 'ENTRADA' | 'SALIDA'; // ENTRADA = Cobro bancario; SALIDA = Reposición de premios o egreso
  subtipo?: 'COBRO' | 'REPOSICION' | 'GASTO';
  referencia: string;
  concepto?: string;
  moneda: 'BS' | 'USD' | 'COP';
  monto: number;
  confirmado_por?: string;
  confirmado?: boolean;
}

export interface BankIncomeActaModalProps {
  isOpen?: boolean;
  onClose: () => void;
  systemCycle: { semana: string; desde: string; hasta: string; tipo: string };
  userName?: string;
  companyName?: string;
  items: BankTransactionAuditItem[];
}

export const BankIncomeActaModal: React.FC<BankIncomeActaModalProps> = ({
  isOpen = true,
  onClose,
  systemCycle,
  userName = 'Operador de Bancos',
  companyName = 'CORPORACION CALENDARIO, CA',
  items,
}) => {
  const [selectedCurrency, setSelectedCurrency] = useState<'ALL' | 'BS' | 'USD' | 'COP'>('ALL');
  const [selectedFlow, setSelectedFlow] = useState<'ALL' | 'ENTRADA' | 'SALIDA'>('ALL');
  const [selectedBank, setSelectedBank] = useState<string>('ALL');

  const todayFormatted = new Date().toLocaleDateString('es-VE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  // Extract unique bank names
  const bankOptions = useMemo(() => {
    const set = new Set<string>();
    items.forEach((item) => {
      if (item.banco) set.add(item.banco.trim().toUpperCase());
    });
    return Array.from(set).sort();
  }, [items]);

  // Filtered transactions
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchMon = selectedCurrency === 'ALL' || item.moneda === selectedCurrency;
      const matchFlow = selectedFlow === 'ALL' || item.tipo === selectedFlow;
      const matchBank = selectedBank === 'ALL' || item.banco.trim().toUpperCase() === selectedBank;
      return matchMon && matchFlow && matchBank;
    });
  }, [items, selectedCurrency, selectedFlow, selectedBank]);

  // Summaries per Bank & Currency (Entradas, Salidas, Total Neto)
  const bankSummaries = useMemo(() => {
    const map = new Map<string, {
      banco: string;
      moneda: 'BS' | 'USD' | 'COP';
      entradas: number;
      salidas: number;
      totalNeto: number;
      countEntradas: number;
      countSalidas: number;
    }>();

    items.forEach((item) => {
      const bKey = `${item.banco.trim().toUpperCase()}_${item.moneda}`;
      if (!map.has(bKey)) {
        map.set(bKey, {
          banco: item.banco.trim().toUpperCase(),
          moneda: item.moneda,
          entradas: 0,
          salidas: 0,
          totalNeto: 0,
          countEntradas: 0,
          countSalidas: 0,
        });
      }

      const rec = map.get(bKey)!;
      if (item.tipo === 'ENTRADA') {
        rec.entradas += item.monto;
        rec.countEntradas += 1;
      } else {
        rec.salidas += item.monto;
        rec.countSalidas += 1;
      }
      rec.totalNeto = Math.round((rec.entradas - rec.salidas) * 100) / 100;
    });

    return Array.from(map.values()).sort((a, b) => {
      if (a.moneda !== b.moneda) return a.moneda.localeCompare(b.moneda);
      return b.entradas - a.entradas;
    });
  }, [items]);

  // Global Totals by Currency
  const totalsByCurrency = useMemo(() => {
    const res: Record<string, { entradas: number; salidas: number; neto: number; countEntradas: number; countSalidas: number }> = {
      BS: { entradas: 0, salidas: 0, neto: 0, countEntradas: 0, countSalidas: 0 },
      USD: { entradas: 0, salidas: 0, neto: 0, countEntradas: 0, countSalidas: 0 },
      COP: { entradas: 0, salidas: 0, neto: 0, countEntradas: 0, countSalidas: 0 },
    };

    items.forEach((item) => {
      if (!res[item.moneda]) return;
      if (item.tipo === 'ENTRADA') {
        res[item.moneda].entradas += item.monto;
        res[item.moneda].countEntradas += 1;
      } else {
        res[item.moneda].salidas += item.monto;
        res[item.moneda].countSalidas += 1;
      }
      res[item.moneda].neto = Math.round((res[item.moneda].entradas - res[item.moneda].salidas) * 100) / 100;
    });

    return res;
  }, [items]);

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Por favor permita las ventanas emergentes para imprimir el acta bancaria.');
      return;
    }

    const htmlContent = `
      <!DOCTYPE html>
      <html lang="es">
        <head>
          <meta charset="utf-8">
          <title>Acta Oficial de Ingresos y Movimientos en Cuentas Bancarias - Ciclo ${systemCycle.semana}</title>
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
              color: #0369a1;
              margin-top: 2px;
            }
            .meta-row {
              display: flex;
              justify-content: space-between;
              margin-top: 4px;
              font-size: 9px;
              color: #475569;
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
            .tag-entrada {
              color: #047857;
              font-weight: 800;
            }
            .tag-salida {
              color: #b91c1c;
              font-weight: 800;
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
                <div class="doc-title">ACTA OFICIAL DE INGRESOS Y MOVIMIENTOS EN CUENTAS BANCARIAS</div>
                <div style="font-size: 8.5px; color: #64748b; margin-top: 1px;">
                  Auditoría Financiera de Depósitos, Transferencias, Cobranza Bancaria y Reposición de Premios
                </div>
              </div>
              <div style="text-align: right; font-size: 9px; font-mono;">
                <div><strong>Fecha Emisión:</strong> ${todayFormatted}</div>
                <div><strong>Ciclo:</strong> ${systemCycle.tipo === 'SEMANAL' ? `Semana ${systemCycle.semana}` : `Ciclo ${systemCycle.semana}`}</div>
                <div><strong>Rango:</strong> ${systemCycle.desde} al ${systemCycle.hasta}</div>
              </div>
            </div>
          </div>

          <!-- Section 1: Bank Summary Matrix -->
          <div class="section-header">1. RESUMEN DE POSICIÓN FINANCIERA POR CUENTA BANCARIA (ENTRADAS, SALIDAS Y FLUJO NETO)</div>
          <table>
            <thead>
              <tr>
                <th style="text-align: left;">Banco / Cuenta Destino</th>
                <th style="text-align: center;">Moneda</th>
                <th style="text-align: right;">Total Entradas (Cobros)</th>
                <th style="text-align: right;">Total Salidas (Reposición / Gastos)</th>
                <th style="text-align: right;">Flujo Neto Bancario</th>
                <th style="text-align: center;">N° Operaciones</th>
              </tr>
            </thead>
            <tbody>
              ${bankSummaries.map((bs) => `
                <tr>
                  <td style="font-family: sans-serif; font-weight: bold; text-align: left;">${bs.banco}</td>
                  <td style="text-align: center; font-weight: bold;">${bs.moneda}</td>
                  <td style="text-align: right; font-weight: bold; color: #047857;">${formatCurrency(bs.entradas, bs.moneda)}</td>
                  <td style="text-align: right; font-weight: bold; color: #b91c1c;">${formatCurrency(bs.salidas, bs.moneda)}</td>
                  <td style="text-align: right; font-weight: 900; color: ${bs.totalNeto >= 0 ? '#047857' : '#0369a1'};">
                    ${formatCurrency(bs.totalNeto, bs.moneda)}
                  </td>
                  <td style="text-align: center; color: #64748b;">${bs.countEntradas} ent. / ${bs.countSalidas} sal.</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <!-- Section 2: Global Totals -->
          <div class="section-header">2. TOTALES GLOBALES BANCARIOS POR MONEDA</div>
          <table>
            <thead>
              <tr>
                <th style="text-align: center;">Moneda</th>
                <th style="text-align: right;">Total Entradas (Cobros Bancarios)</th>
                <th style="text-align: right;">Total Salidas (Reposición de Premios)</th>
                <th style="text-align: right;">Flujo Neto Global</th>
                <th style="text-align: center;">Total Transacciones</th>
              </tr>
            </thead>
            <tbody>
              ${Object.entries(totalsByCurrency).map(([mon, t]) => `
                <tr style="background: #f8fafc; font-weight: bold;">
                  <td style="text-align: center; font-size: 10px;">${mon}</td>
                  <td style="text-align: right; color: #047857; font-size: 10px;">${formatCurrency(t.entradas, mon as any)}</td>
                  <td style="text-align: right; color: #b91c1c; font-size: 10px;">${formatCurrency(t.salidas, mon as any)}</td>
                  <td style="text-align: right; font-size: 10.5px; color: ${t.neto >= 0 ? '#047857' : '#0369a1'};">
                    ${formatCurrency(t.neto, mon as any)}
                  </td>
                  <td style="text-align: center; color: #475569;">${t.countEntradas + t.countSalidas} ops</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <!-- Section 3: Detailed Transactions -->
          <div class="section-header">3. DETALLE DE MOVIMIENTOS BANCARIOS CONCILIADOS (${filteredItems.length})</div>
          <table>
            <thead>
              <tr>
                <th style="text-align: center; width: 25px;">#</th>
                <th style="text-align: center; width: 65px;">Fecha</th>
                <th style="text-align: left;">Agencia</th>
                <th style="text-align: left;">Banco / Cuenta</th>
                <th style="text-align: center; width: 65px;">Tipo</th>
                <th style="text-align: left;">Referencia / Comprobante</th>
                <th style="text-align: center; width: 35px;">Mon</th>
                <th style="text-align: right;">Monto</th>
                <th style="text-align: left;">Confirmado Por</th>
                <th style="text-align: center; width: 70px;">Estatus</th>
              </tr>
            </thead>
            <tbody>
              ${filteredItems.map((r, idx) => `
                <tr>
                  <td style="text-align: center; color: #64748b;">${idx + 1}</td>
                  <td style="text-align: center;">${formatDate(r.fecha)}</td>
                  <td style="font-family: sans-serif; font-weight: bold; text-align: left;">${r.agencia}</td>
                  <td style="text-align: left; color: #334155;">${r.banco}</td>
                  <td style="text-align: center;">
                    <span class="${r.tipo === 'ENTRADA' ? 'tag-entrada' : 'tag-salida'}">
                      ${r.tipo === 'ENTRADA' ? '🟢 ENTRADA' : '🔴 SALIDA'}
                    </span>
                  </td>
                  <td style="text-align: left; font-size: 8.5px; color: #475569;">${r.referencia || '-'}</td>
                  <td style="text-align: center; font-weight: bold;">${r.moneda}</td>
                  <td style="text-align: right; font-weight: bold; color: ${r.tipo === 'ENTRADA' ? '#047857' : '#b91c1c'};">
                    ${formatCurrency(r.monto, r.moneda)}
                  </td>
                  <td style="text-align: left; font-size: 8.5px; color: #64748b;">${r.confirmado_por || userName}</td>
                  <td style="text-align: center; font-weight: bold; color: #047857;">CONCILIADO</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <!-- Section 4: Conformity Statement -->
          <div class="statement-card">
            <strong>DECLARACIÓN JURADA DE CONCILIACIÓN BANCARIA Y AUDITORÍA DE CUENTAS:</strong>
            <p style="margin: 3px 0 0 0; color: #334155;">
              Por medio de la presente acta se certifica la verificación exhaustiva de todos los abonos en cuenta bancaria, transferencias interbancarias, depósitos en efectivo vía taquilla bancaria y pagos móviles correspondientes a la cobranza de las agencias del ciclo operativo, así como los desembolsos y reposiciones de premios efectuados por la Operadora, certificando la total concordancia entre las referencias bancarias registradas y los extractos oficiales de las cuentas bancarias adscritas.
            </p>
          </div>

          <!-- Section 5: Signatures -->
          <div class="signatures-row">
            <div>
              <div class="sig-line">ELABORADO POR</div>
              <div class="sig-role">Operador de Bancos / Confirmaciones</div>
              <div class="sig-ci">C.I: ____________________</div>
            </div>
            <div>
              <div class="sig-line">CONCILIADO POR</div>
              <div class="sig-role">Caja Central / Tesorería</div>
              <div class="sig-ci">C.I: ____________________</div>
            </div>
            <div>
              <div class="sig-line">AUDITADO POR</div>
              <div class="sig-role">Contabilidad / Auditoría Externa</div>
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
      <div className="bg-[#0B151A] border border-sky-500/30 rounded-3xl max-w-5xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden relative my-auto">
        {/* Header Modal */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-gradient-to-r from-sky-950/40 via-slate-900 to-slate-900">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-sky-500/20 text-sky-400 border border-sky-500/30">
              <Landmark className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
                Acta de Movimientos e Ingresos en Cuentas Bancarias
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-400 border border-sky-500/30 font-mono">
                  {systemCycle.tipo === 'SEMANAL' ? `Semana ${systemCycle.semana}` : `Ciclo ${systemCycle.semana}`}
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Auditoría financiera de cuentas receptoras: Entradas (Cobros), Salidas (Reposición de Premios) y Balance Neto
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-sky-500 to-teal-500 hover:from-sky-400 hover:to-teal-400 text-slate-950 font-black text-xs shadow-lg shadow-sky-500/20 flex items-center gap-1.5 transition-all cursor-pointer"
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
                    ? 'bg-sky-500 text-slate-950 font-black'
                    : 'text-slate-400 hover:text-white bg-slate-800/60'
                }`}
              >
                {mon === 'ALL' ? 'Todas' : mon}
              </button>
            ))}
          </div>

          {/* Flow Filter (Entradas vs Salidas) */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-bold uppercase text-slate-400">Flujo:</span>
            <button
              onClick={() => setSelectedFlow('ALL')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                selectedFlow === 'ALL'
                  ? 'bg-sky-500 text-slate-950 font-black'
                  : 'text-slate-400 hover:text-white bg-slate-800/60'
              }`}
            >
              Todos ({items.length})
            </button>
            <button
              onClick={() => setSelectedFlow('ENTRADA')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                selectedFlow === 'ENTRADA'
                  ? 'bg-emerald-500 text-slate-950 font-black'
                  : 'text-slate-400 hover:text-white bg-slate-800/60'
              }`}
            >
              🟢 Entradas ({items.filter((i) => i.tipo === 'ENTRADA').length})
            </button>
            <button
              onClick={() => setSelectedFlow('SALIDA')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                selectedFlow === 'SALIDA'
                  ? 'bg-rose-500 text-slate-950 font-black'
                  : 'text-slate-400 hover:text-white bg-slate-800/60'
              }`}
            >
              🔴 Salidas ({items.filter((i) => i.tipo === 'SALIDA').length})
            </button>
          </div>

          {/* Bank Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-bold uppercase text-slate-400">Banco:</span>
            <select
              value={selectedBank}
              onChange={(e) => setSelectedBank(e.target.value)}
              className="bg-[#071217] border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none focus:border-sky-500 cursor-pointer"
            >
              <option value="ALL">Todos los Bancos ({bankOptions.length})</option>
              {bankOptions.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-6">
          {/* Section 1: Summary Table by Bank (Entradas, Salidas, Total Neto) */}
          <div className="space-y-2">
            <div className="flex justify-between items-center border-b border-slate-800 pb-1">
              <h4 className="text-xs font-black uppercase tracking-wider text-sky-400 flex items-center gap-1.5">
                <Landmark className="w-3.5 h-3.5" />
                1. POSICIÓN FINANCIERA POR CUENTA BANCARIA RECEPTORA (ENTRADAS, SALIDAS Y TOTAL NETO)
              </h4>
              <span className="text-[10px] text-slate-400 font-mono">{bankSummaries.length} cuenta(s)</span>
            </div>

            <div className="overflow-x-auto border border-slate-800 rounded-2xl">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-[#071217] border-b border-slate-800 text-slate-400 font-bold uppercase text-[10px]">
                  <tr>
                    <th className="py-2.5 px-3">Banco / Cuenta Destino</th>
                    <th className="py-2.5 px-2 text-center">Moneda</th>
                    <th className="py-2.5 px-3 text-right">🟢 Entradas (Cobros)</th>
                    <th className="py-2.5 px-3 text-right">🔴 Salidas (Reposición/Gastos)</th>
                    <th className="py-2.5 px-3 text-right">Flujo Neto</th>
                    <th className="py-2.5 px-3 text-center">Operaciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80 font-mono text-[11px]">
                  {bankSummaries.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-4 text-center text-slate-500 font-sans">
                        No hay movimientos bancarios registrados en este ciclo.
                      </td>
                    </tr>
                  ) : (
                    bankSummaries.map((bs) => (
                      <tr key={`${bs.banco}_${bs.moneda}`} className="hover:bg-slate-800/30 transition-colors">
                        <td className="py-2.5 px-3 font-sans font-bold text-white flex items-center gap-2">
                          <span className="p-1 rounded bg-sky-500/10 text-sky-400">🏛️</span>
                          {bs.banco}
                        </td>
                        <td className="py-2.5 px-2 text-center font-bold text-slate-300">{bs.moneda}</td>
                        <td className="py-2.5 px-3 text-right font-black text-emerald-400">
                          {formatCurrency(bs.entradas, bs.moneda)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-black text-rose-400">
                          {formatCurrency(bs.salidas, bs.moneda)}
                        </td>
                        <td
                          className={`py-2.5 px-3 text-right font-black ${
                            bs.totalNeto >= 0 ? 'text-emerald-400' : 'text-cyan-400'
                          }`}
                        >
                          {formatCurrency(bs.totalNeto, bs.moneda)}
                        </td>
                        <td className="py-2.5 px-3 text-center text-[10px] text-slate-400 font-sans">
                          {bs.countEntradas} ent. / {bs.countSalidas} sal.
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Section 2: Global Totals Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {Object.entries(totalsByCurrency).map(([mon, t]) => (
              <div key={mon} className="p-3.5 rounded-2xl bg-[#071217] border border-slate-800 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-sky-400 uppercase">Totales {mon}</span>
                  <span className="text-[10px] font-mono text-slate-400">{t.countEntradas + t.countSalidas} ops</span>
                </div>
                <div className="space-y-1 text-xs font-mono">
                  <div className="flex justify-between text-emerald-400">
                    <span className="font-sans text-[11px] text-slate-400">Entradas (Cobros):</span>
                    <span className="font-black">+{formatCurrency(t.entradas, mon as any)}</span>
                  </div>
                  <div className="flex justify-between text-rose-400">
                    <span className="font-sans text-[11px] text-slate-400">Salidas (Reposición):</span>
                    <span className="font-black">-{formatCurrency(t.salidas, mon as any)}</span>
                  </div>
                  <div className="flex justify-between pt-1 border-t border-slate-800 text-white font-black text-sm">
                    <span className="font-sans text-[11px] text-slate-300">Balance Neto:</span>
                    <span className={t.neto >= 0 ? 'text-emerald-400' : 'text-cyan-400'}>
                      {formatCurrency(t.neto, mon as any)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Section 3: Detailed Transactions */}
          <div className="space-y-2">
            <div className="flex justify-between items-center border-b border-slate-800 pb-1">
              <h4 className="text-xs font-black uppercase tracking-wider text-sky-400">
                2. MOVIMIENTOS BANCARIOS AUDITADOS ({filteredItems.length})
              </h4>
              <span className="text-[10px] text-slate-400 font-mono">Mostrando {filteredItems.length} comprobantes</span>
            </div>

            <div className="overflow-x-auto max-h-[350px] overflow-y-auto border border-slate-800 rounded-2xl">
              <table className="w-full text-left text-[11px] border-collapse">
                <thead className="sticky top-0 bg-slate-900 border-b border-slate-700 text-slate-300 font-bold uppercase text-[10px]">
                  <tr>
                    <th className="py-2 px-2 text-center">#</th>
                    <th className="py-2 px-2 text-center">Fecha</th>
                    <th className="py-2 px-2">Agencia</th>
                    <th className="py-2 px-2">Banco / Cuenta Destino</th>
                    <th className="py-2 px-2 text-center">Flujo</th>
                    <th className="py-2 px-2">Referencia / Comprobante</th>
                    <th className="py-2 px-1 text-center">Mon</th>
                    <th className="py-2 px-2 text-right">Monto</th>
                    <th className="py-2 px-2">Confirmado Por</th>
                    <th className="py-2 px-2 text-center">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80 font-mono">
                  {filteredItems.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-6 text-center text-slate-500 font-sans">
                        No se encontraron movimientos bancarios para los filtros seleccionados.
                      </td>
                    </tr>
                  ) : (
                    filteredItems.map((r, idx) => (
                      <tr key={`${r.id}_${idx}`} className="hover:bg-slate-800/25 transition-colors">
                        <td className="py-1.5 px-2 text-center text-slate-500">{idx + 1}</td>
                        <td className="py-1.5 px-2 text-center text-slate-300">{formatDate(r.fecha)}</td>
                        <td className="py-1.5 px-2 font-sans font-bold text-white truncate max-w-[130px]">
                          {r.agencia}
                        </td>
                        <td className="py-1.5 px-2 text-slate-300 truncate max-w-[150px]">
                          {r.banco}
                        </td>
                        <td className="py-1.5 px-2 text-center">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase ${
                              r.tipo === 'ENTRADA'
                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                            }`}
                          >
                            {r.tipo === 'ENTRADA' ? '🟢 ENTRADA' : '🔴 SALIDA'}
                          </span>
                        </td>
                        <td className="py-1.5 px-2 text-slate-400 font-mono text-[10px] truncate max-w-[160px]">
                          {r.referencia || '-'}
                        </td>
                        <td className="py-1.5 px-1 text-center font-bold text-slate-300">{r.moneda}</td>
                        <td
                          className={`py-1.5 px-2 text-right font-black ${
                            r.tipo === 'ENTRADA' ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {formatCurrency(r.monto, r.moneda)}
                        </td>
                        <td className="py-1.5 px-2 text-slate-400 text-[10px] truncate max-w-[110px]">
                          {r.confirmado_por || userName}
                        </td>
                        <td className="py-1.5 px-2 text-center text-emerald-400 font-bold text-[10px]">
                          CONCILIADO
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Section 4: Conformity Statement */}
          <div className="p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800 text-[11px] leading-relaxed">
            <strong>DECLARACIÓN JURADA DE CONCILIACIÓN BANCARIA Y AUDITORÍA DE CUENTAS:</strong>
            <p className="text-slate-300 mt-1">
              Por medio de la presente acta se certifica la verificación exhaustiva de todos los abonos en cuenta bancaria, transferencias interbancarias, depósitos en efectivo vía taquilla bancaria y pagos móviles correspondientes a la cobranza de las agencias del ciclo operativo, así como los desembolsos y reposiciones de premios efectuados por la Operadora, certificando la total concordancia entre las referencias bancarias registradas y los extractos oficiales de las cuentas bancarias adscritas.
            </p>
          </div>

          {/* Section 5: Signatures */}
          <div className="pt-6 grid grid-cols-3 gap-6 text-center text-[11px]">
            <div className="space-y-1">
              <div className="border-t border-slate-500 pt-1 font-bold text-white">
                ELABORADO POR
              </div>
              <div className="text-slate-400 text-[10px]">Operador de Bancos / Confirmaciones</div>
              <div className="text-[10px] text-slate-500 pt-3">C.I: ____________________</div>
            </div>

            <div className="space-y-1">
              <div className="border-t border-slate-500 pt-1 font-bold text-white">
                CONCILIADO POR
              </div>
              <div className="text-slate-400 text-[10px]">Caja Central / Tesorería</div>
              <div className="text-[10px] text-slate-500 pt-3">C.I: ____________________</div>
            </div>

            <div className="space-y-1">
              <div className="border-t border-slate-500 pt-1 font-bold text-white">
                AUDITADO POR
              </div>
              <div className="text-slate-400 text-[10px]">Contabilidad / Auditoría Externa</div>
              <div className="text-[10px] text-slate-500 pt-3">C.I: ____________________</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
