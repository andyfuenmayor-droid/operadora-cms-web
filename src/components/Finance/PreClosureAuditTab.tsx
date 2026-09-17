import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { formatCurrency, formatDate, normalizarMoneda } from '../../utils/formatters';
import {
  getConsolidatedPayments,
  getConsolidatedExpenses,
  type ConsolidatedPaymentItem,
  type ConsolidatedExpenseItem,
} from '../../utils/consolidations';
import type { Agency } from '../../types';
import {
  ShieldCheck,
  RefreshCw,
  Search,
  Filter,
  Download,
  FileText,
  Bike,
  Building2,
  DollarSign,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  Clock,
  ArrowRight,
  TrendingUp,
  Receipt,
  Layers,
  Award,
  Wallet,
  Landmark,
  Banknote,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Eye,
  ExternalLink
} from 'lucide-react';
import { DeliveryReportModal, type PreClosureAgencyRow } from './DeliveryReportModal';
import { ConfirmationOperatorActaModal, type ConfirmationAuditItem } from './ConfirmationOperatorActaModal';
import { CollectorDeliveryActaModal, type CollectorDailyPaymentItem } from './CollectorDeliveryActaModal';
import { BankIncomeActaModal, type BankTransactionAuditItem } from './BankIncomeActaModal';
import { CashDeliveryActaModal, type CashDeliveryAuditItem } from './CashDeliveryActaModal';

