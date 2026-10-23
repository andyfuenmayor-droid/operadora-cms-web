import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { formatCurrency, formatDate, normalizarMoneda, cleanAgencyName } from '../../utils/formatters';
import {
  getConsolidatedPayments,
  getConsolidatedExpenses,
  type ConsolidatedPaymentItem,
  type ConsolidatedExpenseItem,
} from '../../utils/consolidations';
import type { Agency } from '../../types';
import { AgencyCycleHistoryTab } from './AgencyCycleHistoryTab';
import {
  FileText,
  RefreshCw,
  Share2,
  Building2,
  DollarSign,
  TrendingUp,
  CreditCard,
  Banknote,
  Search,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  LayoutGrid,
  List,
  ChevronRight,
  Layers,
  History,
  ShieldCheck,
  Printer,
  Sparkles,
  Store,
} from 'lucide-react';
import {
  checkIsBalancesCorrupted,
  executeRestoreAuditedBalances,
} from '../../utils/auditedBalancesS40';
import {
  getAgencyCommissionAndParticipation,
  parseAgencyCondiciones,
  recalculateAllCycleSales,
} from '../../utils/salesRecalculation';
import {
  IndividualAgencyActaModal,
  type IndividualAgencyActaData,
} from './IndividualAgencyActaModal';
import {
  DeliveryReportModal,
  type PreClosureAgencyRow,
} from './DeliveryReportModal';
import { AuditLogTab } from '../Audit/AuditLogTab';
import { logAuditEvent } from '../../utils/auditLogger';
import { UI_LOCK } from '../../styles/uiDesignLock';
import {
  loadCurrencies,
  DEFAULT_CURRENCIES,
  getCurrencyFlag,
  type CurrencyConfig,
} from '../../utils/currencies';

const WhatsAppIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z" />
  </svg>
);

interface BalanceRow {
  id: number;
  agencia: string;
  saldo_arrastre: number;
  utilidad_semana: number;
  gastos: number;
  pagos: number;
  reposicion_premios: number;
  pagos_netos?: number;
  balance_final: number;
  status: 'pagado' | 'pendiente' | 'favor';
}

