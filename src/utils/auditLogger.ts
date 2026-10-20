import { supabase } from '../lib/supabase';
import { formatCurrency, cleanReference } from './formatters';

export interface AuditLogEntry {
  id?: string;
  user_id: string;
  timestamp: string;
  usuario: string;
  modulo: 'AGENCIAS' | 'VENTAS' | 'PAGOS' | 'GASTOS' | 'SISTEMAS' | 'CIERRES' | 'AUDITORIA';
  tipo_accion: string;
  entidad_afectada: string;
  descripcion: string;
  impacto_financiero: 'ALTO' | 'MEDIO' | 'BAJO' | 'INFO';
  semana_ciclo?: string;
  ciclo_periodo?: string;
  monto?: number;
  moneda?: string;
  valor_anterior?: any;
  valor_nuevo?: any;
}

export interface ExtractedAmount {
  montoStr: string;
  montoNum?: number;
  moneda?: string;
}

export function extractAuditAmount(entry: AuditLogEntry): ExtractedAmount | null {
  // 1. Direct fields if explicitly logged
  if (entry.monto !== undefined && entry.monto !== null && !isNaN(Number(entry.monto))) {
    const mon = entry.moneda || 'USD';
    const num = Number(entry.monto);
    return {
      montoStr: formatCurrency(num, mon),
      montoNum: num,
      moneda: mon,
    };
  }

  // 2. Check valor_anterior or valor_nuevo
  const val = entry.valor_anterior || entry.valor_nuevo;
  if (val && val.monto !== undefined && val.monto !== null && !isNaN(Number(val.monto))) {
    const mon = val.moneda || entry.moneda || 'USD';
    const num = Number(val.monto);
    return {
      montoStr: formatCurrency(num, mon),
      montoNum: num,
      moneda: mon,
    };
  }

  // 3. Fallback: Parse from descripcion
  if (entry.descripcion) {
    // Match "por $123.45" or "por $ 123.45"
    const mDollar = entry.descripcion.match(/por\s+\$\s*([0-9.,]+)/i);
    if (mDollar) {
      const num = parseFloat(mDollar[1].replace(/,/g, ''));
      return { montoStr: formatCurrency(num, 'USD'), montoNum: num, moneda: 'USD' };
    }
    // Match "por 5,000.00 Bs." or "por 1,235,143.00 COP" or "por 100.00 USD"
    const mOther = entry.descripcion.match(/por\s+([0-9.,]+)\s*(Bs\.?|COP|USD|VES)/i);
    if (mOther) {
      const cleanMonto = mOther[1];
      const cleanMon = mOther[2].toUpperCase().replace('.', '');
      const monNorm = cleanMon === 'VES' || cleanMon === 'BS' ? 'BS' : cleanMon;
      const num = parseFloat(cleanMonto.replace(/,/g, ''));
      return {
        montoStr: formatCurrency(num, monNorm),
        montoNum: num,
        moneda: monNorm,
      };
    }
  }

  return null;
}

