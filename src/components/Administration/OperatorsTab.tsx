import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { formatCurrency, formatDate } from '../../utils/formatters';
import {
  Trophy,
  Save,
  Plus,
  RefreshCw,
  Layers,
  DollarSign,
  TrendingUp,
  CheckCircle2,
  AlertTriangle,
  History,
  FileText,
  Share2,
  CreditCard,
  Wallet,
  Trash2,
  Percent,
  Banknote,
  Calendar,
  Lock
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { loadSystemKeywords, type SystemKeywordsMap } from '../../utils/systemKeywords';

interface OperadoraResult {
  id: number;
  fecha: string;
  sistema: string;
  moneda: string;
  venta_bruta: number;
  premios: number;
  comision_manual: number;
  participacion_manual: number;
  utilidad_final_casa: number;
}

interface OperatorPayment {
  id: number;
  fecha: string;
  sistema: string;
  moneda: string;
  monto: number;
  referencia: string;
  tipo_pago: 'PAGO_OPERADORA' | 'ABONO_OPERADORA';
  banco?: string;
  agencia?: string;
}

interface OperatorsTabProps {
  initialSubTab?: 'venta' | 'reporte' | 'pagos' | 'cierres';
}

export const OperatorsTab: React.FC<OperatorsTabProps> = ({ initialSubTab = 'venta' }) => {
  const { effectiveUserId, systemCycle } = useAuth();
  const { isLight } = useTheme();

  const [activeSubTab, setActiveSubTab] = useState<'venta' | 'reporte' | 'pagos' | 'cierres'>(initialSubTab);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);

  // Raw data
  const [sales, setSales] = useState<any[]>([]);
  const [history, setHistory] = useState<OperadoraResult[]>([]);
  const [operatorPayments, setOperatorPayments] = useState<OperatorPayment[]>([]);
  const [systemConfigs, setSystemConfigs] = useState<SystemKeywordsMap>({});
  const [registeredSystems, setRegisteredSystems] = useState<string[]>([]);

  // Selection in Venta Tab
  const [selectedSistema, setSelectedSistema] = useState('');
  const [selectedMoneda, setSelectedMoneda] = useState('');

  // Editable parameters for current calculation
  const [comisionPct, setComisionPct] = useState('0');
  const [participacionPct, setParticipacionPct] = useState('0');
  const [saldoInicialManual, setSaldoInicialManual] = useState('0');

  // Filter in Reporte Tab
  const [reportCurrencyFilter, setReportCurrencyFilter] = useState<'ALL' | 'BS' | 'USD' | 'COP'>('ALL');

  // Payment Form States
  const [paySistema, setPaySistema] = useState('');
  const [payMoneda, setPayMoneda] = useState<'BS' | 'USD' | 'COP'>('BS');
  const [payTipo, setPayTipo] = useState<'PAGO_OPERADORA' | 'ABONO_OPERADORA'>('PAGO_OPERADORA');
  const [payMonto, setPayMonto] = useState('');
  const [payMetodo, setPayMetodo] = useState('TRANSFERENCIA');
  const [payReferencia, setPayReferencia] = useState('');
  const [payFecha, setPayFecha] = useState(new Date().toISOString().slice(0, 10));

  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Sync initialSubTab when prop changes
  useEffect(() => {
    if (initialSubTab) {
      setActiveSubTab(initialSubTab);
    }
  }, [initialSubTab]);

  const loadData = useCallback(async () => {
    if (!effectiveUserId) return;
    setIsLoading(true);
    setMessage(null);

    try {
      const [vRes, hRes, sysRes, confs, payRes] = await Promise.all([
        supabase.from('carga_actual').select('*').eq('user_id', effectiveUserId),
        supabase.from('resultados_operadora').select('*').eq('user_id', effectiveUserId).order('id', { ascending: false }),
        supabase.from('sistemas').select('nombre_sistema').eq('user_id', effectiveUserId).order('nombre_sistema', { ascending: true }),
        loadSystemKeywords(effectiveUserId),
        supabase
          .from('pagos_semana')
          .select('*')
          .eq('user_id', effectiveUserId)
          .or('tipo_pago.eq.PAGO_OPERADORA,tipo_pago.eq.ABONO_OPERADORA,agencia.ilike.OPERADORA:%')
          .order('id', { ascending: false })
      ]);

      const salesData = vRes.data || [];
      const sysList = Array.from(new Set([
        ...(sysRes.data?.map((s) => s.nombre_sistema?.toUpperCase()) || []),
        ...(salesData.map((s) => String(s.sistema || '').toUpperCase()).filter(Boolean))
      ])).sort();

      setSales(salesData);
      setHistory(hRes.data || []);
      setRegisteredSystems(sysList);
      setSystemConfigs(confs);

      // Parse operator payments
      const rawPayments = (payRes.data || []).map((p: any) => {
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
          agencia: p.agencia
        };
      });
      setOperatorPayments(rawPayments);

      // Default selection if empty
      if (sysList.length > 0 && !selectedSistema) {
        setSelectedSistema(sysList[0]);
      }
      if (sysList.length > 0 && !paySistema) {
        setPaySistema(sysList[0]);
      }
    } catch (err: any) {
      console.error('Error loading operator data:', err);
      setMessage({ type: 'error', text: err?.message || 'Error al cargar datos de operadora.' });
    } finally {
      setIsLoading(false);
    }
  }, [effectiveUserId, selectedSistema, paySistema]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Available systems for selection
  const availableSystems = useMemo(() => {
    if (registeredSystems.length > 0) return registeredSystems;
    return Array.from(new Set(sales.map((s) => String(s.sistema || '').toUpperCase()))).filter(Boolean).sort();
  }, [registeredSystems, sales]);

  // Available currencies for selected system
  const availableCurrencies = useMemo(() => {
    const currs = Array.from(
      new Set(
        sales
          .filter((s) => String(s.sistema || '').toUpperCase() === selectedSistema)
          .map((s) => String(s.moneda || '').toUpperCase())
      )
    ).filter(Boolean).sort();
    return currs.length > 0 ? currs : ['BS', 'USD', 'COP'];
  }, [sales, selectedSistema]);

  // Auto-select currency when system changes
  useEffect(() => {
    if (availableCurrencies.length > 0 && !availableCurrencies.includes(selectedMoneda)) {
      setSelectedMoneda(availableCurrencies[0]);
    }
  }, [selectedSistema, availableCurrencies, selectedMoneda]);

  // Pre-load commercializer commission and participation when system or currency changes
  useEffect(() => {
    if (!selectedSistema) return;
    const conf = systemConfigs[selectedSistema];
    if (conf) {
      setComisionPct(String(conf.comision_comercializador ?? 0));
      setParticipacionPct(String(conf.participacion_comercializador ?? 0));

      const activeCurr = (selectedMoneda || 'BS').toUpperCase();
      let initBal = 0;
      if (activeCurr === 'BS') initBal = Number(conf.saldo_inicial_bs || 0);
      else if (activeCurr === 'USD') initBal = Number(conf.saldo_inicial_usd || 0);
      else if (activeCurr === 'COP') initBal = Number(conf.saldo_inicial_cop || 0);
      setSaldoInicialManual(String(initBal));
    } else {
      setComisionPct('0');
      setParticipacionPct('0');
      setSaldoInicialManual('0');
    }
  }, [selectedSistema, selectedMoneda, systemConfigs]);

  // Financial aggregates for the selected system and currency
  const financialData = useMemo(() => {
    const matching = sales.filter(
      (s) =>
        String(s.sistema || '').toUpperCase() === selectedSistema &&
        String(s.moneda || '').toUpperCase() === selectedMoneda
    );

    const ventaBruta = Math.round(matching.reduce((sum, curr) => sum + Number(curr.venta || 0), 0) * 100) / 100;
    const premios = Math.round(matching.reduce((sum, curr) => sum + Number(curr.premios || 0), 0) * 100) / 100;
    const utilidadBruta = Math.round((ventaBruta - premios) * 100) / 100; // GGR

    // Comisión pagada a las agencias en taquillas (de carga_actual)
    const comisionAgencias = Math.round(matching.reduce((sum, curr) => sum + Number(curr.comision || 0), 0) * 100) / 100;
    const comisionAgenciasPct = ventaBruta > 0 ? Math.round((comisionAgencias / ventaBruta) * 10000) / 100 : 0;

    const cPct = Number(comisionPct) || 0; // % Comisión otorgada por proveedor (ej: 16%)
    const pPct = Number(participacionPct) || 0; // % Participación comercializador (ej: 40%)

    // 1. Comisión Completa Otorgada por Proveedor
    const comisionCompletaProveedor = Math.round(ventaBruta * (cPct / 100) * 100) / 100;

    // 2. Diferencial de Comisión del Comercializador = Comisión Proveedor - Comisión Agencias
    const diferencialComision = Math.round((comisionCompletaProveedor - comisionAgencias) * 100) / 100;
    const diferencialPct = Math.round((cPct - comisionAgenciasPct) * 100) / 100;

    // 3. Base de Utilidad (Opción B: GGR - Comisión Completa 16%)
    const baseUtilidad = Math.round((utilidadBruta - comisionCompletaProveedor) * 100) / 100;

    // 4. Participación Comercializador = Base de Utilidad * (pPct / 100)
    // (40% de la base neta; suma si la base es positiva, resta si es negativa)
    const participacionComercializador = Math.round(baseUtilidad * (pPct / 100) * 100) / 100;

    // 5. Total Ganancia Comercializador = Diferencial de Comisión + Participación Comercializador
    const gananciaTotalComercializador = Math.round((diferencialComision + participacionComercializador) * 100) / 100;

    // 6. Participación Neta Casa Operadora (60% restante de la base de utilidad)
    const operadoraPartPct = 100 - pPct;
    const utilidadNetaOperadora = Math.round(baseUtilidad * (operadoraPartPct / 100) * 100) / 100;

    // 7. Pagos a la operadora de esta semana en este sistema y moneda
    const sysPayments = operatorPayments.filter(
      (p) =>
        p.sistema === selectedSistema &&
        p.moneda === selectedMoneda
    );
    const pagosRealizados = Math.round(sysPayments.filter((p) => p.tipo_pago === 'PAGO_OPERADORA').reduce((sum, p) => sum + p.monto, 0) * 100) / 100;
    const abonosRecibidos = Math.round(sysPayments.filter((p) => p.tipo_pago === 'ABONO_OPERADORA').reduce((sum, p) => sum + p.monto, 0) * 100) / 100;
    const pagosNetos = Math.round((pagosRealizados - abonosRecibidos) * 100) / 100;

    // 8. Cuenta Corriente: Saldo Inicial + Utilidad Operadora - Pagos Netos
    const saldoInicial = Number(saldoInicialManual) || 0;
    const balanceFinal = Math.round((saldoInicial + utilidadNetaOperadora - pagosNetos) * 100) / 100;

    return {
      ventaBruta,
      premios,
      utilidadBruta,
      comisionAgencias,
      comisionAgenciasPct,
      comisionCompletaProveedor,
      diferencialComision,
      diferencialPct,
      baseUtilidad,
      participacionComercializador,
      gananciaTotalComercializador,
      operadoraPartPct,
      utilidadNetaOperadora,
      saldoInicial,
      pagosRealizados,
      abonosRecibidos,
      pagosNetos,
      balanceFinal,
    };
  }, [sales, selectedSistema, selectedMoneda, comisionPct, participacionPct, saldoInicialManual, operatorPayments]);

  // Consolidate all systems for the Report Tab
  const reportRows = useMemo(() => {
    const rows: any[] = [];
    const allCurrencies = ['BS', 'USD', 'COP'];

    availableSystems.forEach((sys) => {
      const conf = systemConfigs[sys] || {
        comision_comercializador: 0,
        participacion_comercializador: 0,
        saldo_inicial_bs: 0,
        saldo_inicial_usd: 0,
        saldo_inicial_cop: 0,
      };

      allCurrencies.forEach((curr) => {
        if (reportCurrencyFilter !== 'ALL' && reportCurrencyFilter !== curr) return;

        const matching = sales.filter(
          (s) => String(s.sistema || '').toUpperCase() === sys && String(s.moneda || '').toUpperCase() === curr
        );

        let saldoInit = 0;
        if (curr === 'BS') saldoInit = Number(conf.saldo_inicial_bs || 0);
        else if (curr === 'USD') saldoInit = Number(conf.saldo_inicial_usd || 0);
        else if (curr === 'COP') saldoInit = Number(conf.saldo_inicial_cop || 0);

        const sysPayments = operatorPayments.filter((p) => p.sistema === sys && p.moneda === curr);
        const pagosRealizados = sysPayments.filter((p) => p.tipo_pago === 'PAGO_OPERADORA').reduce((sum, p) => sum + p.monto, 0);
        const abonosRecibidos = sysPayments.filter((p) => p.tipo_pago === 'ABONO_OPERADORA').reduce((sum, p) => sum + p.monto, 0);
        const pagosNetos = pagosRealizados - abonosRecibidos;

        const venta = matching.reduce((sum, currItem) => sum + Number(currItem.venta || 0), 0);
        const premio = matching.reduce((sum, currItem) => sum + Number(currItem.premios || 0), 0);

        // Include row if there is activity, initial balance or payments
        if (venta > 0 || premio > 0 || saldoInit !== 0 || pagosNetos !== 0) {
          const uBruta = venta - premio;
          const comAgencias = Math.round(matching.reduce((sum, currItem) => sum + Number(currItem.comision || 0), 0) * 100) / 100;
          const cPct = Number(conf.comision_comercializador || 0);
          const pPct = Number(conf.participacion_comercializador || 0);

          const comCompletaProv = Math.round(venta * (cPct / 100) * 100) / 100;
          const difCom = Math.round((comCompletaProv - comAgencias) * 100) / 100;
          const baseUtil = Math.round((uBruta - comCompletaProv) * 100) / 100;
          const partCom = Math.round(baseUtil * (pPct / 100) * 100) / 100;
          const totalCom = Math.round((difCom + partCom) * 100) / 100;
          const netoOperadora = Math.round(baseUtil * ((100 - pPct) / 100) * 100) / 100;
          const balanceFinal = Math.round((saldoInit + netoOperadora - pagosNetos) * 100) / 100;

          rows.push({
            sistema: sys,
            moneda: curr,
            venta,
            premio,
            utilidadBruta: uBruta,
            comisionPct: cPct,
            comCompletaProv,
            comAgencias,
            difCom,
            baseUtil,
            participacionPct: pPct,
            partCom,
            totalCom,
            netoOperadora,
            saldoInit,
            pagosNetos,
            balanceFinal,
          });
        }
      });
    });

    return rows;
  }, [availableSystems, systemConfigs, sales, operatorPayments, reportCurrencyFilter]);

  // Report Totals
  const reportTotals = useMemo(() => {
    return reportRows.reduce(
      (acc, r) => ({
        venta: acc.venta + r.venta,
        premios: acc.premios + r.premio,
        difCom: acc.difCom + r.difCom,
        totalComercializador: acc.totalComercializador + r.totalCom,
        netoOperadora: acc.netoOperadora + r.netoOperadora,
        balanceFinal: acc.balanceFinal + r.balanceFinal,
      }),
      { venta: 0, premios: 0, difCom: 0, totalComercializador: 0, netoOperadora: 0, balanceFinal: 0 }
    );
  }, [reportRows]);

  // Save Settlement with Commercializer
  const handleSaveSettlement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!effectiveUserId || !selectedSistema || !selectedMoneda) return;

    setIsProcessing(true);

    try {
      const payload = {
        user_id: effectiveUserId,
        fecha: new Date().toISOString().slice(0, 10),
        sistema: selectedSistema,
        moneda: selectedMoneda,
        venta_bruta: financialData.ventaBruta,
        premios: financialData.premios,
        comision_manual: financialData.diferencialComision,
        participacion_manual: financialData.participacionComercializador,
        utilidad_final_casa: financialData.utilidadNetaOperadora,
      };

      const { error } = await supabase.from('resultados_operadora').insert(payload);
      if (error) throw error;

      confetti({ particleCount: 50, spread: 60 });
      setMessage({
        type: 'success',
        text: `¡Liquidación de ${selectedSistema} (${selectedMoneda}) guardada! Comercializador: ${formatCurrency(financialData.gananciaTotalComercializador, selectedMoneda as any)} | Balance Operadora: ${formatCurrency(financialData.balanceFinal, selectedMoneda as any)}`
      });

      await loadData();
    } catch (err: any) {
      console.error('Error saving operator settlement:', err);
      setMessage({ type: 'error', text: err?.message || 'Error al guardar liquidación de operadora.' });
    } finally {
      setIsProcessing(false);
    }
  };

  // Add Operator Payment
  const handleAddPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = Number(payMonto);
    if (!effectiveUserId || !paySistema || isNaN(amountNum) || amountNum <= 0) {
      alert('Por favor ingrese un monto válido mayor a 0 y seleccione el proveedor.');
      return;
    }

    setIsProcessing(true);
    try {
      const payload = {
        user_id: effectiveUserId,
        agencia: `OPERADORA: ${paySistema}`,
        monto: amountNum,
        moneda: payMoneda,
        tipo_pago: payTipo,
        referencia: payReferencia.trim() || 'TRANSFERENCIA',
        fecha: payFecha,
      };

      const { error } = await supabase.from('pagos_semana').insert(payload);
      if (error) throw error;

      setMessage({
        type: 'success',
        text: `✅ ${payTipo === 'PAGO_OPERADORA' ? 'Pago a Operadora' : 'Abono de Operadora'} de ${formatCurrency(amountNum, payMoneda)} (${paySistema}) registrado exitosamente.`
      });

      setPayMonto('');
      setPayReferencia('');
      await loadData();
    } catch (err: any) {
      console.error('Error adding operator payment:', err);
      alert('Error al registrar pago: ' + (err?.message || 'Error desconocido'));
    } finally {
      setIsProcessing(false);
    }
  };

  // Delete Operator Payment
  const handleDeletePayment = async (id: number) => {
    if (!window.confirm('¿Está seguro de eliminar este registro de pago a operadora?')) return;
    try {
      const { error } = await supabase.from('pagos_semana').delete().eq('id', id).eq('user_id', effectiveUserId);
      if (error) throw error;
      setOperatorPayments((prev) => prev.filter((p) => p.id !== id));
      setMessage({ type: 'success', text: 'Registro de pago eliminado.' });
    } catch (err: any) {
      alert('Error al eliminar: ' + err?.message);
    }
  };

  // Share WhatsApp Report
  const handleShareWhatsApp = () => {
    if (reportRows.length === 0) {
      alert('No hay datos en el reporte para exportar.');
      return;
    }

    const lines = [
      `📊 *REPORTE DE OPERADORA • MULTIBANCA EXPRESS*`,
      `📅 *Semana:* ${systemCycle.semana} (${formatDate(systemCycle.desde)} al ${formatDate(systemCycle.hasta)})`,
      `🪙 *Moneda:* ${reportCurrencyFilter === 'ALL' ? 'CONSOLIDADO MULTIMONEDA' : reportCurrencyFilter}`,
      `━━━━━━━━━━━━━━━━━━━━━━━━`,
    ];

    reportRows.forEach((r) => {
      lines.push(
        `🎰 *SISTEMA: ${r.sistema} (${r.moneda})*`,
        `• Venta Bruta: ${formatCurrency(r.venta, r.moneda)}`,
        `• Premios: ${formatCurrency(r.premio, r.moneda)}`,
        `• Utilidad Bruta (GGR): ${formatCurrency(r.utilidadBruta, r.moneda)}`,
        `• Com. Proveedor (${r.comisionPct}%): ${formatCurrency(r.comCompletaProv, r.moneda)}`,
        `• (-) Com. Pagada Agencias: ${formatCurrency(r.comAgencias, r.moneda)}`,
        `• (=) Diferencial a tu favor: ${formatCurrency(r.difCom, r.moneda)}`,
        `• Base Utilidad Neta (GGR - Com 16%): ${formatCurrency(r.baseUtil, r.moneda)}`,
        `• Participación Comercializador (${r.participacionPct}%): ${formatCurrency(r.partCom, r.moneda)}`,
        `• 🏆 *Total Ganancia Comercializador:* ${formatCurrency(r.totalCom, r.moneda)}`,
        `• 🏛️ *Utilidad Neta Operadora:* ${formatCurrency(r.netoOperadora, r.moneda)}`,
        `• Saldo Inicial Arrastre: ${formatCurrency(r.saldoInit, r.moneda)}`,
        `• Pagos Realizados: ${formatCurrency(r.pagosNetos, r.moneda)}`,
        `• 👉 *BALANCE FINAL: ${formatCurrency(r.balanceFinal, r.moneda)}* ${r.balanceFinal > 0 ? '(Debe a Operadora)' : r.balanceFinal < 0 ? '(A Favor Comercializador)' : '(Al Día)'}`,
        `────────────────────────`
      );
    });

    lines.push(
      `💼 *RESUMEN TOTALIZADO:*`,
      `• Venta Global: ${formatCurrency(reportTotals.venta, 'BS')}`,
      `• Premios Globales: ${formatCurrency(reportTotals.premios, 'BS')}`,
      `• Total Diferencial Comisión: ${formatCurrency(reportTotals.difCom, 'BS')}`,
      `• Total Comercializador: ${formatCurrency(reportTotals.totalComercializador, 'BS')}`,
      `• Total Neto Operadoras: ${formatCurrency(reportTotals.netoOperadora, 'BS')}`,
      `━━━━━━━━━━━━━━━━━━━━━━━━`,
      `_Generado por Operadora CMS_`
    );

    const fullText = lines.join('\n');
    navigator.clipboard.writeText(fullText);
    alert('📋 ¡Reporte de Operadora copiado al portapapeles! Puedes pegarlo directamente en WhatsApp.');
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2">
            <span className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <Trophy className="w-5 h-5" />
            </span>
            <span>Liquidación y Reporte de Operadora</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Gestión comercial y conciliación de cuentas corrientes entre la Operadora (Casa Matriz) y el Comercializador.
          </p>
        </div>

        <button
          onClick={() => loadData()}
          disabled={isLoading}
          className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex items-center gap-1.5 transition-all border border-slate-700 cursor-pointer disabled:opacity-50 self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          Actualizar
        </button>
      </div>

      {/* Main Navigation Sub-Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
        <button
          onClick={() => setActiveSubTab('venta')}
          className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
            activeSubTab === 'venta'
              ? 'bg-amber-500 text-slate-950 font-black shadow-md'
              : 'bg-[#0D1B22] text-slate-400 hover:text-white border border-slate-800'
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          <span>Venta Operadora</span>
        </button>

        <button
          onClick={() => setActiveSubTab('reporte')}
          className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
            activeSubTab === 'reporte'
              ? 'bg-emerald-500 text-slate-950 font-black shadow-md'
              : 'bg-[#0D1B22] text-slate-400 hover:text-white border border-slate-800'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>Reporte Operadora</span>
        </button>

        <button
          onClick={() => setActiveSubTab('pagos')}
          className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
            activeSubTab === 'pagos'
              ? 'bg-cyan-500 text-slate-950 font-black shadow-md'
              : 'bg-[#0D1B22] text-slate-400 hover:text-white border border-slate-800'
          }`}
        >
          <CreditCard className="w-4 h-4" />
          <span>Pagos a Operador ({operatorPayments.length})</span>
        </button>

        <button
          onClick={() => setActiveSubTab('cierres')}
          className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
            activeSubTab === 'cierres'
              ? 'bg-purple-600 text-white font-black shadow-md'
              : 'bg-[#0D1B22] text-slate-400 hover:text-white border border-slate-800'
          }`}
        >
          <History className="w-4 h-4" />
          <span>Historial de Cierres ({history.length})</span>
        </button>
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

      {/* ==============================================================
          TAB 1: VENTA OPERADORA (LIQUIDACIÓN POR SISTEMA Y MONEDA)
          ============================================================== */}
      {activeSubTab === 'venta' && (
        <div className="space-y-6">
          {availableSystems.length === 0 ? (
            <div className="bg-[#0D1B22] border border-slate-800 rounded-3xl p-12 text-center space-y-3">
              <Trophy className="w-12 h-12 text-slate-600 mx-auto" />
              <h4 className="text-base font-bold text-white">No hay sistemas o ventas registradas</h4>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                Registra proveedores en el módulo de Config. Proveedores o importa ventas en Cargar Ventas.
              </p>
            </div>
          ) : (
            <div className="bg-[#0D1B22] border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl space-y-6">
              {/* Selectors: Sistema & Moneda */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">🎯 Seleccionar Sistema / Proveedor</label>
                  <select
                    value={selectedSistema}
                    onChange={(e) => setSelectedSistema(e.target.value)}
                    className="w-full bg-[#071217] border border-slate-700 rounded-xl px-4 py-2.5 text-xs text-white font-bold focus:outline-none focus:border-amber-500"
                  >
                    {availableSystems.map((s) => (
                      <option key={s} value={s}>
                        🎰 {s}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">🪙 Moneda</label>
                  <select
                    value={selectedMoneda}
                    onChange={(e) => setSelectedMoneda(e.target.value)}
                    className="w-full bg-[#071217] border border-slate-700 rounded-xl px-4 py-2.5 text-xs text-white font-bold focus:outline-none focus:border-amber-500"
                  >
                    {availableCurrencies.map((m) => (
                      <option key={m} value={m}>
                        {m === 'BS' ? '🇻🇪 BS' : m === 'USD' ? '💵 USD' : '🇨🇴 COP'}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Aggregates Metrics Banner */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                <div className="bg-[#071217] border border-slate-800 rounded-2xl p-4 text-center">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Venta Bruta</div>
                  <div className="text-xl sm:text-2xl font-black text-white font-mono mt-1">
                    {formatCurrency(financialData.ventaBruta, selectedMoneda as any)}
                  </div>
                </div>

                <div className="bg-[#071217] border border-slate-800 rounded-2xl p-4 text-center">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-rose-400">Premios Pagados</div>
                  <div className="text-xl sm:text-2xl font-black text-rose-400 font-mono mt-1">
                    {formatCurrency(financialData.premios, selectedMoneda as any)}
                  </div>
                </div>

                <div className="bg-[#071217] border border-slate-800 rounded-2xl p-4 text-center">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-300">Utilidad Bruta (GGR)</div>
                  <div className="text-xl sm:text-2xl font-black text-white font-mono mt-1">
                    {formatCurrency(financialData.utilidadBruta, selectedMoneda as any)}
                  </div>
                </div>
              </div>

              {/* Commercializer Conditions Form */}
              <form onSubmit={handleSaveSettlement} className="space-y-6 pt-2 border-t border-slate-800">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                    <TrendingUp className="w-4 h-4" />
                    <span>Condiciones del Comercializador (Configuración de Proveedores)</span>
                  </h4>
                  <span className="text-[11px] text-slate-400 flex items-center gap-1.5 bg-[#071217] px-3 py-1 rounded-xl border border-slate-800">
                    <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span>Valores protegidos • Solo se modifican en <strong>Catálogos &gt; Config. Proveedores</strong></span>
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {/* Comisión Comercializador (Proveedor) */}
                  <div className="space-y-1.5 bg-[#071217] p-3.5 rounded-2xl border border-amber-500/30">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-amber-300 flex items-center gap-1">
                        <Percent className="w-3.5 h-3.5" />
                        <span>Comisión Proveedor</span>
                      </label>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-mono font-bold flex items-center gap-1">
                        <Lock className="w-2.5 h-2.5" />
                        Bloqueada ({comisionPct}%)
                      </span>
                    </div>
                    <div className="relative">
                      <input
                        type="text"
                        readOnly
                        disabled
                        value={`${comisionPct}%`}
                        className="w-full bg-[#0D1B22]/90 border border-amber-500/30 rounded-xl px-3.5 py-2 text-xs text-amber-200 font-mono font-black cursor-not-allowed select-none"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-500 font-mono">
                        {financialData.comisionAgenciasPct}% a Agencias
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-400 space-y-0.5 pt-1.5 border-t border-slate-800">
                      <div className="flex justify-between">
                        <span>• Otorgada ({comisionPct}%):</span>
                        <strong className="text-slate-300 font-mono">{formatCurrency(financialData.comisionCompletaProveedor, selectedMoneda as any)}</strong>
                      </div>
                      <div className="flex justify-between">
                        <span>• (-) Agencias ({financialData.comisionAgenciasPct}%):</span>
                        <strong className="text-rose-400 font-mono">-{formatCurrency(financialData.comisionAgencias, selectedMoneda as any)}</strong>
                      </div>
                      <div className="flex justify-between font-bold text-amber-300 pt-1 border-t border-slate-800/80">
                        <span>(=) Diferencial ({financialData.diferencialPct}%):</span>
                        <strong className="font-mono">{formatCurrency(financialData.diferencialComision, selectedMoneda as any)}</strong>
                      </div>
                    </div>
                  </div>

                  {/* Participación Comercializador */}
                  <div className="space-y-1.5 bg-[#071217] p-3.5 rounded-2xl border border-indigo-500/30">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-indigo-300 flex items-center gap-1">
                        <Percent className="w-3.5 h-3.5" />
                        <span>Participación Comercializador</span>
                      </label>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 font-mono font-bold flex items-center gap-1">
                        <Lock className="w-2.5 h-2.5" />
                        Bloqueada ({participacionPct}%)
                      </span>
                    </div>
                    <div className="relative">
                      <input
                        type="text"
                        readOnly
                        disabled
                        value={`${participacionPct}%`}
                        className="w-full bg-[#0D1B22]/90 border border-indigo-500/30 rounded-xl px-3.5 py-2 text-xs text-indigo-200 font-mono font-black cursor-not-allowed select-none"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-500 font-mono">
                        Casa {financialData.operadoraPartPct}%
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-400 space-y-0.5 pt-1.5 border-t border-slate-800">
                      <div className="flex justify-between">
                        <span>• Base Neta (GGR - Com {comisionPct}%):</span>
                        <strong className={`font-mono ${financialData.baseUtilidad >= 0 ? 'text-slate-300' : 'text-rose-400'}`}>
                          {formatCurrency(financialData.baseUtilidad, selectedMoneda as any)}
                        </strong>
                      </div>
                      <div className="flex justify-between font-bold text-indigo-300 pt-1 border-t border-slate-800/80">
                        <span>(±) Tu {participacionPct}%:</span>
                        <strong className={`font-mono ${financialData.participacionComercializador >= 0 ? 'text-indigo-300' : 'text-rose-400'}`}>
                          {formatCurrency(financialData.participacionComercializador, selectedMoneda as any)}
                        </strong>
                      </div>
                      <div className="flex justify-between text-slate-400">
                        <span>• Operadora ({financialData.operadoraPartPct}%):</span>
                        <strong className="text-emerald-400 font-mono">{formatCurrency(financialData.utilidadNetaOperadora, selectedMoneda as any)}</strong>
                      </div>
                    </div>
                  </div>

                  {/* Saldo Inicial Proveedor */}
                  <div className="space-y-1.5 bg-[#071217] p-3.5 rounded-2xl border border-slate-700">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-300 flex items-center gap-1">
                        <Wallet className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Saldo Inicial (Arrastre)</span>
                      </label>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-400 font-mono font-bold flex items-center gap-1">
                        <Lock className="w-2.5 h-2.5" />
                        {selectedMoneda}
                      </span>
                    </div>
                    <div className="relative">
                      <input
                        type="text"
                        readOnly
                        disabled
                        value={formatCurrency(Number(saldoInicialManual) || 0, selectedMoneda as any)}
                        className="w-full bg-[#0D1B22]/90 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-emerald-300 font-mono font-bold cursor-not-allowed select-none"
                      />
                    </div>
                    <div className="text-[10px] text-slate-400 space-y-0.5 pt-1.5 border-t border-slate-800">
                      <div>Arrastre fijado en Config. Proveedores.</div>
                    </div>
                  </div>
                </div>

                {/* Net Breakdown Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Ganancia Comercializador */}
                  <div className="p-5 rounded-2xl bg-gradient-to-br from-amber-500/10 via-[#071217] to-amber-500/5 border border-amber-500/40 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-black uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                        <Trophy className="w-4 h-4" />
                        <span>Total Ganancia Comercializador</span>
                      </div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                        Tu Utilidad
                      </span>
                    </div>

                    <div className="text-2xl sm:text-3xl font-black font-mono text-amber-300">
                      {formatCurrency(financialData.gananciaTotalComercializador, selectedMoneda as any)}
                    </div>

                    <div className="bg-[#0D1B22] p-3 rounded-xl border border-amber-500/20 space-y-1 text-xs font-mono">
                      <div className="flex justify-between text-slate-300">
                        <span>(+) Diferencial de Comisión:</span>
                        <strong className="text-amber-300 font-bold">{formatCurrency(financialData.diferencialComision, selectedMoneda as any)}</strong>
                      </div>
                      <div className="text-[10px] text-slate-500 pl-2">
                        ({comisionPct}% Proveedor - {financialData.comisionAgenciasPct}% Agencias = +{financialData.diferencialPct}%)
                      </div>
                      <div className="flex justify-between text-slate-300 pt-1 border-t border-slate-800">
                        <span>(±) Participación Comercializador ({participacionPct}%):</span>
                        <strong className={financialData.participacionComercializador >= 0 ? 'text-indigo-300 font-bold' : 'text-rose-400 font-bold'}>
                          {formatCurrency(financialData.participacionComercializador, selectedMoneda as any)}
                        </strong>
                      </div>
                      <div className="text-[10px] text-slate-500 pl-2">
                        (Sobre Base Neta de Utilidad: {formatCurrency(financialData.baseUtilidad, selectedMoneda as any)})
                      </div>
                      <div className="flex justify-between text-white font-bold pt-1.5 border-t border-amber-500/30 text-sm">
                        <span>(=) Ganancia Total Final:</span>
                        <span className="text-amber-300">{formatCurrency(financialData.gananciaTotalComercializador, selectedMoneda as any)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Utilidad Operadora */}
                  <div className="p-5 rounded-2xl bg-gradient-to-br from-emerald-500/10 via-[#071217] to-emerald-500/5 border border-emerald-500/40 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                        <Layers className="w-4 h-4" />
                        <span>Liquidación Casa Operadora (Proveedor)</span>
                      </div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        Casa Matriz ({financialData.operadoraPartPct}%)
                      </span>
                    </div>

                    <div className={`text-2xl sm:text-3xl font-black font-mono ${financialData.utilidadNetaOperadora >= 0 ? 'text-emerald-300' : 'text-rose-400'}`}>
                      {formatCurrency(financialData.utilidadNetaOperadora, selectedMoneda as any)}
                    </div>

                    <div className="bg-[#0D1B22] p-3 rounded-xl border border-emerald-500/20 space-y-1 text-xs font-mono">
                      <div className="flex justify-between text-slate-300">
                        <span>Venta Bruta:</span>
                        <strong className="text-white font-bold">{formatCurrency(financialData.ventaBruta, selectedMoneda as any)}</strong>
                      </div>
                      <div className="flex justify-between text-slate-300">
                        <span>(-) Premios Pagados:</span>
                        <strong className="text-rose-400 font-bold">-{formatCurrency(financialData.premios, selectedMoneda as any)}</strong>
                      </div>
                      <div className="flex justify-between text-slate-300">
                        <span>(-) Comisión Completa Proveedor ({comisionPct}%):</span>
                        <strong className="text-amber-400 font-bold">-{formatCurrency(financialData.comisionCompletaProveedor, selectedMoneda as any)}</strong>
                      </div>
                      <div className="flex justify-between text-emerald-400 font-bold pt-1.5 border-t border-emerald-500/30 text-sm">
                        <span>(=) Utilidad Neta Casa ({financialData.operadoraPartPct}%):</span>
                        <span className={financialData.utilidadNetaOperadora >= 0 ? 'text-emerald-300' : 'text-rose-400'}>
                          {formatCurrency(financialData.utilidadNetaOperadora, selectedMoneda as any)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Estado de Cuenta & Cuadre con Pagos */}
                <div className="p-5 rounded-2xl bg-[#071217] border border-cyan-500/30 space-y-4">
                  <div className="text-xs font-bold uppercase tracking-wider text-cyan-400 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <CreditCard className="w-4 h-4" />
                      Cuenta Corriente con el Proveedor (Conciliación de Cartera)
                    </span>
                    <button
                      type="button"
                      onClick={() => setActiveSubTab('pagos')}
                      className="text-[11px] text-cyan-400 hover:underline cursor-pointer flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3" />
                      Registrar Pago a Operador
                    </button>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
                    <div className="p-3 rounded-xl bg-[#0D1B22] border border-slate-800">
                      <div className="text-[10px] text-slate-400">Saldo Inicial (Arrastre)</div>
                      <div className="font-bold text-white text-sm mt-1">{formatCurrency(financialData.saldoInicial, selectedMoneda as any)}</div>
                    </div>
                    <div className="p-3 rounded-xl bg-[#0D1B22] border border-slate-800">
                      <div className="text-[10px] text-slate-400">(±) Utilidad Neta Operadora</div>
                      <div className={`font-bold text-sm mt-1 ${financialData.utilidadNetaOperadora >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {formatCurrency(financialData.utilidadNetaOperadora, selectedMoneda as any)}
                      </div>
                    </div>
                    <div className="p-3 rounded-xl bg-[#0D1B22] border border-slate-800">
                      <div className="text-[10px] text-slate-400">(-) Pagos Realizados</div>
                      <div className="font-bold text-rose-400 text-sm mt-1">{formatCurrency(financialData.pagosNetos, selectedMoneda as any)}</div>
                    </div>
                    <div className="p-3 rounded-xl bg-[#0D1B22] border border-cyan-500/40">
                      <div className="text-[10px] text-cyan-400 font-bold">(=) Balance Final</div>
                      <div className={`font-black text-base mt-1 ${financialData.balanceFinal > 0 ? 'text-rose-400' : financialData.balanceFinal < 0 ? 'text-cyan-400' : 'text-emerald-400'}`}>
                        {formatCurrency(financialData.balanceFinal, selectedMoneda as any)}
                      </div>
                      <span className="text-[9px] font-sans text-slate-400 block mt-0.5">
                        {financialData.balanceFinal > 0 ? '🔴 Por Pagar a Operadora' : financialData.balanceFinal < 0 ? '🟢 A Favor Comercializador' : '✅ Cuenta al Día'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={isProcessing}
                    className="px-6 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20 flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
                  >
                    <Save className="w-4 h-4" />
                    {isProcessing ? 'Guardando...' : 'Guardar Cierre con Operadora'}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      )}

      {/* ==============================================================
          TAB 2: REPORTE OPERADORA (CONSOLIDADO GENERAL)
          ============================================================== */}
      {activeSubTab === 'reporte' && (
        <div className="space-y-6">
          {/* Controls: Currency filter and Export */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-[#0D1B22] border border-slate-800 p-4 rounded-2xl">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-300">Moneda:</span>
              <div className="flex items-center gap-1 bg-[#071217] p-1 rounded-xl border border-slate-800">
                {(['ALL', 'BS', 'USD', 'COP'] as const).map((curr) => (
                  <button
                    key={curr}
                    onClick={() => setReportCurrencyFilter(curr)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      reportCurrencyFilter === curr
                        ? 'bg-emerald-500 text-slate-950 shadow'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {curr === 'ALL' ? 'Todas' : curr}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={handleShareWhatsApp}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-2 transition-all cursor-pointer shadow-md"
            >
              <Share2 className="w-4 h-4" />
              <span>Enviar Reporte WhatsApp</span>
            </button>
          </div>

          {/* KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-[#0D1B22] border border-slate-800 p-4 rounded-2xl text-center">
              <span className="text-[11px] font-bold uppercase text-slate-400 block">Venta Global</span>
              <span className="text-xl font-black font-mono text-white mt-1 block">
                {formatCurrency(reportTotals.venta, 'BS')}
              </span>
            </div>
            <div className="bg-[#0D1B22] border border-slate-800 p-4 rounded-2xl text-center">
              <span className="text-[11px] font-bold uppercase text-rose-400 block">Premios Pagados</span>
              <span className="text-xl font-black font-mono text-rose-400 mt-1 block">
                {formatCurrency(reportTotals.premios, 'BS')}
              </span>
            </div>
            <div className="bg-[#0D1B22] border border-amber-500/30 p-4 rounded-2xl text-center bg-amber-500/5">
              <span className="text-[11px] font-bold uppercase text-amber-400 block">Total Comercializador</span>
              <span className="text-xl font-black font-mono text-amber-300 mt-1 block">
                {formatCurrency(reportTotals.totalComercializador, 'BS')}
              </span>
            </div>
            <div className="bg-[#0D1B22] border border-emerald-500/30 p-4 rounded-2xl text-center bg-emerald-500/5">
              <span className="text-[11px] font-bold uppercase text-emerald-400 block">Neto Operadoras</span>
              <span className="text-xl font-black font-mono text-emerald-300 mt-1 block">
                {formatCurrency(reportTotals.netoOperadora, 'BS')}
              </span>
            </div>
          </div>

          {/* Consolidate Table */}
          <div className="bg-[#0D1B22] border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
            <div className="p-4 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-300">
                Liquidación General Dual por Proveedor y Moneda ({reportRows.length})
              </h4>
              <span className="text-[11px] text-slate-400">Modelo Opción B: Participación sobre utilidad después de comisión completa 16%</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 bg-[#071217] text-slate-400 font-bold uppercase text-[10px]">
                    <th className="py-3 px-3 whitespace-nowrap">Sistema</th>
                    <th className="py-3 px-2 whitespace-nowrap">Moneda</th>
                    <th className="py-3 px-3 whitespace-nowrap">Venta Bruta</th>
                    <th className="py-3 px-3 whitespace-nowrap">Premios</th>
                    <th className="py-3 px-3 whitespace-nowrap">GGR</th>
                    <th className="py-3 px-3 whitespace-nowrap">Com. Prov.</th>
                    <th className="py-3 px-3 whitespace-nowrap">Com. Agencias</th>
                    <th className="py-3 px-3 whitespace-nowrap text-amber-300">Dif. Com.</th>
                    <th className="py-3 px-3 whitespace-nowrap">Base Neta</th>
                    <th className="py-3 px-3 whitespace-nowrap text-indigo-300">Part. Comerc.</th>
                    <th className="py-3 px-3 whitespace-nowrap text-amber-400 font-black">Total Comerc.</th>
                    <th className="py-3 px-3 whitespace-nowrap text-emerald-400">Neto Casa</th>
                    <th className="py-3 px-3 whitespace-nowrap">Saldo Inicial</th>
                    <th className="py-3 px-3 whitespace-nowrap">Pagos</th>
                    <th className="py-3 px-3 text-right whitespace-nowrap">Balance Final</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                  {reportRows.length === 0 ? (
                    <tr>
                      <td colSpan={15} className="py-8 text-center text-slate-500 font-sans">
                        No hay registros de ventas o proveedores para este filtro.
                      </td>
                    </tr>
                  ) : (
                    reportRows.map((r, idx) => (
                      <tr key={idx} className="hover:bg-slate-800/30 transition-colors">
                        <td className="py-3 px-3 font-sans font-bold text-white whitespace-nowrap">🎰 {r.sistema}</td>
                        <td className="py-3 px-2 whitespace-nowrap">
                          <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-bold text-[10px]">
                            {r.moneda}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-white font-bold whitespace-nowrap">{formatCurrency(r.venta, r.moneda)}</td>
                        <td className="py-3 px-3 text-rose-400 whitespace-nowrap">{formatCurrency(r.premio, r.moneda)}</td>
                        <td className="py-3 px-3 text-slate-300 whitespace-nowrap">{formatCurrency(r.utilidadBruta, r.moneda)}</td>
                        <td className="py-3 px-3 text-slate-400 whitespace-nowrap">
                          {formatCurrency(r.comCompletaProv, r.moneda)} <span className="text-[9px] text-slate-500">({r.comisionPct}%)</span>
                        </td>
                        <td className="py-3 px-3 text-rose-400 whitespace-nowrap">-{formatCurrency(r.comAgencias, r.moneda)}</td>
                        <td className="py-3 px-3 text-amber-300 font-bold whitespace-nowrap">{formatCurrency(r.difCom, r.moneda)}</td>
                        <td className={`py-3 px-3 whitespace-nowrap ${r.baseUtil >= 0 ? 'text-slate-300' : 'text-rose-400'}`}>
                          {formatCurrency(r.baseUtil, r.moneda)}
                        </td>
                        <td className={`py-3 px-3 whitespace-nowrap ${r.partCom >= 0 ? 'text-indigo-300' : 'text-rose-400'}`}>
                          {formatCurrency(r.partCom, r.moneda)} <span className="text-[9px] text-slate-500">({r.participacionPct}%)</span>
                        </td>
                        <td className="py-3 px-3 text-amber-300 font-black whitespace-nowrap">{formatCurrency(r.totalCom, r.moneda)}</td>
                        <td className={`py-3 px-3 font-bold whitespace-nowrap ${r.netoOperadora >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {formatCurrency(r.netoOperadora, r.moneda)}
                        </td>
                        <td className="py-3 px-3 text-slate-400 whitespace-nowrap">{formatCurrency(r.saldoInit, r.moneda)}</td>
                        <td className="py-3 px-3 text-rose-300 whitespace-nowrap">{formatCurrency(r.pagosNetos, r.moneda)}</td>
                        <td className="py-3 px-3 text-right whitespace-nowrap">
                          <span className={`font-black text-xs ${r.balanceFinal > 0 ? 'text-rose-400' : r.balanceFinal < 0 ? 'text-cyan-400' : 'text-emerald-400'}`}>
                            {formatCurrency(r.balanceFinal, r.moneda)}
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
      )}

      {/* ==============================================================
          TAB 3: PAGOS A OPERADOR (REGISTRO Y CUENTA CORRIENTE)
          ============================================================== */}
      {activeSubTab === 'pagos' && (
        <div className="space-y-6">
          {/* Add Payment Form */}
          <div className="bg-[#0D1B22] border border-cyan-500/30 rounded-3xl p-6 shadow-xl space-y-4">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-cyan-400 flex items-center gap-2">
              <Plus className="w-4 h-4" />
              <span>Registrar Pago / Abono a Proveedor u Operadora</span>
            </h3>

            <form onSubmit={handleAddPayment} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300">Proveedor / Sistema *</label>
                  <select
                    value={paySistema}
                    onChange={(e) => setPaySistema(e.target.value)}
                    className="w-full bg-[#071217] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-bold focus:outline-none focus:border-cyan-500"
                  >
                    {availableSystems.map((s) => (
                      <option key={s} value={s}>
                        🎰 {s}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300">Tipo de Movimiento</label>
                  <select
                    value={payTipo}
                    onChange={(e) => setPayTipo(e.target.value as any)}
                    className="w-full bg-[#071217] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-bold focus:outline-none focus:border-cyan-500"
                  >
                    <option value="PAGO_OPERADORA">💸 Pago a Operadora (Egreso)</option>
                    <option value="ABONO_OPERADORA">📥 Abono de Operadora (Ingreso/Reposición)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300">Moneda</label>
                  <select
                    value={payMoneda}
                    onChange={(e) => setPayMoneda(e.target.value as any)}
                    className="w-full bg-[#071217] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-bold focus:outline-none focus:border-cyan-500"
                  >
                    <option value="BS">🇻🇪 BS (Bolívares)</option>
                    <option value="USD">💵 USD (Dólares)</option>
                    <option value="COP">🇨🇴 COP (Pesos)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300">Monto *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={payMonto}
                    onChange={(e) => setPayMonto(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-[#071217] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono font-bold focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300">Método / Banco</label>
                  <input
                    type="text"
                    value={payMetodo}
                    onChange={(e) => setPayMetodo(e.target.value)}
                    placeholder="Ej: Banesco, Zelle, Efectivo"
                    className="w-full bg-[#071217] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300">Referencia Bancaria</label>
                  <input
                    type="text"
                    value={payReferencia}
                    onChange={(e) => setPayReferencia(e.target.value)}
                    placeholder="Ej: Ref #482910"
                    className="w-full bg-[#071217] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300">Fecha del Pago</label>
                  <input
                    type="date"
                    value={payFecha}
                    onChange={(e) => setPayFecha(e.target.value)}
                    className="w-full bg-[#071217] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-1">
                <button
                  type="submit"
                  disabled={isProcessing}
                  className="px-6 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs shadow-md transition-all cursor-pointer disabled:opacity-50"
                >
                  {isProcessing ? 'Registrando...' : 'Registrar Movimiento'}
                </button>
              </div>
            </form>
          </div>

          {/* Payments List Table */}
          <div className="bg-[#0D1B22] border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-300">
                Historial de Pagos y Abonos de Operadora ({operatorPayments.length})
              </h4>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 bg-[#071217] text-slate-400 font-bold uppercase text-[11px]">
                    <th className="py-3 px-4">Fecha</th>
                    <th className="py-3 px-4">Proveedor / Sistema</th>
                    <th className="py-3 px-4">Tipo</th>
                    <th className="py-3 px-4">Moneda</th>
                    <th className="py-3 px-4">Monto</th>
                    <th className="py-3 px-4">Referencia</th>
                    <th className="py-3 px-4 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {operatorPayments.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-500 font-sans">
                        No hay pagos a operadoras registrados en esta semana.
                      </td>
                    </tr>
                  ) : (
                    operatorPayments.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="py-3 px-4 font-sans text-slate-300">{formatDate(p.fecha)}</td>
                        <td className="py-3 px-4 font-sans font-bold text-white">🎰 {p.sistema}</td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              p.tipo_pago === 'PAGO_OPERADORA'
                                ? 'bg-rose-500/10 text-rose-300 border border-rose-500/30'
                                : 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30'
                            }`}
                          >
                            {p.tipo_pago === 'PAGO_OPERADORA' ? '💸 Pago Operadora' : '📥 Abono Operadora'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-300">{p.moneda}</td>
                        <td className="py-3 px-4 font-black text-white">{formatCurrency(p.monto, p.moneda as any)}</td>
                        <td className="py-3 px-4 text-slate-400">{p.referencia}</td>
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => handleDeletePayment(p.id)}
                            className="p-1.5 rounded-lg hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
                            title="Eliminar pago"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ==============================================================
          TAB 4: HISTORIAL DE CIERRES OPERADORA
          ============================================================== */}
      {activeSubTab === 'cierres' && (
        <div className="bg-[#0D1B22] border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
            <History className="w-4 h-4 text-amber-400" />
            Historial de Liquidaciones Guardadas ({history.length})
          </h4>

          {history.length === 0 ? (
            <p className="text-xs text-slate-500 italic py-6 text-center font-sans">
              No se han guardado cierres con operadoras aún.
            </p>
          ) : (
            <div className="space-y-2">
              {history.map((h) => (
                <div
                  key={h.id}
                  className="bg-[#071217] border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-mono"
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2 font-sans">
                      <span className="font-bold text-white text-sm">🎰 {h.sistema}</span>
                      <span className="text-slate-500">• 📅 {formatDate(h.fecha)}</span>
                      <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px] font-bold">
                        {h.moneda}
                      </span>
                    </div>
                    <div className="text-slate-400 text-[11px]">
                      Venta: {formatCurrency(h.venta_bruta, h.moneda as any)} | Premios: {formatCurrency(h.premios, h.moneda as any)} | Com. Comercializador: {formatCurrency(h.comision_manual, h.moneda as any)}
                    </div>
                  </div>

                  <div className="text-right">
                    <div
                      className={`text-sm font-black ${
                        h.utilidad_final_casa >= 0 ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {formatCurrency(h.utilidad_final_casa, h.moneda as any)}
                    </div>
                    <span className="text-[10px] text-slate-500 font-sans">Utilidad Neta Casa Operadora</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
