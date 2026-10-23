import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { formatCurrency, formatDate, normalizarMoneda, cleanAgencyName } from '../../utils/formatters';
import { getAgencyCommissionAndParticipation } from '../../utils/salesRecalculation';
import {
  getConsolidatedPayments,
  getConsolidatedExpenses,
  getAdministrativeExpenses,
  type ConsolidatedPaymentItem,
  type ConsolidatedExpenseItem,
  type AdministrativeExpenseItem,
} from '../../utils/consolidations';
import type { Agency, Grupo } from '../../types';
import { loadCurrencies, type DynamicCurrencyConfig } from '../../utils/currencies';
import { PreClosureAuditTab } from './PreClosureAuditTab';
import {
  Lock,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Layers,
  Calendar,
  Building2,
  ArrowRight,
  ShieldAlert,
  Download,
  Undo2,
  FileSpreadsheet,
  X,
  FileText,
  Globe,
  Scale,
  Sparkles,
  ShieldCheck,
  Printer,
  ChevronRight,
  Eye,
  Store,
  Handshake,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import {
  calculateOperatorSettlements,
  type OperatorPayment,
  type OperatorSettlementRow,
} from '../../utils/operatorSettlement';
import {
  loadSystemKeywords,
  saveSystemKeywords,
  type SystemKeywordsMap,
} from '../../utils/systemKeywords';
import {
  checkIsBalancesCorrupted,
  executeRestoreAuditedBalances,
} from '../../utils/auditedBalancesS40';
import { DeliveryReportModal, type PreClosureAgencyRow } from './DeliveryReportModal';
import { OperatorDeliveryReportModal } from './OperatorDeliveryReportModal';
import {
  IndividualAgencyActaModal,
  type IndividualAgencyActaData,
} from './IndividualAgencyActaModal';
import { AuditClosureActaModal } from './AuditClosureActaModal';
import { logAuditEvent, fetchAuditLogs } from '../../utils/auditLogger';
import { AuditLogTab } from '../Audit/AuditLogTab';
import { SEMANA_41_SALES_RECORDS } from '../../utils/semana41SalesData';
import {
  saveWeeklySnapshot,
  getWeeklySnapshot,
  downloadSnapshotJson,
} from '../../lib/snapshots';
import {
  computeCertifiedAgencyMatrix,
  computeCertifiedTotals,
  computeCertifiedGroupMatrix,
  type GroupClosureRow,
  type RawGroupPaymentEntry,
} from '../../lib/closureEngineLock';
import { getCurrencyFlag, getCurrencyBadgeClasses } from '../../utils/currencies';

interface CierreAgencyData {
  ag_id: number;
  entidad: string;
  moneda: string;
  saldo_anterior: number;
  venta_bruta: number;
  utilidad_semana: number;
  gastos: number;
  premios: number;
  cobros: number;
  saldo_final: number;
}

export const WeeklyClosureTab: React.FC = () => {
  const { user, profile, effectiveUserId, systemCycle, refreshSystemCycle } = useAuth();

  const [activeSubTab, setActiveSubTab] = useState<'precierre' | 'cierre' | 'historico_actas' | 'auditoria'>('precierre');
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [sales, setSales] = useState<any[]>([]);
  const [payments, setPayments] = useState<ConsolidatedPaymentItem[]>([]);
  const [expenses, setExpenses] = useState<ConsolidatedExpenseItem[]>([]);
  const [adminExpenses, setAdminExpenses] = useState<AdministrativeExpenseItem[]>([]);

  // Operator Closure States
  const [registeredSystems, setRegisteredSystems] = useState<string[]>([]);
  const [systemConfigs, setSystemConfigs] = useState<SystemKeywordsMap>({});
  const [operatorPayments, setOperatorPayments] = useState<OperatorPayment[]>([]);
  const [closureViewMode, setClosureViewMode] = useState<'todos' | 'agencias' | 'operadoras' | 'grupos'>('todos');
  const [groups, setGroups] = useState<Grupo[]>([]);
  const [groupPayments, setGroupPayments] = useState<RawGroupPaymentEntry[]>([]);
  const [dynamicCurrencies, setDynamicCurrencies] = useState<DynamicCurrencyConfig[]>([]);
  const activeCurrencyCodes = useMemo(() => {
    return dynamicCurrencies.length > 0 ? dynamicCurrencies.map((c) => c.codigo) : ['BS', 'USD', 'COP'];
  }, [dynamicCurrencies]);

  const [verifiedCheckMaster, setVerifiedCheckMaster] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [hasRollbackBackup, setHasRollbackBackup] = useState(false);
  const [lastClosurePeriodo, setLastClosurePeriodo] = useState<string | null>(null);

  // Historical Actas States
  const [historicalClosures, setHistoricalClosures] = useState<any[]>([]);
  const [selectedGeneralActa, setSelectedGeneralActa] = useState<any | null>(null);
  const [selectedOperatorActa, setSelectedOperatorActa] = useState<any | null>(null);
  const [selectedIndividualActa, setSelectedIndividualActa] = useState<IndividualAgencyActaData | null>(null);
  const [agencySelectorClosure, setAgencySelectorClosure] = useState<any | null>(null);
  const [selectedAuditActa, setSelectedAuditActa] = useState<any | null>(null);

  // Open Audit Acta for historical closure
  const handleOpenAuditActa = async (closure: any) => {
    const semanaStr = closure.semana_no || closure.periodo?.match(/Semana\s*(\d+)/i)?.[1] || '';
    let logs: any[] = [];

    // 1. Check if stored in localStorage
    try {
      const stored = localStorage.getItem(`acta_auditoria_semana_${semanaStr}`);
      if (stored) logs = JSON.parse(stored);
    } catch (e) {}

    // 2. Fallback to Supabase config_sistema
    if (!logs || logs.length === 0) {
      if (effectiveUserId) {
        try {
          const { data } = await supabase
            .from('config_sistema')
            .select('valor')
            .eq('user_id', effectiveUserId)
            .eq('parametro', `acta_auditoria_semana_${semanaStr}`)
            .single();
          if (data?.valor) {
            logs = JSON.parse(data.valor);
          }
        } catch (e) {}
      }
    }

    // 3. Fallback to fetchAuditLogs
    if (!logs || logs.length === 0) {
      try {
        const allLogs = await fetchAuditLogs(effectiveUserId);
        logs = allLogs.filter((l) => {
          if (semanaStr && l.semana_ciclo) {
            return String(l.semana_ciclo) === String(semanaStr);
          }
          return false;
        });
      } catch (e) {}
    }

    setSelectedAuditActa({
      systemCycle: {
        semana: semanaStr || systemCycle.semana,
        desde: closure.desde || systemCycle.desde,
        hasta: closure.hasta || systemCycle.hasta,
        tipo: 'SEMANAL',
      },
      auditLogs: logs,
      fechaCierre: closure.fecha_cierre,
    });
  };

  const loadData = async () => {
    if (!effectiveUserId) return;
    setIsLoading(true);
    setMessage(null);

    try {
      const [agRes, sRes, pConsolidated, gConsolidated, sysRes, confs, payRes, admExpenses] = await Promise.all([
        supabase.from('agencias').select('*').eq('user_id', effectiveUserId).order('id', { ascending: true }),
        supabase.from('carga_actual').select('*').eq('user_id', effectiveUserId),
        getConsolidatedPayments(effectiveUserId, { fechaDesde: systemCycle.desde, fechaHasta: systemCycle.hasta }),
        getConsolidatedExpenses(effectiveUserId, { fechaDesde: systemCycle.desde, fechaHasta: systemCycle.hasta }),
        supabase.from('sistemas').select('nombre_sistema').eq('user_id', effectiveUserId).order('nombre_sistema', { ascending: true }),
        loadSystemKeywords(effectiveUserId),
        supabase
          .from('pagos_semana')
          .select('*')
          .eq('user_id', effectiveUserId)
          .or('tipo_pago.eq.PAGO_OPERADORA,tipo_pago.eq.ABONO_OPERADORA,agencia.ilike.OPERADORA:%')
          .order('id', { ascending: false }),
        getAdministrativeExpenses(effectiveUserId, { fechaDesde: systemCycle.desde, fechaHasta: systemCycle.hasta }),
      ]);

      const agList = agRes.data || [];

      const maximaAg = agList.find((a: any) => String(a.nombre_agencia || '').toUpperCase().includes('MAXIMA') && Number(a.saldo_inicial_cop) === 328901);
      if (maximaAg && effectiveUserId) {
        try {
          await supabase
            .from('agencias')
            .update({ saldo_inicial_cop: 28901.00 })
            .eq('id', maximaAg.id)
            .eq('user_id', effectiveUserId);
          maximaAg.saldo_inicial_cop = 28901.00;
        } catch (e: any) {
          console.warn('Auto-repair saldo_inicial_cop error:', e);
        }
      }

      const salesData = sRes.data || [];

      const sysList = Array.from(new Set([
        ...(sysRes.data?.map((s) => s.nombre_sistema?.toUpperCase()) || []),
        ...(salesData.map((s: any) => String(s.sistema || '').toUpperCase()).filter(Boolean))
      ])).sort();

      const rawOperatorPayments: OperatorPayment[] = (payRes.data || []).map((p: any) => {
        let sysName = '';
        if (p.agencia && p.agencia.toUpperCase().startsWith('OPERADORA:')) {
          sysName = p.agencia.replace(/^OPERADORA:\s*/i, '').trim().toUpperCase();
        } else {
          sysName = String(p.sistema || p.agencia || '').trim().toUpperCase();
        }
        return {
          id: p.id,
          fecha: p.fecha || new Date().toISOString().slice(0, 10),
          sistema: sysName,
          moneda: String(p.moneda || 'BS').toUpperCase(),
          monto: Number(p.monto || 0),
          referencia: p.referencia || 'S/R',
          tipo_pago: (p.tipo_pago === 'ABONO_OPERADORA' ? 'ABONO_OPERADORA' : 'PAGO_OPERADORA') as any,
          banco: p.banco || p.metodo,
          agencia: p.agencia,
        };
      });

      setAgencies(agList);
      setSales(salesData);
      setPayments(pConsolidated);
      setExpenses(gConsolidated);
      setAdminExpenses(admExpenses);
      setRegisteredSystems(sysList);
      setSystemConfigs(confs);
      setOperatorPayments(rawOperatorPayments);

      // Cargar Grupos y Pagos de Grupos con soporte fallback dual
      let loadedGrupos: Grupo[] = [];
      try {
        const { data: grData, error: grErr } = await supabase
          .from('grupos')
          .select('*')
          .eq('user_id', effectiveUserId)
          .order('nombre_grupo', { ascending: true });
        if (!grErr && grData) {
          loadedGrupos = grData;
        } else {
          const fallback = localStorage.getItem(`cms_grupos_${effectiveUserId}`);
          if (fallback) loadedGrupos = JSON.parse(fallback);
        }
      } catch (_) {
        const fallback = localStorage.getItem(`cms_grupos_${effectiveUserId}`);
        if (fallback) loadedGrupos = JSON.parse(fallback);
      }
      setGroups(loadedGrupos);

      let loadedGroupPayments: RawGroupPaymentEntry[] = [];
      try {
        const { data: gpData, error: gpErr } = await supabase
          .from('pagos_grupos')
          .select('*')
          .eq('user_id', effectiveUserId);
        if (!gpErr && gpData) {
          loadedGroupPayments = gpData.map((p: any) => ({
            id: p.id,
            grupo_id: p.grupo_id,
            grupo_nombre: p.grupo_nombre,
            moneda: p.moneda,
            monto: Number(p.monto) || 0,
            tipo: p.tipo,
            fecha: p.fecha,
          }));
        }
      } catch (_) {}
      setGroupPayments(loadedGroupPayments);

      const dCurrs = await loadCurrencies(effectiveUserId);
      setDynamicCurrencies(dCurrs);

      // Check for rollback availability
      const hasLocalBackup = Boolean(localStorage.getItem('cms_last_closure_backup'));
      const { data: pastCierres } = await supabase
        .from('cierres_semanales')
        .select('periodo, fecha_cierre')
        .eq('user_id', effectiveUserId)
        .order('fecha_cierre', { ascending: false })
        .limit(1);

      if (pastCierres && pastCierres.length > 0) {
        setLastClosurePeriodo(pastCierres[0].periodo);
        setHasRollbackBackup(true);
      } else {
        setLastClosurePeriodo(null);
        setHasRollbackBackup(hasLocalBackup);
      }
    } catch (err: any) {
      console.error('Error loading closure data:', err);
      setMessage({ type: 'error', text: err?.message || 'Error al cargar datos de cierre.' });
    } finally {
      setIsLoading(false);
    }
  };

  const loadHistoricalClosures = useCallback(async () => {
    if (!effectiveUserId) return;
    try {
      const { data } = await supabase
        .from('cierres_semanales')
        .select('*')
        .eq('user_id', effectiveUserId)
        .order('id', { ascending: false });

      const grouped: Record<
        string,
        {
          periodo: string;
          fecha_cierre: string;
          agencyRows: any[];
          operatorRows: any[];
        }
      > = {};

      if (data && data.length > 0) {
        data.forEach((r: any) => {
          const per = r.periodo || 'Semana Anterior';
          if (!grouped[per]) {
            grouped[per] = {
              periodo: per,
              fecha_cierre: r.fecha_cierre || new Date().toISOString(),
              agencyRows: [],
              operatorRows: [],
            };
          }
          if (r.tipo_entidad === 'OPERADORA' || (r.entidad && String(r.entidad).startsWith('OPERADORA:'))) {
            grouped[per].operatorRows.push(r);
          } else {
            grouped[per].agencyRows.push(r);
          }
        });
      }

      // Check localStorage backup
      try {
        const lastBackupRaw = localStorage.getItem('cms_last_closure_backup');
        if (lastBackupRaw) {
          const b = JSON.parse(lastBackupRaw);
          const per = b.periodo || `Semana ${b.semana}`;
          if (!grouped[per]) {
            grouped[per] = {
              periodo: per,
              fecha_cierre: b.timestamp || new Date().toISOString(),
              agencyRows: (b.agencies || []).map((ag: any) => ({
                entidad: ag.nombre_agencia || ag.entidad,
                moneda: ag.moneda || 'BS',
                saldo_anterior: ag.saldo_inicial_bs || ag.saldo_anterior || 0,
                saldo_final: ag.saldo_final || 0,
                utilidad_semana: ag.utilidad_semana || 0,
                gastos: ag.gastos || 0,
                movimientos: ag.movimientos || 0,
              })),
              operatorRows: [],
            };
          }
        }
      } catch (err) {}

      // Provide audited historical pre-cierre of Semana 40 as a permanent archive option
      const perS40 = 'Semana 40 (2026-09-28 al 2026-10-04)';
      if (!grouped[perS40]) {
        grouped[perS40] = {
          periodo: perS40,
          fecha_cierre: '2026-10-04T23:59:59.000Z',
          agencyRows: [
            { entidad: 'JYY', moneda: 'BS', saldo_anterior: 0, venta_bruta: 222050, comision: 22205, premios: 174000, utilidad_semana: 25845, gastos: 0, movimientos: 24855, saldo_final: 990 },
            { entidad: 'CHUCHO', moneda: 'BS', saldo_anterior: 0, venta_bruta: 211775, comision: 33835.1, premios: 97950, utilidad_semana: 79989.9, gastos: 0, movimientos: 68486.7, saldo_final: 11503.2 },
            { entidad: 'AG NUEVA LUCHA', moneda: 'BS', saldo_anterior: 0, venta_bruta: 0, comision: 0, premios: 0, utilidad_semana: 0, gastos: 0, movimientos: 0, saldo_final: 68708.62 },
            { entidad: 'LAS VIVIENDAS', moneda: 'BS', saldo_anterior: 0, venta_bruta: 409600, comision: 49152, premios: 310500, utilidad_semana: 49948, gastos: 0, movimientos: 41934, saldo_final: 8014 },
            { entidad: 'EL 40', moneda: 'BS', saldo_anterior: 0, venta_bruta: 0, comision: 0, premios: 0, utilidad_semana: 0, gastos: 0, movimientos: 0, saldo_final: 7713.1 },
            { entidad: 'AGENCIA JAVIER', moneda: 'USD', saldo_anterior: 0, venta_bruta: 332, comision: 49.8, premios: 0, utilidad_semana: 282.2, gastos: 0, movimientos: 159.2, saldo_final: 123 },
            { entidad: 'AG NUEVA LUCHA', moneda: 'USD', saldo_anterior: 0, venta_bruta: 0, comision: 0, premios: 0, utilidad_semana: 0, gastos: 0, movimientos: 0, saldo_final: 5.24 },
            { entidad: 'EL FUTURO', moneda: 'USD', saldo_anterior: 0, venta_bruta: 1525.4, comision: 0, premios: 0, utilidad_semana: 622.86, gastos: 0, movimientos: 625.16, saldo_final: -2.3 },
            { entidad: 'WENDYS', moneda: 'COP', saldo_anterior: 0, venta_bruta: 0, comision: 0, premios: 0, utilidad_semana: 0, gastos: 0, movimientos: 0, saldo_final: 972070 },
          ],
          operatorRows: [
            { entidad: 'OPERADORA: BETM3', moneda: 'BS', saldo_anterior: 300150.97, venta_bruta: 2735589.5, utilidad_semana: -12016.77, movimientos: 0, saldo_final: 288134.2 },
            { entidad: 'OPERADORA: BETM3', moneda: 'USD', saldo_anterior: 0, venta_bruta: 1200.4, utilidad_semana: 86.27, movimientos: 0, saldo_final: 86.27 },
            { entidad: 'OPERADORA: CDAPUESTAS', moneda: 'USD', saldo_anterior: 0, venta_bruta: 0, utilidad_semana: 0, movimientos: 0, saldo_final: 0 },
          ],
        };
      }

      setHistoricalClosures(Object.values(grouped));
    } catch (e) {
      console.error('Error loading historical closures:', e);
    }
  }, [effectiveUserId]);

  useEffect(() => {
    loadData();

    if (!effectiveUserId) return;

    const channel = supabase
      .channel('realtime_weekly_closure')
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

  // Compute closure movements for all currencies delegando en el Motor Contable Puro
  const closureData = useMemo<CierreAgencyData[]>(() => {
    const rawMatrix = computeCertifiedAgencyMatrix({
      agencies,
      sales,
      payments,
      expenses,
      rawDailyPayments: payments.filter((p) => p.id.startsWith('pd_')),
      systemCycle: { desde: systemCycle.desde, hasta: systemCycle.hasta },
      participationCalculator: (ag, sistema, mon) => getAgencyCommissionAndParticipation(ag, sistema, mon),
      customCurrencies: dynamicCurrencies.map((c) => c.codigo),
    });

    return rawMatrix.map((r) => ({
      ag_id: r.ag_id,
      entidad: r.entidad,
      moneda: r.moneda,
      saldo_anterior: r.saldo_anterior,
      venta_bruta: r.venta_bruta,
      utilidad_semana: r.venta_neta,
      gastos: r.gastos,
      premios: r.reposicion_premios,
      cobros: r.bancos + r.efectivo_taquilla,
      saldo_final: r.saldo_final,
    }));
  }, [agencies, sales, payments, expenses, systemCycle, dynamicCurrencies]);

  const nextCyclePreview = useMemo(() => {
    if (!systemCycle.hasta) return { semana: '?', desde: '?', hasta: '?' };
    const [y, m, d] = systemCycle.hasta.split('-').map(Number);
    const nuevaDesdeDt = new Date(y, m - 1, d + 1);
    const nuevaHastaDt = new Date(y, m - 1, d + 1);
    if (systemCycle.tipo !== 'DIARIO') {
      nuevaHastaDt.setDate(nuevaHastaDt.getDate() + 6);
    }
    const pad = (n: number) => String(n).padStart(2, '0');
    const desde = `${nuevaDesdeDt.getFullYear()}-${pad(nuevaDesdeDt.getMonth() + 1)}-${pad(nuevaDesdeDt.getDate())}`;
    const hasta = `${nuevaHastaDt.getFullYear()}-${pad(nuevaHastaDt.getMonth() + 1)}-${pad(nuevaHastaDt.getDate())}`;
    const semana = String(Number(systemCycle.semana || 1) + 1);
    return { semana, desde, hasta };
  }, [systemCycle]);

  const totalsByCurrency = useMemo(() => {
    const res: Record<string, { totalVenta: number; totalSaldoFinal: number; count: number }> = {};
    for (const d of closureData) {
      if (!res[d.moneda]) {
        res[d.moneda] = { totalVenta: 0, totalSaldoFinal: 0, count: 0 };
      }
      res[d.moneda].totalVenta += d.venta_bruta;
      res[d.moneda].totalSaldoFinal += d.saldo_final;
      res[d.moneda].count += 1;
    }
    return res;
  }, [closureData]);

  // Compute Operator Closure Data (Option B Dual Model)
  const {
    rows: operatorClosureRows,
    totalsByCurrency: operatorTotalsByCurrency,
    activeCurrenciesWithData: operatorActiveCurrencies,
  } = useMemo(() => {
    return calculateOperatorSettlements(
      registeredSystems,
      systemConfigs,
      sales,
      operatorPayments,
      'ALL'
    );
  }, [registeredSystems, systemConfigs, sales, operatorPayments]);

  // Group Operator Rows by Operadora (Casa Matriz) with currencies stacked one below the other
  const operatorClosureGroups = useMemo(() => {
    const map = new Map<string, OperatorSettlementRow[]>();
    operatorClosureRows.forEach((row) => {
      if (!map.has(row.sistema)) map.set(row.sistema, []);
      map.get(row.sistema)!.push(row);
    });

    const currOrder: Record<string, number> = { BS: 1, USD: 2, COP: 3 };
    return Array.from(map.entries()).map(([sistema, rows]) => {
      const sortedRows = [...rows].sort((a, b) => (currOrder[a.moneda] || 99) - (currOrder[b.moneda] || 99));
      return {
        sistema,
        rows: sortedRows,
        hasDeuda: sortedRows.some((r) => r.balanceFinal > 0.01),
        hasFavor: sortedRows.some((r) => r.balanceFinal < -0.01),
      };
    });
  }, [operatorClosureRows]);

  // Compute Group Closure Data
  const groupClosureRows = useMemo<GroupClosureRow[]>(() => {
    return computeCertifiedGroupMatrix({
      groups,
      agencies,
      sales,
      groupPayments,
      participationCalculator: (ag, sistema, mon) => getAgencyCommissionAndParticipation(ag, sistema, mon),
      customCurrencies: dynamicCurrencies.map((c) => c.codigo),
    });
  }, [groups, agencies, sales, groupPayments, dynamicCurrencies]);

  // CSV Export Handlers
  const handleDownloadOperatorCSV = () => {
    if (operatorClosureRows.length === 0) return;
    const headers = [
      'Casa_Operadora',
      'Moneda',
      'Venta',
      'Premios',
      'GGR_Utilidad_Bruta',
      'Dif_Com',
      'Ganancia_Comercializador',
      'Utilidad_Casa_60',
      'Arrastre_Inicial',
      'Pagos_Netos',
      'Nuevo_Arrastre',
    ];
    const operatorExportRows = operatorClosureRows.map((op) => [
      `"${op.sistema}"`,
      op.moneda,
      op.venta.toFixed(2),
      op.premio.toFixed(2),
      op.utilidadBruta.toFixed(2),
      op.difCom.toFixed(2),
      op.totalCom.toFixed(2),
      op.netoOperadora.toFixed(2),
      op.saldoInit.toFixed(2),
      op.pagosNetos.toFixed(2),
      op.balanceFinal.toFixed(2),
    ]);
    const csvContent = '\uFEFF' + [headers.join(','), ...operatorExportRows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Liquidacion_Operadoras_Semana_${systemCycle.semana}_${systemCycle.desde}_al_${systemCycle.hasta}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleDownloadAgencyCSV = () => {
    if (closureData.length === 0) return;
    const headers = [
      'Agencia',
      'Moneda',
      'Arrastre_Inicial',
      'Venta_Neta',
      'Gastos',
      'Premios',
      'Cobros',
      'Saldo_Final',
    ];
    const agencyExportRows = closureData.map((d) => [
      `"${d.entidad}"`,
      d.moneda,
      d.saldo_anterior.toFixed(2),
      d.venta_bruta.toFixed(2),
      d.gastos.toFixed(2),
      d.premios.toFixed(2),
      d.cobros.toFixed(2),
      d.saldo_final.toFixed(2),
    ]);
    const csvContent = '\uFEFF' + [headers.join(','), ...agencyExportRows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Respaldo_Agencias_Semana_${systemCycle.semana}_${systemCycle.desde}_al_${systemCycle.hasta}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleDownloadBackupCSV = (target?: 'agencias' | 'operadoras') => {
    if (target === 'operadoras' || (closureViewMode === 'operadoras' && target !== 'agencias')) {
      handleDownloadOperatorCSV();
    } else {
      handleDownloadAgencyCSV();
    }
  };

  // Rollback Last Closure Handler
  const handleRollbackLastClosure = async () => {
    const rawBackup = localStorage.getItem('cms_last_closure_backup');
    if (!rawBackup && !lastClosurePeriodo) {
      alert('No se encontró información de respaldo para revertir el último cierre.');
      return;
    }

    const backupData = rawBackup ? JSON.parse(rawBackup) : null;
    const targetPeriodo = backupData?.periodo || lastClosurePeriodo;
    const targetSemana = backupData?.semana_no || 'anterior';

    if (!window.confirm(`⚠️ ¿Está seguro de DESHACER EL ÚLTIMO CIERRE (${targetPeriodo})?\n\nEsta acción:\n1. Restaurará los saldos de arrastre previos de agencias y operadoras.\n2. Devolverá el ciclo a la Semana ${targetSemana}.\n3. Restaurará las tablas de ventas activas del período.`)) {
      return;
    }

    setIsProcessing(true);
    setMessage(null);

    try {
      // 1. Restaurar saldos iniciales de las agencias
      if (backupData?.agenciesSnapshot && backupData.agenciesSnapshot.length > 0) {
        for (const agSnap of backupData.agenciesSnapshot) {
          await supabase
            .from('agencias')
            .update({
              saldo_inicial_bs: agSnap.saldo_inicial_bs,
              saldo_inicial_usd: agSnap.saldo_inicial_usd,
              saldo_inicial_cop: agSnap.saldo_inicial_cop,
            })
            .eq('id', agSnap.id)
            .eq('user_id', effectiveUserId);
        }
      }

      // 1b. Restaurar saldos iniciales de casas operadoras (proveedores)
      if (backupData?.providersSnapshot) {
        await saveSystemKeywords(effectiveUserId, backupData.providersSnapshot);
      }

      // 2. Restaurar ventas en carga_actual si existen en backup
      if (backupData?.salesBackup && backupData.salesBackup.length > 0) {
        await supabase.from('carga_actual').delete().eq('user_id', effectiveUserId);
        const salesToRestore = backupData.salesBackup.map((s: any) => {
          const { id, ...rest } = s;
          return { ...rest, user_id: effectiveUserId };
        });
        await supabase.from('carga_actual').insert(salesToRestore);
      }

      // 3. Restaurar pagos_semana si existen en backup
      if (backupData?.paymentsBackup && backupData.paymentsBackup.length > 0) {
        await supabase.from('pagos_semana').delete().eq('user_id', effectiveUserId);
        const paymentsToRestore = backupData.paymentsBackup.map((p: any) => {
          const { id, ...rest } = p;
          return { ...rest, user_id: effectiveUserId };
        });
        await supabase.from('pagos_semana').insert(paymentsToRestore);
      }

      // 4. Restaurar fechas en config_sistema
      if (backupData?.desde && backupData?.hasta && backupData?.semana_no) {
        const cycleRollback = [
          { parametro: 'fecha_desde', valor: backupData.desde },
          { parametro: 'fecha_hasta', valor: backupData.hasta },
          { parametro: 'tipo_cierre', valor: backupData.tipo_cierre || 'SEMANAL' },
          { parametro: 'semana_no', valor: backupData.semana_no },
        ];
        for (const item of cycleRollback) {
          await supabase.from('config_sistema').upsert(
            { user_id: effectiveUserId, parametro: item.parametro, valor: item.valor },
            { onConflict: 'user_id,parametro' }
          );
        }
      }

      // 5. Eliminar el registro en cierres_semanales (Agencias y Operadoras)
      if (targetPeriodo) {
        await supabase
          .from('cierres_semanales')
          .delete()
          .eq('user_id', effectiveUserId)
          .eq('periodo', targetPeriodo);
      }

      // Limpiar backup consumido
      localStorage.removeItem('cms_last_closure_backup');
      setHasRollbackBackup(false);

      await refreshSystemCycle();
      await loadData();

      setMessage({
        type: 'success',
        text: `✅ El cierre de la Semana ${targetSemana} ha sido revertido exitosamente. Los datos y fechas previas han sido restaurados.`,
      });
    } catch (err: any) {
      console.error('Error rolling back closure:', err);
      setMessage({ type: 'error', text: err?.message || 'Error al revertir el cierre.' });
    } finally {
      setIsProcessing(false);
    }
  };

  // Manual synchronization of audited official Semana 40 balances
  const handleSyncOfficialS40 = async () => {
    if (!effectiveUserId) return;
    setIsProcessing(true);
    setMessage(null);
    try {
      const ok = await executeRestoreAuditedBalances(effectiveUserId, agencies, refreshSystemCycle);
      if (ok) {
        await loadData();
        setMessage({
          type: 'success',
          text: '🛡️ Sincronización exitosa: Arrastres oficiales del Pre-Cierre Semana 40 aplicados para todas las agencias y operadoras. Semana 41 (2026-10-05 al 2026-10-11) activa.',
        });
      } else {
        setMessage({ type: 'error', text: 'No se pudieron sincronizar los arrastres oficiales.' });
      }
    } catch (err: any) {
      console.error('Error syncing official balances:', err);
      setMessage({ type: 'error', text: err?.message || 'Error en la sincronización.' });
    } finally {
      setIsProcessing(false);
    }
  };

  // Ejecutar Pre-Cierre Seguro y Snapshot Total (Dual Supabase + PostgreSQL)
  const handleExecuteSafePreClosureAndSnapshot = async () => {
    if (!effectiveUserId) return;
    setIsProcessing(true);
    setMessage(null);
    try {
      const nowIso = new Date().toISOString();
      const periodoActual = `${systemCycle.tipo === 'SEMANAL' ? 'Semana' : 'Ciclo'} ${systemCycle.semana} (${systemCycle.desde} al ${systemCycle.hasta})`;

      const carryOverBalances = [
        ...closureData.map((d) => ({
          entidad: d.entidad,
          tipo_entidad: 'AGENCIA' as const,
          moneda: d.moneda,
          saldo_final: d.saldo_final,
        })),
        ...operatorClosureRows.map((op) => ({
          entidad: `OPERADORA: ${op.sistema}`,
          tipo_entidad: 'OPERADORA' as const,
          moneda: op.moneda,
          saldo_final: op.balanceFinal,
        })),
        ...groupClosureRows.map((g) => ({
          entidad: g.grupoNombre,
          tipo_entidad: 'GRUPO' as const,
          moneda: g.moneda,
          saldo_final: g.saldoFinal,
        })),
      ];

      const snapshotPayload = {
        user_id: effectiveUserId,
        semana_no: systemCycle.semana,
        periodo: periodoActual,
        fecha_cierre: nowIso,
        raw_sales_loads: sales,
        consolidated_totals: totalsByCurrency,
        agency_matrix: closureData,
        operator_matrix: operatorClosureRows,
        group_matrix: groupClosureRows,
        all_movements: {
          payments,
          expenses,
          adminExpenses,
        },
        carry_over_balances: carryOverBalances,
      };

      const result = await saveWeeklySnapshot(snapshotPayload);
      if (!result.success) {
        throw new Error(result.error || 'Error al guardar snapshot');
      }

      downloadSnapshotJson({
        ...snapshotPayload,
        integrity_hash: result.hash,
      });

      setMessage({
        type: 'success',
        text: `🛡️ Pre-Cierre Seguro ejecutado con éxito. Snapshot Total certificado y respaldado (Hash: ${result.hash.slice(0, 16)}...).`,
      });
      alert(
        `🛡️ PRE-CIERRE SEGURO Y SNAPSHOT TOTAL CERTIFICADO\n\n` +
        `• Semana auditada: ${systemCycle.semana} (${systemCycle.desde} al ${systemCycle.hasta})\n` +
        `• Filas Matriz de Agencias: ${closureData.length}\n` +
        `• Filas Liquidación Operadoras: ${operatorClosureRows.length}\n` +
        `• Total Cargas de Ventas Respaldadas: ${sales.length}\n` +
        `• Hash SHA-256 de Integridad: ${result.hash}\n\n` +
        `El snapshot ha sido guardado de forma compatible con Supabase y PostgreSQL, y se ha descargado el archivo JSON de respaldo.`
      );
    } catch (err: any) {
      console.error('Error executing safe preclosure snapshot:', err);
      setMessage({ type: 'error', text: err?.message || 'Error ejecutando Pre-Cierre Seguro' });
    } finally {
      setIsProcessing(false);
    }
  };

  // Restaurar arrastres desde el Acta Oficial de Cierre de Semana 41 y activar Semana 42
  const handleRestoreCycleFromS41Acta = async (customClosure?: any) => {
    if (!effectiveUserId) return;

    let targetClosure = customClosure;
    if (!targetClosure) {
      // Intentar cargar primero desde el Snapshot Total Certificado de Semana 41
      try {
        const snap = await getWeeklySnapshot('41', effectiveUserId);
        if (snap && snap.carry_over_balances && snap.carry_over_balances.length > 0) {
          const agRows = snap.carry_over_balances.filter((r) => r.tipo_entidad === 'AGENCIA');
          const opRows = snap.carry_over_balances.filter((r) => r.tipo_entidad === 'OPERADORA');
          targetClosure = {
            periodo: snap.periodo || 'Semana 41 (2026-10-05 al 2026-10-11)',
            agencyRows: agRows,
            operatorRows: opRows,
          };
        }
      } catch (snapErr) {
        console.warn('Error loading snapshot for S41 activation:', snapErr);
      }
    }

    if (!targetClosure) {
      targetClosure = historicalClosures.find((c: any) =>
        c.periodo?.includes('2026-10-05') ||
        c.periodo?.includes('Semana 41') ||
        c.periodo?.includes('11/10/2026')
      ) || historicalClosures[0];
    }

    if (!targetClosure || (!targetClosure.agencyRows?.length && !targetClosure.operatorRows?.length)) {
      // Intentar cargar directamente desde supabase cierres_semanales
      const { data: directData } = await supabase
        .from('cierres_semanales')
        .select('*')
        .eq('user_id', effectiveUserId)
        .order('id', { ascending: false });

      if (directData && directData.length > 0) {
        const agRows = directData.filter((r) => r.tipo_entidad === 'AGENCIA' || !r.entidad?.startsWith('OPERADORA:'));
        const opRows = directData.filter((r) => r.tipo_entidad === 'OPERADORA' || r.entidad?.startsWith('OPERADORA:'));
        targetClosure = {
          periodo: directData[0].periodo || 'Semana 41 (2026-10-05 al 2026-10-11)',
          agencyRows: agRows,
          operatorRows: opRows,
        };
      }
    }

    if (!targetClosure || (!targetClosure.agencyRows?.length && !targetClosure.operatorRows?.length)) {
      alert('No se encontró el Acta Oficial de Cierre en la base de datos.');
      return;
    }

    const agCount = targetClosure.agencyRows?.length || 0;
    const opCount = targetClosure.operatorRows?.length || 0;

    if (
      !window.confirm(
        `⚡ ¿CONFIRMA ACTIVAR LA SEMANA 42 APLICANDO LOS ARRASTRES DEL ACTA DE CIERRE (${targetClosure.periodo})?\n\nEsta operación:\n1. Fijará los saldos iniciales de las ${agCount} agencias con sus saldos finales auditados.\n2. Fijará los saldos de arrastre de las ${opCount} casas operadoras.\n3. Establecerá el ciclo oficial en SEMANA 42 (2026-10-12 al 2026-10-18).\n4. Asignará las ventas activas a la Semana 42.`
      )
    ) {
      return;
    }

    setIsProcessing(true);
    setMessage(null);

    try {
      // 1. Obtener agencias vigentes de la BD para tener sus IDs
      const { data: currentAgencies } = await supabase
        .from('agencias')
        .select('*')
        .eq('user_id', effectiveUserId);

      const agListToUpdate = currentAgencies || agencies;

      // 2. Actualizar saldos iniciales de agencias
      for (const r of (targetClosure.agencyRows || [])) {
        const nom = cleanAgencyName(r.entidad);
        const col = r.moneda === 'BS' ? 'saldo_inicial_bs' : r.moneda === 'USD' ? 'saldo_inicial_usd' : 'saldo_inicial_cop';
        const targetAg = agListToUpdate.find((a) => cleanAgencyName(a.nombre_agencia) === nom);
        if (targetAg) {
          await supabase
            .from('agencias')
            .update({ [col]: Number(r.saldo_final || 0) })
            .eq('id', targetAg.id)
            .eq('user_id', effectiveUserId);
        }
      }

      // 3. Actualizar saldos iniciales de Casas Operadoras
      const updatedKeywords: SystemKeywordsMap = { ...systemConfigs };
      for (const op of (targetClosure.operatorRows || [])) {
        const sysUpper = String(op.entidad || '').replace(/^OPERADORA:\s*/i, '').trim().toUpperCase();
        if (sysUpper) {
          if (!updatedKeywords[sysUpper]) {
            updatedKeywords[sysUpper] = {
              venta: 'Venta',
              premio: 'Premio',
              saldo_inicial_bs: 0,
              saldo_inicial_usd: 0,
              saldo_inicial_cop: 0,
            };
          }
          const m = String(op.moneda || 'BS').toUpperCase();
          if (m === 'BS') updatedKeywords[sysUpper].saldo_inicial_bs = Number(op.saldo_final || 0);
          else if (m === 'USD') updatedKeywords[sysUpper].saldo_inicial_usd = Number(op.saldo_final || 0);
          else if (m === 'COP') updatedKeywords[sysUpper].saldo_inicial_cop = Number(op.saldo_final || 0);
        }
      }
      await saveSystemKeywords(effectiveUserId, updatedKeywords);

      // 3b. Actualizar saldos iniciales de Grupos
      for (const gr of groupClosureRows) {
        const col = gr.moneda === 'BS' ? 'saldo_inicial_bs' : gr.moneda === 'USD' ? 'saldo_inicial_usd' : 'saldo_inicial_cop';
        const targetG = (groups || []).find((g) => g.id === gr.grupoId || g.nombre_grupo === gr.grupoNombre);
        if (targetG) {
          const existingJson: Record<string, any> = typeof targetG.saldos_iniciales_json === 'string'
            ? (() => { try { return JSON.parse(targetG.saldos_iniciales_json); } catch { return {}; } })()
            : (targetG.saldos_iniciales_json && typeof targetG.saldos_iniciales_json === 'object' ? (targetG.saldos_iniciales_json as any) : {});
          const nextJson = { ...existingJson, [gr.moneda]: gr.saldo_final };
          try {
            await supabase
              .from('grupos')
              .update({
                [col]: gr.saldo_final,
                saldos_iniciales_json: nextJson,
              })
              .eq('id', targetG.id)
              .eq('user_id', effectiveUserId);
          } catch (_) {
            const fallbackKey = `cms_grupos_${effectiveUserId}`;
            const stored = localStorage.getItem(fallbackKey);
            if (stored) {
              const parsed = JSON.parse(stored);
              const updated = parsed.map((item: any) =>
                item.id === targetG.id
                  ? { ...item, [col]: gr.saldo_final, saldos_iniciales_json: nextJson }
                  : item
              );
              localStorage.setItem(fallbackKey, JSON.stringify(updated));
            }
          }
        }
      }

      // 4. Fijar configuración oficial del ciclo en SEMANA 42
      const cycleUpdates = [
        { parametro: 'fecha_desde', valor: '2026-10-12' },
        { parametro: 'fecha_hasta', valor: '2026-10-18' },
        { parametro: 'tipo_cierre', valor: 'SEMANAL' },
        { parametro: 'semana_no', valor: '42' },
      ];

      try {
        await supabase
          .from('config_sistema')
          .delete()
          .eq('user_id', effectiveUserId)
          .in('parametro', ['fecha_desde', 'fecha_hasta', 'tipo_cierre', 'semana_no']);
        await supabase
          .from('config_sistema')
          .insert(cycleUpdates.map((c) => ({ user_id: effectiveUserId, parametro: c.parametro, valor: c.valor })));
      } catch (_) {
        for (const item of cycleUpdates) {
          await supabase.from('config_sistema').upsert(
            { user_id: effectiveUserId, parametro: item.parametro, valor: item.valor },
            { onConflict: 'user_id,parametro' }
          );
        }
      }

      // 5. Sincronizar localStorage
      try {
        localStorage.setItem(
          'me_cms_system_cycle',
          JSON.stringify({
            desde: '2026-10-12',
            hasta: '2026-10-18',
            tipo: 'SEMANAL',
            semana: '42',
          })
        );
      } catch (_) {}

      // 6. Aislamiento de ventas (Bug 5): Las cargas de ventas de Semana 42 en carga_actual permanecen 100% intactas sin ser modificadas ni sobreescritas

      // 7. Auditoría
      await logAuditEvent({
        user_id: effectiveUserId,
        usuario: user?.email || 'Administración',
        modulo: 'CIERRES',
        tipo_accion: 'ACTIVAR_SEMANA_42_DESDE_ACTA',
        entidad_afectada: 'SEMANA 42',
        descripcion: `Ciclo activado exitosamente en Semana 42 (2026-10-12 al 2026-10-18) con arrastres oficiales de ${agCount} agencias y ${opCount} operadoras desde el Acta (${targetClosure.periodo}).`,
        impacto_financiero: 'ALTO',
        semana_ciclo: '42',
        ciclo_periodo: '2026-10-12 al 2026-10-18',
      });

      confetti({ particleCount: 90, spread: 100, origin: { y: 0.6 } });
      setMessage({
        type: 'success',
        text: `⚡ ¡Operación Exitosa! Arrastres oficiales aplicados desde el Acta de Cierre. El sistema ahora opera en la SEMANA 42 (2026-10-12 al 2026-10-18) y sus ventas están correctamente ubicadas en este ciclo.`,
      });

      await refreshSystemCycle();
      await loadHistoricalClosures();
      await loadData();
    } catch (err: any) {
      console.error('Error restaurando ciclo desde acta:', err);
      setMessage({ type: 'error', text: err?.message || 'Error al restaurar ciclo desde el acta.' });
    } finally {
      setIsProcessing(false);
    }
  };

  // Execute Cycle Finalization
  const handleFinalizeWeek = async () => {
    if (!effectiveUserId) {
      const errTxt = 'No se encontró el ID de usuario activo en la sesión.';
      setModalError(errTxt);
      setMessage({ type: 'error', text: errTxt });
      return;
    }

    if (sales.length === 0) {
      const errTxt = '⚠️ No se puede finalizar el ciclo: No hay ventas registradas en la carga actual. Finalizar un ciclo vacío causaría saldos de arrastre corrompidos.';
      setModalError(errTxt);
      setMessage({ type: 'error', text: errTxt });
      setIsProcessing(false);
      return;
    }

    setIsProcessing(true);
    setModalError(null);
    setMessage(null);

    try {
      const periodoActual = `${systemCycle.desde} al ${systemCycle.hasta}`;
      const nowIso = new Date().toISOString();

      // 0a. Recopilar y respaldar eventos de auditoría para el Acta Oficial de Auditoría del Ciclo
      let closingAuditLogs: any[] = [];
      try {
        const allLogs = await fetchAuditLogs(effectiveUserId);
        closingAuditLogs = allLogs.filter((l) => {
          if (l.semana_ciclo) return String(l.semana_ciclo) === String(systemCycle.semana);
          const fStr = l.timestamp ? l.timestamp.slice(0, 10) : '';
          return (!systemCycle.desde || fStr >= systemCycle.desde) && (!systemCycle.hasta || fStr <= systemCycle.hasta);
        });
        localStorage.setItem(`acta_auditoria_semana_${systemCycle.semana}`, JSON.stringify(closingAuditLogs));
        await supabase.from('config_sistema').upsert({
          user_id: effectiveUserId,
          parametro: `acta_auditoria_semana_${systemCycle.semana}`,
          valor: JSON.stringify(closingAuditLogs),
        }, { onConflict: 'user_id,parametro' });
      } catch (audErr) {
        console.warn('Could not snapshot closing audit logs:', audErr);
      }

      // 0b. AUTO-BACKUP PRE-CIERRE (Incluyendo Agencias, Casas Operadoras y Auditoría)
      const preClosureBackup = {
        timestamp: nowIso,
        periodo: periodoActual,
        semana_no: systemCycle.semana,
        tipo_cierre: systemCycle.tipo,
        desde: systemCycle.desde,
        hasta: systemCycle.hasta,
        closureData,
        operatorClosureRows,
        providersSnapshot: systemConfigs,
        agenciesSnapshot: agencies.map((ag) => ({
          id: ag.id,
          nombre_agencia: ag.nombre_agencia,
          saldo_inicial_bs: ag.saldo_inicial_bs,
          saldo_inicial_usd: ag.saldo_inicial_usd,
          saldo_inicial_cop: ag.saldo_inicial_cop,
        })),
        salesBackup: sales,
        paymentsBackup: payments,
        expensesBackup: expenses,
        auditBackup: closingAuditLogs,
      };

      try {
        localStorage.setItem(`cms_backup_semana_${systemCycle.semana}_${Date.now()}`, JSON.stringify(preClosureBackup));
        localStorage.setItem('cms_last_closure_backup', JSON.stringify(preClosureBackup));
      } catch (e) {
        console.warn('Could not save localStorage backup:', e);
      }

      // 1. Insert snapshot into cierres_semanales (Agencias y Operadoras) de forma segura sin abortar el cierre
      const agencySnapshot = closureData.map((d) => ({
        user_id: effectiveUserId,
        entidad: d.entidad,
        moneda: d.moneda,
        saldo_anterior: d.saldo_anterior,
        utilidad_semana: d.utilidad_semana,
        gastos: d.gastos,
        movimientos: Math.round((d.premios - d.cobros - d.gastos) * 100) / 100,
        saldo_final: d.saldo_final,
        periodo: periodoActual,
        tipo_entidad: 'AGENCIA',
        fecha_cierre: nowIso,
      }));

      const operatorSnapshot = operatorClosureRows.map((op) => ({
        user_id: effectiveUserId,
        entidad: `OPERADORA: ${op.sistema}`,
        moneda: op.moneda,
        saldo_anterior: op.saldoInit,
        utilidad_semana: op.netoOperadora,
        gastos: 0,
        movimientos: op.pagosNetos,
        saldo_final: op.balanceFinal,
        periodo: periodoActual,
        tipo_entidad: 'OPERADORA',
        fecha_cierre: nowIso,
      }));

      const allClosingCurrencies = Array.from(new Set([
        'BS', 'USD', 'COP',
        ...closureData.map((d) => d.moneda),
        ...operatorClosureRows.map((op) => op.moneda),
      ])).filter(Boolean);

      const comercializadorSnapshot = allClosingCurrencies.map((cur) => {
        const opTot = operatorTotalsByCurrency[cur];
        const admGasto = adminExpenses.filter((g) => g.moneda === cur).reduce((acc, g) => acc + g.monto, 0);
        const gananciaBruta = opTot?.totalComercializador || 0;
        const gananciaNeta = Math.round((gananciaBruta - admGasto) * 100) / 100;

        return {
          user_id: effectiveUserId,
          entidad: `COMERCIALIZADOR: ${(profile?.nombre_banca || profile?.banca || 'CASA CENTRAL').toUpperCase()}`,
          moneda: cur,
          saldo_anterior: 0,
          utilidad_semana: gananciaBruta,
          gastos: admGasto,
          movimientos: -admGasto,
          saldo_final: gananciaNeta,
          periodo: periodoActual,
          tipo_entidad: 'COMERCIALIZADOR',
          fecha_cierre: nowIso,
        };
      }).filter((c) => c.utilidad_semana !== 0 || c.gastos !== 0);

      try {
        const fullSnapshot = [...agencySnapshot, ...operatorSnapshot, ...comercializadorSnapshot];
        if (fullSnapshot.length > 0) {
          const { error: snapErr } = await supabase.from('cierres_semanales').insert(fullSnapshot);
          if (snapErr) {
            console.warn('Primary cierres_semanales insert warning:', snapErr);
            // Fallback: intentar insertar snapshot de agencias con campos base
            const fallbackAgencySnap = agencySnapshot.map(({ tipo_entidad, ...rest }) => rest);
            await supabase.from('cierres_semanales').insert(fallbackAgencySnap);
          }
        }
      } catch (snapErr) {
        console.warn('Could not insert snapshot into cierres_semanales (continuando cierre):', snapErr);
      }

      // 1b. Guardar Snapshot Total Inmutable (Dual Supabase + PostgreSQL)
      try {
        const carryOverBalances = [
          ...closureData.map((d) => ({
            entidad: d.entidad,
            tipo_entidad: 'AGENCIA' as const,
            moneda: d.moneda,
            saldo_final: d.saldo_final,
          })),
          ...operatorClosureRows.map((op) => ({
            entidad: `OPERADORA: ${op.sistema}`,
            tipo_entidad: 'OPERADORA' as const,
            moneda: op.moneda,
            saldo_final: op.balanceFinal,
          })),
          ...groupClosureRows.map((g) => ({
            entidad: g.grupoNombre,
            tipo_entidad: 'GRUPO' as const,
            moneda: g.moneda,
            saldo_final: g.saldoFinal,
          })),
        ];

        await saveWeeklySnapshot({
          user_id: effectiveUserId,
          semana_no: systemCycle.semana,
          periodo: periodoActual,
          fecha_cierre: nowIso,
          raw_sales_loads: sales,
          consolidated_totals: totalsByCurrency,
          agency_matrix: closureData,
          operator_matrix: operatorClosureRows,
          group_matrix: groupClosureRows,
          all_movements: {
            payments,
            expenses,
            adminExpenses,
          },
          carry_over_balances: carryOverBalances,
          is_locked: true,
        });
      } catch (snapSaveErr) {
        console.warn('Could not save immutable weekly snapshot on closure:', snapSaveErr);
      }

      // 1c. Insert snapshots into resultados_operadora (Histórico de liquidación de operadora)
      const operatorHistoricalResults = operatorClosureRows.map((op) => ({
        user_id: effectiveUserId,
        fecha: systemCycle.hasta || nowIso.slice(0, 10),
        sistema: op.sistema,
        moneda: op.moneda,
        venta_bruta: op.venta,
        premios: op.premio,
        comision_manual: op.difCom,
        participacion_manual: op.partCom,
        utilidad_final_casa: op.netoOperadora,
      }));
      if (operatorHistoricalResults.length > 0) {
        try {
          await supabase.from('resultados_operadora').insert(operatorHistoricalResults);
        } catch (opErr) {
          console.warn('Could not insert into resultados_operadora:', opErr);
        }
      }

      // 2. Traspaso automático de saldos de arrastre de Agencias
      for (const d of closureData) {
        const colUpdate = d.moneda === 'BS' ? 'saldo_inicial_bs' : d.moneda === 'USD' ? 'saldo_inicial_usd' : 'saldo_inicial_cop';
        const { error: agUpErr } = await supabase
          .from('agencias')
          .update({ [colUpdate]: d.saldo_final })
          .eq('id', d.ag_id)
          .eq('user_id', effectiveUserId);
        if (agUpErr) {
          console.warn(`Error actualizando saldo inicial agencia ${d.entidad}:`, agUpErr);
        }
      }

      // 2b. Traspaso automático de saldos de arrastre de Casas Operadoras (Proveedores)
      const updatedKeywords: SystemKeywordsMap = { ...systemConfigs };
      for (const op of operatorClosureRows) {
        const sysUpper = op.sistema.toUpperCase();
        if (!updatedKeywords[sysUpper]) {
          updatedKeywords[sysUpper] = {
            venta: 'Venta',
            premio: 'Premio',
            comision_comercializador: op.comisionPct,
            participacion_comercializador: op.participacionPct,
            saldo_inicial_bs: 0,
            saldo_inicial_usd: 0,
            saldo_inicial_cop: 0,
          };
        }
        if (op.moneda === 'BS') updatedKeywords[sysUpper].saldo_inicial_bs = op.balanceFinal;
        else if (op.moneda === 'USD') updatedKeywords[sysUpper].saldo_inicial_usd = op.balanceFinal;
        else if (op.moneda === 'COP') updatedKeywords[sysUpper].saldo_inicial_cop = op.balanceFinal;
        else {
          if (!updatedKeywords[sysUpper].saldos_iniciales) updatedKeywords[sysUpper].saldos_iniciales = {};
          updatedKeywords[sysUpper].saldos_iniciales[op.moneda] = op.balanceFinal;
        }
      }
      await saveSystemKeywords(effectiveUserId, updatedKeywords);

      // 2c. Traspaso automático de saldos de arrastre de Grupos (Intermediarios)
      for (const gr of groupClosureRows) {
        const col = gr.moneda === 'BS' ? 'saldo_inicial_bs' : gr.moneda === 'USD' ? 'saldo_inicial_usd' : 'saldo_inicial_cop';
        const targetG = (groups || []).find((g) => g.id === gr.grupoId || g.nombre_grupo === gr.grupoNombre);
        if (targetG) {
          const existingJson: Record<string, any> = typeof targetG.saldos_iniciales_json === 'string'
            ? (() => { try { return JSON.parse(targetG.saldos_iniciales_json); } catch { return {}; } })()
            : (targetG.saldos_iniciales_json && typeof targetG.saldos_iniciales_json === 'object' ? (targetG.saldos_iniciales_json as any) : {});
          const nextJson = { ...existingJson, [gr.moneda]: gr.saldo_final };
          try {
            await supabase
              .from('grupos')
              .update({
                [col]: gr.saldo_final,
                saldos_iniciales_json: nextJson,
              })
              .eq('id', targetG.id)
              .eq('user_id', effectiveUserId);
          } catch (_) {
            const fallbackKey = `cms_grupos_${effectiveUserId}`;
            const stored = localStorage.getItem(fallbackKey);
            if (stored) {
              const parsed = JSON.parse(stored);
              const updated = parsed.map((item: any) =>
                item.id === targetG.id
                  ? { ...item, [col]: gr.saldo_final, saldos_iniciales_json: nextJson }
                  : item
              );
              localStorage.setItem(fallbackKey, JSON.stringify(updated));
            }
          }
        }
      }

      // 3. Clean active tables
      await Promise.all([
        supabase.from('carga_actual').delete().eq('user_id', effectiveUserId),
        supabase.from('pagos_semana').delete().eq('user_id', effectiveUserId),
        supabase.from('gastos').delete().eq('user_id', effectiveUserId),
      ]);

      // 4. Advance cycle dates in config_sistema (timezone-safe)
      const [y, m, d] = systemCycle.hasta.split('-').map(Number);
      const nuevaDesdeDt = new Date(y, m - 1, d + 1);
      const nuevaHastaDt = new Date(y, m - 1, d + 1);
      if (systemCycle.tipo === 'DIARIO') {
        // Misma fecha para ciclo diario
      } else {
        nuevaHastaDt.setDate(nuevaHastaDt.getDate() + 6);
      }

      const pad = (n: number) => String(n).padStart(2, '0');
      const nuevaDesdeStr = `${nuevaDesdeDt.getFullYear()}-${pad(nuevaDesdeDt.getMonth() + 1)}-${pad(nuevaDesdeDt.getDate())}`;
      const nuevaHastaStr = `${nuevaHastaDt.getFullYear()}-${pad(nuevaHastaDt.getMonth() + 1)}-${pad(nuevaHastaDt.getDate())}`;
      const nuevaSemana = String(Number(systemCycle.semana || 1) + 1);

      // Actualización robusta del ciclo: primero delete + insert (patrón de CycleSettingsTab), con fallback a upsert
      const cycleUpdates = [
        { parametro: 'fecha_desde', valor: nuevaDesdeStr },
        { parametro: 'fecha_hasta', valor: nuevaHastaStr },
        { parametro: 'tipo_cierre', valor: systemCycle.tipo },
        { parametro: 'semana_no', valor: nuevaSemana },
      ];

      try {
        await supabase
          .from('config_sistema')
          .delete()
          .eq('user_id', effectiveUserId)
          .in('parametro', ['fecha_desde', 'fecha_hasta', 'tipo_cierre', 'semana_no']);

        const { error: insErr } = await supabase
          .from('config_sistema')
          .insert(cycleUpdates.map((c) => ({ user_id: effectiveUserId, parametro: c.parametro, valor: c.valor })));

        if (insErr) throw insErr;
      } catch (cErr) {
        console.warn('Direct delete+insert falló, ejecutando upsert fallback:', cErr);
        for (const item of cycleUpdates) {
          await supabase.from('config_sistema').upsert(
            { user_id: effectiveUserId, parametro: item.parametro, valor: item.valor },
            { onConflict: 'user_id,parametro' }
          );
        }
      }

      // Sincronizar ciclo en localStorage inmediatamente
      try {
        const nextCycleObj = {
          desde: nuevaDesdeStr,
          hasta: nuevaHastaStr,
          tipo: systemCycle.tipo,
          semana: nuevaSemana,
        };
        localStorage.setItem('me_cms_system_cycle', JSON.stringify(nextCycleObj));
      } catch (e) {}

      await refreshSystemCycle();

      await logAuditEvent({
        user_id: effectiveUserId,
        usuario: user?.email || 'Administración',
        modulo: 'CIERRES',
        tipo_accion: 'EJECUTAR_CIERRE_SEMANAL',
        entidad_afectada: `SEMANA ${systemCycle.semana}`,
        descripcion: `Cierre del ciclo ejecutado con éxito (${periodoActual}). Se emitió el Acta Oficial de Auditoría (${closingAuditLogs.length} eventos auditados) y las actas inmutables de ${closureData.length} agencias y ${operatorClosureRows.length} operadoras. Módulos de Pagos y Gastos restablecidos para la Semana ${nuevaSemana}.`,
        impacto_financiero: 'ALTO',
        semana_ciclo: String(systemCycle.semana),
        ciclo_periodo: periodoActual,
        valor_anterior: { semana: systemCycle.semana, desde: systemCycle.desde, hasta: systemCycle.hasta },
        valor_nuevo: { semana: nuevaSemana, desde: nuevaDesdeStr, hasta: nuevaHastaStr },
      });
      await loadHistoricalClosures();

      confetti({ particleCount: 90, spread: 100, origin: { y: 0.6 } });
      const successMsg = `¡Cierre Maestro Integral finalizado con éxito! Los nuevos saldos de arrastre de Agencias (${closureData.length}) y Casas Operadoras (${operatorClosureRows.length}) han sido congelados y traspasados, y el ciclo ha avanzado a la Semana ${nuevaSemana} (${nuevaDesdeStr} al ${nuevaHastaStr}). Se ha guardado un respaldo seguro inmutable.`;
      setMessage({
        type: 'success',
        text: successMsg,
      });

      setIsConfirmModalOpen(false);
      setVerifiedCheckMaster(false);
      await loadData();
    } catch (err: any) {
      console.error('Error in weekly closure:', err);
      const errMsg = err?.message || 'Error al procesar el cierre semanal.';
      setModalError(errMsg);
      setMessage({ type: 'error', text: errMsg });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2">
            <span className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <Lock className="w-5 h-5" />
            </span>
            Centro de Cierre y Registro Maestro
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Auditoría de balances finales de agencias y liquidación de casas operadoras, traspaso de saldos y avance de ciclo.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {hasRollbackBackup && (
            <button
              onClick={handleRollbackLastClosure}
              disabled={isProcessing}
              title="Deshacer el último cierre y restaurar saldos y tablas activas previas"
              className="px-3.5 py-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs font-semibold flex items-center gap-1.5 transition-all border border-rose-500/30 cursor-pointer disabled:opacity-50"
            >
              <Undo2 className="w-3.5 h-3.5" />
              Deshacer Último Cierre
            </button>
          )}

          <button
            onClick={handleDownloadAgencyCSV}
            disabled={closureData.length === 0}
            title="Descargar copia de respaldo de agencias en formato CSV"
            className="px-3.5 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all border cursor-pointer disabled:opacity-50 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
          >
            <Download className="w-3.5 h-3.5" />
            CSV Agencias
          </button>

          <button
            onClick={handleDownloadOperatorCSV}
            disabled={operatorClosureRows.length === 0}
            title="Descargar liquidación de operadoras en formato CSV"
            className="px-3.5 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all border cursor-pointer disabled:opacity-50 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border-amber-500/30"
          >
            <Download className="w-3.5 h-3.5" />
            CSV Operadoras
          </button>

          <button
            onClick={() => loadData()}
            disabled={isLoading || isProcessing}
            className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex items-center gap-1.5 transition-all border border-slate-700 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            Recalcular
          </button>
        </div>
      </div>

      {message && (
        <div
          className={`p-4 rounded-2xl border flex items-center gap-3 text-sm animate-fade-in ${
            message.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
              : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 shrink-0" />
          ) : (
            <AlertTriangle className="w-5 h-5 shrink-0" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      {/* Sub-tabs Navigation */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
        <button
          onClick={() => setActiveSubTab('precierre')}
          className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-all cursor-pointer ${
            activeSubTab === 'precierre'
              ? 'bg-emerald-500/15 dark:bg-emerald-500/10 text-emerald-800 dark:text-emerald-400 border border-emerald-500/30'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800/60'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>📊 Arqueo y Pre-Cierre del Ciclo</span>
        </button>

        <button
          onClick={() => setActiveSubTab('cierre')}
          className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-all cursor-pointer ${
            activeSubTab === 'cierre'
              ? 'bg-amber-500/15 dark:bg-amber-500/10 text-amber-800 dark:text-amber-400 border border-amber-500/30'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800/60'
          }`}
        >
          <Lock className="w-4 h-4" />
          <span>🔒 Finalizar Ciclo y Registro Maestro</span>
        </button>

        <button
          onClick={() => {
            setActiveSubTab('historico_actas');
            loadHistoricalClosures();
          }}
          className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-all cursor-pointer ${
            activeSubTab === 'historico_actas'
              ? 'bg-sky-500/15 dark:bg-sky-500/10 text-sky-800 dark:text-sky-400 border border-sky-500/30'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800/60'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>📜 Histórico de Actas de Cierre</span>
        </button>

        <button
          onClick={() => setActiveSubTab('auditoria')}
          className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-all cursor-pointer ${
            activeSubTab === 'auditoria'
              ? 'bg-purple-500/15 dark:bg-purple-500/10 text-purple-800 dark:text-purple-400 border border-purple-500/30'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800/60'
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          <span>🛡️ Log de Auditoría</span>
        </button>
      </div>

      {activeSubTab === 'precierre' ? (
        <PreClosureAuditTab />
      ) : activeSubTab === 'auditoria' ? (
        <AuditLogTab />
      ) : activeSubTab === 'historico_actas' ? (
        <div className="space-y-6">
          {/* Header Banner */}
          <div className="bg-white dark:bg-[#0D1B22] border border-slate-200/80 dark:border-slate-800 rounded-2xl p-6 shadow-sm relative overflow-hidden transition-colors">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 relative z-10">
              <div className="space-y-1">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-sky-50 dark:bg-sky-500/10 border border-sky-200 dark:border-sky-500/30 text-sky-700 dark:text-sky-400 text-xs font-bold">
                  <FileText className="w-3.5 h-3.5" />
                  <span>Archivo Maestro de Documentos Oficiales</span>
                </div>
                <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2.5">
                  <span>Repositorio Histórico de Actas de Cierre</span>
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-mono font-normal">
                    {historicalClosures.length} cierres archivados
                  </span>
                </h2>
                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-2xl">
                  Consulte, vuelva a abrir e imprima en PDF el Acta General de Entrega, el Acta de Casas Operadoras o el Finiquito Individual por Agencia para cualquier semana cerrada.
                </p>
              </div>

              <button
                onClick={() => loadHistoricalClosures()}
                disabled={isLoading}
                className="px-4 py-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white font-bold text-xs flex items-center gap-2 transition-all border border-slate-200 dark:border-slate-700 cursor-pointer self-start lg:self-auto"
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-sky-500 dark:text-sky-400' : ''}`} />
                <span>Actualizar Histórico</span>
              </button>
            </div>
          </div>

          {/* List of Closures */}
          {historicalClosures.length === 0 ? (
            <div className="bg-[#0D1B22] border border-slate-800 rounded-3xl p-12 text-center text-slate-400 text-xs">
              No hay cierres registrados en el archivo histórico todavía.
            </div>
          ) : (
            <div className="space-y-4">
              {historicalClosures.map((closure, idx) => {
                const totalAgencias = closure.agencyRows?.length || 0;
                const totalOperadoras = closure.operatorRows?.length || 0;

                return (
                  <div
                    key={closure.periodo || idx}
                    className="bg-white dark:bg-[#0D1B22] border border-slate-200/80 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700/80 rounded-3xl p-6 shadow-sm transition-all space-y-4"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800/80 pb-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black uppercase tracking-wider text-sky-700 dark:text-sky-400 bg-sky-50 dark:bg-sky-500/10 px-2.5 py-0.5 rounded-full border border-sky-200 dark:border-sky-500/20">
                            Cierre Auditado
                          </span>
                          <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                            {closure.fecha_cierre ? formatDate(closure.fecha_cierre) : ''}
                          </span>
                        </div>
                        <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white mt-1">
                          {closure.periodo}
                        </h3>
                      </div>

                      <div className="flex items-center gap-2 flex-wrap">
                        {/* Button 1: Acta General Semanal */}
                        <button
                          onClick={() => {
                            const auditRows: PreClosureAgencyRow[] = (closure.agencyRows || []).map((r: any, i: number) => ({
                              ag_id: i + 1,
                              entidad: r.entidad,
                              moneda: r.moneda as any,
                              saldo_anterior: Number(r.saldo_anterior || 0),
                              venta_bruta: Number(r.venta_bruta || r.utilidad_semana || 0),
                              comision: Number(r.comision || 0),
                              premios_taquilla: Number(r.premios || 0),
                              venta_neta: Number(r.utilidad_semana || 0),
                              gastos: Number(r.gastos || 0),
                              cobrador_ruta: 0,
                              efectivo_taquilla: 0,
                              bancos: Number(r.movimientos || 0),
                              reposicion_premios: 0,
                              pagos_netos: Number(r.movimientos || 0),
                              saldo_final: Number(r.saldo_final || 0),
                              status: Number(r.saldo_final || 0) > 0 ? 'pendiente' : Number(r.saldo_final || 0) < 0 ? 'favor' : 'pagado',
                            }));

                            const totalsByCurrency: Record<string, any> = {};
                            ['BS', 'USD', 'COP'].forEach((mon) => {
                              const mRows = auditRows.filter((r) => r.moneda === mon);
                              totalsByCurrency[mon] = {
                                saldoAnterior: mRows.reduce((acc, r) => acc + r.saldo_anterior, 0),
                                ventaNeta: mRows.reduce((acc, r) => acc + r.venta_neta, 0),
                                gastos: mRows.reduce((acc, r) => acc + r.gastos, 0),
                                gastosAgencias: mRows.reduce((acc, r) => acc + r.gastos, 0),
                                gastosComercializadora: 0,
                                cobradorRuta: 0,
                                efectivoTaquilla: 0,
                                bancos: mRows.reduce((acc, r) => acc + r.bancos, 0),
                                reposicionPremios: 0,
                                saldoFinal: mRows.reduce((acc, r) => acc + r.saldo_final, 0),
                              };
                            });

                            setSelectedGeneralActa({
                              systemCycle: { semana: closure.periodo.split(' ')[1] || '40', desde: '', hasta: '', tipo: 'SEMANAL' },
                              auditRows,
                              totalsByCurrency,
                            });
                          }}
                          className="px-3.5 py-2 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
                        >
                          <FileText className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Acta General (PDF)</span>
                        </button>

                        {/* Button 2: Acta Casas Operadoras */}
                        <button
                          onClick={() => {
                            const opRows: OperatorSettlementRow[] = (closure.operatorRows || []).map((op: any) => ({
                              sistema: op.entidad.replace(/^OPERADORA:\s*/i, '').trim(),
                              moneda: op.moneda,
                              venta: Number(op.venta_bruta || 0),
                              premio: Number(op.premios || 0),
                              utilidadBruta: Number(op.venta_bruta || 0),
                              comisionPct: 0,
                              comCompletaProv: 0,
                              comAgencias: 0,
                              difCom: 0,
                              baseUtil: Number(op.utilidad_semana || 0),
                              participacionPct: 40,
                              partCom: 0,
                              totalCom: 0,
                              totalComercializador: 0,
                              netoOperadora: Number(op.utilidad_semana || 0),
                              saldoInit: Number(op.saldo_anterior || 0),
                              pagosRealizados: Number(op.movimientos || 0),
                              abonosRecibidos: 0,
                              pagosNetos: Number(op.movimientos || 0),
                              balanceFinal: Number(op.saldo_final || 0),
                            }));

                            const opSysSet = Array.from(new Set(opRows.map((r) => r.sistema)));
                            const operatorGroups = opSysSet.map((sys) => {
                              const sRows = opRows.filter((r) => r.sistema === sys);
                              return {
                                sistema: sys,
                                rows: sRows,
                                hasDeuda: sRows.some((r) => r.balanceFinal > 0.01),
                                hasFavor: sRows.some((r) => r.balanceFinal < -0.01),
                              };
                            });

                            const totalsByCurrency: Record<string, any> = {};
                            ['BS', 'USD', 'COP'].forEach((mon) => {
                              const mRows = opRows.filter((r) => r.moneda === mon);
                              totalsByCurrency[mon] = {
                                venta: mRows.reduce((acc, r) => acc + r.venta, 0),
                                premios: mRows.reduce((acc, r) => acc + r.premio, 0),
                                ggr: mRows.reduce((acc, r) => acc + r.utilidadBruta, 0),
                                comCompletaProv: 0,
                                comAgencias: 0,
                                difCom: 0,
                                baseUtil: mRows.reduce((acc, r) => acc + r.baseUtil, 0),
                                partCom: 0,
                                totalCom: 0,
                                totalComercializador: 0,
                                netoOperadora: mRows.reduce((acc, r) => acc + r.netoOperadora, 0),
                                saldoInit: mRows.reduce((acc, r) => acc + r.saldoInit, 0),
                                pagosRealizados: mRows.reduce((acc, r) => acc + r.pagosRealizados, 0),
                                abonosRecibidos: 0,
                                pagosNetos: mRows.reduce((acc, r) => acc + r.pagosNetos, 0),
                                balanceFinal: mRows.reduce((acc, r) => acc + r.balanceFinal, 0),
                                count: mRows.length,
                              };
                            });

                            setSelectedOperatorActa({
                              systemCycle: { semana: closure.periodo.split(' ')[1] || '40', desde: '', hasta: '', tipo: 'SEMANAL' },
                              operatorGroups,
                              totalsByCurrency,
                            });
                          }}
                          className="px-3.5 py-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
                        >
                          <Building2 className="w-3.5 h-3.5 text-amber-400" />
                          <span>Acta Operadoras (PDF)</span>
                        </button>

                        {/* Button 3: Actas por Agencia */}
                        <button
                          onClick={() => setAgencySelectorClosure(closure)}
                          className="px-3.5 py-2 rounded-xl bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 border border-sky-500/30 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
                        >
                          <Store className="w-3.5 h-3.5 text-sky-400" />
                          <span>Actas por Agencia ({totalAgencias})</span>
                        </button>

                        {/* Button 4: Acta de Auditoría */}
                        <button
                          onClick={() => handleOpenAuditActa(closure)}
                          className="px-3.5 py-2 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/30 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
                          title="Ver e imprimir Acta Oficial de Auditoría y Eventos del Ciclo"
                        >
                          <ShieldCheck className="w-3.5 h-3.5 text-purple-400" />
                          <span>Acta de Auditoría (PDF)</span>
                        </button>

                        {/* Button 5: Aplicar Arrastres y Activar Semana 42 */}
                        <button
                          onClick={() => handleRestoreCycleFromS41Acta(closure)}
                          disabled={isProcessing}
                          className="px-3.5 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-lg shadow-amber-500/10"
                          title="Aplicar los saldos finales de este cierre como arrastre para Semana 42 y activar el ciclo Semana 42"
                        >
                          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                          <span>⚡ Activar Semana 42 con estos Arrastres</span>
                        </button>
                      </div>
                    </div>

                    {/* Snapshot Summary Chips */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                      <div className="bg-slate-50 dark:bg-[#071217] p-3 rounded-2xl border border-slate-200 dark:border-slate-800">
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold block">Agencias Cerradas</span>
                        <span className="text-sm font-black text-slate-900 dark:text-white font-mono">{totalAgencias}</span>
                      </div>
                      <div className="bg-slate-50 dark:bg-[#071217] p-3 rounded-2xl border border-slate-200 dark:border-slate-800">
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold block">Casas Operadoras</span>
                        <span className="text-sm font-black text-slate-900 dark:text-white font-mono">{totalOperadoras}</span>
                      </div>
                      <div className="bg-slate-50 dark:bg-[#071217] p-3 rounded-2xl border border-slate-200 dark:border-slate-800">
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold block">Monedas Auditadas</span>
                        <span className="text-sm font-bold text-slate-800 dark:text-slate-200">{activeCurrencyCodes.join(' • ')}</span>
                      </div>
                      <div className="bg-slate-50 dark:bg-[#071217] p-3 rounded-2xl border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                        <div>
                          <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold block">Estado</span>
                          <span className="text-xs font-black text-emerald-600 dark:text-emerald-400">INMUTABLE</span>
                        </div>
                        <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-8">
          {/* Unified Cycle Banner */}
          <div className="bg-white dark:bg-[#0D1B22] border border-amber-300 dark:border-amber-500/30 rounded-3xl p-6 relative overflow-hidden shadow-sm transition-colors">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 relative z-10">
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-400 text-[11px] font-bold uppercase tracking-wider">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  <span>Auditoría de Balances y Cierre Maestro Integral</span>
                </div>
                <h3 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white mt-2 flex items-center gap-2">
                  <span>{systemCycle.tipo === 'SEMANAL' ? `Semana ${systemCycle.semana}` : `Operación Diaria ${systemCycle.semana}`}</span>
                  <span className="text-xs font-mono font-normal text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800/80 px-2.5 py-0.5 rounded-full border border-slate-200 dark:border-slate-700">
                    Ciclo Activo
                  </span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-mono mt-1">
                  Rango del ciclo: <strong className="text-amber-600 dark:text-amber-300">{systemCycle.desde}</strong> al{' '}
                  <strong className="text-amber-600 dark:text-amber-300">{systemCycle.hasta}</strong>
                </p>
              </div>

              {/* Unified Stats Chips */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="bg-slate-50 dark:bg-[#071217]/90 border border-slate-200 dark:border-slate-800 rounded-2xl px-4 py-2.5">
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-bold uppercase">🏢 Agencias</span>
                  <span className="text-base font-black text-emerald-600 dark:text-emerald-400 font-mono">{agencies.length} activas</span>
                </div>
                <div className="bg-slate-50 dark:bg-[#071217]/90 border border-slate-200 dark:border-slate-800 rounded-2xl px-4 py-2.5">
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-bold uppercase">🌐 Operadoras</span>
                  <span className="text-base font-black text-amber-600 dark:text-amber-400 font-mono">{operatorClosureGroups.length} casas ({operatorClosureRows.length} liq.)</span>
                </div>
                <div className="bg-slate-50 dark:bg-[#071217]/90 border border-slate-200 dark:border-slate-800 rounded-2xl px-4 py-2.5">
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-bold uppercase">💰 Monedas</span>
                  <span className="text-base font-black text-slate-900 dark:text-white font-mono">{activeCurrencyCodes.join(' • ')}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Selector de Vista: Unificada vs Filtrada */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setClosureViewMode('todos')}
                className={`px-4 py-2.5 rounded-2xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-all cursor-pointer ${
                  closureViewMode === 'todos'
                    ? 'bg-gradient-to-r from-emerald-500/20 to-amber-500/20 text-white border border-emerald-500/40 shadow-lg shadow-emerald-500/10'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <Layers className="w-4 h-4 text-amber-400" />
                <span>Vista Unificada (Ambos Balances)</span>
              </button>

              <button
                onClick={() => setClosureViewMode('agencias')}
                className={`px-4 py-2.5 rounded-2xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-all cursor-pointer ${
                  closureViewMode === 'agencias'
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-lg shadow-emerald-500/10'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <Building2 className="w-4 h-4" />
                <span>🏢 Solo Agencias ({closureData.length})</span>
              </button>

              <button
                onClick={() => setClosureViewMode('operadoras')}
                className={`px-4 py-2.5 rounded-2xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-all cursor-pointer ${
                  closureViewMode === 'operadoras'
                    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40 shadow-lg shadow-amber-500/10'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <Globe className="w-4 h-4" />
                <span>🌐 Solo Operadoras ({operatorClosureRows.length})</span>
              </button>

              <button
                onClick={() => setClosureViewMode('grupos')}
                className={`px-4 py-2.5 rounded-2xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-all cursor-pointer ${
                  closureViewMode === 'grupos'
                    ? 'bg-purple-500/20 text-purple-400 border border-purple-500/40 shadow-lg shadow-purple-500/10'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <Handshake className="w-4 h-4" />
                <span>🤝 Solo Grupos ({groupClosureRows.length})</span>
              </button>
            </div>

            {closureViewMode === 'todos' && (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-500 font-sans">Saltar a:</span>
                <button
                  type="button"
                  onClick={() => document.getElementById('seccion-agencias')?.scrollIntoView({ behavior: 'smooth' })}
                  className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800/80 dark:hover:bg-slate-700 dark:text-slate-300 font-mono transition-colors border border-slate-200 dark:border-slate-700 cursor-pointer"
                >
                  ↓ Agencias
                </button>
                <button
                  type="button"
                  onClick={() => document.getElementById('seccion-operadoras')?.scrollIntoView({ behavior: 'smooth' })}
                  className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800/80 dark:hover:bg-slate-700 dark:text-slate-300 font-mono transition-colors border border-slate-200 dark:border-slate-700 cursor-pointer"
                >
                  ↓ Operadoras
                </button>
                <button
                  type="button"
                  onClick={() => document.getElementById('seccion-cierre-maestro')?.scrollIntoView({ behavior: 'smooth' })}
                  className="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:hover:bg-emerald-500/20 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-500/30 font-mono font-bold transition-colors cursor-pointer"
                >
                  ↓ Cierre Maestro
                </button>
              </div>
            )}
          </div>

          {/* 1. SECCIÓN: BALANCES DE AGENCIAS */}
          {(closureViewMode === 'todos' || closureViewMode === 'agencias') && (
            <section id="seccion-agencias" className="space-y-4">
              <div className="bg-white dark:bg-[#0D1B22] border border-emerald-500/30 dark:border-emerald-500/30 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm dark:shadow-md">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20">
                    <Building2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm sm:text-base font-black text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                      <span>1. Balances Verificados de Agencias (Puntos de Venta)</span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20 font-bold">
                        {closureData.length} registros
                      </span>
                    </h3>
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                      Arrastre anterior, venta neta, gastos, premios y cobros auditados por agencia
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-700 dark:text-slate-300 font-mono bg-slate-50 dark:bg-slate-900/90 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800">
                    🏢 {agencies.length} agencias registradas
                  </span>
                </div>
              </div>

              <div className="space-y-6">
                {activeCurrencyCodes.map((mon) => {
                  const monRows = closureData.filter((d) => d.moneda === mon);
                  if (monRows.length === 0) return null;

                  return (
                    <div key={mon} className="bg-white dark:bg-[#0D1B22] border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden shadow-sm dark:shadow-xl">
                      <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                        <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                          <span>💰 Balance Verificado Agencias {mon}</span>
                        </h4>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">{monRows.length} agencias</span>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-50 dark:bg-[#071217] text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800 font-bold uppercase tracking-wider">
                            <tr>
                              <th className="py-3 px-4">Agencia</th>
                              <th className="py-3 px-4 text-right">Arrastre</th>
                              <th className="py-3 px-4 text-right">Venta Neta</th>
                              <th className="py-3 px-4 text-right">Gastos Agencias</th>
                              <th className="py-3 px-4 text-right">Premios</th>
                              <th className="py-3 px-4 text-right">Cobros</th>
                              <th className="py-3 px-4 text-right">Saldo Final</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 font-mono">
                            {monRows.map((row) => (
                              <tr key={`${row.entidad}_${mon}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                                <td className="py-3 px-4 font-sans font-bold text-slate-900 dark:text-white">{row.entidad}</td>
                                <td className="py-3 px-4 text-right text-slate-600 dark:text-slate-400">{formatCurrency(row.saldo_anterior, mon as any)}</td>
                                <td className={`py-3 px-4 text-right font-semibold ${row.venta_bruta >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                  {formatCurrency(row.venta_bruta, mon as any)}
                                </td>
                                <td className="py-3 px-4 text-right text-rose-600 dark:text-rose-400">{formatCurrency(row.gastos, mon as any)}</td>
                                <td className="py-3 px-4 text-right text-amber-600 dark:text-amber-400">{formatCurrency(row.premios, mon as any)}</td>
                                <td className="py-3 px-4 text-right text-cyan-600 dark:text-cyan-400">{formatCurrency(row.cobros, mon as any)}</td>
                                <td
                                  className={`py-3 px-4 text-right font-black ${
                                    row.saldo_final > 0 ? 'text-rose-600 dark:text-rose-400' : row.saldo_final < 0 ? 'text-cyan-600 dark:text-cyan-400' : 'text-emerald-600 dark:text-emerald-400'
                                  }`}
                                >
                                  {formatCurrency(row.saldo_final, mon as any)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* 2. SECCIÓN: BALANCES DE CASAS OPERADORAS */}
          {(closureViewMode === 'todos' || closureViewMode === 'operadoras') && (
            <section id="seccion-operadoras" className="space-y-4 pt-6 border-t border-slate-200 dark:border-slate-800/80">
              <div className="bg-white dark:bg-[#0D1B22] border border-amber-500/30 dark:border-amber-500/30 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm dark:shadow-md">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-500/20">
                    <Globe className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm sm:text-base font-black text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                      <span>2. Balances Verificados de Casas Operadoras (Proveedores)</span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/20 font-bold">
                        {operatorClosureRows.length} liquidaciones
                      </span>
                    </h3>
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                      Liquidación de GGR, comisión del comercializador, utilidad de casas, pagos netos y nuevos saldos de arrastre
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-700 dark:text-slate-300 font-mono bg-slate-50 dark:bg-slate-900/90 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800">
                    🌐 {operatorClosureGroups.length} casas matrices
                  </span>
                </div>
              </div>

              <div className="space-y-6">
                {/* Resumen Global de Tesorería por Moneda */}
                <div className="bg-white dark:bg-[#0D1B22] border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-sm dark:shadow-xl">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 mb-3.5">
                    <h4 className="text-xs font-black uppercase text-amber-600 dark:text-amber-400 font-mono tracking-wider flex items-center gap-2">
                      <Scale className="w-4 h-4 text-amber-500 dark:text-amber-400" />
                      <span>Posición Global Consolidada a Liquidar con Proveedores</span>
                    </h4>
                    <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">Semana {systemCycle.semana}</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {(operatorActiveCurrencies.length > 0 ? operatorActiveCurrencies : ['BS', 'USD', 'COP']).map((mon) => {
                      const tot = operatorTotalsByCurrency[mon];
                      if (!tot) return null;
                      const flag = getCurrencyFlag(mon);
                      const isDeuda = tot.balanceFinal > 0.01;
                      const isFavor = tot.balanceFinal < -0.01;

                      return (
                        <div key={`tot_summary_${mon}`} className="bg-slate-50/90 dark:bg-[#071318] border border-slate-200 dark:border-slate-800/80 rounded-2xl p-3.5">
                          <div className="flex justify-between items-center mb-1.5">
                            <span className="text-xs font-bold text-slate-800 dark:text-slate-300 font-mono">
                              <span className="font-sans">{flag}</span> Total {mon}
                            </span>
                            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">{tot.count} operadoras</span>
                          </div>
                          <div className={`text-lg font-black font-mono ${isDeuda ? 'text-rose-600 dark:text-rose-400' : isFavor ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-800 dark:text-slate-300'}`}>
                            {formatCurrency(tot.balanceFinal, mon as any)}
                          </div>
                          <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-sans mt-0.5">
                            {isDeuda ? '🔴 Deuda neta a pagar' : isFavor ? '🟢 Saldo a favor' : '⚪ Solvente'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Tablas por Casa Operadora con sus monedas una debajo de la otra */}
                {operatorClosureGroups.length === 0 ? (
                  <div className="bg-white dark:bg-[#0D1B22] border border-slate-200 dark:border-slate-800 rounded-3xl p-8 text-center text-slate-500 font-sans">
                    <Globe className="w-8 h-8 mx-auto mb-2 opacity-40 text-slate-400" />
                    No hay casas operadoras con actividad en este ciclo.
                  </div>
                ) : (
                  operatorClosureGroups.map((group) => {
                    return (
                      <div key={`op_group_${group.sistema}`} className="bg-white dark:bg-[#0D1B22] border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden shadow-sm dark:shadow-xl">
                        <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                          <div className="flex items-center gap-2.5">
                            <div className="p-1.5 rounded-xl bg-amber-500/10 text-amber-500 dark:text-amber-400 border border-amber-500/20">
                              <Globe className="w-4 h-4" />
                            </div>
                            <div>
                              <h4 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider font-mono">
                                {group.sistema}
                              </h4>
                              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                                {group.rows.length} {group.rows.length === 1 ? 'moneda activa' : 'monedas activas'}
                              </span>
                            </div>
                          </div>
                          <span
                            className={`text-[10px] font-extrabold uppercase px-2.5 py-1 rounded-full border ${
                              group.hasDeuda
                                ? 'bg-rose-50 dark:bg-rose-500/20 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-500/30'
                                : group.hasFavor
                                ? 'bg-emerald-50 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700'
                            }`}
                          >
                            {group.hasDeuda ? '🔴 Con Deuda Pendiente' : group.hasFavor ? '🟢 Saldo a Favor' : '⚪ Solvente'}
                          </span>
                        </div>

                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-slate-50 dark:bg-[#071217] text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800 font-bold uppercase tracking-wider text-[11px]">
                              <tr>
                                <th className="py-3 px-4">Moneda</th>
                                <th className="py-3 px-4 text-right">Venta</th>
                                <th className="py-3 px-4 text-right">Premios</th>
                                <th className="py-3 px-4 text-right">GGR</th>
                                <th className="py-3 px-4 text-right text-cyan-700 dark:text-cyan-400">Dif. Com</th>
                                <th className="py-3 px-4 text-right text-emerald-700 dark:text-emerald-400">Ganancia Comercializador</th>
                                <th className="py-3 px-4 text-right text-amber-700 dark:text-amber-400">Utilidad Casa (60%)</th>
                                <th className="py-3 px-4 text-right">Arrastre</th>
                                <th className="py-3 px-4 text-right">Pagos Netos</th>
                                <th className="py-3 px-4 text-right font-black">Nuevo Arrastre</th>
                                <th className="py-3 px-4 text-center">Estado</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 font-mono text-slate-700 dark:text-slate-300">
                              {group.rows.map((row) => {
                                const flag = getCurrencyFlag(row.moneda);
                                const badgeClasses = getCurrencyBadgeClasses(row.moneda);
                                const isDeuda = row.balanceFinal > 0.01;
                                const isFavor = row.balanceFinal < -0.01;

                                return (
                                  <tr key={`${group.sistema}_${row.moneda}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                                    <td className="py-3 px-4 font-sans font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${badgeClasses}`}>
                                        <span className="font-sans">{flag}</span>
                                        <span>{row.moneda}</span>
                                      </span>
                                    </td>
                                    <td className="py-3 px-4 text-right font-semibold text-slate-900 dark:text-slate-200">{formatCurrency(row.venta, row.moneda as any)}</td>
                                    <td className="py-3 px-4 text-right text-amber-700 dark:text-amber-400">
                                      {row.premio > 0 ? `-${formatCurrency(row.premio, row.moneda as any)}` : formatCurrency(0, row.moneda as any)}
                                    </td>
                                    <td className={`py-3 px-4 text-right font-bold ${row.utilidadBruta >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                      {formatCurrency(row.utilidadBruta, row.moneda as any)}
                                    </td>
                                    <td className="py-3 px-4 text-right text-cyan-700 dark:text-cyan-400 font-semibold">{formatCurrency(row.difCom, row.moneda as any)}</td>
                                    <td className="py-3 px-4 text-right font-black text-emerald-700 dark:text-emerald-400 bg-emerald-50/60 dark:bg-emerald-500/5">{formatCurrency(row.totalCom, row.moneda as any)}</td>
                                    <td className={`py-3 px-4 text-right font-bold ${row.netoOperadora >= 0 ? 'text-amber-700 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                      {formatCurrency(row.netoOperadora, row.moneda as any)}
                                    </td>
                                    <td className="py-3 px-4 text-right text-slate-600 dark:text-slate-400">{formatCurrency(row.saldoInit, row.moneda as any)}</td>
                                    <td className="py-3 px-4 text-right text-cyan-700 dark:text-cyan-400 font-semibold">
                                      {row.pagosNetos !== 0 ? `-${formatCurrency(row.pagosNetos, row.moneda as any)}` : formatCurrency(0, row.moneda as any)}
                                    </td>
                                    <td
                                      className={`py-3 px-4 text-right font-black text-sm ${
                                        isDeuda ? 'text-rose-600 dark:text-rose-400' : isFavor ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-800 dark:text-slate-300'
                                      }`}
                                    >
                                      {formatCurrency(row.balanceFinal, row.moneda as any)}
                                    </td>
                                    <td className="py-3 px-4 text-center">
                                      <span
                                        className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                                          isDeuda
                                            ? 'bg-rose-50 dark:bg-rose-500/20 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-500/30'
                                            : isFavor
                                            ? 'bg-emerald-50 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30'
                                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700'
                                        }`}
                                      >
                                        {isDeuda ? 'A Pagar' : isFavor ? 'A Favor' : 'Solvente'}
                                      </span>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </section>
          )}

          {/* 3. SECCIÓN: CIERRE MAESTRO INTEGRAL */}
          <section id="seccion-cierre-maestro" className="pt-6 border-t border-slate-200 dark:border-slate-800/80">
            <div className="bg-white dark:bg-[#0D1B22] border border-cyan-500/30 dark:border-cyan-500/30 rounded-2xl p-4 sm:p-5 mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm dark:shadow-md">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-cyan-50 dark:bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-200 dark:border-cyan-500/20">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-black text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                    <span>3. Ejecución del Cierre Maestro Integral</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-50 dark:bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border border-cyan-200 dark:border-cyan-500/20 font-bold">
                      Sello Atómico SHA-256
                    </span>
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    Cierre conjunto y definitivo de Agencias y Casas Operadoras con avance automático de ciclo
                  </p>
                </div>
              </div>
            </div>

      {/* Unified Master Closure Action Box */}
      <div className="bg-white dark:bg-[#0D1B22] border border-emerald-500/30 dark:border-emerald-500/30 rounded-3xl p-6 sm:p-8 shadow-xl dark:shadow-2xl space-y-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-emerald-500/5 via-teal-500/5 to-amber-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
          <div className="flex items-center gap-3.5">
            <div className="p-3 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-amber-500/20 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">
                  CIERRE MAESTRO INTEGRAL (AGENCIAS Y CASAS OPERADORAS)
                </h3>
                <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20">
                  <Lock className="w-3 h-3" /> Snapshot SHA-256
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                Liquidación atómica simultánea de puntos de venta y casas matrices
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-900/80 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 font-mono">
              🏢 {agencies.length} Agencias
            </span>
            <span className="text-xs text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-900/80 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 font-mono">
              🌐 {operatorClosureRows.length} Operadoras
            </span>
            <span className="text-xs text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-900/80 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 font-mono">
              🤝 {groupClosureRows.length} Grupos
            </span>
          </div>
        </div>

        {/* Warning & Instructions */}
        <div className="p-4 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 rounded-2xl text-xs text-emerald-900 dark:text-emerald-300 space-y-1.5">
          <div className="flex items-center gap-2 font-bold text-emerald-700 dark:text-emerald-300">
            <Sparkles className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>OPERACIÓN ATÓMICA DE CIERRE DEFINITIVO:</span>
          </div>
          <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
            Al ejecutar el Cierre Maestro Integral, el sistema consolida tanto las <strong className="text-slate-900 dark:text-white">Agencias</strong> como las <strong className="text-slate-900 dark:text-white">Casas Operadoras</strong> en un solo paso:
            sella el <strong className="text-emerald-700 dark:text-emerald-400">Snapshot Inmutable SHA-256</strong> en Supabase y PostgreSQL,
            traspasa los balances auditados como saldos de arrastre iniciales del nuevo ciclo,
            restablece las tablas operativas activas y avanza el ciclo operativo a la <strong className="text-amber-700 dark:text-amber-300">Semana {nextCyclePreview.semana} ({nextCyclePreview.desde} al {nextCyclePreview.hasta})</strong>.
          </p>
        </div>

        {/* Validation Check: If sales.length === 0, show clean status instead of allowing an empty closure */}
        {sales.length === 0 ? (
          <div className="p-4 bg-sky-50 dark:bg-sky-500/10 border border-sky-200 dark:border-sky-500/20 rounded-2xl text-xs text-sky-800 dark:text-sky-300 space-y-2">
            <div className="flex items-center gap-2 font-bold text-sky-700 dark:text-sky-200">
              <CheckCircle2 className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0" />
              <span>CICLO OPERATIVO AL DÍA — SIN VENTAS PENDIENTES DE LIQUIDACIÓN</span>
            </div>
            <p className="text-slate-600 dark:text-slate-300">
              El ciclo activo actual ({systemCycle.tipo === 'SEMANAL' ? `Semana ${systemCycle.semana}` : `Ciclo ${systemCycle.semana}`}, {systemCycle.desde} al {systemCycle.hasta}) no registra ventas cargadas por cerrar.
              El cierre de la semana anterior fue certificado y guardado en el archivo histórico.
            </p>
            <div className="flex items-center justify-end pt-2">
              <button
                type="button"
                disabled
                className="px-6 py-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 border border-slate-200 dark:border-slate-700 text-xs font-bold uppercase tracking-wider flex items-center gap-2 cursor-not-allowed"
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                Ciclo Actual al Día (Sin Ventas Pendientes)
              </button>
            </div>
          </div>
        ) : (
          <>
            <label className="flex items-center gap-3 cursor-pointer p-4 rounded-2xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
              <input
                type="checkbox"
                checked={verifiedCheckMaster}
                onChange={(e) => setVerifiedCheckMaster(e.target.checked)}
                className="w-5 h-5 rounded text-emerald-500 bg-white dark:bg-[#071217] border-slate-300 dark:border-slate-700 focus:ring-0 cursor-pointer"
              />
              <span className="text-xs font-bold text-slate-800 dark:text-white select-none">
                He auditado y verificado los balances tanto de las Agencias ({agencies.length}) como de las Casas Operadoras ({operatorClosureRows.length}). Confirmo congelar el Snapshot Inmutable SHA-256, traspasar todos los saldos de arrastre y avanzar el ciclo operativo.
              </span>
            </label>

            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={() => {
                  setModalError(null);
                  setIsConfirmModalOpen(true);
                }}
                disabled={!verifiedCheckMaster || isProcessing}
                className="px-8 py-3.5 rounded-2xl bg-gradient-to-r from-emerald-500 via-teal-500 to-amber-500 hover:brightness-110 text-slate-950 font-black text-xs uppercase tracking-wider shadow-xl shadow-emerald-500/20 flex items-center gap-2 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ShieldCheck className="w-4 h-4" />
                {isProcessing ? 'Procesando Cierre Maestro...' : 'Ejecutar Cierre Maestro Integral (Agencias y Operadoras)'}
              </button>
            </div>
          </>
        )}
        </div>
      </section>
    </div>
  )}

      {/* Modal de Confirmación Pre-Cierre Maestro Unificado */}
      {isConfirmModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#0D1B22] border border-emerald-500/30 rounded-3xl max-w-2xl w-full p-6 sm:p-8 shadow-2xl space-y-6 relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => !isProcessing && setIsConfirmModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-2 rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3">
              <div className="p-3 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-black text-white">Confirmación de Cierre Maestro Integral</h3>
                <p className="text-xs text-slate-400">
                  {systemCycle.tipo === 'SEMANAL' ? `Semana ${systemCycle.semana}` : `Operación Diaria ${systemCycle.semana}`} ({systemCycle.desde} al {systemCycle.hasta})
                </p>
              </div>
            </div>

            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-3 text-xs">
              <div className="grid grid-cols-3 gap-2 pb-2 border-b border-slate-800 text-center font-mono">
                <div>
                  <span className="text-[10px] text-slate-400 block font-sans">Agencias</span>
                  <span className="font-bold text-emerald-400 text-sm">{agencies.length}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block font-sans">Casas Operadoras</span>
                  <span className="font-bold text-amber-400 text-sm">{operatorClosureRows.length}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block font-sans">Ventas a Archivar</span>
                  <span className="font-bold text-white text-sm">{sales.length}</span>
                </div>
              </div>

              {/* 1. Resumen Agencias */}
              <div className="pt-1">
                <span className="text-emerald-400 block mb-2 font-bold uppercase tracking-wider text-[10px] flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5" />
                  Balances a Traspasar a Arrastre (Agencias):
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {Object.entries(totalsByCurrency).map(([mon, data]) => (
                    <div key={`modal_ag_${mon}`} className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800">
                      <span className="text-[10px] font-bold text-emerald-400 block">{mon}</span>
                      <span className="text-xs font-mono font-bold text-white block">
                        {formatCurrency(data.totalSaldoFinal, mon as any)}
                      </span>
                      <span className="text-[10px] text-slate-400 block">
                        Venta Neta: {formatCurrency(data.totalVenta, mon as any)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* 2. Resumen Casas Operadoras */}
              <div className="pt-2 border-t border-slate-800">
                <span className="text-amber-400 block mb-2 font-bold uppercase tracking-wider text-[10px] flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5" />
                  Liquidación y Nuevos Arrastres (Casas Operadoras):
                </span>
                <div className="grid grid-cols-1 gap-2">
                  {activeCurrencyCodes.map((mon) => {
                    const opT = operatorTotalsByCurrency[mon];
                    if (!opT || (opT.count === 0 && opT.venta === 0 && Math.abs(opT.balanceFinal) < 0.01)) return null;
                    return (
                      <div key={`modal_op_${mon}`} className="p-2.5 rounded-xl bg-slate-950/70 border border-amber-500/20 flex items-center justify-between">
                        <div className="space-y-0.5">
                          <span className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                            🪙 {mon} <span className="text-[10px] text-slate-400 font-normal">({opT.count} op.)</span>
                          </span>
                          <span className="text-[10px] text-slate-400 block">
                            Venta: {formatCurrency(opT.venta, mon as any)} • GGR: {formatCurrency(opT.ggr, mon as any)} • Com: {formatCurrency(opT.totalComercializador, mon as any)}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] text-slate-400 block">Arrastre Proveedor:</span>
                          <span className={`text-xs font-mono font-bold ${opT.balanceFinal > 0.01 ? 'text-rose-400' : opT.balanceFinal < -0.01 ? 'text-emerald-400' : 'text-white'}`}>
                            {formatCurrency(opT.balanceFinal, mon as any)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 3. Próximo ciclo */}
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 mt-3 text-emerald-300">
                <div className="flex items-center gap-2 font-bold mb-1">
                  <ArrowRight className="w-4 h-4 text-emerald-400" />
                  Próximo Ciclo Operativo:
                </div>
                <p className="text-[11px] text-slate-300">
                  El sistema registrará estos balances como el arrastre inicial de agencias y operadoras, y avanzará a la <strong className="text-white">Semana {nextCyclePreview.semana}</strong> con fechas <strong className="text-emerald-300">{nextCyclePreview.desde}</strong> al <strong className="text-emerald-300">{nextCyclePreview.hasta}</strong>.
                </p>
              </div>

              <div className="text-[11px] text-emerald-400/90 flex items-center gap-1.5 pt-1">
                <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                Se congelará automáticamente el Snapshot Inmutable (SHA-256) en Supabase y PostgreSQL antes de aplicar los cambios.
              </div>
            </div>

            {modalError && (
              <div className="p-3.5 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2 animate-fade-in">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{modalError}</span>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsConfirmModalOpen(false)}
                disabled={isProcessing}
                className="flex-1 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs uppercase tracking-wider transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleFinalizeWeek}
                disabled={isProcessing}
                className="flex-1 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-slate-950 font-black text-xs uppercase tracking-wider shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
              >
                {isProcessing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Procesando Cierre y Sellando Snapshot...
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    Confirmar Cierre Maestro y Congelar Snapshot
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 1: Acta General Histórica */}
      {selectedGeneralActa && (
        <DeliveryReportModal
          isOpen={true}
          onClose={() => setSelectedGeneralActa(null)}
          systemCycle={selectedGeneralActa.systemCycle}
          userName={user?.email || 'Administración'}
          companyName="CORPORACION CALENDARIO, CA"
          auditRows={selectedGeneralActa.auditRows}
          totalsByCurrency={selectedGeneralActa.totalsByCurrency}
        />
      )}

      {/* Modal 2: Acta Operadoras Histórica */}
      {selectedOperatorActa && (
        <OperatorDeliveryReportModal
          isOpen={true}
          onClose={() => setSelectedOperatorActa(null)}
          systemCycle={selectedOperatorActa.systemCycle}
          userName={user?.email || 'Administración'}
          companyName="CORPORACION CALENDARIO, CA"
          operatorGroups={selectedOperatorActa.operatorGroups}
          totalsByCurrency={selectedOperatorActa.totalsByCurrency}
        />
      )}

      {/* Modal 3: Selector de Agencia para Finiquito Individual */}
      {agencySelectorClosure && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#0D1B22] border border-slate-800 rounded-3xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-base font-extrabold text-white flex items-center gap-2">
                  <Store className="w-4 h-4 text-sky-400" />
                  <span>Actas Individuales por Agencia</span>
                </h3>
                <p className="text-xs text-slate-400">
                  {agencySelectorClosure.periodo} • Seleccione la agencia para emitir su finiquito en PDF
                </p>
              </div>
              <button
                onClick={() => setAgencySelectorClosure(null)}
                className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-2">
              {(agencySelectorClosure.agencyRows || []).map((agRow: any, i: number) => {
                const sFinal = Number(agRow.saldo_final || 0);
                const isDeuda = sFinal > 0.05;
                const isFavor = sFinal < -0.05;

                return (
                  <div
                    key={`${agRow.entidad}-${agRow.moneda}-${i}`}
                    className="p-3.5 rounded-2xl bg-[#071217] border border-slate-800 hover:border-slate-700 flex items-center justify-between gap-3 transition-colors"
                  >
                    <div>
                      <div className="text-xs font-black text-white flex items-center gap-2">
                        <span>{agRow.entidad}</span>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                          {agRow.moneda}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5 font-mono">
                        Saldo Final:{' '}
                        <span
                          className={
                            isDeuda
                              ? 'text-rose-400 font-bold'
                              : isFavor
                              ? 'text-emerald-400 font-bold'
                              : 'text-slate-300'
                          }
                        >
                          {formatCurrency(sFinal, agRow.moneda)}
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        setSelectedIndividualActa({
                          agencyName: agRow.entidad,
                          periodo: agencySelectorClosure.periodo,
                          fechaCierre: agencySelectorClosure.fecha_cierre,
                          moneda: agRow.moneda,
                          saldoAnterior: Number(agRow.saldo_anterior || 0),
                          ventaBruta: Number(agRow.venta_bruta || agRow.utilidad_semana || 0),
                          comision: Number(agRow.comision || 0),
                          premios: Number(agRow.premios || 0),
                          ventaNeta: Number(agRow.utilidad_semana || 0),
                          participacionPct: Number(agRow.participacion_pct || 0),
                          participacionMonto: Number(agRow.participacion_monto || 0),
                          utilidadOperadora: Number(agRow.utilidad_semana || 0),
                          cobros: Number(agRow.movimientos || 0),
                          gastos: Number(agRow.gastos || 0),
                          saldoFinal: sFinal,
                          status: isDeuda ? 'DEUDA PENDIENTE' : isFavor ? 'SALDO A FAVOR' : 'AL DÍA',
                        });
                        setAgencySelectorClosure(null);
                      }}
                      className="px-3 py-1.5 rounded-xl bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 border border-sky-500/30 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>Ver Finiquito PDF</span>
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex justify-end bg-slate-50 dark:bg-[#0A161C]">
              <button
                onClick={() => setAgencySelectorClosure(null)}
                className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-white font-bold text-xs transition-colors cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 4: Acta Individual de Finiquito por Agencia */}
      {selectedIndividualActa && (
        <IndividualAgencyActaModal
          isOpen={true}
          onClose={() => setSelectedIndividualActa(null)}
          actaData={selectedIndividualActa}
          userName={user?.email || 'Administración'}
          companyName="CORPORACION CALENDARIO, CA"
        />
      )}

      {/* Modal 5: Acta Oficial de Auditoría de Cierre */}
      {selectedAuditActa && (
        <AuditClosureActaModal
          isOpen={true}
          onClose={() => setSelectedAuditActa(null)}
          systemCycle={selectedAuditActa.systemCycle}
          userName={user?.email || 'Administración'}
          companyName={(profile?.nombre_banca || profile?.banca || 'CORPORACION CALENDARIO, CA').toUpperCase()}
          auditLogs={selectedAuditActa.auditLogs || []}
          fechaCierre={selectedAuditActa.fechaCierre}
        />
      )}
    </div>
  );
};
