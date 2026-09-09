import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { formatCurrency, normalizarMoneda, formatDate } from '../../utils/formatters';
import {
  ShieldCheck,
  Users,
  Key,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Plus,
  Trash2,
  Edit2,
  Calendar,
  Clock,
  ChevronDown,
  ChevronUp,
  Building2,
  TrendingUp,
  Receipt,
  CircleDollarSign,
  Trophy,
  Wallet,
  Sparkles,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  Percent,
  CheckCheck,
  Coins,
} from 'lucide-react';
import confetti from 'canvas-confetti';

interface TaquillaUser {
  id: number;
  usuario: string;
  clave?: string;
  nombre_cajero?: string;
  rol: 'cajero' | 'supervisor' | 'agencia';
  agencia_id: number;
  activo: boolean;
}

interface AuditRow {
  agencia: string;
  sistema: string;
  venta_ofi: number;
  venta_taq: number;
  com_ofi: number;
  com_taq: number;
  prem_ofi: number;
  prem_taq: number;
  part_ofi: number;
  part_taq: number;
  gastos_ofi: number;
  gastos_taq: number;
  pagos_ofi: number;
  pagos_taq: number;
}

export const AuditTab: React.FC = () => {
  const { effectiveUserId, systemCycle, user } = useAuth();

  // Active currency tab: BS, USD, COP
  const [activeCurrency, setActiveCurrency] = useState<'BS' | 'USD' | 'COP'>('BS');

  // Subtab for detailed period: Ventas | Gastos | Pagos
  const [activeSubTab, setActiveSubTab] = useState<'Ventas' | 'Gastos' | 'Pagos'>('Ventas');

  // Date filters
  const [fechaDesde, setFechaDesde] = useState(systemCycle.desde);
  const [fechaHasta, setFechaHasta] = useState(systemCycle.hasta);

  // Loaded data
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [agencies, setAgencies] = useState<any[]>([]);
  const [taquillaUsers, setTaquillaUsers] = useState<TaquillaUser[]>([]);
  const [salesOfficial, setSalesOfficial] = useState<any[]>([]);
  const [salesTaquilla, setSalesTaquilla] = useState<any[]>([]);
  const [expensesOfficial, setExpensesOfficial] = useState<any[]>([]);
  const [expensesTaquilla, setExpensesTaquilla] = useState<any[]>([]);
  const [paymentsOfficial, setPaymentsOfficial] = useState<any[]>([]);
  const [paymentsTaquilla, setPaymentsTaquilla] = useState<any[]>([]);

  // UI accordion state for credentials
  const [isCredentialsOpen, setIsCredentialsOpen] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Modal / Form state for Taquilla User creation
  const [newUserAgencyId, setNewUserAgencyId] = useState<number | null>(null);
  const [newUsuario, setNewUsuario] = useState('');
  const [newClave, setNewClave] = useState('');
  const [newNombreCajero, setNewNombreCajero] = useState('');
  const [newRol, setNewRol] = useState<'cajero' | 'supervisor' | 'agencia'>('cajero');

  // Edit user state
  const [editingUser, setEditingUser] = useState<TaquillaUser | null>(null);
  const [editRol, setEditRol] = useState<'cajero' | 'supervisor' | 'agencia'>('cajero');
  const [editActivo, setEditActivo] = useState(true);
  const [editClave, setEditClave] = useState('');

  const loadData = useCallback(async () => {
    if (!effectiveUserId) return;
    setIsLoading(true);
    setMessage(null);

    try {
      const [
        agRes,
        uRes,
        vOfiRes,
        vTaqRes,
        gOfiRes,
        gTaqRes,
        pOfiRes,
        pTaqRes,
      ] = await Promise.all([
        supabase
          .from('agencias')
          .select('id, nombre_agencia, auditoria_activa, participacion_ag, sistemas, monedas, usuario_taquilla')
          .eq('user_id', effectiveUserId)
          .order('id', { ascending: true }),
        supabase
          .from('taquilla_usuarios')
          .select('*')
          .eq('user_id', effectiveUserId),
        supabase
          .from('carga_actual')
          .select('*')
          .eq('user_id', effectiveUserId),
        supabase
          .from('cda_reportes_diarios')
          .select('*')
          .eq('user_id', effectiveUserId)
          .gte('fecha', fechaDesde)
          .lte('fecha', fechaHasta)
          .order('fecha', { ascending: false }),
        supabase
          .from('gastos')
          .select('*')
          .eq('user_id', effectiveUserId),
        supabase
          .from('cda_gastos_diarios')
          .select('*')
          .eq('user_id', effectiveUserId)
          .gte('fecha', fechaDesde)
          .lte('fecha', fechaHasta)
          .order('fecha', { ascending: false }),
        supabase
          .from('pagos_semana')
          .select('*')
          .eq('user_id', effectiveUserId),
        supabase
          .from('cda_pagos_diarios')
          .select('*')
          .eq('user_id', effectiveUserId)
          .gte('fecha', fechaDesde)
          .lte('fecha', fechaHasta)
          .order('fecha', { ascending: false }),
      ]);

      const loadedAgencies = agRes.data || [];
      setAgencies(loadedAgencies);
      setTaquillaUsers((uRes.data || []) as TaquillaUser[]);

      // Map of single-currency agencies
      const singleCurrencyMap: Record<string, string> = {};
      loadedAgencies.forEach((a: any) => {
        const agName = String(a.nombre_agencia || '').trim().toUpperCase();
        const mons = String(a.monedas || '')
          .split(',')
          .map((m) => m.trim().toUpperCase())
          .filter(Boolean);
        if (mons.length === 1) {
          singleCurrencyMap[agName] = mons[0];
        }
      });

      // Filter taquilla daily sales by user's agencies and normalize currency
      const rawSalesTaq = vTaqRes.data || [];
      const userAgNames = new Set(loadedAgencies.map((a: any) => String(a.nombre_agencia || '').trim().toUpperCase()));

      const cleanSalesTaq = rawSalesTaq
        .filter((s: any) => {
          const ag = String(s.agencia || s.nombre_agency || '').trim().toUpperCase();
          return userAgNames.size === 0 || userAgNames.has(ag);
        })
        .map((s: any) => {
          const ag = String(s.agencia || s.nombre_agency || '').trim().toUpperCase();
          let mon = normalizarMoneda(s.moneda);
          if (singleCurrencyMap[ag] && (!mon || (mon === 'COP' && singleCurrencyMap[ag] !== 'COP'))) {
            mon = singleCurrencyMap[ag] as any;
          }
          return { ...s, moneda: mon || singleCurrencyMap[ag] || 'BS' };
        });

      // Filter taquilla expenses by user's agencies
      const rawExpTaq = gTaqRes.data || [];
      const cleanExpTaq = rawExpTaq.filter((g: any) => {
        const ag = String(g.agencia || '').trim().toUpperCase();
        return userAgNames.size === 0 || userAgNames.has(ag);
      });

      // Filter taquilla payments: confirmed, not rejected, not custody movements
      const rawPaymentsTaq = pTaqRes.data || [];
      const cleanPaymentsTaq = rawPaymentsTaq.filter((p: any) => {
        const ag = String(p.agencia || '').trim().toUpperCase();
        if (userAgNames.size > 0 && !userAgNames.has(ag)) return false;

        const isRech = Boolean(p.rechazado) || String(p.estado || '').toUpperCase() === 'RECHAZADO';
        const isConf = Boolean(p.confirmado) || Boolean(p.confirmado_supervisor);
        if (isRech || !isConf) return false;

        const tp = String(p.tipo_pago || '').toUpperCase();
        if (['COBRADOR', 'ENTREGADO A ADMIN', 'ENTREGA_ADMIN'].some((k) => tp.includes(k))) {
          return false;
        }
        return true;
      });

      setSalesOfficial(vOfiRes.data || []);
      setSalesTaquilla(cleanSalesTaq);
      setExpensesOfficial(gOfiRes.data || []);
      setExpensesTaquilla(cleanExpTaq);
      setPaymentsOfficial(pOfiRes.data || []);
      setPaymentsTaquilla(cleanPaymentsTaq);
    } catch (err: any) {
      console.error('Error loading audit data:', err);
      setMessage({ type: 'error', text: err?.message || 'Error al cargar datos de auditoría.' });
    } finally {
      setIsLoading(false);
    }
  }, [effectiveUserId, fechaDesde, fechaHasta]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Auditable agencies list: agencias con auditoria_activa = true
  const auditableAgencies = useMemo(() => {
    return agencies.filter((a) => a.auditoria_activa === true);
  }, [agencies]);

  const auditableAgencyNames = useMemo(() => {
    return new Set(auditableAgencies.map((a) => String(a.nombre_agencia || '').trim().toUpperCase()));
  }, [auditableAgencies]);

  // Participation % map
  const participationMap = useMemo(() => {
    const map: Record<string, number> = {};
    agencies.forEach((a) => {
      map[String(a.nombre_agencia || '').trim().toUpperCase()] = Number(a.participacion_ag || 0);
    });
    return map;
  }, [agencies]);

  // Terminal names label
  const terminalesLabel = useMemo(() => {
    if (auditableAgencies.length > 0) {
      return auditableAgencies.map((a) => String(a.nombre_agencia || '').trim().toUpperCase()).join(', ');
    }
    return 'Todas las Agencias';
  }, [auditableAgencies]);

  // Compute audit comparison rows for the active currency
  const auditRows = useMemo<AuditRow[]>(() => {
    const mapRows: Record<string, AuditRow> = {};
    const getKey = (ag: string, sis: string) => `${ag}___${sis}`;

    // 1. Process Carga Oficial
    salesOfficial.forEach((s: any) => {
      const mon = normalizarMoneda(s.moneda);
      if (mon !== activeCurrency) return;

      const ag = String(s.agencia || '').trim().toUpperCase();
      if (auditableAgencyNames.size > 0 && !auditableAgencyNames.has(ag)) return;

      const sis = String(s.sistema || 'GENERAL').trim().toUpperCase();
      const k = getKey(ag, sis);

      if (!mapRows[k]) {
        mapRows[k] = {
          agencia: ag,
          sistema: sis,
          venta_ofi: 0,
          venta_taq: 0,
          com_ofi: 0,
          com_taq: 0,
          prem_ofi: 0,
          prem_taq: 0,
          part_ofi: 0,
          part_taq: 0,
          gastos_ofi: 0,
          gastos_taq: 0,
          pagos_ofi: 0,
          pagos_taq: 0,
        };
      }

      mapRows[k].venta_ofi += Number(s.venta || 0);
      mapRows[k].com_ofi += Number(s.comision || 0);
      mapRows[k].prem_ofi += Number(s.premios || 0);
      mapRows[k].part_ofi += Number(s.util_ag || 0);
    });

    // 2. Process Taquilla Daily Reports
    salesTaquilla.forEach((s: any) => {
      const mon = normalizarMoneda(s.moneda);
      if (mon !== activeCurrency) return;

      const ag = String(s.nombre_agency || s.agencia || '').trim().toUpperCase();
      if (auditableAgencyNames.size > 0 && !auditableAgencyNames.has(ag)) return;

      const sis = String(s.sistema || 'GENERAL').trim().toUpperCase();
      const k = getKey(ag, sis);

      if (!mapRows[k]) {
        mapRows[k] = {
          agencia: ag,
          sistema: sis,
          venta_ofi: 0,
          venta_taq: 0,
          com_ofi: 0,
          com_taq: 0,
          prem_ofi: 0,
          prem_taq: 0,
          part_ofi: 0,
          part_taq: 0,
          gastos_ofi: 0,
          gastos_taq: 0,
          pagos_ofi: 0,
          pagos_taq: 0,
        };
      }

      const vTaq = Number(s.monto_venta || 0);
      const cTaq = Number(s.comision || 0);
      const pTaq = Number(s.monto_premios || 0);
      const pct = participationMap[ag] || 0;

      mapRows[k].venta_taq += vTaq;
      mapRows[k].com_taq += cTaq;
      mapRows[k].prem_taq += pTaq;
      mapRows[k].part_taq += (vTaq - cTaq - pTaq) * (pct / 100);
    });

    // 3. Process Gastos by Agency
    const gastosOfiByAg: Record<string, number> = {};
    expensesOfficial.forEach((g: any) => {
      const mon = normalizarMoneda(g.moneda);
      if (mon !== activeCurrency) return;
      const ag = String(g.agencia || '').trim().toUpperCase();
      if (auditableAgencyNames.size > 0 && !auditableAgencyNames.has(ag)) return;
      gastosOfiByAg[ag] = (gastosOfiByAg[ag] || 0) + Number(g.monto || 0);
    });

    const gastosTaqByAg: Record<string, number> = {};
    expensesTaquilla.forEach((g: any) => {
      const mon = normalizarMoneda(g.moneda);
      if (mon !== activeCurrency) return;
      const ag = String(g.agencia || '').trim().toUpperCase();
      if (auditableAgencyNames.size > 0 && !auditableAgencyNames.has(ag)) return;
      gastosTaqByAg[ag] = (gastosTaqByAg[ag] || 0) + Number(g.monto || 0);
    });

    // 4. Process Pagos by Agency
    const pagosOfiByAg: Record<string, number> = {};
    paymentsOfficial.forEach((p: any) => {
      const mon = normalizarMoneda(p.moneda);
      if (mon !== activeCurrency) return;
      const ag = String(p.agencia || '').trim().toUpperCase();
      if (auditableAgencyNames.size > 0 && !auditableAgencyNames.has(ag)) return;
      pagosOfiByAg[ag] = (pagosOfiByAg[ag] || 0) + Number(p.monto || 0);
    });

    const pagosTaqByAg: Record<string, number> = {};
    paymentsTaquilla.forEach((p: any) => {
      const mon = normalizarMoneda(p.moneda);
      if (mon !== activeCurrency) return;
      const ag = String(p.agencia || '').trim().toUpperCase();
      if (auditableAgencyNames.size > 0 && !auditableAgencyNames.has(ag)) return;
      pagosTaqByAg[ag] = (pagosTaqByAg[ag] || 0) + Number(p.monto || 0);
    });

    // Assign agency level expenses and payments to the first system row of that agency
    const seenAgForExpenses = new Set<string>();
    const result = Object.values(mapRows);

    result.forEach((row) => {
      if (!seenAgForExpenses.has(row.agencia)) {
        row.gastos_ofi = gastosOfiByAg[row.agencia] || 0;
        row.gastos_taq = gastosTaqByAg[row.agencia] || 0;
        row.pagos_ofi = pagosOfiByAg[row.agencia] || 0;
        row.pagos_taq = pagosTaqByAg[row.agencia] || 0;
        seenAgForExpenses.add(row.agencia);
      }
    });

    return result.sort((a, b) => a.agencia.localeCompare(b.agencia) || a.sistema.localeCompare(b.sistema));
  }, [
    salesOfficial,
    salesTaquilla,
    expensesOfficial,
    expensesTaquilla,
    paymentsOfficial,
    paymentsTaquilla,
    activeCurrency,
    auditableAgencyNames,
    participationMap,
  ]);

  // System level metrics in active currency
  const systemMetrics = useMemo(() => {
    const systems = Array.from(new Set(auditRows.map((r) => r.sistema))).sort();

    return systems.map((sis) => {
      const rows = auditRows.filter((r) => r.sistema === sis);
      const vOfi = rows.reduce((acc, r) => acc + r.venta_ofi, 0);
      const vTaq = rows.reduce((acc, r) => acc + r.venta_taq, 0);
      const cOfi = rows.reduce((acc, r) => acc + r.com_ofi, 0);
      const cTaq = rows.reduce((acc, r) => acc + r.com_taq, 0);
      const pOfi = rows.reduce((acc, r) => acc + r.prem_ofi, 0);
      const pTaq = rows.reduce((acc, r) => acc + r.prem_taq, 0);

      return {
        sistema: sis,
        ventas: { ofi: vOfi, taq: vTaq, diff: vOfi - vTaq },
        comisiones: { ofi: cOfi, taq: cTaq, diff: cOfi - cTaq },
        premios: { ofi: pOfi, taq: pTaq, diff: pOfi - pTaq },
      };
    });
  }, [auditRows]);

  // Accumulated expenses and payments across agencies in active currency
  const accumulatedExpensesAndPayments = useMemo(() => {
    const agMap: Record<string, { gOfi: number; gTaq: number; pOfi: number; pTaq: number }> = {};
    auditRows.forEach((r) => {
      if (!agMap[r.agencia]) {
        agMap[r.agencia] = {
          gOfi: r.gastos_ofi,
          gTaq: r.gastos_taq,
          pOfi: r.pagos_ofi,
          pTaq: r.pagos_taq,
        };
      }
    });

    const entries = Object.values(agMap);
    const tGOfi = entries.reduce((acc, e) => acc + e.gOfi, 0);
    const tGTaq = entries.reduce((acc, e) => acc + e.gTaq, 0);
    const tPOfi = entries.reduce((acc, e) => acc + e.pOfi, 0);
    const tPTaq = entries.reduce((acc, e) => acc + e.pTaq, 0);

    return {
      gastos: { ofi: tGOfi, taq: tGTaq, diff: tGOfi - tGTaq },
      pagos: { ofi: tPOfi, taq: tPTaq, diff: tPOfi - tPTaq },
    };
  }, [auditRows]);

  // Filtered lists for the active currency detailed report
  const filteredSalesTaq = useMemo(() => {
    return salesTaquilla.filter((s: any) => {
      const mon = normalizarMoneda(s.moneda);
      if (mon !== activeCurrency) return false;
      if (auditableAgencyNames.size > 0) {
        const ag = String(s.nombre_agency || s.agencia || '').trim().toUpperCase();
        if (!auditableAgencyNames.has(ag)) return false;
      }
      return true;
    });
  }, [salesTaquilla, activeCurrency, auditableAgencyNames]);

  const filteredExpensesTaq = useMemo(() => {
    return expensesTaquilla.filter((g: any) => {
      const mon = normalizarMoneda(g.moneda);
      if (mon !== activeCurrency) return false;
      if (auditableAgencyNames.size > 0) {
        const ag = String(g.agencia || '').trim().toUpperCase();
        if (!auditableAgencyNames.has(ag)) return false;
      }
      return true;
    });
  }, [expensesTaquilla, activeCurrency, auditableAgencyNames]);

  const filteredPaymentsTaq = useMemo(() => {
    return paymentsTaquilla.filter((p: any) => {
      const mon = normalizarMoneda(p.moneda);
      if (mon !== activeCurrency) return false;
      if (auditableAgencyNames.size > 0) {
        const ag = String(p.agencia || '').trim().toUpperCase();
        if (!auditableAgencyNames.has(ag)) return false;
      }
      return true;
    });
  }, [paymentsTaquilla, activeCurrency, auditableAgencyNames]);

  // Period totals for the 6 metric boxes (exact Python formulas)
  const detailedPeriodTotals = useMemo(() => {
    const tVTotal = filteredSalesTaq.reduce((acc, r: any) => acc + Number(r.monto_venta || 0), 0);
    const tCTotal = filteredSalesTaq.reduce((acc, r: any) => acc + Number(r.comision || 0), 0);
    const tPTotal = filteredSalesTaq.reduce((acc, r: any) => acc + Number(r.monto_premios || 0), 0);
    const tGTotal = filteredExpensesTaq.reduce((acc, r: any) => acc + Number(r.monto || 0), 0);
    const tPgTotal = filteredPaymentsTaq.reduce((acc, r: any) => acc + Number(r.monto || 0), 0);
    const saldoFinal = tVTotal - tCTotal - tPTotal - tGTotal - tPgTotal;

    return { tVTotal, tCTotal, tPTotal, tGTotal, tPgTotal, saldoFinal };
  }, [filteredSalesTaq, filteredExpensesTaq, filteredPaymentsTaq]);

  // Handlers for Taquilla Credentials
  const handleCreateTaquillaUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!effectiveUserId || !newUserAgencyId) return;

    if (!newUsuario.trim() || !newClave.trim()) {
      setMessage({ type: 'error', text: 'Usuario y clave requeridos.' });
      return;
    }

    setIsProcessing(true);
    try {
      const payload = {
        usuario: newUsuario.trim().toLowerCase(),
        clave: newClave.trim(),
        rol: newRol,
        agencia_id: newUserAgencyId,
        nombre_cajero: newNombreCajero.trim() || undefined,
        activo: true,
        user_id: effectiveUserId,
      };

      const { error } = await supabase.from('taquilla_usuarios').insert(payload);
      if (error) throw error;

      confetti({ particleCount: 35, spread: 60 });
      setMessage({ type: 'success', text: `Usuario '${newUsuario}' creado con éxito.` });
      setNewUserAgencyId(null);
      setNewUsuario('');
      setNewClave('');
      setNewNombreCajero('');
      await loadData();
    } catch (err: any) {
      console.error('Error creating taquilla user:', err);
      setMessage({ type: 'error', text: err?.message || 'Error al crear usuario.' });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUpdateTaquillaUser = async () => {
    if (!editingUser || !effectiveUserId) return;
    setIsProcessing(true);

    try {
      const payload: any = {
        rol: editRol,
        activo: editActivo,
      };
      if (editClave.trim()) {
        payload.clave = editClave.trim();
      }

      const { error } = await supabase
        .from('taquilla_usuarios')
        .update(payload)
        .eq('id', editingUser.id)
        .eq('user_id', effectiveUserId);

      if (error) throw error;

      setMessage({ type: 'success', text: `Usuario '${editingUser.usuario}' actualizado.` });
      setEditingUser(null);
      setEditClave('');
      await loadData();
    } catch (err: any) {
      console.error('Error updating taquilla user:', err);
      setMessage({ type: 'error', text: err?.message || 'Error al actualizar.' });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteTaquillaUser = async (userItem: TaquillaUser) => {
    if (!window.confirm(`¿Eliminar al usuario de taquilla '${userItem.usuario}'?`)) return;
    setIsProcessing(true);

    try {
      const { error } = await supabase
        .from('taquilla_usuarios')
        .delete()
        .eq('id', userItem.id)
        .eq('user_id', effectiveUserId);

      if (error) throw error;

      setMessage({ type: 'success', text: `Usuario '${userItem.usuario}' eliminado.` });
      await loadData();
    } catch (err: any) {
      console.error('Error deleting taquilla user:', err);
      setMessage({ type: 'error', text: err?.message || 'Error al eliminar.' });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Header: Modern SaaS Banner with Subtle Glowing Gradient */}
      <div className="bg-gradient-to-r from-[#0D1B22] via-[#0F242C] to-[#0D1B22] border border-slate-800/80 rounded-3xl p-6 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Auditoría Híbrida 360° • SaaS Multiusuario</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2.5">
              <span>Panel de Auditoría</span>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono font-normal">
                Taquilla vs Carga Oficial
              </span>
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 max-w-2xl">
              Comparativa por <strong>ciclo completo</strong>: concilia y audita en vivo ventas, comisiones, premios, gastos y cobros entre el CMS central y las terminales de taquilla.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => loadData()}
              disabled={isLoading}
              className="p-3 rounded-2xl bg-slate-800/90 hover:bg-slate-700 text-slate-300 hover:text-white transition-all border border-slate-700/80 cursor-pointer shadow-sm hover:scale-105 active:scale-95"
              title="Sincronizar y actualizar datos"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-emerald-400' : ''}`} />
            </button>
          </div>
        </div>

        {/* Date Filter Strip with Glassmorphic Input Controls */}
        <div className="mt-5 pt-4 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-xs relative z-10">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px] flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-emerald-400" />
              <span>Período de Auditoría:</span>
            </span>
            <div className="flex items-center gap-1.5 bg-[#071217]/90 border border-slate-700/80 rounded-xl px-2.5 py-1">
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

          <button
            onClick={() => {
              setFechaDesde(systemCycle.desde);
              setFechaHasta(systemCycle.hasta);
            }}
            className="px-3 py-1.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer hover:shadow-sm"
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Restablecer al Ciclo Actual ({formatDate(systemCycle.desde)} al {formatDate(systemCycle.hasta)})</span>
          </button>
        </div>
      </div>

      {message && (
        <div
          className={`p-4 rounded-2xl border flex items-center gap-3 text-xs font-bold animate-fadeIn shadow-lg ${
            message.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
          }`}
        >
          {message.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
          <span>{message.text}</span>
        </div>
      )}

      {/* 2. Expander: Gestion de Credenciales por Terminal (Modern Interactive Accordion) */}
      <div className="bg-[#0D1B22] border border-slate-800/80 rounded-3xl overflow-hidden shadow-xl transition-all">
        <button
          onClick={() => setIsCredentialsOpen(!isCredentialsOpen)}
          className="w-full p-5 flex items-center justify-between text-left hover:bg-slate-800/30 transition-colors cursor-pointer group"
        >
          <div className="flex items-center gap-3.5">
            <div className="p-2.5 rounded-2xl bg-sky-500/10 text-sky-400 border border-sky-500/20 group-hover:scale-105 transition-transform">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                <span>Gestion de Credenciales por Terminal</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 font-mono font-semibold">
                  {taquillaUsers.length} usuarios
                </span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Administra, crea y modifica las credenciales individuales de cajeros o supervisores por agencia.
              </p>
            </div>
          </div>
          <div className="p-2 rounded-xl bg-slate-800/60 text-slate-400 group-hover:text-white transition-colors">
            {isCredentialsOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </button>

        {isCredentialsOpen && (
          <div className="p-5 pt-0 border-t border-slate-800/60 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 pt-3">
              {agencies.map((ag) => {
                const agUsers = taquillaUsers.filter((u) => u.agencia_id === ag.id);

                return (
                  <div
                    key={ag.id}
                    className="bg-[#071217] border border-slate-800 rounded-2xl p-4 space-y-3.5 shadow-sm hover:border-slate-700 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          <Building2 className="w-3.5 h-3.5" />
                        </div>
                        <span className="text-xs font-black text-white uppercase">{ag.nombre_agencia}</span>
                      </div>

                      <button
                        onClick={() => {
                          setNewUserAgencyId(newUserAgencyId === ag.id ? null : ag.id);
                          setNewUsuario('');
                          setNewClave('');
                          setNewNombreCajero('');
                          setNewRol('cajero');
                        }}
                        className="px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[11px] font-bold flex items-center gap-1 transition-all cursor-pointer"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Nuevo</span>
                      </button>
                    </div>

                    {/* Active users tag chips */}
                    <div className="text-xs">
                      {agUsers.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {agUsers
                            .filter((u) => u.activo)
                            .map((u) => (
                              <span
                                key={u.id}
                                className="px-2 py-0.5 rounded-md bg-slate-800/80 border border-slate-700/60 font-mono text-[11px] text-slate-300 flex items-center gap-1"
                              >
                                <span className="font-bold text-sky-400">{u.usuario}</span>
                                <span className="text-[9px] px-1 rounded bg-slate-700 text-slate-300 font-sans uppercase font-bold">
                                  {u.rol === 'supervisor' ? 'S' : u.rol === 'agencia' ? 'A' : 'C'}
                                </span>
                              </span>
                            ))}
                        </div>
                      ) : (
                        <p className="text-[11px] text-slate-500 italic">Sin usuarios registrados</p>
                      )}
                    </div>

                    {/* New User Inline Form */}
                    {newUserAgencyId === ag.id && (
                      <form onSubmit={handleCreateTaquillaUser} className="p-3.5 rounded-xl bg-[#0D1B22] border border-slate-700 space-y-2.5 text-xs animate-fadeIn">
                        <div className="font-bold text-white flex items-center justify-between">
                          <span>Nuevo usuario en {ag.nombre_agencia}</span>
                          <button type="button" onClick={() => setNewUserAgencyId(null)} className="text-slate-400 hover:text-white cursor-pointer">✕</button>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Usuario</label>
                            <input
                              type="text"
                              placeholder="ej: cajero01"
                              value={newUsuario}
                              onChange={(e) => setNewUsuario(e.target.value)}
                              required
                              className="w-full bg-[#071217] border border-slate-700 rounded-lg px-2.5 py-1.5 text-white"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Clave</label>
                            <input
                              type="password"
                              placeholder="••••••••"
                              value={newClave}
                              onChange={(e) => setNewClave(e.target.value)}
                              required
                              className="w-full bg-[#071217] border border-slate-700 rounded-lg px-2.5 py-1.5 text-white font-mono"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Nombre (opcional)</label>
                            <input
                              type="text"
                              placeholder="Nombre del cajero"
                              value={newNombreCajero}
                              onChange={(e) => setNewNombreCajero(e.target.value)}
                              className="w-full bg-[#071217] border border-slate-700 rounded-lg px-2.5 py-1.5 text-white"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Rol</label>
                            <select
                              value={newRol}
                              onChange={(e) => setNewRol(e.target.value as any)}
                              className="w-full bg-[#071217] border border-slate-700 rounded-lg px-2.5 py-1.5 text-white"
                            >
                              <option value="cajero">cajero</option>
                              <option value="supervisor">supervisor</option>
                              <option value="agencia">agencia</option>
                            </select>
                          </div>
                        </div>
                        <div className="flex gap-2 pt-1">
                          <button
                            type="submit"
                            disabled={isProcessing}
                            className="flex-1 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-xs transition-colors cursor-pointer"
                          >
                            Guardar
                          </button>
                          <button
                            type="button"
                            onClick={() => setNewUserAgencyId(null)}
                            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-lg text-xs transition-colors cursor-pointer"
                          >
                            Cancelar
                          </button>
                        </div>
                      </form>
                    )}

                    {/* Detailed user list cards */}
                    {agUsers.length > 0 && (
                      <div className="space-y-2 pt-1 max-h-48 overflow-y-auto">
                        {agUsers.map((u) => {
                          const isSupervisor = u.rol === 'supervisor';
                          const isAgencia = u.rol === 'agencia';

                          return (
                            <div
                              key={u.id}
                              className="flex items-center justify-between p-2.5 rounded-xl bg-[#0D1B22]/90 border border-slate-800 text-xs hover:border-slate-700 transition-colors"
                            >
                              <div>
                                <div className="font-mono font-bold text-white flex items-center gap-1.5">
                                  <span>{u.usuario}</span>
                                </div>
                                {u.nombre_cajero && (
                                  <div className="text-[10px] text-slate-400">{u.nombre_cajero}</div>
                                )}
                              </div>

                              <div className="flex items-center gap-2">
                                <span
                                  className={`text-[9px] px-2 py-0.5 rounded-md font-extrabold uppercase tracking-wide ${
                                    isAgencia
                                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                                      : isSupervisor
                                      ? 'bg-blue-500/10 text-blue-400 border border-blue-500/30'
                                      : 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                                  }`}
                                >
                                  {u.rol}
                                </span>

                                <button
                                  onClick={() => {
                                    setEditingUser(u);
                                    setEditRol(u.rol);
                                    setEditActivo(u.activo);
                                    setEditClave('');
                                  }}
                                  className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                                  title="Modificar Rol / Clave"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => handleDeleteTaquillaUser(u)}
                                  className="p-1 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                                  title="Eliminar"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Edit User Modal */}
      {editingUser && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-[#0D1B22] border border-slate-800 rounded-3xl p-6 max-w-sm w-full space-y-4 shadow-2xl">
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
              <Key className="w-4 h-4 text-emerald-400" />
              <span>Editar Usuario: <code className="text-emerald-400">{editingUser.usuario}</code></span>
            </h4>

            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Modificar Rol</label>
              <select
                value={editRol}
                onChange={(e) => setEditRol(e.target.value as any)}
                className="w-full bg-[#071217] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
              >
                <option value="cajero">cajero</option>
                <option value="supervisor">supervisor</option>
                <option value="agencia">agencia</option>
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Nueva Clave</label>
              <input
                type="password"
                placeholder="dejar vacío = sin cambios"
                value={editClave}
                onChange={(e) => setEditClave(e.target.value)}
                className="w-full bg-[#071217] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono"
              />
            </div>

            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={editActivo}
                onChange={(e) => setEditActivo(e.target.checked)}
                className="rounded border-slate-700 text-emerald-500 cursor-pointer"
              />
              <span>Usuario Activo en Taquilla</span>
            </label>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                className="flex-1 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleUpdateTaquillaUser}
                disabled={isProcessing}
                className="flex-1 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-colors cursor-pointer"
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. Section: Comparativa por Ciclo Completo */}
      <div className="space-y-4 pt-1">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-base sm:text-lg font-black text-white tracking-tight flex items-center gap-2">
              <span className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <Coins className="w-4 h-4" />
              </span>
              <span>Comparativa por Ciclo Completo</span>
              <span className="text-xs font-mono font-normal text-slate-400">
                ({formatDate(fechaDesde)} al {formatDate(fechaHasta)})
              </span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Cruce exhaustivo de ventas, comisiones, premios, gastos y cobros oficiales vs taquilla.
            </p>
          </div>

          {/* Currency Pill Tabs (Modern Glassmorphic Pills) */}
          <div className="flex items-center gap-1.5 bg-[#071217] p-1 rounded-2xl border border-slate-800 shadow-inner">
            {(['BS', 'USD', 'COP'] as const).map((mon) => (
              <button
                key={mon}
                onClick={() => setActiveCurrency(mon)}
                className={`px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeCurrency === mon
                    ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20 scale-[1.02]'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
                }`}
              >
                <span>{mon === 'BS' ? '🇻🇪 BS' : mon === 'USD' ? '💵 USD' : '🇨🇴 COP'}</span>
              </button>
            ))}
          </div>
        </div>

        {/* --- DENTRO DE LA MONEDA ACTIVA --- */}
        <div className="space-y-6">
          {/* Comparative Section: Empty or Data Table */}
          {auditRows.length === 0 ? (
            /* Modern Empty State Card with Glassmorphism */
            <div className="bg-[#0D1B22]/70 border border-slate-800 rounded-3xl p-8 text-center space-y-2.5 shadow-xl">
              <div className="w-12 h-12 rounded-2xl bg-sky-500/10 border border-sky-500/20 text-sky-400 flex items-center justify-center mx-auto shadow-inner">
                <Sparkles className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-bold text-white">Sin movimientos auditables en {activeCurrency}</h4>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                No hay movimientos ni ventas oficiales registrados en {activeCurrency} para este ciclo ({formatDate(fechaDesde)} al {formatDate(fechaHasta)}).
              </p>
            </div>
          ) : (
            <div className="bg-[#0D1B22] border border-slate-800 rounded-3xl p-5 shadow-2xl space-y-6">
              {/* Table of 14 columns */}
              <div className="overflow-x-auto rounded-2xl border border-slate-800/80">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#071217]/90 text-[10px] font-black text-slate-400 uppercase tracking-wider">
                    <tr className="border-b border-slate-800">
                      <th className="py-3 px-3">Agencia</th>
                      <th className="py-3 px-3">Sistema</th>
                      <th className="py-3 px-3 text-right">Venta Ofi</th>
                      <th className="py-3 px-3 text-right text-sky-400">Venta Taq</th>
                      <th className="py-3 px-3 text-right">Com Ofi</th>
                      <th className="py-3 px-3 text-right">Com Taq</th>
                      <th className="py-3 px-3 text-right">Prem Ofi</th>
                      <th className="py-3 px-3 text-right text-rose-400">Prem Taq</th>
                      <th className="py-3 px-3 text-right">Part Ofi</th>
                      <th className="py-3 px-3 text-right text-emerald-400">Part Taq</th>
                      <th className="py-3 px-3 text-right">Gto Ofi</th>
                      <th className="py-3 px-3 text-right">Gto Taq</th>
                      <th className="py-3 px-3 text-right">Pag Ofi</th>
                      <th className="py-3 px-3 text-right">Pag Taq</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {auditRows.map((r, idx) => (
                      <tr key={`${r.agencia}_${r.sistema}_${idx}`} className="hover:bg-slate-800/30 transition-colors">
                        <td className="py-2.5 px-3 font-bold font-sans text-white">{r.agencia}</td>
                        <td className="py-2.5 px-3 font-sans text-slate-300">
                          <span className="px-2 py-0.5 rounded-md bg-slate-800 text-[10px] font-bold">
                            {r.sistema}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right text-slate-300">{r.venta_ofi ? formatCurrency(r.venta_ofi, activeCurrency) : '-'}</td>
                        <td className="py-2.5 px-3 text-right text-sky-400 font-bold">{r.venta_taq ? formatCurrency(r.venta_taq, activeCurrency) : '-'}</td>
                        <td className="py-2.5 px-3 text-right text-slate-400">{r.com_ofi ? formatCurrency(r.com_ofi, activeCurrency) : '-'}</td>
                        <td className="py-2.5 px-3 text-right text-slate-300">{r.com_taq ? formatCurrency(r.com_taq, activeCurrency) : '-'}</td>
                        <td className="py-2.5 px-3 text-right text-rose-400">{r.prem_ofi ? formatCurrency(r.prem_ofi, activeCurrency) : '-'}</td>
                        <td className="py-2.5 px-3 text-right text-rose-300 font-bold">{r.prem_taq ? formatCurrency(r.prem_taq, activeCurrency) : '-'}</td>
                        <td className="py-2.5 px-3 text-right text-emerald-400">{r.part_ofi ? formatCurrency(r.part_ofi, activeCurrency) : '-'}</td>
                        <td className="py-2.5 px-3 text-right text-emerald-300 font-bold">{r.part_taq ? formatCurrency(r.part_taq, activeCurrency) : '-'}</td>
                        <td className="py-2.5 px-3 text-right text-slate-400">{r.gastos_ofi ? formatCurrency(r.gastos_ofi, activeCurrency) : '-'}</td>
                        <td className="py-2.5 px-3 text-right text-slate-300">{r.gastos_taq ? formatCurrency(r.gastos_taq, activeCurrency) : '-'}</td>
                        <td className="py-2.5 px-3 text-right text-slate-400">{r.pagos_ofi ? formatCurrency(r.pagos_ofi, activeCurrency) : '-'}</td>
                        <td className="py-2.5 px-3 text-right text-slate-300">{r.pagos_taq ? formatCurrency(r.pagos_taq, activeCurrency) : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Totales y Diferencias por Sistema */}
              {systemMetrics.length > 0 && (
                <div className="space-y-3 pt-3 border-t border-slate-800/80">
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-sky-400" />
                    <span className="text-xs font-black text-sky-400 uppercase tracking-wider">
                      Totales por Sistema en {activeCurrency} (Ciclo Completo)
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                    {systemMetrics.map((sm) => (
                      <div key={sm.sistema} className="bg-[#071217] border border-slate-800 rounded-2xl p-3.5 space-y-2.5 text-xs shadow-sm">
                        <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                          <span className="font-black text-white">{sm.sistema}</span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-400 font-bold">
                            {activeCurrency}
                          </span>
                        </div>

                        <div className="grid grid-cols-4 font-bold text-slate-400 pb-1 border-b border-slate-800/60 text-[10px] uppercase">
                          <div>Métrica</div>
                          <div className="text-right">Oficial</div>
                          <div className="text-right">Taquilla</div>
                          <div className="text-right">Diferencia</div>
                        </div>

                        {/* Ventas */}
                        <div className="grid grid-cols-4 font-mono text-[11px] py-1 items-center">
                          <div className="font-sans text-slate-300 font-bold">Ventas</div>
                          <div className="text-right text-slate-300">{formatCurrency(sm.ventas.ofi, activeCurrency)}</div>
                          <div className="text-right text-sky-400 font-bold">{formatCurrency(sm.ventas.taq, activeCurrency)}</div>
                          <div className="text-right font-bold">
                            {Math.abs(sm.ventas.diff) < 0.5 ? (
                              <span className="text-slate-500">---</span>
                            ) : (
                              <span className={sm.ventas.diff > 0 ? 'text-rose-400' : 'text-emerald-400'}>
                                {sm.ventas.diff > 0 ? '▲' : '▼'} {formatCurrency(Math.abs(sm.ventas.diff), activeCurrency)}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Comis. */}
                        <div className="grid grid-cols-4 font-mono text-[11px] py-1 items-center border-t border-slate-800/40">
                          <div className="font-sans text-slate-300 font-bold">Comis.</div>
                          <div className="text-right text-slate-300">{formatCurrency(sm.comisiones.ofi, activeCurrency)}</div>
                          <div className="text-right text-slate-200 font-bold">{formatCurrency(sm.comisiones.taq, activeCurrency)}</div>
                          <div className="text-right font-bold">
                            {Math.abs(sm.comisiones.diff) < 0.5 ? (
                              <span className="text-slate-500">---</span>
                            ) : (
                              <span className={sm.comisiones.diff > 0 ? 'text-rose-400' : 'text-emerald-400'}>
                                {sm.comisiones.diff > 0 ? '▲' : '▼'} {formatCurrency(Math.abs(sm.comisiones.diff), activeCurrency)}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Premios */}
                        <div className="grid grid-cols-4 font-mono text-[11px] py-1 items-center border-t border-slate-800/40">
                          <div className="font-sans text-slate-300 font-bold">Premios</div>
                          <div className="text-right text-slate-300">{formatCurrency(sm.premios.ofi, activeCurrency)}</div>
                          <div className="text-right text-rose-400 font-bold">{formatCurrency(sm.premios.taq, activeCurrency)}</div>
                          <div className="text-right font-bold">
                            {Math.abs(sm.premios.diff) < 0.5 ? (
                              <span className="text-slate-500">---</span>
                            ) : (
                              <span className={sm.premios.diff > 0 ? 'text-rose-400' : 'text-emerald-400'}>
                                {sm.premios.diff > 0 ? '▲' : '▼'} {formatCurrency(Math.abs(sm.premios.diff), activeCurrency)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Gastos y Pagos Acumulados */}
              <div className="space-y-3 pt-2 border-t border-slate-800/80">
                <div className="flex items-center gap-2">
                  <Receipt className="w-4 h-4 text-sky-400" />
                  <span className="text-xs font-black text-sky-400 uppercase tracking-wider">
                    Gastos y Pagos Acumulados en {activeCurrency} (Ciclo)
                  </span>
                </div>

                <div className="bg-[#071217] border border-slate-800 rounded-2xl p-4 space-y-3 text-xs max-w-xl shadow-sm">
                  <div className="grid grid-cols-4 font-bold text-slate-400 pb-1.5 border-b border-slate-800 text-[10px] uppercase">
                    <div>Concepto</div>
                    <div className="text-right">Oficial</div>
                    <div className="text-right">Taquilla</div>
                    <div className="text-right">Diferencia</div>
                  </div>

                  {/* Gastos */}
                  <div className="grid grid-cols-4 font-mono text-[11px] py-1 items-center">
                    <div className="font-sans text-slate-200 font-bold">Gastos</div>
                    <div className="text-right text-slate-300">{formatCurrency(accumulatedExpensesAndPayments.gastos.ofi, activeCurrency)}</div>
                    <div className="text-right text-amber-400 font-bold">{formatCurrency(accumulatedExpensesAndPayments.gastos.taq, activeCurrency)}</div>
                    <div className="text-right font-bold">
                      {Math.abs(accumulatedExpensesAndPayments.gastos.diff) < 0.5 ? (
                        <span className="text-slate-500">---</span>
                      ) : (
                        <span className={accumulatedExpensesAndPayments.gastos.diff > 0 ? 'text-rose-400' : 'text-emerald-400'}>
                          {accumulatedExpensesAndPayments.gastos.diff > 0 ? '▲' : '▼'} {formatCurrency(Math.abs(accumulatedExpensesAndPayments.gastos.diff), activeCurrency)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Pagos */}
                  <div className="grid grid-cols-4 font-mono text-[11px] py-1 items-center border-t border-slate-800/40">
                    <div className="font-sans text-slate-200 font-bold">Pagos</div>
                    <div className="text-right text-slate-300">{formatCurrency(accumulatedExpensesAndPayments.pagos.ofi, activeCurrency)}</div>
                    <div className="text-right text-teal-400 font-bold">{formatCurrency(accumulatedExpensesAndPayments.pagos.taq, activeCurrency)}</div>
                    <div className="text-right font-bold">
                      {Math.abs(accumulatedExpensesAndPayments.pagos.diff) < 0.5 ? (
                        <span className="text-slate-500">---</span>
                      ) : (
                        <span className={accumulatedExpensesAndPayments.pagos.diff > 0 ? 'text-rose-400' : 'text-emerald-400'}>
                          {accumulatedExpensesAndPayments.pagos.diff > 0 ? '▲' : '▼'} {formatCurrency(Math.abs(accumulatedExpensesAndPayments.pagos.diff), activeCurrency)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 4. Section: Reporte Detallado del Periodo */}
          <div className="bg-[#0D1B22] border border-slate-800/80 rounded-3xl p-6 shadow-2xl space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-800/80">
              <div>
                <h4 className="text-base sm:text-lg font-black text-white tracking-tight flex items-center gap-2">
                  <span className="p-2 rounded-xl bg-teal-500/10 text-teal-400 border border-teal-500/20">
                    <TrendingUp className="w-4 h-4" />
                  </span>
                  <span>Reporte Detallado del Periodo</span>
                </h4>
                <p className="text-xs text-slate-400 mt-1">
                  Terminal(es): <strong className="text-emerald-400">{terminalesLabel}</strong> • Ciclo: <strong className="text-slate-200">{formatDate(fechaDesde)} al {formatDate(fechaHasta)}</strong> • Moneda: <strong className="text-sky-400">{activeCurrency}</strong>
                </p>
              </div>
            </div>

            {/* 6 Metric Boxes: Top-tier Modern Glassmorphic Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-1">
              {/* 1. Total Ventas */}
              <div className="bg-[#071217] border border-slate-800/80 hover:border-sky-500/40 rounded-2xl p-4 shadow-sm transition-all group">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Ventas</span>
                  <div className="p-1.5 rounded-lg bg-sky-500/10 text-sky-400 border border-sky-500/20 group-hover:scale-110 transition-transform">
                    <TrendingUp className="w-3.5 h-3.5" />
                  </div>
                </div>
                <div className="text-lg sm:text-xl font-black text-sky-400 font-mono truncate">
                  {formatCurrency(detailedPeriodTotals.tVTotal, activeCurrency)}
                </div>
              </div>

              {/* 2. Total Comision */}
              <div className="bg-[#071217] border border-slate-800/80 hover:border-slate-700 rounded-2xl p-4 shadow-sm transition-all group">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Comisión</span>
                  <div className="p-1.5 rounded-lg bg-slate-800 text-slate-300 border border-slate-700 group-hover:scale-110 transition-transform">
                    <Percent className="w-3.5 h-3.5" />
                  </div>
                </div>
                <div className="text-lg sm:text-xl font-black text-slate-200 font-mono truncate">
                  {formatCurrency(detailedPeriodTotals.tCTotal, activeCurrency)}
                </div>
              </div>

              {/* 3. Total Premios */}
              <div className="bg-[#071217] border border-slate-800/80 hover:border-rose-500/40 rounded-2xl p-4 shadow-sm transition-all group">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Premios</span>
                  <div className="p-1.5 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20 group-hover:scale-110 transition-transform">
                    <Trophy className="w-3.5 h-3.5" />
                  </div>
                </div>
                <div className="text-lg sm:text-xl font-black text-rose-400 font-mono truncate">
                  {formatCurrency(detailedPeriodTotals.tPTotal, activeCurrency)}
                </div>
              </div>

              {/* 4. Total Gastos */}
              <div className="bg-[#071217] border border-slate-800/80 hover:border-amber-500/40 rounded-2xl p-4 shadow-sm transition-all group">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Gastos</span>
                  <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 group-hover:scale-110 transition-transform">
                    <Receipt className="w-3.5 h-3.5" />
                  </div>
                </div>
                <div className="text-lg sm:text-xl font-black text-amber-400 font-mono truncate">
                  {formatCurrency(detailedPeriodTotals.tGTotal, activeCurrency)}
                </div>
              </div>

              {/* 5. Total Pagos */}
              <div className="bg-[#071217] border border-slate-800/80 hover:border-teal-500/40 rounded-2xl p-4 shadow-sm transition-all group">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Pagos</span>
                  <div className="p-1.5 rounded-lg bg-teal-500/10 text-teal-400 border border-teal-500/20 group-hover:scale-110 transition-transform">
                    <CircleDollarSign className="w-3.5 h-3.5" />
                  </div>
                </div>
                <div className="text-lg sm:text-xl font-black text-teal-300 font-mono truncate">
                  {formatCurrency(detailedPeriodTotals.tPgTotal, activeCurrency)}
                </div>
              </div>

              {/* 6. Saldo Final */}
              <div className={`bg-[#071217] border rounded-2xl p-4 shadow-sm transition-all group ${
                detailedPeriodTotals.saldoFinal >= 0
                  ? 'border-emerald-500/40 hover:border-emerald-500'
                  : 'border-rose-500/40 hover:border-rose-500'
              }`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Saldo Final</span>
                  <div className={`p-1.5 rounded-lg border group-hover:scale-110 transition-transform ${
                    detailedPeriodTotals.saldoFinal >= 0
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                      : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                  }`}>
                    <Wallet className="w-3.5 h-3.5" />
                  </div>
                </div>
                <div className={`text-lg sm:text-xl font-black font-mono truncate ${
                  detailedPeriodTotals.saldoFinal >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}>
                  {formatCurrency(detailedPeriodTotals.saldoFinal, activeCurrency)}
                </div>
              </div>
            </div>

            {/* 3 Subtabs: Ventas | Gastos | Pagos (Modern Pill Style) */}
            <div className="pt-3 space-y-4">
              <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 pb-3">
                <button
                  onClick={() => setActiveSubTab('Ventas')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
                    activeSubTab === 'Ventas'
                      ? 'bg-sky-500/10 text-sky-400 border border-sky-500/30 shadow-sm'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                  }`}
                >
                  <TrendingUp className="w-3.5 h-3.5" />
                  <span>Ventas</span>
                  <span className="px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-400 text-[10px] font-mono font-bold">
                    {filteredSalesTaq.length}
                  </span>
                </button>

                <button
                  onClick={() => setActiveSubTab('Gastos')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
                    activeSubTab === 'Gastos'
                      ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30 shadow-sm'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                  }`}
                >
                  <Receipt className="w-3.5 h-3.5" />
                  <span>Gastos</span>
                  <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 text-[10px] font-mono font-bold">
                    {filteredExpensesTaq.length}
                  </span>
                </button>

                <button
                  onClick={() => setActiveSubTab('Pagos')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
                    activeSubTab === 'Pagos'
                      ? 'bg-teal-500/10 text-teal-400 border border-teal-500/30 shadow-sm'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                  }`}
                >
                  <CircleDollarSign className="w-3.5 h-3.5" />
                  <span>Pagos</span>
                  <span className="px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-400 text-[10px] font-mono font-bold">
                    {filteredPaymentsTaq.length}
                  </span>
                </button>
              </div>

              {/* Subtab Ventas Content */}
              {activeSubTab === 'Ventas' && (
                <div>
                  {filteredSalesTaq.length === 0 ? (
                    <div className="bg-[#071217] border border-slate-800/80 rounded-2xl p-8 text-center space-y-2 shadow-inner">
                      <div className="w-10 h-10 rounded-2xl bg-sky-500/10 border border-sky-500/20 text-sky-400 flex items-center justify-center mx-auto">
                        <TrendingUp className="w-5 h-5" />
                      </div>
                      <h5 className="text-sm font-bold text-white">No hay ventas registradas en el periodo</h5>
                      <p className="text-xs text-slate-400 max-w-sm mx-auto">
                        No se han reportado cierres diarios de ventas desde taquilla en {activeCurrency} entre el {formatDate(fechaDesde)} y el {formatDate(fechaHasta)}.
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded-2xl border border-slate-800/80 shadow-sm">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-[#071217] text-[10px] font-black text-slate-400 uppercase tracking-wider">
                          <tr className="border-b border-slate-800">
                            <th className="py-2.5 px-3">ID</th>
                            <th className="py-2.5 px-3">Agencia</th>
                            <th className="py-2.5 px-3">Sistema</th>
                            <th className="py-2.5 px-3">Moneda</th>
                            <th className="py-2.5 px-3 text-right">Venta</th>
                            <th className="py-2.5 px-3 text-right">Comisión</th>
                            <th className="py-2.5 px-3 text-right">Premios</th>
                            <th className="py-2.5 px-3 text-right">Neto</th>
                            <th className="py-2.5 px-3 text-right">Fecha</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 font-mono">
                          {filteredSalesTaq.map((s: any) => (
                            <tr key={s.id} className="hover:bg-slate-800/30 transition-colors">
                              <td className="py-2.5 px-3 text-slate-400 font-sans">#{s.id}</td>
                              <td className="py-2.5 px-3 text-white font-sans font-bold">{s.nombre_agency || s.agencia}</td>
                              <td className="py-2.5 px-3 text-slate-300 font-sans">
                                <span className="px-2 py-0.5 rounded bg-slate-800 text-[10px] font-bold">
                                  {s.sistema}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-slate-400 font-sans">{s.moneda}</td>
                              <td className="py-2.5 px-3 text-right text-sky-400 font-black">{formatCurrency(s.monto_venta, activeCurrency)}</td>
                              <td className="py-2.5 px-3 text-right text-slate-300">{formatCurrency(s.comision, activeCurrency)}</td>
                              <td className="py-2.5 px-3 text-right text-rose-400">{formatCurrency(s.monto_premios, activeCurrency)}</td>
                              <td className="py-2.5 px-3 text-right text-emerald-400 font-bold">{formatCurrency(s.neto, activeCurrency)}</td>
                              <td className="py-2.5 px-3 text-right text-slate-400 font-sans">{formatDate(s.fecha)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Subtab Gastos Content */}
              {activeSubTab === 'Gastos' && (
                <div>
                  {filteredExpensesTaq.length === 0 ? (
                    <div className="bg-[#071217] border border-slate-800/80 rounded-2xl p-8 text-center space-y-2 shadow-inner">
                      <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto">
                        <Receipt className="w-5 h-5" />
                      </div>
                      <h5 className="text-sm font-bold text-white">No hay gastos registrados en el periodo</h5>
                      <p className="text-xs text-slate-400 max-w-sm mx-auto">
                        No existen recibos de gastos reportados desde taquilla en {activeCurrency} para este ciclo.
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded-2xl border border-slate-800/80 shadow-sm">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-[#071217] text-[10px] font-black text-slate-400 uppercase tracking-wider">
                          <tr className="border-b border-slate-800">
                            <th className="py-2.5 px-3">ID</th>
                            <th className="py-2.5 px-3">Agencia</th>
                            <th className="py-2.5 px-3">Concepto</th>
                            <th className="py-2.5 px-3">Moneda</th>
                            <th className="py-2.5 px-3 text-right">Monto</th>
                            <th className="py-2.5 px-3 text-center">Estado</th>
                            <th className="py-2.5 px-3 text-right">Fecha</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 font-mono">
                          {filteredExpensesTaq.map((g: any) => (
                            <tr key={g.id} className="hover:bg-slate-800/30 transition-colors">
                              <td className="py-2.5 px-3 text-slate-400 font-sans">#{g.id}</td>
                              <td className="py-2.5 px-3 text-white font-sans font-bold">{g.agencia}</td>
                              <td className="py-2.5 px-3 text-slate-300 font-sans">{g.concepto}</td>
                              <td className="py-2.5 px-3 text-slate-400 font-sans">{g.moneda}</td>
                              <td className="py-2.5 px-3 text-right text-amber-400 font-black">{formatCurrency(g.monto, activeCurrency)}</td>
                              <td className="py-2.5 px-3 text-center font-sans">
                                {g.confirmado ? (
                                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-extrabold flex items-center justify-center gap-1 w-fit mx-auto">
                                    <CheckCircle2 className="w-3 h-3" />
                                    Confirmado
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[10px] font-extrabold flex items-center justify-center gap-1 w-fit mx-auto">
                                    <Clock className="w-3 h-3" />
                                    Pendiente
                                  </span>
                                )}
                              </td>
                              <td className="py-2.5 px-3 text-right text-slate-400 font-sans">{formatDate(g.fecha)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Subtab Pagos Content */}
              {activeSubTab === 'Pagos' && (
                <div>
                  {filteredPaymentsTaq.length === 0 ? (
                    <div className="bg-[#071217] border border-slate-800/80 rounded-2xl p-8 text-center space-y-2 shadow-inner">
                      <div className="w-10 h-10 rounded-2xl bg-teal-500/10 border border-teal-500/20 text-teal-400 flex items-center justify-center mx-auto">
                        <CircleDollarSign className="w-5 h-5" />
                      </div>
                      <h5 className="text-sm font-bold text-white">No hay pagos registrados en el periodo</h5>
                      <p className="text-xs text-slate-400 max-w-sm mx-auto">
                        No se registran abonos o pagos confirmados desde taquilla en {activeCurrency} para este ciclo.
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded-2xl border border-slate-800/80 shadow-sm">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-[#071217] text-[10px] font-black text-slate-400 uppercase tracking-wider">
                          <tr className="border-b border-slate-800">
                            <th className="py-2.5 px-3">ID</th>
                            <th className="py-2.5 px-3">Agencia</th>
                            <th className="py-2.5 px-3">Tipo Pago</th>
                            <th className="py-2.5 px-3">Moneda</th>
                            <th className="py-2.5 px-3 text-right">Monto</th>
                            <th className="py-2.5 px-3 text-center">Estado</th>
                            <th className="py-2.5 px-3 text-right">Fecha</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 font-mono">
                          {filteredPaymentsTaq.map((p: any) => (
                            <tr key={p.id} className="hover:bg-slate-800/30 transition-colors">
                              <td className="py-2.5 px-3 text-slate-400 font-sans">#{p.id}</td>
                              <td className="py-2.5 px-3 text-white font-sans font-bold">{p.agencia}</td>
                              <td className="py-2.5 px-3 text-slate-300 font-sans">{p.tipo_pago}</td>
                              <td className="py-2.5 px-3 text-slate-400 font-sans">{p.moneda}</td>
                              <td className="py-2.5 px-3 text-right text-teal-400 font-black">{formatCurrency(p.monto, activeCurrency)}</td>
                              <td className="py-2.5 px-3 text-center font-sans">
                                {p.confirmado || p.confirmado_supervisor ? (
                                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-extrabold flex items-center justify-center gap-1 w-fit mx-auto">
                                    <CheckCircle2 className="w-3 h-3" />
                                    Confirmado
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[10px] font-extrabold flex items-center justify-center gap-1 w-fit mx-auto">
                                    <Clock className="w-3 h-3" />
                                    Pendiente
                                  </span>
                                )}
                              </td>
                              <td className="py-2.5 px-3 text-right text-slate-400 font-sans">{formatDate(p.fecha)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuditTab;