export const PreClosureAuditTab: React.FC = () => {
  const { effectiveUserId, systemCycle, user } = useAuth();

  const [isLoading, setIsLoading] = useState(true);
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [sales, setSales] = useState<any[]>([]);
  const [payments, setPayments] = useState<ConsolidatedPaymentItem[]>([]);
  const [expenses, setExpenses] = useState<ConsolidatedExpenseItem[]>([]);
  const [rawDailyPayments, setRawDailyPayments] = useState<any[]>([]);
  const [collectors, setCollectors] = useState<{ id: string | number; nombre: string; usuario?: string }[]>([]);

  // Filters
  const [selectedCurrency, setSelectedCurrency] = useState<'ALL' | 'BS' | 'USD' | 'COP'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pagado' | 'pendiente' | 'favor'>('all');

  // Inline Row Expansion for Detailed Collector and Confirmation Movements
  const [expandedAgencyKey, setExpandedAgencyKey] = useState<string | null>(null);
  const [drawerTab, setDrawerTab] = useState<'all' | 'cobradores' | 'confirmaciones' | 'gastos' | 'efectivo'>('all');

  // Modals for Actas de Entrega
  const [isActaModalOpen, setIsActaModalOpen] = useState(false);
  const [isConfirmationActaOpen, setIsConfirmationActaOpen] = useState(false);
  const [isCollectorActaOpen, setIsCollectorActaOpen] = useState(false);
  const [isBankIncomeActaOpen, setIsBankIncomeActaOpen] = useState(false);
  const [isCashDeliveryActaOpen, setIsCashDeliveryActaOpen] = useState(false);

  // Load database data
  const loadData = async () => {
    if (!effectiveUserId) return;
    setIsLoading(true);

    try {
      const [agRes, sRes, pConsolidated, gConsolidated, pdRes, cobRes] = await Promise.all([
        supabase.from('agencias').select('*').eq('user_id', effectiveUserId).order('id', { ascending: true }),
        supabase.from('carga_actual').select('*').eq('user_id', effectiveUserId),
        getConsolidatedPayments(effectiveUserId, { fechaDesde: systemCycle.desde, fechaHasta: systemCycle.hasta }),
        getConsolidatedExpenses(effectiveUserId, { fechaDesde: systemCycle.desde, fechaHasta: systemCycle.hasta }),
        supabase.from('cda_pagos_diarios').select('*').eq('user_id', effectiveUserId),
        supabase.from('cda_cobradores').select('*').eq('user_id', effectiveUserId),
      ]);

      setAgencies(agRes.data || []);
      setSales(sRes.data || []);
      setPayments(pConsolidated);
      setExpenses(gConsolidated);
      setRawDailyPayments(pdRes.data || []);
      setCollectors(cobRes.data || []);
    } catch (err) {
      console.error('Error loading pre-closure audit data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [effectiveUserId, systemCycle?.desde, systemCycle?.hasta]);

  // Compute detailed audit rows
  const auditRows = useMemo<PreClosureAgencyRow[]>(() => {
    const list: PreClosureAgencyRow[] = [];
    const currencies: ('BS' | 'USD' | 'COP')[] = ['BS', 'USD', 'COP'];

    currencies.forEach((mon) => {
      const colIni = mon === 'BS' ? 'saldo_inicial_bs' : mon === 'USD' ? 'saldo_inicial_usd' : 'saldo_inicial_cop';

      agencies.forEach((ag) => {
        const nom = String(ag.nombre_agencia || '').trim().toUpperCase();
        const confMon = String(ag.monedas || '').toUpperCase();
        const sAnt = Number(ag[colIni] || 0);

        // Filter sales for this agency and currency
        const agSales = sales.filter((s) => s.agencia === nom && normalizarMoneda(s.moneda) === mon);
        const vtaBruta = agSales.reduce((sum, curr) => sum + Number(curr.venta || curr.monto_ventas || curr.neto || 0), 0);
        const com = agSales.reduce((sum, curr) => sum + Number(curr.comision || 0), 0);
        const premTaq = agSales.reduce((sum, curr) => sum + Number(curr.monto_premios || curr.premios || 0), 0);
        const vtaNeta = agSales.reduce((sum, curr) => sum + Number(curr.neto || curr.util_op || 0), 0);

        if (confMon.includes(mon) || Math.abs(sAnt) > 0.01 || agSales.length > 0) {
          // Gastos confirmados en el ciclo
          const agExp = expenses.filter((g) => g.agencia === nom && normalizarMoneda(g.moneda) === mon && Boolean(g.confirmado));
          const gTot = agExp.reduce((sum, curr) => sum + Number(curr.monto || 0), 0);

          // Segregación de Pagos por Canal restringidos estrictamente al ciclo operativo activo:
          // 1. Cobradores de Ruta (recaudaciones QR de cda_pagos_diarios)
          const agCobradorList = rawDailyPayments.filter((p) => {
            const matchAg = (p.agencia || p.nombre_agency || '').trim().toUpperCase() === nom;
            const matchMon = normalizarMoneda(p.moneda) === mon;
            const isCob = Boolean(p.qr_token) || String(p.tipo_pago || '').toUpperCase().includes('COBRADOR');
            const isConf = Boolean(p.confirmado) || Boolean(p.confirmado_supervisor) || Boolean(p.fecha_escaneo_cobrador);
            const fStr = String(p.fecha || p.created_at || '').slice(0, 10);
            const inCycle = !systemCycle?.desde || (fStr >= systemCycle.desde && fStr <= (systemCycle.hasta || fStr));
            return matchAg && matchMon && isCob && isConf && inCycle && !p.rechazado;
          });
          const cobradorRutaTot = agCobradorList.reduce((sum, curr) => sum + Number(curr.monto || 0), 0);
          const cobradorLiquidadoTot = agCobradorList.filter((p) => Boolean(p.liquidado_admin)).reduce((sum, curr) => sum + Number(curr.monto || 0), 0);
          const cobradorEnRutaTot = agCobradorList.filter((p) => !p.liquidado_admin).reduce((sum, curr) => sum + Number(curr.monto || 0), 0);

          // 2. Efectivo Taquilla directo (Entregado a Supervisor en caja taquilla sin QR en el ciclo)
          const agEfectivoList = rawDailyPayments.filter((p) => {
            const matchAg = (p.agencia || p.nombre_agency || '').trim().toUpperCase() === nom;
            const matchMon = normalizarMoneda(p.moneda) === mon;
            const isCob = Boolean(p.qr_token) || String(p.tipo_pago || '').toUpperCase().includes('COBRADOR');
            const isConf = Boolean(p.confirmado) || Boolean(p.confirmado_supervisor);
            const fStr = String(p.fecha || p.created_at || '').slice(0, 10);
            const inCycle = !systemCycle?.desde || (fStr >= systemCycle.desde && fStr <= (systemCycle.hasta || fStr));
            return matchAg && matchMon && !isCob && isConf && inCycle && !p.rechazado;
          });
          const rawEfectivoTaquillaTot = agEfectivoList.reduce((sum, curr) => sum + Number(curr.monto || 0), 0);
          // Si el efectivo entregado al supervisor ya fue despachado al cobrador / liquidado, solo se computa y muestra el remanente en taquilla
          const efectivoTaquillaTot = Math.max(0, rawEfectivoTaquillaTot - cobradorRutaTot);

          // 3. Bancos ordinarios (pagos_semana + cda_pagos_bancarios sin incluir reposición de premios)
          const agBancosList = payments.filter((p) => {
            const matchAg = p.agencia === nom && normalizarMoneda(p.moneda) === mon;
            const isPrem = String(p.tipo_pago || '').toUpperCase().includes('PREMIO') || String(p.referencia || '').toUpperCase().includes('PREMIO');
            const isDiario = p.id.startsWith('pd_');
            return matchAg && !isPrem && !isDiario && Boolean(p.confirmado);
          });
          const bancosTot = agBancosList.reduce((sum, curr) => sum + Number(curr.monto || 0), 0);

          // 4. Reposición de Premios (Abonos de la Operadora a la agencia por pérdidas / faltantes de premio)
          const agPremiosList = payments.filter((p) => {
            const matchAg = p.agencia === nom && normalizarMoneda(p.moneda) === mon;
            const isPrem = String(p.tipo_pago || '').toUpperCase().includes('PREMIO') || String(p.referencia || '').toUpperCase().includes('PREMIO');
            return matchAg && isPrem && Boolean(p.confirmado);
          });
          const reposicionPremiosTot = agPremiosList.reduce((sum, curr) => sum + Number(curr.monto || 0), 0);

          // Total cobros ordinarios (reducen saldo de la agencia)
          const totalCobros = cobradorRutaTot + efectivoTaquillaTot + bancosTot;

          // Pagos netos
          const pagosNetos = totalCobros - reposicionPremiosTot;

          // Saldo Final = Arrastre + Venta Neta - Gastos - Cobros + Premios
          const saldoFinal = Math.round((sAnt + vtaNeta - gTot - totalCobros + reposicionPremiosTot) * 100) / 100;

          let status: 'pagado' | 'pendiente' | 'favor' = 'pagado';
          if (Math.abs(saldoFinal) < 0.1) status = 'pagado';
          else if (saldoFinal > 0) status = 'pendiente';
          else status = 'favor';

          list.push({
            ag_id: ag.id,
            entidad: nom,
            moneda: mon,
            saldo_anterior: sAnt,
            venta_bruta: vtaBruta,
            comision: com,
            premios_taquilla: premTaq,
            venta_neta: vtaNeta,
            gastos: gTot,
            cobrador_ruta: cobradorRutaTot,
            cobrador_liquidado: cobradorLiquidadoTot,
            cobrador_en_ruta: cobradorEnRutaTot,
            efectivo_taquilla: efectivoTaquillaTot,
            bancos: bancosTot,
            reposicion_premios: reposicionPremiosTot,
            pagos_netos: pagosNetos,
            saldo_final: saldoFinal,
            status,
          });
        }
      });
    });

    return list;
  }, [agencies, sales, payments, expenses, rawDailyPayments, systemCycle]);

  // Totals by currency
  const totalsByCurrency = useMemo(() => {
    const res: Record<string, {
      saldoAnterior: number;
      ventaNeta: number;
      gastos: number;
      cobradorRuta: number;
      cobradorLiquidado: number;
      cobradorEnRuta: number;
      efectivoTaquilla: number;
      bancos: number;
      reposicionPremios: number;
      saldoFinal: number;
      count: number;
    }> = {};

    ['BS', 'USD', 'COP'].forEach((m) => {
      res[m] = {
        saldoAnterior: 0,
        ventaNeta: 0,
        gastos: 0,
        cobradorRuta: 0,
        cobradorLiquidado: 0,
        cobradorEnRuta: 0,
        efectivoTaquilla: 0,
        bancos: 0,
        reposicionPremios: 0,
        saldoFinal: 0,
        count: 0,
      };
    });

    auditRows.forEach((r) => {
      if (res[r.moneda]) {
        res[r.moneda].saldoAnterior += r.saldo_anterior;
        res[r.moneda].ventaNeta += r.venta_neta;
        res[r.moneda].gastos += r.gastos;
        res[r.moneda].cobradorRuta += r.cobrador_ruta;
        res[r.moneda].cobradorLiquidado += r.cobrador_liquidado || 0;
        res[r.moneda].cobradorEnRuta += r.cobrador_en_ruta || 0;
        res[r.moneda].efectivoTaquilla += r.efectivo_taquilla;
        res[r.moneda].bancos += r.bancos;
        res[r.moneda].reposicionPremios += r.reposicion_premios;
        res[r.moneda].saldoFinal += r.saldo_final;
        res[r.moneda].count += 1;
      }
    });

    return res;
  }, [auditRows]);

  // Filtered rows for the table view
  const filteredRows = useMemo(() => {
    return auditRows.filter((r) => {
      if (selectedCurrency !== 'ALL' && r.moneda !== selectedCurrency) return false;
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        if (!r.entidad.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [auditRows, selectedCurrency, statusFilter, searchQuery]);

  // Movimientos auditados para el Acta del Operador de Confirmaciones
  const confirmationAuditItems = useMemo<ConfirmationAuditItem[]>(() => {
    const list: ConfirmationAuditItem[] = [];

    // 1. Pagos / Bancos y Reposiciones de Premios
    payments.forEach((p) => {
      if (!p.confirmado || p.rechazado) return;
      const fStr = String(p.fecha || p.created_at || '').slice(0, 10);
      const inCycle = !systemCycle?.desde || (fStr >= systemCycle.desde && fStr <= (systemCycle.hasta || fStr));
      if (!inCycle) return;

      const isPremio = String(p.tipo_pago || '').toUpperCase().includes('PREMIO') || String(p.referencia || '').toUpperCase().includes('PREMIO');
      list.push({
        id: p.id,
        fecha: fStr,
        agencia: p.agencia,
        categoria: isPremio ? 'REPOSICION' : 'BANCO',
        referencia: p.referencia || (isPremio ? 'Reposición de Premios' : 'Transferencia Bancaria'),
        moneda: normalizarMoneda(p.moneda) as 'BS' | 'USD' | 'COP',
        monto: Number(p.monto) || 0,
        confirmado_por: p.confirmado_por || undefined,
        banco: p.metodo,
      });
    });

    // 2. Gastos operativos confirmados
    expenses.forEach((g) => {
      if (!g.confirmado || g.rechazado) return;
      const fStr = String(g.fecha || g.created_at || '').slice(0, 10);
      const inCycle = !systemCycle?.desde || (fStr >= systemCycle.desde && fStr <= (systemCycle.hasta || fStr));
      if (!inCycle) return;

      list.push({
        id: g.id,
        fecha: fStr,
        agencia: g.agencia,
        categoria: 'GASTO',
        referencia: `${g.tipo ? `[${g.tipo}] ` : ''}${g.concepto || 'Gasto Operativo'}`,
        moneda: normalizarMoneda(g.moneda) as 'BS' | 'USD' | 'COP',
        monto: Number(g.monto) || 0,
      });
    });

    // 3. Efectivo en taquilla confirmado (entregado a supervisor, sin QR)
    rawDailyPayments.forEach((pd) => {
      const isCob = Boolean(pd.qr_token) || String(pd.tipo_pago || '').toUpperCase().includes('COBRADOR');
      if (isCob) return; // Las recaudaciones de cobrador van en el Acta de Cobrador
      const isConf = Boolean(pd.confirmado) || Boolean(pd.confirmado_supervisor);
      if (!isConf || pd.rechazado) return;

      const fStr = String(pd.fecha || pd.created_at || '').slice(0, 10);
      const inCycle = !systemCycle?.desde || (fStr >= systemCycle.desde && fStr <= (systemCycle.hasta || fStr));
      if (!inCycle) return;

      list.push({
        id: `pd_${pd.id}`,
        fecha: fStr,
        agencia: (pd.agencia || pd.nombre_agency || 'Agencia').trim().toUpperCase(),
        categoria: 'EFECTIVO',
        referencia: pd.referencia || pd.concepto || 'Efectivo Entregado a Supervisor',
        moneda: normalizarMoneda(pd.moneda) as 'BS' | 'USD' | 'COP',
        monto: Number(pd.monto) || 0,
        confirmado_por: pd.confirmado_por || undefined,
      });
    });

    return list.sort((a, b) => b.fecha.localeCompare(a.fecha));
  }, [payments, expenses, rawDailyPayments, systemCycle]);

  // Recaudaciones en ruta para el Acta del Cobrador
  const collectorDailyPayments = useMemo<CollectorDailyPaymentItem[]>(() => {
    return rawDailyPayments
      .filter((pd) => {
        const isCob = Boolean(pd.qr_token) || String(pd.tipo_pago || '').toUpperCase().includes('COBRADOR');
        const fStr = String(pd.fecha || pd.created_at || '').slice(0, 10);
        const inCycle = !systemCycle?.desde || (fStr >= systemCycle.desde && fStr <= (systemCycle.hasta || fStr));
        return isCob && inCycle && !pd.rechazado;
      })
      .map((pd) => ({
        id: String(pd.id),
        fecha: String(pd.fecha || pd.created_at || '').slice(0, 10),
        agencia: (pd.agencia || pd.nombre_agency || 'Agencia').trim().toUpperCase(),
        moneda: normalizarMoneda(pd.moneda) as 'BS' | 'USD' | 'COP',
        monto: Number(pd.monto) || 0,
        qr_token: pd.qr_token,
        referencia: pd.referencia,
        cobrador_nombre: pd.cobrador_nombre || (pd.cobrador_id ? `Cobrador #${pd.cobrador_id}` : 'Cobrador de Ruta'),
        cobrador_id: pd.cobrador_id,
        liquidado_admin: Boolean(pd.liquidado_admin),
        confirmado_supervisor: Boolean(pd.confirmado_supervisor || pd.confirmado),
        fecha_escaneo_cobrador: pd.fecha_escaneo_cobrador,
      }))
      .sort((a, b) => (b.fecha_escaneo_cobrador || b.fecha).localeCompare(a.fecha_escaneo_cobrador || a.fecha));
  }, [rawDailyPayments, systemCycle]);

  // Helper para normalizar el nombre del banco receptor
  const extractBankName = (metodo?: string, referencia?: string): string => {
    const combined = `${metodo || ''} ${referencia || ''}`.toUpperCase();
    if (combined.includes('BANCAMIGA')) return 'BANCAMIGA';
    if (combined.includes('BANESCO')) return 'BANESCO';
    if (combined.includes('MERCANTIL')) return 'MERCANTIL';
    if (combined.includes('PROVINCIAL') || combined.includes('BBVA')) return 'BBVA PROVINCIAL';
    if (combined.includes('VENEZUELA') || combined.includes('BDV')) return 'BANCO DE VENEZUELA';
    if (combined.includes('BNC') || combined.includes('NACIONAL DE CREDITO')) return 'BNC';
    if (combined.includes('BANCARIBE')) return 'BANCARIBE';
    if (combined.includes('EXTERIOR')) return 'BANCO EXTERIOR';
    if (combined.includes('TESORO')) return 'BANCO DEL TESORO';
    if (combined.includes('ZELLE')) return 'ZELLE';
    if (combined.includes('BINANCE')) return 'BINANCE (USDT)';
    if (combined.includes('BANCOLOMBIA')) return 'BANCOLOMBIA';
    if (combined.includes('DAVIPLATA')) return 'DAVIPLATA';
    if (combined.includes('NEQUI')) return 'NEQUI';
    if (combined.includes('PAGO MOVIL') || combined.includes('PAGO MÓVIL')) return 'PAGO MÓVIL';
    if (combined.includes('POS') || combined.includes('PUNTO')) return 'PUNTO DE VENTA (POS)';
    if (metodo && metodo.trim()) return metodo.trim().toUpperCase();
    return 'BANCO CENTRAL';
  };

  // Movimientos bancarios detallados (Entradas: Cobros bancarios; Salidas: Reposición de premios y egresos bancarios)
  const bankTransactionItems = useMemo<BankTransactionAuditItem[]>(() => {
    const list: BankTransactionAuditItem[] = [];

    // 1. Cobros bancarios y reposiciones de premios en payments
    payments.forEach((p) => {
      if (!p.confirmado || p.rechazado) return;
      const fStr = String(p.fecha || p.created_at || '').slice(0, 10);
      const inCycle = !systemCycle?.desde || (fStr >= systemCycle.desde && fStr <= (systemCycle.hasta || fStr));
      if (!inCycle) return;

      const isDiario = p.id.startsWith('pd_');
      if (isDiario) return; // Efectivo diario de taquilla se procesa en el acta de efectivo

      const isPremio = String(p.tipo_pago || '').toUpperCase().includes('PREMIO') || String(p.referencia || '').toUpperCase().includes('PREMIO');
      const bName = extractBankName(p.metodo, p.referencia);

      list.push({
        id: p.id,
        fecha: fStr,
        agencia: p.agencia,
        banco: bName,
        cuenta: p.referencia.includes('[') ? p.referencia.slice(p.referencia.indexOf('['), p.referencia.indexOf(']') + 1) : undefined,
        tipo: isPremio ? 'SALIDA' : 'ENTRADA',
        subtipo: isPremio ? 'REPOSICION' : 'COBRO',
        referencia: p.referencia || (isPremio ? 'Reposición de Premios' : 'Cobranza Bancaria Recibida'),
        concepto: isPremio ? 'Reposición de Premios a Agencia' : 'Cobranza Bancaria Recibida',
        moneda: normalizarMoneda(p.moneda) as 'BS' | 'USD' | 'COP',
        monto: Number(p.monto) || 0,
        confirmado_por: p.confirmado_por || undefined,
        confirmado: true,
      });
    });

    // 2. Gastos pagados por vía bancaria (salidas bancarias adicionales)
    expenses.forEach((g) => {
      if (!g.confirmado || g.rechazado) return;
      const met = String(g.tipo || '').toUpperCase();
      const isBankExpense = met.includes('TRANSFERENCIA') || met.includes('BANCO');
      if (!isBankExpense) return;

      const fStr = String(g.fecha || g.created_at || '').slice(0, 10);
      const inCycle = !systemCycle?.desde || (fStr >= systemCycle.desde && fStr <= (systemCycle.hasta || fStr));
      if (!inCycle) return;

      const bName = extractBankName(g.tipo, g.concepto);

      list.push({
        id: g.id,
        fecha: fStr,
        agencia: g.agencia,
        banco: bName,
        tipo: 'SALIDA',
        subtipo: 'GASTO',
        referencia: `Gasto: ${g.concepto || 'Egreso Operativo'}`,
        concepto: g.concepto || 'Gasto Bancario',
        moneda: normalizarMoneda(g.moneda) as 'BS' | 'USD' | 'COP',
        monto: Number(g.monto) || 0,
        confirmado: true,
      });
    });

    return list.sort((a, b) => b.fecha.localeCompare(a.fecha));
  }, [payments, expenses, systemCycle]);

  // Entregas de efectivo en físico (Taquilla directa y Cobradores de Ruta)
  const cashDeliveryItems = useMemo<CashDeliveryAuditItem[]>(() => {
    const list: CashDeliveryAuditItem[] = [];

    // 1. Recaudaciones en físico de cda_pagos_diarios
    rawDailyPayments.forEach((pd) => {
      const isRech = Boolean(pd.rechazado) || String(pd.estado || '').toUpperCase() === 'RECHAZADO';
      const isConf = Boolean(pd.confirmado) || Boolean(pd.confirmado_supervisor) || Boolean(pd.fecha_escaneo_cobrador);
      if (!isConf || isRech) return;

      const fStr = String(pd.fecha || pd.created_at || '').slice(0, 10);
      const inCycle = !systemCycle?.desde || (fStr >= systemCycle.desde && fStr <= (systemCycle.hasta || fStr));
      if (!inCycle) return;

      const isCob = Boolean(pd.qr_token) || String(pd.tipo_pago || '').toUpperCase().includes('COBRADOR');
      const agNom = (pd.agencia || pd.nombre_agency || 'Agencia').trim().toUpperCase();

      list.push({
        id: String(pd.id),
        fecha: fStr,
        agencia: agNom,
        modalidad: isCob ? 'COBRADOR_RUTA' : 'TAQUILLA',
        tipo: 'ENTRADA',
        referencia: pd.qr_token || pd.referencia || (isCob ? 'Token QR Cobrador' : 'Entrega Supervisor Taquilla'),
        concepto: pd.concepto || (isCob ? 'Recaudación en Ruta QR' : 'Efectivo Entregado en Taquilla'),
        custodio: pd.cobrador_nombre || pd.supervisor_nombre || (isCob ? `Cobrador #${pd.cobrador_id || ''}` : 'Supervisor de Taquilla'),
        moneda: normalizarMoneda(pd.moneda) as 'BS' | 'USD' | 'COP',
        monto: Number(pd.monto) || 0,
        confirmado_supervisor: Boolean(pd.confirmado_supervisor || pd.confirmado),
        liquidado_admin: Boolean(pd.liquidado_admin),
      });
    });

    // 2. Gastos pagados en efectivo físico (salidas de efectivo)
    expenses.forEach((g) => {
      if (!g.confirmado || g.rechazado) return;
      const met = String(g.tipo || '').toUpperCase();
      const isCashExpense = met.includes('EFECTIVO');
      if (!isCashExpense) return;

      const fStr = String(g.fecha || g.created_at || '').slice(0, 10);
      const inCycle = !systemCycle?.desde || (fStr >= systemCycle.desde && fStr <= (systemCycle.hasta || fStr));
      if (!inCycle) return;

      list.push({
        id: g.id,
        fecha: fStr,
        agencia: g.agencia,
        modalidad: 'TAQUILLA',
        tipo: 'SALIDA',
        referencia: `Gasto Efectivo: ${g.concepto || 'Egreso'}`,
        concepto: g.concepto || 'Gasto Menor en Efectivo',
        custodio: 'Caja Taquilla',
        moneda: normalizarMoneda(g.moneda) as 'BS' | 'USD' | 'COP',
        monto: Number(g.monto) || 0,
      });
    });

    return list.sort((a, b) => b.fecha.localeCompare(a.fecha));
  }, [rawDailyPayments, expenses, systemCycle]);

  // CSV Export
  const handleExportCSV = () => {
    if (auditRows.length === 0) return;
    const headers = [
      'Agencia',
      'Moneda',
      'Arrastre Inicial',
      'Venta Neta',
      'Gastos',
      'Cobrador en Ruta',
      'Liquidado a Admin',
      'Efectivo Taquilla',
      'Bancos (Cobros)',
      'Reposicion Premios (+)',
      'Pagos Netos',
      'Saldo Final',
      'Estado Arqueo',
    ];
    const rows = auditRows.map((d) => [
      `"${d.entidad}"`,
      d.moneda,
      d.saldo_anterior.toFixed(2),
      d.venta_neta.toFixed(2),
      d.gastos.toFixed(2),
      (d.cobrador_en_ruta || 0).toFixed(2),
      (d.cobrador_liquidado || 0).toFixed(2),
      d.efectivo_taquilla.toFixed(2),
      d.bancos.toFixed(2),
      d.reposicion_premios.toFixed(2),
      d.pagos_netos.toFixed(2),
      d.saldo_final.toFixed(2),
      d.status.toUpperCase(),
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `PreCierre_Arqueo_Semana_${systemCycle.semana}_${systemCycle.desde}_al_${systemCycle.hasta}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleToggleRow = (key: string, initialTab?: 'all' | 'cobradores' | 'confirmaciones' | 'gastos' | 'efectivo') => {
    if (expandedAgencyKey === key && (!initialTab || drawerTab === initialTab)) {
      setExpandedAgencyKey(null);
    } else {
      setExpandedAgencyKey(key);
      if (initialTab) {
        setDrawerTab(initialTab);
      }
    }
  };

  const getAgencyCollectorMovements = (entidad: string, moneda: string) => {
    return rawDailyPayments
      .filter((p) => {
        const matchAg = (p.agencia || p.nombre_agency || '').trim().toUpperCase() === entidad.trim().toUpperCase();
        const matchMon = normalizarMoneda(p.moneda) === moneda;
        const isCob = Boolean(p.qr_token) || String(p.tipo_pago || '').toUpperCase().includes('COBRADOR');
        const fStr = String(p.fecha || p.created_at || '').slice(0, 10);
        const inCycle = !systemCycle?.desde || (fStr >= systemCycle.desde && fStr <= (systemCycle.hasta || fStr));
        return matchAg && matchMon && isCob && inCycle && !p.rechazado;
      })
      .sort((a, b) => (b.fecha_escaneo_cobrador || b.fecha || '').localeCompare(a.fecha_escaneo_cobrador || a.fecha || ''));
  };

  const getAgencyConfirmationMovements = (entidad: string, moneda: string) => {
    return confirmationAuditItems.filter((item) => {
      return item.agencia.trim().toUpperCase() === entidad.trim().toUpperCase() && item.moneda === moneda;
    });
  };

  const getAgencyExpenses = (entidad: string, moneda: string) => {
    return expenses.filter((g) => {
      const matchAg = g.agencia.trim().toUpperCase() === entidad.trim().toUpperCase();
      const matchMon = normalizarMoneda(g.moneda) === moneda;
      const fStr = String(g.fecha || g.created_at || '').slice(0, 10);
      const inCycle = !systemCycle?.desde || (fStr >= systemCycle.desde && fStr <= (systemCycle.hasta || fStr));
      return matchAg && matchMon && Boolean(g.confirmado) && inCycle && !g.rechazado;
    });
  };

  const getAgencyCashMovements = (entidad: string, moneda: string) => {
    return rawDailyPayments.filter((pd) => {
      const matchAg = (pd.agencia || pd.nombre_agency || '').trim().toUpperCase() === entidad.trim().toUpperCase();
      const matchMon = normalizarMoneda(pd.moneda) === moneda;
      const isCob = Boolean(pd.qr_token) || String(pd.tipo_pago || '').toUpperCase().includes('COBRADOR');
      const isConf = Boolean(pd.confirmado) || Boolean(pd.confirmado_supervisor);
      const fStr = String(pd.fecha || pd.created_at || '').slice(0, 10);
      const inCycle = !systemCycle?.desde || (fStr >= systemCycle.desde && fStr <= (systemCycle.hasta || fStr));
      return matchAg && matchMon && !isCob && isConf && inCycle && !pd.rechazado;
    });
  };

  const currentTotals = selectedCurrency === 'ALL' ? totalsByCurrency['COP'] || totalsByCurrency['BS'] : totalsByCurrency[selectedCurrency];

  return (
    <div className="space-y-6">
      {/* Top Banner with Quick Actions */}
      <div className="bg-gradient-to-r from-emerald-950/30 via-[#0D1B22] to-sky-950/30 border border-emerald-500/20 rounded-3xl p-5 sm:p-6 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-extrabold uppercase border border-emerald-500/30 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5" />
              Auditoría en Tiempo Real
            </span>
            <span className="text-xs font-mono font-bold text-slate-400">
              {systemCycle.tipo === 'SEMANAL' ? `Semana ${systemCycle.semana}` : `Ciclo ${systemCycle.semana}`} ({systemCycle.desde} al {systemCycle.hasta})
            </span>
          </div>
          <h3 className="text-lg font-black text-white">
            Pre-Cierre y Arqueo Integral del Ciclo
          </h3>
          <p className="text-xs text-slate-400">
            Conciliación de saldos por caja, canales de cobro (Efectivo/Cobradores/Bancos) y reposición de premios antes del cierre.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* 1. Acta General de Arqueo */}
          <button
            onClick={() => setIsActaModalOpen(true)}
            className="px-3.5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs shadow-lg shadow-amber-500/20 flex items-center gap-1.5 transition-all cursor-pointer"
            title="Acta General de Arqueo y Rendición de Puntos de Venta"
          >
            <FileText className="w-4 h-4" />
            <span>📜 Acta General</span>
          </button>

          {/* 2. Acta Cuentas Bancarias (Entradas, Salidas y Total por Banco) */}
          <button
            onClick={() => setIsBankIncomeActaOpen(true)}
            className="px-3.5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-black text-xs shadow-lg shadow-cyan-500/20 flex items-center gap-1.5 transition-all cursor-pointer"
            title="Acta Oficial de Movimientos e Ingresos en Cuentas Bancarias (Entradas, Salidas y Total por Banco)"
          >
            <Landmark className="w-4 h-4" />
            <span>🏛️ Acta Bancaria ({bankTransactionItems.length})</span>
          </button>

          {/* 3. Acta Entrega de Efectivo */}
          <button
            onClick={() => setIsCashDeliveryActaOpen(true)}
            className="px-3.5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-slate-950 font-black text-xs shadow-lg shadow-emerald-500/20 flex items-center gap-1.5 transition-all cursor-pointer"
            title="Acta Oficial de Entrega y Rendición de Efectivo en Bóveda / Caja Central"
          >
            <Banknote className="w-4 h-4" />
            <span>💵 Acta Efectivo ({cashDeliveryItems.length})</span>
          </button>

          {/* 4. Acta Operador de Confirmaciones */}
          <button
            onClick={() => setIsConfirmationActaOpen(true)}
            className="px-3.5 py-2.5 rounded-xl bg-gradient-to-r from-sky-500 to-teal-500 hover:from-sky-400 hover:to-teal-400 text-slate-950 font-black text-xs shadow-lg shadow-sky-500/20 flex items-center gap-1.5 transition-all cursor-pointer"
            title="Acta Oficial del Operador de Confirmaciones"
          >
            <ShieldCheck className="w-4 h-4" />
            <span>🛡️ Confirmaciones ({confirmationAuditItems.length})</span>
          </button>

          {/* 5. Acta Cobrador de Ruta */}
          <button
            onClick={() => setIsCollectorActaOpen(true)}
            className="px-3.5 py-2.5 rounded-xl bg-gradient-to-r from-purple-500 to-indigo-500 hover:from-purple-400 hover:to-indigo-400 text-white font-black text-xs shadow-lg shadow-purple-500/20 flex items-center gap-1.5 transition-all cursor-pointer"
            title="Acta Oficial y Desglose de Recaudaciones del Cobrador de Ruta"
          >
            <Bike className="w-4 h-4" />
            <span>🛵 Cobrador ({collectorDailyPayments.length})</span>
          </button>

          <button
            onClick={handleExportCSV}
            disabled={auditRows.length === 0}
            className="px-3 py-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 text-xs font-bold flex items-center gap-1.5 transition-all border border-slate-700 cursor-pointer disabled:opacity-50"
            title="Exportar archivo CSV"
          >
            <Download className="w-3.5 h-3.5" />
            <span>CSV</span>
          </button>

          <button
            onClick={loadData}
            disabled={isLoading}
            className="p-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 transition-all border border-slate-700 cursor-pointer disabled:opacity-50"
            title="Recalcular arqueo"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* KPI Cards Multi-Moneda */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {['BS', 'USD', 'COP'].map((mon) => {
          const tot = totalsByCurrency[mon];
          if (!tot) return null;

          const isSelected = selectedCurrency === mon;
          const flag = mon === 'BS' ? '🇻🇪' : mon === 'USD' ? '🇺🇸' : '🇨🇴';
          const currencyName = mon === 'BS' ? 'Bolívares (BS)' : mon === 'USD' ? 'Dólares (USD)' : 'Pesos (COP)';

          return (
            <div
              key={mon}
              onClick={() => setSelectedCurrency(mon as any)}
              className={`p-5 rounded-3xl border transition-all cursor-pointer flex flex-col justify-between relative overflow-hidden ${
                isSelected
                  ? 'bg-gradient-to-b from-[#0F2633] to-[#0A1A23] border-emerald-500/50 shadow-2xl shadow-emerald-500/15 ring-2 ring-emerald-500/30'
                  : 'bg-[#0D1B22] border-slate-800 hover:border-slate-700 hover:bg-[#0f1f28]'
              }`}
            >
              {/* Card Header */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-800/80 mb-3.5">
                <div className="flex items-center gap-2.5">
                  <span className="text-xl">{flag}</span>
                  <div>
                    <h4 className="text-xs font-black uppercase text-amber-400 font-mono tracking-wider">
                      Caja {currencyName}
                    </h4>
                    <span className="text-[11px] text-slate-400">
                      {tot.count} {tot.count === 1 ? 'agencia' : 'agencias registradas'}
                    </span>
                  </div>
                </div>

                <span
                  className={`text-[10px] font-extrabold uppercase px-2.5 py-1 rounded-full border transition-all ${
                    isSelected
                      ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 shadow-sm shadow-emerald-500/20'
                      : 'bg-slate-800/80 text-slate-400 border-slate-700'
                  }`}
                >
                  {isSelected ? '● Filtrado' : 'Filtrar'}
                </span>
              </div>

              {/* Big Hero: Saldo Final */}
              <div className="bg-[#071318] border border-slate-800/90 rounded-2xl p-3.5 mb-3.5 text-center shadow-inner">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  Saldo Final Consolidado
                </span>
                <div
                  className={`text-2xl sm:text-3xl font-black font-mono tracking-tight ${
                    tot.saldoFinal > 0
                      ? 'text-amber-400'
                      : tot.saldoFinal < 0
                      ? 'text-rose-400'
                      : 'text-emerald-400'
                  }`}
                >
                  {formatCurrency(tot.saldoFinal, mon as any)}
                </div>
              </div>

              {/* Two Clean Sections: Operativo + Canales */}
              <div className="space-y-3 font-mono text-xs">
                {/* Sección 1: Balance Operativo */}
                <div className="bg-[#08151D] border border-slate-800/70 rounded-2xl p-3 space-y-2">
                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-wider border-b border-slate-800/80 pb-1.5 flex items-center justify-between">
                    <span>📊 Movimiento Operativo</span>
                    <span className="text-[9px] text-slate-500 font-sans font-normal">Semana {systemCycle.semana}</span>
                  </div>

                  <div className="space-y-1.5 text-[11px]">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">Arrastre Inicial:</span>
                      <span className="font-semibold text-slate-200">
                        {formatCurrency(tot.saldoAnterior, mon as any)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">Venta Neta:</span>
                      <span className={`font-semibold ${tot.ventaNeta >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {formatCurrency(tot.ventaNeta, mon as any)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">Gastos Operativos:</span>
                      <span className={`font-semibold ${tot.gastos > 0 ? 'text-rose-400' : 'text-slate-500'}`}>
                        {tot.gastos > 0 ? `-${formatCurrency(tot.gastos, mon as any)}` : formatCurrency(0, mon as any)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Sección 2: Canales de Cobro y Fondos */}
                <div className="bg-[#08151D] border border-slate-800/70 rounded-2xl p-3 space-y-2">
                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-wider border-b border-slate-800/80 pb-1.5 flex items-center justify-between">
                    <span>💼 Canales de Cobro & Fondos</span>
                    <span className="text-[9px] text-slate-500 font-sans font-normal">Arqueo Real</span>
                  </div>

                  <div className="space-y-1.5 text-[11px]">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400 flex items-center gap-1.5">
                        <span>🛵</span> Cobrador En Ruta:
                      </span>
                      <span
                        className={`font-semibold ${
                          tot.cobradorEnRuta > 0
                            ? 'text-amber-400 bg-amber-500/10 px-1.5 py-0.2 rounded border border-amber-500/20 font-bold'
                            : 'text-slate-500'
                        }`}
                      >
                        {formatCurrency(tot.cobradorEnRuta, mon as any)}
                      </span>
                    </div>

                    <div
                      onClick={() => setIsCashDeliveryActaOpen(true)}
                      className="flex justify-between items-center cursor-pointer hover:bg-slate-800/40 p-1 -m-1 rounded-lg transition-colors group"
                      title="Ver Acta de Entrega de Efectivo"
                    >
                      <span className="text-slate-400 group-hover:text-white flex items-center gap-1.5 transition-colors">
                        <span>🏛️</span> Liquidado a Admin:
                      </span>
                      <span
                        className={`font-semibold ${
                          tot.cobradorLiquidado > 0
                            ? 'text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded border border-emerald-500/20 font-bold'
                            : 'text-slate-500'
                        }`}
                      >
                        {formatCurrency(tot.cobradorLiquidado, mon as any)}
                      </span>
                    </div>

                    <div
                      onClick={() => setIsCashDeliveryActaOpen(true)}
                      className="flex justify-between items-center cursor-pointer hover:bg-slate-800/40 p-1 -m-1 rounded-lg transition-colors group"
                      title="Ver Acta de Entrega de Efectivo"
                    >
                      <span className="text-slate-400 group-hover:text-white flex items-center gap-1.5 transition-colors">
                        <span>💵</span> Efectivo Taquilla:
                      </span>
                      <span className={`font-semibold ${tot.efectivoTaquilla > 0 ? 'text-sky-300' : 'text-slate-500'}`}>
                        {formatCurrency(tot.efectivoTaquilla, mon as any)}
                      </span>
                    </div>

                    <div
                      onClick={() => setIsBankIncomeActaOpen(true)}
                      className="flex justify-between items-center cursor-pointer hover:bg-slate-800/40 p-1 -m-1 rounded-lg transition-colors group"
                      title="Ver Acta de Cuentas Bancarias (Entradas, Salidas y Total por Banco)"
                    >
                      <span className="text-slate-400 group-hover:text-cyan-300 flex items-center gap-1.5 transition-colors">
                        <span>🏛️</span> Bancos / Cobros:
                      </span>
                      <span className={`font-semibold ${tot.bancos > 0 ? 'text-cyan-400' : 'text-slate-500'}`}>
                        {formatCurrency(tot.bancos, mon as any)}
                      </span>
                    </div>

                    {tot.reposicionPremios > 0 && (
                      <div
                        onClick={() => setIsBankIncomeActaOpen(true)}
                        className="flex justify-between items-center pt-1.5 border-t border-slate-800/80 cursor-pointer hover:bg-slate-800/40 p-1 -m-1 rounded-lg transition-colors group"
                        title="Ver Reposiciones en Acta de Cuentas Bancarias"
                      >
                        <span className="text-amber-400 font-bold flex items-center gap-1.5">
                          <span>🏆</span> Reposición Premios:
                        </span>
                        <span className="font-black text-amber-400">
                          +{formatCurrency(tot.reposicionPremios, mon as any)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-[#0D1B22] border border-slate-800 rounded-2xl p-4">
        {/* Currency Switcher Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto">
          <button
            onClick={() => setSelectedCurrency('ALL')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              selectedCurrency === 'ALL'
                ? 'bg-emerald-500 text-slate-950 font-black'
                : 'text-slate-400 hover:text-white bg-slate-800/60'
            }`}
          >
            Todas ({auditRows.length})
          </button>
          {['COP', 'BS', 'USD'].map((mon) => (
            <button
              key={mon}
              onClick={() => setSelectedCurrency(mon as any)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                selectedCurrency === mon
                  ? 'bg-emerald-500 text-slate-950 font-black'
                  : 'text-slate-400 hover:text-white bg-slate-800/60'
              }`}
            >
              {mon} ({auditRows.filter((r) => r.moneda === mon).length})
            </button>
          ))}
        </div>

        {/* Search & Status Filter */}
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar agencia..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#071217] border border-slate-700 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="bg-[#071217] border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
          >
            <option value="all">Todos los Estados</option>
            <option value="pagado">🟢 Cuadrado / Pagado</option>
            <option value="pendiente">🟡 Saldo Operadora</option>
            <option value="favor">🔴 Saldo Agencia</option>
          </select>
        </div>
      </div>

      {/* Main Audit Matrix Table */}
      <div className="bg-[#0D1B22] border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Layers className="w-4 h-4 text-emerald-400" />
              Matriz de Arqueo Detallada por Caja y Agencia ({filteredRows.length})
            </h4>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Fórmula: Saldo Anterior + Venta Neta - Gastos - Cobros (Efectivo/Cobradores/Bancos) + Reposición de Premios = Saldo Final
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-[#071217] text-slate-400 border-b border-slate-800 font-bold uppercase tracking-wider text-[11px]">
              <tr className="whitespace-nowrap">
                <th className="py-3 px-3.5">Agencia</th>
                <th className="py-3 px-2 text-center">Moneda</th>
                <th className="py-3 px-3 text-right">Arrastre Inicial</th>
                <th className="py-3 px-3 text-right">Venta Neta</th>
                <th className="py-3 px-3 text-right">Gastos</th>
                <th className="py-3 px-3 text-right text-amber-400">🛵 En Ruta</th>
                <th className="py-3 px-3 text-right text-emerald-400">🏛️ Liquidado Admin</th>
                <th className="py-3 px-3 text-right text-sky-300">💵 Efec Taquilla</th>
                <th className="py-3 px-3 text-right text-cyan-400">🏛️ Bancos</th>
                <th className="py-3 px-3 text-right text-amber-400">🏆 Reposición (+)</th>
                <th className="py-3 px-3 text-right font-black">Saldo Final</th>
                <th className="py-3 px-3 text-center">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70 font-mono text-xs">
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={12} className="py-8 text-center text-slate-500 font-sans">
                    No se encontraron registros de arqueo para los filtros aplicados.
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => {
                  const rowKey = `${row.entidad}_${row.moneda}`;
                  const isExpanded = expandedAgencyKey === rowKey;
                  const agencyCollectors = isExpanded ? getAgencyCollectorMovements(row.entidad, row.moneda) : [];
                  const agencyConfirmations = isExpanded ? getAgencyConfirmationMovements(row.entidad, row.moneda) : [];
                  const agencyExpensesList = isExpanded ? getAgencyExpenses(row.entidad, row.moneda) : [];
                  const agencyCashList = isExpanded ? getAgencyCashMovements(row.entidad, row.moneda) : [];
                  const totalCobros = (row.cobrador_ruta || 0) + (row.efectivo_taquilla || 0) + (row.bancos || 0);

                  return (
                    <React.Fragment key={rowKey}>
                      <tr
                        onClick={() => handleToggleRow(rowKey)}
                        className={`transition-colors whitespace-nowrap cursor-pointer select-none ${
                          isExpanded ? 'bg-slate-800/60 border-l-4 border-l-emerald-400' : 'hover:bg-slate-800/30'
                        }`}
                      >
                        <td className="py-3 px-3.5 font-sans font-bold text-white flex items-center gap-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleRow(rowKey);
                            }}
                            className="p-1 rounded-md hover:bg-slate-700/60 text-slate-400 hover:text-white transition-colors cursor-pointer"
                            title="Expandir movimientos de cobradores y confirmaciones"
                          >
                            {isExpanded ? (
                              <ChevronDown className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                            )}
                          </button>
                          <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="hover:text-emerald-300 transition-colors">{row.entidad}</span>
                          {(row.cobrador_ruta > 0 || row.bancos > 0 || row.reposicion_premios > 0) && (
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" title="Contiene movimientos auditados" />
                          )}
                        </td>

                        <td className="py-3 px-2 text-center">
                          <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 font-bold text-[10px]">
                            {row.moneda}
                          </span>
                        </td>

                        <td className="py-3 px-3 text-right text-slate-400">
                          {formatCurrency(row.saldo_anterior, row.moneda)}
                        </td>

                        <td className={`py-3 px-3 text-right font-semibold ${row.venta_neta >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {formatCurrency(row.venta_neta, row.moneda)}
                        </td>

                        <td
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleRow(rowKey, 'gastos');
                          }}
                          className="py-3 px-3 text-right text-rose-400 hover:underline hover:text-rose-300 transition-all cursor-pointer"
                          title="Click para ver gastos operativos"
                        >
                          {row.gastos > 0 ? formatCurrency(row.gastos, row.moneda) : '-'}
                        </td>

                        {/* 🛵 Cobrador En Ruta */}
                        <td
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleRow(rowKey, 'cobradores');
                          }}
                          className="py-3 px-3 text-right cursor-pointer"
                          title="Click para ver cobranzas en ruta"
                        >
                          {row.cobrador_en_ruta && row.cobrador_en_ruta > 0 ? (
                            <span className="font-semibold text-amber-400 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 px-2 py-0.5 rounded-lg inline-block transition-all hover:scale-105">
                              {formatCurrency(row.cobrador_en_ruta, row.moneda)}
                            </span>
                          ) : (
                            <span className="text-slate-600">-</span>
                          )}
                        </td>

                        {/* 🏛️ Liquidado Admin */}
                        <td
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleRow(rowKey, 'cobradores');
                          }}
                          className="py-3 px-3 text-right cursor-pointer"
                          title="Click para ver cobranzas liquidadas"
                        >
                          {row.cobrador_liquidado && row.cobrador_liquidado > 0 ? (
                            <span className="font-semibold text-emerald-400 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 px-2 py-0.5 rounded-lg inline-block transition-all hover:scale-105">
                              {formatCurrency(row.cobrador_liquidado, row.moneda)}
                            </span>
                          ) : (
                            <span className="text-slate-600">-</span>
                          )}
                        </td>

                        {/* 💵 Efectivo Taquilla */}
                        <td
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleRow(rowKey, 'efectivo');
                          }}
                          className="py-3 px-3 text-right text-sky-300 hover:underline hover:text-sky-200 transition-all cursor-pointer"
                          title="Click para ver entregas de efectivo en taquilla"
                        >
                          {row.efectivo_taquilla > 0 ? formatCurrency(row.efectivo_taquilla, row.moneda) : '-'}
                        </td>

                        {/* 🏛️ Bancos */}
                        <td
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleRow(rowKey, 'confirmaciones');
                          }}
                          className="py-3 px-3 text-right text-cyan-400 hover:underline hover:text-cyan-300 transition-all cursor-pointer"
                          title="Click para ver transferencias bancarias verificadas"
                        >
                          {row.bancos > 0 ? formatCurrency(row.bancos, row.moneda) : '-'}
                        </td>

                        {/* 🏆 Reposición Premios */}
                        <td
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleRow(rowKey, 'confirmaciones');
                          }}
                          className="py-3 px-3 text-right text-amber-400 font-bold hover:underline hover:text-amber-300 transition-all cursor-pointer"
                          title="Click para ver reposición de premios"
                        >
                          {row.reposicion_premios > 0 ? `+${formatCurrency(row.reposicion_premios, row.moneda)}` : '-'}
                        </td>

                        {/* Saldo Final */}
                        <td className={`py-3 px-3 text-right font-black text-sm ${row.saldo_final > 0 ? 'text-amber-400' : row.saldo_final < 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                          {formatCurrency(row.saldo_final, row.moneda)}
                        </td>

                        {/* Estado */}
                        <td className="py-3 px-3 text-center font-sans">
                          {row.status === 'pagado' ? (
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 inline-flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" />
                              Pagado
                            </span>
                          ) : row.status === 'pendiente' ? (
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-amber-500/15 text-amber-400 border border-amber-500/30">
                              Operadora
                            </span>
                          ) : (
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-rose-500/15 text-rose-400 border border-rose-500/30">
                              Agencia
                            </span>
                          )}
                        </td>
                      </tr>

                      {/* INLINE EXPANDED DRAWER FOR COBRADORES & CONFIRMACIONES */}
                      {isExpanded && (
                        <tr className="bg-[#08151D] border-y-2 border-emerald-500/40 animate-fade-in">
                          <td colSpan={12} className="p-4 sm:p-6 space-y-4">
                            {/* Drawer Header & Equation Bar */}
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-800">
                              <div className="flex items-center gap-2.5">
                                <span className="p-2 rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                                  <Building2 className="w-4 h-4" />
                                </span>
                                <div>
                                  <h5 className="text-sm font-black text-white flex items-center gap-2">
                                    <span>{row.entidad}</span>
                                    <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px] font-mono">
                                      {row.moneda}
                                    </span>
                                  </h5>
                                  <span className="text-[11px] text-slate-400">
                                    Auditoría detallada de recaudaciones por cobrador y confirmaciones de tesorería del ciclo activo
                                  </span>
                                </div>
                              </div>

                              <div className="flex flex-wrap items-center gap-2">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setIsCollectorActaOpen(true);
                                  }}
                                  className="px-3 py-1.5 rounded-xl bg-purple-500/15 hover:bg-purple-500/25 text-purple-300 border border-purple-500/30 text-[11px] font-bold flex items-center gap-1.5 cursor-pointer transition-all"
                                >
                                  <Bike className="w-3.5 h-3.5" />
                                  <span>Acta Cobrador</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setIsConfirmationActaOpen(true);
                                  }}
                                  className="px-3 py-1.5 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 border border-sky-500/30 text-[11px] font-bold flex items-center gap-1.5 cursor-pointer transition-all"
                                >
                                  <ShieldCheck className="w-3.5 h-3.5" />
                                  <span>Acta Confirmaciones</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleToggleRow(rowKey);
                                  }}
                                  className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-all"
                                >
                                  <span>Cerrar Detalle</span>
                                  <ChevronUp className="w-3 h-3" />
                                </button>
                              </div>
                            </div>

                            {/* Mathematical Equation Verification Card */}
                            <div className="p-3.5 rounded-2xl bg-[#061015] border border-slate-800 font-mono text-[11px] flex flex-wrap items-center justify-between gap-3 shadow-inner">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-slate-400">Arrastre:</span>
                                <span className="text-slate-200 font-bold">{formatCurrency(row.saldo_anterior, row.moneda)}</span>
                                <span className="text-slate-500">+</span>
                                <span className="text-slate-400">Venta Neta:</span>
                                <span className="text-emerald-400 font-bold">{formatCurrency(row.venta_neta, row.moneda)}</span>
                                <span className="text-slate-500">-</span>
                                <span className="text-slate-400">Gastos:</span>
                                <span className="text-rose-400 font-bold">{formatCurrency(row.gastos, row.moneda)}</span>
                                <span className="text-slate-500">-</span>
                                <span className="text-slate-400">Cobros Totales:</span>
                                <span className="text-cyan-400 font-bold">{formatCurrency(totalCobros, row.moneda)}</span>
                                <span className="text-slate-500">+</span>
                                <span className="text-slate-400">Reposición:</span>
                                <span className="text-amber-400 font-bold">+{formatCurrency(row.reposicion_premios, row.moneda)}</span>
                                <span className="text-slate-500">=</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-slate-400 uppercase text-[10px]">Saldo Final:</span>
                                <span
                                  className={`text-sm font-black px-2 py-0.5 rounded-lg ${
                                    row.saldo_final > 0
                                      ? 'text-amber-400 bg-amber-500/10 border border-amber-500/20'
                                      : row.saldo_final < 0
                                      ? 'text-rose-400 bg-rose-500/10 border border-rose-500/20'
                                      : 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/20'
                                  }`}
                                >
                                  {formatCurrency(row.saldo_final, row.moneda)}
                                </span>
                              </div>
                            </div>

                            {/* Drawer Sub-tabs */}
                            <div className="flex flex-wrap items-center gap-2 border-b border-slate-800/80 pb-2.5">
                              <button
                                type="button"
                                onClick={() => setDrawerTab('all')}
                                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                                  drawerTab === 'all'
                                    ? 'bg-slate-700 text-white'
                                    : 'text-slate-400 hover:text-white bg-slate-900/60'
                                }`}
                              >
                                📋 Todos los Movimientos ({agencyCollectors.length + agencyConfirmations.length + agencyExpensesList.length + agencyCashList.length})
                              </button>

                              <button
                                type="button"
                                onClick={() => setDrawerTab('cobradores')}
                                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                                  drawerTab === 'cobradores'
                                    ? 'bg-purple-500 text-white shadow-lg shadow-purple-500/20'
                                    : 'text-purple-300 hover:text-white bg-purple-500/10 border border-purple-500/20'
                                }`}
                              >
                                <Bike className="w-3.5 h-3.5" />
                                <span>🛵 Cobradores de Ruta ({agencyCollectors.length})</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => setDrawerTab('confirmaciones')}
                                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                                  drawerTab === 'confirmaciones'
                                    ? 'bg-sky-500 text-slate-950 font-black shadow-lg shadow-sky-500/20'
                                    : 'text-sky-300 hover:text-white bg-sky-500/10 border border-sky-500/20'
                                }`}
                              >
                                <ShieldCheck className="w-3.5 h-3.5" />
                                <span>🛡️ Confirmaciones & Bancos ({agencyConfirmations.length})</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => setDrawerTab('gastos')}
                                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                                  drawerTab === 'gastos'
                                    ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/20'
                                    : 'text-rose-300 hover:text-white bg-rose-500/10 border border-rose-500/20'
                                }`}
                              >
                                <Receipt className="w-3.5 h-3.5" />
                                <span>📉 Gastos Operativos ({agencyExpensesList.length})</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => setDrawerTab('efectivo')}
                                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                                  drawerTab === 'efectivo'
                                    ? 'bg-emerald-500 text-slate-950 font-black shadow-lg shadow-emerald-500/20'
                                    : 'text-emerald-300 hover:text-white bg-emerald-500/10 border border-emerald-500/20'
                                }`}
                              >
                                <DollarSign className="w-3.5 h-3.5" />
                                <span>💵 Efectivo en Taquilla ({agencyCashList.length})</span>
                              </button>
                            </div>

                            {/* Section 1: Cobradores de Ruta Table */}
                            {(drawerTab === 'all' || drawerTab === 'cobradores') && (
                              <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                  <h6 className="text-xs font-black uppercase text-purple-400 flex items-center gap-1.5">
                                    <Bike className="w-4 h-4" />
                                    <span>Recaudaciones del Cobrador de Ruta ({agencyCollectors.length})</span>
                                  </h6>
                                  <div className="flex items-center gap-2 text-[11px] font-mono">
                                    <span className="text-slate-400">En Ruta:</span>
                                    <span className="text-amber-400 font-bold">{formatCurrency(row.cobrador_en_ruta || 0, row.moneda)}</span>
                                    <span className="text-slate-500">|</span>
                                    <span className="text-slate-400">Liquidado Admin:</span>
                                    <span className="text-emerald-400 font-bold">{formatCurrency(row.cobrador_liquidado || 0, row.moneda)}</span>
                                  </div>
                                </div>

                                {agencyCollectors.length === 0 ? (
                                  <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800 text-center text-slate-500 text-xs font-sans">
                                    No se registraron recaudaciones QR de cobrador para esta agencia en el ciclo activo.
                                  </div>
                                ) : (
                                  <div className="overflow-x-auto rounded-xl border border-slate-800">
                                    <table className="w-full text-left text-xs border-collapse">
                                      <thead className="bg-[#050D11] text-slate-400 font-bold uppercase text-[10px]">
                                        <tr>
                                          <th className="py-2 px-3">Fecha / Hora</th>
                                          <th className="py-2 px-3">Cobrador</th>
                                          <th className="py-2 px-3">Token QR / Recibo</th>
                                          <th className="py-2 px-3 text-right">Monto Recaudado</th>
                                          <th className="py-2 px-3 text-center">Estado Liquidación</th>
                                          <th className="py-2 px-3 text-center">Validación</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-800/60 font-mono text-[11px] bg-slate-950/40">
                                        {agencyCollectors.map((p) => {
                                          const fStr = String(p.fecha_escaneo_cobrador || p.fecha || p.created_at || '').slice(0, 16).replace('T', ' ');
                                          const isLiq = Boolean(p.liquidado_admin);
                                          return (
                                            <tr key={p.id} className="hover:bg-slate-800/40 transition-colors">
                                              <td className="py-2 px-3 text-slate-300 font-sans">{fStr || '-'}</td>
                                              <td className="py-2 px-3 font-sans font-semibold text-white">
                                                {p.cobrador_nombre || (p.cobrador_id ? `Cobrador #${p.cobrador_id}` : 'Cobrador de Ruta')}
                                              </td>
                                              <td className="py-2 px-3 text-slate-400">
                                                <span className="bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800 font-mono text-[10px]">
                                                  {p.qr_token || p.referencia || `REC-${p.id}`}
                                                </span>
                                              </td>
                                              <td className="py-2 px-3 text-right font-black text-emerald-400">
                                                {formatCurrency(Number(p.monto) || 0, row.moneda)}
                                              </td>
                                              <td className="py-2 px-3 text-center font-sans">
                                                {isLiq ? (
                                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 inline-flex items-center gap-1">
                                                    <CheckCircle2 className="w-3 h-3" />
                                                    🏛️ Liquidado Admin
                                                  </span>
                                                ) : (
                                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-amber-500/15 text-amber-400 border border-amber-500/30 inline-flex items-center gap-1">
                                                    <Clock className="w-3 h-3" />
                                                    🛵 En Ruta
                                                  </span>
                                                )}
                                              </td>
                                              <td className="py-2 px-3 text-center font-sans text-[10px] text-slate-400">
                                                {p.confirmado_supervisor ? '✅ Supervisor' : p.fecha_escaneo_cobrador ? '📲 QR Escaneado' : 'Pendiente'}
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

                            {/* Section 2: Confirmaciones y Bancos Table */}
                            {(drawerTab === 'all' || drawerTab === 'confirmaciones') && (
                              <div className="space-y-2 pt-2">
                                <div className="flex items-center justify-between">
                                  <h6 className="text-xs font-black uppercase text-sky-400 flex items-center gap-1.5">
                                    <ShieldCheck className="w-4 h-4" />
                                    <span>Movimientos Verificados por Confirmaciones ({agencyConfirmations.length})</span>
                                  </h6>
                                  <div className="flex items-center gap-2 text-[11px] font-mono">
                                    <button
                                      type="button"
                                      onClick={() => setIsBankIncomeActaOpen(true)}
                                      className="px-2 py-0.5 rounded-lg bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 font-bold text-[10px] flex items-center gap-1 border border-sky-500/30 transition-colors cursor-pointer"
                                      title="Abrir Acta Oficial de Cuentas Bancarias"
                                    >
                                      <Landmark className="w-3 h-3" />
                                      <span>Acta Bancaria</span>
                                    </button>
                                    <span className="text-slate-400">Bancos:</span>
                                    <span className="text-cyan-400 font-bold">{formatCurrency(row.bancos, row.moneda)}</span>
                                    {row.reposicion_premios > 0 && (
                                      <>
                                        <span className="text-slate-500">|</span>
                                        <span className="text-amber-400 font-bold">+{formatCurrency(row.reposicion_premios, row.moneda)} (Reposición)</span>
                                      </>
                                    )}
                                  </div>
                                </div>

                                {agencyConfirmations.length === 0 ? (
                                  <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800 text-center text-slate-500 text-xs font-sans">
                                    No se registraron confirmaciones bancarias o reposiciones para esta agencia en el ciclo activo.
                                  </div>
                                ) : (
                                  <div className="overflow-x-auto rounded-xl border border-slate-800">
                                    <table className="w-full text-left text-xs border-collapse">
                                      <thead className="bg-[#050D11] text-slate-400 font-bold uppercase text-[10px]">
                                        <tr>
                                          <th className="py-2 px-3">Fecha</th>
                                          <th className="py-2 px-3 text-center">Categoría</th>
                                          <th className="py-2 px-3">Banco / Método</th>
                                          <th className="py-2 px-3">Referencia / Comprobante</th>
                                          <th className="py-2 px-3 text-right">Monto Auditado</th>
                                          <th className="py-2 px-3">Confirmado Por</th>
                                          <th className="py-2 px-3 text-center">Estatus</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-800/60 font-mono text-[11px] bg-slate-950/40">
                                        {agencyConfirmations.map((item) => (
                                          <tr key={item.id} className="hover:bg-slate-800/40 transition-colors">
                                            <td className="py-2 px-3 text-slate-300 font-sans">{item.fecha}</td>
                                            <td className="py-2 px-3 text-center font-sans">
                                              <span
                                                className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase border ${
                                                  item.categoria === 'BANCO'
                                                    ? 'bg-sky-500/15 text-sky-400 border-sky-500/30'
                                                    : item.categoria === 'REPOSICION'
                                                    ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                                                    : item.categoria === 'GASTO'
                                                    ? 'bg-rose-500/15 text-rose-400 border-rose-500/30'
                                                    : 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                                                }`}
                                              >
                                                {item.categoria === 'BANCO' ? '🏛️ BANCO' : item.categoria === 'REPOSICION' ? '🏆 REPOSICIÓN' : item.categoria === 'GASTO' ? '📉 GASTO' : '💵 EFECTIVO'}
                                              </span>
                                            </td>
                                            <td className="py-2 px-3 font-sans text-slate-300">{item.banco || '-'}</td>
                                            <td className="py-2 px-3 text-slate-400 font-mono text-[10px]">
                                              {item.referencia || '-'}
                                            </td>
                                            <td
                                              className={`py-2 px-3 text-right font-black ${
                                                item.categoria === 'GASTO'
                                                  ? 'text-rose-400'
                                                  : item.categoria === 'REPOSICION'
                                                  ? 'text-amber-400'
                                                  : 'text-emerald-400'
                                              }`}
                                            >
                                              {item.categoria === 'REPOSICION' ? '+' : ''}{formatCurrency(item.monto, row.moneda)}
                                            </td>
                                            <td className="py-2 px-3 font-sans text-slate-400 text-[10px]">
                                              {item.confirmado_por || 'Operador de Confirmaciones'}
                                            </td>
                                            <td className="py-2 px-3 text-center font-sans font-bold text-emerald-400 text-[10px]">
                                              VERIFICADO
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Section 3: Gastos Operativos Table */}
                            {(drawerTab === 'all' || drawerTab === 'gastos') && agencyExpensesList.length > 0 && (
                              <div className="space-y-2 pt-2">
                                <div className="flex items-center justify-between">
                                  <h6 className="text-xs font-black uppercase text-rose-400 flex items-center gap-1.5">
                                    <Receipt className="w-4 h-4" />
                                    <span>Gastos Operativos Confirmados ({agencyExpensesList.length})</span>
                                  </h6>
                                  <span className="text-rose-400 font-bold font-mono text-xs">
                                    -{formatCurrency(row.gastos, row.moneda)}
                                  </span>
                                </div>
                                <div className="overflow-x-auto rounded-xl border border-slate-800">
                                  <table className="w-full text-left text-xs border-collapse">
                                    <thead className="bg-[#050D11] text-slate-400 font-bold uppercase text-[10px]">
                                      <tr>
                                        <th className="py-2 px-3">Fecha</th>
                                        <th className="py-2 px-3">Tipo</th>
                                        <th className="py-2 px-3">Concepto</th>
                                        <th className="py-2 px-3 text-right">Monto</th>
                                        <th className="py-2 px-3 text-center">Estado</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-800/60 font-mono text-[11px] bg-slate-950/40">
                                      {agencyExpensesList.map((g) => (
                                        <tr key={g.id} className="hover:bg-slate-800/40 transition-colors">
                                          <td className="py-2 px-3 text-slate-300 font-sans">{String(g.fecha || g.created_at || '').slice(0, 10)}</td>
                                          <td className="py-2 px-3 text-slate-300 font-sans">{g.tipo || 'Operativo'}</td>
                                          <td className="py-2 px-3 text-slate-400 font-sans">{g.concepto || '-'}</td>
                                          <td className="py-2 px-3 text-right font-black text-rose-400">
                                            -{formatCurrency(Number(g.monto) || 0, row.moneda)}
                                          </td>
                                          <td className="py-2 px-3 text-center text-emerald-400 font-sans font-bold text-[10px]">CONFIRMADO</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            )}

                            {/* Section 4: Efectivo en Taquilla Table */}
                            {(drawerTab === 'all' || drawerTab === 'efectivo') && agencyCashList.length > 0 && (
                              <div className="space-y-2 pt-2">
                                <div className="flex items-center justify-between">
                                  <h6 className="text-xs font-black uppercase text-sky-400 flex items-center gap-1.5">
                                    <DollarSign className="w-4 h-4" />
                                    <span>Efectivo en Taquilla Directo ({agencyCashList.length})</span>
                                  </h6>
                                  <div className="flex items-center gap-2 text-[11px] font-mono">
                                    <button
                                      type="button"
                                      onClick={() => setIsCashDeliveryActaOpen(true)}
                                      className="px-2 py-0.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 font-bold text-[10px] flex items-center gap-1 border border-emerald-500/30 transition-colors cursor-pointer"
                                      title="Abrir Acta Oficial de Entrega de Efectivo"
                                    >
                                      <Banknote className="w-3 h-3" />
                                      <span>Acta Efectivo</span>
                                    </button>
                                    <span className="text-sky-300 font-bold font-mono text-xs">
                                      {formatCurrency(row.efectivo_taquilla, row.moneda)}
                                    </span>
                                  </div>
                                </div>
                                <div className="overflow-x-auto rounded-xl border border-slate-800">
                                  <table className="w-full text-left text-xs border-collapse">
                                    <thead className="bg-[#050D11] text-slate-400 font-bold uppercase text-[10px]">
                                      <tr>
                                        <th className="py-2 px-3">Fecha</th>
                                        <th className="py-2 px-3">Concepto</th>
                                        <th className="py-2 px-3 text-right">Monto</th>
                                        <th className="py-2 px-3 text-center">Confirmado</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-800/60 font-mono text-[11px] bg-slate-950/40">
                                      {agencyCashList.map((c) => (
                                        <tr key={c.id} className="hover:bg-slate-800/40 transition-colors">
                                          <td className="py-2 px-3 text-slate-300 font-sans">{String(c.fecha || c.created_at || '').slice(0, 10)}</td>
                                          <td className="py-2 px-3 text-slate-400 font-sans">{c.concepto || c.referencia || 'Entrega en Taquilla'}</td>
                                          <td className="py-2 px-3 text-right font-black text-sky-300">
                                            {formatCurrency(Number(c.monto) || 0, row.moneda)}
                                          </td>
                                          <td className="py-2 px-3 text-center text-emerald-400 font-sans font-bold text-[10px]">
                                            {c.confirmado_supervisor ? 'Supervisor' : 'Confirmado'}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal 1: Acta Oficial de Entrega General */}
      {isActaModalOpen && (
        <DeliveryReportModal
          isOpen={isActaModalOpen}
          onClose={() => setIsActaModalOpen(false)}
          systemCycle={systemCycle}
          userName={user?.nombre || user?.email?.split('@')[0] || 'Administración'}
          companyName="CORPORACION CALENDARIO, CA"
          auditRows={auditRows}
          totalsByCurrency={totalsByCurrency}
        />
      )}

      {/* Modal 2: Acta del Operador de Confirmaciones */}
      {isConfirmationActaOpen && (
        <ConfirmationOperatorActaModal
          isOpen={isConfirmationActaOpen}
          onClose={() => setIsConfirmationActaOpen(false)}
          systemCycle={systemCycle}
          userName={user?.nombre || user?.email?.split('@')[0] || 'Operador de Confirmaciones'}
          companyName="CORPORACION CALENDARIO, CA"
          items={confirmationAuditItems}
        />
      )}

      {/* Modal 3: Acta de Entrega del Cobrador de Ruta */}
      {isCollectorActaOpen && (
        <CollectorDeliveryActaModal
          isOpen={isCollectorActaOpen}
          onClose={() => setIsCollectorActaOpen(false)}
          systemCycle={systemCycle}
          userName={user?.nombre || user?.email?.split('@')[0] || 'Administración'}
          companyName="CORPORACION CALENDARIO, CA"
          collectors={collectors}
          dailyPayments={collectorDailyPayments}
        />
      )}

      {/* Modal 4: Acta Oficial de Ingresos y Movimientos en Cuentas Bancarias */}
      {isBankIncomeActaOpen && (
        <BankIncomeActaModal
          isOpen={isBankIncomeActaOpen}
          onClose={() => setIsBankIncomeActaOpen(false)}
          systemCycle={systemCycle}
          userName={user?.nombre || user?.email?.split('@')[0] || 'Operador de Bancos'}
          companyName="CORPORACION CALENDARIO, CA"
          items={bankTransactionItems}
        />
      )}

      {/* Modal 5: Acta Oficial de Entrega y Rendición de Efectivo */}
      {isCashDeliveryActaOpen && (
        <CashDeliveryActaModal
          isOpen={isCashDeliveryActaOpen}
          onClose={() => setIsCashDeliveryActaOpen(false)}
          systemCycle={systemCycle}
          userName={user?.nombre || user?.email?.split('@')[0] || 'Supervisor de Caja'}
          companyName="CORPORACION CALENDARIO, CA"
          items={cashDeliveryItems}
        />
      )}
    </div>
  );
};

