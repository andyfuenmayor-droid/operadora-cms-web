import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { formatCurrency, formatDate } from '../../utils/formatters';
import {
  Printer,
  X,
  ShieldCheck,
  FileText,
  Receipt,
  Landmark,
  Banknote,
  Building2,
  CheckCircle2,
  Layers,
} from 'lucide-react';
import type { PreClosureAgencyRow } from './DeliveryReportModal';
import type { ConsolidatedExpenseItem, AdministrativeExpenseItem } from '../../utils/consolidations';
import type { BankTransactionAuditItem } from './BankIncomeActaModal';
import type { CashDeliveryAuditItem } from './CashDeliveryActaModal';
import type { ConfirmationAuditItem } from './ConfirmationOperatorActaModal';

export interface UnifiedAuditDossierModalProps {
  isOpen?: boolean;
  onClose: () => void;
  systemCycle: { semana: string; desde: string; hasta: string; tipo: string };
  userName?: string;
  companyName?: string;
  auditRows: PreClosureAgencyRow[];
  totalsByCurrency: Record<string, {
    saldoAnterior: number;
    ventaNeta: number;
    gastos: number;
    gastosAgencias?: number;
    gastosComercializadora?: number;
    cobradorRuta: number;
    cobradorLiquidado?: number;
    cobradorEnRuta?: number;
    efectivoTaquilla: number;
    bancos: number;
    reposicionPremios: number;
    saldoFinal: number;
  }>;
  adminExpensesByCurrency?: Record<string, number>;
  agencyExpenses?: ConsolidatedExpenseItem[];
  adminExpenses?: AdministrativeExpenseItem[];
  bankTransactions?: BankTransactionAuditItem[];
  cashDeliveries?: CashDeliveryAuditItem[];
  confirmations?: ConfirmationAuditItem[];
}

