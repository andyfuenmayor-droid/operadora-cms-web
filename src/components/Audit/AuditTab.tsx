import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { formatCurrency, normalizarMoneda } from '../../utils/formatters';
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
  Clock,
  ChevronDown,
  ChevronUp,
  Building2,
  Info,
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
  const { effectiveUserId, systemCycle } = useAuth();

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
      setMessage({ type: 'success', text: `Usuario '${newUsuario}' creado.` });
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
      {/* 1. Header (Exact Python Title & Caption) */}
      <div className="bg-[#0D1B22] border border-slate-800 rounded-3xl p-6 shadow-xl relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
              <span>🛡️</span>
              <span>Panel de Auditoría (Taquilla vs Carga Oficial)</span>
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Comparativa por <strong>ciclo completo</strong>: Oficial vs Taquilla, incluyendo gestión multiusuario integrada.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => loadData()}
              disabled={isLoading}
              className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
              title="Actualizar datos"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-emerald-400' : ''}`} />
            </button>
          </div>
        </div>

        {/* Date Filter & System Cycle Bar */}
        <div className="mt-4 pt-4 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-slate-400 font-bold uppercase text-[10px]">Período de Auditoría:</span>
            <input
              type="date"
              value={fechaDesde}
              onChange={(e) => setFechaDesde(e.target.value)}
              className="bg-[#071217] border border-slate-700 rounded-xl px-2.5 py-1 text-white font-mono text-xs focus:outline-none focus:border-emerald-500"
            />
            <span className="text-slate-500">al</span>
            <input
              type="date"
              value={fechaHasta}
              onChange={(e) => setFechaHasta(e.target.value)}
              className="bg-[#071217] border border-slate-700 rounded-xl px-2.5 py-1 text-white font-mono text-xs focus:outline-none focus:border-emerald-500"
            />
          </div>

          <button
            onClick={() => {
              setFechaDesde(systemCycle.desde);
              setFechaHasta(systemCycle.hasta);
            }}
            className="text-emerald-400 hover:text-emerald-300 font-semibold flex items-center gap-1 cursor-pointer"
          >
            <Clock className="w-3.5 h-3.5" />
            Restablecer al Ciclo Actual ({systemCycle.desde} al {systemCycle.hasta})
          </button>
        </div>
      </div>

      {message && (
        <div
          className={`p-3.5 rounded-2xl border flex items-center gap-2.5 text-xs font-bold animate-fadeIn ${
            message.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
          }`}
        >
          {message.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
          <span>{message.text}</span>
        </div>
      )}

      {/* 2. Expander: Gestion de Credenciales por Terminal */}
      <div className="bg-[#0D1B22] border border-slate-800 rounded-2xl overflow-hidden shadow-lg">
        <button
          onClick={() => setIsCredentialsOpen(!isCredentialsOpen)}
          className="w-full p-4 flex items-center justify-between text-left hover:bg-slate-800/40 transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <span className="text-slate-400 text-xs">{isCredentialsOpen ? '▼' : '▶'}</span>
            <span className="text-sm font-semibold text-white">Gestion de Credenciales por Terminal</span>
          </div>
          <div className="text-xs text-slate-500">
            {isCredentialsOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </button>

        {isCredentialsOpen && (
          <div className="p-4 pt-0 border-t border-slate-800/60 space-y-3">
            <p className="text-xs text-slate-400 pt-3">
              Administra, crea y modifica las credenciales individuales de cajeros o supervisores por agencia.
            </p>

            <div className="space-y-3">
              {agencies.map((ag) => {
                const agUsers = taquillaUsers.filter((u) => u.agencia_id === ag.id);

                return (
                  <div key={ag.id} className="bg-[#071217] border border-slate-800/90 rounded-xl p-3.5 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-emerald-400" />
                        <span className="text-xs font-bold text-white uppercase">{ag.nombre_agencia}</span>
                      </div>

                      <div className="flex items-center gap-2 text-xs">
                        <div className="text-slate-300 font-mono text-[11px]">
                          {agUsers.length > 0 ? (
                            agUsers
                              .filter((u) => u.activo)
                              .map((u) => (
                                <span key={u.id} className="mr-2 inline-block">
                                  <code className="bg-slate-800 px-1 py-0.5 rounded text-sky-300">{u.usuario}</code> (
                                  {u.rol === 'supervisor' ? 'S' : u.rol === 'agencia' ? 'A' : 'C'})
                                </span>
                              ))
                          ) : (
                            <span className="text-slate-500 italic">Sin usuarios</span>
                          )}
                        </div>

                        <button
                          onClick={() => {
                            setNewUserAgencyId(newUserAgencyId === ag.id ? null : ag.id);
                            setNewUsuario('');
                            setNewClave('');
                            setNewNombreCajero('');
                            setNewRol('cajero');
                          }}
                          className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1 cursor-pointer"
                        >
                          <Plus className="w-3 h-3 text-emerald-400" />
                          <span>Nuevo</span>
                        </button>
                      </div>
                    </div>

                    {/* New User Inline Form */}
                    {newUserAgencyId === ag.id && (
                      <form onSubmit={handleCreateTaquillaUser} className="p-3 rounded-lg bg-[#0D1B22] border border-slate-700 space-y-2 text-xs">
                        <div className="font-bold text-white flex items-center justify-between">
                          <span>Crear Usuario para {ag.nombre_agencia}</span>
                          <button type="button" onClick={() => setNewUserAgencyId(null)} className="text-slate-400 hover:text-white">✕</button>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[10px] text-slate-400 mb-0.5">Usuario</label>
                            <input
                              type="text"
                              placeholder="ej: cajero01"
                              value={newUsuario}
                              onChange={(e) => setNewUsuario(e.target.value)}
                              required
                              className="w-full bg-[#071217] border border-slate-700 rounded px-2 py-1 text-white"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] text-slate-400 mb-0.5">Clave</label>
                            <input
                              type="password"
                              placeholder="••••••••"
                              value={newClave}
                              onChange={(e) => setNewClave(e.target.value)}
                              required
                              className="w-full bg-[#071217] border border-slate-700 rounded px-2 py-1 text-white font-mono"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] text-slate-400 mb-0.5">Nombre (opcional)</label>
                            <input
                              type="text"
                              placeholder="Nombre del cajero"
                              value={newNombreCajero}
                              onChange={(e) => setNewNombreCajero(e.target.value)}
                              className="w-full bg-[#071217] border border-slate-700 rounded px-2 py-1 text-white"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] text-slate-400 mb-0.5">Rol</label>
                            <select
                              value={newRol}
                              onChange={(e) => setNewRol(e.target.value as any)}
                              className="w-full bg-[#071217] border border-slate-700 rounded px-2 py-1 text-white"
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
                            className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded text-xs"
                          >
                            💾 Guardar
                          </button>
                          <button
                            type="button"
                            onClick={() => setNewUserAgencyId(null)}
                            className="px-3 py-1 bg-slate-700 hover:bg-slate-600 text-slate-300 font-bold rounded text-xs"
                          >
                            ❌ Cancelar
                          </button>
                        </div>
                      </form>
                    )}

                    {/* Users Cards List */}
                    {agUsers.length > 0 && (
                      <div className="space-y-1.5 pt-1">
                        {agUsers.map((u) => {
                          const isSupervisor = u.rol === 'supervisor';
                          const isAgencia = u.rol === 'agencia';

                          return (
                            <div
                              key={u.id}
                              className="flex items-center justify-between p-2.5 rounded-lg bg-[#0D1B22]/90 border border-slate-800 text-xs"
                            >
                              <div className="flex items-center gap-3">
                                <div>
                                  <div className="font-mono font-bold text-white flex items-center gap-1.5">
                                    <span>👤 <code>{u.usuario}</code></span>
                                  </div>
                                  {u.nombre_cajero && (
                                    <div className="text-[10px] text-slate-400">Nombre: {u.nombre_cajero}</div>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center gap-2">
                                <span
                                  className={`text-[10px] px-2.5 py-0.5 rounded font-extrabold uppercase ${
                                    isAgencia
                                      ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                                      : isSupervisor
                                      ? 'bg-blue-950 text-blue-400 border border-blue-800'
                                      : 'bg-amber-950 text-amber-400 border border-amber-800'
                                  }`}
                                >
                                  ROL: {u.rol.toUpperCase()}
                                </span>

                                <button
                                  onClick={() => {
                                    setEditingUser(u);
                                    setEditRol(u.rol);
                                    setEditActivo(u.activo);
                                    setEditClave('');
                                  }}
                                  className="p-1 rounded text-slate-400 hover:text-white"
                                  title="Modificar Rol / Clave"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => handleDeleteTaquillaUser(u)}
                                  className="p-1 rounded text-slate-400 hover:text-rose-400"
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
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0D1B22] border border-slate-800 rounded-2xl p-5 max-w-sm w-full space-y-4 shadow-2xl">
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
              <Key className="w-4 h-4 text-emerald-400" />
              <span>Editar Usuario: <code>{editingUser.usuario}</code></span>
            </h4>

            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Modificar Rol</label>
              <select
                value={editRol}
                onChange={(e) => setEditRol(e.target.value as any)}
                className="w-full bg-[#071217] border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white"
              >
                <option value="cajero">cajero</option>
                <option value="supervisor">supervisor</option>
                <option value="agencia">agencia</option>
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Cambiar Clave</label>
              <input
                type="password"
                placeholder="dejar vacío = sin cambio"
                value={editClave}
                onChange={(e) => setEditClave(e.target.value)}
                className="w-full bg-[#071217] border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white font-mono"
              />
            </div>

            <label className="flex items-center gap-2 text-xs text-slate-300">
              <input
                type="checkbox"
                checked={editActivo}
                onChange={(e) => setEditActivo(e.target.checked)}
                className="rounded border-slate-700 text-emerald-500"
              />
              <span>Usuario Activo</span>
            </label>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                className="flex-1 py-1.5 rounded-lg bg-slate-800 text-slate-300 font-bold text-xs"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleUpdateTaquillaUser}
                disabled={isProcessing}
                className="flex-1 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs"
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. Subheading: Comparativa por Ciclo Completo */}
      <div className="pt-2">
        <h4 className="text-base font-bold text-white tracking-tight">
          Comparativa por Ciclo Completo: {fechaDesde} al {fechaHasta}
        </h4>

        {/* Currency Tabs: BS | USD | COP (Exact Streamlit st.tabs) */}
        <div className="flex items-center gap-1 border-b border-slate-800 mt-3 mb-5">
          {(['BS', 'USD', 'COP'] as const).map((mon) => (
            <button
              key={mon}
              onClick={() => setActiveCurrency(mon)}
              className={`px-5 py-2 text-xs font-bold transition-all relative cursor-pointer ${
                activeCurrency === mon
                  ? 'text-emerald-400 border-b-2 border-emerald-400'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {mon}
            </button>
          ))}
        </div>

        {/* --- DENTRO DE LA PESTAÑA DE MONEDA ACTIVA --- */}
        <div className="space-y-6">
          {/* Comparative Section: Empty or Data Table */}
          {auditRows.length === 0 ? (
            /* Streamlit st.info style blue alert */
            <div className="p-3.5 rounded-lg bg-[#0e2a47] border border-[#1e4976] text-[#70b5f9] text-xs flex items-center gap-2">
              <Info className="w-4 h-4 shrink-0 text-[#38bdf8]" />
              <span>No hay movimientos registrados en {activeCurrency} para este ciclo.</span>
            </div>
          ) : (
            <div className="bg-[#0D1B22] border border-slate-800 rounded-2xl p-4 shadow-xl space-y-5">
              {/* Table of 14 columns */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      <th className="py-2.5 px-3">Agencia</th>
                      <th className="py-2.5 px-3">Sistema</th>
                      <th className="py-2.5 px-3 text-right">Venta Ofi</th>
                      <th className="py-2.5 px-3 text-right">Venta Taq</th>
                      <th className="py-2.5 px-3 text-right">Com Ofi</th>
                      <th className="py-2.5 px-3 text-right">Com Taq</th>
                      <th className="py-2.5 px-3 text-right">Prem Ofi</th>
                      <th className="py-2.5 px-3 text-right">Prem Taq</th>
                      <th className="py-2.5 px-3 text-right">Part Ofi</th>
                      <th className="py-2.5 px-3 text-right">Part Taq</th>
                      <th className="py-2.5 px-3 text-right">Gto Ofi</th>
                      <th className="py-2.5 px-3 text-right">Gto Taq</th>
                      <th className="py-2.5 px-3 text-right">Pag Ofi</th>
                      <th className="py-2.5 px-3 text-right">Pag Taq</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {auditRows.map((r, idx) => (
                      <tr key={`${r.agencia}_${r.sistema}_${idx}`} className="hover:bg-slate-800/30 transition-colors">
                        <td className="py-2 px-3 font-bold font-sans text-white">{r.agencia}</td>
                        <td className="py-2 px-3 font-sans text-slate-300">{r.sistema}</td>
                        <td className="py-2 px-3 text-right text-slate-300">{r.venta_ofi ? formatCurrency(r.venta_ofi, activeCurrency) : '-'}</td>
                        <td className="py-2 px-3 text-right text-sky-400 font-semibold">{r.venta_taq ? formatCurrency(r.venta_taq, activeCurrency) : '-'}</td>
                        <td className="py-2 px-3 text-right text-slate-400">{r.com_ofi ? formatCurrency(r.com_ofi, activeCurrency) : '-'}</td>
                        <td className="py-2 px-3 text-right text-slate-300">{r.com_taq ? formatCurrency(r.com_taq, activeCurrency) : '-'}</td>
                        <td className="py-2 px-3 text-right text-rose-400">{r.prem_ofi ? formatCurrency(r.prem_ofi, activeCurrency) : '-'}</td>
                        <td className="py-2 px-3 text-right text-rose-300 font-semibold">{r.prem_taq ? formatCurrency(r.prem_taq, activeCurrency) : '-'}</td>
                        <td className="py-2 px-3 text-right text-emerald-400">{r.part_ofi ? formatCurrency(r.part_ofi, activeCurrency) : '-'}</td>
                        <td className="py-2 px-3 text-right text-emerald-300 font-semibold">{r.part_taq ? formatCurrency(r.part_taq, activeCurrency) : '-'}</td>
                        <td className="py-2 px-3 text-right text-slate-400">{r.gastos_ofi ? formatCurrency(r.gastos_ofi, activeCurrency) : '-'}</td>
                        <td className="py-2 px-3 text-right text-slate-300">{r.gastos_taq ? formatCurrency(r.gastos_taq, activeCurrency) : '-'}</td>
                        <td className="py-2 px-3 text-right text-slate-400">{r.pagos_ofi ? formatCurrency(r.pagos_ofi, activeCurrency) : '-'}</td>
                        <td className="py-2 px-3 text-right text-slate-300">{r.pagos_taq ? formatCurrency(r.pagos_taq, activeCurrency) : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Totales por Sistema */}
              {systemMetrics.length > 0 && (
                <div className="space-y-3 pt-3 border-t border-slate-800">
                  <p className="text-xs font-bold text-sky-400">
                    Totales por Sistema en {activeCurrency} (Ciclo Completo)
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {systemMetrics.map((sm) => (
                      <div key={sm.sistema} className="bg-[#071217] border border-slate-800 rounded-xl p-3 space-y-2 text-xs">
                        <p className="font-bold text-white">Sistema: {sm.sistema}</p>
                        <div className="grid grid-cols-4 font-semibold text-slate-400 pb-1 border-b border-slate-800 text-[11px]">
                          <div>Metrica</div>
                          <div>Oficial</div>
                          <div>Taquilla</div>
                          <div>Diferencia</div>
                        </div>

                        {/* Ventas */}
                        <div className="grid grid-cols-4 font-mono text-[11px] py-0.5">
                          <div className="font-sans text-slate-300">Ventas</div>
                          <div>{formatCurrency(sm.ventas.ofi, activeCurrency)}</div>
                          <div>{formatCurrency(sm.ventas.taq, activeCurrency)}</div>
                          <div>
                            {Math.abs(sm.ventas.diff) < 0.5 ? (
                              '---'
                            ) : (
                              <span className={sm.ventas.diff > 0 ? 'text-rose-500 font-bold' : 'text-emerald-500 font-bold'}>
                                {sm.ventas.diff > 0 ? '▲' : '▼'} {formatCurrency(Math.abs(sm.ventas.diff), activeCurrency)}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Comis. */}
                        <div className="grid grid-cols-4 font-mono text-[11px] py-0.5">
                          <div className="font-sans text-slate-300">Comis.</div>
                          <div>{formatCurrency(sm.comisiones.ofi, activeCurrency)}</div>
                          <div>{formatCurrency(sm.comisiones.taq, activeCurrency)}</div>
                          <div>
                            {Math.abs(sm.comisiones.diff) < 0.5 ? (
                              '---'
                            ) : (
                              <span className={sm.comisiones.diff > 0 ? 'text-rose-500 font-bold' : 'text-emerald-500 font-bold'}>
                                {sm.comisiones.diff > 0 ? '▲' : '▼'} {formatCurrency(Math.abs(sm.comisiones.diff), activeCurrency)}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Premios */}
                        <div className="grid grid-cols-4 font-mono text-[11px] py-0.5">
                          <div className="font-sans text-slate-300">Premios</div>
                          <div>{formatCurrency(sm.premios.ofi, activeCurrency)}</div>
                          <div>{formatCurrency(sm.premios.taq, activeCurrency)}</div>
                          <div>
                            {Math.abs(sm.premios.diff) < 0.5 ? (
                              '---'
                            ) : (
                              <span className={sm.premios.diff > 0 ? 'text-rose-500 font-bold' : 'text-emerald-500 font-bold'}>
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
              <div className="space-y-2 pt-2 border-t border-slate-800">
                <p className="text-xs font-bold text-sky-400">
                  Gastos y Pagos Acumulados en {activeCurrency} (Ciclo)
                </p>

                <div className="bg-[#071217] border border-slate-800 rounded-xl p-3 space-y-2 text-xs max-w-xl">
                  <div className="grid grid-cols-4 font-semibold text-slate-400 pb-1 border-b border-slate-800 text-[11px]">
                    <div>Concepto</div>
                    <div>Oficial</div>
                    <div>Taquilla</div>
                    <div>Diferencia</div>
                  </div>

                  {/* Gastos */}
                  <div className="grid grid-cols-4 font-mono text-[11px] py-0.5">
                    <div className="font-sans text-slate-300">Gastos</div>
                    <div>{formatCurrency(accumulatedExpensesAndPayments.gastos.ofi, activeCurrency)}</div>
                    <div>{formatCurrency(accumulatedExpensesAndPayments.gastos.taq, activeCurrency)}</div>
                    <div>
                      {Math.abs(accumulatedExpensesAndPayments.gastos.diff) < 0.5 ? (
                        '---'
                      ) : (
                        <span className={accumulatedExpensesAndPayments.gastos.diff > 0 ? 'text-rose-500 font-bold' : 'text-emerald-500 font-bold'}>
                          {accumulatedExpensesAndPayments.gastos.diff > 0 ? '▲' : '▼'} {formatCurrency(Math.abs(accumulatedExpensesAndPayments.gastos.diff), activeCurrency)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Pagos */}
                  <div className="grid grid-cols-4 font-mono text-[11px] py-0.5">
                    <div className="font-sans text-slate-300">Pagos</div>
                    <div>{formatCurrency(accumulatedExpensesAndPayments.pagos.ofi, activeCurrency)}</div>
                    <div>{formatCurrency(accumulatedExpensesAndPayments.pagos.taq, activeCurrency)}</div>
                    <div>
                      {Math.abs(accumulatedExpensesAndPayments.pagos.diff) < 0.5 ? (
                        '---'
                      ) : (
                        <span className={accumulatedExpensesAndPayments.pagos.diff > 0 ? 'text-rose-500 font-bold' : 'text-emerald-500 font-bold'}>
                          {accumulatedExpensesAndPayments.pagos.diff > 0 ? '▲' : '▼'} {formatCurrency(Math.abs(accumulatedExpensesAndPayments.pagos.diff), activeCurrency)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 4. Reporte Detallado del Periodo */}
          <div className="pt-2 space-y-3">
            <h4 className="text-base font-bold text-white tracking-tight">
              Reporte Detallado del Periodo
            </h4>
            <p className="text-xs text-slate-300">
              <strong>Terminal(es):</strong> {terminalesLabel} | <strong>Ciclo:</strong> {fechaDesde} al {fechaHasta} | <strong>Moneda:</strong> {activeCurrency}
            </p>

            {/* 6 Metric Boxes: Total Ventas, Total Comision, Total Premios, Total Gastos, Total Pagos, Saldo Final */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 pt-1">
              {[
                { label: 'Total Ventas', val: detailedPeriodTotals.tVTotal },
                { label: 'Total Comision', val: detailedPeriodTotals.tCTotal },
                { label: 'Total Premios', val: detailedPeriodTotals.tPTotal },
                { label: 'Total Gastos', val: detailedPeriodTotals.tGTotal },
                { label: 'Total Pagos', val: detailedPeriodTotals.tPgTotal },
                { label: 'Saldo Final', val: detailedPeriodTotals.saldoFinal },
              ].map((m, idx) => (
                <div
                  key={idx}
                  className="bg-[#1e293b]/85 border border-white/15 rounded-md p-2 text-center shadow-sm"
                  style={{ borderLeft: '3px solid #ff4b4b' }}
                >
                  <p className="m-0 text-[9px] text-slate-400 font-bold uppercase tracking-wider">
                    {m.label}
                  </p>
                  <p className="m-0 mt-1 text-xs font-black text-white font-mono">
                    ${m.val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                </div>
              ))}
            </div>

            {/* 3 Subtabs: Ventas | Gastos | Pagos */}
            <div className="pt-3">
              <div className="flex items-center gap-1 border-b border-slate-800 mb-3">
                {(['Ventas', 'Gastos', 'Pagos'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveSubTab(tab)}
                    className={`px-4 py-1.5 text-xs font-bold transition-colors cursor-pointer ${
                      activeSubTab === tab
                        ? 'text-emerald-400 border-b-2 border-emerald-400'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              {/* Subtab Ventas */}
              {activeSubTab === 'Ventas' && (
                <div>
                  {filteredSalesTaq.length === 0 ? (
                    <div className="p-3.5 rounded-lg bg-[#0e2a47] border border-[#1e4976] text-[#70b5f9] text-xs flex items-center gap-2">
                      <Info className="w-4 h-4 shrink-0 text-[#38bdf8]" />
                      <span>No hay ventas registradas en el periodo.</span>
                    </div>
                  ) : (
                    <div className="overflow-x-auto bg-[#0D1B22] border border-slate-800 rounded-xl p-3">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-slate-800 text-[10px] font-bold text-slate-400 uppercase">
                            <th className="py-2 px-2.5">ID</th>
                            <th className="py-2 px-2.5">Agencia</th>
                            <th className="py-2 px-2.5">Sistema</th>
                            <th className="py-2 px-2.5">Moneda</th>
                            <th className="py-2 px-2.5 text-right">Venta</th>
                            <th className="py-2 px-2.5 text-right">Comisión</th>
                            <th className="py-2 px-2.5 text-right">Premios</th>
                            <th className="py-2 px-2.5 text-right">Neto</th>
                            <th className="py-2 px-2.5 text-right">Fecha</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 font-mono">
                          {filteredSalesTaq.map((s: any) => (
                            <tr key={s.id} className="hover:bg-slate-800/30">
                              <td className="py-2 px-2.5 text-slate-400 font-sans">{s.id}</td>
                              <td className="py-2 px-2.5 text-white font-sans font-bold">{s.nombre_agency || s.agencia}</td>
                              <td className="py-2 px-2.5 text-slate-300 font-sans">{s.sistema}</td>
                              <td className="py-2 px-2.5 text-slate-400 font-sans">{s.moneda}</td>
                              <td className="py-2 px-2.5 text-right text-sky-400 font-bold">{formatCurrency(s.monto_venta, activeCurrency)}</td>
                              <td className="py-2 px-2.5 text-right text-slate-300">{formatCurrency(s.comision, activeCurrency)}</td>
                              <td className="py-2 px-2.5 text-right text-rose-400">{formatCurrency(s.monto_premios, activeCurrency)}</td>
                              <td className="py-2 px-2.5 text-right text-emerald-400 font-semibold">{formatCurrency(s.neto, activeCurrency)}</td>
                              <td className="py-2 px-2.5 text-right text-slate-400 font-sans">{s.fecha}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Subtab Gastos */}
              {activeSubTab === 'Gastos' && (
                <div>
                  {filteredExpensesTaq.length === 0 ? (
                    <div className="p-3.5 rounded-lg bg-[#0e2a47] border border-[#1e4976] text-[#70b5f9] text-xs flex items-center gap-2">
                      <Info className="w-4 h-4 shrink-0 text-[#38bdf8]" />
                      <span>No hay gastos registrados en el periodo.</span>
                    </div>
                  ) : (
                    <div className="overflow-x-auto bg-[#0D1B22] border border-slate-800 rounded-xl p-3">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-slate-800 text-[10px] font-bold text-slate-400 uppercase">
                            <th className="py-2 px-2.5">ID</th>
                            <th className="py-2 px-2.5">Agencia</th>
                            <th className="py-2 px-2.5">Concepto</th>
                            <th className="py-2 px-2.5">Moneda</th>
                            <th className="py-2 px-2.5 text-right">Monto</th>
                            <th className="py-2 px-2.5 text-center">Conf.</th>
                            <th className="py-2 px-2.5 text-right">Fecha</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 font-mono">
                          {filteredExpensesTaq.map((g: any) => (
                            <tr key={g.id} className="hover:bg-slate-800/30">
                              <td className="py-2 px-2.5 text-slate-400 font-sans">{g.id}</td>
                              <td className="py-2 px-2.5 text-white font-sans font-bold">{g.agencia}</td>
                              <td className="py-2 px-2.5 text-slate-300 font-sans">{g.concepto}</td>
                              <td className="py-2 px-2.5 text-slate-400 font-sans">{g.moneda}</td>
                              <td className="py-2 px-2.5 text-right text-amber-400 font-bold">{formatCurrency(g.monto, activeCurrency)}</td>
                              <td className="py-2 px-2.5 text-center font-sans">
                                {g.confirmado ? (
                                  <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 text-[10px] font-bold">✅ C</span>
                                ) : (
                                  <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 text-[10px] font-bold">⏳ Pendiente</span>
                                )}
                              </td>
                              <td className="py-2 px-2.5 text-right text-slate-400 font-sans">{g.fecha}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Subtab Pagos */}
              {activeSubTab === 'Pagos' && (
                <div>
                  {filteredPaymentsTaq.length === 0 ? (
                    <div className="p-3.5 rounded-lg bg-[#0e2a47] border border-[#1e4976] text-[#70b5f9] text-xs flex items-center gap-2">
                      <Info className="w-4 h-4 shrink-0 text-[#38bdf8]" />
                      <span>No hay pagos registrados en el periodo.</span>
                    </div>
                  ) : (
                    <div className="overflow-x-auto bg-[#0D1B22] border border-slate-800 rounded-xl p-3">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-slate-800 text-[10px] font-bold text-slate-400 uppercase">
                            <th className="py-2 px-2.5">ID</th>
                            <th className="py-2 px-2.5">Agencia</th>
                            <th className="py-2 px-2.5">Tipo Pago</th>
                            <th className="py-2 px-2.5">Moneda</th>
                            <th className="py-2 px-2.5 text-right">Monto</th>
                            <th className="py-2 px-2.5 text-center">Conf.</th>
                            <th className="py-2 px-2.5 text-right">Fecha</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 font-mono">
                          {filteredPaymentsTaq.map((p: any) => (
                            <tr key={p.id} className="hover:bg-slate-800/30">
                              <td className="py-2 px-2.5 text-slate-400 font-sans">{p.id}</td>
                              <td className="py-2 px-2.5 text-white font-sans font-bold">{p.agencia}</td>
                              <td className="py-2 px-2.5 text-slate-300 font-sans">{p.tipo_pago}</td>
                              <td className="py-2 px-2.5 text-slate-400 font-sans">{p.moneda}</td>
                              <td className="py-2 px-2.5 text-right text-teal-400 font-bold">{formatCurrency(p.monto, activeCurrency)}</td>
                              <td className="py-2 px-2.5 text-center font-sans">
                                {p.confirmado || p.confirmado_supervisor ? (
                                  <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 text-[10px] font-bold">✅ C</span>
                                ) : (
                                  <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 text-[10px] font-bold">⏳ Pendiente</span>
                                )}
                              </td>
                              <td className="py-2 px-2.5 text-right text-slate-400 font-sans">{p.fecha}</td>
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
