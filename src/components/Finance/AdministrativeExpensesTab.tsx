import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { formatCurrency, formatDate, formatDateTime, normalizarMoneda, montoEnLetras } from '../../utils/formatters';
import { notificationService } from '../../utils/notificationService';
import { realtimeBroadcast } from '../../utils/realtimeBroadcast';
import { logAuditEvent } from '../../utils/auditLogger';
import {
  Building2,
  Plus,
  Trash2,
  RefreshCw,
  Search,
  Filter,
  DollarSign,
  Download,
  Printer,
  CheckCircle2,
  AlertTriangle,
  Briefcase,
  Monitor,
  Wifi,
  Wrench,
  Package,
  Car,
  Tag,
  ShieldCheck,
  Calendar,
  X,
  Receipt,
  FileText,
  Share2,
  Sparkles,
  Hash
} from 'lucide-react';
import confetti from 'canvas-confetti';

export interface AdminExpenseRecord {
  id: number;
  categoria: string;
  concepto: string;
  beneficiario: string;
  referencia: string;
  moneda: 'BS' | 'USD' | 'COP';
  monto: number;
  fecha: string;
  confirmado: boolean;
  confirmado_por?: string;
  created_at?: string;
}

const CATEGORIAS_CONFIG: Record<
  string,
  { label: string; icon: React.ComponentType<{ className?: string }>; color: string; bg: string }