export const UnifiedAuditDossierModal: React.FC<UnifiedAuditDossierModalProps> = ({
  isOpen = true,
  onClose,
  systemCycle,
  userName = 'Administración',
  companyName = 'CORPORACION CALENDARIO, CA',
  auditRows = [],
  totalsByCurrency = {},
  adminExpensesByCurrency = {},
  agencyExpenses = [],
  adminExpenses = [],
  bankTransactions = [],
  cashDeliveries = [],
  confirmations = [],
}) => {
  const [activeTab, setActiveTab] = useState<'all' | 'matriz' | 'gastos' | 'bancos' | 'efectivo' | 'confirmaciones'>('all');

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

    // 1. Matriz General Rows
    const generalRowsHtml = auditRows
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

    // Summary Cards HTML
    const summariesHtml = ['BS', 'USD', 'COP']
      .map((mon) => {
        const d = totalsByCurrency[mon];
        if (!d) return '';
        const admGasto = (adminExpensesByCurrency && adminExpensesByCurrency[mon]) || (d.gastosComercializadora || 0);
        const saldoFinalConsolidado = Math.round((d.saldoFinal - (d.gastosComercializadora ? 0 : admGasto)) * 100) / 100;
        return `
        <div style="border: 1px solid #cbd5e1; border-radius: 6px; padding: 6px 8px; background: #f8fafc;">
          <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #e2e8f0; padding-bottom: 3px; margin-bottom: 4px; font-weight: bold;">
            <span style="font-size: 11px; color: #0f172a;">${mon}</span>
            <span style="font-size: 9px; color: #64748b;">Consolidado</span>
          </div>
          <div style="font-size: 9.5px; font-family: monospace; line-height: 1.4;">
            <div style="display: flex; justify-content: space-between;"><span style="color: #64748b;">Arrastre Inicial:</span><span>${formatCurrency(d.saldoAnterior, mon as any)}</span></div>
            <div style="display: flex; justify-content: space-between;"><span style="color: #64748b;">Venta Neta:</span><span>${formatCurrency(d.ventaNeta, mon as any)}</span></div>
            <div style="display: flex; justify-content: space-between;"><span style="color: #64748b;">Gastos Agencias:</span><span style="color: #b91c1c;">${formatCurrency(d.gastosAgencias ?? d.gastos, mon as any)}</span></div>
            <div style="display: flex; justify-content: space-between;"><span style="color: #64748b;">Gastos Comercializadora:</span><span style="color: #b91c1c;">${formatCurrency(admGasto, mon as any)}</span></div>
            ${(d.cobradorEnRuta || 0) > 0 ? `<div style="display: flex; justify-content: space-between;"><span style="color: #d97706;">En Ruta:</span><span style="color: #d97706; font-weight: bold;">${formatCurrency(d.cobradorEnRuta || 0, mon as any)}</span></div>` : ''}
            ${(d.cobradorLiquidado || 0) > 0 ? `<div style="display: flex; justify-content: space-between;"><span style="color: #059669;">Liquidado Admin:</span><span style="color: #059669; font-weight: bold;">${formatCurrency(d.cobradorLiquidado || 0, mon as any)}</span></div>` : ''}
            ${d.efectivoTaquilla > 0 ? `<div style="display: flex; justify-content: space-between;"><span style="color: #64748b;">Efec Taquilla:</span><span style="color: #0284c7;">${formatCurrency(d.efectivoTaquilla, mon as any)}</span></div>` : ''}
            ${d.bancos > 0 ? `<div style="display: flex; justify-content: space-between;"><span style="color: #64748b;">Bancos:</span><span style="color: #0f766e;">${formatCurrency(d.bancos, mon as any)}</span></div>` : ''}
            ${d.reposicionPremios > 0 ? `<div style="display: flex; justify-content: space-between;"><span style="color: #64748b;">Reposición:</span><span style="color: #b45309; font-weight: bold;">+${formatCurrency(d.reposicionPremios, mon as any)}</span></div>` : ''}
            <div style="display: flex; justify-content: space-between; border-top: 1px solid #cbd5e1; padding-top: 2px; margin-top: 2px; font-weight: bold;">
              <span>Saldo Final:</span>
              <span style="color: ${saldoFinalConsolidado >= 0 ? '#047857' : '#b91c1c'};">${formatCurrency(saldoFinalConsolidado, mon as any)}</span>
            </div>
          </div>
        </div>
      `;
      })
      .join('');

    // 2. Gastos Agencias Rows
    const agencyExpRows = agencyExpenses
      .map(
        (g) => `
      <tr>
        <td style="text-align: left; font-weight: bold;">${g.agencia}</td>
        <td style="text-align: left;">${g.concepto || 'OPERATIVO TAQUILLA'}</td>
        <td style="text-align: center;">${g.fecha ? formatDate(g.fecha) : '-'}</td>
        <td style="text-align: center; font-weight: bold;">${g.moneda}</td>
        <td style="text-align: right; font-weight: bold; color: #b91c1c;">${formatCurrency(g.monto, g.moneda)}</td>
        <td style="text-align: center;"><span style="color: #059669; font-weight: bold;">✅ Confirmado</span></td>
      </tr>
    `
      )
      .join('');

    // 3. Gastos Comercializadora Rows
    const adminExpRows = adminExpenses
      .map(
        (a) => `
      <tr>
        <td style="text-align: left; font-weight: bold;">${a.categoria || 'ADMINISTRATIVO'}</td>
        <td style="text-align: left;">${a.concepto}</td>
        <td style="text-align: left;">${a.beneficiario || 'PERSONAL / PROVEEDOR'}</td>
        <td style="text-align: center;">${a.referencia || 'N/A'}</td>
        <td style="text-align: center; font-weight: bold;">${a.moneda}</td>
        <td style="text-align: right; font-weight: bold; color: #b91c1c;">${formatCurrency(a.monto, a.moneda)}</td>
      </tr>
    `
      )
      .join('');

    // 4. Bancos Rows
    const bankRows = bankTransactions
      .map(
        (b) => `
      <tr>
        <td style="text-align: left; font-weight: bold;">${b.banco || 'BANCO'}</td>
        <td style="text-align: left;">${b.agencia}</td>
        <td style="text-align: center; font-family: monospace;">${b.referencia}</td>
        <td style="text-align: center;">${b.fecha ? formatDate(b.fecha) : '-'}</td>
        <td style="text-align: center; font-weight: bold;">${b.moneda}</td>
        <td style="text-align: right; font-weight: bold; color: ${b.tipo === 'SALIDA' ? '#b45309' : '#047857'};">
          ${b.tipo === 'SALIDA' ? '-' : '+'}${formatCurrency(b.monto, b.moneda)}
        </td>
      </tr>
    `
      )
      .join('');

    // 5. Efectivo Rows
    const cashRows = cashDeliveries
      .map(
        (c) => `
      <tr>
        <td style="text-align: left; font-weight: bold;">${c.agencia}</td>
        <td style="text-align: center;">${c.modalidad}</td>
        <td style="text-align: left;">${c.concepto || c.referencia || 'ENTREGA DE EFECTIVO'}</td>
        <td style="text-align: center;">${c.fecha ? formatDate(c.fecha) : '-'}</td>
        <td style="text-align: center; font-weight: bold;">${c.moneda}</td>
        <td style="text-align: right; font-weight: bold; color: #0284c7;">${formatCurrency(c.monto, c.moneda)}</td>
      </tr>
    `
      )
      .join('');

    // 6. Confirmaciones Rows
    const confRows = confirmations
      .map(
        (cf) => `
      <tr>
        <td style="text-align: left; font-weight: bold;">${cf.agencia}</td>
        <td style="text-align: center;">${cf.categoria}</td>
        <td style="text-align: center; font-family: monospace;">${cf.referencia}</td>
        <td style="text-align: center;">${cf.banco || '-'}</td>
        <td style="text-align: center; font-weight: bold;">${cf.moneda}</td>
        <td style="text-align: right; font-weight: bold; color: #047857;">${formatCurrency(cf.monto, cf.moneda)}</td>
        <td style="text-align: center; font-size: 8px; color: #059669; font-weight: bold;">CONCILIADO</td>
      </tr>
    `
      )
      .join('');

    doc.open();
    doc.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Acta_Integral_Auditoria_${systemCycle.semana}_${systemCycle.desde}_al_${systemCycle.hasta}</title>
          <style>
            @page {
              size: landscape;
              margin: 7mm;
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
              font-size: 8.5px;
              line-height: 1.25;
            }
            .header-wrap {
              border-bottom: 2px solid #0f172a;
              padding-bottom: 4px;
              margin-bottom: 6px;
            }
            .company-name {
              font-size: 13px;
              font-weight: 900;
              text-transform: uppercase;
              color: #0f172a;
            }
            .acta-title {
              font-size: 11px;
              font-weight: 800;
              text-transform: uppercase;
              color: #047857;
              margin-top: 1px;
            }
            .meta-row {
              display: flex;
              justify-content: space-between;
              font-size: 8.5px;
              color: #475569;
              margin-top: 2px;
            }
            .summary-cards-grid {
              display: grid;
              grid-template-columns: repeat(3, 1fr);
              gap: 6px;
              margin-bottom: 6px;
            }
            .section-badge {
              background: #0f172a;
              color: #ffffff;
              padding: 3px 8px;
              font-weight: 900;
              font-size: 9px;
              border-radius: 4px;
              margin: 8px 0 4px 0;
              display: inline-block;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              font-size: 8px;
              margin-bottom: 6px;
            }
            th {
              background: #f1f5f9;
              color: #334155;
              font-weight: 800;
              padding: 3.5px 5px;
              border: 1px solid #cbd5e1;
              text-transform: uppercase;
            }
            td {
              padding: 3px 5px;
              border: 1px solid #e2e8f0;
            }
            tr:nth-child(even) {
              background: #f8fafc;
            }
            .page-break {
              page-break-after: always;
              break-after: page;
            }
            .signatures-row {
              display: grid;
              grid-template-columns: repeat(4, 1fr);
              gap: 15px;
              text-align: center;
              margin-top: 14px;
              page-break-inside: avoid;
            }
            .sig-line {
              border-top: 1.2px solid #0f172a;
              padding-top: 2px;
              font-weight: bold;
              font-size: 8.5px;
            }
            .sig-role {
              font-size: 7.5px;
              color: #475569;
            }
          </style>
        </head>
        <body>
          <!-- CAPÍTULO 1: MATRIZ DE ARQUEO GENERAL -->
          <div class="header-wrap">
            <div class="company-name">${companyName}</div>
            <div class="acta-title">ACTA OFICIAL INTEGRAL DE AUDITORÍA Y CIERRE OPERATIVO</div>
            <div class="meta-row">
              <span><strong>Ciclo:</strong> ${systemCycle.tipo === 'SEMANAL' ? 'Semana' : 'Ciclo'} ${systemCycle.semana} (${formatDate(systemCycle.desde)} al ${formatDate(systemCycle.hasta)})</span>
              <span><strong>Auditor / Responsable:</strong> ${userName}</span>
              <span><strong>Fecha de Emisión:</strong> ${todayFormatted}</span>
            </div>
          </div>

          <div class="summary-cards-grid">
            ${summariesHtml}
          </div>

          <div class="section-badge">CAPÍTULO 1: MATRIZ DE ARQUEO POR CAJA Y AGENCIA (${auditRows.length} PUNTOS DE VENTA)</div>
          <table>
            <thead>
              <tr>
                <th style="text-align: left;">Agencia</th>
                <th style="text-align: center;">Moneda</th>
                <th style="text-align: right;">Arrastre</th>
                <th style="text-align: right;">Venta Neta</th>
                <th style="text-align: right;">Gastos Ag.</th>
                <th style="text-align: right;">En Ruta</th>
                <th style="text-align: right;">Liquidado</th>
                <th style="text-align: right;">Efec Taquilla</th>
                <th style="text-align: right;">Bancos</th>
                <th style="text-align: right;">Reposición</th>
                <th style="text-align: right;">Saldo Final</th>
              </tr>
            </thead>
            <tbody>
              ${generalRowsHtml}
            </tbody>
          </table>

          <div class="page-break"></div>

          <!-- CAPÍTULO 2: GASTOS OPERATIVOS Y ADMINISTRATIVOS -->
          <div class="header-wrap">
            <div class="company-name">${companyName} • ACTA INTEGRAL DE AUDITORÍA</div>
            <div class="acta-title">ANEXO 1: DESGLOSE DE GASTOS OPERATIVOS Y DE COMERCIALIZADORA</div>
            <div class="meta-row">
              <span><strong>Ciclo:</strong> Semana ${systemCycle.semana} (${systemCycle.desde} al ${systemCycle.hasta})</span>
              <span><strong>Total Gastos Registrados:</strong> ${agencyExpenses.length + adminExpenses.length} comprobantes</span>
            </div>
          </div>

          <div class="section-badge">A. GASTOS OPERATIVOS DEDUCIDOS POR AGENCIAS EN TAQUILLA (${agencyExpenses.length})</div>
          <table>
            <thead>
              <tr>
                <th style="text-align: left;">Agencia</th>
                <th style="text-align: left;">Concepto / Comprobante</th>
                <th style="text-align: center;">Fecha</th>
                <th style="text-align: center;">Moneda</th>
                <th style="text-align: right;">Monto</th>
                <th style="text-align: center;">Estado</th>
              </tr>
            </thead>
            <tbody>
              ${agencyExpRows || '<tr><td colspan="6" style="text-align: center; color: #64748b;">No hay gastos de agencias registrados.</td></tr>'}
            </tbody>
          </table>

          ${adminExpenses.length > 0 ? `
            <div class="section-badge" style="background: #4338ca;">B. GASTOS ADMINISTRATIVOS Y DE COMERCIALIZADORA (${adminExpenses.length})</div>
            <table>
              <thead>
                <tr>
                  <th style="text-align: left;">Categoría</th>
                  <th style="text-align: left;">Concepto / Detalle</th>
                  <th style="text-align: left;">Beneficiario</th>
                  <th style="text-align: center;">Referencia</th>
                  <th style="text-align: center;">Moneda</th>
                  <th style="text-align: right;">Monto</th>
                </tr>
              </thead>
              <tbody>
                ${adminExpRows}
              </tbody>
            </table>
          ` : ''}

          <div class="page-break"></div>

          <!-- CAPÍTULO 3: BANCOS Y EFECTIVO -->
          <div class="header-wrap">
            <div class="company-name">${companyName} • ACTA INTEGRAL DE AUDITORÍA</div>
            <div class="acta-title">ANEXO 2: CONCILIACIÓN BANCARIA Y RENDICIÓN DE EFECTIVO</div>
            <div class="meta-row">
              <span><strong>Ciclo:</strong> Semana ${systemCycle.semana} (${systemCycle.desde} al ${systemCycle.hasta})</span>
              <span><strong>Canales de Recaudación:</strong> Bancos, Efectivo Taquilla y Cobradores de Ruta</span>
            </div>
          </div>

          <div class="section-badge" style="background: #0f766e;">A. MOVIMIENTOS E INGRESOS EN CUENTAS BANCARIAS (${bankTransactions.length})</div>
          <table>
            <thead>
              <tr>
                <th style="text-align: left;">Banco / Cuenta</th>
                <th style="text-align: left;">Agencia Pagadora</th>
                <th style="text-align: center;">Referencia</th>
                <th style="text-align: center;">Fecha</th>
                <th style="text-align: center;">Moneda</th>
                <th style="text-align: right;">Monto</th>
              </tr>
            </thead>
            <tbody>
              ${bankRows || '<tr><td colspan="6" style="text-align: center; color: #64748b;">No hay transacciones bancarias registradas.</td></tr>'}
            </tbody>
          </table>

          <div class="section-badge" style="background: #0369a1;">B. RENDICIÓN DE EFECTIVO EN BÓVEDA / CAJA CENTRAL (${cashDeliveries.length})</div>
          <table>
            <thead>
              <tr>
                <th style="text-align: left;">Agencia</th>
                <th style="text-align: center;">Modalidad</th>
                <th style="text-align: left;">Concepto / Comprobante</th>
                <th style="text-align: center;">Fecha</th>
                <th style="text-align: center;">Moneda</th>
                <th style="text-align: right;">Monto</th>
              </tr>
            </thead>
            <tbody>
              ${cashRows || '<tr><td colspan="6" style="text-align: center; color: #64748b;">No hay entregas físicas de efectivo registradas.</td></tr>'}
            </tbody>
          </table>

          <div class="page-break"></div>

          <!-- CAPÍTULO 4: CONFIRMACIONES Y CERTIFICACIÓN LEGAL -->
          <div class="header-wrap">
            <div class="company-name">${companyName} • ACTA INTEGRAL DE AUDITORÍA</div>
            <div class="acta-title">ANEXO 3: AUDITORÍA DE CONFIRMACIONES Y CIERRE FORMAL</div>
            <div class="meta-row">
              <span><strong>Ciclo:</strong> Semana ${systemCycle.semana}</span>
              <span><strong>Total Movimientos Conciliados:</strong> ${confirmations.length}</span>
            </div>
          </div>

          <div class="section-badge" style="background: #0284c7;">AUDITORÍA DE TESORERÍA Y CONFIRMACIONES (${confirmations.length})</div>
          <table>
            <thead>
              <tr>
                <th style="text-align: left;">Agencia</th>
                <th style="text-align: center;">Categoría</th>
                <th style="text-align: center;">Referencia</th>
                <th style="text-align: center;">Banco</th>
                <th style="text-align: center;">Moneda</th>
                <th style="text-align: right;">Monto</th>
                <th style="text-align: center;">Estado</th>
              </tr>
            </thead>
            <tbody>
              ${confRows || '<tr><td colspan="7" style="text-align: center; color: #64748b;">No hay movimientos conciliados en tesorería.</td></tr>'}
            </tbody>
          </table>

          <div style="border: 1px solid #cbd5e1; border-radius: 6px; padding: 6px 10px; background: #f8fafc; font-size: 8px; margin-top: 10px; line-height: 1.3;">
            <strong>DECLARACIÓN DE CONFORMIDAD Y RENDICIÓN DE FONDOS:</strong><br />
            Se hace constar formalmente que los balances, ingresos bancarios, entregas de efectivo y deducción de gastos reflejados en este Dossier Oficial Integral corresponden fielmente a los registros auditados del ciclo operativo. Las partes abajo firmantes certifican la veracidad de los datos y la liquidación formal de las agencias.
          </div>

          <div class="signatures-row">
            <div>
              <div class="sig-line">AUDITORÍA Y CIERRE</div>
              <div class="sig-role">${userName}</div>
              <div style="font-size: 7.5px; color: #94a3b8; margin-top: 20px;">Firma y Sello</div>
            </div>
            <div>
              <div class="sig-line">OPERADOR DE CONFIRMACIONES</div>
              <div class="sig-role">Tesorería y Conciliación</div>
              <div style="font-size: 7.5px; color: #94a3b8; margin-top: 20px;">Firma y Sello</div>
            </div>
            <div>
              <div class="sig-line">SUPERVISIÓN DE AGENCIAS</div>
              <div class="sig-role">Control de Taquillas</div>
              <div style="font-size: 7.5px; color: #94a3b8; margin-top: 20px;">Firma y Sello</div>
            </div>
            <div>
              <div class="sig-line">GERENCIA GENERAL</div>
              <div class="sig-role">Aprobación Definitiva</div>
              <div style="font-size: 7.5px; color: #94a3b8; margin-top: 20px;">Firma y Sello</div>
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
      }, 3000);
    }, 400);
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="bg-[#0D1B22] border border-slate-800 rounded-3xl w-full max-w-6xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header Modal */}
        <div className="p-5 border-b border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-[#08151D]">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <ShieldCheck className="w-5 h-5" />
              </span>
              <div>
                <h2 className="text-base sm:text-lg font-black text-white">
                  Dossier Oficial Integral de Auditoría y Cierre
                </h2>
                <p className="text-xs text-slate-400">
                  Ciclo: {systemCycle.tipo === 'SEMANAL' ? 'Semana' : 'Ciclo'} {systemCycle.semana} ({formatDate(systemCycle.desde)} al {formatDate(systemCycle.hasta)}) • {companyName}
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            <button
              onClick={handlePrint}
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-xs flex items-center gap-2 shadow-lg shadow-emerald-500/20 transition-all cursor-pointer"
              title="Imprimir el Dossier Completo foliado con todas las actas en PDF"
            >
              <Printer className="w-4 h-4" />
              <span>Imprimir Dossier Completo (PDF)</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Navigation Tabs inside Dossier */}
        <div className="px-5 py-2.5 border-b border-slate-800/80 bg-[#0A141A] flex items-center gap-1.5 overflow-x-auto">
          <button
            onClick={() => setActiveTab('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shrink-0 ${
              activeTab === 'all'
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Dossier Completo</span>
          </button>
          <button
            onClick={() => setActiveTab('matriz')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shrink-0 ${
              activeTab === 'matriz'
                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>1. Matriz de Arqueo ({auditRows.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('gastos')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shrink-0 ${
              activeTab === 'gastos'
                ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Receipt className="w-3.5 h-3.5" />
            <span>2. Gastos ({agencyExpenses.length + adminExpenses.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('bancos')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shrink-0 ${
              activeTab === 'bancos'
                ? 'bg-teal-500/20 text-teal-400 border border-teal-500/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Landmark className="w-3.5 h-3.5" />
            <span>3. Bancos ({bankTransactions.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('efectivo')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shrink-0 ${
              activeTab === 'efectivo'
                ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Banknote className="w-3.5 h-3.5" />
            <span>4. Efectivo ({cashDeliveries.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('confirmaciones')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shrink-0 ${
              activeTab === 'confirmaciones'
                ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>5. Confirmaciones ({confirmations.length})</span>
          </button>
        </div>

        {/* Content Viewer */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Section: Matriz General */}
          {(activeTab === 'all' || activeTab === 'matriz') && (
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
                  <FileText className="w-4 h-4 text-amber-400" />
                  <span>Capítulo 1: Arqueo Consolidado y Matriz de Puntos de Venta</span>
                </h3>
                <span className="text-xs text-slate-400">{auditRows.length} agencias auditadas</span>
              </div>

              {/* Cards resumen */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {['BS', 'USD', 'COP'].map((mon) => {
                  const d = totalsByCurrency[mon];
                  if (!d) return null;
                  const admGasto = (adminExpensesByCurrency && adminExpensesByCurrency[mon]) || (d.gastosComercializadora || 0);
                  const sCons = Math.round((d.saldoFinal - (d.gastosComercializadora ? 0 : admGasto)) * 100) / 100;
                  return (
                    <div key={mon} className="p-3 rounded-2xl bg-[#08151D] border border-slate-800 space-y-1 text-xs">
                      <div className="flex justify-between font-bold border-b border-slate-800 pb-1">
                        <span className="text-white">{mon} Consolidado</span>
                        <span className={sCons >= 0 ? 'text-emerald-400' : 'text-rose-400'}>{formatCurrency(sCons, mon as any)}</span>
                      </div>
                      <div className="flex justify-between text-slate-400"><span>Arrastre:</span><span className="text-white">{formatCurrency(d.saldoAnterior, mon as any)}</span></div>
                      <div className="flex justify-between text-slate-400"><span>Venta Neta:</span><span className="text-emerald-400">{formatCurrency(d.ventaNeta, mon as any)}</span></div>
                      <div className="flex justify-between text-slate-400"><span>Gastos Agencias:</span><span className="text-rose-400">-{formatCurrency(d.gastosAgencias ?? d.gastos, mon as any)}</span></div>
                      <div className="flex justify-between text-slate-400"><span>Bancos:</span><span className="text-teal-400">{formatCurrency(d.bancos, mon as any)}</span></div>
                      <div className="flex justify-between text-slate-400"><span>Efectivo Taquilla:</span><span className="text-cyan-400">{formatCurrency(d.efectivoTaquilla, mon as any)}</span></div>
                    </div>
                  );
                })}
              </div>

              <div className="rounded-2xl border border-slate-800 overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#08151D] text-slate-400 uppercase text-[10px]">
                    <tr>
                      <th className="p-2.5">Agencia</th>
                      <th className="p-2.5 text-center">Moneda</th>
                      <th className="p-2.5 text-right">Arrastre</th>
                      <th className="p-2.5 text-right">Venta Neta</th>
                      <th className="p-2.5 text-right">Gastos</th>
                      <th className="p-2.5 text-right">En Ruta</th>
                      <th className="p-2.5 text-right">Liquidado</th>
                      <th className="p-2.5 text-right">Efectivo</th>
                      <th className="p-2.5 text-right">Bancos</th>
                      <th className="p-2.5 text-right">Saldo Final</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                    {auditRows.map((r, i) => (
                      <tr key={i} className="hover:bg-slate-800/30">
                        <td className="p-2.5 font-sans font-bold text-white">{r.entidad}</td>
                        <td className="p-2.5 text-center text-slate-300 font-bold">{r.moneda}</td>
                        <td className="p-2.5 text-right text-slate-400">{formatCurrency(r.saldo_anterior, r.moneda)}</td>
                        <td className={`p-2.5 text-right font-bold ${r.venta_neta >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatCurrency(r.venta_neta, r.moneda)}</td>
                        <td className="p-2.5 text-right text-rose-400">{r.gastos > 0 ? formatCurrency(r.gastos, r.moneda) : '-'}</td>
                        <td className="p-2.5 text-right text-amber-400">{r.cobrador_en_ruta && r.cobrador_en_ruta > 0 ? formatCurrency(r.cobrador_en_ruta, r.moneda) : '-'}</td>
                        <td className="p-2.5 text-right text-emerald-400">{r.cobrador_liquidado && r.cobrador_liquidado > 0 ? formatCurrency(r.cobrador_liquidado, r.moneda) : '-'}</td>
                        <td className="p-2.5 text-right text-cyan-400">{r.efectivo_taquilla > 0 ? formatCurrency(r.efectivo_taquilla, r.moneda) : '-'}</td>
                        <td className="p-2.5 text-right text-teal-400">{r.bancos > 0 ? formatCurrency(r.bancos, r.moneda) : '-'}</td>
                        <td className={`p-2.5 text-right font-bold ${r.saldo_final >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatCurrency(r.saldo_final, r.moneda)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Section: Gastos */}
          {(activeTab === 'all' || activeTab === 'gastos') && (
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
                  <Receipt className="w-4 h-4 text-rose-400" />
                  <span>Anexo 1: Desglose de Gastos Operativos de Agencias y Comercializadora</span>
                </h3>
                <span className="text-xs text-slate-400">{agencyExpenses.length} agencias • {adminExpenses.length} comercializadora</span>
              </div>

              <div className="rounded-2xl border border-slate-800 overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#08151D] text-slate-400 uppercase text-[10px]">
                    <tr>
                      <th className="p-2.5">Agencia / Entidad</th>
                      <th className="p-2.5">Concepto</th>
                      <th className="p-2.5 text-center">Fecha</th>
                      <th className="p-2.5 text-center">Moneda</th>
                      <th className="p-2.5 text-right">Monto</th>
                      <th className="p-2.5 text-center">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                    {agencyExpenses.map((g, i) => (
                      <tr key={i} className="hover:bg-slate-800/30">
                        <td className="p-2.5 font-sans font-bold text-white">{g.agencia}</td>
                        <td className="p-2.5 font-sans text-slate-300">{g.concepto || 'OPERATIVO TAQUILLA'}</td>
                        <td className="p-2.5 text-center text-slate-400">{g.fecha ? formatDate(g.fecha) : '-'}</td>
                        <td className="p-2.5 text-center font-bold text-slate-300">{g.moneda}</td>
                        <td className="p-2.5 text-right font-bold text-rose-400">{formatCurrency(g.monto, g.moneda)}</td>
                        <td className="p-2.5 text-center"><span className="text-[10px] text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded">Confirmado</span></td>
                      </tr>
                    ))}
                    {adminExpenses.map((a, i) => (
                      <tr key={`adm_${i}`} className="hover:bg-slate-800/30 bg-purple-500/5">
                        <td className="p-2.5 font-sans font-bold text-purple-300">COMERCIALIZADOR ({a.categoria || 'ADMIN'})</td>
                        <td className="p-2.5 font-sans text-slate-300">{a.concepto}</td>
                        <td className="p-2.5 text-center text-slate-400">{a.fecha ? formatDate(a.fecha) : '-'}</td>
                        <td className="p-2.5 text-center font-bold text-slate-300">{a.moneda}</td>
                        <td className="p-2.5 text-right font-bold text-purple-400">{formatCurrency(a.monto, a.moneda)}</td>
                        <td className="p-2.5 text-center"><span className="text-[10px] text-purple-400 font-bold bg-purple-500/10 px-2 py-0.5 rounded">Administrativo</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Section: Bancos & Efectivo */}
          {(activeTab === 'all' || activeTab === 'bancos' || activeTab === 'efectivo') && (
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
                  <Landmark className="w-4 h-4 text-teal-400" />
                  <span>Anexo 2: Conciliación Bancaria y Rendición de Efectivo</span>
                </h3>
                <span className="text-xs text-slate-400">{bankTransactions.length} bancos • {cashDeliveries.length} efectivo</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Bancos */}
                <div className="rounded-2xl border border-slate-800 overflow-hidden">
                  <div className="p-2.5 bg-[#08151D] text-xs font-bold text-teal-300 border-b border-slate-800 flex items-center justify-between">
                    <span>🏦 Transacciones Bancarias ({bankTransactions.length})</span>
                  </div>
                  <div className="overflow-x-auto max-h-60">
                    <table className="w-full text-left text-xs font-mono text-[11px]">
                      <tbody className="divide-y divide-slate-800/60">
                        {bankTransactions.map((b, i) => (
                          <tr key={i} className="hover:bg-slate-800/30">
                            <td className="p-2 font-sans font-bold text-white">{b.banco || 'BANCO'}</td>
                            <td className="p-2 font-sans text-slate-400">{b.agencia}</td>
                            <td className="p-2 text-right font-bold text-teal-400">{formatCurrency(b.monto, b.moneda)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Efectivo */}
                <div className="rounded-2xl border border-slate-800 overflow-hidden">
                  <div className="p-2.5 bg-[#08151D] text-xs font-bold text-cyan-300 border-b border-slate-800 flex items-center justify-between">
                    <span>💵 Efectivo en Bóveda y Taquilla ({cashDeliveries.length})</span>
                  </div>
                  <div className="overflow-x-auto max-h-60">
                    <table className="w-full text-left text-xs font-mono text-[11px]">
                      <tbody className="divide-y divide-slate-800/60">
                        {cashDeliveries.map((c, i) => (
                          <tr key={i} className="hover:bg-slate-800/30">
                            <td className="p-2 font-sans font-bold text-white">{c.agencia}</td>
                            <td className="p-2 font-sans text-slate-400">{c.modalidad}</td>
                            <td className="p-2 text-right font-bold text-cyan-400">{formatCurrency(c.monto, c.moneda)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Section: Confirmaciones */}
          {(activeTab === 'all' || activeTab === 'confirmaciones') && (
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-sky-400" />
                  <span>Anexo 3: Auditoría de Confirmaciones de Fondos</span>
                </h3>
                <span className="text-xs text-slate-400">{confirmations.length} movimientos confirmados</span>
              </div>

              <div className="rounded-2xl border border-slate-800 overflow-x-auto">
                <table className="w-full text-left text-xs font-mono text-[11px]">
                  <thead className="bg-[#08151D] text-slate-400 uppercase text-[10px] font-sans">
                    <tr>
                      <th className="p-2.5">Agencia</th>
                      <th className="p-2.5 text-center">Categoría</th>
                      <th className="p-2.5 text-center">Referencia</th>
                      <th className="p-2.5 text-center">Banco</th>
                      <th className="p-2.5 text-center">Moneda</th>
                      <th className="p-2.5 text-right">Monto</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {confirmations.map((cf, i) => (
                      <tr key={i} className="hover:bg-slate-800/30">
                        <td className="p-2.5 font-sans font-bold text-white">{cf.agencia}</td>
                        <td className="p-2.5 text-center text-slate-300 font-sans">{cf.categoria}</td>
                        <td className="p-2.5 text-center text-slate-400">{cf.referencia}</td>
                        <td className="p-2.5 text-center text-slate-400 font-sans">{cf.banco || '-'}</td>
                        <td className="p-2.5 text-center text-slate-300 font-bold">{cf.moneda}</td>
                        <td className="p-2.5 text-right font-bold text-emerald-400">{formatCurrency(cf.monto, cf.moneda)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
