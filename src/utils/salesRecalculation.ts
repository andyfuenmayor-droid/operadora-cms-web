import { supabase } from '../lib/supabase';
import { cleanAgencyName, normalizarMoneda } from './formatters';
import type { Agency } from '../types';

export interface RecalculationResult {
  updatedCount: number;
  details: string[];
}

export function parseAgencyCondiciones(ag: Agency | any): Record<string, any> {
  if (!ag || !ag.condiciones_sistemas) return {};
  try {
    return typeof ag.condiciones_sistemas === 'string'
      ? JSON.parse(ag.condiciones_sistemas)
      : ag.condiciones_sistemas;
  } catch (e) {
    console.error('Error parsing condiciones_sistemas', e);
    return {};
  }
}

/**
 * Extracts commission and participation % for a specific system and currency
 * from an agency's configured conditions or defaults.
 */
export function getAgencyCommissionAndParticipation(
  ag: Agency | any,
  sistema: string,
  moneda: string
): { comPct: number; partPct: number; codigo?: string } {
  let comPct = Number(ag?.comision ?? 10);
  let partPct = Number(ag?.participacion_ag ?? 0);
  let codigo: string | undefined;

  const cond = parseAgencyCondiciones(ag);
  const sysUpper = String(sistema || '').trim().toUpperCase();
  const monUpper = normalizarMoneda(moneda);

  // Look for exact combo key: SISTEMA_MONEDA (e.g. BETM3_BS)
  const comboKey = `${sysUpper}_${monUpper}`;
  const entry = cond[comboKey] || cond[sysUpper];

  if (entry) {
    if (entry.comision !== undefined && entry.comision !== null && entry.comision !== '') {
      comPct = Number(entry.comision);
    }
    if (entry.participacion !== undefined && entry.participacion !== null && entry.participacion !== '') {
      partPct = Number(entry.participacion);
    }
    if (entry.codigo) {
      codigo = String(entry.codigo).trim();
    }
  }

  return { comPct, partPct, codigo };
}

/**
 * Recalculates all active sales in `carga_actual` for a specific agency.
 */
export async function recalculateAgencySales(
  effectiveUserId: string,
  agency: Agency | any
): Promise<RecalculationResult> {
  if (!effectiveUserId || !agency) return { updatedCount: 0, details: [] };

  const { data: sales, error } = await supabase
    .from('carga_actual')
    .select('*')
    .eq('user_id', effectiveUserId);

  if (error || !sales || sales.length === 0) {
    return { updatedCount: 0, details: [] };
  }

  const cleanNom = cleanAgencyName(agency.nombre_agencia);
  const cond = parseAgencyCondiciones(agency);
  const agencyCodigos = Object.values(cond)
    .map((c: any) => (c?.codigo ? String(c.codigo).trim().toUpperCase() : null))
    .filter(Boolean) as string[];

  // Find sales belonging to this agency by agency name or aliases
  const matchingSales = sales.filter((s) => {
    const sAgClean = cleanAgencyName(s.agencia);
    if (sAgClean === cleanNom) return true;
    const sAgUpper = String(s.agencia || '').trim().toUpperCase();
    if (sAgUpper === String(agency.nombre_agencia || '').trim().toUpperCase()) return true;
    if (agencyCodigos.includes(sAgUpper)) return true;
    return false;
  });

  if (matchingSales.length === 0) {
    return { updatedCount: 0, details: [] };
  }

  let updatedCount = 0;
  const details: string[] = [];

  for (const s of matchingSales) {
    const mon = normalizarMoneda(s.moneda);
    const { comPct, partPct } = getAgencyCommissionAndParticipation(agency, s.sistema, mon);

    const venta = Number(s.venta || 0);
    const premios = Number(s.premios || 0);

    const comision = Math.round(venta * (comPct / 100) * 100) / 100;
    const neto = Math.round((venta - comision - premios) * 100) / 100;
    const utilAg = Math.round(neto * (partPct / 100) * 100) / 100;
    const utilOp = Math.round((neto - utilAg) * 100) / 100;

    const { error: upErr } = await supabase
      .from('carga_actual')
      .update({
        comision,
        neto,
        util_ag: utilAg,
        util_op: utilOp,
      })
      .eq('id', s.id)
      .eq('user_id', effectiveUserId);

    if (!upErr) {
      updatedCount++;
      details.push(
        `${agency.nombre_agencia} (${s.sistema} ${mon}): Com ${comPct}%, Part ${partPct}% -> Util Ag: ${utilAg}, Util Op: ${utilOp}`
      );
    }
  }

  return { updatedCount, details };
}

/**
 * Recalculates ALL active sales in `carga_actual` against all registered agencies.
 */
export async function recalculateAllCycleSales(
  effectiveUserId: string
): Promise<RecalculationResult> {
  if (!effectiveUserId) return { updatedCount: 0, details: [] };

  const [resAg, resSales] = await Promise.all([
    supabase.from('agencias').select('*').eq('user_id', effectiveUserId),
    supabase.from('carga_actual').select('*').eq('user_id', effectiveUserId),
  ]);

  const agencies: (Agency | any)[] = resAg.data || [];
  const sales = resSales.data || [];

  if (agencies.length === 0 || sales.length === 0) {
    return { updatedCount: 0, details: [] };
  }

  // Build lookup map by clean agency name and by system aliases
  const agencyMap = new Map<string, Agency>();
  const aliasMap = new Map<string, Agency>();

  agencies.forEach((ag) => {
    const cNom = cleanAgencyName(ag.nombre_agencia);
    agencyMap.set(cNom, ag);
    agencyMap.set(String(ag.nombre_agencia || '').trim().toUpperCase(), ag);

    const cond = parseAgencyCondiciones(ag);
    Object.values(cond).forEach((c: any) => {
      if (c?.codigo) {
        aliasMap.set(String(c.codigo).trim().toUpperCase(), ag);
      }
    });
  });

  let updatedCount = 0;
  const details: string[] = [];

  for (const s of sales) {
    const sAgUpper = String(s.agencia || '').trim().toUpperCase();
    const sAgClean = cleanAgencyName(s.agencia);

    const matchedAgency = aliasMap.get(sAgUpper) || agencyMap.get(sAgClean) || agencyMap.get(sAgUpper);
    if (!matchedAgency) continue;

    const mon = normalizarMoneda(s.moneda);
    const { comPct, partPct } = getAgencyCommissionAndParticipation(matchedAgency, s.sistema, mon);

    const venta = Number(s.venta || 0);
    const premios = Number(s.premios || 0);

    const comision = Math.round(venta * (comPct / 100) * 100) / 100;
    const neto = Math.round((venta - comision - premios) * 100) / 100;
    const utilAg = Math.round(neto * (partPct / 100) * 100) / 100;
    const utilOp = Math.round((neto - utilAg) * 100) / 100;

    const { error: upErr } = await supabase
      .from('carga_actual')
      .update({
        comision,
        neto,
        util_ag: utilAg,
        util_op: utilOp,
      })
      .eq('id', s.id)
      .eq('user_id', effectiveUserId);

    if (!upErr) {
      updatedCount++;
      details.push(
        `${matchedAgency.nombre_agencia} (${s.sistema} ${mon}): Com ${comPct}%, Part ${partPct}% -> Util Ag: ${utilAg}, Util Op: ${utilOp}`
      );
    }
  }

  return { updatedCount, details };
}
