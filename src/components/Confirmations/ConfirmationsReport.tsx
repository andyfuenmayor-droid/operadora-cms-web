import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { normalizarMoneda, formatCurrency, formatDate, parseCleanReference, cleanReference } from '../../utils/formatters';
import type { ConfirmationTransaction } from '../../types';
import {
  CheckCircle2,
  XCircle,
  RotateCcw,
  Clock,
  Filter,
  RefreshCw,
  Search,
  Printer,
  Share2,
  DollarSign,
  Building2,
  Calendar,
  AlertTriangle,
  FileText,
  User,
  CheckCheck,
  CreditCard,
  Banknote,
  Send,
  ArrowRight,
  TrendingUp,
  ShieldCheck,
  ChevronDown,
  Landmark,
} from 'lucide-react';
import { realtimeBroadcast } from '../../utils/realtimeBroadcast';
import { logAuditEvent } from '../../utils/auditLogger';
import { loadCurrencies, type CurrencyConfig } from '../../utils/currencies';
import { UI_LOCK } from '../../styles/uiDesignLock';


interface CustodiaAgencia {
  agencia: string;
  supervisor: string;
  arrastre_cop: number;
  recaudado_cop: number;
  liquidado_cop: number;
  custodia_taquilla_cop: number;
  en_ruta_cop: number;
  custodia_usd: number;
  custodia_bs: number;
  status: 'custodia' | 'ruta' | 'al_dia';
}