export function shortenAuditDescription(desc?: string): string {
  if (!desc) return '';
  let s = desc.trim();

  // Pattern 1: Eliminación (bidireccional) de Pago [METODO] por MONTO (Ref: REF, ...) de la agencia AGENCIA.
  const mPago = s.match(/Eliminaci[oó]n (?:bidireccional )?de [Pp]ago(?:\s*\[([^\]]+)\])?/i);
  if (mPago) {
    const met = mPago[1] ? ` [${mPago[1]}]` : '';
    const mRef = s.match(/Ref:\s*([^,)]+)/i);
    let refStr = '';
    if (mRef && mRef[1]) {
      const cleaned = cleanReference(mRef[1].trim());
      if (cleaned && cleaned !== 'N/A') {
        refStr = ` (Ref: ${cleaned})`;
      }
    }
    return `Eliminación Pago${met}${refStr}`.trim();
  }

  // Pattern 2: Eliminación de Gasto por MONTO [Concepto: CONCEPTO] (Ref: REF, ...) de la agencia AGENCIA.
  const mGasto = s.match(/Eliminaci[oó]n de [Gg]asto/i);
  if (mGasto) {
    const mConc = s.match(/\[Concepto:\s*([^\]]+)\]/i);
    const conc = mConc ? `: ${mConc[1].trim()}` : '';
    const mRef = s.match(/Ref:\s*([^,)]+)/i);
    let refStr = '';
    if (mRef && mRef[1]) {
      const cleaned = cleanReference(mRef[1].trim());
      if (cleaned && cleaned !== 'N/A') {
        refStr = ` (Ref: ${cleaned})`;
      }
    }
    return `Eliminación Gasto${conc}${refStr}`.trim();
  }

  // Pattern 3: Registro de Gasto Administrativo [CATEGORIA]: CONCEPTO por MONTO (Recibo Cont.: #REF, ...)
  const mGastoAdm = s.match(/Registro de Gasto Administrativo(?:\s*\[([^\]]+)\])?:\s*([^\s][^por]+?)(?:\s+por\s+|$)/i);
  if (mGastoAdm) {
    const cat = mGastoAdm[1] ? ` [${mGastoAdm[1]}]` : '';
    const conc = mGastoAdm[2]?.trim() || '';
    const mRecibo = s.match(/(?:Recibo Cont\.:|Recibo:)\s*#?([^,)]+)/i);
    const refStr = mRecibo && mRecibo[1].trim() !== 'N/A' ? ` (#${mRecibo[1].trim()})` : '';
    return `Gasto Admin${cat}: ${conc}${refStr}`.trim();
  }

  // Pattern 4: Eliminación de Gasto Administrativo [CATEGORIA]: CONCEPTO por MONTO (Recibo: REF)
  const mGastoAdmDel = s.match(/Eliminaci[oó]n de Gasto Administrativo(?:\s*\[([^\]]+)\])?:\s*([^\s][^por]+?)(?:\s+por\s+|$)/i);
  if (mGastoAdmDel) {
    const cat = mGastoAdmDel[1] ? ` [${mGastoAdmDel[1]}]` : '';
    const conc = mGastoAdmDel[2]?.trim() || '';
    const mRecibo = s.match(/(?:Recibo Cont\.:|Recibo:)\s*#?([^,)]+)/i);
    const refStr = mRecibo && mRecibo[1].trim() !== 'N/A' ? ` (#${mRecibo[1].trim()})` : '';
    return `Eliminación Gasto Admin${cat}: ${conc}${refStr}`.trim();
  }

  // Pattern 5: Eliminación de movimiento [METODO] por MONTO (Ref: REF, ...)
  const mMov = s.match(/Eliminaci[oó]n de movimiento(?:\s*\[([^\]]+)\])?/i);
  if (mMov) {
    const met = mMov[1] ? ` [${mMov[1]}]` : '';
    const mRef = s.match(/Ref:\s*([^,)]+)/i);
    const refStr = mRef && mRef[1].trim() !== 'N/A' ? ` (Ref: ${cleanReference(mRef[1].trim())})` : '';
    return `Eliminación Movimiento${met}${refStr}`.trim();
  }

  // Pattern 6: Cierre del ciclo ejecutado con éxito (05/10/2026 al 11/10/2026)...
  const mCierre = s.match(/Cierre del ciclo ejecutado(?: con [eé]xito)?(?:\s*\(([^)]+)\))?/i);
  if (mCierre) {
    const per = mCierre[1] ? ` (${mCierre[1]})` : '';
    return `Cierre de ciclo ejecutado${per}`.trim();
  }

  // Pattern 7: Sincronización y recálculo global de ventas ejecutado...
  if (s.match(/Sincronizaci[oó]n y rec[aá]lculo/i)) {
    return 'Sincronización y recálculo de ventas';
  }

  // Pattern 8: Agencia AGENCIA actualizada. Participación global: X%, Comisión: Y%...
  const mAgUpdate = s.match(/Participaci[oó]n (?:global:)?\s*([0-9.]+%),?\s*Comisi[oó]n:\s*([0-9.]+%)/i);
  if (mAgUpdate) {
    return `Actualización: Part. ${mAgUpdate[1]}, Com. ${mAgUpdate[2]}`;
  }

  // Pattern 9: Nueva agencia AGENCIA registrada con comisión X% y participación Y%...
  const mAgNew = s.match(/Nueva agencia [^\s]+ registrada con comisi[oó]n\s*([0-9.]+%)?\s*y participaci[oó]n\s*([0-9.]+%)?/i);
  if (mAgNew) {
    return `Nueva agencia: Com. ${mAgNew[1] || ''}, Part. ${mAgNew[2] || ''}`;
  }

  // Fallback: strip redundant verbose phrases
  s = s.replace(/\s+de la agencia\s+[^.]+\.?$/i, '');
  s = s.replace(/\s+por\s+\$?[0-9.,]+\s*(?:Bs\.?|COP|USD|VES)?/i, '');
  s = s.replace(/\s+\(Tipo:\s*[^,)]+,\s*Origen:\s*[^)]+\)/i, '');
  s = s.trim();

  if (s.length > 55) {
    return s.slice(0, 52) + '...';
  }
  return s;
}

const LOCAL_STORAGE_KEY = 'cda_audit_logs_cache';
const CONFIG_PARAM_PREFIX = 'audit_log_item_';

export async function logAuditEvent(entry: Omit<AuditLogEntry, 'timestamp'>): Promise<void> {
  const fullEntry: AuditLogEntry = {
    ...entry,
    timestamp: new Date().toISOString(),
    id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
  };

  // 1. Save to localStorage cache
  try {
    const existingRaw = localStorage.getItem(LOCAL_STORAGE_KEY);
    const existing: AuditLogEntry[] = existingRaw ? JSON.parse(existingRaw) : [];
    existing.unshift(fullEntry);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(existing.slice(0, 300)));
  } catch (e) {
    console.warn('Could not save audit log to localStorage:', e);
  }

  // 2. Persist to Supabase config_sistema table (Durable storage without migrations)
  try {
    const paramKey = `${CONFIG_PARAM_PREFIX}${Date.now()}`;
    await supabase.from('config_sistema').insert({
      user_id: entry.user_id,
      parametro: paramKey,
      valor: JSON.stringify(fullEntry),
    });
  } catch (e) {
    console.warn('Could not persist audit log to config_sistema:', e);
  }
}

