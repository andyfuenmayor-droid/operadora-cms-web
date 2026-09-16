import React from 'react';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { Printer, X, ShieldCheck, Building2, CheckCircle2 } from 'lucide-react';

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
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 overflow-y-auto animate-fade-in print:p-0 print:bg-white print:static print:inset-auto">
      <div className="bg-[#0D1B22] border border-amber-500/30 rounded-3xl max-w-4xl w-full p-6 sm:p-8 shadow-2xl space-y-6 relative overflow-hidden print:border-none print:shadow-none print:p-2 print:bg-white print:text-black">
        {/* Modal Action Bar (Hidden on print) */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4 print:hidden">
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

        {/* PRINTABLE DOCUMENT BODY */}
        <div className="space-y-6 font-sans text-xs text-slate-200 print:text-black print:space-y-4">
          {/* Document Header */}
          <div className="text-center border-b-2 border-slate-700 print:border-black pb-4 space-y-1">
            <div className="text-base sm:text-lg font-black tracking-wider uppercase text-white print:text-black">
              MULTIBANCA EXPRESS
            </div>
            <div className="text-sm font-bold text-amber-400 print:text-black uppercase">
              ACTA OFICIAL DE ENTREGA, ARQUEO Y RECEPCIÓN DE FONDOS
            </div>
            <div className="text-xs font-mono font-bold text-slate-300 print:text-black">
              {systemCycle.tipo === 'SEMANAL' ? `SEMANA ${systemCycle.semana}` : `CICLO DIARIO ${systemCycle.semana}`} ({systemCycle.desde} AL {systemCycle.hasta})
            </div>
            <div className="text-[11px] text-slate-400 print:text-gray-700 flex justify-between pt-2">
              <span><strong>Suscriptor:</strong> {companyName}</span>
              <span><strong>Emisión:</strong> {todayFormatted}</span>
              <span><strong>Auditor Responsable:</strong> {userName}</span>
            </div>
          </div>

          {/* Section 1: Executive Summary */}
          <div className="space-y-2">
            <h4 className="text-xs font-black uppercase tracking-wider text-amber-400 print:text-black border-b border-slate-800 print:border-gray-400 pb-1">
              1. RESUMEN CONSOLIDADO DE MOVIMIENTOS Y RENDICIÓN
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 print:grid-cols-3">
              {['BS', 'USD', 'COP'].map((mon) => {
                const data = totalsByCurrency[mon];
                if (!data) return null;

                return (
                  <div
                    key={mon}
                    className="p-3 rounded-2xl bg-[#071217] print:bg-gray-50 border border-slate-800 print:border-gray-300 space-y-1.5"
                  >
                    <div className="flex justify-between items-center border-b border-slate-800/80 print:border-gray-300 pb-1">
                      <span className="font-extrabold text-amber-400 print:text-black">{mon}</span>
                      <span className="text-[10px] text-slate-400 print:text-gray-600 font-mono">Consolidado</span>
                    </div>

                    <div className="text-[11px] space-y-0.5 font-mono">
                      <div className="flex justify-between">
                        <span className="text-slate-400 print:text-gray-600">Arrastre Inicial:</span>
                        <span>{formatCurrency(data.saldoAnterior, mon as any)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400 print:text-gray-600">Venta Neta:</span>
                        <span className={data.ventaNeta >= 0 ? 'text-emerald-400 print:text-black' : 'text-rose-400 print:text-black'}>
                          {formatCurrency(data.ventaNeta, mon as any)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400 print:text-gray-600">Gastos:</span>
                        <span className="text-rose-400 print:text-black">{formatCurrency(data.gastos, mon as any)}</span>
                      </div>
                      {data.cobradorRuta > 0 && (
                        <div className="flex justify-between">
                          <span className="text-slate-400 print:text-gray-600">Cobrador Ruta (QR):</span>
                          <span className="text-sky-400 print:text-black">{formatCurrency(data.cobradorRuta, mon as any)}</span>
                        </div>
                      )}
                      {data.efectivoTaquilla > 0 && (
                        <div className="flex justify-between">
                          <span className="text-slate-400 print:text-gray-600">Efectivo Taquilla:</span>
                          <span className="text-sky-400 print:text-black">{formatCurrency(data.efectivoTaquilla, mon as any)}</span>
                        </div>
                      )}
                      {data.bancos > 0 && (
                        <div className="flex justify-between">
                          <span className="text-slate-400 print:text-gray-600">Bancos (Cobros):</span>
                          <span className="text-cyan-400 print:text-black">{formatCurrency(data.bancos, mon as any)}</span>
                        </div>
                      )}
                      {data.reposicionPremios > 0 && (
                        <div className="flex justify-between">
                          <span className="text-slate-400 print:text-gray-600">Reposición Premios:</span>
                          <span className="text-amber-400 print:text-black font-bold">+{formatCurrency(data.reposicionPremios, mon as any)}</span>
                        </div>
                      )}
                      <div className="flex justify-between pt-1 border-t border-slate-800 print:border-gray-300 font-bold">
                        <span className="text-slate-300 print:text-black">Saldo Final:</span>
                        <span className={data.saldoFinal >= 0 ? 'text-emerald-400 print:text-black' : 'text-rose-400 print:text-black'}>
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
            <h4 className="text-xs font-black uppercase tracking-wider text-amber-400 print:text-black border-b border-slate-800 print:border-gray-400 pb-1">
              2. DESGLOSE INDIVIDUAL DE PUNTOS DE VENTA (AGENCIAS)
            </h4>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-[11px] border-collapse">
                <thead>
                  <tr className="border-b border-slate-700 print:border-black bg-slate-900/60 print:bg-gray-100 text-slate-300 print:text-black font-bold uppercase">
                    <th className="py-2 px-2">Agencia</th>
                    <th className="py-2 px-1 text-center">Mon</th>
                    <th className="py-2 px-2 text-right">Arrastre</th>
                    <th className="py-2 px-2 text-right">Vta Neta</th>
                    <th className="py-2 px-2 text-right">Gastos</th>
                    <th className="py-2 px-2 text-right">Cobrador</th>
                    <th className="py-2 px-2 text-right">Bancos</th>
                    <th className="py-2 px-2 text-right">Premios</th>
                    <th className="py-2 px-2 text-right font-black">Saldo Final</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 print:divide-gray-300 font-mono">
                  {auditRows.map((r, idx) => (
                    <tr key={`${r.entidad}_${r.moneda}_${idx}`} className="hover:bg-slate-800/20 print:hover:bg-transparent">
                      <td className="py-1.5 px-2 font-sans font-bold text-white print:text-black truncate max-w-[150px]">
                        {r.entidad}
                      </td>
                      <td className="py-1.5 px-1 text-center text-slate-400 print:text-black font-bold">
                        {r.moneda}
                      </td>
                      <td className="py-1.5 px-2 text-right text-slate-400 print:text-black">
                        {formatCurrency(r.saldo_anterior, r.moneda)}
                      </td>
                      <td className={`py-1.5 px-2 text-right ${r.venta_neta >= 0 ? 'text-emerald-400 print:text-black' : 'text-rose-400 print:text-black'}`}>
                        {formatCurrency(r.venta_neta, r.moneda)}
                      </td>
                      <td className="py-1.5 px-2 text-right text-rose-400 print:text-black">
                        {r.gastos > 0 ? formatCurrency(r.gastos, r.moneda) : '-'}
                      </td>
                      <td className="py-1.5 px-2 text-right text-sky-400 print:text-black">
                        {r.cobrador_ruta > 0 ? formatCurrency(r.cobrador_ruta, r.moneda) : r.efectivo_taquilla > 0 ? formatCurrency(r.efectivo_taquilla, r.moneda) : '-'}
                      </td>
                      <td className="py-1.5 px-2 text-right text-cyan-400 print:text-black">
                        {r.bancos > 0 ? formatCurrency(r.bancos, r.moneda) : '-'}
                      </td>
                      <td className="py-1.5 px-2 text-right text-amber-400 print:text-black font-bold">
                        {r.reposicion_premios > 0 ? `+${formatCurrency(r.reposicion_premios, r.moneda)}` : '-'}
                      </td>
                      <td className={`py-1.5 px-2 text-right font-black ${r.saldo_final >= 0 ? 'text-emerald-400 print:text-black' : 'text-rose-400 print:text-black'}`}>
                        {formatCurrency(r.saldo_final, r.moneda)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Section 3: Conformity Statement */}
          <div className="p-3.5 rounded-2xl bg-slate-900/60 print:bg-gray-50 border border-slate-800 print:border-gray-300 text-[11px] leading-relaxed">
            <strong>DECLARACIÓN DE CONFORMIDAD Y AUDITORÍA:</strong>
            <p className="text-slate-300 print:text-gray-800 mt-1">
              Por medio de la presente acta se hace constar la verificación formal de los cobros en efectivo recaudados por cobradores de ruta, entregas directas en taquillas, transferencias bancarias y reposiciones de premios correspondientes al ciclo auditado, declarando plena conformidad con los saldos de arrastre resultantes que serán traspasados al siguiente período.
            </p>
          </div>

          {/* Section 4: Signatures */}
          <div className="pt-8 print:pt-12 grid grid-cols-3 gap-6 text-center text-[11px]">
            <div className="space-y-1">
              <div className="border-t border-slate-500 print:border-black pt-1 font-bold text-white print:text-black">
                ENTREGADO POR
              </div>
              <div className="text-slate-400 print:text-gray-700 text-[10px]">Supervisor / Cobrador de Ruta</div>
              <div className="text-[10px] text-slate-500 print:text-gray-500 pt-3">C.I: ____________________</div>
            </div>

            <div className="space-y-1">
              <div className="border-t border-slate-500 print:border-black pt-1 font-bold text-white print:text-black">
                RECIBIDO POR
              </div>
              <div className="text-slate-400 print:text-gray-700 text-[10px]">Caja Central / Administración</div>
              <div className="text-[10px] text-slate-500 print:text-gray-500 pt-3">C.I: ____________________</div>
            </div>

            <div className="space-y-1">
              <div className="border-t border-slate-500 print:border-black pt-1 font-bold text-white print:text-black">
                AUDITADO POR
              </div>
              <div className="text-slate-400 print:text-gray-700 text-[10px]">Contabilidad / Auditoría</div>
              <div className="text-[10px] text-slate-500 print:text-gray-500 pt-3">C.I: ____________________</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
