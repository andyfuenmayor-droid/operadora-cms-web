import React, { useState, useEffect, useMemo, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { formatCurrency, formatDate, cleanAgencyName, normalizarMoneda } from '../../utils/formatters';
import type { Agency, BetSystem, Currency } from '../../types';
import {
  TrendingUp,
  RefreshCw,
  Calendar,
  Download,
  Search,
  ChevronDown,
  ChevronRight,
  Coins,
  Building2,
  Layers,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  FileSpreadsheet,
  Award,
  Wallet,
  DollarSign,
  Receipt
} from 'lucide-react';

interface SystemSaleDetail {
  sistema: string;
  venta: number;
  comision: number;
  premios: number;
  neto: number;
  utilAg: number;
  utilOp: number;
  fechas: string[];
  count: number;
}

interface AgencySaleSummary {
  agenciaNombre: string;
  agencyId?: number;
  participacionPct: number;
  sistemas: string[];
  venta: number;
  comision: number;
  premios: number;
  neto: number;
  utilAg: number;
  utilOp: number;
  registrosCount: number;
  systemDetails: SystemSaleDetail[];
}

export const RealSalesTab: React.FC = () => {
  const { effectiveUserId, systemCycle } = useAuth();

  // Date range filter (defaults to current active cycle)
  const [fechaDesde, setFechaDesde] = useState(systemCycle?.desde || '');
  const [fechaHasta, setFechaHasta] = useState(systemCycle?.hasta || '');

  // Active currency pill filter: 'BS' | 'USD' | 'COP' | 'TODAS'
  const [activeCurrencyTab, setActiveCurrencyTab] = useState<'BS' | 'USD' | 'COP' | 'TODAS'>('BS');

  // Search filter
  const [searchQuery, setSearchQuery] = useState('');
  const [onlyWithMovements, setOnlyWithMovements] = useState(true);

  // Expanded agencies state
  const [expandedAgencies, setExpandedAgencies] = useState<Record<string, boolean>>({});

  // Loaded data
  const [isLoading, setIsLoading] = useState(true);
  const [sales, setSales] = useState<any[]>([]);
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [systems, setSystems] = useState<BetSystem[]>([]);
  const [currencies, setCurrencies] = useState<Currency[]>([]);

  // Update date state when systemCycle loads
  useEffect(() => {
    if (systemCycle?.desde && !fechaDesde) {
      setFechaDesde(systemCycle.desde);
    }
    if (systemCycle?.hasta && !fechaHasta) {
      setFechaHasta(systemCycle.hasta);
    }
  }, [systemCycle]);

  // Load sales data from carga_actual
  const loadData = useCallback(async () => {
    if (!effectiveUserId) return;
    setIsLoading(true);

    try {
      let salesQuery = supabase
        .from('carga_actual')
        .select('*')
        .eq('user_id', effectiveUserId)
        .order('fecha', { ascending: false });

      if (fechaDesde) {
        salesQuery = salesQuery.gte('fecha', fechaDesde);
      }
      if (fechaHasta) {
        salesQuery = salesQuery.lte('fecha', fechaHasta);
      }

      const [salesRes, agRes, sisRes, monRes] = await Promise.all([
        salesQuery,
        supabase.from('agencias').select('*').eq('user_id', effectiveUserId).order('id', { ascending: true }),
        supabase.from('sistemas').select('*').eq('user_id', effectiveUserId).order('nombre_sistema', { ascending: true }),
        supabase.from('monedas').select('*').eq('user_id', effectiveUserId).order('id', { ascending: true }),
      ]);

      setSales(salesRes.data || []);
      setAgencies(agRes.data || []);
      setSystems(sisRes.data || []);
      setCurrencies(monRes.data || []);
    } catch (err) {
      console.error('Error loading real sales data:', err);
    } finally {
      setIsLoading(false);
    }
  }, [effectiveUserId, fechaDesde, fechaHasta]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Reset to active cycle dates
  const handleResetCycle = () => {
    if (systemCycle?.desde && systemCycle?.hasta) {
      setFechaDesde(systemCycle.desde);
      setFechaHasta(systemCycle.hasta);
    }
  };

  // Toggle expanded state for an agency row
  const toggleExpand = (key: string) => {
    setExpandedAgencies((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  // Process and group sales by currency and agency
  const currencyGroupedData = useMemo(() => {
    const supportedCurrencies: Array<'BS' | 'USD' | 'COP'> = ['BS', 'USD', 'COP'];
    const result: Record<'BS' | 'USD' | 'COP', {
      summaries: AgencySaleSummary[];
      totals: {
        venta: number;
        comision: number;
        premios: number;
        neto: number;
        utilAg: number;
        utilOp: number;
        registrosCount: number;
        agenciasCount: number;
      };
    }> = {
      BS: { summaries: [], totals: { venta: 0, comision: 0, premios: 0, neto: 0, utilAg: 0, utilOp: 0, registrosCount: 0, agenciasCount: 0 } },
      USD: { summaries: [], totals: { venta: 0, comision: 0, premios: 0, neto: 0, utilAg: 0, utilOp: 0, registrosCount: 0, agenciasCount: 0 } },
      COP: { summaries: [], totals: { venta: 0, comision: 0, premios: 0, neto: 0, utilAg: 0, utilOp: 0, registrosCount: 0, agenciasCount: 0 } },
    };

    // Agency map for quick config lookup
    const agencyMap = new Map<string, Agency>();
    agencies.forEach((ag) => {
      const cleanNom = cleanAgencyName(ag.nombre_agencia);
      agencyMap.set(cleanNom, ag);
    });

    supportedCurrencies.forEach((curr) => {
      const currSales = sales.filter((s) => normalizarMoneda(s.moneda) === curr);
      const agencyDataMap = new Map<string, {
        agencyId?: number;
        participacionPct: number;
        sistemasSet: Set<string>;
        venta: number;
        comision: number;
        premios: number;
        neto: number;
        utilAg: number;
        utilOp: number;
        registrosCount: number;
        systemsMap: Map<string, SystemSaleDetail>;
      }>();

      // Initialize with registered agencies if onlyWithMovements is false
      if (!onlyWithMovements) {
        agencies.forEach((ag) => {
          const agMonedas = String(ag.monedas || '').toUpperCase();
          if (agMonedas.includes(curr)) {
            const cleanNom = cleanAgencyName(ag.nombre_agencia);
            agencyDataMap.set(cleanNom, {
              agencyId: ag.id,
              participacionPct: Number(ag.participacion_ag || 0),
              sistemasSet: new Set<string>(),
              venta: 0,
              comision: 0,
              premios: 0,
              neto: 0,
              utilAg: 0,
              utilOp: 0,
              registrosCount: 0,
              systemsMap: new Map<string, SystemSaleDetail>(),
            });
          }
        });
      }

      // Aggregate each sale row
      currSales.forEach((s) => {
        const agName = cleanAgencyName(s.agencia);
        if (!agName) return;

        const matchedAgency = agencyMap.get(agName);
        const partPct = Number(matchedAgency?.participacion_ag || 0);

        if (!agencyDataMap.has(agName)) {
          agencyDataMap.set(agName, {
            agencyId: matchedAgency?.id,
            participacionPct: partPct,
            sistemasSet: new Set<string>(),
            venta: 0,
            comision: 0,
            premios: 0,
            neto: 0,
            utilAg: 0,
            utilOp: 0,
            registrosCount: 0,
            systemsMap: new Map<string, SystemSaleDetail>(),
          });
        }

        const entry = agencyDataMap.get(agName)!;
        const v = Number(s.venta ?? s.monto_venta ?? 0);
        const c = Number(s.comision ?? 0);
        const p = Number(s.premios ?? s.monto_premios ?? 0);
        const rowNeto = s.neto !== undefined && s.neto !== null ? Number(s.neto) : Math.round((v - c - p) * 100) / 100;
        
        let rowUtilAg = 0;
        if (s.util_ag !== undefined && s.util_ag !== null) {
          rowUtilAg = Number(s.util_ag);
        } else {
          rowUtilAg = Math.round((rowNeto * (partPct / 100)) * 100) / 100;
        }

        let rowUtilOp = 0;
        if (s.util_op !== undefined && s.util_op !== null) {
          rowUtilOp = Number(s.util_op);
        } else {
          rowUtilOp = Math.round((rowNeto - rowUtilAg) * 100) / 100;
        }

        const sist = String(s.sistema || 'GENERAL').trim().toUpperCase();
        entry.sistemasSet.add(sist);
        entry.venta += v;
        entry.comision += c;
        entry.premios += p;
        entry.neto += rowNeto;
        entry.utilAg += rowUtilAg;
        entry.utilOp += rowUtilOp;
        entry.registrosCount += 1;

        // System breakdown aggregation
        if (!entry.systemsMap.has(sist)) {
          entry.systemsMap.set(sist, {
            sistema: sist,
            venta: 0,
            comision: 0,
            premios: 0,
            neto: 0,
            utilAg: 0,
            utilOp: 0,
            fechas: [],
            count: 0,
          });
        }
        const sysEntry = entry.systemsMap.get(sist)!;
        sysEntry.venta += v;
        sysEntry.comision += c;
        sysEntry.premios += p;
        sysEntry.neto += rowNeto;
        sysEntry.utilAg += rowUtilAg;
        sysEntry.utilOp += rowUtilOp;
        sysEntry.count += 1;
        const fechaStr = String(s.fecha || '').slice(0, 10);
        if (fechaStr && !sysEntry.fechas.includes(fechaStr)) {
          sysEntry.fechas.push(fechaStr);
        }
      });

      // Convert to sorted summary array
      const summaries: AgencySaleSummary[] = [];
      const totals = {
        venta: 0,
        comision: 0,
        premios: 0,
        neto: 0,
        utilAg: 0,
        utilOp: 0,
        registrosCount: 0,
        agenciasCount: 0,
      };

      agencyDataMap.forEach((val, agNom) => {
        // Filter by search query if present
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          const matchName = agNom.toLowerCase().includes(q);
          const matchSys = Array.from(val.sistemasSet).some((sys) => sys.toLowerCase().includes(q));
          if (!matchName && !matchSys) return;
        }

        // If onlyWithMovements, exclude agencies with 0 sales
        if (onlyWithMovements && val.registrosCount === 0 && Math.abs(val.venta) < 0.01) {
          return;
        }

        const sysDetails = Array.from(val.systemsMap.values()).sort((a, b) => b.venta - a.venta);

        summaries.push({
          agenciaNombre: agNom,
          agencyId: val.agencyId,
          participacionPct: val.participacionPct,
          sistemas: Array.from(val.sistemasSet).sort(),
          venta: Math.round(val.venta * 100) / 100,
          comision: Math.round(val.comision * 100) / 100,
          premios: Math.round(val.premios * 100) / 100,
          neto: Math.round(val.neto * 100) / 100,
          utilAg: Math.round(val.utilAg * 100) / 100,
          utilOp: Math.round(val.utilOp * 100) / 100,
          registrosCount: val.registrosCount,
          systemDetails: sysDetails,
        });

        totals.venta += val.venta;
        totals.comision += val.comision;
        totals.premios += val.premios;
        totals.neto += val.neto;
        totals.utilAg += val.utilAg;
        totals.utilOp += val.utilOp;
        totals.registrosCount += val.registrosCount;
      });

      // Sort agencies alphabetically by name
      summaries.sort((a, b) => a.agenciaNombre.localeCompare(b.agenciaNombre));
      totals.agenciasCount = summaries.length;

      // Round totals
      totals.venta = Math.round(totals.venta * 100) / 100;
      totals.comision = Math.round(totals.comision * 100) / 100;
      totals.premios = Math.round(totals.premios * 100) / 100;
      totals.neto = Math.round(totals.neto * 100) / 100;
      totals.utilAg = Math.round(totals.utilAg * 100) / 100;
      totals.utilOp = Math.round(totals.utilOp * 100) / 100;

      result[curr] = { summaries, totals };
    });

    return result;
  }, [sales, agencies, onlyWithMovements, searchQuery]);

  // Active currency currencies to render
  const activeCurrenciesToRender = useMemo(() => {
    if (activeCurrencyTab === 'TODAS') {
      return ['BS', 'USD', 'COP'] as const;
    }
    return [activeCurrencyTab] as const;
  }, [activeCurrencyTab]);

  // Overall totals across all active currencies for KPIs
  const currentKpiTotals = useMemo(() => {
    if (activeCurrencyTab !== 'TODAS') {
      return {
        ...currencyGroupedData[activeCurrencyTab].totals,
        moneda: activeCurrencyTab,
      };
    }
    // For 'TODAS', show BS as dominant or default
    return {
      ...currencyGroupedData.BS.totals,
      moneda: 'BS',
    };
  }, [activeCurrencyTab, currencyGroupedData]);

  // Export to Excel function
  const handleExportExcel = () => {
    const wb = XLSX.utils.book_new();

    activeCurrenciesToRender.forEach((curr) => {
      const data = currencyGroupedData[curr];
      const rows: any[] = [];

      data.summaries.forEach((ag, idx) => {
        // Main agency row
        rows.push({
          Nº: idx + 1,
          Agencia: ag.agenciaNombre,
          Sistema: ag.sistemas.join(', ') || 'TODOS',
          Moneda: curr,
          'Venta Bruta': ag.venta,
          'Comisión Total': ag.comision,
          'Premios Pagados': ag.premios,
          'Venta Neta (Neto)': ag.neto,
          '% Part. Ag': `${ag.participacionPct}%`,
          'Utilidad Agencia': ag.utilAg,
          'Utilidad Operadora': ag.utilOp,
        });

        // Detail rows per system
        if (ag.systemDetails.length > 1) {
          ag.systemDetails.forEach((sys) => {
            rows.push({
              Nº: '',
              Agencia: `  ↳ ${ag.agenciaNombre}`,
              Sistema: sys.sistema,
              Moneda: curr,
              'Venta Bruta': sys.venta,
              'Comisión Total': sys.comision,
              'Premios Pagados': sys.premios,
              'Venta Neta (Neto)': sys.neto,
              '% Part. Ag': '',
              'Utilidad Agencia': sys.utilAg,
              'Utilidad Operadora': sys.utilOp,
            });
          });
        }
      });

      // Total row
      rows.push({
        Nº: 'TOTAL',
        Agencia: `TOTAL ${curr} (${data.totals.agenciasCount} AGENCIAS)`,
        Sistema: '',
        Moneda: curr,
        'Venta Bruta': data.totals.venta,
        'Comisión Total': data.totals.comision,
        'Premios Pagados': data.totals.premios,
        'Venta Neta (Neto)': data.totals.neto,
        '% Part. Ag': '',
        'Utilidad Agencia': data.totals.utilAg,
        'Utilidad Operadora': data.totals.utilOp,
      });

      const ws = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, `Ventas_${curr}`);
    });

    const fD = fechaDesde || 'inicio';
    const fH = fechaHasta || 'fin';
    XLSX.writeFile(wb, `Venta_Real_Consolidada_${fD}_al_${fH}.xlsx`);
  };

  return (
    <div className="space-y-6 animate-fade-in font-sans">
      {/* 1. Header & Controls Card */}
      <div className="bg-gradient-to-r from-[#0D1B22] via-[#0F242C] to-[#0D1B22] border border-slate-800 rounded-3xl p-6 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 relative z-10">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold">
              <TrendingUp className="w-3.5 h-3.5" />
              <span>Control y Reporte de Ventas Consolidadas</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2.5">
              <span>Venta Real por Agencias</span>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono font-normal">
                {sales.length} registros cargados
              </span>
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 max-w-2xl">
              Consolidado de ventas, comisiones, premios y utilidades por agencia y moneda en el ciclo operativo oficial.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={handleExportExcel}
              disabled={sales.length === 0}
              className="px-4 py-2.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-2 transition-all cursor-pointer shadow-lg shadow-emerald-500/20 disabled:opacity-50"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Exportar Excel</span>
            </button>

            <button
              onClick={() => loadData()}
              disabled={isLoading}
              className="p-2.5 rounded-2xl bg-slate-800/90 hover:bg-slate-700 text-slate-300 hover:text-white transition-all border border-slate-700 cursor-pointer"
              title="Recargar datos"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-emerald-400' : ''}`} />
            </button>
          </div>
        </div>

        {/* Date Filter Strip */}
        <div className="mt-5 pt-4 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-xs relative z-10">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px] flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-emerald-400" />
              <span>Período de Ventas:</span>
            </span>
            <div className="flex items-center gap-1.5 bg-[#071217] border border-slate-700 rounded-xl px-2.5 py-1">
              <input
                type="date"
                value={fechaDesde}
                onChange={(e) => setFechaDesde(e.target.value)}
                className="bg-transparent text-white font-mono text-xs focus:outline-none cursor-pointer"
              />
              <span className="text-slate-500 font-sans text-[11px]">al</span>
              <input
                type="date"
                value={fechaHasta}
                onChange={(e) => setFechaHasta(e.target.value)}
                className="bg-transparent text-white font-mono text-xs focus:outline-none cursor-pointer"
              />
            </div>
          </div>

          {systemCycle?.desde && (
            <button
              onClick={handleResetCycle}
              className="px-3 py-1.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Restablecer al Ciclo Actual ({formatDate(systemCycle.desde)} al {formatDate(systemCycle.hasta)})</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. Currency Pills & Search Bar Strip */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Currency Switcher */}
        <div className="flex items-center gap-1 bg-[#0D1B22] p-1 rounded-2xl border border-slate-800">
          {(['BS', 'USD', 'COP', 'TODAS'] as const).map((curr) => {
            const isSelected = activeCurrencyTab === curr;
            const count = curr === 'TODAS'
              ? sales.length
              : currencyGroupedData[curr].totals.registrosCount;

            return (
              <button
                key={curr}
                onClick={() => setActiveCurrencyTab(curr)}
                className={`px-3.5 py-2 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 ${
                  isSelected
                    ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20 scale-[1.02]'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
                }`}
              >
                <span>
                  {curr === 'BS' ? '🇻🇪 BS' : curr === 'USD' ? '💵 USD' : curr === 'COP' ? '🇨🇴 COP' : '🌐 Todas'}
                </span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                  isSelected ? 'bg-slate-950/20 text-slate-950' : 'bg-slate-800 text-slate-400'
                }`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Search input & Movement toggle */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar agencia o sistema..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-[#0D1B22] border border-slate-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 w-52 sm:w-64"
            />
          </div>

          <label className="flex items-center gap-1.5 text-xs text-slate-400 cursor-pointer bg-[#0D1B22] border border-slate-800 rounded-xl px-3 py-1.5 hover:border-slate-700">
            <input
              type="checkbox"
              checked={onlyWithMovements}
              onChange={(e) => setOnlyWithMovements(e.target.checked)}
              className="rounded text-emerald-500 bg-slate-900 border-slate-700 focus:ring-0"
            />
            <span className="text-[11px] font-semibold text-slate-300 whitespace-nowrap">Con ventas</span>
          </label>
        </div>
      </div>

      {/* 3. KPI Summary Cards for Active Selection */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="bg-[#0D1B22] border border-slate-800 rounded-2xl p-4 space-y-1 shadow-sm">
          <span className="text-[10px] font-bold uppercase text-slate-400 flex items-center gap-1">
            <Coins className="w-3 h-3 text-cyan-400" />
            Venta Bruta Total
          </span>
          <div className="text-base sm:text-lg font-black text-white font-mono truncate">
            {formatCurrency(currentKpiTotals.venta, currentKpiTotals.moneda)}
          </div>
          <span className="text-[10px] text-slate-500 font-mono block">
            {currentKpiTotals.registrosCount} registros
          </span>
        </div>

        <div className="bg-[#0D1B22] border border-slate-800 rounded-2xl p-4 space-y-1 shadow-sm">
          <span className="text-[10px] font-bold uppercase text-slate-400 flex items-center gap-1">
            <Receipt className="w-3 h-3 text-amber-400" />
            Comisiones
          </span>
          <div className="text-base sm:text-lg font-black text-amber-400 font-mono truncate">
            {formatCurrency(currentKpiTotals.comision, currentKpiTotals.moneda)}
          </div>
          <span className="text-[10px] text-slate-500 font-mono block">
            {currentKpiTotals.venta > 0 ? `${((currentKpiTotals.comision / currentKpiTotals.venta) * 100).toFixed(1)}% prom.` : '0%'}
          </span>
        </div>

        <div className="bg-[#0D1B22] border border-slate-800 rounded-2xl p-4 space-y-1 shadow-sm">
          <span className="text-[10px] font-bold uppercase text-slate-400 flex items-center gap-1">
            <Award className="w-3 h-3 text-rose-400" />
            Premios Pagados
          </span>
          <div className="text-base sm:text-lg font-black text-rose-400 font-mono truncate">
            {formatCurrency(currentKpiTotals.premios, currentKpiTotals.moneda)}
          </div>
          <span className="text-[10px] text-slate-500 font-mono block">
            Pagos en taquillas
          </span>
        </div>

        <div className="bg-[#0D1B22] border border-slate-800 rounded-2xl p-4 space-y-1 shadow-sm">
          <span className="text-[10px] font-bold uppercase text-slate-400 flex items-center gap-1">
            <Wallet className="w-3 h-3 text-emerald-400" />
            Utilidad Operadora
          </span>
          <div className={`text-base sm:text-lg font-black font-mono truncate ${
            currentKpiTotals.utilOp >= 0 ? 'text-emerald-400' : 'text-rose-400'
          }`}>
            {formatCurrency(currentKpiTotals.utilOp, currentKpiTotals.moneda)}
          </div>
          <span className="text-[10px] text-slate-500 font-mono block">
            Neto para la Banca
          </span>
        </div>

        <div className="bg-[#0D1B22] border border-slate-800 rounded-2xl p-4 space-y-1 shadow-sm col-span-2 sm:col-span-1">
          <span className="text-[10px] font-bold uppercase text-slate-400 flex items-center gap-1">
            <Building2 className="w-3 h-3 text-sky-400" />
            Utilidad Agencias
          </span>
          <div className={`text-base sm:text-lg font-black font-mono truncate ${
            currentKpiTotals.utilAg >= 0 ? 'text-sky-400' : 'text-rose-400'
          }`}>
            {formatCurrency(currentKpiTotals.utilAg, currentKpiTotals.moneda)}
          </div>
          <span className="text-[10px] text-slate-500 font-mono block">
            Participación Ag.
          </span>
        </div>
      </div>

      {/* 4. Tables per Currency */}
      {activeCurrenciesToRender.map((curr) => {
        const currData = currencyGroupedData[curr];
        const summaries = currData.summaries;
        const totals = currData.totals;

        if (summaries.length === 0 && activeCurrencyTab === 'TODAS') {
          return null;
        }

        return (
          <div key={curr} className="bg-[#0D1B22] border border-slate-800 rounded-3xl overflow-hidden shadow-xl space-y-0">
            {/* Currency Banner Header */}
            <div className="p-4 bg-[#071217] border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-base">
                  {curr === 'BS' ? '🇻🇪' : curr === 'USD' ? '💵' : '🇨🇴'}
                </span>
                <h3 className="text-sm font-black text-white uppercase tracking-wider">
                  Movimientos en {curr === 'BS' ? 'Bolívares (BS)' : curr === 'USD' ? 'Dólares (USD)' : 'Pesos (COP)'}
                </h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 font-mono font-bold">
                  {summaries.length} agencias / {totals.registrosCount} registros
                </span>
              </div>

              <div className="text-xs font-mono font-bold text-slate-300">
                Utilidad Operadora:{' '}
                <span className={totals.utilOp >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                  {formatCurrency(totals.utilOp, curr)}
                </span>
              </div>
            </div>

            {/* Table or Empty State */}
            {summaries.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500 italic">
                No hay ventas registradas en {curr} para el período seleccionado.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#071217]/60 text-[10px] font-black text-slate-400 uppercase tracking-wider border-b border-slate-800">
                    <tr>
                      <th className="py-3 px-3 text-center w-10">#</th>
                      <th className="py-3 px-4">Agencia</th>
                      <th className="py-3 px-3">Sistemas</th>
                      <th className="py-3 px-3 text-right">Venta Bruta</th>
                      <th className="py-3 px-3 text-right">Comisión</th>
                      <th className="py-3 px-3 text-right text-rose-400">Premios</th>
                      <th className="py-3 px-3 text-right">Venta Neta</th>
                      <th className="py-3 px-3 text-right">Part. Ag.</th>
                      <th className="py-3 px-3 text-right text-emerald-400">Utilidad Op.</th>
                      <th className="py-3 px-3 text-center w-12">Detalle</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {summaries.map((ag, idx) => {
                      const expandKey = `${curr}_${ag.agenciaNombre}`;
                      const isExpanded = Boolean(expandedAgencies[expandKey]);

                      return (
                        <React.Fragment key={ag.agenciaNombre}>
                          <tr className="hover:bg-slate-800/30 transition-colors">
                            <td className="py-3 px-3 text-center text-slate-500 text-[11px] font-mono">
                              {idx + 1}
                            </td>

                            <td className="py-3 px-4 font-sans">
                              <div className="flex items-center gap-2">
                                <span className="font-extrabold text-white text-xs whitespace-nowrap">
                                  {ag.agenciaNombre}
                                </span>
                              </div>
                            </td>

                            <td className="py-3 px-3 font-sans">
                              <div className="flex flex-wrap gap-1 max-w-[200px]">
                                {ag.sistemas.map((sys) => (
                                  <span
                                    key={sys}
                                    className="px-1.5 py-0.5 rounded text-[9.5px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 whitespace-nowrap"
                                  >
                                    🎰 {sys}
                                  </span>
                                ))}
                              </div>
                            </td>

                            <td className="py-3 px-3 text-right font-bold text-white whitespace-nowrap">
                              {formatCurrency(ag.venta, curr)}
                            </td>

                            <td className="py-3 px-3 text-right text-slate-300 whitespace-nowrap">
                              <div className="flex flex-col items-end">
                                <span>{formatCurrency(ag.comision, curr)}</span>
                                {ag.venta > 0 && (
                                  <span className="text-[9.5px] text-slate-500">
                                    {((ag.comision / ag.venta) * 100).toFixed(1)}%
                                  </span>
                                )}
                              </div>
                            </td>

                            <td className="py-3 px-3 text-right text-rose-400 whitespace-nowrap">
                              {formatCurrency(ag.premios, curr)}
                            </td>

                            <td className="py-3 px-3 text-right font-bold whitespace-nowrap">
                              <span className={ag.neto >= 0 ? 'text-cyan-300' : 'text-rose-400'}>
                                {formatCurrency(ag.neto, curr)}
                              </span>
                            </td>

                            <td className="py-3 px-3 text-right text-sky-400 whitespace-nowrap">
                              <div className="flex flex-col items-end">
                                <span>{formatCurrency(ag.utilAg, curr)}</span>
                                <span className="text-[9.5px] text-slate-500">
                                  {ag.participacionPct}%
                                </span>
                              </div>
                            </td>

                            <td className="py-3 px-3 text-right font-black whitespace-nowrap">
                              <span className={ag.utilOp >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                                {formatCurrency(ag.utilOp, curr)}
                              </span>
                            </td>

                            <td className="py-3 px-3 text-center">
                              <button
                                type="button"
                                onClick={() => toggleExpand(expandKey)}
                                className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                                  isExpanded
                                    ? 'bg-emerald-500/20 text-emerald-400'
                                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                                }`}
                                title="Ver desglose por sistema"
                              >
                                {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                              </button>
                            </td>
                          </tr>

                          {/* Subtable: Breakdown per system */}
                          {isExpanded && (
                            <tr className="bg-[#071217]/90">
                              <td colSpan={10} className="p-3 pl-12">
                                <div className="rounded-2xl border border-slate-800 bg-[#0D1B22] p-3 space-y-2">
                                  <div className="flex items-center justify-between pb-1 border-b border-slate-800 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                                    <span className="flex items-center gap-1.5">
                                      <Layers className="w-3.5 h-3.5 text-sky-400" />
                                      <span>Desglose por Sistema ({ag.systemDetails.length})</span>
                                    </span>
                                    <span>Agencia: {ag.agenciaNombre}</span>
                                  </div>

                                  <table className="w-full text-left text-[11px] font-mono">
                                    <thead className="text-[9px] uppercase text-slate-500 border-b border-slate-800">
                                      <tr>
                                        <th className="py-1 px-2 font-sans">Sistema</th>
                                        <th className="py-1 px-2 font-sans">Fechas Registradas</th>
                                        <th className="py-1 px-2 text-right">Venta</th>
                                        <th className="py-1 px-2 text-right">Comisión</th>
                                        <th className="py-1 px-2 text-right text-rose-400">Premios</th>
                                        <th className="py-1 px-2 text-right text-cyan-400">Neto</th>
                                        <th className="py-1 px-2 text-right text-sky-400">Util. Ag.</th>
                                        <th className="py-1 px-2 text-right text-emerald-400">Util. Op.</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-800/40">
                                      {ag.systemDetails.map((sys) => (
                                        <tr key={sys.sistema} className="hover:bg-slate-800/20">
                                          <td className="py-1.5 px-2 font-bold font-sans text-white flex items-center gap-1">
                                            <span>🎰</span>
                                            <span>{sys.sistema}</span>
                                          </td>
                                          <td className="py-1.5 px-2 font-sans text-slate-400 text-[10px]">
                                            {sys.fechas.map(formatDate).join(', ') || 'N/A'} ({sys.count} reg.)
                                          </td>
                                          <td className="py-1.5 px-2 text-right text-white">
                                            {formatCurrency(sys.venta, curr)}
                                          </td>
                                          <td className="py-1.5 px-2 text-right text-slate-300">
                                            {formatCurrency(sys.comision, curr)}
                                          </td>
                                          <td className="py-1.5 px-2 text-right text-rose-400">
                                            {formatCurrency(sys.premios, curr)}
                                          </td>
                                          <td className="py-1.5 px-2 text-right font-bold text-cyan-400">
                                            {formatCurrency(sys.neto, curr)}
                                          </td>
                                          <td className="py-1.5 px-2 text-right text-sky-400">
                                            {formatCurrency(sys.utilAg, curr)}
                                          </td>
                                          <td className="py-1.5 px-2 text-right font-bold text-emerald-400">
                                            {formatCurrency(sys.utilOp, curr)}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>

                  {/* Grand Totals Footer */}
                  <tfoot className="bg-[#071217] border-t-2 border-slate-700 font-mono text-xs">
                    <tr>
                      <td colSpan={3} className="py-3 px-4 font-black text-amber-400 font-sans uppercase">
                        ⭐ TOTAL {curr} ({totals.agenciasCount} AGENCIAS / {totals.registrosCount} MOVIMIENTOS)
                      </td>
                      <td className="py-3 px-3 text-right font-black text-white">
                        {formatCurrency(totals.venta, curr)}
                      </td>
                      <td className="py-3 px-3 text-right font-black text-slate-300">
                        {formatCurrency(totals.comision, curr)}
                      </td>
                      <td className="py-3 px-3 text-right font-black text-rose-400">
                        {formatCurrency(totals.premios, curr)}
                      </td>
                      <td className="py-3 px-3 text-right font-black text-cyan-300">
                        {formatCurrency(totals.neto, curr)}
                      </td>
                      <td className="py-3 px-3 text-right font-black text-sky-400">
                        {formatCurrency(totals.utilAg, curr)}
                      </td>
                      <td className="py-3 px-3 text-right font-black text-emerald-400">
                        {formatCurrency(totals.utilOp, curr)}
                      </td>
                      <td className="py-3 px-3"></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default RealSalesTab;