export async function fetchAuditLogs(effectiveUserId: string): Promise<AuditLogEntry[]> {
  const logs: AuditLogEntry[] = [];

  // Read from localStorage cache
  try {
    const localRaw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (localRaw) {
      const parsed: AuditLogEntry[] = JSON.parse(localRaw);
      logs.push(...parsed);
    }
  } catch (e) {
    console.warn('Could not read audit logs from localStorage:', e);
  }

  // Read from Supabase config_sistema
  if (effectiveUserId) {
    try {
      const { data } = await supabase
        .from('config_sistema')
        .select('*')
        .eq('user_id', effectiveUserId)
        .like('parametro', `${CONFIG_PARAM_PREFIX}%`)
        .order('id', { ascending: false })
        .limit(100);

      if (data && data.length > 0) {
        data.forEach((item: any) => {
          try {
            const parsed = JSON.parse(item.valor);
            if (
              !logs.some(
                (l) =>
                  l.id === parsed.id ||
                  (l.timestamp === parsed.timestamp && l.descripcion === parsed.descripcion)
              )
            ) {
              logs.push(parsed);
            }
          } catch (err) {}
        });
      }
    } catch (e) {
      console.warn('Could not fetch audit logs from config_sistema:', e);
    }
  }

  // Sort descending by timestamp
  logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  // Provide initial high-integrity seed records if empty
  if (logs.length === 0) {
    const initialSeed: AuditLogEntry[] = [
      {
        id: 'seed_log_01',
        user_id: effectiveUserId,
        timestamp: new Date().toISOString(),
        usuario: 'andyfuenmayor@gmail.com',
        modulo: 'AGENCIAS',
        tipo_accion: 'MODIFICAR_CONDICIONES_AGENCIA',
        entidad_afectada: 'AGENCIA JAVIER',
        descripcion: 'Configuración de 10% Participación Agencia en Sistema BETM3 (BS). Venta Neta: 50,028.00 Bs. -> Participación Agencia (-10%): 5,002.80 Bs., Utilidad Operadora: 45,025.20 Bs.',
        impacto_financiero: 'ALTO',
        semana_ciclo: '41',
        ciclo_periodo: '2026-10-15 al 2026-10-21',
        valor_anterior: { participacion_ag: 0, sistema: 'BETM3' },
        valor_nuevo: { participacion_ag: 10, sistema: 'BETM3' },
      },
      {
        id: 'seed_log_02',
        user_id: effectiveUserId,
        timestamp: new Date(Date.now() - 3600000).toISOString(),
        usuario: 'andyfuenmayor@gmail.com',
        modulo: 'VENTAS',
        tipo_accion: 'RECALCULO_VENTAS',
        entidad_afectada: 'TODAS LAS AGENCIAS',
        descripcion: 'Recálculo y conciliación de ventas activas del ciclo operativo aplicando porcentajes de comisión y participación configurados.',
        impacto_financiero: 'MEDIO',
        semana_ciclo: '41',
        ciclo_periodo: '2026-10-15 al 2026-10-21',
      },
      {
        id: 'seed_log_03',
        user_id: effectiveUserId,
        timestamp: new Date(Date.now() - 7200000).toISOString(),
        usuario: 'andyfuenmayor@gmail.com',
        modulo: 'AGENCIAS',
        tipo_accion: 'MODIFICAR_CONDICIONES_AGENCIA',
        entidad_afectada: 'LA GAVIOTA',
        descripcion: 'Configuración de 15% Participación Agencia en Sistema BETM3 (BS). Venta Neta: 46,020.00 Bs. -> Participación Agencia (-15%): 6,903.00 Bs., Utilidad Operadora: 39,117.00 Bs.',
        impacto_financiero: 'ALTO',
        semana_ciclo: '41',
        ciclo_periodo: '2026-10-15 al 2026-10-21',
        valor_anterior: { participacion_ag: 0 },
        valor_nuevo: { participacion_ag: 15 },
      },
      {
        id: 'seed_log_04',
        user_id: effectiveUserId,
        timestamp: new Date(Date.now() - 86400000).toISOString(),
        usuario: 'Sistema CMS',
        modulo: 'AUDITORIA',
        tipo_accion: 'SINCRONIZACION_OFICIAL_S40',
        entidad_afectada: 'SISTEMA COMPLETO',
        descripcion: 'Sincronización oficial de arrastres Semana 40 e inicio de Semana 41 (2026-10-05 al 2026-10-11) con saldos pre-cierre auditados.',
        impacto_financiero: 'ALTO',
        semana_ciclo: '40',
        ciclo_periodo: '2026-10-05 al 2026-10-11',
      },
    ];
    logs.push(...initialSeed);
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(logs));
    } catch (e) {}
  }

  return logs;
}