export const AccountBalancesTab: React.FC = () => {
  const { user, profile, effectiveUserId, systemCycle, refreshSystemCycle } = useAuth();
  const { isLight } = useTheme();

  const [activeMainSubTab, setActiveMainSubTab] = useState<'activo' | 'historico' | 'actas' | 'auditoria'>('activo');
  const [isLoading, setIsLoading] = useState(true);
  const [currenciesList, setCurrenciesList] = useState<CurrencyConfig[]>(DEFAULT_CURRENCIES);
  const [activeCurrency, setActiveCurrency] = useState<string>('BS');
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [sales, setSales] = useState<any[]>([]);
  const [payments, setPayments] = useState<ConsolidatedPaymentItem[]>([]);
  const [expenses, setExpenses] = useState<ConsolidatedExpenseItem[]>([]);

  const [searchQuery, setSearchQuery] = useState('');
  const [detailModalAgency, setDetailModalAgency] = useState<string | null>(null);
  const [selectedIndividualActa, setSelectedIndividualActa] = useState<IndividualAgencyActaData | null>(null);
  const [isGeneralActaOpen, setIsGeneralActaOpen] = useState(false);

  // Mobile / Desktop View Mode (cards or table)
  const [viewMode, setViewMode] = useState<'cards' | 'table'>(() =>
    typeof window !== 'undefined' && window.innerWidth >= 768 ? 'table' : 'cards'
  );
  const [statusFilter, setStatusFilter] = useState<'all' | 'pendiente' | 'favor' | 'pagado'>('all');

  const loadData = async () => {
    if (!effectiveUserId) return;
    setIsLoading(true);

    try {
      const [agRes, sRes, pConsolidated, gConsolidated, userCurrencies] = await Promise.all([
        supabase.from('agencias').select('*').eq('user_id', effectiveUserId).order('id', { ascending: true }),
        supabase.from('carga_actual').select('*').eq('user_id', effectiveUserId),
        getConsolidatedPayments(effectiveUserId, { fechaDesde: systemCycle.desde, fechaHasta: systemCycle.hasta }),
        getConsolidatedExpenses(effectiveUserId, { fechaDesde: systemCycle.desde, fechaHasta: systemCycle.hasta }),
        loadCurrencies(effectiveUserId),
      ]);

      if (userCurrencies && userCurrencies.length > 0) {
        setCurrenciesList(userCurrencies);
        if (!userCurrencies.some((c) => c.codigo === activeCurrency)) {
          setActiveCurrency(userCurrencies[0].codigo);
        }
      }

      const agList = agRes.data || [];
      const salesList = sRes.data || [];

      // Check if any active sale with participation has not been recalculated in DB
      let needsRecalc = false;
      for (const ag of agList) {
        for (const s of salesList) {
          const sAgUpper = String(s.agencia || '').trim().toUpperCase();
          const cleanAg = cleanAgencyName(s.agencia);
          if (
            sAgUpper === String(ag.nombre_agencia || '').trim().toUpperCase() ||
            cleanAg === cleanAgencyName(ag.nombre_agencia)
          ) {
            const { partPct } = getAgencyCommissionAndParticipation(ag, s.sistema, s.moneda);
            if (partPct > 0 && Number(s.util_ag || 0) === 0 && Number(s.neto || 0) > 0) {
              needsRecalc = true;
              break;
            }
          }
        }
        if (needsRecalc) break;
      }

      if (needsRecalc && effectiveUserId) {
        console.log('Detectadas ventas con participación desactualizadas. Auto-recalculando con agencias...');
        await recalculateAllCycleSales(effectiveUserId);
        const { data: updatedSales } = await supabase
          .from('carga_actual')
          .select('*')
          .eq('user_id', effectiveUserId);
        setSales(updatedSales || salesList);
      } else {
        setSales(salesList);
      }

      setAgencies(agList);
      setPayments(pConsolidated);
      setExpenses(gConsolidated);
    } catch (err: any) {
      console.error('Error loading account balances data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSyncOfficialS40 = async () => {
    if (!effectiveUserId) return;
    setIsLoading(true);
    try {
      await executeRestoreAuditedBalances(effectiveUserId, agencies, refreshSystemCycle);
      await loadData();
    } catch (err) {
      console.error('Error syncing official balances S40:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    if (!effectiveUserId) return;

    const channel = supabase
      .channel('realtime_account_balances')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'gastos' }, () => loadData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cda_gastos_diarios' }, () => loadData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pagos_semana' }, () => loadData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cda_pagos_bancarios' }, () => loadData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cda_pagos_diarios' }, () => loadData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'carga_actual' }, () => loadData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agencias' }, () => loadData())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [effectiveUserId]);

  // Compute balance rows for given currency
  const computeBalances = (mon: string): { rows: BalanceRow[]; totalDebt: number } => {
    let totalDebt = 0;
    const normMon = normalizarMoneda(mon);
    const colInicial = normMon === 'BS' ? 'saldo_inicial_bs' : normMon === 'USD' ? 'saldo_inicial_usd' : normMon === 'COP' ? 'saldo_inicial_cop' : (`saldo_inicial_${normMon.toLowerCase()}` as keyof Agency);

    const rows: BalanceRow[] = [];

    agencies.forEach((ag) => {
      const nom = String(ag.nombre_agencia || '').trim().toUpperCase();
      const cleanNom = cleanAgencyName(ag.nombre_agencia);
      const cond = parseAgencyCondiciones(ag);
      const agencyCodigos = Object.values(cond)
        .map((c: any) => (c?.codigo ? String(c.codigo).trim().toUpperCase() : null))
        .filter(Boolean) as string[];
      const sAnt = Number(ag[colInicial] || (cond as any)?.[normMon]?.saldo_inicial || (ag as any)?.condiciones?.[normMon]?.saldo_inicial || 0);

      // Ventas pertenecientes a la agencia en esta moneda
      const agSales = sales.filter((s) => {
        if (normalizarMoneda(s.moneda) !== normMon) return false;
        const sNom = String(s.agencia || '').trim().toUpperCase();
        if (sNom === nom) return true;
        if (agencyCodigos.includes(sNom)) return true;
        if (cleanAgencyName(s.agencia) === cleanNom) return true;
        return false;
      });

      // Utilidad operativa de la semana (descontando participación de agencia si aplica)
      const uOp = agSales.reduce((sum, s) => {
        const { partPct } = getAgencyCommissionAndParticipation(ag, s.sistema, normMon);
        const v = Number(s.venta ?? s.monto_venta ?? 0);
        const c = Number(s.comision ?? 0);
        const p = Number(s.premios ?? s.monto_premios ?? 0);
        const neto = s.neto !== undefined && s.neto !== null ? Number(s.neto) : Math.round((v - c - p) * 100) / 100;

        let utilAg = 0;
        if (partPct > 0) {
          utilAg = Math.round((neto * (partPct / 100)) * 100) / 100;
        } else if (Number(s.util_ag || 0) > 0) {
          utilAg = Number(s.util_ag);
        }

        const utilOp = Math.round((neto - utilAg) * 100) / 100;
        return sum + utilOp;
      }, 0);

      // Gastos (solo confirmados en Pizarra de Confirmaciones)
      const gTot = expenses
        .filter((g) => {
          if (normalizarMoneda(g.moneda) !== normMon || !Boolean(g.confirmado)) return false;
          const gNom = String(g.agencia || '').trim().toUpperCase();
          return gNom === nom || cleanAgencyName(g.agencia) === cleanNom;
        })
        .reduce((sum, curr) => sum + Number(curr.monto || 0), 0);

      // Pagos ordinarios recibidos de la agencia (solo confirmados, reducen la deuda)
      const pCobros = payments
        .filter((p) => {
          if (normalizarMoneda(p.moneda) !== normMon || !Boolean(p.confirmado)) return false;
          if (String(p.tipo_pago || '').toUpperCase().includes('PREMIO')) return false;
          const pNom = String(p.agencia || '').trim().toUpperCase();
          return pNom === nom || cleanAgencyName(p.agencia) === cleanNom;
        })
        .reduce((sum, curr) => sum + Number(curr.monto || 0), 0);

      // Reposición de premios pagados por la operadora a la agencia (solo confirmados)
      const pPremios = payments
        .filter((p) => {
          if (normalizarMoneda(p.moneda) !== normMon || !Boolean(p.confirmado)) return false;
          if (!String(p.tipo_pago || '').toUpperCase().includes('PREMIO')) return false;
          const pNom = String(p.agencia || '').trim().toUpperCase();
          return pNom === nom || cleanAgencyName(p.agencia) === cleanNom;
        })
        .reduce((sum, curr) => sum + Number(curr.monto || 0), 0);

      // Pagos netos (PAGOS - PREMIOS)
      const pTot = pCobros - pPremios;

      // Formula: (sAnt + uOp) - gTot - pTot
      const balanceFinal = Math.round(((sAnt + uOp) - gTot - pTot) * 100) / 100;
      totalDebt += balanceFinal;

      let status: 'pagado' | 'pendiente' | 'favor' = 'pagado';
      if (Math.abs(balanceFinal) < 0.1) status = 'pagado';
      else if (balanceFinal > 0) status = 'pendiente';
      else status = 'favor';

      rows.push({
        id: ag.id,
        agencia: nom,
        saldo_arrastre: Math.round(sAnt * 100) / 100,
        utilidad_semana: Math.round(uOp * 100) / 100,
        gastos: Math.round(gTot * 100) / 100,
        pagos: Math.round(pCobros * 100) / 100,
        reposicion_premios: Math.round(pPremios * 100) / 100,
        pagos_netos: Math.round(pTot * 100) / 100,
        balance_final: balanceFinal,
        status,
      });
    });

    return { rows, totalDebt: Math.round(totalDebt * 100) / 100 };
  };

  const activeBalances = useMemo(() => {
    return computeBalances(activeCurrency);
  }, [agencies, sales, payments, expenses, activeCurrency]);

  // Status metrics counts
  const statusCounts = useMemo(() => {
    let pendientes = 0;
    let pagados = 0;
    let favor = 0;
    activeBalances.rows.forEach((r) => {
      if (r.status === 'pendiente') pendientes++;
      else if (r.status === 'pagado') pagados++;
      else if (r.status === 'favor') favor++;
    });
    return { all: activeBalances.rows.length, pendiente: pendientes, pagado: pagados, favor };
  }, [activeBalances.rows]);

  // Filtered rows for active currency
  const filteredRows = useMemo(() => {
    let list = activeBalances.rows;
    if (statusFilter !== 'all') {
      list = list.filter((r) => r.status === statusFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((r) => r.agencia.toLowerCase().includes(q));
    }
    return list;
  }, [activeBalances.rows, statusFilter, searchQuery]);

  // Generate Master WhatsApp Report URL
  const generateWhatsAppUrl = () => {
    const ahora = new Date().toLocaleString('es-VE');
    let reportTxt = `📑 *REPORTE DE AGENCIAS CONSOLIDADO*\n📅 ${ahora}\n\n`;

    currenciesList.forEach((c) => {
      const mon = c.codigo;
      const { rows } = computeBalances(mon);
      const withBalance = rows.filter((r) => Math.abs(r.balance_final) > 0.1);

      if (withBalance.length > 0) {
        reportTxt += `💰 *SALDOS EN ${mon}:*\n`;
        withBalance.forEach((r) => {
          const icon = r.balance_final > 0 ? '🚩' : '✅';
          reportTxt += `${icon} *${r.agencia}*: ${formatCurrency(r.balance_final, mon as any)}\n`;
        });
        reportTxt += `━━━━━━━━━━━━━━━━━━\n`;
      }
    });

    return `https://wa.me/?text=${encodeURIComponent(reportTxt)}`;
  };

  // Helper for WhatsApp report numbers (e.g. 46,300.00)
  const fmtNumber = (n: number) => {
    return Number(n || 0).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  // Generate and open Individual Acta voucher in PDF
  const openIndividualActa = (row: BalanceRow) => {
    const ag = agencies.find((a) => a.id === row.id || String(a.nombre_agencia || '').trim().toUpperCase() === row.agencia);
    const cond = parseAgencyCondiciones(ag);
    const agencyCodigos = Object.values(cond)
      .map((c: any) => (c?.codigo ? String(c.codigo).trim().toUpperCase() : null))
      .filter(Boolean) as string[];

    const agSales = sales.filter((s) => {
      if (normalizarMoneda(s.moneda) !== activeCurrency) return false;
      const sNom = String(s.agencia || '').trim().toUpperCase();
      if (sNom === row.agencia) return true;
      if (agencyCodigos.includes(sNom)) return true;
      if (cleanAgencyName(s.agencia) === cleanAgencyName(row.agencia)) return true;
      return false;
    });

    const ventaBruta = agSales.reduce((acc, s) => acc + Number(s.venta ?? s.monto_ventas ?? 0), 0);
    const comision = agSales.reduce((acc, s) => acc + Number(s.comision ?? 0), 0);
    const premios = agSales.reduce((acc, s) => acc + Number(s.premios ?? s.monto_premios ?? 0), 0);
    const ventaNeta = agSales.reduce((acc, s) => {
      const v = Number(s.venta ?? s.monto_ventas ?? 0);
      const c = Number(s.comision ?? 0);
      const p = Number(s.premios ?? s.monto_premios ?? 0);
      return acc + (s.neto !== undefined && s.neto !== null ? Number(s.neto) : Math.round((v - c - p) * 100) / 100);
    }, 0);

    let participacionMonto = 0;
    let participacionPct = 0;
    agSales.forEach((s) => {
      const { partPct } = getAgencyCommissionAndParticipation(ag, s.sistema, activeCurrency);
      if (partPct > 0) {
        participacionPct = partPct;
        const v = Number(s.venta ?? s.monto_ventas ?? 0);
        const c = Number(s.comision ?? 0);
        const p = Number(s.premios ?? s.monto_premios ?? 0);
        const n = s.neto !== undefined && s.neto !== null ? Number(s.neto) : (v - c - p);
        participacionMonto += Math.round(n * (partPct / 100) * 100) / 100;
      }
    });

    const utilidadOperadora = Math.round((ventaNeta - participacionMonto) * 100) / 100;

    setSelectedIndividualActa({
      agencyName: row.agencia,
      agencyId: row.id,
      periodo: systemCycle.tipo === 'SEMANAL' ? `Semana ${systemCycle.semana} (${systemCycle.desde} al ${systemCycle.hasta})` : `Ciclo Diario (${systemCycle.desde})`,
      moneda: activeCurrency,
      saldoAnterior: row.saldo_arrastre,
      ventaBruta,
      comision,
      premios,
      ventaNeta,
      participacionPct,
      participacionMonto,
      utilidadOperadora,
      cobros: row.pagos,
      gastos: row.gastos,
      saldoFinal: row.balance_final,
      status: row.status === 'pagado' ? 'AL DÍA' : row.status === 'pendiente' ? 'DEUDA PENDIENTE' : 'SALDO A FAVOR',
    });
  };

  // Generate individual agency WhatsApp account balance message with systems breakdown
  const generateAgencyWhatsAppUrl = (r: BalanceRow) => {
    const nom = String(r.agencia || '').trim().toUpperCase();
    const ag = agencies.find((a) => String(a.nombre_agencia || '').trim().toUpperCase() === nom);
    const cond = parseAgencyCondiciones(ag);
    const agencyCodigos = Object.values(cond)
      .map((c: any) => (c?.codigo ? String(c.codigo).trim().toUpperCase() : null))
      .filter(Boolean) as string[];

    // Sales of this agency in activeCurrency
    const agSales = sales.filter((s) => {
      if (normalizarMoneda(s.moneda) !== activeCurrency) return false;
      const sNom = String(s.agencia || '').trim().toUpperCase();
      return sNom === nom || agencyCodigos.includes(sNom) || cleanAgencyName(s.agencia) === cleanAgencyName(nom);
    });

    // Group sales by system
    const sistemasMap: Record<string, { venta: number; comision: number; premios: number; neto: number }> = {};
    let totalNetoSistemas = 0;
    let totalPartAg = 0;
    let maxPartPct = 0;

    agSales.forEach((s) => {
      const sis = (s.sistema || 'GENERAL').trim().toUpperCase();
      if (!sistemasMap[sis]) {
        sistemasMap[sis] = { venta: 0, comision: 0, premios: 0, neto: 0 };
      }
      const v = Number(s.venta || 0);
      const c = Number(s.comision || 0);
      const p = Number(s.premios || 0);
      const n = Number(s.neto !== undefined && s.neto !== null ? s.neto : (v - c - p));
      sistemasMap[sis].venta += v;
      sistemasMap[sis].comision += c;
      sistemasMap[sis].premios += p;
      sistemasMap[sis].neto += n;
      totalNetoSistemas += n;
    });

    let textoSistemas = '';
    const sisKeys = Object.keys(sistemasMap);
    if (sisKeys.length === 0) {
      textoSistemas = '   _Sin movimientos_\n';
    } else {
      sisKeys.forEach((sis) => {
        const item = sistemasMap[sis];
        const { partPct } = getAgencyCommissionAndParticipation(ag, sis, activeCurrency);
        if (partPct > maxPartPct) maxPartPct = partPct;
        const partMonto = partPct > 0 ? Math.round(item.neto * (partPct / 100) * 100) / 100 : 0;
        const utilOpSis = Math.round((item.neto - partMonto) * 100) / 100;
        totalPartAg += partMonto;

        textoSistemas += `🔹 *${sis}*\n`;
        textoSistemas += `   Venta: ${fmtNumber(item.venta)} | Com: -${fmtNumber(Math.abs(item.comision))}\n`;
        textoSistemas += `   Prem: -${fmtNumber(Math.abs(item.premios))} | Neto: ${fmtNumber(item.neto)}\n`;
        if (partPct > 0) {
          textoSistemas += `   Part. Agencia (${partPct}%): -${fmtNumber(partMonto)}\n`;
          textoSistemas += `   *Utilidad Operadora: ${fmtNumber(utilOpSis)}*\n`;
        } else {
          textoSistemas += `   *Utilidad Semanal: ${fmtNumber(item.neto)}*\n`;
        }
        textoSistemas += `   ----------\n`;
      });
    }

    // Gastos
    const totalGastos = expenses
      .filter((g) => {
        if (normalizarMoneda(g.moneda) !== activeCurrency) return false;
        const gNom = String(g.agencia || '').trim().toUpperCase();
        return gNom === nom || cleanAgencyName(g.agencia) === cleanAgencyName(nom);
      })
      .reduce((sum, curr) => sum + Number(curr.monto || 0), 0);

    // Pagos ordinarios recibidos
    const pCobros = payments
      .filter((p) => {
        if (normalizarMoneda(p.moneda) !== activeCurrency) return false;
        if (String(p.tipo_pago || '').toUpperCase().includes('PREMIO')) return false;
        const pNom = String(p.agencia || '').trim().toUpperCase();
        return pNom === nom || cleanAgencyName(p.agencia) === cleanAgencyName(nom);
      })
      .reduce((sum, curr) => sum + Number(curr.monto || 0), 0);

    // Premios pagados (reposición)
    const pPremios = payments
      .filter((p) => {
        if (normalizarMoneda(p.moneda) !== activeCurrency) return false;
        if (!String(p.tipo_pago || '').toUpperCase().includes('PREMIO')) return false;
        const pNom = String(p.agencia || '').trim().toUpperCase();
        return pNom === nom || cleanAgencyName(p.agencia) === cleanAgencyName(nom);
      })
      .reduce((sum, curr) => sum + Number(curr.monto || 0), 0);

    const fDesde = systemCycle?.desde || '';
    const fHasta = systemCycle?.hasta || '';

    let statusMsg = '';
    if (r.status === 'pendiente') {
      statusMsg = `\n------------------------------------------\n🔴 *ESTADO: PENDIENTE POR COBRAR*\nFavor gestionar la cancelación de este saldo a la brevedad.`;
    } else if (r.status === 'favor') {
      statusMsg = `\n------------------------------------------\n🔵 *ESTADO: SALDO A FAVOR DE LA AGENCIA*\nEste monto queda a su favor acumulado para el próximo ciclo.`;
    } else {
      statusMsg = `\n------------------------------------------\n🟢 *ESTADO: SOLVENTE / PAGADO*\n¡Muchas gracias por su puntualidad!`;
    }

    const text =
`🏢 *ESTADO DE CUENTA - ${nom}*
📅 *Periodo:* ${fDesde} al ${fHasta}
💰 *Moneda:* ${activeCurrency}
------------------------------------------
🔹 *Saldo Anterior:* ${fmtNumber(r.saldo_arrastre)}

📦 *DESGLOSE POR SISTEMAS:*
${textoSistemas}
*RESUMEN SEMANA:*
    (+) Neto Sistemas: ${fmtNumber(totalNetoSistemas)}
${totalPartAg > 0 ? `    (-) Part. Agencia (${maxPartPct}%): ${fmtNumber(totalPartAg)}\n` : ''}    (-) Gastos: ${fmtNumber(totalGastos)}
    (+/-) Pagos Recibidos: ${fmtNumber(pCobros)}
    (+/-) Premios Pagados: ${fmtNumber(pPremios)}
------------------------------------------
💵 *SALDO ACTUAL: ${activeCurrency} ${fmtNumber(r.balance_final)}*${statusMsg}`;

    return `https://wa.me/?text=${encodeURIComponent(text)}`;
  };

  // Selected agency row for detail modal
  const selectedAgencyRow = useMemo(() => {
    if (!detailModalAgency) return null;
    return activeBalances.rows.find((r) => r.agencia === detailModalAgency) || null;
  }, [detailModalAgency, activeBalances.rows]);

  // Detailed movements for an individual agency (Modal)
  const detailMovements = useMemo(() => {
    if (!detailModalAgency) return null;
    const agName = detailModalAgency;

    const agSales = sales.filter((s) => s.agencia === agName && normalizarMoneda(s.moneda) === activeCurrency);
    const agPayments = payments.filter((p) => p.agencia === agName && normalizarMoneda(p.moneda) === activeCurrency && Boolean(p.confirmado));
    const agExpenses = expenses.filter((e) => e.agencia === agName && normalizarMoneda(e.moneda) === activeCurrency && Boolean(e.confirmado));

    // Group sales by system
    const sistemasMap: Record<string, { venta: number; comision: number; premios: number; neto: number }> = {};
    agSales.forEach((s) => {
      const sis = (s.sistema || 'GENERAL').trim().toUpperCase();
      if (!sistemasMap[sis]) {
        sistemasMap[sis] = { venta: 0, comision: 0, premios: 0, neto: 0 };
      }
      const v = Number(s.venta || 0);
      const c = Number(s.comision || 0);
      const p = Number(s.premios || 0);
      const n = Number(s.neto !== undefined && s.neto !== null ? s.neto : s.util_op !== undefined ? s.util_op : (v - c - p));
      sistemasMap[sis].venta += v;
      sistemasMap[sis].comision += c;
      sistemasMap[sis].premios += p;
      sistemasMap[sis].neto += n;
    });

    return {
      agencia: agName,
      sales: agSales,
      payments: agPayments,
      expenses: agExpenses,
      sistemas: Object.entries(sistemasMap).map(([sistema, vals]) => ({ sistema, ...vals })),
    };
  }, [detailModalAgency, sales, payments, expenses, activeCurrency]);

  return (
    <div className={UI_LOCK.pageContainer}>
      {/* Header */}
      <div className={UI_LOCK.headerCard}>
        <div className="flex items-center gap-3">
          <div className={UI_LOCK.headerIconWrap}>
            <FileText className="w-6 h-6" />
          </div>
          <div>
            <h2 className={UI_LOCK.headerTitle}>
              Estado de Cuenta por Agencia
            </h2>
            <p className={UI_LOCK.headerSubtitle}>
              Fórmula: (Saldo Arrastre + Utilidad Semanal) - Gastos - Pagos + Premios = Balance Final.
            </p>
          </div>
        </div>

        <div className={UI_LOCK.headerActions}>
          <button
            onClick={() => loadData()}
            disabled={isLoading}
            className={UI_LOCK.buttonSecondary}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            Actualizar
          </button>

          <button
            onClick={handleSyncOfficialS40}
            disabled={isLoading}
            title="Sincronizar y restaurar saldos de arrastre del acta oficial S40"
            className={UI_LOCK.buttonSecondary}
          >
            <ShieldCheck className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
            Sincronizar Arrastres S40
          </button>

          <button
            onClick={() => setIsGeneralActaOpen(true)}
            className={UI_LOCK.buttonSecondary}
            title="Imprimir Acta General de Entrega y Cierre en PDF"
          >
            <Printer className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
            Acta General (PDF)
          </button>

          <button
            onClick={() => setActiveMainSubTab('auditoria')}
            className={UI_LOCK.buttonSecondary}
            title="Ver Log de Auditoría y Movimientos"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
            Log Auditoría
          </button>

          <a
            href={generateWhatsAppUrl()}
            target="_blank"
            rel="noreferrer"
            className={UI_LOCK.buttonPrimary}
          >
            <Share2 className="w-4 h-4" />
            Reporte WhatsApp
          </a>
        </div>
      </div>

      {/* Sub-tabs Navigation */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3 flex-wrap">
        <button
          onClick={() => setActiveMainSubTab('activo')}
          className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-all cursor-pointer ${
            activeMainSubTab === 'activo'
              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>📊 Saldos del Ciclo Activo</span>
        </button>

        <button
          onClick={() => setActiveMainSubTab('historico')}
          className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-all cursor-pointer ${
            activeMainSubTab === 'historico'
              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60'
          }`}
        >
          <History className="w-4 h-4" />
          <span>📜 Histórico por Taquilla</span>
        </button>

        <button
          onClick={() => setActiveMainSubTab('actas')}
          className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-all cursor-pointer ${
            activeMainSubTab === 'actas'
              ? 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/30 shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60'
          }`}
        >
          <Printer className="w-4 h-4" />
          <span>📜 Actas y Finiquitos (PDF)</span>
        </button>

        <button
          onClick={() => setActiveMainSubTab('auditoria')}
          className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-all cursor-pointer ${
            activeMainSubTab === 'auditoria'
              ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30 shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60'
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          <span>🛡️ Log de Auditoría y Movimientos</span>
        </button>
      </div>

      {activeMainSubTab === 'historico' ? (
        <AgencyCycleHistoryTab initialAgency={searchQuery || undefined} />
      ) : activeMainSubTab === 'auditoria' ? (
        <AuditLogTab />
      ) : activeMainSubTab === 'actas' ? (
        <div className="space-y-6">
          <div className={UI_LOCK.card}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <Printer className="w-5 h-5 text-sky-600 dark:text-sky-400" />
                  <span>Emisión de Actas de Entrega y Finiquitos Individuales</span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Generación e impresión directa en formato PDF oficial para cada agencia o consolidado general del ciclo activo ({systemCycle.desde} al {systemCycle.hasta}).
                </p>
              </div>

              <button
                onClick={() => setIsGeneralActaOpen(true)}
                className={UI_LOCK.buttonPrimary}
              >
                <Printer className="w-4 h-4" />
                <span>Acta General de Entrega ({activeCurrency})</span>
              </button>
            </div>

            {/* List of Agencies with 1-click Acta generation */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-4">
              {activeBalances.rows.map((r) => (
                <div
                  key={r.id}
                  className="bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex items-center justify-between hover:border-slate-300 dark:hover:border-slate-700 transition-all shadow-xs"
                >
                  <div className="min-w-0 pr-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-slate-400 font-mono font-bold">#{r.id}</span>
                      <h4 className="text-xs font-bold text-slate-900 dark:text-white truncate">{r.agencia}</h4>
                    </div>
                    <div className="text-[11px] font-mono mt-0.5">
                      <span className="text-slate-500 dark:text-slate-400">Balance: </span>
                      <span
                        className={`font-black ${
                          r.status === 'pendiente'
                            ? 'text-rose-600 dark:text-rose-400'
                            : r.status === 'favor'
                            ? 'text-cyan-600 dark:text-cyan-400'
                            : 'text-emerald-600 dark:text-emerald-400'
                        }`}
                      >
                        {formatCurrency(r.balance_final, activeCurrency)}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => openIndividualActa(r)}
                    className="px-3 py-2 rounded-xl bg-sky-50 dark:bg-sky-500/15 hover:bg-sky-500 text-sky-700 dark:text-sky-300 hover:text-white border border-sky-200 dark:border-sky-500/30 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shrink-0"
                    title={`Generar e Imprimir Finiquito Individual de ${r.agencia}`}
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Acta PDF</span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Currency Switcher & Total Cartera Metric */}
          <div id="tour-saldos-summary" className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 sm:p-6 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 sm:gap-6">
            {/* Dynamic Currency Tabs */}
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 bg-slate-100 dark:bg-slate-800/80 p-1.5 rounded-2xl border border-slate-200 dark:border-slate-700 w-full sm:w-auto">
              {currenciesList.map((c) => {
                const isAct = activeCurrency === c.codigo;
                return (
                  <button
                    key={c.codigo}
                    onClick={() => setActiveCurrency(c.codigo)}
                    className={`px-3 sm:px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer text-center ${
                      isAct
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {getCurrencyFlag(c.codigo)} {c.codigo}
                  </button>
                );
              })}
            </div>

            {/* Cartera Total Metric */}
            <div
              className={`text-center md:text-right p-3 sm:p-3.5 md:px-5 md:py-2.5 rounded-2xl border transition-all shadow-xs ${
                isLight
                  ? activeBalances.totalDebt > 0
                    ? 'bg-rose-50 border-rose-200'
                    : activeBalances.totalDebt < 0
                    ? 'bg-cyan-50 border-cyan-200'
                    : 'bg-emerald-50 border-emerald-200'
                  : activeBalances.totalDebt > 0
                  ? 'bg-rose-950/20 border-rose-500/30'
                  : activeBalances.totalDebt < 0
                  ? 'bg-cyan-950/20 border-cyan-500/30'
                  : 'bg-emerald-950/20 border-emerald-500/30'
              }`}
            >
              <div className="flex items-center justify-center md:justify-end gap-1.5">
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${
                    activeBalances.totalDebt > 0
                      ? 'bg-rose-500 animate-pulse'
                      : activeBalances.totalDebt < 0
                      ? 'bg-cyan-500 animate-pulse'
                      : 'bg-emerald-500'
                  }`}
                />
                <span
                  className={`text-[10px] sm:text-[11px] font-bold uppercase tracking-wider block ${
                    activeBalances.totalDebt > 0
                      ? 'text-rose-700 dark:text-rose-300'
                      : activeBalances.totalDebt < 0
                      ? 'text-cyan-700 dark:text-cyan-300'
                      : 'text-emerald-700 dark:text-emerald-300'
                  }`}
                >
                  Cartera Total Pendiente ({activeCurrency})
                </span>
              </div>
              <span
                className={`text-2xl sm:text-3xl font-black font-mono mt-1 block tracking-tight ${
                  activeBalances.totalDebt > 0
                    ? 'text-rose-600 dark:text-rose-400'
                    : activeBalances.totalDebt < 0
                    ? 'text-cyan-600 dark:text-cyan-400'
                    : 'text-emerald-600 dark:text-emerald-400'
                }`}
              >
                {formatCurrency(activeBalances.totalDebt, activeCurrency)}
              </span>
            </div>
          </div>

          {/* Controls Bar: Search + Status Chips + View Toggle */}
          <div id="tour-saldos-table" className="space-y-3">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              {/* Search Input */}
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Buscar agencia por nombre..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className={UI_LOCK.input}
                  style={{ paddingLeft: '2.5rem' }}
                />
              </div>

              {/* View Toggle (Cards vs Table) */}
              <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-2xl border border-slate-200 dark:border-slate-700 self-end sm:self-auto shrink-0">
                <button
                  onClick={() => setViewMode('cards')}
                  className={viewMode === 'cards' ? UI_LOCK.filterPillActive : UI_LOCK.filterPillInactive}
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  <span>Tarjetas</span>
                </button>
                <button
                  onClick={() => setViewMode('table')}
                  className={viewMode === 'table' ? UI_LOCK.filterPillActive : UI_LOCK.filterPillInactive}
                >
                  <List className="w-3.5 h-3.5" />
                  <span>Tabla</span>
                </button>
              </div>
            </div>

            {/* Status Filter Chips */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
              <button
                onClick={() => setStatusFilter('all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                  statusFilter === 'all'
                    ? 'bg-slate-800 text-white dark:bg-slate-700 shadow-xs'
                    : 'bg-white dark:bg-slate-850 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 border border-slate-200 dark:border-slate-800'
                }`}
              >
                Todas ({statusCounts.all})
              </button>
              <button
                onClick={() => setStatusFilter('pendiente')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                  statusFilter === 'pendiente'
                    ? 'bg-rose-600 text-white shadow-xs'
                    : 'bg-white dark:bg-slate-850 text-rose-600 dark:text-rose-400 hover:text-rose-700 border border-slate-200 dark:border-slate-800'
                }`}
              >
                🔴 Pendientes ({statusCounts.pendiente})
              </button>
              <button
                onClick={() => setStatusFilter('favor')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                  statusFilter === 'favor'
                    ? 'bg-cyan-600 text-white shadow-xs'
                    : 'bg-white dark:bg-slate-850 text-cyan-600 dark:text-cyan-400 hover:text-cyan-700 border border-slate-200 dark:border-slate-800'
                }`}
              >
                🔵 A Favor ({statusCounts.favor})
              </button>
              <button
                onClick={() => setStatusFilter('pagado')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                  statusFilter === 'pagado'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-white dark:bg-slate-850 text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 border border-slate-200 dark:border-slate-800'
                }`}
              >
                🟢 Pagadas ({statusCounts.pagado})
              </button>
            </div>
          </div>

          {/* =========================================================================
              VIEW MODE 1: MODERN MOBILE / RESPONSIVE CARDS
          ========================================================================= */}
          {viewMode === 'cards' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 px-1">
                <span>Mostrando <strong>{filteredRows.length}</strong> agencias en <strong>{activeCurrency}</strong></span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                {filteredRows.map((r) => (
                  <div
                    key={r.id}
                    onClick={() => setDetailModalAgency(r.agencia)}
                    className="bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-850 border border-slate-200/80 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 rounded-2xl p-4 shadow-sm active:scale-[0.99] transition-all cursor-pointer space-y-3 relative overflow-hidden group"
                  >
                    {/* Agency Name & Status Badge */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-6 h-6 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 font-mono text-[11px] font-bold shrink-0">
                          {r.id}
                        </span>
                        <h3 className="font-bold text-slate-900 dark:text-white text-sm truncate group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                          {r.agencia}
                        </h3>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {r.status === 'pagado' && (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 text-[10px] font-bold border border-emerald-200 dark:border-emerald-500/30 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                            PAGADO
                          </span>
                        )}
                        {r.status === 'pendiente' && (
                          <span className="px-2 py-0.5 rounded-full bg-rose-50 dark:bg-rose-500/15 text-rose-700 dark:text-rose-400 text-[10px] font-bold border border-rose-200 dark:border-rose-500/30 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"></span>
                            PENDIENTE
                          </span>
                        )}
                        {r.status === 'favor' && (
                          <span className="px-2 py-0.5 rounded-full bg-cyan-50 dark:bg-cyan-500/15 text-cyan-700 dark:text-cyan-400 text-[10px] font-bold border border-cyan-200 dark:border-cyan-500/30 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-cyan-500"></span>
                            A FAVOR
                          </span>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openIndividualActa(r);
                          }}
                          className="p-1.5 rounded-lg bg-sky-50 dark:bg-sky-500/20 hover:bg-sky-500 text-sky-600 dark:text-sky-400 hover:text-white border border-sky-200 dark:border-sky-500/30 transition-colors cursor-pointer"
                          title="Generar / Imprimir Acta en PDF"
                        >
                          <Printer className="w-3.5 h-3.5" />
                        </button>
                        <a
                          href={generateAgencyWhatsAppUrl(r)}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-600/20 hover:bg-emerald-600 text-emerald-600 dark:text-emerald-400 hover:text-white border border-emerald-200 dark:border-emerald-500/30 transition-colors cursor-pointer"
                          title="Enviar Estado de Cuenta por WhatsApp"
                        >
                          <WhatsAppIcon className="w-3.5 h-3.5" />
                        </a>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDetailModalAgency(r.agencia);
                          }}
                          className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
                          title="Ver detalle"
                        >
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Hero Balance Box */}
                    <div
                      className={`p-3 rounded-xl border flex items-center justify-between ${
                        r.status === 'pendiente'
                          ? 'bg-rose-50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-800/40 text-rose-700 dark:text-rose-400'
                          : r.status === 'favor'
                          ? 'bg-cyan-50 dark:bg-cyan-950/20 border-cyan-200 dark:border-cyan-800/40 text-cyan-700 dark:text-cyan-400'
                          : 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/40 text-emerald-700 dark:text-emerald-400'
                      }`}
                    >
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Balance Final
                      </div>
                      <div className="text-lg sm:text-xl font-black font-mono tracking-tight">
                        {formatCurrency(r.balance_final, activeCurrency)}
                      </div>
                    </div>

                    {/* 5 Financial Items Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs font-mono">
                      <div className="bg-slate-50 dark:bg-slate-800/50 p-2 rounded-xl border border-slate-200/80 dark:border-slate-700/60">
                        <span className="text-[10px] font-sans text-slate-500 dark:text-slate-400 block">Saldo Arrastre</span>
                        <span className="text-slate-800 dark:text-slate-200 font-semibold text-xs truncate block">
                          {formatCurrency(r.saldo_arrastre, activeCurrency)}
                        </span>
                      </div>

                      <div className="bg-slate-50 dark:bg-slate-800/50 p-2 rounded-xl border border-slate-200/80 dark:border-slate-700/60">
                        <span className="text-[10px] font-sans text-slate-500 dark:text-slate-400 block">Semana (Utilidad)</span>
                        <span className="text-emerald-600 dark:text-emerald-400 font-semibold text-xs truncate block">
                          {formatCurrency(r.utilidad_semana, activeCurrency)}
                        </span>
                      </div>

                      <div className="bg-slate-50 dark:bg-slate-800/50 p-2 rounded-xl border border-slate-200/80 dark:border-slate-700/60">
                        <span className="text-[10px] font-sans text-slate-500 dark:text-slate-400 block">Gastos (-)</span>
                        <span className="text-rose-600 dark:text-rose-400 font-semibold text-xs truncate block">
                          {formatCurrency(r.gastos, activeCurrency)}
                        </span>
                      </div>

                      <div className="bg-slate-50 dark:bg-slate-800/50 p-2 rounded-xl border border-slate-200/80 dark:border-slate-700/60">
                        <span className="text-[10px] font-sans text-slate-500 dark:text-slate-400 block">Pagos (-)</span>
                        <span className="text-cyan-600 dark:text-cyan-400 font-semibold text-xs truncate block">
                          {formatCurrency(r.pagos, activeCurrency)}
                        </span>
                      </div>

                      <div className="bg-slate-50 dark:bg-slate-800/50 p-2 rounded-xl border border-slate-200/80 dark:border-slate-700/60 col-span-2 sm:col-span-1">
                        <span className="text-[10px] font-sans text-slate-500 dark:text-slate-400 block">Premios (+)</span>
                        <span className="text-amber-600 dark:text-amber-400 font-semibold text-xs truncate block">
                          {r.reposicion_premios > 0 ? `+${formatCurrency(r.reposicion_premios, activeCurrency)}` : '-'}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {filteredRows.length === 0 && (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center text-slate-500 dark:text-slate-400 text-xs shadow-sm">
                  No se encontraron agencias con los filtros aplicados.
                </div>
              )}
            </div>
          )}

          {/* =========================================================================
              VIEW MODE 2: DESKTOP / PINNED STICKY TABLE
          ========================================================================= */}
          {viewMode === 'table' && (
            <div className={UI_LOCK.tableContainer}>
              <div className="p-4 sm:p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <h4 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                  Saldos y Balances en {activeCurrency} ({filteredRows.length})
                </h4>
              </div>

              <div className="overflow-x-auto">
                <table className={UI_LOCK.table}>
                  <thead className={UI_LOCK.tableThead}>
                    <tr>
                      {/* Pinned Agency Column with shadow */}
                      <th className="py-3.5 px-4 sticky left-0 bg-slate-50 dark:bg-slate-800/90 z-20 border-r border-slate-200 dark:border-slate-800 shadow-xs">
                        Agencia
                      </th>
                      <th className="py-3.5 px-4 text-right">Saldo Arrastre</th>
                      <th className="py-3.5 px-4 text-right">Semana (Utilidad)</th>
                      <th className="py-3.5 px-4 text-right">Gastos (-)</th>
                      <th className="py-3.5 px-4 text-right">Pagos (-)</th>
                      <th className="py-3.5 px-4 text-right">Premios (+)</th>
                      <th className="py-3.5 px-4 text-right">Balance Final</th>
                      <th className="py-3.5 px-4 text-center">Estatus</th>
                      <th className="py-3.5 px-4 text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 font-mono">
                    {filteredRows.map((r) => (
                      <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors group">
                        {/* Pinned Agency Column with shadow */}
                        <td className="py-3.5 px-4 font-sans font-bold text-slate-900 dark:text-white sticky left-0 bg-white group-hover:bg-slate-50 dark:bg-slate-900 dark:group-hover:bg-slate-850 z-10 border-r border-slate-200 dark:border-slate-800 shadow-xs whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] text-slate-400 font-mono">#{r.id}</span>
                            <span>{r.agencia}</span>
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-right text-slate-600 dark:text-slate-400">{formatCurrency(r.saldo_arrastre, activeCurrency)}</td>
                        <td className="py-3.5 px-4 text-right text-emerald-600 dark:text-emerald-400 font-semibold">{formatCurrency(r.utilidad_semana, activeCurrency)}</td>
                        <td className="py-3.5 px-4 text-right text-rose-600 dark:text-rose-400">{formatCurrency(r.gastos, activeCurrency)}</td>
                        <td className="py-3.5 px-4 text-right text-cyan-600 dark:text-cyan-400 font-semibold">
                          {formatCurrency(r.pagos, activeCurrency)}
                        </td>
                        <td className="py-3.5 px-4 text-right text-amber-600 dark:text-amber-400 font-semibold">
                          {r.reposicion_premios > 0 ? `+${formatCurrency(r.reposicion_premios, activeCurrency)}` : '-'}
                        </td>
                        <td
                          className={`py-3.5 px-4 text-right font-black text-sm ${
                            r.status === 'pendiente'
                              ? 'text-rose-600 dark:text-rose-400'
                              : r.status === 'favor'
                              ? 'text-cyan-600 dark:text-cyan-400'
                              : 'text-emerald-600 dark:text-emerald-400'
                          }`}
                        >
                          {formatCurrency(r.balance_final, activeCurrency)}
                        </td>
                        <td className="py-3.5 px-4 text-center font-sans whitespace-nowrap">
                          {r.status === 'pagado' && (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 text-[10px] font-bold border border-emerald-200 dark:border-emerald-500/30">
                              🟢 PAGADO
                            </span>
                          )}
                          {r.status === 'pendiente' && (
                            <span className="px-2 py-0.5 rounded-full bg-rose-50 dark:bg-rose-500/15 text-rose-700 dark:text-rose-400 text-[10px] font-bold border border-rose-200 dark:border-rose-500/30">
                              🔴 PENDIENTE
                            </span>
                          )}
                          {r.status === 'favor' && (
                            <span className="px-2 py-0.5 rounded-full bg-cyan-50 dark:bg-cyan-500/15 text-cyan-700 dark:text-cyan-400 text-[10px] font-bold border border-cyan-200 dark:border-cyan-500/30">
                              🔵 A FAVOR
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => openIndividualActa(r)}
                              className="p-1.5 rounded-lg bg-sky-50 dark:bg-sky-500/20 hover:bg-sky-500 text-sky-600 dark:text-sky-400 hover:text-white border border-sky-200 dark:border-sky-500/30 transition-all cursor-pointer"
                              title={`Imprimir Acta / Finiquito de ${r.agencia} en PDF`}
                            >
                              <Printer className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setDetailModalAgency(r.agencia)}
                              className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
                              title="Ver Detalle de la Agencia"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </button>
                            <a
                              href={generateAgencyWhatsAppUrl(r)}
                              target="_blank"
                              rel="noreferrer"
                              className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-600/20 hover:bg-emerald-600 text-emerald-600 dark:text-emerald-400 hover:text-white border border-emerald-200 dark:border-emerald-500/30 transition-all cursor-pointer"
                              title={`Enviar Estado de Cuenta de ${r.agencia} por WhatsApp`}
                            >
                              <WhatsAppIcon className="w-3.5 h-3.5 fill-current" />
                            </a>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* =========================================================================
              INDIVIDUAL AGENCY DETAIL MODAL
          ========================================================================= */}
          {detailMovements && (
            <div className={UI_LOCK.modalBackdrop}>
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 sm:p-7 max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl animate-fade-in my-auto">
                <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800 shrink-0">
                  <div className="pr-2">
                    <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <Building2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <span>Estado de Cuenta: {detailMovements.agencia}</span>
                    </h3>
                    <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Desglose financiero consolidado, ventas, pagos y gastos en {activeCurrency}.
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {selectedAgencyRow && (
                      <a
                        href={generateAgencyWhatsAppUrl(selectedAgencyRow)}
                        target="_blank"
                        rel="noreferrer"
                        className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-600/20 hover:bg-emerald-600 text-emerald-600 dark:text-emerald-400 hover:text-white border border-emerald-200 dark:border-emerald-500/30 transition-all cursor-pointer hidden sm:flex items-center gap-1.5 text-xs font-bold"
                        title="Enviar Estado de Cuenta por WhatsApp"
                      >
                        <WhatsAppIcon className="w-4 h-4 fill-current" />
                        <span>WhatsApp</span>
                      </a>
                    )}
                    <button
                      onClick={() => setDetailModalAgency(null)}
                      className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white flex items-center justify-center text-xs font-bold transition-colors shrink-0"
                    >
                      ✕
                    </button>
                  </div>
                </div>

                {/* Scrollable contents */}
                <div className="overflow-y-auto space-y-4 py-3 pr-1 flex-1">
                  {/* Financial Balance Summary Card */}
                  {selectedAgencyRow && (
                    <div className="bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-3 shrink-0">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 tracking-wider">
                            Balance Final ({activeCurrency})
                          </span>
                          <div
                            className="text-xl sm:text-2xl font-black font-mono mt-0.5"
                            style={{
                              color:
                                selectedAgencyRow.status === 'pendiente'
                                  ? '#e11d48'
                                  : selectedAgencyRow.status === 'favor'
                                  ? '#0891b2'
                                  : '#059669',
                            }}
                          >
                            {formatCurrency(selectedAgencyRow.balance_final, activeCurrency)}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {selectedAgencyRow.status === 'pagado' && (
                            <span className="px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 text-xs font-bold border border-emerald-200 dark:border-emerald-500/30">
                              🟢 PAGADO
                            </span>
                          )}
                          {selectedAgencyRow.status === 'pendiente' && (
                            <span className="px-2.5 py-1 rounded-full bg-rose-50 dark:bg-rose-500/15 text-rose-700 dark:text-rose-400 text-xs font-bold border border-rose-200 dark:border-rose-500/30 animate-pulse">
                              🔴 PENDIENTE
                            </span>
                          )}
                          {selectedAgencyRow.status === 'favor' && (
                            <span className="px-2.5 py-1 rounded-full bg-cyan-50 dark:bg-cyan-500/15 text-cyan-700 dark:text-cyan-400 text-xs font-bold border border-cyan-200 dark:border-cyan-500/30">
                              🔵 A FAVOR
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 font-mono text-xs">
                        <div className="bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800">
                          <span className="text-[10px] font-sans text-slate-500 dark:text-slate-400 block">Saldo Arrastre</span>
                          <span className="text-slate-800 dark:text-slate-200 font-semibold truncate block">
                            {formatCurrency(selectedAgencyRow.saldo_arrastre, activeCurrency)}
                          </span>
                        </div>
                        <div className="bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800">
                          <span className="text-[10px] font-sans text-slate-500 dark:text-slate-400 block">Semana (Utilidad)</span>
                          <span className="text-emerald-600 dark:text-emerald-400 font-semibold truncate block">
                            {formatCurrency(selectedAgencyRow.utilidad_semana, activeCurrency)}
                          </span>
                        </div>
                        <div className="bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800">
                          <span className="text-[10px] font-sans text-slate-500 dark:text-slate-400 block">Gastos (-)</span>
                          <span className="text-rose-600 dark:text-rose-400 font-semibold truncate block">
                            {formatCurrency(selectedAgencyRow.gastos, activeCurrency)}
                          </span>
                        </div>
                        <div className="bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800">
                          <span className="text-[10px] font-sans text-slate-500 dark:text-slate-400 block">Pagos (-)</span>
                          <span className="text-cyan-600 dark:text-cyan-400 font-semibold truncate block">
                            {formatCurrency(selectedAgencyRow.pagos, activeCurrency)}
                          </span>
                        </div>
                        <div className="bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 col-span-2 sm:col-span-1">
                          <span className="text-[10px] font-sans text-slate-500 dark:text-slate-400 block">Premios (+)</span>
                          <span className="text-amber-600 dark:text-amber-400 font-semibold truncate block">
                            {selectedAgencyRow.reposicion_premios && selectedAgencyRow.reposicion_premios > 0
                              ? `+${formatCurrency(selectedAgencyRow.reposicion_premios, activeCurrency)}`
                              : '-'}
                          </span>
                        </div>
                      </div>

                      <a
                        href={generateAgencyWhatsAppUrl(selectedAgencyRow)}
                        target="_blank"
                        rel="noreferrer"
                        className={UI_LOCK.buttonPrimary + ' w-full'}
                      >
                        <WhatsAppIcon className="w-4 h-4 fill-white" />
                        <span>Enviar Estado de Cuenta por WhatsApp</span>
                      </a>
                    </div>
                  )}

                  {/* Desglose por Sistemas */}
                  <div className="space-y-1.5">
                    <span className="text-[11px] font-bold uppercase text-slate-500 dark:text-slate-400 tracking-wider">
                      Desglose por Sistemas ({detailMovements.sistemas.length})
                    </span>
                    {detailMovements.sistemas.length === 0 ? (
                      <p className="text-xs text-slate-400 italic">No hay movimientos por sistema en {activeCurrency}.</p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {detailMovements.sistemas.map((sis) => (
                          <div key={sis.sistema} className="bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 rounded-xl p-3 space-y-1.5 font-mono text-xs">
                            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-1">
                              <span className="font-sans font-bold text-slate-900 dark:text-white text-xs flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                                {sis.sistema}
                              </span>
                              <span className="font-bold text-emerald-600 dark:text-emerald-400">
                                Neto: {formatCurrency(sis.neto, activeCurrency)}
                              </span>
                            </div>
                            <div className="grid grid-cols-3 gap-1 text-[11px] text-slate-600 dark:text-slate-300">
                              <div>
                                <span className="text-[9px] text-slate-400 font-sans block">Venta</span>
                                <span>{formatCurrency(sis.venta, activeCurrency)}</span>
                              </div>
                              <div>
                                <span className="text-[9px] text-slate-400 font-sans block">Comisión</span>
                                <span className="text-rose-600 dark:text-rose-400">-{formatCurrency(sis.comision, activeCurrency)}</span>
                              </div>
                              <div>
                                <span className="text-[9px] text-slate-400 font-sans block">Premios</span>
                                <span className="text-amber-600 dark:text-amber-400">-{formatCurrency(sis.premios, activeCurrency)}</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Sales List */}
                  <div className="space-y-1.5">
                    <span className="text-[11px] font-bold uppercase text-slate-500 dark:text-slate-400 tracking-wider">
                      Ventas ({detailMovements.sales.length})
                    </span>
                    {detailMovements.sales.length === 0 ? (
                      <p className="text-xs text-slate-400 italic">No hay ventas registradas en {activeCurrency}.</p>
                    ) : (
                      <div className="max-h-40 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50 dark:bg-slate-850 p-2 space-y-1 text-xs font-mono">
                        {detailMovements.sales.map((s) => (
                          <div key={s.id} className="flex justify-between items-center py-1 border-b border-slate-200/60 dark:border-slate-800/60 last:border-0 text-[11px] sm:text-xs text-slate-700 dark:text-slate-300">
                            <span className="truncate pr-2">{formatDate(s.fecha)} • {s.sistema}</span>
                            <span className="shrink-0 text-right">Venta: {formatCurrency(s.venta, s.moneda)} | <strong className="text-emerald-600 dark:text-emerald-400">{formatCurrency(s.neto, s.moneda)}</strong></span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Payments List */}
                  <div className="space-y-1.5">
                    <span className="text-[11px] font-bold uppercase text-slate-500 dark:text-slate-400 tracking-wider">
                      Pagos y Cobranzas ({detailMovements.payments.length})
                    </span>
                    {detailMovements.payments.length === 0 ? (
                      <p className="text-xs text-slate-400 italic">No hay pagos registrados en {activeCurrency}.</p>
                    ) : (
                      <div className="max-h-40 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50 dark:bg-slate-850 p-2 space-y-1 text-xs font-mono">
                        {detailMovements.payments.map((p) => {
                          const isPremio = String(p.tipo_pago || '').toUpperCase().includes('PREMIO');
                          return (
                            <div key={p.id} className="flex justify-between items-center py-1.5 border-b border-slate-200/60 dark:border-slate-800/60 last:border-0 text-[11px] sm:text-xs text-slate-700 dark:text-slate-300">
                              <span className="truncate pr-2">
                                {formatDate(p.fecha)} • {p.metodo} ({p.referencia})
                                {isPremio && (
                                  <span className="ml-1.5 px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 text-[9px] font-sans font-semibold border border-amber-200 dark:border-amber-500/30">
                                    Reposición Premios
                                  </span>
                                )}
                              </span>
                              <strong className={`shrink-0 ${isPremio ? 'text-amber-600 dark:text-amber-400' : 'text-cyan-600 dark:text-cyan-400'}`}>
                                {isPremio ? '-' : ''}{formatCurrency(p.monto, p.moneda)}
                              </strong>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Expenses List */}
                  <div className="space-y-1.5">
                    <span className="text-[11px] font-bold uppercase text-slate-500 dark:text-slate-400 tracking-wider">
                      Gastos ({detailMovements.expenses.length})
                    </span>
                    {detailMovements.expenses.length === 0 ? (
                      <p className="text-xs text-slate-400 italic">No hay gastos registrados en {activeCurrency}.</p>
                    ) : (
                      <div className="max-h-40 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50 dark:bg-slate-850 p-2 space-y-1 text-xs font-mono">
                        {detailMovements.expenses.map((e) => (
                          <div key={e.id} className="flex justify-between items-center py-1 border-b border-slate-200/60 dark:border-slate-800/60 last:border-0 text-[11px] sm:text-xs text-slate-700 dark:text-slate-300">
                            <span className="truncate pr-2">{formatDate(e.fecha)} • {e.concepto}</span>
                            <strong className="text-rose-600 dark:text-rose-400 shrink-0">{formatCurrency(e.monto, e.moneda)}</strong>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-slate-800 shrink-0 gap-2">
                  {selectedAgencyRow && (
                    <a
                      href={generateAgencyWhatsAppUrl(selectedAgencyRow)}
                      target="_blank"
                      rel="noreferrer"
                      className="px-4 py-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-600/20 hover:bg-emerald-600 text-emerald-700 dark:text-emerald-300 hover:text-white font-bold text-xs border border-emerald-200 dark:border-emerald-500/30 flex items-center gap-2 transition-all cursor-pointer"
                    >
                      <WhatsAppIcon className="w-4 h-4 fill-current" />
                      <span>Enviar por WhatsApp</span>
                    </a>
                  )}
                  <button
                    onClick={() => setDetailModalAgency(null)}
                    className={UI_LOCK.buttonSecondary + ' ml-auto'}
                  >
                    Cerrar Detalle
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* =========================================================================
          INDIVIDUAL AGENCY ACTA (PDF) MODAL
      ========================================================================= */}
      {selectedIndividualActa && (
        <IndividualAgencyActaModal
          isOpen={true}
          onClose={() => setSelectedIndividualActa(null)}
          actaData={selectedIndividualActa}
          companyName={(profile?.nombre_banca || profile?.banca || 'Corporacion Calendario, ca').toUpperCase()}
          userName={user?.email || 'Administración'}
        />
      )}

      {/* =========================================================================
          GENERAL DELIVERY REPORT (PDF) MODAL
      ========================================================================= */}
      {isGeneralActaOpen && (
        <DeliveryReportModal
          isOpen={true}
          onClose={() => setIsGeneralActaOpen(false)}
          systemCycle={{
            semana: String(systemCycle.semana || '41'),
            desde: systemCycle.desde || '',
            hasta: systemCycle.hasta || '',
            tipo: systemCycle.tipo || 'SEMANAL',
          }}
          companyName={(profile?.nombre_banca || profile?.banca || 'Corporacion Calendario, ca').toUpperCase()}
          userName={user?.email || 'Administración'}
          auditRows={activeBalances.rows.map((r, i) => ({
            ag_id: r.id || i + 1,
            entidad: r.agencia,
            moneda: activeCurrency,
            saldo_anterior: r.saldo_arrastre,
            venta_bruta: r.utilidad_semana,
            comision: 0,
            premios_taquilla: 0,
            venta_neta: r.utilidad_semana,
            gastos: r.gastos,
            cobrador_ruta: 0,
            efectivo_taquilla: 0,
            bancos: r.pagos,
            reposicion_premios: r.reposicion_premios,
            pagos_netos: r.pagos_netos || r.pagos,
            saldo_final: r.balance_final,
            status: r.status,
          }))}
          totalsByCurrency={{
            [activeCurrency]: {
              saldoAnterior: activeBalances.rows.reduce((sum, r) => sum + r.saldo_arrastre, 0),
              ventaNeta: activeBalances.rows.reduce((sum, r) => sum + r.utilidad_semana, 0),
              gastos: activeBalances.rows.reduce((sum, r) => sum + r.gastos, 0),
              gastosAgencias: activeBalances.rows.reduce((sum, r) => sum + r.gastos, 0),
              gastosComercializadora: 0,
              cobradorRuta: 0,
              efectivoTaquilla: 0,
              bancos: activeBalances.rows.reduce((sum, r) => sum + r.pagos, 0),
              reposicionPremios: activeBalances.rows.reduce((sum, r) => sum + r.reposicion_premios, 0),
              saldoFinal: activeBalances.totalDebt,
            },
          }}
        />
      )}
    </div>
  );
};
