import { supabase } from '../lib/supabase';
import type { Grupo } from '../types';
import type { CurrencyConfig } from './currencies';

/**
 * Persiste el catálogo de grupos de un suscriptor SaaS tanto en LocalStorage
 * como en Supabase config_sistema (parametro = 'catalogo_grupos').
 */
export async function saveSaaSGroups(userId: string, updatedList: Grupo[]): Promise<void> {
  const localKey = userId ? `operadora_catalogo_grupos_${userId}` : 'operadora_catalogo_grupos_default';
  try {
    localStorage.setItem(localKey, JSON.stringify(updatedList));
    localStorage.setItem('operadora_catalogo_grupos_backup', JSON.stringify(updatedList));
    localStorage.setItem(`cms_grupos_${userId}`, JSON.stringify(updatedList));
  } catch (e) {
    console.warn('Error guardando grupos en localStorage:', e);
  }

  if (userId) {
    try {
      const { error: upErr } = await supabase.from('config_sistema').upsert(
        {
          user_id: userId,
          parametro: 'catalogo_grupos',
          valor: JSON.stringify(updatedList),
        },
        { onConflict: 'user_id,parametro' }
      );

      if (upErr) {
        const { data: existing } = await supabase
          .from('config_sistema')
          .select('parametro')
          .eq('user_id', userId)
          .eq('parametro', 'catalogo_grupos')
          .maybeSingle();

        if (existing) {
          await supabase
            .from('config_sistema')
            .update({ valor: JSON.stringify(updatedList) })
            .eq('user_id', userId)
            .eq('parametro', 'catalogo_grupos');
        } else {
          await supabase
            .from('config_sistema')
            .insert({
              user_id: userId,
              parametro: 'catalogo_grupos',
              valor: JSON.stringify(updatedList),
            });
        }
      }
    } catch (dbErr) {
      console.warn('Excepción guardando catalogo_grupos en config_sistema:', dbErr);
    }
  }
}

/**
 * Carga el catálogo de grupos de forma robusta e independiente de la tabla física 'grupos'.
 * Garantiza que las monedas asignadas correspondan ESTRICTAMENTE a las monedas habilitadas del SaaS.
 */
export async function loadSaaSGroups(userId: string, activeCurrencies?: CurrencyConfig[]): Promise<Grupo[]> {
  const localKey = userId ? `operadora_catalogo_grupos_${userId}` : 'operadora_catalogo_grupos_default';
  let loaded: Grupo[] = [];

  // 1. Cargar desde config_sistema
  if (userId) {
    try {
      const { data: cfgRow, error: cfgErr } = await supabase
        .from('config_sistema')
        .select('valor')
        .eq('user_id', userId)
        .eq('parametro', 'catalogo_grupos')
        .maybeSingle();

      if (!cfgErr && cfgRow?.valor) {
        const parsed = JSON.parse(cfgRow.valor);
        if (Array.isArray(parsed) && parsed.length > 0) {
          loaded = parsed;
          localStorage.setItem(localKey, JSON.stringify(parsed));
          localStorage.setItem(`cms_grupos_${userId}`, JSON.stringify(parsed));
        }
      }
    } catch (e) {
      console.warn('Error leyendo catalogo_grupos de config_sistema:', e);
    }
  }

  // 2. Si la nube no devolvió datos, recuperar de localStorage
  if (loaded.length === 0) {
    try {
      const cached =
        localStorage.getItem(localKey) ||
        localStorage.getItem('operadora_catalogo_grupos_backup') ||
        localStorage.getItem(`cms_grupos_${userId}`);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          loaded = parsed;
          if (userId) {
            saveSaaSGroups(userId, parsed).catch(() => {});
          }
        }
      }
    } catch (e) {
      console.warn('Error leyendo catalogo_grupos de localStorage:', e);
    }
  }

  // 3. Fallback adicional si tabla física grupos existe
  if (loaded.length === 0 && userId) {
    try {
      const { data: tblData, error: tblErr } = await supabase
        .from('grupos')
        .select('*')
        .eq('user_id', userId)
        .order('nombre_grupo', { ascending: true });
      if (!tblErr && Array.isArray(tblData) && tblData.length > 0) {
        loaded = tblData;
        localStorage.setItem(localKey, JSON.stringify(tblData));
      }
    } catch (_) {}
  }

  // 4. Determinar monedas válidas para este SaaS
  const validCodes =
    activeCurrencies && activeCurrencies.length > 0
      ? activeCurrencies.map((c) => c.codigo)
      : ['BS', 'USD'];

  // 5. Si el catálogo está vacío, auto-recuperar BONANZA con las monedas válidas del SaaS
  if (loaded.length === 0 && userId) {
    const recoveredBonanza: Grupo = {
      id: Date.now(),
      user_id: userId,
      nombre_grupo: 'BONANZA',
      codigo: 'BNZ',
      responsable: 'Administrador',
      telefono: '',
      monedas: validCodes.join(','),
      comision_pct_default: 15,
      participacion_pct_default: 30,
      condiciones_sistemas: '{}',
      saldo_inicial_bs: 0,
      saldo_inicial_usd: 0,
      saldo_inicial_cop: 0,
      saldos_iniciales_json: JSON.stringify(Object.fromEntries(validCodes.map((c) => [c, 0]))),
      activo: true,
      agencias_ids: [],
    };
    loaded = [recoveredBonanza];
    saveSaaSGroups(userId, loaded).catch(() => {});
  } else {
    // Sanitizar monedas en grupos existentes: remover COP u otras si no están en validCodes
    let needsResave = false;
    loaded = loaded.map((grp) => {
      const existingMons = grp.monedas
        ? grp.monedas.split(',').map((m) => m.trim().toUpperCase()).filter(Boolean)
        : [];
      const sanitizedMons = existingMons.filter((m) => validCodes.includes(m));
      const finalMons = sanitizedMons.length > 0 ? sanitizedMons : validCodes;
      const finalStr = finalMons.join(',');
      if (grp.monedas !== finalStr) {
        needsResave = true;
      }
      return {
        ...grp,
        monedas: finalStr,
      };
    });
    if (needsResave && userId) {
      saveSaaSGroups(userId, loaded).catch(() => {});
    }
  }

  return loaded;
}