> = {
  SUELDOS: { label: 'Sueldos y Nómina', icon: Briefcase, color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/30' },
  OFICINA: { label: 'Oficina y Alquiler', icon: Building2, color: 'text-indigo-400', bg: 'bg-indigo-500/10 border-indigo-500/30' },
  EQUIPOS: { label: 'Computadoras y Equipos', icon: Monitor, color: 'text-cyan-400', bg: 'bg-cyan-500/10 border-cyan-500/30' },
  INTERNET: { label: 'Internet y Conectividad', icon: Wifi, color: 'text-sky-400', bg: 'bg-sky-500/10 border-sky-500/30' },
  MANTENIMIENTO: { label: 'Mantenimiento General', icon: Wrench, color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/30' },
  SUMINISTROS: { label: 'Papelería y Suministros', icon: Package, color: 'text-teal-400', bg: 'bg-teal-500/10 border-teal-500/30' },
  VIATICOS: { label: 'Transporte y Viáticos', icon: Car, color: 'text-rose-400', bg: 'bg-rose-500/10 border-rose-500/30' },
  OTROS: { label: 'Otros Gastos Administrativos', icon: Tag, color: 'text-purple-400', bg: 'bg-purple-500/10 border-purple-500/30' },
};

/**
 * Calcula el siguiente número de recibo continuo/correlativo a partir de los registros existentes.
 * Si el último recibo es "01", el siguiente será "02".
 * Soporta cualquier número de dígitos o prefijos comunes (ej. "01", "002", "REC-05").
 */
export function getNextContinuousReceipt(records: AdminExpenseRecord[]): string {
  let maxNum = 0;
  let padLength = 2; // Formato continuo estándar de al menos 2 dígitos: "01", "02"...

  for (const r of records) {
    const ref = (r.referencia || '').trim();
    if (!ref || ref === 'N/A' || ref === '—') continue;

    // Buscar secuencias de dígitos
    const matches = ref.match(/\d+/g);
    if (matches && matches.length > 0) {
      const lastNumStr = matches[matches.length - 1];
      const val = parseInt(lastNumStr, 10);
      if (!isNaN(val) && val > maxNum) {
        maxNum = val;
        if (lastNumStr.length > padLength) {
          padLength = lastNumStr.length;
        }
      }
    }
  }

  const nextVal = maxNum + 1;
  return String(nextVal).padStart(padLength, '0');
}

export const AdministrativeExpensesTab: React.FC = () => {
  const { effectiveUserId, systemCycle, user, profile } = useAuth();

  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [expenses, setExpenses] = useState<AdminExpenseRecord[]>([]);

  // Filters
  const [filterPeriod, setFilterPeriod] = useState<'ciclo' | 'todos'>('ciclo');
  const [filterCategory, setFilterCategory] = useState('TODAS');
  const [filterCurrency, setFilterCurrency] = useState('TODAS');
  const [searchQuery, setSearchQuery] = useState('');

  // Form State
  const [formCategoria, setFormCategoria] = useState('SUELDOS');
  const [formMoneda, setFormMoneda] = useState<'BS' | 'USD' | 'COP'>('BS');
  const [formMonto, setFormMonto] = useState('');
  const [formBeneficiario, setFormBeneficiario] = useState('');
  const [formConcepto, setFormConcepto] = useState('');
  const [formReferencia, setFormReferencia] = useState('');
  const [nextContinuousCorrelativo, setNextContinuousCorrelativo] = useState('01');
  const [formFecha, setFormFecha] = useState(systemCycle?.hasta || new Date().toISOString().slice(0, 10));

  // Modals state
  const [deleteTarget, setDeleteTarget] = useState<AdminExpenseRecord | null>(null);
  const [receiptModalExpense, setReceiptModalExpense] = useState<AdminExpenseRecord | null>(null);

  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (systemCycle?.hasta && !formFecha) {
      setFormFecha(systemCycle.hasta);
    }
  }, [systemCycle?.hasta, formFecha]);

  const loadData = useCallback(async () => {
    if (!effectiveUserId) return;
    setIsLoading(true);
    setMessage(null);

    try {
      const { data, error } = await supabase
        .from('gastos')
        .select('*')
        .eq('user_id', effectiveUserId)
        .or('tipo.eq.ADMINISTRATIVO,agencia.eq.COMERCIALIZADOR,agencia.ilike.%ADMINISTRACION%')
        .order('id', { ascending: false });

      if (error) throw error;

      const list: AdminExpenseRecord[] = (data || []).map((r: any) => {
        let rawConcepto = String(r.concepto || r.descripcion || 'Gasto Administrativo').trim();
        let cat = 'OTROS';
        let ben = 'N/A';
        let ref = r.referencia ? String(r.referencia).trim() : 'N/A';

        // Extract [CAT]
        const catMatch = rawConcepto.match(/^\[([A-Z0-9_\s]+)\]/i);
        if (catMatch) {
          cat = catMatch[1].trim().toUpperCase();
          rawConcepto = rawConcepto.replace(/^\[[A-Z0-9_\s]+\]\s*/i, '').trim();
        }

        // Extract [BEN: X]
        const benMatch = rawConcepto.match(/\[BEN:\s*([^\]]+)\]/i);
        if (benMatch) {
          ben = benMatch[1].trim();
          rawConcepto = rawConcepto.replace(/\[BEN:\s*[^\]]+\]/i, '').trim();
        }

        // Extract [REF: X]
        const refMatch = rawConcepto.match(/\[REF:\s*([^\]]+)\]/i);
        if (refMatch) {
          ref = refMatch[1].trim();
          rawConcepto = rawConcepto.replace(/\[REF:\s*[^\]]+\]/i, '').trim();
        }

        return {
          id: r.id,
          categoria: CATEGORIAS_CONFIG[cat] ? cat : 'OTROS',
          concepto: rawConcepto,
          beneficiario: ben,
          referencia: ref,
          moneda: normalizarMoneda(r.moneda) as 'BS' | 'USD' | 'COP',
          monto: Number(r.monto || 0),
          fecha: String(r.fecha || r.created_at || '').slice(0, 10),
          confirmado: Boolean(r.confirmado),
          confirmado_por: r.confirmado_por,
          created_at: r.created_at,
        };
      });

      setExpenses(list);

      // Calcular correlativo continuo
      const nextCorr = getNextContinuousReceipt(list);
      setNextContinuousCorrelativo(nextCorr);
      setFormReferencia((prev) => (!prev || prev.trim() === '' ? nextCorr : prev));
    } catch (err: any) {
      console.error('Error loading administrative expenses:', err);
      setMessage({ type: 'error', text: 'Error al cargar gastos administrativos: ' + (err?.message || '') });
    } finally {
      setIsLoading(false);
    }
  }, [effectiveUserId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Target list considering period filter
  const targetExpenses = useMemo(() => {
    return expenses.filter((e) => {
      if (filterPeriod === 'ciclo' && (systemCycle.desde || systemCycle.hasta)) {
        const f = e.fecha;
        if (systemCycle.desde && f < systemCycle.desde) return false;
        if (systemCycle.hasta && f > systemCycle.hasta) return false;
      }
      return true;
    });
  }, [expenses, filterPeriod, systemCycle.desde, systemCycle.hasta]);

  // Totals by currency
  const totalsByCurrency = useMemo(() => {
    const res = { BS: 0, USD: 0, COP: 0, count: targetExpenses.length };
    targetExpenses.forEach((e) => {
      if (e.moneda === 'BS') res.BS += e.monto;
      else if (e.moneda === 'USD') res.USD += e.monto;
      else if (e.moneda === 'COP') res.COP += e.monto;
    });
    return res;
  }, [targetExpenses]);

  // Filtered expenses for table display
  const filteredExpenses = useMemo(() => {
    return targetExpenses.filter((e) => {
      if (filterCategory !== 'TODAS' && e.categoria !== filterCategory) return false;
      if (filterCurrency !== 'TODAS' && e.moneda !== filterCurrency) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const match =
          e.concepto.toLowerCase().includes(q) ||
          e.beneficiario.toLowerCase().includes(q) ||
          e.referencia.toLowerCase().includes(q) ||
          (CATEGORIAS_CONFIG[e.categoria]?.label || '').toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [targetExpenses, filterCategory, filterCurrency, searchQuery]);

  // Submit New Administrative Expense
  const handleSaveExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!effectiveUserId) return;

    const montoNum = Number(formMonto);
    if (montoNum <= 0) {
      setMessage({ type: 'error', text: 'Ingrese un monto mayor a 0.' });
      return;
    }

    if (!formConcepto.trim()) {
      setMessage({ type: 'error', text: 'Ingrese el concepto o descripción del gasto.' });
      return;
    }

    setIsProcessing(true);
    setMessage(null);

    try {
      const adminNom = user?.nombre || user?.email?.split('@')[0] || 'ADMIN';
      const finalReferencia = (formReferencia || '').trim() || nextContinuousCorrelativo;

      // Build structured concept: [CATEGORIA] Concepto [BEN: Beneficiario] [REF: Referencia]
      let compuesto = `[${formCategoria}] ${formConcepto.trim().toUpperCase()}`;
      if (formBeneficiario.trim()) {
        compuesto += ` [BEN: ${formBeneficiario.trim().toUpperCase()}]`;
      }
      if (finalReferencia) {
        compuesto += ` [REF: ${finalReferencia.toUpperCase()}]`;
      }

      const payload = {
        user_id: effectiveUserId,
        agencia: 'COMERCIALIZADOR',
        moneda: formMoneda,
        monto: montoNum,
        concepto: compuesto,
        tipo: 'ADMINISTRATIVO',
        confirmado: true,
        confirmado_por: adminNom,
        rechazado: false,
        fecha: formFecha || new Date().toISOString().slice(0, 10),
      };

      const { data: inserted, error } = await supabase.from('gastos').insert([payload]).select();
      if (error) throw error;

      await logAuditEvent({
        user_id: effectiveUserId,
        usuario: user?.email || user?.nombre || 'ADMIN',
        tipo_accion: 'REGISTRO_GASTO_ADMINISTRATIVO',
        modulo: 'GASTOS',
        entidad_afectada: `COMERCIALIZADOR (${formMoneda})`,
        descripcion: `Registro de Gasto Administrativo [${CATEGORIAS_CONFIG[formCategoria]?.label || formCategoria}]: ${formConcepto.trim()} por ${formatCurrency(montoNum, formMoneda)} (Recibo Cont.: #${finalReferencia}, Beneficiario: ${formBeneficiario || 'N/A'})`,
        impacto_financiero: montoNum > 50000 ? 'ALTO' : 'MEDIO',
      });

      confetti({ particleCount: 40, spread: 60, origin: { y: 0.8 } });

      setMessage({
        type: 'success',
        text: `Gasto administrativo registrado exitosamente con Recibo Continuo #${finalReferencia}.`,
      });

      // Limpiar formulario y auto-incrementar correlativo continuo
      setFormMonto('');
      setFormConcepto('');
      setFormBeneficiario('');

      const optimisticRecord: AdminExpenseRecord = {
        id: inserted?.[0]?.id || Date.now(),
        categoria: formCategoria,
        concepto: formConcepto.trim().toUpperCase(),
        beneficiario: formBeneficiario.trim().toUpperCase() || 'N/A',
        referencia: finalReferencia,
        moneda: formMoneda,
        monto: montoNum,
        fecha: formFecha,
        confirmado: true,
        confirmado_por: adminNom,
      };

      const newNext = getNextContinuousReceipt([optimisticRecord, ...expenses]);
      setNextContinuousCorrelativo(newNext);
      setFormReferencia(newNext);

      await loadData();
    } catch (err: any) {
      console.error('Error saving administrative expense:', err);
      setMessage({ type: 'error', text: 'Error al registrar el gasto: ' + (err?.message || '') });
    } finally {
      setIsProcessing(false);
    }
  };

  // Delete Administrative Expense
  const handleDeleteExpense = async () => {
    if (!deleteTarget || !effectiveUserId) return;
    setIsProcessing(true);

    try {
      const { error } = await supabase
        .from('gastos')
        .delete()
        .eq('id', deleteTarget.id)
        .eq('user_id', effectiveUserId);

      if (error) throw error;

      await logAuditEvent({
        user_id: effectiveUserId,
        usuario: user?.email || user?.nombre || 'ADMIN',
        tipo_accion: 'ELIMINACION_GASTO_ADMINISTRATIVO',
        modulo: 'GASTOS',
        entidad_afectada: `COMERCIALIZADOR (${deleteTarget.moneda})`,
        descripcion: `Eliminación de Gasto Administrativo [${deleteTarget.categoria}]: ${deleteTarget.concepto} por ${formatCurrency(deleteTarget.monto, deleteTarget.moneda)} (Recibo: ${deleteTarget.referencia})`,
        impacto_financiero: 'MEDIO',
      });

      setMessage({ type: 'success', text: 'Gasto administrativo eliminado correctamente.' });
      setDeleteTarget(null);
      await loadData();
    } catch (err: any) {
      console.error('Error deleting expense:', err);
      setMessage({ type: 'error', text: 'Error al eliminar: ' + (err?.message || '') });
    } finally {
      setIsProcessing(false);
    }
  };

  // Export CSV
  const handleExportCSV = () => {
    if (filteredExpenses.length === 0) return;

    const headers = ['ID', 'Fecha', 'Categoria', 'Concepto', 'Beneficiario', 'Nro_Recibo_Continuo', 'Moneda', 'Monto'];
    const rows = filteredExpenses.map((e) => [
      e.id,
      e.fecha,
      `"${CATEGORIAS_CONFIG[e.categoria]?.label || e.categoria}"`,
      `"${e.concepto.replace(/"/g, '""')}"`,
      `"${e.beneficiario.replace(/"/g, '""')}"`,
      `"${e.referencia.replace(/"/g, '""')}"`,
      e.moneda,
      e.monto.toFixed(2),
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Gastos_Administrativos_Comercializador_${systemCycle.semana || 'Semana'}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Print Bitácora PDF (General)
  const handlePrintPDF = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const companyName = (profile?.nombre_banca || profile?.banca || 'CORPORACION CALENDARIO, CA').toUpperCase();
    const ahora = new Date().toLocaleString('es-VE', { dateStyle: 'long', timeStyle: 'short' });

    const rowsHtml = filteredExpenses
      .map(
        (e) => `
        <tr style="border-bottom: 1px solid #e2e8f0;">
          <td style="padding: 7px 8px; font-size: 8.5pt;">${e.fecha}</td>
          <td style="padding: 7px 8px; font-size: 8.5pt; font-weight: bold; color: #1e293b;">
            ${CATEGORIAS_CONFIG[e.categoria]?.label || e.categoria}
          </td>
          <td style="padding: 7px 8px; font-size: 8.5pt;">${e.concepto}</td>
          <td style="padding: 7px 8px; font-size: 8.5pt; color: #475569;">${e.beneficiario}</td>
          <td style="padding: 7px 8px; font-size: 8.5pt; font-family: monospace; font-weight: bold; color: #0284c7;">
            ${e.referencia !== 'N/A' ? '#' + e.referencia : '#' + e.id}
          </td>
          <td style="padding: 7px 8px; font-size: 8.5pt; font-weight: bold; text-align: center;">${e.moneda}</td>
          <td style="padding: 7px 8px; font-size: 9pt; font-weight: 800; text-align: right; font-family: monospace;">
            ${formatCurrency(e.monto, e.moneda)}
          </td>
        </tr>
      `
      )
      .join('');

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Bitácora de Gastos Administrativos - ${companyName}</title>
          <meta charset="utf-8" />
          <style>
            @page { size: letter landscape; margin: 1.2cm; }
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; color: #0f172a; margin: 0; padding: 0; font-size: 9pt; }
            .header { border-bottom: 2px solid #0f172a; padding-bottom: 10px; margin-bottom: 14px; display: flex; justify-content: space-between; align-items: flex-start; }
            .company { font-size: 14pt; font-weight: 900; color: #0f172a; margin: 0 0 2px 0; }
            .doc-title { font-size: 11pt; font-weight: 800; color: #0284c7; text-transform: uppercase; margin: 0 0 2px 0; }
            .doc-sub { font-size: 8pt; color: #64748b; margin: 0; }
            .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 14px; }
            .kpi-box { background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 8px 10px; }
            .kpi-lbl { font-size: 7pt; font-weight: 700; text-transform: uppercase; color: #64748b; }
            .kpi-val { font-size: 11pt; font-weight: 900; color: #0f172a; margin-top: 1px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
            th { background: #0f172a; color: #fff; font-size: 8pt; font-weight: 800; text-transform: uppercase; padding: 7px 8px; text-align: left; }
            .signatures { margin-top: 40px; display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 40px; page-break-inside: avoid; }
            .sig-line { border-top: 1px solid #334155; padding-top: 5px; text-align: center; font-size: 8pt; }
            .footer { margin-top: 18px; border-top: 1px dashed #cbd5e1; padding-top: 8px; display: flex; justify-content: space-between; font-size: 7.5pt; color: #64748b; page-break-inside: avoid; }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <h1 class="company">${companyName}</h1>
              <div class="doc-title">Bitácora Oficial de Gastos Administrativos (Comercializador)</div>
              <p class="doc-sub">Control corporativo de nómina, alquiler, computadoras, internet, mantenimiento y servicios de oficina</p>
            </div>
            <div style="text-align: right; font-size: 8pt; color: #475569;">
              <div><strong>Fecha de Emisión:</strong> ${ahora}</div>
              <div><strong>Ciclo Operativo:</strong> Semana ${systemCycle.semana || 'Actual'} (${systemCycle.desde} al ${systemCycle.hasta})</div>
              <div><strong>Usuario Administrador:</strong> ${user?.email || 'Admin'}</div>
            </div>
          </div>

          <div class="kpis">
            <div class="kpi-box">
              <div class="kpi-lbl">Total Gastos (BS)</div>
              <div class="kpi-val">${formatCurrency(totalsByCurrency.BS, 'BS')}</div>
            </div>
            <div class="kpi-box">
              <div class="kpi-lbl">Total Gastos (USD)</div>
              <div class="kpi-val" style="color: #0284c7;">${formatCurrency(totalsByCurrency.USD, 'USD')}</div>
            </div>
            <div class="kpi-box">
              <div class="kpi-lbl">Total Gastos (COP)</div>
              <div class="kpi-val" style="color: #16a34a;">${formatCurrency(totalsByCurrency.COP, 'COP')}</div>
            </div>
            <div class="kpi-box">
              <div class="kpi-lbl">Total Recibos</div>
              <div class="kpi-val">${filteredExpenses.length} comprobantes</div>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th style="width: 11%;">Fecha</th>
                <th style="width: 17%;">Categoría</th>
                <th style="width: 27%;">Concepto / Descripción</th>
                <th style="width: 18%;">Beneficiario / Proveedor</th>
                <th style="width: 11%;">Recibo Cont.</th>
                <th style="width: 6%; text-align: center;">Moneda</th>
                <th style="width: 10%; text-align: right;">Monto</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>

          <div class="signatures">
            <div>
              <div class="sig-line">
                <strong>Administración y Contabilidad</strong>
                <div style="color: #64748b;">Elaboración y Cuadre</div>
              </div>
            </div>
            <div>
              <div class="sig-line">
                <strong>Auditoría de Operaciones</strong>
                <div style="color: #64748b;">Revisión y Comprobación</div>
              </div>
            </div>
            <div>
              <div class="sig-line">
                <strong>Dirección General</strong>
                <div style="color: #64748b;">Aprobación y Finiquito</div>
              </div>
            </div>
          </div>

          <div class="footer">
            <span>Sistema Multibanca Express CMS • Registro Oficial de Gastos Administrativos</span>
            <span>Documento Oficial Certificado • Trazabilidad Inmutable</span>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
    }, 400);
  };

  // Print Single Continuous Receipt in 80mm format (Thermal POS)
  const handlePrintSingleReceipt = (exp: AdminExpenseRecord) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const companyName = (profile?.nombre_banca || profile?.banca || 'CORPORACION CALENDARIO, CA').toUpperCase();
    const horaEmision = new Date().toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', hour12: true });
    const numeroRecibo = exp.referencia !== 'N/A' && exp.referencia.trim() ? exp.referencia : String(exp.id);
    const letras = montoEnLetras(exp.monto, exp.moneda);

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Recibo Continuo de Egreso #${numeroRecibo} - ${companyName}</title>
          <meta charset="utf-8" />
          <style>
            @page { size: 80mm auto; margin: 2mm; }
            body { font-family: "Courier New", Courier, monospace, sans-serif; color: #000; margin: 0; padding: 4px; font-size: 11px; line-height: 1.3; }
            .center { text-align: center; }
            .bold { font-weight: bold; }
            .title { font-size: 13px; font-weight: 900; margin-bottom: 2px; }
            .subtitle { font-size: 9.5px; color: #333; margin-bottom: 6px; }
            .recibo-num { font-size: 14px; font-weight: 900; border: 1.5px dashed #000; padding: 5px; margin: 6px 0; }
            .divider { border-top: 1px dashed #000; margin: 6px 0; }
            .row { display: flex; justify-content: space-between; margin: 3px 0; }
            .lbl { font-weight: bold; color: #222; }
            .val { text-align: right; }
            .concept-box { background: #f4f4f4; border: 1px solid #ccc; padding: 6px; margin: 6px 0; font-size: 10.5px; border-radius: 4px; font-family: sans-serif; }
            .monto-box { border: 2px solid #000; padding: 7px; margin: 8px 0; text-align: center; }
            .monto-val { font-size: 16px; font-weight: 900; }
            .monto-letras { font-size: 9px; font-style: italic; margin-top: 3px; font-family: sans-serif; }
            .sig-row { display: flex; justify-content: space-between; gap: 8px; margin-top: 30px; }
            .sig-col { flex: 1; text-align: center; border-top: 1px solid #000; padding-top: 3px; font-size: 8.5px; }
            .footer { font-size: 8px; text-align: center; margin-top: 16px; color: #555; }
          </style>
        </head>
        <body>
          <div class="center">
            <div class="title">${companyName}</div>
            <div class="subtitle">SISTEMA MULTIBANCA EXPRESS • CASA MATRIZ</div>
            <div class="recibo-num">RECIBO CONTINUO DE EGRESO #${numeroRecibo}</div>
          </div>

          <div class="divider"></div>

          <div class="row">
            <span class="lbl">FECHA:</span>
            <span class="val">${formatDate(exp.fecha)} ${horaEmision}</span>
          </div>
          <div class="row">
            <span class="lbl">CICLO:</span>
            <span class="val">Semana ${systemCycle.semana || 'Actual'}</span>
          </div>
          <div class="row">
            <span class="lbl">CATEGORÍA:</span>
            <span class="val bold">${CATEGORIAS_CONFIG[exp.categoria]?.label || exp.categoria}</span>
          </div>
          <div class="row">
            <span class="lbl">BENEFICIARIO:</span>
            <span class="val bold">${exp.beneficiario !== 'N/A' ? exp.beneficiario : 'NO ESPECIFICADO'}</span>
          </div>
          <div class="row">
            <span class="lbl">N° CORRELATIVO:</span>
            <span class="val bold">#${numeroRecibo}</span>
          </div>

          <div class="divider"></div>

          <div class="lbl">CONCEPTO / DETALLE:</div>
          <div class="concept-box">${exp.concepto}</div>

          <div class="monto-box">
            <div class="lbl" style="font-size: 9px;">MONTO TOTAL CANCELADO</div>
            <div class="monto-val">${formatCurrency(exp.monto, exp.moneda)}</div>
            <div class="monto-letras">${letras}</div>
          </div>

          <div class="sig-row">
            <div class="sig-col">
              <span class="bold">ENTREGADO POR (CAJA)</span><br />
              <span>${exp.confirmado_por || user?.nombre || 'Administración'}</span>
            </div>
            <div class="sig-col">
              <span class="bold">RECIBÍ CONFORME</span><br />
              <span>${exp.beneficiario !== 'N/A' ? exp.beneficiario : 'Beneficiario'}</span><br />
              <span style="font-size: 7.5px;">C.I.: ________________</span>
            </div>
          </div>

          <div class="footer">
            *** COMPROBANTE OFICIAL DE PAGO CONTINUO ***<br />
            Trazabilidad Inmutable • Folio Sistema #${exp.id}
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
    }, 400);
  };

  // Print Official Half-Letter / Letter Voucher (Original + Copia Beneficiario)
  const handlePrintLetterVoucher = (exp: AdminExpenseRecord) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const companyName = (profile?.nombre_banca || profile?.banca || 'CORPORACION CALENDARIO, CA').toUpperCase();
    const fechaStr = formatDate(exp.fecha);
    const numeroRecibo = exp.referencia !== 'N/A' && exp.referencia.trim() ? exp.referencia : String(exp.id);
    const letras = montoEnLetras(exp.monto, exp.moneda);

    const voucherHtml = (copyLabel: string) => `
      <div style="border: 2px solid #0f172a; border-radius: 8px; padding: 16px; margin-bottom: 20px; background: #fff;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0f172a; padding-bottom: 10px; margin-bottom: 12px;">
          <div>
            <h2 style="margin: 0; font-size: 15pt; font-weight: 900; color: #0f172a;">${companyName}</h2>
            <div style="font-size: 9pt; font-weight: 800; color: #0284c7; text-transform: uppercase;">COMPROBANTE DE EGRESO CONTINUO • CASA MATRIZ</div>
            <div style="font-size: 8pt; color: #64748b;">Gastos Operacionales y Administrativos del Comercializador</div>
          </div>
          <div style="text-align: right;">
            <div style="display: inline-block; border: 2px solid #dc2626; border-radius: 6px; padding: 4px 10px; background: #fef2f2;">
              <div style="font-size: 8pt; font-weight: 800; color: #dc2626; text-transform: uppercase;">RECIBO N°</div>
              <div style="font-size: 15pt; font-weight: 900; color: #991b1b; font-family: monospace;">#${numeroRecibo}</div>
            </div>
            <div style="font-size: 7.5pt; font-weight: bold; color: #64748b; margin-top: 4px; text-transform: uppercase;">[ ${copyLabel} ]</div>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 10px; font-size: 8.5pt; margin-bottom: 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 12px;">
          <div><strong>Beneficiario:</strong> ${exp.beneficiario !== 'N/A' ? exp.beneficiario : 'Personal / Proveedor'}</div>
          <div><strong>Fecha:</strong> ${fechaStr}</div>
          <div><strong>Ciclo:</strong> Semana ${systemCycle.semana || 'Actual'}</div>
        </div>

        <div style="margin-bottom: 12px;">
          <div style="font-size: 8pt; font-weight: bold; text-transform: uppercase; color: #475569; margin-bottom: 4px;">Concepto / Descripción del Gasto:</div>
          <div style="border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px 12px; font-size: 9pt; background: #fff;">
            <strong>[${CATEGORIAS_CONFIG[exp.categoria]?.label || exp.categoria}]</strong> ${exp.concepto}
          </div>
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center; border: 2px solid #0f172a; border-radius: 6px; padding: 10px 14px; background: #f1f5f9; margin-bottom: 22px;">
          <div style="font-size: 8pt; color: #334155; max-width: 65%;">
            <div style="font-weight: 800; text-transform: uppercase;">Cantidad en Letras:</div>
            <div style="font-style: italic; font-weight: 700;">${letras}</div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 7.5pt; font-weight: 800; text-transform: uppercase; color: #64748b;">Monto Pagado (${exp.moneda})</div>
            <div style="font-size: 16pt; font-weight: 900; color: #0f172a; font-family: monospace;">${formatCurrency(exp.monto, exp.moneda)}</div>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 25px;">
          <div style="border-top: 1px solid #334155; padding-top: 5px; text-align: center; font-size: 8pt;">
            <strong>ENTREGADO POR (CAJA)</strong><br />
            <span>${exp.confirmado_por || user?.nombre || 'Caja Central / Administración'}</span><br />
            <span style="font-size: 7pt; color: #64748b;">Firma Autorizada</span>
          </div>
          <div style="border-top: 1px solid #334155; padding-top: 5px; text-align: center; font-size: 8pt;">
            <strong>RECIBÍ CONFORME</strong><br />
            <span>${exp.beneficiario !== 'N/A' ? exp.beneficiario : 'Beneficiario'}</span><br />
            <span style="font-size: 7pt; color: #64748b;">C.I. / Huella Dactilar</span>
          </div>
        </div>
      </div>
    `;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Recibo Continuo #${numeroRecibo} - ${companyName}</title>
          <meta charset="utf-8" />
          <style>
            @page { size: letter portrait; margin: 1.2cm; }
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; color: #0f172a; margin: 0; padding: 0; }
            .cut-line { border-top: 1px dashed #94a3b8; margin: 15px 0 25px 0; text-align: center; position: relative; }
            .cut-text { background: #fff; padding: 0 10px; font-size: 7pt; color: #64748b; position: relative; top: -7px; text-transform: uppercase; }
          </style>
        </head>
        <body>
          ${voucherHtml('ORIGINAL - ADMINISTRACIÓN')}
          <div class="cut-line"><span class="cut-text">✂ Línea de corte / Talón de comprobante ✂</span></div>
          ${voucherHtml('COPIA - BENEFICIARIO')}
        </body>
      </html>
    `);
    printWindow.document.close();
    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
    }, 400);
  };

  // WhatsApp share link for single expense receipt
  const getWhatsAppExpenseUrl = (exp: AdminExpenseRecord) => {
    const companyName = (profile?.nombre_banca || profile?.banca || 'CORPORACION CALENDARIO, CA').toUpperCase();
    const numeroRecibo = exp.referencia !== 'N/A' && exp.referencia.trim() ? exp.referencia : String(exp.id);
    const catLabel = CATEGORIAS_CONFIG[exp.categoria]?.label || exp.categoria;
    const msg =
      `🏛️ *${companyName}*\n` +
      `🧾 *RECIBO CONTINUO DE EGRESO #${numeroRecibo}*\n\n` +
      `📅 *Fecha:* ${formatDate(exp.fecha)}\n` +
      `👤 *Beneficiario:* ${exp.beneficiario}\n` +
      `🏷️ *Categoría:* ${catLabel}\n` +
      `📝 *Concepto:* ${exp.concepto}\n` +
      `💰 *Monto Cancelado:* ${formatCurrency(exp.monto, exp.moneda)}\n` +
      `✍️ *Registrado por:* ${exp.confirmado_por || 'Caja Central'}\n` +
      `🔒 *Estatus:* PAGADO Y CONFORME\n\n` +
      `_Comprobante emitido por Sistema Multibanca Express CMS_`;
    return `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`;
  };

  return (
    <div className="space-y-6">
      {/* 1. Header Banner */}
      <div className="p-6 rounded-3xl bg-[#0D1B22] border border-slate-800 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <Building2 className="w-5 h-5" />
            </span>
            <h2 className="text-xl font-black text-white tracking-tight">
              Gastos Administrativos del Comercializador
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
              Exclusivo Casa Central
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            Control y registro de gastos operacionales y administrativos de la casa matriz (sueldos, oficina, internet, equipos y compras). 
            Estos gastos cuentan con <strong>recibo continuo correlativo</strong> y se descuentan directamente de la ganancia del Comercializador.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handlePrintPDF}
            disabled={filteredExpenses.length === 0}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            title="Imprimir bitácora general en PDF"
          >
            <Printer className="w-4 h-4 text-sky-400" />
            <span>Imprimir PDF</span>
          </button>

          <button
            onClick={handleExportCSV}
            disabled={filteredExpenses.length === 0}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            title="Exportar a CSV"
          >
            <Download className="w-4 h-4 text-emerald-400" />
            <span>Exportar CSV</span>
          </button>

          <button
            onClick={loadData}
            disabled={isLoading}
            className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all cursor-pointer"
            title="Actualizar datos y recalcular correlativo continuo"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-emerald-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* 2. KPI Cards: Total Admin Expenses by Currency */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Card 1: BS */}
        <div className="p-5 rounded-2xl bg-[#0D1B22] border border-slate-800/80 shadow-md">
          <div className="flex items-center justify-between text-xs text-slate-400 font-bold uppercase tracking-wider mb-2">
            <span>🇻🇪 Bolívares (BS)</span>
            <span className="text-[10px] text-amber-400 font-mono">
              {filterPeriod === 'ciclo' ? `Semana ${systemCycle.semana || 'Actual'}` : 'Histórico Total'}
            </span>
          </div>
          <div className="text-2xl font-black font-mono text-white">
            {formatCurrency(totalsByCurrency.BS, 'BS')}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">Gastos de nómina y oficina en moneda nacional</div>
        </div>

        {/* Card 2: USD */}
        <div className="p-5 rounded-2xl bg-[#0D1B22] border border-slate-800/80 shadow-md">
          <div className="flex items-center justify-between text-xs text-slate-400 font-bold uppercase tracking-wider mb-2">
            <span>💵 Dólares (USD)</span>
            <span className="text-[10px] text-sky-400 font-mono">
              {filterPeriod === 'ciclo' ? `Semana ${systemCycle.semana || 'Actual'}` : 'Histórico Total'}
            </span>
          </div>
          <div className="text-2xl font-black font-mono text-sky-300">
            {formatCurrency(totalsByCurrency.USD, 'USD')}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">Equipos, software, enlaces e insumos en divisas</div>
        </div>

        {/* Card 3: COP */}
        <div className="p-5 rounded-2xl bg-[#0D1B22] border border-slate-800/80 shadow-md">
          <div className="flex items-center justify-between text-xs text-slate-400 font-bold uppercase tracking-wider mb-2">
            <span>🇨🇴 Pesos (COP)</span>
            <span className="text-[10px] text-emerald-400 font-mono">
              {filterPeriod === 'ciclo' ? `Semana ${systemCycle.semana || 'Actual'}` : 'Histórico Total'}
            </span>
          </div>
          <div className="text-2xl font-black font-mono text-emerald-300">
            {formatCurrency(totalsByCurrency.COP, 'COP')}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">Operaciones de frontera y pagos en pesos</div>
        </div>
      </div>

      {/* 3. Form: Registrar Gasto Administrativo */}
      <div id="tour-gastosadmin-form" className="p-6 rounded-3xl bg-[#0D1B22] border border-slate-800 shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
          <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
            <Plus className="w-4 h-4 text-indigo-400" />
            <span>Registrar Gasto Administrativo (Comercializador)</span>
          </h3>
          <span className="text-xs text-slate-400">
            Ciclo Actual: <strong className="text-slate-200">Semana {systemCycle.semana || '1'}</strong>
          </span>
        </div>

        <form onSubmit={handleSaveExpense} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Categoría */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-300">Categoría del Gasto *</label>
              <select
                value={formCategoria}
                onChange={(e) => setFormCategoria(e.target.value)}
                className="w-full bg-[#071217] border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white font-bold focus:outline-none focus:border-indigo-500"
              >
                {Object.entries(CATEGORIAS_CONFIG).map(([k, cfg]) => (
                  <option key={k} value={k}>
                    {cfg.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Moneda */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-300">Moneda *</label>
              <select
                value={formMoneda}
                onChange={(e) => setFormMoneda(e.target.value as any)}
                className="w-full bg-[#071217] border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white font-bold focus:outline-none focus:border-indigo-500"
              >
                <option value="BS">🇻🇪 Bolívares (BS)</option>
                <option value="USD">💵 Dólares (USD)</option>
                <option value="COP">🇨🇴 Pesos (COP)</option>
              </select>
            </div>

            {/* Monto */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-300">Monto *</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={formMonto}
                onChange={(e) => setFormMonto(e.target.value)}
                placeholder="0.00"
                className="w-full bg-[#071217] border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white font-mono font-bold focus:outline-none focus:border-indigo-500"
              />
            </div>

            {/* Fecha */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-300">Fecha del Gasto *</label>
              <input
                type="date"
                required
                value={formFecha}
                onChange={(e) => setFormFecha(e.target.value)}
                className="w-full bg-[#071217] border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white font-mono font-bold focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Beneficiario */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-300">Beneficiario / Proveedor / Personal</label>
              <input
                type="text"
                value={formBeneficiario}
                onChange={(e) => setFormBeneficiario(e.target.value)}
                placeholder="Ej: Nómina Administrador, Proveedor Dell, Cantv..."
                className="w-full bg-[#071217] border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            {/* Concepto */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-300">Concepto / Descripción Detallada *</label>
              <input
                type="text"
                required
                value={formConcepto}
                onChange={(e) => setFormConcepto(e.target.value)}
                placeholder="Ej: Pago de sueldo quincenal, Compra de 2 laptops, Fibra óptica..."
                className="w-full bg-[#071217] border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            {/* Referencia / Recibo Continuo */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <span>Nro. Recibo / Comprobante / Ref *</span>
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                    <Sparkles className="w-2.5 h-2.5" />
                    <span>Continuo Auto</span>
                  </span>
                </label>
                {formReferencia !== nextContinuousCorrelativo && (
                  <button
                    type="button"
                    onClick={() => setFormReferencia(nextContinuousCorrelativo)}
                    className="text-[10px] text-sky-400 hover:text-sky-300 underline font-semibold cursor-pointer"
                    title="Restablecer al siguiente correlativo continuo automático"
                  >
                    Usar #{nextContinuousCorrelativo}
                  </button>
                )}
              </div>
              <div className="relative">
                <input
                  type="text"
                  value={formReferencia}
                  onChange={(e) => setFormReferencia(e.target.value)}
                  placeholder={`Ej: ${nextContinuousCorrelativo} (Continuo)`}
                  className="w-full bg-[#071217] border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white font-mono font-bold focus:outline-none focus:border-indigo-500 pr-24"
                />
                <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1 pointer-events-none">
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-slate-800 text-emerald-400 border border-slate-700">
                    #{nextContinuousCorrelativo}
                  </span>
                </div>
              </div>
              <p className="text-[10px] text-slate-400">
                Correlativo continuo automático (ej: 01, 02, 03...). Puede editarse si cuenta con una factura fiscal externa.
              </p>
            </div>
          </div>

          <div className="flex items-center justify-end pt-2">
            <button
              type="submit"
              disabled={isProcessing}
              className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-sky-600 hover:from-indigo-500 hover:to-sky-500 text-white font-extrabold text-xs uppercase tracking-wider transition-all shadow-lg shadow-indigo-600/20 flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
              <span>{isProcessing ? 'Registrando...' : 'Registrar Gasto Administrativo'}</span>
            </button>
          </div>
        </form>

        {message && (
          <div
            className={`p-3.5 rounded-2xl border flex items-center gap-2.5 text-xs font-bold ${
              message.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
            }`}
          >
            {message.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
            <span>{message.text}</span>
          </div>
        )}
      </div>

      {/* 4. Table Controls: Filters and Search */}
      <div className="p-4 rounded-2xl bg-[#0D1B22] border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {/* Period filter */}
          <div className="flex items-center gap-1 bg-[#071217] p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setFilterPeriod('ciclo')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                filterPeriod === 'ciclo' ? 'bg-indigo-500 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              Ciclo Actual ({systemCycle.semana ? `Semana ${systemCycle.semana}` : 'Activo'})
            </button>
            <button
              onClick={() => setFilterPeriod('todos')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                filterPeriod === 'todos' ? 'bg-indigo-500 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              Histórico Completo ({expenses.length})
            </button>
          </div>

          {/* Category filter */}
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="bg-[#071217] border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white font-bold focus:outline-none"
          >
            <option value="TODAS">Todas las Categorías</option>
            {Object.entries(CATEGORIAS_CONFIG).map(([k, cfg]) => (
              <option key={k} value={k}>
                {cfg.label}
              </option>
            ))}
          </select>

          {/* Currency filter */}
          <select
            value={filterCurrency}
            onChange={(e) => setFilterCurrency(e.target.value)}
            className="bg-[#071217] border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white font-bold focus:outline-none"
          >
            <option value="TODAS">Todas las Monedas</option>
            <option value="BS">🇻🇪 Bolívares (BS)</option>
            <option value="USD">💵 Dólares (USD)</option>
            <option value="COP">🇨🇴 Pesos (COP)</option>
          </select>
        </div>

        {/* Search */}
        <div className="relative min-w-[240px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por concepto, beneficiario..."
            className="w-full bg-[#071217] border border-slate-700 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      {/* 5. Table of Expenses */}
      <div id="tour-gastosadmin-table" className="bg-[#0D1B22] border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#071217] border-b border-slate-800 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                <th className="py-3.5 px-4">Fecha</th>
                <th className="py-3.5 px-4">Categoría</th>
                <th className="py-3.5 px-4">Concepto / Detalle</th>
                <th className="py-3.5 px-4">Beneficiario</th>
                <th className="py-3.5 px-4">N° Recibo / Ref</th>
                <th className="py-3.5 px-4 text-center">Moneda</th>
                <th className="py-3.5 px-4 text-right">Monto</th>
                <th className="py-3.5 px-4 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-xs">
              {filteredExpenses.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500">
                    <Building2 className="w-10 h-10 mx-auto mb-2 text-slate-600" />
                    <p className="font-bold text-slate-400">No hay gastos administrativos registrados</p>
                    <p className="text-[11px] text-slate-500">
                      Utiliza el formulario de arriba para registrar sueldos, alquiler, compras o servicios de oficina.
                    </p>
                  </td>
                </tr>
              ) : (
                filteredExpenses.map((exp) => {
                  const cfg = CATEGORIAS_CONFIG[exp.categoria] || CATEGORIAS_CONFIG.OTROS;
                  const IconComp = cfg.icon;
                  const recLabel = exp.referencia !== 'N/A' && exp.referencia.trim() ? exp.referencia : String(exp.id);

                  return (
                    <tr key={exp.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-3 px-4 font-mono text-slate-300 text-[11px] whitespace-nowrap">
                        {exp.fecha}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase border ${cfg.bg} ${cfg.color}`}>
                          <IconComp className="w-3 h-3" />
                          <span>{cfg.label}</span>
                        </span>
                      </td>
                      <td className="py-3 px-4 font-bold text-slate-100 max-w-xs break-words">
                        {exp.concepto}
                      </td>
                      <td className="py-3 px-4 text-slate-300 font-medium">
                        {exp.beneficiario !== 'N/A' ? (
                          <span className="text-slate-200">{exp.beneficiario}</span>
                        ) : (
                          <span className="text-slate-500 italic">No especificado</span>
                        )}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 font-bold font-mono text-sky-400 bg-sky-500/10 border border-sky-500/20 px-2.5 py-0.5 rounded-lg text-[11px]">
                          <Hash className="w-3 h-3 text-sky-400" />
                          <span>{recLabel}</span>
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center font-black">
                        <span className={`px-2 py-0.5 rounded text-[10px] ${
                          exp.moneda === 'BS' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                          exp.moneda === 'USD' ? 'bg-sky-500/10 text-sky-400 border border-sky-500/20' :
                          'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        }`}>
                          {exp.moneda}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-black font-mono text-white text-sm whitespace-nowrap">
                        {formatCurrency(exp.monto, exp.moneda)}
                      </td>
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => setReceiptModalExpense(exp)}
                            className="px-2 py-1 rounded-lg text-slate-300 hover:text-sky-400 hover:bg-sky-500/10 transition-colors cursor-pointer flex items-center gap-1 border border-slate-700/60"
                            title="Ver e Imprimir Recibo Continuo / Comprobante de Egreso"
                          >
                            <Receipt className="w-3.5 h-3.5 text-sky-400" />
                            <span className="text-[10px] font-bold text-sky-400">Recibo</span>
                          </button>

                          <button
                            onClick={() => setDeleteTarget(exp)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                            title="Eliminar gasto administrativo"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 6. Receipt Modal: Continuous Voucher (Ticket 80mm / Media Carta / WhatsApp) */}
      {receiptModalExpense && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#0D1B22] border border-slate-800 rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl animate-fade-in my-8">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h4 className="text-sm font-extrabold text-white flex items-center gap-2">
                <Receipt className="w-4 h-4 text-sky-400" />
                <span>Recibo Continuo de Egreso</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-black bg-sky-500/20 text-sky-300 border border-sky-500/30">
                  #{receiptModalExpense.referencia !== 'N/A' && receiptModalExpense.referencia.trim() ? receiptModalExpense.referencia : receiptModalExpense.id}
                </span>
              </h4>
              <button
                onClick={() => setReceiptModalExpense(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Thermal Ticket 80mm preview (Impresión Continua) */}
            <div
              id="thermal-printable-area"
              className="bg-white text-slate-900 rounded-2xl p-5 shadow-2xl font-mono text-xs space-y-3 border border-slate-200"
            >
              <div className="text-center border-b border-dashed border-slate-400 pb-3">
                <div className="text-[11px] font-black tracking-wider text-slate-900 uppercase">
                  {(profile?.nombre_banca || profile?.banca || 'CORPORACION CALENDARIO, CA').toUpperCase()}
                </div>
                <div className="text-[9px] font-bold text-slate-600 uppercase tracking-widest mt-0.5">
                  MULTIBANCA EXPRESS CMS • CASA MATRIZ
                </div>
                <div className="inline-block mt-2 px-3 py-1 bg-slate-900 text-white rounded font-black text-xs tracking-wider">
                  RECIBO CONTINUO DE EGRESO #{receiptModalExpense.referencia !== 'N/A' && receiptModalExpense.referencia.trim() ? receiptModalExpense.referencia : receiptModalExpense.id}
                </div>
              </div>

              <div className="space-y-1.5 text-[11px] pt-1">
                <div className="flex justify-between">
                  <span className="text-slate-500 font-bold">FECHA:</span>
                  <span className="font-bold">{formatDate(receiptModalExpense.fecha)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-bold">CICLO OPERATIVO:</span>
                  <span>Semana {systemCycle.semana || 'Actual'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-bold">CATEGORÍA:</span>
                  <span className="font-bold">{CATEGORIAS_CONFIG[receiptModalExpense.categoria]?.label || receiptModalExpense.categoria}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-bold">BENEFICIARIO:</span>
                  <span className="font-bold">{receiptModalExpense.beneficiario !== 'N/A' ? receiptModalExpense.beneficiario : 'NO ESPECIFICADO'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-bold">NRO. CORRELATIVO:</span>
                  <span className="font-bold font-mono text-indigo-700">
                    #{receiptModalExpense.referencia !== 'N/A' && receiptModalExpense.referencia.trim() ? receiptModalExpense.referencia : receiptModalExpense.id}
                  </span>
                </div>
              </div>

              <div className="border-t border-dashed border-slate-300 pt-2 text-[10.5px]">
                <span className="text-slate-500 font-bold block mb-1">CONCEPTO / MOTIVO:</span>
                <p className="text-slate-800 bg-slate-100 p-2.5 rounded-lg border border-slate-200 font-sans font-medium leading-relaxed">
                  {receiptModalExpense.concepto}
                </p>
              </div>

              <div className="border-2 border-slate-900 py-3 px-3 text-center bg-slate-50 rounded-xl space-y-1">
                <div className="text-[9px] font-black uppercase text-slate-500 tracking-wider">MONTO TOTAL CANCELADO</div>
                <div className="text-xl font-black text-slate-900 font-mono">
                  {formatCurrency(receiptModalExpense.monto, receiptModalExpense.moneda)}
                </div>
                <div className="text-[8.5px] font-bold text-slate-600 italic">
                  {montoEnLetras(receiptModalExpense.monto, receiptModalExpense.moneda)}
                </div>
              </div>

              <div className="border-t border-dashed border-slate-400 pt-6 grid grid-cols-2 gap-3 text-center text-[8.5px] text-slate-600">
                <div>
                  <div className="border-t border-slate-900 pt-1 font-bold text-slate-900">
                    ENTREGADO POR (CAJA)
                  </div>
                  <div className="text-[7.5px] text-slate-500">
                    {receiptModalExpense.confirmado_por || user?.nombre || 'Administración'}
                  </div>
                </div>
                <div>
                  <div className="border-t border-slate-900 pt-1 font-bold text-slate-900">
                    RECIBÍ CONFORME
                  </div>
                  <div className="text-[7.5px] text-slate-500">
                    {receiptModalExpense.beneficiario !== 'N/A' ? receiptModalExpense.beneficiario : 'Beneficiario'}
                  </div>
                  <div className="text-[7px] text-slate-400 mt-0.5">C.I. / Huella Dactilar</div>
                </div>
              </div>

              <div className="text-center text-[7.5px] text-slate-400 pt-1 border-t border-dashed border-slate-300">
                COMPROBANTE INMUTABLE • MULTIBANCA EXPRESS CMS
              </div>
            </div>

            {/* Print and WhatsApp Buttons */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2">
              <button
                onClick={() => handlePrintSingleReceipt(receiptModalExpense)}
                className="py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-bold flex items-center justify-center gap-1.5 transition-all border border-slate-700 cursor-pointer shadow-md"
                title="Imprimir ticket térmico en formato continuo (80mm)"
              >
                <Printer className="w-3.5 h-3.5 text-sky-400" />
                <span>Ticket 80mm</span>
              </button>

              <button
                onClick={() => handlePrintLetterVoucher(receiptModalExpense)}
                className="py-2.5 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-md shadow-indigo-600/20 cursor-pointer"
                title="Imprimir comprobante en formato carta con original y copia para archivar"
              >
                <FileText className="w-3.5 h-3.5 text-indigo-200" />
                <span>Comprobante PDF</span>
              </button>

              <a
                href={getWhatsAppExpenseUrl(receiptModalExpense)}
                target="_blank"
                rel="noreferrer"
                className="py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-md shadow-emerald-600/20 cursor-pointer"
                title="Enviar comprobante de recibo por WhatsApp"
              >
                <Share2 className="w-3.5 h-3.5 text-emerald-200" />
                <span>WhatsApp</span>
              </a>
            </div>
          </div>
        </div>
      )}

      {/* 7. Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-[#0D1B22] border border-slate-800 rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h4 className="text-base font-extrabold text-white flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-rose-500" />
                <span>Confirmar Eliminación</span>
              </h4>
              <button
                onClick={() => setDeleteTarget(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-300">
              ¿Estás seguro de que deseas eliminar este gasto administrativo?
            </p>

            <div className="p-3.5 rounded-2xl bg-[#071217] border border-slate-800 text-xs font-mono space-y-1">
              <div><strong className="text-slate-400">Categoría:</strong> {CATEGORIAS_CONFIG[deleteTarget.categoria]?.label || deleteTarget.categoria}</div>
              <div><strong className="text-slate-400">Concepto:</strong> {deleteTarget.concepto}</div>
              <div><strong className="text-slate-400">Recibo:</strong> #{deleteTarget.referencia}</div>
              <div><strong className="text-slate-400">Monto:</strong> <span className="text-white font-bold">{formatCurrency(deleteTarget.monto, deleteTarget.moneda)}</span></div>
              <div><strong className="text-slate-400">Fecha:</strong> {deleteTarget.fecha}</div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-all cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleDeleteExpense}
                disabled={isProcessing}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
              >
                {isProcessing ? 'Eliminando...' : 'Sí, Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
