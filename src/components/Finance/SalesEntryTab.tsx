import React, { useState, useEffect, useMemo, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { formatCurrency, formatDate, cleanAgencyName, normalizarMoneda } from '../../utils/formatters';
import type { DailySaleItem, Agency, BetSystem, Currency } from '../../types';
import { loadCurrencies } from '../../utils/currencies';
import { loadSaaSActiveSystems } from '../../utils/sistemas';
import { UI_LOCK } from '../../styles/uiDesignLock';
import {
  TrendingUp,
  FileSpreadsheet,
  Plus,
  Trash2,
  RefreshCw,
  Calendar,
  Building2,
  DollarSign,
  CheckCircle2,
  AlertTriangle,
  Upload,
  Coins,
  Edit2,
  AlertCircle,
  Sparkles,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { extractTextFromPdf } from '../../utils/pdfReader';
import { detectAndParseThermalTicket } from '../../utils/thermalTicketParser';
import {
  loadSystemKeywords,
  saveSystemKeywords,
  DEFAULT_SYSTEM_KEYWORDS,
  type SystemKeywordsMap
} from '../../utils/systemKeywords';
import {
  detectSystemFromDna,
  detectFileIntrinsicCurrency,
  matchAgencyStrict,
  isSaleDuplicate,
  CANONICAL_SYSTEM_RULES,
} from '../../lib/salesEngineLock';
import { SEMANA_41_SALES_RECORDS } from '../../utils/semana41SalesData';

// Safe helper to parse numbers from numeric or formatted strings
function parseNum(val: any): number {
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  if (!val) return 0;
  let str = String(val).trim().replace(/\s/g, '');
  if (!str) return 0;

  // Clean currency symbols or characters except digits, dots, commas, minus
  str = str.replace(/[^0-9.,-]/g, '');
  if (!str) return 0;

  // Case 1: Both dot and comma present (e.g. 86.610,00 or 86,610.00)
  if (str.includes(',') && str.includes('.')) {
    if (str.indexOf('.') < str.indexOf(',')) {
      // European / Spanish: 86.610,00 or 1.234.567,89
      return parseFloat(str.replace(/\./g, '').replace(',', '.')) || 0;
    } else {
      // US: 86,610.00
      return parseFloat(str.replace(/,/g, '')) || 0;
    }
  }

  // Case 2: Only commas present
  if (str.includes(',')) {
    const parts = str.split(',');
    // If multiple commas, e.g. "1,234,567" -> commas are thousands
    if (parts.length > 2) {
      return parseFloat(str.replace(/,/g, '')) || 0;
    }
    // Single comma: in Spanish/European format "0,00" or "44610,00" or "86,61"
    return parseFloat(str.replace(',', '.')) || 0;
  }

  // Case 3: Only dots present
  if (str.includes('.')) {
    const parts = str.split('.');
    // If multiple dots, e.g. "1.234.567" -> dots are thousands
    if (parts.length > 2) {
      return parseFloat(str.replace(/\./g, '')) || 0;
    }
    // Single dot: e.g. "86.610" or "42.000"
    // In Spanish / Latin American lottery & betting reports, integers with thousands separators have 3 digits after dot
    if (parts[1] && parts[1].length === 3) {
      return parseFloat(str.replace(/\./g, '')) || 0;
    }
    // Otherwise standard decimal e.g. "86.5" or "86.50"
    return parseFloat(str) || 0;
  }

  const n = parseFloat(str);
  return isNaN(n) ? 0 : n;
}

// Safe helper to parse lists of strings from arrays or comma strings
function parseList(val: any): string[] {
  if (!val) return [];
  if (Array.isArray(val)) return val.map((v) => String(v ?? '').trim().toUpperCase()).filter(Boolean);
  if (typeof val === 'string') return val.split(',').map((v) => String(v ?? '').trim().toUpperCase()).filter(Boolean);
  return [];
}

/**
 * Detecta y extrae la moneda y el nombre base de la agencia a partir del texto de la celda.
 * Ejemplos:
 *  - "15LETRAS1 Bs"   -> { baseName: "15LETRAS1", detectedCurrency: "BS" }
 *  - "15LETRAS1 Usd"  -> { baseName: "15LETRAS1", detectedCurrency: "USD" }
 *  - "AGALEJO_BS"     -> { baseName: "AGALEJO", detectedCurrency: "BS" }
 *  - "ZULAYBC (USD)"  -> { baseName: "ZULAYBC", detectedCurrency: "USD" }
 *  - "WAIKABC"        -> { baseName: "WAIKABC", detectedCurrency: "" }
 */
function extractRowCurrencyAndAgencyName(rawCell: string): {
  baseName: string;
  detectedCurrency: string;
} {
  if (!rawCell) return { baseName: '', detectedCurrency: '' };
  const str = String(rawCell).trim();

  // Patrón 1: Sufijo con separador (espacio, guión, barra, guión bajo): "15LETRAS1 Bs", "AGALEJO Usd", "4ESQUINAS1-COP"
  const suffixMatch = str.match(/^(.*?)[-_/\s]+(BS|USD|COP|VES|EUR|USDT)$/i);
  if (suffixMatch && suffixMatch[1].trim()) {
    return {
      baseName: suffixMatch[1].trim(),
      detectedCurrency: normalizarMoneda(suffixMatch[2]),
    };
  }

  // Patrón 2: Paréntesis: "AGENCIA (USD)", "AGENCIA (Bs)"
  const parenMatch = str.match(/^(.*?)\s*\((BS|USD|COP|VES|EUR|USDT)\)$/i);
  if (parenMatch && parenMatch[1].trim()) {
    return {
      baseName: parenMatch[1].trim(),
      detectedCurrency: normalizarMoneda(parenMatch[2]),
    };
  }

  // Patrón 3: Prefijo: "USD AGENCIA", "BS - AGENCIA"
  const prefixMatch = str.match(/^(BS|USD|COP|VES|EUR|USDT)[-_/\s]+(.*)$/i);
  if (prefixMatch && prefixMatch[2].trim()) {
    return {
      baseName: prefixMatch[2].trim(),
      detectedCurrency: normalizarMoneda(prefixMatch[1]),
    };
  }

  return { baseName: str, detectedCurrency: '' };
}

export const SalesEntryTab: React.FC = () => {
  const { effectiveUserId, systemCycle, refreshSystemCycle } = useAuth();

  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [sales, setSales] = useState<DailySaleItem[]>([]);
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [systems, setSystems] = useState<BetSystem[]>([]);
  const [currencies, setCurrencies] = useState<Currency[]>([]);

  // Filters
  const [filterAgency, setFilterAgency] = useState('Todas');
  const [activeCurrencyTab, setActiveCurrencyTab] = useState('TODAS');

  // Manual Form State
  const [formAgencia, setFormAgencia] = useState('');
  const [formFecha, setFormFecha] = useState(systemCycle?.hasta || new Date().toISOString().split('T')[0]);
  const [entries, setEntries] = useState<
    Record<string, { venta: string; comision: string; premios: string; comisionTouched: boolean; id?: number }>
  >({});

  // Bulk CSV/Excel Import Modal State
  const [isBulkOpen, setIsBulkOpen] = useState(false);
  const [bulkFileDate, setBulkFileDate] = useState(systemCycle?.hasta || new Date().toISOString().split('T')[0]);
  const [bulkSystem, setBulkSystem] = useState('AUTO');
  const [bulkCurrency, setBulkCurrency] = useState('AUTO');
  const [bulkDetectedCurrencies, setBulkDetectedCurrencies] = useState<string[]>([]);
  const [bulkRows, setBulkRows] = useState<any[]>([]);
  const [editingComIndex, setEditingComIndex] = useState<number | null>(null);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkUnmatched, setBulkUnmatched] = useState<string[]>([]);
  const [systemKeywords, setSystemKeywords] = useState<SystemKeywordsMap>(DEFAULT_SYSTEM_KEYWORDS);

  // Available systems list merging standard defaults, database systems, and configured keywords
  const availableSystemsList = useMemo(() => {
    const list = ['BETM3', 'GATOWEB', 'KENO'];
    systems.forEach((s) => {
      const name = (s.nombre_sistema || '').trim();
      if (name && !list.includes(name)) {
        list.push(name);
      }
    });
    Object.keys(systemKeywords).forEach((name) => {
      if (name && !list.includes(name)) {
        list.push(name);
      }
    });
    return list;
  }, [systems, systemKeywords]);

  // Available currencies list from active subscriber currencies
  const availableCurrenciesList = useMemo(() => {
    return currencies.map((c) => {
      const code = (c.nombre_moneda || (c as any).codigo || '').trim().toUpperCase();
      return {
        code,
        label: c.simbolo ? `🪙 ${code} (${c.simbolo})` : `🪙 ${code}`,
      };
    });
  }, [currencies]);

  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadData = useCallback(async () => {
    if (!effectiveUserId) return;
    setIsLoading(true);
    setMessage(null);

    try {
      const [salesRes, agRes, sisList, dynamicCurrs, loadedKw] = await Promise.all([
        supabase.from('carga_actual').select('*').eq('user_id', effectiveUserId).order('id', { ascending: false }),
        supabase.from('agencias').select('*').eq('user_id', effectiveUserId).order('id', { ascending: true }),
        loadSaaSActiveSystems(effectiveUserId),
        loadCurrencies(effectiveUserId),
        loadSystemKeywords(effectiveUserId),
      ]);

      const loadedSales = salesRes.data || [];
      // Auto-reparar registros de CDAPUESTAS guardados erróneamente en COP a USD
      const wrongCdapuestas = loadedSales.filter(
        (s: any) => String(s.sistema || '').toUpperCase() === 'CDAPUESTAS' && normalizarMoneda(s.moneda) === 'COP'
      );
      if (wrongCdapuestas.length > 0 && effectiveUserId) {
        for (const item of wrongCdapuestas) {
          try {
            await supabase.from('carga_actual').update({ moneda: 'USD' }).eq('id', item.id).eq('user_id', effectiveUserId);
            item.moneda = 'USD';
          } catch (_) {}
        }
      }
      const loadedAgencies = agRes.data || [];
      const loadedSystems = sisList || [];
      const loadedCurrencies: Currency[] = (dynamicCurrs || []).map((c) => ({
        id: c.id || 0,
        nombre_moneda: c.codigo,
        simbolo: c.simbolo,
      }));

      setSales(loadedSales);
      setAgencies(loadedAgencies);
      setSystems(loadedSystems);
      setCurrencies(loadedCurrencies);
      setSystemKeywords(loadedKw);

      if (loadedAgencies.length > 0) {
        setFormAgencia((prev) => {
          if (prev && loadedAgencies.some((a) => String(a?.nombre_agencia || '').trim() === String(prev || '').trim())) {
            return prev;
          }
          return loadedAgencies[0].nombre_agencia;
        });
      }
    } catch (err: any) {
      console.error('Error loading sales data:', err);
      setMessage({ type: 'error', text: err?.message || 'Error al cargar ventas.' });
    } finally {
      setIsLoading(false);
    }
  }, [effectiveUserId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Selected agency object
  const currentAgency = useMemo(() => {
    return agencies.find((a) => String(a?.nombre_agencia || '').trim() === String(formAgencia || '').trim());
  }, [agencies, formAgencia]);

  // Assigned systems for current agency
  const agencySystemsList = useMemo(() => {
    if (!currentAgency) {
      return systems.map((s) => s.nombre_sistema).filter(Boolean);
    }
    const assigned = parseList(currentAgency.sistemas);
    if (assigned.length === 0 || assigned.includes('TODOS')) {
      const list = systems.map((s) => s.nombre_sistema).filter(Boolean);
      return list.length > 0 ? list : ['BETM3', 'GATOWEB'];
    }
    return assigned;
  }, [currentAgency, systems]);

  // Assigned currencies for current agency
  const agencyCurrenciesList = useMemo(() => {
    if (!currentAgency) return ['BS'];
    const assigned = parseList(currentAgency.monedas);
    if (assigned.length === 0 || assigned.includes('TODAS')) {
      const list = currencies.map((c) => c.nombre_moneda).filter(Boolean);
      return list.length > 0 ? list : ['BS'];
    }
    return assigned;
  }, [currentAgency, currencies]);

  // Helper to extract active currencies for a given system in current agency
  const getSystemCurrencies = useCallback((sysName: string): string[] => {
    if (!currentAgency) return agencyCurrenciesList;

    if (currentAgency.condiciones_sistemas) {
      try {
        const cond = typeof currentAgency.condiciones_sistemas === 'string'
          ? JSON.parse(currentAgency.condiciones_sistemas)
          : currentAgency.condiciones_sistemas;

        if (cond && typeof cond === 'object') {
          const sysUpper = String(sysName).trim().toUpperCase();
          const matchedCurrencies = new Set<string>();

          for (const [key, val] of Object.entries(cond) as [string, any][]) {
            const keyUpper = key.toUpperCase();
            if (keyUpper.startsWith(`${sysUpper}_`)) {
              const mon = keyUpper.slice(sysUpper.length + 1).trim();
              if (mon) matchedCurrencies.add(mon);
            }
            if (val && typeof val === 'object' && val.sistema && String(val.sistema).toUpperCase() === sysUpper && val.moneda) {
              matchedCurrencies.add(String(val.moneda).toUpperCase().trim());
            }
          }

          if (matchedCurrencies.size > 0) {
            return Array.from(matchedCurrencies);
          }
        }
      } catch (e) {
        console.error('Error parsing condiciones_sistemas for currencies', e);
      }
    }

    return agencyCurrenciesList;
  }, [currentAgency, agencyCurrenciesList]);

  // Helper to extract system commission & participation config for current agency (with currency override support)
  const getSystemConfig = useCallback((sysName: string, monName?: string) => {
    let comPct = Number(currentAgency?.comision ?? 10);
    let partPct = Number(currentAgency?.participacion_ag ?? 50);
    let targetMoneda = '';

    if (currentAgency?.condiciones_sistemas) {
      try {
        const cond = typeof currentAgency.condiciones_sistemas === 'string'
          ? JSON.parse(currentAgency.condiciones_sistemas)
          : currentAgency.condiciones_sistemas;
        if (cond && sysName) {
          const comboKey = monName ? `${sysName}_${monName}` : undefined;
          const entry = (comboKey && cond[comboKey]) ? cond[comboKey] : cond[sysName];
          if (entry) {
            if (entry.comision !== undefined && entry.comision !== null && entry.comision !== '') {
              comPct = Number(entry.comision);
            }
            if (entry.participacion !== undefined && entry.participacion !== null && entry.participacion !== '') {
              partPct = Number(entry.participacion);
            }
            if (entry.moneda) targetMoneda = String(entry.moneda).toUpperCase();
          }
        }
      } catch (e) {
        console.error('Error parsing condiciones_sistemas', e);
      }
    }
    return { comPct, partPct, targetMoneda };
  }, [currentAgency]);

  // Synchronize entries state with existing records whenever agency, date or sales change
  useEffect(() => {
    if (!formAgencia || !formFecha) return;
    const agNorm = String(formAgencia).trim().toUpperCase();
    const dateNorm = String(formFecha).split('T')[0];

    const newEntries: Record<string, { venta: string; comision: string; premios: string; comisionTouched: boolean; id?: number }> = {};

    agencySystemsList.forEach((sist) => {
      const activeCurrs = getSystemCurrencies(sist);
      activeCurrs.forEach((mon) => {
        const key = `${sist}_${mon}`;
        const match = sales.find((s) => {
          const sAg = String(s.agencia || '').trim().toUpperCase();
          const sSis = String(s.sistema || '').trim().toUpperCase();
          const sMon = String(s.moneda || '').trim().toUpperCase();
          const sDate = String(s.fecha || '').split('T')[0];
          return sAg === agNorm && sSis === String(sist).trim().toUpperCase() && sMon === String(mon).trim().toUpperCase() && sDate === dateNorm;
        });

        if (match) {
          newEntries[key] = {
            venta: match.venta !== undefined && match.venta !== null ? String(match.venta) : '',
            comision: match.comision !== undefined && match.comision !== null ? String(match.comision) : '',
            premios: match.premios !== undefined && match.premios !== null ? String(match.premios) : '',
            comisionTouched: true,
            id: match.id,
          };
        } else {
          newEntries[key] = {
            venta: '',
            comision: '',
            premios: '',
            comisionTouched: false,
          };
        }
      });
    });

    setEntries(newEntries);
  }, [formAgencia, formFecha, sales, agencySystemsList, agencyCurrenciesList, getSystemCurrencies]);

  // Handlers for manual entry inputs
  const handleVentaChange = (sist: string, mon: string, val: string) => {
    const key = `${sist}_${mon}`;
    const vNum = parseNum(val);
    const { comPct } = getSystemConfig(sist, mon);
    const current = entries[key] || { venta: '', comision: '', premios: '', comisionTouched: false };

    const newCom = current.comisionTouched
      ? current.comision
      : (val ? String(Math.round((vNum * (comPct / 100)) * 100) / 100) : '');

    setEntries((prev) => ({
      ...prev,
      [key]: {
        ...current,
        venta: val,
        comision: newCom,
      },
    }));
  };

  const handleComisionChange = (sist: string, mon: string, val: string) => {
    const key = `${sist}_${mon}`;
    const current = entries[key] || { venta: '', comision: '', premios: '', comisionTouched: false };
    setEntries((prev) => ({
      ...prev,
      [key]: {
        ...current,
        comision: val,
        comisionTouched: true,
      },
    }));
  };

  const handlePremiosChange = (sist: string, mon: string, val: string) => {
    const key = `${sist}_${mon}`;
    const current = entries[key] || { venta: '', comision: '', premios: '', comisionTouched: false };
    setEntries((prev) => ({
      ...prev,
      [key]: {
        ...current,
        premios: val,
      },
    }));
  };

  // Submit single system movement
  const handleSaveSystemRow = async (sist: string, mon: string) => {
    if (!effectiveUserId || !formAgencia) return;
    const key = `${sist}_${mon}`;
    const row = entries[key] || { venta: '', comision: '', premios: '', comisionTouched: false };

    const v = parseNum(row.venta);
    const c = parseNum(row.comision);
    const p = parseNum(row.premios);

    if (v === 0 && p === 0 && c === 0) {
      setMessage({ type: 'error', text: `Ingrese valores para el sistema ${sist} (${mon}).` });
      return;
    }

    const neto = Math.round((v - c - p) * 100) / 100;
    const { partPct } = getSystemConfig(sist, mon);
    const utilAg = Math.round((neto * (partPct / 100)) * 100) / 100;
    const utilOp = Math.round((neto - utilAg) * 100) / 100;

    const payload = {
      user_id: effectiveUserId,
      agencia: formAgencia,
      sistema: sist,
      moneda: mon,
      venta: v,
      comision: c,
      premios: p,
      neto: neto,
      util_op: utilOp,
      util_ag: utilAg,
      fecha: formFecha || systemCycle?.hasta || new Date().toISOString().split('T')[0],
    };

    setIsProcessing(true);
    try {
      if (row.id) {
        const { error } = await supabase.from('carga_actual').update(payload).eq('id', row.id).eq('user_id', effectiveUserId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('carga_actual').insert(payload);
        if (error) throw error;
      }

      confetti({ particleCount: 35, spread: 55 });
      setMessage({ type: 'success', text: `¡Movimiento de ${sist} (${mon}) para ${formAgencia} guardado exitosamente!` });
      await loadData();
    } catch (err: any) {
      console.error('Error saving system row:', err);
      setMessage({ type: 'error', text: err?.message || 'Error al guardar movimiento.' });
    } finally {
      setIsProcessing(false);
    }
  };

  // Save all entered systems at once
  const handleSaveAllSystems = async () => {
    if (!effectiveUserId || !formAgencia) return;
    const payloads: any[] = [];
    const updatePayloads: { id: number; data: any }[] = [];

    agencySystemsList.forEach((sist) => {
      const activeCurrs = getSystemCurrencies(sist);
      activeCurrs.forEach((mon) => {
        const key = `${sist}_${mon}`;
        const row = entries[key];
        if (!row) return;

        const v = parseNum(row.venta);
        const c = parseNum(row.comision);
        const p = parseNum(row.premios);

        if (v > 0 || p > 0 || c > 0 || row.venta !== '' || row.premios !== '') {
          const neto = Math.round((v - c - p) * 100) / 100;
          const { partPct } = getSystemConfig(sist, mon);
          const utilAg = Math.round((neto * (partPct / 100)) * 100) / 100;
          const utilOp = Math.round((neto - utilAg) * 100) / 100;

          const data = {
            user_id: effectiveUserId,
            agencia: formAgencia,
            sistema: sist,
            moneda: mon,
            venta: v,
            comision: c,
            premios: p,
            neto: neto,
            util_op: utilOp,
            util_ag: utilAg,
            fecha: formFecha || systemCycle?.hasta || new Date().toISOString().split('T')[0],
          };

          if (row.id) {
            updatePayloads.push({ id: row.id, data });
          } else {
            payloads.push(data);
          }
        }
      });
    });

    if (payloads.length === 0 && updatePayloads.length === 0) {
      setMessage({ type: 'error', text: 'No hay datos de sistemas para guardar.' });
      return;
    }

    setIsProcessing(true);
    try {
      if (payloads.length > 0) {
        const { error } = await supabase.from('carga_actual').insert(payloads);
        if (error) throw error;
      }
      for (const item of updatePayloads) {
        const { error } = await supabase.from('carga_actual').update(item.data).eq('id', item.id).eq('user_id', effectiveUserId);
        if (error) throw error;
      }

      confetti({ particleCount: 60, spread: 70 });
      setMessage({ type: 'success', text: `¡Se guardaron los movimientos de ${formAgencia} correctamente!` });
      await loadData();
    } catch (err: any) {
      console.error('Error saving all systems:', err);
      setMessage({ type: 'error', text: err?.message || 'Error al guardar sistemas.' });
    } finally {
      setIsProcessing(false);
    }
  };

  // Clear Screen Handler
  const handleClearScreen = () => {
    const cleared: Record<string, { venta: string; comision: string; premios: string; comisionTouched: boolean; id?: number }> = {};
    agencySystemsList.forEach((sist) => {
      const activeCurrs = getSystemCurrencies(sist);
      activeCurrs.forEach((mon) => {
        cleared[`${sist}_${mon}`] = {
          venta: '',
          comision: '',
          premios: '',
          comisionTouched: false,
        };
      });
    });
    setEntries(cleared);
    setMessage({ type: 'success', text: 'Pantalla de registro limpiada.' });
  };

  // Filtered sales list
  const filteredSales = useMemo(() => {
    return sales.filter((s) => {
      if (filterAgency !== 'Todas' && s.agencia !== filterAgency) return false;
      return true;
    });
  }, [sales, filterAgency]);

  // Grouped executive metrics (Horizontal Linear View)
  const groupedMetrics = useMemo(() => {
    const map: Record<string, { venta: number; comision: number; premios: number; neto: number; util_op: number; util_ag: number }> = {};

    filteredSales.forEach((s) => {
      const sys = s.sistema || 'Global';
      const mon = String(s.moneda || 'USD').toUpperCase();
      const key = `${sys} - ${mon}`;

      if (!map[key]) {
        map[key] = { venta: 0, comision: 0, premios: 0, neto: 0, util_op: 0, util_ag: 0 };
      }
      map[key].venta += parseNum(s.venta);
      map[key].comision += parseNum(s.comision);
      map[key].premios += parseNum(s.premios);
      map[key].neto += parseNum(s.neto);
      map[key].util_op += parseNum(s.util_op);
      map[key].util_ag += parseNum(s.util_ag);
    });

    return Object.entries(map).map(([key, vals]) => ({
      key,
      ...vals,
    }));
  }, [filteredSales]);

  // Group sales by currency for separated tables
  const salesByCurrency = useMemo(() => {
    const groups: Record<string, DailySaleItem[]> = {};
    filteredSales.forEach((s) => {
      const curr = String(s.moneda || 'USD').trim().toUpperCase();
      if (!groups[curr]) {
        groups[curr] = [];
      }
      groups[curr].push(s);
    });
    return groups;
  }, [filteredSales]);

  const currencyList = useMemo(() => {
    return Object.keys(salesByCurrency);
  }, [salesByCurrency]);

  const getCurrencyFlag = (curr: any) => {
    const c = String(curr || 'USD').trim().toUpperCase();
    if (c.includes('BS') || c.includes('VES')) return '🇻🇪';
    if (c.includes('COP')) return '🇨🇴';
    if (c.includes('USD')) return '🇺🇸';
    if (c.includes('EUR')) return '🇪🇺';
    if (c.includes('USDT') || c.includes('CRYPTO')) return '💎';
    return '💵';
  };



  // Delete single sale record
  const handleDeleteSale = async (id: number) => {
    if (!window.confirm('¿Eliminar este registro de venta?')) return;
    setIsProcessing(true);

    try {
      const { error } = await supabase.from('carga_actual').delete().eq('id', id).eq('user_id', effectiveUserId);
      if (error) throw error;

      setMessage({ type: 'success', text: 'Registro de venta eliminado.' });
      await loadData();
    } catch (err: any) {
      console.error('Error deleting sale:', err);
      setMessage({ type: 'error', text: err?.message || 'Error al eliminar.' });
    } finally {
      setIsProcessing(false);
    }
  };

  // Delete all sales from carga_actual for effectiveUserId
  const handleClearAllActiveSales = async () => {
    if (!effectiveUserId) return;
    if (
      !window.confirm(
        `⚠️ ¿Está seguro de VACIAR TODA LA CARGA ACTUAL (${sales.length} registros)?\n\nEsta acción eliminará todas las ventas cargadas en este ciclo para permitir corregir el cierre o subir una nueva carga limpia.`
      )
    ) {
      return;
    }

    setIsProcessing(true);
    setMessage(null);

    try {
      const { error } = await supabase
        .from('carga_actual')
        .delete()
        .eq('user_id', effectiveUserId);

      if (error) throw error;

      setMessage({
        type: 'success',
        text: '✅ Se ha vaciado la carga actual de ventas con éxito.',
      });
      await loadData();
    } catch (err: any) {
      console.error('Error clearing all sales:', err);
      setMessage({ type: 'error', text: err?.message || 'Error al vaciar la carga.' });
    } finally {
      setIsProcessing(false);
    }
  };

  // Restaurar ventas oficiales auditadas de la Semana 41 (18 movimientos)
  // Sincronizar saldos de arrastre del Acta Oficial S41 y activar Semana 42
  const handleRestoreCycleFromS41Acta = async () => {
    if (!effectiveUserId) return;

    setIsProcessing(true);
    setMessage(null);

    try {
      const { data: directData, error: dirErr } = await supabase
        .from('cierres_semanales')
        .select('*')
        .eq('user_id', effectiveUserId)
        .order('id', { ascending: false });

      if (dirErr || !directData || directData.length === 0) {
        alert('No se encontraron registros de Actas de Cierre en la base de datos.');
        return;
      }

      // Buscar el cierre de la Semana 41 (2026-10-05 al 2026-10-11)
      const targetRows = directData.filter(
        (r) =>
          r.periodo?.includes('2026-10-05') ||
          r.periodo?.includes('Semana 41') ||
          r.periodo?.includes('11/10/2026')
      );
      const rowsToUse = targetRows.length > 0 ? targetRows : directData;
      const agRows = rowsToUse.filter((r) => r.tipo_entidad === 'AGENCIA' || !r.entidad?.startsWith('OPERADORA:'));
      const opRows = rowsToUse.filter((r) => r.tipo_entidad === 'OPERADORA' || r.entidad?.startsWith('OPERADORA:'));

      const per = rowsToUse[0]?.periodo || 'Semana 41';

      if (
        !window.confirm(
          `⚡ ¿CONFIRMA ACTIVAR LA SEMANA 42 APLICANDO LOS ARRASTRES DEL ACTA DE CIERRE (${per})?\n\nEsta operación:\n1. Fijará los saldos iniciales de las ${agRows.length} agencias con sus saldos finales auditados.\n2. Fijará los saldos de arrastre de las ${opRows.length} casas operadoras.\n3. Establecerá el ciclo oficial en SEMANA 42 (2026-10-12 al 2026-10-18).\n4. Asignará las ventas activas a la Semana 42.`
        )
      ) {
        return;
      }

      // 1. Obtener agencias vigentes de la BD para tener sus IDs
      const { data: currentAgencies } = await supabase
        .from('agencias')
        .select('*')
        .eq('user_id', effectiveUserId);

      const agListToUpdate = currentAgencies || agencies;

      // 2. Actualizar saldos iniciales de agencias
      for (const r of agRows) {
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
      const confs = await loadSystemKeywords(effectiveUserId);
      const updatedKeywords: SystemKeywordsMap = { ...confs };
      for (const op of opRows) {
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

      // 6. Actualizar fecha de las ventas en carga_actual al rango de Semana 42 (2026-10-18)
      try {
        await supabase
          .from('carga_actual')
          .update({ fecha: '2026-10-18' })
          .eq('user_id', effectiveUserId);
      } catch (_) {}

      setMessage({
        type: 'success',
        text: `⚡ ¡Operación Exitosa! Arrastres aplicados desde el Acta de Cierre (${per}). El sistema ahora opera en la SEMANA 42 (2026-10-12 al 2026-10-18) y sus ventas están correctamente ubicadas en este ciclo.`,
      });

      if (refreshSystemCycle) {
        await refreshSystemCycle();
      }
      await loadData();
    } catch (err: any) {
      console.error('Error restaurando ciclo desde acta en SalesEntry:', err);
      setMessage({ type: 'error', text: err?.message || 'Error al restaurar ciclo desde el acta.' });
    } finally {
      setIsProcessing(false);
    }
  };

  // Reset bulk import area and restore AUTO detection
  const resetBulkArea = () => {
    setBulkRows([]);
    setBulkCurrency('AUTO');
    setBulkDetectedCurrencies([]);
    setBulkSystem('AUTO');
    setBulkError(null);
    setBulkUnmatched([]);
    setEditingComIndex(null);
  };

  // Handle CSV/Excel/PDF bulk file parsing (Motor Universal Dinámico)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input value so selecting the same file triggers change if desired
    e.target.value = '';

    // Clear previous preview area and reset auto-detection on every new file load
    resetBulkArea();
    const reader = new FileReader();

    reader.onload = async (event) => {
      try {
        const buffer = event.target?.result as ArrayBuffer;
        let rows: any[][] = [];

        const isPdf = file.name.toLowerCase().endsWith('.pdf');
        if (isPdf) {
          const pdfRes = await extractTextFromPdf(buffer);
          rows = pdfRes.rows;

          if (pdfRes.isImageOnly || rows.length === 0) {
            setBulkError(
              `El archivo PDF "${file.name}" es una foto o escaneo sin texto digital seleccionable. Al tratarse de un comprobante físico individual, puedes registrarlo directamente en el formulario de "Registro Manual" que se encuentra más abajo.`
            );
            return;
          }
        } else {
          const workbook = XLSX.read(buffer, { type: 'array', raw: true, codepage: 65001 });
          const firstSheetName = workbook.SheetNames[0];
          if (!firstSheetName) {
            setBulkError('El archivo no contiene hojas válidas.');
            return;
          }
          const worksheet = workbook.Sheets[firstSheetName];
          rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '', raw: true });
        }

        if (!rows || rows.length < 1) {
          setBulkError('El archivo no contiene suficientes datos o filas para procesar.');
          return;
        }

        // --- 1. DETECT VERTICAL THERMAL TICKET FORMAT (GATO PESOS, BANKLOT, POS) ---
        const ticketParse = detectAndParseThermalTicket(
          rows,
          agencies,
          systems.map((s) => s.nombre_sistema),
          file.name
        );

        if (ticketParse.isThermalTicket && ticketParse.synthesizedRows) {
          rows = ticketParse.synthesizedRows;
          if (ticketParse.date) {
            setBulkFileDate(ticketParse.date);
          }
          if (ticketParse.currency) {
            setBulkCurrency(ticketParse.currency);
          }
          if (ticketParse.systemName && bulkSystem === 'AUTO') {
            setBulkSystem(ticketParse.systemName);
          }
        }

        if (!rows || rows.length < 2) {
          setBulkError('El archivo no contiene suficientes filas de datos tabulares para procesar.');
          return;
        }

        // 2. Detect System & Currency (Auto o Manual vía Motor Inmutable)
        const fileNameUpper = file.name.toUpperCase();
        const headerDna = rows
          .slice(0, 15)
          .map((r) => r.join(' '))
          .join(' ')
          .toUpperCase();

        const sistDet = detectSystemFromDna(file.name, headerDna, bulkSystem, systems);
        if (sistDet && bulkSystem === 'AUTO') {
          setBulkSystem(sistDet);
        }

        // Detect report date from filename if present (e.g. 2026-10-05_2026-10-11)
        const dateMatches = file.name.match(/\d{4}-\d{2}-\d{2}/g);
        if (dateMatches && dateMatches.length > 0) {
          const fileReportDate = dateMatches[dateMatches.length - 1];
          setBulkFileDate(fileReportDate);
        }

        const fileIntrinsicCurrency = detectFileIntrinsicCurrency(file.name, headerDna, sistDet, bulkCurrency);
        let detectedMoneda = fileIntrinsicCurrency;
        if (!detectedMoneda && bulkCurrency !== 'AUTO' && bulkCurrency !== 'MULTI') {
          detectedMoneda = bulkCurrency;
        }

        // 3. Reglas y Palabras Clave Canónicas del Sistema (salesEngineLock)
        const canonRule = CANONICAL_SYSTEM_RULES[sistDet.toUpperCase()];
        const sysConf = systemKeywords[sistDet] || DEFAULT_SYSTEM_KEYWORDS[sistDet];
        const configuredVenta = sysConf?.venta?.trim().toUpperCase();
        const configuredPremio = sysConf?.premio?.trim().toUpperCase();
        const configuredAgencia = sysConf?.agencia?.trim().toUpperCase();

        const NAME_SYNONYMS = Array.from(new Set([
          ...(canonRule ? canonRule.colAgencia : []),
          ...(configuredAgencia ? [configuredAgencia] : []),
          'AGENT', 'AGENCIA', 'NOMBRE', 'USUARIO', 'TAQUILLA', 'BANCA', 'SUBBANCA', 'TERMINAL', 'GRUPO', 'CLIENTE'
        ]));
        const VENTA_SYNONYMS = Array.from(new Set([
          ...(canonRule ? canonRule.colVenta : []),
          ...(configuredVenta ? [configuredVenta] : []),
          'TOTAL ACCEPTED', 'ACCEPTED', 'VENTA', 'VENTAS', 'TOTAL VENTA', 'JUGADO', 'TOTAL JUGADO', 'BRUTO', 'TOTAL BRUTO', 'APUESTA', 'APUESTAS'
        ]));
        const PREMIO_SYNONYMS = Array.from(new Set([
          ...(canonRule ? canonRule.colPremio : []),
          ...(configuredPremio ? [configuredPremio] : []),
          'TOTAL PAID', 'PAID OUT', 'PREMIO', 'PREMIOS', 'TOTAL PREMIOS', 'PAGADO', 'PAGADOS', 'ACIERTO', 'ACIERTOS'
        ]));
        const COMISION_SYNONYMS = Array.from(new Set([
          ...(canonRule ? canonRule.colComision : []),
          'COMISION', 'COMISIÓN', 'COMISIONES', 'COM. AGENCIA', 'GANANCIA', 'COM'
        ]));
        const NETO_SYNONYMS = Array.from(new Set([
          ...(canonRule ? canonRule.colNeto : []),
          'PROFIT', 'SALDO', 'TOTAL SALDO', 'NETO', 'TOTAL NETO', 'BALANCE', 'TOTAL BALANCE', 'TOTAL A PAGAR'
        ]));

        let headerRowIdx = -1;
        for (let i = 0; i < Math.min(25, rows.length); i++) {
          const rowStr = rows[i].map((c) => String(c ?? '').trim().toUpperCase()).join(' ');
          const hasName = NAME_SYNONYMS.some((syn) => rowStr.includes(syn));
          const hasFinancial =
            VENTA_SYNONYMS.some((syn) => rowStr.includes(syn)) ||
            PREMIO_SYNONYMS.some((syn) => rowStr.includes(syn)) ||
            COMISION_SYNONYMS.some((syn) => rowStr.includes(syn));

          if (hasName && hasFinancial) {
            headerRowIdx = i;
            break;
          }
        }

        if (headerRowIdx === -1) {
          for (let i = 0; i < Math.min(20, rows.length); i++) {
            const rowStr = rows[i].map((c) => String(c ?? '').trim().toUpperCase()).join(' ');
            if (NAME_SYNONYMS.some((syn) => rowStr.includes(syn))) {
              headerRowIdx = i;
              break;
            }
          }
        }

        if (headerRowIdx === -1) headerRowIdx = 0;

        const headerCols = rows[headerRowIdx].map((c) => String(c ?? '').trim().toUpperCase());

        let colNombre = headerCols.findIndex((c) =>
          (configuredAgencia && c.includes(configuredAgencia)) || NAME_SYNONYMS.some((syn) => c.includes(syn))
        );
        if (colNombre === -1) colNombre = 0;

        let colVenta = headerCols.findIndex((c) =>
          (configuredVenta && c.includes(configuredVenta)) || VENTA_SYNONYMS.some((syn) => c.includes(syn))
        );
        if (colVenta === -1) colVenta = 1;

        let colPremio = headerCols.findIndex((c) =>
          (configuredPremio && c.includes(configuredPremio)) || PREMIO_SYNONYMS.some((syn) => c.includes(syn))
        );

        let colComision = headerCols.findIndex((c) => COMISION_SYNONYMS.some((syn) => c.includes(syn)));
        let colNeto = headerCols.findIndex((c) => NETO_SYNONYMS.some((syn) => c === syn || c.includes(syn)));
        const MONEDA_SYNONYMS = ['MONEDA', 'MONEDAS', 'DIVISA', 'DIVISAS', 'CURRENCY', 'DIV'];
        let colMoneda = headerCols.findIndex((c) => MONEDA_SYNONYMS.some((syn) => c === syn || c.includes(syn)));

        if (colComision === -1 && colPremio === -1) {
          colComision = 2;
          colPremio = 3;
        }

        const parsed: any[] = [];
        const duplicatesFound: string[] = [];
        const unmatchedFound: string[] = [];
        const distinctFileCurrencies = new Set<string>();

        for (let i = headerRowIdx + 1; i < rows.length; i++) {
          const row = rows[i];
          if (!row || row.length === 0) continue;

          const rawCell = String(row[colNombre] ?? '').trim();
          const upperCell = rawCell.toUpperCase();

          if (!rawCell || upperCell.startsWith('TOTAL') || upperCell.startsWith('CUENTA CON') || upperCell === 'NAN' || upperCell === 'ESTADO' || upperCell === 'LIQUIDADO') {
            if (upperCell.startsWith('TOTAL')) break;
            continue;
          }

          // Coincidencia Estricta y Anti-Secuestro vía salesEngineLock
          const targetSystem = bulkSystem !== 'AUTO' ? bulkSystem : sistDet;
          let matchResult = matchAgencyStrict(rawCell, targetSystem, detectedMoneda || 'COP', agencies);
          if (!matchResult.agency && colNombre + 1 < row.length) {
            const nextCell = String(row[colNombre + 1] ?? '').trim();
            if (nextCell && !nextCell.startsWith('TOTAL')) {
              const altResult = matchAgencyStrict(nextCell, targetSystem, detectedMoneda || 'COP', agencies);
              if (altResult.agency) {
                matchResult = altResult;
              }
            }
          }

          const matchedAg: Agency | undefined = matchResult.agency;
          const matchedSystem = targetSystem; // 100% Blindado: El sistema del archivo o selector jamás muta

          if (!matchedAg) {
            unmatchedFound.push(rawCell);
            continue;
          }

          // Extract specific conditions for this system from agency configuration
          let comPct: number | null = null;
          let partPct: number | null = null;
          let sysMoneda = '';
          let hasSpecificSysComision = false;

          if (matchedAg.condiciones_sistemas) {
            try {
              const cond = typeof matchedAg.condiciones_sistemas === 'string'
                ? JSON.parse(matchedAg.condiciones_sistemas)
                : matchedAg.condiciones_sistemas;

              const candKeys = [
                matchResult.moneda ? `${matchedSystem}_${matchResult.moneda}` : null,
                detectedMoneda ? `${matchedSystem}_${detectedMoneda}` : null,
                matchedSystem,
              ].filter(Boolean) as string[];

              let chosenConf: any = null;
              for (const k of candKeys) {
                if (cond?.[k]) {
                  chosenConf = cond[k];
                  break;
                }
              }

              if (chosenConf) {
                if (chosenConf.comision !== undefined && chosenConf.comision !== null && chosenConf.comision !== '') {
                  comPct = Number(chosenConf.comision);
                  hasSpecificSysComision = true;
                }
                if (chosenConf.participacion !== undefined && chosenConf.participacion !== null && chosenConf.participacion !== '') {
                  partPct = Number(chosenConf.participacion);
                }
                if (chosenConf.moneda) {
                  sysMoneda = normalizarMoneda(chosenConf.moneda);
                }
              }
            } catch (e) {
              console.error('Error parsing condiciones_sistemas', e);
            }
          }

          if (comPct === null) {
            comPct = (matchedAg.comision !== undefined && matchedAg.comision !== null && !isNaN(Number(matchedAg.comision)))
              ? Number(matchedAg.comision)
              : null;
          }

          if (partPct === null) {
            partPct = (matchedAg.participacion_ag !== undefined && matchedAg.participacion_ag !== null && !isNaN(Number(matchedAg.participacion_ag)))
              ? Number(matchedAg.participacion_ag)
              : 0;
          }

          // Resolución de Moneda Inteligente por Fila:
          // 1. Moneda explícita detectada en la celda del agente (ej: "15LETRAS1 Bs" -> BS, "15LETRAS1 Usd" -> USD)
          // 2. Columna dedicada de Moneda en la fila (colMoneda)
          // 3. Moneda resultante del match en condiciones_sistemas de la agencia (matchResult.moneda)
          // 4. Selección manual específica en el selector superior (si el usuario eligió una divisa concreta)
          // 5. Moneda del sistema configurada en la agencia o moneda intrínseca del archivo
          const { detectedCurrency: rowCellCurr } = extractRowCurrencyAndAgencyName(rawCell);
          let cellColMon = '';
          if (colMoneda !== -1 && row[colMoneda] !== undefined) {
            const rawCol = String(row[colMoneda]).trim();
            if (rawCol) cellColMon = normalizarMoneda(rawCol);
          }

          const agencyCurrencies = (matchedAg.monedas || '')
            .split(',')
            .map((m: string) => normalizarMoneda(m.trim()))
            .filter(Boolean);
          const primaryAgencyCurr = agencyCurrencies[0] || 'COP';

          let rowMoneda = 'COP';
          if (rowCellCurr) {
            rowMoneda = rowCellCurr;
          } else if (cellColMon) {
            rowMoneda = cellColMon;
          } else if (matchResult.moneda) {
            rowMoneda = normalizarMoneda(matchResult.moneda);
          } else if (bulkCurrency !== 'AUTO' && bulkCurrency !== 'MULTI') {
            rowMoneda = normalizarMoneda(bulkCurrency);
          } else if (sysMoneda) {
            rowMoneda = sysMoneda;
          } else if (detectedMoneda && detectedMoneda !== 'MULTI') {
            rowMoneda = normalizarMoneda(detectedMoneda);
          } else if (agencyCurrencies.length === 1) {
            rowMoneda = agencyCurrencies[0];
          } else if (agencyCurrencies.length > 1) {
            rowMoneda = primaryAgencyCurr;
          } else if (matchedSystem.toUpperCase() === 'CDAPUESTAS') {
            rowMoneda = 'USD';
          } else {
            rowMoneda = 'COP';
          }

          distinctFileCurrencies.add(rowMoneda);

          // Exact currency condition override if available for this system & rowMoneda
          if (matchedAg.condiciones_sistemas && matchedSystem && rowMoneda) {
            try {
              const cond = typeof matchedAg.condiciones_sistemas === 'string'
                ? JSON.parse(matchedAg.condiciones_sistemas)
                : matchedAg.condiciones_sistemas;
              const exactConf = cond?.[`${matchedSystem}_${rowMoneda}`] || cond?.[matchedSystem];
              if (exactConf) {
                if (exactConf.comision !== undefined && exactConf.comision !== null && exactConf.comision !== '') {
                  comPct = Number(exactConf.comision);
                  hasSpecificSysComision = true;
                }
                if (exactConf.participacion !== undefined && exactConf.participacion !== null && exactConf.participacion !== '') {
                  partPct = Number(exactConf.participacion);
                }
              }
            } catch (_) {}
          }

          // Check if already loaded in carga_actual for this day/system/currency (salesEngineLock)
          const isDup = isSaleDuplicate(sales, matchedAg.nombre_agencia, matchedSystem, rowMoneda, bulkFileDate);

          if (isDup) {
            duplicatesFound.push(`${matchedAg.nombre_agencia} (${matchedSystem})`);
            continue;
          }

          const venta = parseNum(row[colVenta]);
          const premios = colPremio !== -1 ? parseNum(row[colPremio]) : 0;
          const hasFileComision = colComision !== -1 && row[colComision] !== undefined && String(row[colComision]).trim() !== '';
          const comExcel = hasFileComision ? parseNum(row[colComision]) : null;

          // Commission calculation:
          // 1. If operator explicitly configured an override commission % for this system in condiciones_sistemas, use it.
          // 2. Otherwise, if the provider file explicitly reports a COMISION column (e.g. GatoWeb/Banklot has COMISION 0,00), use comExcel!
          // 3. Otherwise, if agency has a configured commission %, calculate from comPct (even 0%!).
          // 4. Default to 0.
          let com = 0;
          if (hasSpecificSysComision && comPct !== null && !isNaN(comPct)) {
            com = Math.round(venta * (comPct / 100) * 100) / 100;
          } else if (hasFileComision && comExcel !== null) {
            com = comExcel;
          } else if (comPct !== null && !isNaN(comPct)) {
            com = Math.round(venta * (comPct / 100) * 100) / 100;
          } else {
            com = 0;
          }

          let neto = Math.round((venta - com - premios) * 100) / 100;
          // If file explicitly provides SALDO / NETO and no commission was found, verify/derive:
          if (colNeto !== -1 && row[colNeto] !== undefined && String(row[colNeto]).trim() !== '') {
            const saldoFile = parseNum(row[colNeto]);
            if (!hasFileComision && comPct === null && Math.abs((venta - premios - saldoFile) - com) > 0.01) {
              const derivedCom = Math.round((venta - premios - saldoFile) * 100) / 100;
              if (derivedCom >= 0) {
                com = derivedCom;
                neto = saldoFile;
              }
            }
          }

          const pPct = partPct !== null && !isNaN(partPct) ? partPct : 0;
          const uAg = Math.round(neto * (pPct / 100) * 100) / 100;
          const uOp = Math.round((neto - uAg) * 100) / 100;

          parsed.push({
            user_id: effectiveUserId,
            agencia: matchedAg.nombre_agencia,
            sistema: matchedSystem,
            moneda: rowMoneda,
            venta,
            premios,
            comision: com,
            neto,
            util_op: uOp,
            util_ag: uAg,
            fecha: bulkFileDate,
          });
        }

        setBulkUnmatched(unmatchedFound);

        // Actualizar el selector de moneda superior según lo detectado en las filas
        const foundCurrs = Array.from(distinctFileCurrencies);
        setBulkDetectedCurrencies(foundCurrs);

        if (foundCurrs.length > 1) {
          setBulkCurrency('MULTI');
        } else if (foundCurrs.length === 1 && (bulkCurrency === 'AUTO' || bulkCurrency === 'MULTI')) {
          setBulkCurrency(foundCurrs[0]);
        } else if (detectedMoneda) {
          setBulkCurrency(detectedMoneda);
        }

        if (duplicatesFound.length > 0) {
          setBulkError(
            `Aviso: ${duplicatesFound.length} agencias ya tienen ventas registradas para el ${bulkFileDate} (${duplicatesFound.slice(0, 3).join(', ')}${duplicatesFound.length > 3 ? '...' : ''}). Se omitieron para evitar duplicados.`
          );
        }

        if (parsed.length === 0) {
          if (duplicatesFound.length === 0) {
            setBulkError(
              unmatchedFound.length > 0
                ? `No se encontraron coincidencias para: ${unmatchedFound.slice(0, 3).join(', ')}${unmatchedFound.length > 3 ? '...' : ''}. Configura sus equivalencias en Agencias.`
                : 'No se encontraron registros de agencias válidos en el archivo.'
            );
          }
        } else {
          setBulkRows(parsed);
        }
      } catch (err: any) {
        setBulkError('Error al interpretar el archivo: ' + err.message);
      }
    };

    reader.readAsArrayBuffer(file);
  };

  // Update a single field in bulk import preview rows
  const handleUpdateBulkRow = (index: number, field: string, value: any) => {
    setBulkRows((prev) => {
      const next = [...prev];
      const row = { ...next[index], [field]: value };
      if (field === 'moneda') {
        row.moneda = value;
      }
      if (field === 'comision' || field === 'venta' || field === 'premios') {
        const v = parseNum(row.venta);
        const c = parseNum(row.comision);
        const p = parseNum(row.premios);
        const neto = Math.round((v - c - p) * 100) / 100;

        const ag = agencies.find((a) => cleanAgencyName(a.nombre_agencia) === cleanAgencyName(row.agencia));
        let pPct = Number(ag?.participacion_ag ?? 0);
        if (ag?.condiciones_sistemas) {
          try {
            const cond = typeof ag.condiciones_sistemas === 'string'
              ? JSON.parse(ag.condiciones_sistemas)
              : ag.condiciones_sistemas;
            const comboKey = `${row.sistema}_${row.moneda}`;
            const sysEntry = cond?.[comboKey] || cond?.[row.sistema];
            if (sysEntry && sysEntry.participacion !== undefined && sysEntry.participacion !== '') {
              pPct = Number(sysEntry.participacion);
            }
          } catch (_) {}
        }
        const uAg = Math.round(neto * (pPct / 100) * 100) / 100;
        const uOp = Math.round((neto - uAg) * 100) / 100;
        row.neto = neto;
        row.util_ag = uAg;
        row.util_op = uOp;
      }
      next[index] = row;
      return next;
    });
  };

  // Remove a row from bulk import preview
  const handleRemoveBulkRow = (index: number) => {
    setBulkRows((prev) => prev.filter((_, idx) => idx !== index));
  };

  // Save Bulk Import Rows
  const handleSaveBulk = async () => {
    if (bulkRows.length === 0 || !effectiveUserId) return;
    setIsProcessing(true);

    try {
      const { error } = await supabase.from('carga_actual').insert(bulkRows);
      if (error) throw error;

      confetti({ particleCount: 60, spread: 70 });
      setMessage({ type: 'success', text: `¡Se cargaron ${bulkRows.length} movimientos de agencias con éxito!` });

      resetBulkArea();
      setIsBulkOpen(false);
      await loadData();
    } catch (err: any) {
      console.error('Error inserting bulk rows:', err);
      setMessage({ type: 'error', text: err?.message || 'Error al guardar carga masiva.' });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2">
            <span className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              <TrendingUp className="w-5 h-5" />
            </span>
            Gestión de Ventas y Movimientos
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Registro diario de venta bruta, comisiones, premios y utilidades por sistema y moneda en el ciclo activo.
          </p>
        </div>

        <div id="tour-cargar-ventas-actions" className="flex items-center gap-2">
          <button
            onClick={() => loadData()}
            disabled={isLoading}
            className={UI_LOCK.buttonSecondary + ' text-xs flex items-center gap-1.5'}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            Actualizar
          </button>

          {sales.length > 0 && (
            <button
              onClick={handleClearAllActiveSales}
              disabled={isProcessing}
              className="px-3.5 py-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/30 font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
              title="Vaciar todas las ventas cargadas en el ciclo activo"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Vaciar Carga ({sales.length})
            </button>
          )}

          <button
            onClick={handleRestoreCycleFromS41Acta}
            disabled={isProcessing}
            className="px-3.5 py-2.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-400 border border-amber-500/30 font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
            title="Sincronizar arrastres del Acta Oficial S41 y fijar Semana 42"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Activar Semana 42 desde Acta
          </button>

          <button
            id="tour-cargar-ventas-btn"
            onClick={() => {
              if (!isBulkOpen) {
                loadData();
                resetBulkArea();
              }
              setIsBulkOpen(!isBulkOpen);
            }}
            className="px-4 py-2.5 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-700 dark:text-cyan-400 border border-cyan-500/30 font-bold text-xs flex items-center gap-2 transition-all cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Carga Masiva (Excel/CSV/PDF)
          </button>
        </div>
      </div>

      {message && (
        <div
          className={`p-4 rounded-2xl border flex items-center gap-3 text-sm animate-fade-in ${
            message.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-500/20 text-emerald-800 dark:text-emerald-400'
              : 'bg-rose-50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-500/20 text-rose-800 dark:text-rose-400'
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

      {String(systemCycle.semana) === '41' && (
        <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-700/60 flex flex-col sm:flex-row items-center justify-between gap-3 text-amber-900 dark:text-amber-200 shadow-sm">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 shrink-0 text-amber-600 dark:text-amber-400" />
            <div>
              <div className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white">
                Semana 41 cerrada previamente (Acta Inmutable disponible en el Histórico)
              </div>
              <div className="text-xs text-amber-800 dark:text-amber-200/80">
                Las ventas cargadas en este panel corresponden a la Semana 42. Aplica los saldos finales auditados de la Semana 41 para que el sistema opere en la Semana 42 (12/10 al 18/10).
              </div>
            </div>
          </div>
          <button
            onClick={handleRestoreCycleFromS41Acta}
            disabled={isProcessing}
            className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs flex items-center gap-2 transition-all cursor-pointer shadow-sm shrink-0"
          >
            <Sparkles className="w-4 h-4" />
            Activar Semana 42 con Arrastres del Acta
          </button>
        </div>
      )}

      {/* Bulk Upload Expander */}
      {isBulkOpen && (
        <div className={UI_LOCK.card + ' p-6 shadow-xl space-y-4 animate-fade-in'}>
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Upload className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
              Importar Reporte de Sistema (Excel / CSV / PDF)
            </h3>
            <button
              onClick={() => {
                setIsBulkOpen(false);
                resetBulkArea();
              }}
              className="text-slate-400 hover:text-slate-700 dark:hover:text-white text-xs font-bold px-2 py-1"
            >
              ✕
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Fecha del Reporte:</label>
              <input
                type="date"
                value={bulkFileDate}
                onChange={(e) => {
                  const newDate = e.target.value;
                  setBulkFileDate(newDate);
                  setBulkRows((prev) => prev.map((r) => ({ ...r, fecha: newDate })));
                }}
                className={UI_LOCK.input}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Sistema / Proveedor:</label>
              <select
                value={bulkSystem}
                onChange={(e) => {
                  const sVal = e.target.value;
                  setBulkSystem(sVal);
                  if (sVal !== 'AUTO') {
                    setBulkRows((prev) => prev.map((r) => ({ ...r, sistema: sVal })));
                  }
                }}
                className={UI_LOCK.select}
              >
                <option value="AUTO">✨ Auto-detectar Sistema</option>
                {availableSystemsList.map((sName) => (
                  <option key={sName} value={sName}>
                    🎰 {sName}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Moneda:</label>
              <select
                value={bulkCurrency}
                onChange={(e) => {
                  const mVal = e.target.value;
                  setBulkCurrency(mVal);
                  if (mVal !== 'AUTO' && mVal !== 'MULTI') {
                    setBulkRows((prev) => prev.map((r) => ({ ...r, moneda: mVal })));
                  }
                }}
                className={UI_LOCK.select}
              >
                <option value="AUTO">✨ Auto-detectar Moneda</option>
                {bulkCurrency === 'MULTI' && (
                  <option value="MULTI">
                    🔀 Multi-Moneda ({bulkDetectedCurrencies.length > 0 ? bulkDetectedCurrencies.join(', ') : 'Detectadas'})
                  </option>
                )}
                {availableCurrenciesList.map((m) => (
                  <option key={m.code} value={m.code}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Archivo Excel / CSV / PDF:</label>
              <input
                type="file"
                accept=".xlsx,.xls,.csv,.txt,.pdf"
                onClick={(e) => {
                  (e.target as HTMLInputElement).value = '';
                  resetBulkArea();
                }}
                onChange={handleFileUpload}
                className="w-full text-xs text-slate-500 dark:text-slate-400 file:mr-2 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-emerald-500/10 file:text-emerald-700 dark:file:text-emerald-300 hover:file:bg-emerald-500/20 cursor-pointer"
              />
            </div>
          </div>

          {bulkUnmatched.length > 0 && (
            <div className="p-3 bg-amber-50 dark:bg-amber-500/10 border border-amber-300 dark:border-amber-500/20 rounded-xl text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
              <div>
                <strong>Aviso de Equivalencias:</strong> Se encontraron {bulkUnmatched.length} registros que no coinciden con ninguna agencia ({bulkUnmatched.slice(0, 4).join(', ')}{bulkUnmatched.length > 4 ? '...' : ''}). Para que se carguen automáticamente, configura su ID/correo en la agencia correspondiente dentro de <strong>Agencias</strong>.
              </div>
            </div>
          )}

          {bulkError && (
            <div className="p-3 bg-rose-50 dark:bg-rose-500/10 border border-rose-300 dark:border-rose-500/20 rounded-xl text-xs text-rose-800 dark:text-rose-300 flex items-start gap-2 animate-fade-in">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400 mt-0.5" />
              <span>{bulkError}</span>
            </div>
          )}

          {bulkRows.length > 0 && (
            <div className="space-y-3 pt-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                    ✓ Se reconocieron {bulkRows.length} {bulkRows.length === 1 ? 'agencia' : 'agencias'} para importar:
                  </span>
                  {Object.entries(
                    bulkRows.reduce((acc, r) => {
                      acc[r.moneda] = (acc[r.moneda] || 0) + 1;
                      return acc;
                    }, {} as Record<string, number>)
                  ).map(([curr, count]) => (
                    <span
                      key={curr}
                      className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-cyan-100 dark:bg-cyan-500/20 text-cyan-800 dark:text-cyan-300 border border-cyan-300 dark:border-cyan-500/30"
                    >
                      {curr}: {String(count)}
                    </span>
                  ))}
                </div>
                <span className="text-slate-500 dark:text-slate-400 text-[11px]">
                  Puedes modificar la moneda o comisión de cada fila si lo deseas antes de guardar.
                </span>
              </div>

              <div className="max-h-56 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-[#071217]">
                <table className="w-full text-left text-[11px]">
                  <thead className={UI_LOCK.tableThead + ' uppercase font-mono sticky top-0'}>
                    <tr>
                      <th className="p-2">Agencia</th>
                      <th className="p-2">Sistema</th>
                      <th className="p-2">Moneda</th>
                      <th className="p-2 text-right">Venta</th>
                      <th className="p-2 text-right">Comisión</th>
                      <th className="p-2 text-right">Premios</th>
                      <th className="p-2 text-right">Neto</th>
                      <th className="p-2 text-center">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 font-mono">
                    {bulkRows.map((r, i) => (
                      <tr key={i} className={UI_LOCK.tableTr}>
                        <td className="p-2 font-sans font-semibold text-slate-900 dark:text-white">{r.agencia}</td>
                        <td className="p-2 text-emerald-600 dark:text-emerald-400 font-mono font-bold">{r.sistema}</td>
                        <td className="p-2">
                          <select
                            value={r.moneda}
                            onChange={(e) => handleUpdateBulkRow(i, 'moneda', e.target.value)}
                            className={UI_LOCK.select + ' text-[11px] py-0.5 px-2 font-bold'}
                          >
                            {availableCurrenciesList.map((m) => (
                              <option key={m.code} value={m.code}>
                                {m.code}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="p-2 text-right text-slate-900 dark:text-white font-medium">{formatCurrency(r.venta, r.moneda)}</td>
                        <td className="p-2 text-right">
                          {editingComIndex === i ? (
                            <div className="inline-flex items-center justify-end gap-1">
                              <input
                                autoFocus
                                type="number"
                                step="any"
                                value={r.comision}
                                onChange={(e) => handleUpdateBulkRow(i, 'comision', e.target.value)}
                                onBlur={() => setEditingComIndex(null)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') setEditingComIndex(null);
                                }}
                                className={UI_LOCK.input + ' w-24 py-0.5 px-2 text-right text-emerald-600 dark:text-emerald-400 font-mono text-xs'}
                              />
                              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 font-mono">
                                {normalizarMoneda(r.moneda) === 'BS' ? 'Bs.' : normalizarMoneda(r.moneda) === 'COP' ? 'COP' : '$'}
                              </span>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setEditingComIndex(i)}
                              className="inline-flex items-center justify-end gap-1.5 hover:bg-slate-100 dark:hover:bg-slate-800/60 px-1.5 py-0.5 rounded transition-all group cursor-pointer text-right"
                              title="Click para modificar comisión"
                            >
                              <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                                {formatCurrency(r.comision, r.moneda)}
                              </span>
                              <Edit2 className="w-3 h-3 text-slate-400 opacity-40 group-hover:opacity-100 transition-opacity" />
                            </button>
                          )}
                        </td>
                        <td className="p-2 text-right text-rose-600 dark:text-rose-400 font-medium">{formatCurrency(r.premios, r.moneda)}</td>
                        <td className="p-2 text-right font-bold text-slate-900 dark:text-white">{formatCurrency(r.neto, r.moneda)}</td>
                        <td className="p-2 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveBulkRow(i)}
                            className="text-slate-400 hover:text-rose-500 p-1 rounded transition-colors cursor-pointer"
                            title="Descartar esta fila"
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={resetBulkArea}
                  className={UI_LOCK.buttonSecondary + ' text-xs font-semibold'}
                >
                  Limpiar Lista
                </button>
                <button
                  onClick={handleSaveBulk}
                  disabled={isProcessing}
                  className={UI_LOCK.buttonPrimary + ' text-xs flex items-center gap-1.5'}
                >
                  <Upload className="w-3.5 h-3.5" />
                  {isProcessing ? 'Guardando...' : `Guardar ${bulkRows.length} Registros`}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Consolidated Financial Cards by System & Currency (Horizontal Linear View) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Consolidado General de Cargas (Ciclo Activo)
          </h3>
          <span className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 px-2 py-0.5 rounded-lg">
            {groupedMetrics.length} {groupedMetrics.length === 1 ? 'Combinación' : 'Combinaciones'} Sistema-Moneda
          </span>
        </div>

        {groupedMetrics.length === 0 ? (
          <div className={UI_LOCK.card + ' p-6 text-center text-xs text-slate-500 dark:text-slate-400'}>
            No hay movimientos de venta registrados para este ciclo.
          </div>
        ) : (
          <div id="tour-cargar-ventas-table" className="space-y-2.5">
            {groupedMetrics.map((gm) => (
              <div
                key={gm.key}
                className={UI_LOCK.card + ' p-3.5 sm:p-4 shadow-sm hover:shadow transition-all'}
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 lg:w-48 shrink-0">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(52,211,153,0.6)] shrink-0" />
                    <div>
                      <span className="text-sm font-black text-slate-900 dark:text-white block truncate">📍 {gm.key}</span>
                      <span className="text-[10px] text-slate-500 uppercase font-mono font-bold">Resumen Consolidado</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 flex-1 font-mono text-center">
                    <div className="bg-slate-50 dark:bg-[#071217] p-2 rounded-xl border border-slate-200/80 dark:border-slate-800/80">
                      <span className="text-[9px] text-slate-500 dark:text-slate-400 uppercase font-bold block font-sans">Venta</span>
                      <strong className="text-slate-900 dark:text-white text-xs sm:text-sm">
                        {gm.venta.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </strong>
                    </div>

                    <div className="bg-slate-50 dark:bg-[#071217] p-2 rounded-xl border border-slate-200/80 dark:border-slate-800/80">
                      <span className="text-[9px] text-slate-500 dark:text-slate-400 uppercase font-bold block font-sans">Comisión</span>
                      <strong className="text-emerald-600 dark:text-emerald-400 text-xs sm:text-sm">
                        {gm.comision.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </strong>
                    </div>

                    <div className="bg-slate-50 dark:bg-[#071217] p-2 rounded-xl border border-slate-200/80 dark:border-slate-800/80">
                      <span className="text-[9px] text-slate-500 dark:text-slate-400 uppercase font-bold block font-sans">Premios</span>
                      <strong className="text-rose-600 dark:text-rose-400 text-xs sm:text-sm">
                        {gm.premios.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </strong>
                    </div>

                    <div className="bg-slate-50 dark:bg-[#071217] p-2 rounded-xl border border-slate-200/80 dark:border-slate-800/80">
                      <span className="text-[9px] text-slate-500 dark:text-slate-400 uppercase font-bold block font-sans">Neto</span>
                      <strong className={`text-xs sm:text-sm ${gm.neto >= 0 ? 'text-slate-900 dark:text-white' : 'text-rose-600 dark:text-rose-400'}`}>
                        {gm.neto.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </strong>
                    </div>

                    <div className="bg-slate-50 dark:bg-[#071217] p-2 rounded-xl border border-slate-200/80 dark:border-slate-800/80">
                      <span className="text-[9px] text-slate-500 dark:text-slate-400 uppercase font-bold block font-sans">Util. Op</span>
                      <strong className={`text-xs sm:text-sm ${gm.util_op >= 0 ? 'text-cyan-600 dark:text-cyan-400' : 'text-rose-600 dark:text-rose-400'}`}>
                        {gm.util_op.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </strong>
                    </div>

                    <div className="bg-slate-50 dark:bg-[#071217] p-2 rounded-xl border border-slate-200/80 dark:border-slate-800/80">
                      <span className="text-[9px] text-slate-500 dark:text-slate-400 uppercase font-bold block font-sans">Util. Ag</span>
                      <strong className={`text-xs sm:text-sm ${gm.util_ag >= 0 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400'}`}>
                        {gm.util_ag.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </strong>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Manual Multi-System Agency Sales Entry Section */}
      <div className={UI_LOCK.card + ' p-5 sm:p-6 shadow-md space-y-5'}>
        {/* Header & Agency Picker */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800/80">
          <div>
            <h3 className="text-base sm:text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
              <span className="text-emerald-600 dark:text-emerald-400 text-lg">➕</span>
              Registro Manual: <span className="text-emerald-600 dark:text-emerald-400 font-extrabold">{formAgencia || 'Seleccione Agencia'}</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Carga directa por sistema y moneda para la agencia seleccionada.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300 shrink-0">🎯 Agencia:</span>
            <select
              value={formAgencia}
              onChange={(e) => setFormAgencia(e.target.value)}
              className={UI_LOCK.select + ' min-w-[200px]'}
            >
              {agencies.map((a) => (
                <option key={a.id} value={a.nombre_agencia}>
                  {a.id} - {a.nombre_agencia}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Date Selector Row */}
        <div className="bg-slate-50 dark:bg-[#071217] border border-slate-200 dark:border-slate-800 rounded-2xl p-3 sm:p-3.5 flex flex-col sm:flex-row sm:items-center gap-3">
          <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2 shrink-0">
            <span>📅</span> Asignar carga al día:
          </label>
          <input
            type="date"
            value={formFecha}
            onChange={(e) => setFormFecha(e.target.value)}
            className={UI_LOCK.input + ' w-full sm:w-64 font-mono'}
          />
        </div>

        {/* Systems Cards List */}
        <div className="space-y-4">
          {agencySystemsList.length === 0 ? (
            <div className="bg-slate-50 dark:bg-[#071217] border border-slate-200 dark:border-slate-800 rounded-2xl p-6 text-center text-xs text-slate-500 dark:text-slate-400">
              No hay sistemas configurados para esta agencia.
            </div>
          ) : (
            agencySystemsList.map((sist) => {
              const { comPct } = getSystemConfig(sist);
              const activeCurrs = getSystemCurrencies(sist);

              return (
                <div
                  key={sist}
                  className="bg-slate-50/70 dark:bg-[#071217]/90 border border-slate-200 dark:border-slate-800 hover:border-emerald-500/30 rounded-2xl p-4 sm:p-5 shadow-sm space-y-4 transition-all"
                >
                  <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800/80 pb-2.5">
                    <h4 className="text-sm sm:text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                      <span className="text-rose-500 text-base">📍</span>
                      Sistema: <span className="font-extrabold tracking-wide">{sist}</span>
                    </h4>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-mono text-slate-600 dark:text-slate-400 bg-slate-200/80 dark:bg-slate-800/80 px-2 py-0.5 rounded-lg border border-slate-300 dark:border-slate-700/60">
                        Comisión base: <strong className="text-emerald-600 dark:text-emerald-400">{comPct}%</strong>
                      </span>
                      <span className="text-[11px] font-mono text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-lg border border-emerald-200 dark:border-emerald-800/50">
                        {activeCurrs.join(', ')}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {activeCurrs.map((mon) => {
                      const { comPct: monComPct } = getSystemConfig(sist, mon);
                      const key = `${sist}_${mon}`;
                      const row = entries[key] || { venta: '', comision: '', premios: '', comisionTouched: false };
                      const v = parseNum(row.venta);
                      const c = parseNum(row.comision);
                      const p = parseNum(row.premios);
                      const neto = Math.round((v - c - p) * 100) / 100;
                      const isSaved = !!row.id;

                      return (
                        <div
                          key={mon}
                          className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3.5 items-center"
                        >
                          {/* Venta */}
                          <div className="space-y-1">
                            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                              <span>Venta {mon}</span>
                              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono font-normal">({monComPct}%)</span>
                            </label>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              placeholder="0,00"
                              value={row.venta}
                              onChange={(e) => handleVentaChange(sist, mon, e.target.value)}
                              className={UI_LOCK.input + ' font-mono'}
                            />
                          </div>

                          {/* Comisión */}
                          <div className="space-y-1">
                            <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Comisión {mon}</label>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              placeholder="0,00"
                              value={row.comision}
                              onChange={(e) => handleComisionChange(sist, mon, e.target.value)}
                              className={UI_LOCK.input + ' text-emerald-600 dark:text-emerald-400 font-mono'}
                            />
                          </div>

                          {/* Premios */}
                          <div className="space-y-1">
                            <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Premios {mon}</label>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              placeholder="0,00"
                              value={row.premios}
                              onChange={(e) => handlePremiosChange(sist, mon, e.target.value)}
                              className={UI_LOCK.input + ' text-rose-600 dark:text-rose-400 font-mono'}
                            />
                          </div>

                          {/* Neto Calculado */}
                          <div className="space-y-1">
                            <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                              Neto Calculado
                            </label>
                            <div className={`text-lg sm:text-xl font-black font-mono tracking-tight ${neto >= 0 ? 'text-slate-900 dark:text-white' : 'text-rose-600 dark:text-rose-400'}`}>
                              {neto.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                          </div>

                          {/* Individual Save Button */}
                          <div className="flex items-center justify-end sm:justify-start pt-1 sm:pt-4">
                            <button
                              type="button"
                              disabled={isProcessing || (v === 0 && p === 0 && c === 0 && !row.venta && !row.premios)}
                              onClick={() => handleSaveSystemRow(sist, mon)}
                              className={`w-full sm:w-auto px-4 py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-40 ${
                                isSaved
                                  ? 'bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-700 dark:text-emerald-400 border border-emerald-500/40'
                                  : UI_LOCK.buttonPrimary + ' text-xs'
                              }`}
                            >
                              <Upload className="w-3.5 h-3.5" />
                              {isSaved ? `Actualizar ${mon}` : `Guardar ${mon}`}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Action Buttons: Clean Screen and Bulk Save */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={handleClearScreen}
            className={UI_LOCK.buttonSecondary + ' text-xs font-bold flex items-center gap-1.5'}
          >
            🧹 LIMPIAR PANTALLA
          </button>

          <button
            type="button"
            disabled={isProcessing}
            onClick={handleSaveAllSystems}
            className={UI_LOCK.buttonPrimary + ' text-xs flex items-center gap-2'}
          >
            <Upload className="w-4 h-4" />
            {isProcessing ? 'Guardando...' : '💾 GUARDAR TODOS LOS SISTEMAS'}
          </button>
        </div>
      </div>

      {/* Detailed Sales Records Separated by Currency */}
      <div className="space-y-4">
        {/* Filter and Currency Tabs Bar */}
        <div className={UI_LOCK.card + ' p-4 flex flex-col md:flex-row items-center justify-between gap-4 shadow-sm'}>
          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            <button
              onClick={() => setActiveCurrencyTab('TODAS')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeCurrencyTab === 'TODAS'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800/80 dark:hover:bg-slate-700 dark:text-slate-300'
              }`}
            >
              <Coins className="w-3.5 h-3.5" />
              Todas las Monedas ({filteredSales.length})
            </button>

            {currencyList.map((curr) => {
              const count = salesByCurrency[curr]?.length || 0;
              const flag = getCurrencyFlag(curr);
              return (
                <button
                  key={curr}
                  onClick={() => setActiveCurrencyTab(curr)}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    activeCurrencyTab === curr
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800/80 dark:hover:bg-slate-700 dark:text-slate-300'
                  }`}
                >
                  <span>{flag}</span>
                  <span>{curr}</span>
                  <span className={`px-1.5 py-0.2 rounded-md text-[10px] font-mono ${
                    activeCurrencyTab === curr ? 'bg-black/20 text-white' : 'bg-slate-200 text-slate-700 dark:bg-slate-900 dark:text-slate-400'
                  }`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto justify-end">
            <span className="text-xs text-slate-500 dark:text-slate-400 font-semibold">Filtrar por Agencia:</span>
            <select
              value={filterAgency}
              onChange={(e) => setFilterAgency(e.target.value)}
              className={UI_LOCK.select}
            >
              <option value="Todas">Todas las Agencias</option>
              {agencies.map((a) => (
                <option key={a.id} value={a.nombre_agencia}>
                  {a.nombre_agencia}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Currency Tables List */}
        {currencyList.length === 0 ? (
          <div className={UI_LOCK.card + ' p-8 text-center text-xs text-slate-500 dark:text-slate-400'}>
            No se encontraron movimientos registrados para la selección actual.
          </div>
        ) : (
          (activeCurrencyTab === 'TODAS' ? currencyList : [activeCurrencyTab]).map((curr) => {
            const items = salesByCurrency[curr] || [];
            if (items.length === 0) return null;

            const flag = getCurrencyFlag(curr);
            const totalVenta = items.reduce((sum, r) => sum + parseNum(r.venta), 0);
            const totalComision = items.reduce((sum, r) => sum + parseNum(r.comision), 0);
            const totalPremios = items.reduce((sum, r) => sum + parseNum(r.premios), 0);
            const totalNeto = items.reduce((sum, r) => sum + parseNum(r.neto), 0);
            const totalUtilOp = items.reduce((sum, r) => sum + parseNum(r.util_op), 0);
            const totalUtilAg = items.reduce((sum, r) => sum + parseNum(r.util_ag), 0);

            return (
              <div
                key={curr}
                className={UI_LOCK.card + ' overflow-hidden shadow-sm'}
              >
                {/* Currency Table Header */}
                <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <span className="text-xl">{flag}</span>
                    <div>
                      <h4 className="text-sm font-black text-slate-900 dark:text-white tracking-wide flex items-center gap-2">
                        Movimientos en {curr === 'BS' ? 'Bolívares (BS)' : curr === 'COP' ? 'Pesos Colombianos (COP)' : curr === 'USD' ? 'Dólares (USD)' : curr}
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20 font-mono font-bold">
                          {items.length} {items.length === 1 ? 'registro' : 'registros'}
                        </span>
                      </h4>
                    </div>
                  </div>

                  <div className="text-right text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                    Neto Acumulado: <strong className={totalNeto >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>{formatCurrency(totalNeto, curr)}</strong>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className={UI_LOCK.tableThead}>
                      <tr>
                        <th className="py-3 px-3 text-center w-10">Nº</th>
                        <th className="py-3 px-4">Agencia</th>
                        <th className="py-3 px-4">Sistema</th>
                        <th className="py-3 px-4">Fecha</th>
                        <th className="py-3 px-4 text-right">Venta</th>
                        <th className="py-3 px-4 text-right">Comisión</th>
                        <th className="py-3 px-4 text-right">Premios</th>
                        <th className="py-3 px-4 text-right">Neto</th>
                        <th className="py-3 px-4 text-right">Util. Op</th>
                        <th className="py-3 px-4 text-right">Util. Ag</th>
                        <th className="py-3 px-4 text-center">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 font-mono text-[12px]">
                      {items.map((s, index) => (
                        <tr key={s.id} className={UI_LOCK.tableTr}>
                          <td className="py-3 px-3 text-center text-slate-400 dark:text-slate-500 text-[11px]">{index + 1}</td>
                          <td className="py-3 px-4 font-sans font-bold text-slate-900 dark:text-white">{s.agencia}</td>
                          <td className="py-3 px-4 text-slate-600 dark:text-slate-300">
                            <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60 text-[11px] font-bold">
                              {s.sistema}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-slate-500 dark:text-slate-400 font-sans text-[11px]">{formatDate(s.fecha)}</td>
                          <td className="py-3 px-4 text-right text-slate-900 dark:text-white font-bold">{formatCurrency(s.venta || 0, s.moneda)}</td>
                          <td className="py-3 px-4 text-right text-emerald-600 dark:text-emerald-400">{formatCurrency(s.comision || 0, s.moneda)}</td>
                          <td className="py-3 px-4 text-right text-rose-600 dark:text-rose-400">{formatCurrency(s.premios || 0, s.moneda)}</td>
                          <td className={`py-3 px-4 text-right font-bold ${parseNum(s.neto) >= 0 ? 'text-slate-900 dark:text-white' : 'text-rose-600 dark:text-rose-400'}`}>
                            {formatCurrency(s.neto || 0, s.moneda)}
                          </td>
                          <td className={`py-3 px-4 text-right font-bold ${parseNum(s.util_op) >= 0 ? 'text-cyan-600 dark:text-cyan-400' : 'text-rose-600 dark:text-rose-400'}`}>
                            {formatCurrency(s.util_op || 0, s.moneda)}
                          </td>
                          <td className={`py-3 px-4 text-right ${parseNum(s.util_ag) >= 0 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400'}`}>
                            {formatCurrency(s.util_ag || 0, s.moneda)}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <button
                              onClick={() => handleDeleteSale(s.id)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:text-rose-400 dark:hover:bg-rose-500/10 transition-colors cursor-pointer"
                              title="Eliminar movimiento"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-slate-50 dark:bg-[#071217] font-bold border-t-2 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-mono text-[12px]">
                      <tr>
                        <td colSpan={4} className="py-3 px-4 font-sans uppercase tracking-wider text-emerald-700 dark:text-emerald-400 text-xs font-black">
                          ⭐ TOTAL {curr} ({items.length} {items.length === 1 ? 'movimiento' : 'movimientos'})
                        </td>
                        <td className="py-3 px-4 text-right text-slate-900 dark:text-white font-black">{formatCurrency(totalVenta, curr)}</td>
                        <td className="py-3 px-4 text-right text-emerald-600 dark:text-emerald-400">{formatCurrency(totalComision, curr)}</td>
                        <td className="py-3 px-4 text-right text-rose-600 dark:text-rose-400">{formatCurrency(totalPremios, curr)}</td>
                        <td className={`py-3 px-4 text-right font-black ${totalNeto >= 0 ? 'text-slate-900 dark:text-white' : 'text-rose-600 dark:text-rose-400'}`}>
                          {formatCurrency(totalNeto, curr)}
                        </td>
                        <td className={`py-3 px-4 text-right font-black ${totalUtilOp >= 0 ? 'text-cyan-600 dark:text-cyan-400' : 'text-rose-600 dark:text-rose-400'}`}>
                          {formatCurrency(totalUtilOp, curr)}
                        </td>
                        <td className={`py-3 px-4 text-right font-black ${totalUtilAg >= 0 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400'}`}>
                          {formatCurrency(totalUtilAg, curr)}
                        </td>
                        <td className="py-3 px-4 text-center text-slate-400 dark:text-slate-500">—</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default SalesEntryTab;