// Helper to normalize any date format (DD/MM/YYYY, ISO, etc.) to YYYY-MM-DD
const normalizeToISODate = (dStr: string): string => {
  if (!dStr) return '';
  const trimmed = dStr.trim();
  if (/^\d{2}[\/\-]\d{2}[\/\-]\d{4}/.test(trimmed)) {
    const parts = trimmed.slice(0, 10).split(/[\/\-]/);
    return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
  }
  if (/^\d{4}[\/\-]\d{2}[\/\-]\d{2}/.test(trimmed)) {
    return trimmed.slice(0, 10).replace(/\//g, '-');
  }
  try {
    const d = new Date(trimmed);
    if (!isNaN(d.getTime())) {
      return d.toISOString().slice(0, 10);
    }
  } catch {}
  return trimmed.slice(0, 10);
};

const getTimeString = (dateTimeVal?: string | null): string => {
  if (!dateTimeVal) return '';
  try {
    const d = new Date(dateTimeVal);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', hour12: true });
  } catch {
    return '';
  }
};

export const ConfirmationsReport: React.FC = () => {
  const { effectiveUserId, systemCycle, user } = useAuth();
  const todayIso = new Date().toISOString().slice(0, 10);

  // Active sub-tab
  const [activeTab, setActiveTab] = useState<'reporte' | 'rechazados' | 'arqueo'>('reporte');

  // Filters state (Initial range encompasses from cycle start up to today)
  const [fechaDesde, setFechaDesde] = useState(systemCycle.desde);
  const [fechaHasta, setFechaHasta] = useState(todayIso > systemCycle.hasta ? todayIso : systemCycle.hasta);
  const [selAgencia, setSelAgencia] = useState('Todas');
  const [selCategoria, setSelCategoria] = useState('Todas');
  const [selEstado, setSelEstado] = useState<'Todos' | 'Confirmados' | 'En Ruta' | 'Rechazados' | 'Pendientes'>('Todos');
  const [searchQuery, setSearchQuery] = useState('');

  // Loaded data
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transactions, setTransactions] = useState<ConfirmationTransaction[]>([]);
  const [agenciesList, setAgenciesList] = useState<string[]>([]);
  const [activeCurrencies, setActiveCurrencies] = useState<CurrencyConfig[]>([]);
  const [cajaSupervisorRows, setCajaSupervisorRows] = useState<any[]>([]);

  // Receipt modal state
  const [receiptModalItem, setReceiptModalItem] = useState<any | null>(null);

  // New Cash Entry Form state (Tab 3)
  const [formAgencia, setFormAgencia] = useState('');
  const [formSupervisor, setFormSupervisor] = useState('');
  const [formMoneda, setFormMoneda] = useState<string>('BS');
  const [formMonto, setFormMonto] = useState('');
  const [formNota, setFormNota] = useState('');
  const [isSubmittingCash, setIsSubmittingCash] = useState(false);

  // Feedback message
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Load all data
  const loadData = useCallback(async () => {
    if (!effectiveUserId) return;
    setIsLoading(true);
    setMessage(null);

    try {
      // 1. Fetch agencies & active currencies
      const [{ data: agData }, currs] = await Promise.all([
        supabase
          .from('agencias')
          .select('id, nombre_agencia, cuentas_asignadas')
          .eq('user_id', effectiveUserId),
        loadCurrencies(effectiveUserId),
      ]);
      setActiveCurrencies(currs);
      if (currs.length > 0) {
        setFormMoneda(currs[0].codigo);
      }

      const ags = (agData || [])
        .map((a: any) => String(a.nombre_agencia || '').trim().toUpperCase())
        .filter(Boolean);
      const uniqueAgs = Array.from(new Set(ags)).sort();
      setAgenciesList(uniqueAgs);

      const agencyNameMap: Record<string, string> = {};
      const cashierMap: Record<string, string> = {};
      const cobradorMap: Record<string, string> = {};

      (agData || []).forEach((a: any) => {
        const aNom = String(a.nombre_agencia || '').trim().toUpperCase();
        agencyNameMap[String(a.id)] = aNom;
        cashierMap[`ag_${a.id}`] = `${aNom} (Taquilla)`;
        cashierMap[`AG_${a.id}`] = `${aNom} (Taquilla)`;
      });

      // 2. Fetch cashiers, collectors, and bank accounts
      const [{ data: userData }, { data: cobData }, { data: cbData }] = await Promise.all([
        supabase.from('taquilla_usuarios').select('id, usuario, nombre_cajero, rol'),
        supabase.from('cda_cobradores').select('id, usuario, nombre'),
        supabase.from('cuentas_bancarias').select('id, banco, nombre_titular, agencia_asignada').eq('user_id', effectiveUserId),
      ]);

      (userData || []).forEach((u: any) => {
        cashierMap[String(u.id)] = String(u.nombre_cajero || u.usuario || `Cajero ${u.id}`);
      });

      (cobData || []).forEach((c: any) => {
        const cNom = String(c.nombre || c.usuario || '').trim();
        if (cNom) {
          cobradorMap[String(c.id)] = cNom;
          if (c.usuario) cobradorMap[String(c.usuario).trim().toLowerCase()] = cNom;
        }
        cashierMap[String(c.id)] = `Cobrador: ${cNom || c.id}`;
      });

      const resolveCobrador = (r: any): string => {
        const cNomRaw = r.cobrador_nombre || r.cobrado_por || r.cobrador;
        if (cNomRaw && String(cNomRaw).trim().toUpperCase() !== 'ENTREGADO A COBRADOR' && String(cNomRaw).trim().toUpperCase() !== 'N/A') {
          return String(cNomRaw).trim();
        }
        if (r.cobrador_id && cobradorMap[String(r.cobrador_id)]) {
          return cobradorMap[String(r.cobrador_id)];
        }
        if (r.confirmado_por && String(r.confirmado_por).trim().toUpperCase() !== 'ENTREGADO A COBRADOR') {
          return String(r.confirmado_por).trim();
        }
        if (r.pagador && String(r.pagador).trim().toUpperCase() !== 'ENTREGADO A COBRADOR' && String(r.pagador).trim().toUpperCase() !== 'N/A') {
          return String(r.pagador).trim();
        }
        return '';
      };

      const resolveCashierName = (cid: string, agNom: string): string => {
        if (!cid || cid === 'N/A' || cid === 'null' || cid === 'undefined') {
          return agNom ? `${agNom} (Taquilla)` : 'Taquilla';
        }
        const cidClean = String(cid).trim();
        if (cashierMap[cidClean]) return cashierMap[cidClean];
        if (cidClean.toLowerCase().startsWith('ag_')) {
          const rawAid = cidClean.slice(3);
          const nom = agencyNameMap[rawAid] || agNom;
          return nom ? `${nom} (Taquilla)` : `Agencia #${rawAid}`;
        }
        if (cidClean.length >= 20 && cidClean.includes('-')) {
          return agNom ? `${agNom} (Cajero)` : 'Cajero Taquilla';
        }
        return `Cajero ${cidClean}`;
      };

      const resolveBanco = (r: any, agStr: string): string => {
        const posStr = String(r.pos_o_cuenta || '').trim();
        if (posStr && posStr !== 'N/A' && !posStr.includes('Cuenta Operadora General')) {
          const rawB = posStr.split('|')[0].trim().replace('DISPOSITIVO: ', '');
          if (rawB) return rawB.toUpperCase();
        }
        const agObj = (agData || []).find((a: any) => String(a.nombre_agencia || '').trim().toUpperCase() === agStr);
        if (agObj?.cuentas_asignadas) {
          const m = agObj.cuentas_asignadas.match(/\[CUENTA\]\s*([A-Za-z0-9_-]+)/i);
          if (m && m[1]) return m[1].trim().toUpperCase();
        }
        const cbObj = (cbData || []).find((c: any) => String(c.agencia_asignada || '').trim().toUpperCase() === agStr);
        if (cbObj?.banco) return String(cbObj.banco).trim().toUpperCase();

        const monNorm = normalizarMoneda(r.moneda);
        if (monNorm === 'COP') return 'BANCOLOMBIA';
        if (monNorm === 'USD') return 'CITI BANK / ZELLE';
        return 'BANESCO';
      };

      // 3. Parallel fetch transaction tables
      const [pbRes, gdRes, gcRes, cgRes, pdRes, psRes, gsRes, csRes] = await Promise.all([
        supabase.from('cda_pagos_bancarios').select('*').eq('user_id', effectiveUserId),
        supabase.from('cda_gastos_diarios').select('*').eq('user_id', effectiveUserId),
        supabase.from('gastos').select('*').eq('user_id', effectiveUserId),
        supabase.from('cda_gastos').select('*').eq('user_id', effectiveUserId),
        supabase.from('cda_pagos_diarios').select('*').eq('user_id', effectiveUserId),
        supabase.from('pagos_semana').select('*').eq('user_id', effectiveUserId),
        supabase.from('gastos_semana').select('*').eq('user_id', effectiveUserId),
        supabase.from('cda_caja_efectivo_supervisor').select('*').eq('user_id', effectiveUserId),
      ]);

      setCajaSupervisorRows(csRes.data || []);

      const list: ConfirmationTransaction[] = [];

      // Process Bancarios
      (pbRes.data || []).forEach((r: any) => {
        const isRech = !!r.rechazado || String(r.estado || '').toUpperCase() === 'RECHAZADO';
        const isConf = (!!r.confirmado || !!r.confirmado_supervisor) && !isRech;
        const cid = String(r.cajero_id || r.user_id || '');
        const agStr = String(r.agencia || '').trim().toUpperCase();
        const met = String(r.metodo_pago || 'BANCO').trim().toUpperCase();
        const conc = String(r.concepto || 'Pago Bancario');
        const isPremio = ['PREMIO', 'PÉRDIDA', 'PERDIDA', 'ABONO', 'REPOSICION'].some((k) =>
          (conc + ' ' + met).toUpperCase().includes(k)
        );
        let cat = 'Bancos';
        if (isPremio) cat = 'Pago de Premios';
        else if (met.includes('PUNTO')) cat = 'Punto de Venta';

        const rawRef = String(r.referencia || 'N/A');
        const { cleanRef } = parseCleanReference(rawRef);

        list.push({
          id: r.id,
          tabla: 'cda_pagos_bancarios',
          categoria: cat,
          fecha: String(r.fecha || r.created_at || ''),
          agencia: agStr,
          cajero_id: cid,
          cajero_nombre: resolveCashierName(cid, agStr),
          banco: resolveBanco(r, agStr),
          pos_o_cuenta: r.pos_o_cuenta,
          metodo: met,
          monto: parseFloat(r.monto) || 0,
          moneda: normalizarMoneda(r.moneda),
          referencia: cleanRef,
          concepto: conc,
          pagador: String(r.datos_pagador || 'N/A'),
          confirmado: isConf,
          confirmado_por: r.confirmado_por || null,
          rechazado: isRech,
          rechazado_por: r.rechazado_por || null,
          motivo_rechazo: r.motivo_rechazo || null,
          fecha_rechazo: r.fecha_rechazo || null,
          created_at: String(r.created_at || ''),
        });
      });

      // Process pagos_semana (CMS Manual Payments)
      (psRes.data || []).forEach((r: any) => {
        const isRech = !!r.rechazado || String(r.estado || '').toUpperCase() === 'RECHAZADO';
        const isConf = !!r.confirmado && !isRech;
        const rawRef = String(r.referencia || 'N/A');
        const { cleanRef, extractedBank } = parseCleanReference(rawRef);
        const agStr = String(r.agencia || '').trim().toUpperCase();
        const tipoPagoStr = String(r.tipo_pago || 'PAGO').toUpperCase();
        const metRaw = String(r.metodo || 'BANCO').trim().toUpperCase();

        const isSyncedFromTaquilla = (pbRes.data || []).some((pb: any) => {
          const pbAg = String(pb.agencia || '').trim().toUpperCase();
          const pbMonto = Number(pb.monto || 0);
          const pbRef = String(pb.referencia || '').trim().toUpperCase();
          if (pbAg !== agStr || Math.abs(pbMonto - Number(r.monto || 0)) >= 0.01) {
            return false;
          }
          if (rawRef.toUpperCase().includes('CONFIRMADO BANCO')) {
            return true;
          }
          if (pbRef && pbRef !== 'N/A' && (rawRef.toUpperCase().includes(pbRef) || cleanRef.toUpperCase() === pbRef)) {
            return true;
          }
          return false;
        });

        if (!isSyncedFromTaquilla) {
          let cat = 'Bancos';
          if (tipoPagoStr.includes('PREMIO') || rawRef.includes('PREMIO')) {
            cat = 'Pago de Premios';
          } else if (metRaw.includes('EFECTIVO')) {
            cat = 'Efectivo';
          }

          const bancoFinal = extractedBank
            ? extractedBank.split(' - ')[0].trim().toUpperCase()
            : resolveBanco(r, agStr);

          list.push({
            id: r.id,
            tabla: 'pagos_semana',
            categoria: cat,
            fecha: String(r.fecha || r.created_at || ''),
            agencia: agStr,
            cajero_id: 'CMS',
            cajero_nombre: 'Administración (CMS)',
            banco: bancoFinal,
            pos_o_cuenta: r.pos_o_cuenta || extractedBank,
            metodo: metRaw,
            monto: parseFloat(r.monto) || 0,
            moneda: normalizarMoneda(r.moneda),
            referencia: cleanRef,
            concepto: tipoPagoStr === 'PAGO DE PREMIOS' ? 'Pago de Premios (CMS)' : 'Pago / Cobro Directo (CMS)',
            pagador: 'Operadora / CMS',
            confirmado: isConf,
            confirmado_por: r.confirmado_por || null,
            rechazado: isRech,
            rechazado_por: r.rechazado_por || null,
            motivo_rechazo: r.motivo_rechazo || null,
            fecha_rechazo: r.fecha_rechazo || null,
            created_at: String(r.created_at || ''),
          });
        }
      });

      // Process Gastos
      const allGastos = [
        ...(gdRes.data || []).map((r: any) => ({ ...r, _table: 'cda_gastos_diarios' })),
        ...(gcRes.data || []).map((r: any) => ({ ...r, _table: 'gastos' })),
        ...(cgRes.data || []).map((r: any) => ({ ...r, _table: 'cda_gastos' })),
        ...(gsRes.data || []).map((r: any) => ({ ...r, _table: 'gastos_semana' })),
      ];

      allGastos.forEach((r: any) => {
        const isRech = !!r.rechazado || String(r.estado || '').toUpperCase() === 'RECHAZADO';
        const isConf = (!!r.confirmado || !!r.confirmado_supervisor) && !isRech;
        const cid = String(r.cajero_id || r.user_id || '');
        const agStr = String(r.agencia || r.nombre_agency || '').trim().toUpperCase();
        const cNom = r._table === 'gastos_semana' ? 'Administración (CMS)' : resolveCashierName(cid, agStr);

        let rawConcepto = String(r.concepto || r.descripcion || 'Gasto Operativo').trim();
        let refStr = String(r.referencia || '').trim();
        if (!refStr || refStr === 'N/A') {
          const matchRef = rawConcepto.match(/\[REF:\s*([^\]]+)\]/i);
          if (matchRef) {
            refStr = matchRef[1].trim();
            rawConcepto = rawConcepto.replace(/\[REF:\s*[^\]]+\]/i, '').trim();
          } else {
            refStr = 'N/A';
          }
        } else {
          refStr = cleanReference(refStr);
        }

        list.push({
          id: r.id,
          tabla: r._table,
          categoria: 'Gastos',
          fecha: String(r.fecha || r.created_at || ''),
          agencia: agStr,
          cajero_id: cid || 'CMS',
          cajero_nombre: cNom,
          metodo: 'GASTO',
          monto: parseFloat(r.monto) || 0,
          moneda: normalizarMoneda(r.moneda),
          referencia: refStr,
          concepto: rawConcepto,
          pagador: 'N/A',
          confirmado: isConf,
          confirmado_por: r.confirmado_por || null,
          rechazado: isRech,
          rechazado_por: r.rechazado_por || null,
          motivo_rechazo: r.motivo_rechazo || null,
          fecha_rechazo: r.fecha_rechazo || null,
          created_at: String(r.created_at || ''),
        });
      });

      // Process Pagos de Taquilla
      (pdRes.data || []).forEach((r: any) => {
        const tipo = String(r.tipo_pago || r.metodo || 'EFECTIVO').trim().toUpperCase();
        const concRaw = String(r.concepto || '').toUpperCase();
        const isSupervisor = tipo.includes('SUPERVISOR') || concRaw.includes('SUPERVISOR');
        const isRech = !!r.rechazado || String(r.estado || '').toUpperCase() === 'RECHAZADO';
        const isConf = (!!r.confirmado || !!r.confirmado_supervisor) && !isRech;
        // Si es entrega a supervisor pero no está confirmada por el supervisor, se omite
        if (isSupervisor && !isConf) return;

        const cid = String(r.cajero_id || r.user_id || '');
        const agStr = String(r.agencia || r.nombre_agency || '').trim().toUpperCase();
        const isBanco = ['PUNTO', 'POS', 'TRANSFERENCIA', 'ZELLE', 'PAGO MOVIL', 'PAGO MÓVIL'].some((k) =>
          tipo.includes(k)
        );
        const isCobrador = tipo.includes('COBRADOR') || String(r.concepto || '').toUpperCase().includes('COBRADOR') || !!r.cobrador_id || !!r.cobrado_por || !!r.cobrador_nombre;

        let metodoFinal = tipo || 'EFECTIVO';
        let conceptoFinal = String(r.concepto || tipo || 'Pago Taquilla');
        let pagadorFinal = String(r.pagador || 'N/A');

        if (isCobrador) {
          const cobNombre = resolveCobrador(r);
          metodoFinal = cobNombre ? `COBRADOR (${cobNombre})` : 'COBRADOR';
          conceptoFinal = cobNombre ? `Cobrador: ${cobNombre}` : 'Entrega a Cobrador';
          pagadorFinal = cobNombre ? `Cobrador: ${cobNombre}` : 'Cobrador';
        } else if (isSupervisor) {
          const supNombre = r.supervisor_nombre ? String(r.supervisor_nombre) : 'Supervisor';
          metodoFinal = `SUPERVISOR (${supNombre})`;
          conceptoFinal = `Entregado a Supervisor: ${supNombre}`;
          pagadorFinal = supNombre;
        }

        list.push({
          id: r.id,
          tabla: 'cda_pagos_diarios',
          categoria: isCobrador ? 'Efectivo' : isBanco ? 'Bancos' : 'Efectivo',
          fecha: String(r.fecha || r.created_at || ''),
          agencia: agStr,
          cajero_id: cid,
          cajero_nombre: resolveCashierName(cid, agStr),
          banco: isBanco ? resolveBanco(r, agStr) : undefined,
          pos_o_cuenta: r.pos_o_cuenta,
          metodo: metodoFinal,
          monto: parseFloat(r.monto) || 0,
          moneda: normalizarMoneda(r.moneda),
          referencia: cleanReference(r.referencia || 'N/A'),
          concepto: conceptoFinal,
          pagador: pagadorFinal,
          confirmado: isConf,
          confirmado_por: r.confirmado_por || r.cobrado_por || r.supervisor_nombre || null,
          rechazado: isRech,
          rechazado_por: r.rechazado_por || null,
          motivo_rechazo: r.motivo_rechazo || null,
          fecha_rechazo: r.fecha_rechazo || null,
          is_cobrador: isCobrador,
          estado_raw: String(r.estado || '').toLowerCase(),
          liquidado_admin: !!r.liquidado_admin,
          created_at: String(r.created_at || ''),
        });
      });

      // Sort newest first
      list.sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
      setTransactions(list);
    } catch (err: any) {
      console.error('Error loading report confirmations:', err);
      setMessage({ type: 'error', text: 'Error al conectar con la base de datos.' });
    } finally {
      setIsLoading(false);
    }
  }, [effectiveUserId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Filter transactions
  const filteredTransactions = useMemo(() => {
    return transactions.filter((tx) => {
      // Date filter with ISO normalization
      if (fechaDesde || fechaHasta) {
        const txIsoDate = normalizeToISODate(tx.fecha);
        if (fechaDesde && txIsoDate && txIsoDate < fechaDesde) return false;
        if (fechaHasta && txIsoDate && txIsoDate > fechaHasta) return false;
      }

      // Agency filter
      if (selAgencia !== 'Todas' && tx.agencia !== selAgencia) return false;

      // Category filter
      if (selCategoria !== 'Todas') {
        if (selCategoria === 'Bancos y POS' && tx.categoria !== 'Bancos' && tx.categoria !== 'Punto de Venta')
          return false;
        if (selCategoria === 'Gastos' && tx.categoria !== 'Gastos') return false;
        if (selCategoria === 'Efectivo' && tx.categoria !== 'Efectivo') return false;
        if (selCategoria === 'Pago de Premios' && tx.categoria !== 'Pago de Premios') return false;
      }

      // Status filter
      if (selEstado === 'Confirmados') {
        if (!tx.confirmado || tx.is_cobrador) return false;
      }
      if (selEstado === 'En Ruta') {
        const isRuta = tx.is_cobrador && (tx.confirmado || tx.estado_raw === 'cobrado') && !tx.liquidado_admin && tx.estado_raw !== 'liquidado';
        if (!isRuta) return false;
      }
      if (selEstado === 'Rechazados') {
        if (!tx.rechazado) return false;
      }
      if (selEstado === 'Pendientes') {
        const isRuta = tx.is_cobrador && (tx.confirmado || tx.estado_raw === 'cobrado');
        if (tx.confirmado || tx.rechazado || isRuta) return false;
      }

      // Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const refM = tx.referencia.toLowerCase().includes(q);
        const agM = tx.agencia.toLowerCase().includes(q);
        const pagM = tx.pagador.toLowerCase().includes(q);
        const concM = tx.concepto.toLowerCase().includes(q);
        const metM = tx.metodo.toLowerCase().includes(q);
        if (!refM && !agM && !pagM && !concM && !metM) return false;
      }

      return true;
    });
  }, [transactions, fechaDesde, fechaHasta, selAgencia, selCategoria, selEstado, searchQuery]);

  // Rejected list
  const rejectedTransactions = useMemo(() => {
    return transactions.filter((tx) => tx.rechazado);
  }, [transactions]);

  // Metrics
  const metrics = useMemo(() => {
    const byCurr: Record<string, { conf: number; ruta: number; pend: number; rech: number }> = {};
    activeCurrencies.forEach((c) => {
      byCurr[c.codigo] = { conf: 0, ruta: 0, pend: 0, rech: 0 };
    });
    let totalConf = 0, totalRuta = 0, totalPend = 0, totalRech = 0;

    filteredTransactions.forEach((tx) => {
      const isRuta = tx.is_cobrador && (tx.confirmado || tx.estado_raw === 'cobrado') && !tx.liquidado_admin && tx.estado_raw !== 'liquidado';

      if (!byCurr[tx.moneda]) {
        byCurr[tx.moneda] = { conf: 0, ruta: 0, pend: 0, rech: 0 };
      }

      if (tx.rechazado) {
        totalRech++;
        byCurr[tx.moneda].rech += tx.monto;
      } else if (isRuta) {
        totalRuta++;
        byCurr[tx.moneda].ruta += tx.monto;
      } else if (tx.confirmado) {
        totalConf++;
        byCurr[tx.moneda].conf += tx.monto;
      } else {
        totalPend++;
        byCurr[tx.moneda].pend += tx.monto;
      }
    });

    return {
      totalConf, totalRuta, totalPend, totalRech,
      byCurr,
    };
  }, [filteredTransactions, activeCurrencies]);

  // Action: Restore rejected item to pending
  const handleRestoreToPending = async (tx: ConfirmationTransaction) => {
    setIsProcessing(true);
    try {
      const { error: restErr } = await supabase
        .from(tx.tabla)
        .update({
          confirmado: false,
          confirmado_por: null,
          rechazado: false,
          rechazado_por: null,
          motivo_rechazo: null,
          fecha_rechazo: null,
        })
        .eq('id', tx.id);

      if (restErr) throw restErr;

      setMessage({ type: 'success', text: `Transacción de ${tx.agencia} restaurada a estado pendiente.` });
      await loadData();
    } catch (err: any) {
      console.error('Restore error:', err);
      setMessage({ type: 'error', text: `Error al restaurar: ${err.message}` });
    } finally {
      setIsProcessing(false);
    }
  };




  // Action: Submit Cash Entry (Tab 3)
  const handleCreateCashEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    const mto = parseFloat(formMonto);
    if (!formAgencia || isNaN(mto) || mto <= 0) {
      setMessage({ type: 'error', text: 'Por favor seleccione agencia e ingrese un monto válido.' });
      return;
    }

    setIsSubmittingCash(true);
    const currentUser = (user?.email || 'ADMIN').split('@')[0].toUpperCase();

    try {
      const payload = {
        user_id: effectiveUserId,
        agencia: formAgencia,
        moneda: formMoneda,
        monto: mto,
        supervisor_nombre: formSupervisor.trim() || 'Supervisor',
        recibido_por: currentUser,
        tipo_movimiento: 'ENTRADA_ADMIN',
        comentario: formNota.trim() || 'Liquidación de efectivo',
        created_at: new Date().toISOString(),
      };

      const { data: insData, error: insErr } = await supabase
        .from('cda_caja_efectivo_supervisor')
        .insert(payload)
        .select()
        .single();

      if (insErr) throw insErr;

      setMessage({ type: 'success', text: `¡Entrada de ${formatCurrency(mto, formMoneda)} registrada con éxito!` });
      setFormMonto('');
      setFormNota('');
      if (insData) {
        setReceiptModalItem(insData);
      }
      await loadData();
    } catch (err: any) {
      console.error('Cash entry error:', err);
      setMessage({ type: 'error', text: `Error al registrar efectivo: ${err.message}` });
    } finally {
      setIsSubmittingCash(false);
    }
  };

  // CSV Export
  const handleExportCSV = () => {
    if (filteredTransactions.length === 0) return;
    const headers = ['Fecha', 'Agencia', 'Categoría', 'Método', 'Monto', 'Moneda', 'Referencia', 'Pagador', 'Concepto', 'Estado', 'Confirmado Por', 'Motivo Rechazo'];
    const rows = filteredTransactions.map((tx) => [
      `"${tx.fecha}"`,
      `"${tx.agencia}"`,
      `"${tx.categoria}"`,
      `"${tx.metodo}"`,
      tx.monto,
      `"${tx.moneda}"`,
      `"${tx.referencia}"`,
      `"${tx.pagador}"`,
      `"${tx.concepto}"`,
      `"${tx.confirmado ? 'CONFIRMADO' : tx.rechazado ? 'RECHAZADO' : 'PENDIENTE'}"`,
      `"${tx.confirmado_por || ''}"`,
      `"${tx.motivo_rechazo || ''}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `reporte_confirmaciones_${fechaDesde}_${fechaHasta}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className={UI_LOCK.pageContainer}>
      {/* Header & Sub-Tabs */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-[#0D1B22] p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-sm transition-colors">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">Confirmados</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Reportes históricos, auditoría de transacciones confirmadas, rechazadas y custodia de efectivo.
              </p>
            </div>
          </div>
        </div>

        {/* Sub Tabs & Manual Refresh */}
        <div className="flex items-center gap-2 flex-wrap">
          <div id="tour-confirmados-tabs" className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded-xl">
            <button
              onClick={() => setActiveTab('reporte')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'reporte' ? 'bg-emerald-600 text-white shadow-xs font-extrabold' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              📋 Reporte General ({filteredTransactions.length})
            </button>
            <button
              onClick={() => setActiveTab('rechazados')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'rechazados' ? 'bg-rose-600 text-white shadow-xs font-extrabold' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              ❌ Auditoría Rechazados ({rejectedTransactions.length})
            </button>
            <button
              onClick={() => setActiveTab('arqueo')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'arqueo' ? 'bg-sky-600 text-white shadow-xs font-extrabold' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              📦 Arqueo y Efectivo
            </button>
          </div>

          <button
            onClick={() => loadData()}
            disabled={isLoading}
            className={UI_LOCK.buttonRefresh}
            title="Actualizar reporte manualmente"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-emerald-500' : ''}`} />
          </button>
        </div>
      </div>

      {/* Messages */}
      {message && (
        <div
          className={`p-4 rounded-xl text-xs font-bold border flex items-center justify-between animate-fade-in ${
            message.type === 'success'
              ? 'bg-emerald-50 text-emerald-900 border-emerald-300 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/30'
              : 'bg-rose-50 text-rose-900 border-rose-300 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/30'
          }`}
        >
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)} className="text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer font-black">
            ✕
          </button>
        </div>
      )}

      {/* Filters Bar (Common for Tab 1 & Tab 2) */}
      {activeTab !== 'arqueo' && (
        <div id="tour-confirmados-filters" className="p-4 rounded-2xl bg-white dark:bg-[#0D1B22] border border-slate-200/80 dark:border-slate-800/80 shadow-sm space-y-3 transition-colors">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Desde</label>
              <input
                type="date"
                value={fechaDesde}
                onChange={(e) => setFechaDesde(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700/80 rounded-xl text-xs font-bold text-slate-900 dark:text-white focus:outline-hidden focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Hasta</label>
              <input
                type="date"
                value={fechaHasta}
                onChange={(e) => setFechaHasta(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700/80 rounded-xl text-xs font-bold text-slate-900 dark:text-white focus:outline-hidden focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Agencia</label>
              <select
                value={selAgencia}
                onChange={(e) => setSelAgencia(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700/80 rounded-xl text-xs font-bold text-slate-900 dark:text-white focus:outline-hidden focus:border-emerald-500 cursor-pointer"
              >
                <option value="Todas">Todas las Agencias</option>
                {agenciesList.map((ag) => (
                  <option key={ag} value={ag}>
                    {ag}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Tipo / Origen</label>
              <select
                value={selCategoria}
                onChange={(e) => setSelCategoria(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700/80 rounded-xl text-xs font-bold text-slate-900 dark:text-white focus:outline-hidden focus:border-emerald-500 cursor-pointer"
              >
                <option value="Todas">Todas las Fuentes</option>
                <option value="Bancos y POS">Bancos y POS</option>
                <option value="Gastos">Gastos</option>
                <option value="Efectivo">Efectivo</option>
                <option value="Pago de Premios">Pago de Premios</option>
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Estado</label>
              <select
                value={selEstado}
                onChange={(e: any) => setSelEstado(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700/80 rounded-xl text-xs font-bold text-slate-900 dark:text-white focus:outline-hidden focus:border-emerald-500 cursor-pointer"
              >
                <option value="Todos">Todos los Estados</option>
                <option value="Confirmados">✅ Solo Confirmados</option>
                <option value="En Ruta">🛵 Solo En Ruta (Cobradores)</option>
                <option value="Rechazados">❌ Solo Rechazados</option>
                <option value="Pendientes">⏳ Solo Pendientes</option>
              </select>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-3 pt-1">
            <div className="relative flex-1 w-full">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Buscar por referencia, pagador, concepto o agencia..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700/80 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-hidden focus:border-emerald-500"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                onClick={() => {
                  setFechaDesde(systemCycle.desde);
                  setFechaHasta(systemCycle.hasta);
                }}
                className={`px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  fechaDesde === systemCycle.desde && fechaHasta === systemCycle.hasta
                    ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30'
                    : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300'
                }`}
                title="Filtrar por ciclo de trabajo activo"
              >
                📅 Ciclo ({systemCycle.desde} ~ {systemCycle.hasta})
              </button>

              <button
                onClick={() => {
                  setFechaDesde(systemCycle.desde);
                  setFechaHasta(todayIso);
                }}
                className={`px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  fechaHasta === todayIso && fechaDesde !== ''
                    ? 'bg-sky-500/20 text-sky-700 dark:text-sky-400 border border-sky-500/30'
                    : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300'
                }`}
                title="Mostrar desde inicio de ciclo hasta el día de hoy"
              >
                ⚡ Hasta Hoy
              </button>

              <button
                onClick={() => {
                  setFechaDesde('');
                  setFechaHasta('');
                }}
                className={`px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  !fechaDesde && !fechaHasta
                    ? 'bg-amber-500/20 text-amber-700 dark:text-amber-400 border border-amber-500/30'
                    : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300'
                }`}
                title="Ver todo el historial completo sin límite de fechas"
              >
                🌐 Ver Todo
              </button>

              <button
                onClick={handleExportCSV}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Exportar CSV</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 1: REPORTE GENERAL */}
      {/* ========================================================= */}
      {activeTab === 'reporte' && (
        <div className="space-y-4">
          {/* Metrics Overview - Dynamic Currencies */}
          <div id="tour-confirmados-metrics" className={UI_LOCK.kpiGrid(activeCurrencies.length + 1)}>
            <div className="p-4 rounded-2xl bg-white dark:bg-[#0D1B22] border border-slate-200/80 dark:border-slate-800/80 shadow-xs transition-colors">
              <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Estado de Registros</div>
              <div className="mt-2 space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">✅ Confirmados:</span>
                  <span className="font-mono font-bold text-slate-900 dark:text-white">{metrics.totalConf}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-sky-600 dark:text-sky-400 font-bold">🛵 En Ruta (Cobradores):</span>
                  <span className="font-mono font-bold text-slate-900 dark:text-white">{metrics.totalRuta}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-rose-600 dark:text-rose-400 font-bold">❌ Rechazados:</span>
                  <span className="font-mono font-bold text-slate-900 dark:text-white">{metrics.totalRech}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-amber-600 dark:text-amber-400 font-bold">⏳ Pendientes:</span>
                  <span className="font-mono font-bold text-slate-900 dark:text-white">{metrics.totalPend}</span>
                </div>
              </div>
            </div>

            {activeCurrencies.map((c) => {
              const curData = metrics.byCurr[c.codigo] || { conf: 0, ruta: 0, pend: 0, rech: 0 };
              return (
                <div key={c.codigo} className="p-4 rounded-2xl bg-white dark:bg-[#0D1B22] border border-slate-200/80 dark:border-slate-800/80 shadow-xs transition-colors">
                  <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                    <span>{c.icono || '🪙'}</span>
                    <span>{c.nombre} ({c.codigo})</span>
                  </div>
                  <div className="mt-2 space-y-1">
                    <div className="text-xs text-emerald-600 dark:text-emerald-400 font-bold">
                      Conf: <span className="font-mono font-black">{formatCurrency(curData.conf, c.codigo)}</span>
                    </div>
                    {curData.ruta > 0 && (
                      <div className="text-[11px] text-sky-600 dark:text-sky-400 font-semibold">
                        En Ruta: <span className="font-mono font-bold">{formatCurrency(curData.ruta, c.codigo)}</span>
                      </div>
                    )}
                    <div className="text-[11px] text-amber-600 dark:text-amber-400 font-semibold">
                      Pend: <span className="font-mono">{formatCurrency(curData.pend, c.codigo)}</span>
                    </div>
                    <div className="text-[11px] text-rose-600 dark:text-rose-400 font-semibold">
                      Rech: <span className="font-mono">{formatCurrency(curData.rech, c.codigo)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Table View */}
          {isLoading ? (
            <div className="p-12 text-center bg-white dark:bg-[#0D1B22] rounded-2xl border border-slate-200/80 dark:border-slate-800/80">
              <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-xs text-slate-500 dark:text-slate-400">Cargando reporte de confirmaciones...</p>
            </div>
          ) : filteredTransactions.length === 0 ? (
            <div className="p-12 text-center bg-white dark:bg-[#0D1B22] rounded-2xl border border-slate-200/80 dark:border-slate-800/80">
              <FileText className="w-8 h-8 text-slate-400 dark:text-slate-500 mx-auto mb-2" />
              <h4 className="text-sm font-bold text-slate-800 dark:text-slate-300">No hay transacciones registradas</h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Intente ajustar los filtros de fecha o estado.</p>
            </div>
          ) : (
            <div id="tour-confirmados-table" className="overflow-x-auto bg-white dark:bg-[#0D1B22] rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-sm">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-900/90 text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="p-3.5">Fecha / Hora</th>
                    <th className="p-3.5">Agencia / Origen</th>
                    <th className="p-3.5">Banco Destino</th>
                    <th className="p-3.5">Categoría / Método</th>
                    <th className="p-3.5">Referencia</th>
                    <th className="p-3.5">Pagador / Concepto</th>
                    <th className="p-3.5 text-right">Monto</th>
                    <th className="p-3.5 text-center">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/80 dark:divide-slate-800/60">
                  {filteredTransactions.map((tx) => {
                    const isBanco = tx.categoria === 'Bancos' || tx.categoria === 'Punto de Venta';
                    const isGasto = tx.categoria === 'Gastos';
                    const timeStr = getTimeString(tx.created_at || tx.fecha);

                    return (
                      <tr key={`${tx.tabla}_${tx.id}`} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/30 transition-colors">
                        <td className="p-3.5 whitespace-nowrap">
                          <div className="font-mono font-bold text-slate-800 dark:text-slate-300">{formatDate(tx.fecha)}</div>
                          {timeStr && (
                            <div className="text-[10px] text-slate-500 font-mono flex items-center gap-1 mt-0.5">
                              <Clock className="w-2.5 h-2.5 text-slate-400" />
                              <span>{timeStr}</span>
                            </div>
                          )}
                        </td>
                        <td className="p-3.5 whitespace-nowrap">
                          <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                            <Building2 className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400 shrink-0" />
                            <span>{tx.agencia}</span>
                          </div>
                          <div className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-0.5">
                            <User className="w-2.5 h-2.5 text-slate-400 dark:text-slate-500 shrink-0" />
                            <span className="truncate max-w-[140px]">{tx.cajero_nombre || 'Taquilla'}</span>
                          </div>
                        </td>
                        <td className="p-3.5 whitespace-nowrap">
                          {tx.banco ? (
                            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-sky-50 dark:bg-sky-500/10 border border-sky-200 dark:border-sky-500/25 text-sky-700 dark:text-sky-300 font-bold text-[11px]">
                              <Landmark className="w-3 h-3 text-sky-500 dark:text-sky-400 shrink-0" />
                              <span>{tx.banco}</span>
                            </div>
                          ) : isGasto ? (
                            <span className="text-[11px] text-slate-400 dark:text-slate-500 italic">Caja / Gasto</span>
                          ) : (
                            <span className="text-[11px] text-slate-400 dark:text-slate-500 italic">Efectivo / Caja</span>
                          )}
                        </td>
                        <td className="p-3.5 whitespace-nowrap">
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                              isGasto
                                ? 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300'
                                : isBanco
                                ? 'bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300'
                                : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
                            }`}
                          >
                            {tx.metodo}
                          </span>
                        </td>
                        <td className="p-3.5 font-mono font-bold text-amber-700 dark:text-amber-300 whitespace-nowrap">{tx.referencia}</td>
                        <td className="p-3.5 max-w-xs">
                          <div className="font-semibold text-slate-900 dark:text-slate-200 truncate">
                            {tx.pagador && tx.pagador !== 'N/A' ? tx.pagador : tx.concepto}
                          </div>
                          {tx.pagador && tx.pagador !== 'N/A' && tx.concepto && tx.concepto !== tx.pagador && (
                            <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                              {tx.concepto}
                            </div>
                          )}
                        </td>
                        <td className="p-3.5 font-mono font-black text-right text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                          {formatCurrency(tx.monto, tx.moneda)}
                        </td>
                        <td className="p-3.5 text-center whitespace-nowrap">
                          {tx.rechazado ? (
                            <span className="px-2.5 py-1 rounded-md bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-500/15 dark:text-rose-400 dark:border-rose-500/30 text-[10px] font-bold">
                              ❌ Rechazado
                            </span>
                          ) : tx.is_cobrador ? (
                            tx.liquidado_admin || tx.estado_raw === 'liquidado' ? (
                              <span className="px-2.5 py-1 rounded-md bg-teal-50 text-teal-700 border border-teal-200 dark:bg-teal-500/15 dark:text-teal-300 dark:border-teal-500/30 text-[10px] font-bold">
                                💼 Liquidado en Caja
                              </span>
                            ) : tx.confirmado || tx.estado_raw === 'cobrado' ? (
                              <span className="px-2.5 py-1 rounded-md bg-sky-50 text-sky-700 border border-sky-200 dark:bg-sky-500/15 dark:text-sky-300 dark:border-sky-500/30 text-[10px] font-bold">
                                🛵 Cobrado / En Ruta {tx.confirmado_por ? `(${tx.confirmado_por})` : ''}
                              </span>
                            ) : (
                              <span className="px-2.5 py-1 rounded-md bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-500/15 dark:text-amber-400 dark:border-amber-500/30 text-[10px] font-bold">
                                ⏳ Por Recoger (Taquilla)
                              </span>
                            )
                          ) : tx.confirmado ? (
                            <span className="px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-500/30 text-[10px] font-bold">
                              ✅ Confirmado {tx.confirmado_por ? `(${tx.confirmado_por})` : ''}
                            </span>
                          ) : (
                            <span className="px-2.5 py-1 rounded-md bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-500/15 dark:text-amber-400 dark:border-amber-500/30 text-[10px] font-bold">
                              ⏳ Pendiente
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 2: AUDITORÍA DE RECHAZADOS */}
      {/* ========================================================= */}
      {activeTab === 'rechazados' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500 dark:text-slate-400 px-1">
            <span>Se encontraron {rejectedTransactions.length} registros rechazados en el sistema:</span>
          </div>

          {rejectedTransactions.length === 0 ? (
            <div className="p-16 text-center bg-white dark:bg-[#0D1B22] rounded-2xl border border-slate-200/80 dark:border-slate-800/80 flex flex-col items-center justify-center">
              <div className="w-16 h-16 rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-4">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-black text-slate-900 dark:text-white tracking-tight">¡Sin transacciones rechazadas!</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mt-1">
                Todas las operaciones verificadas fueron aprobadas correctamente.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {rejectedTransactions.map((tx) => (
                <div
                  key={`${tx.tabla}_${tx.id}`}
                  className="p-4 rounded-2xl bg-white dark:bg-[#0D1B22] border border-rose-200 dark:border-rose-500/30 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                >
                  <div className="space-y-2 flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-rose-500 dark:text-rose-400 shrink-0" />
                        <span>{tx.agencia}</span>
                      </span>

                      <span className="px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300 border border-rose-200 dark:border-rose-500/30 text-[10px] font-black uppercase">
                        ❌ Rechazado
                      </span>

                      <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">{formatDate(tx.fecha)}</span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-slate-700 dark:text-slate-300 pt-1">
                      <div>
                        <span className="text-[10px] text-slate-500 uppercase block font-bold">Método</span>
                        <span className="font-semibold text-slate-800 dark:text-slate-200">{tx.metodo}</span>
                      </div>

                      <div>
                        <span className="text-[10px] text-slate-500 uppercase block font-bold">Banco Destino</span>
                        <span className="font-semibold text-sky-700 dark:text-sky-300 flex items-center gap-1">
                          <Landmark className="w-3 h-3 text-sky-500 dark:text-sky-400 shrink-0" />
                          {tx.banco || 'Caja / General'}
                        </span>
                      </div>

                      <div>
                        <span className="text-[10px] text-slate-500 uppercase block font-bold">Referencia</span>
                        <span className="font-mono font-bold text-amber-700 dark:text-amber-300 break-all">{tx.referencia}</span>
                      </div>

                      <div>
                        <span className="text-[10px] text-slate-500 uppercase block font-bold">Rechazado Por</span>
                        <span className="text-rose-700 dark:text-rose-300 font-bold">{tx.rechazado_por || 'ADMIN'}</span>
                      </div>
                    </div>

                    {/* Motivo box */}
                    <div className="p-2.5 bg-rose-50 dark:bg-rose-500/5 border border-rose-200 dark:border-rose-500/20 rounded-xl text-xs text-rose-700 dark:text-rose-300 flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-rose-500 dark:text-rose-400 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold">Motivo del rechazo: </span>
                        <span>{tx.motivo_rechazo || 'Rechazado por Administración'}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between lg:justify-end gap-4 shrink-0 pt-3 lg:pt-0 border-t lg:border-t-0 border-slate-200 dark:border-slate-800">
                    <div className="text-right">
                      <div className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold tracking-wider">Monto</div>
                      <div className="text-xl font-black text-rose-600 dark:text-rose-400 font-mono">
                        {formatCurrency(tx.monto, tx.moneda)}
                      </div>
                    </div>

                    <button
                      onClick={() => handleRestoreToPending(tx)}
                      disabled={isProcessing}
                      className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
                      title="Restaurar transacción a estado pendiente"
                    >
                      <RotateCcw className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" />
                      <span>Restaurar a Pendiente</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 3: ARQUEO Y CONTROL DE EFECTIVO */}
      {/* ========================================================= */}
      {activeTab === 'arqueo' && (
        <div className="space-y-6">
          {/* Form to enter cash into central admin */}
          <div className="p-5 rounded-2xl bg-white dark:bg-[#0D1B22] border border-slate-200/80 dark:border-slate-800/80 shadow-sm">
            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-200 dark:border-slate-800">
              <Banknote className="w-5 h-5 text-emerald-500 dark:text-emerald-400" />
              <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">
                Registrar Entrega de Efectivo a Caja Central
              </h3>
            </div>

            <form onSubmit={handleCreateCashEntry} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Agencia</label>
                <select
                  value={formAgencia}
                  onChange={(e) => setFormAgencia(e.target.value)}
                  required
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-white focus:outline-hidden focus:border-emerald-500 cursor-pointer"
                >
                  <option value="">Seleccione Agencia</option>
                  {agenciesList.map((ag) => (
                    <option key={ag} value={ag}>
                      {ag}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Moneda</label>
                <select
                  value={formMoneda}
                  onChange={(e: any) => setFormMoneda(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-white focus:outline-hidden focus:border-emerald-500 cursor-pointer"
                >
                  {activeCurrencies.map((c) => (
                    <option key={c.codigo} value={c.codigo}>
                      {c.nombre} ({c.codigo})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Monto Entregado</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  placeholder="0.00"
                  value={formMonto}
                  onChange={(e) => setFormMonto(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400 focus:outline-hidden focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Entregado Por</label>
                <input
                  type="text"
                  placeholder="Nombre de supervisor o cajero"
                  value={formSupervisor}
                  onChange={(e) => setFormSupervisor(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-hidden focus:border-emerald-500"
                />
              </div>

              <div className="flex items-end">
                <button
                  type="submit"
                  disabled={isSubmittingCash}
                  className={UI_LOCK.buttonPrimary + ' w-full text-xs justify-center'}
                >
                  {isSubmittingCash ? 'Registrando...' : '💾 Registrar y Generar Recibo'}
                </button>
              </div>
            </form>
          </div>

          {/* Historical Cash Handover Entries */}
          <div className="space-y-3">
            <h4 className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Historial de Entregas a Caja Central ({cajaSupervisorRows.length})
            </h4>

            {cajaSupervisorRows.length === 0 ? (
              <div className="p-8 text-center bg-white dark:bg-[#0D1B22] rounded-2xl border border-slate-200/80 dark:border-slate-800/80">
                <p className="text-xs text-slate-500">No hay entregas de efectivo registradas aún.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {cajaSupervisorRows.map((row: any) => (
                  <div
                    key={row.id}
                    className="p-4 rounded-2xl bg-white dark:bg-[#0D1B22] border border-slate-200/80 dark:border-slate-800/90 hover:border-emerald-500/40 transition-all shadow-sm space-y-2.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black text-slate-900 dark:text-white">{row.agencia || 'AGENCIA GENERAL'}</span>
                      <span className="text-[10px] font-mono text-slate-500">{formatDate(row.created_at)}</span>
                    </div>

                    <div className="text-lg font-black text-emerald-600 dark:text-emerald-400 font-mono">
                      {formatCurrency(row.monto, row.moneda)}
                    </div>

                    <div className="text-xs text-slate-500 dark:text-slate-400 space-y-0.5 border-t border-slate-100 dark:border-slate-800/80 pt-2">
                      <div>Entregó: <span className="text-slate-800 dark:text-slate-200 font-semibold">{row.supervisor_nombre || 'N/A'}</span></div>
                      <div>Recibió: <span className="text-slate-800 dark:text-slate-200 font-semibold">{row.recibido_por || 'ADMIN'}</span></div>
                    </div>

                    <div className="pt-2 flex items-center justify-end">
                      <button
                        onClick={() => setReceiptModalItem(row)}
                        className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
                      >
                        <Printer className="w-3.5 h-3.5 text-sky-500 dark:text-sky-400" />
                        <span>Ver Recibo</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Receipt Modal */}
      {receiptModalItem && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-[#0D1B22] border border-slate-200 dark:border-emerald-500/30 rounded-2xl max-w-sm w-full p-6 space-y-4 shadow-2xl animate-scale-up">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <span className="text-xs font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Recibo Oficial de Entrada</span>
              <button
                onClick={() => setReceiptModalItem(null)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer font-bold"
              >
                ✕
              </button>
            </div>

            {/* Ticket Format (80mm aesthetic) */}
            <div className="p-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-3 font-mono text-xs">
              <div className="text-center border-b border-dashed border-slate-300 dark:border-slate-700 pb-2">
                <div className="font-bold text-slate-900 dark:text-white text-sm">MULTIBANCA EXPRESS</div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400">CAJA CENTRAL - LIQUIDACIÓN</div>
                <div className="text-[10px] text-slate-400 dark:text-slate-500">Folio: #{receiptModalItem.id}</div>
              </div>

              <div className="space-y-1 text-slate-700 dark:text-slate-300">
                <div className="flex justify-between">
                  <span className="text-slate-500">Agencia:</span>
                  <span className="font-bold text-slate-900 dark:text-white">{receiptModalItem.agencia}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Fecha:</span>
                  <span>{formatDate(receiptModalItem.created_at)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Entregó:</span>
                  <span>{receiptModalItem.supervisor_nombre || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Recibió:</span>
                  <span>{receiptModalItem.recibido_por || 'ADMIN'}</span>
                </div>
              </div>

              <div className="text-center border-t border-b border-dashed border-slate-300 dark:border-slate-700 py-2">
                <div className="text-[10px] text-slate-500 dark:text-slate-400 uppercase">Monto Recibido</div>
                <div className="text-xl font-black text-emerald-600 dark:text-emerald-400">
                  {formatCurrency(receiptModalItem.monto, receiptModalItem.moneda)}
                </div>
              </div>

              <div className="text-center text-[10px] text-slate-400 dark:text-slate-500 italic pt-1">
                Comprobante oficial verificado en Sistema CMS
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Imprimir</span>
              </button>
              <button
                type="button"
                onClick={() => setReceiptModalItem(null)}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
