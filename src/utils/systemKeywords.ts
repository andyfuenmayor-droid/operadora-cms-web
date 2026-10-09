import { supabase } from '../lib/supabase';

export interface SystemKeywordConfig {
  venta: string;
  premio: string;
  agencia?: string;
  comision_comercializador?: number;
  participacion_comercializador?: number;
  saldo_inicial_bs?: number;
  saldo_inicial_usd?: number;
  saldo_inicial_cop?: number;
}

export type SystemKeywordsMap = Record<string, SystemKeywordConfig>;

export const DEFAULT_SYSTEM_KEYWORDS: SystemKeywordsMap = {
  KENO: {
    venta: 'Total accepted',
    premio: 'Total paid',
    agencia: 'Agent',
    comision_comercializador: 0,
    participacion_comercializador: 0,
    saldo_inicial_bs: 0,
    saldo_inicial_usd: 0,
    saldo_inicial_cop: 0,
  },
  BETM3: {
    venta: 'Venta',
    premio: 'Premio',
    agencia: 'Nombre',
    comision_comercializador: 0,
    participacion_comercializador: 0,
    saldo_inicial_bs: 0,
    saldo_inicial_usd: 0,
    saldo_inicial_cop: 0,
  },
  GATOWEB: {
    venta: 'VENTAS',
    premio: 'PREMIOS',
    agencia: 'USUARIO',
    comision_comercializador: 0,
    participacion_comercializador: 0,
    saldo_inicial_bs: 0,
    saldo_inicial_usd: 0,
    saldo_inicial_cop: 0,
  },
};

/**
 * Loads system keyword mapping merging defaults, local cache, Supabase cloud sync and proveedores table
 */
export async function loadSystemKeywords(userId?: string): Promise<SystemKeywordsMap> {
  let parsedLocal: SystemKeywordsMap = {};
  if (typeof window !== 'undefined' && userId) {
    try {
      const saved = localStorage.getItem(`cms_sys_keywords_${userId}`);
      if (saved) parsedLocal = JSON.parse(saved);
    } catch (_) {}
  }

  let cloudMap: SystemKeywordsMap = {};
  if (userId) {
    try {
      const { data } = await supabase.from('perfiles').select('direccion').eq('id', userId).single();
      if (data?.direccion) {
        const parsed = JSON.parse(data.direccion);
        if (parsed && typeof parsed === 'object') {
          cloudMap = parsed.system_keywords || parsed;
        }
      }
    } catch (_) {}

    // Check proveedores table for initial balances
    try {
      const { data: provList } = await supabase.from('proveedores').select('*').eq('user_id', userId);
      if (provList && provList.length > 0) {
        provList.forEach((p: any) => {
          const sysName = String(p.nombre_sistema || '').toUpperCase();
          if (sysName) {
            cloudMap[sysName] = {
              ...(cloudMap[sysName] || { venta: 'Venta', premio: 'Premio', agencia: 'Agencia' }),
              saldo_inicial_bs: Number(p.saldo_inicial_bs ?? cloudMap[sysName]?.saldo_inicial_bs ?? 0),
              saldo_inicial_usd: Number(p.saldo_inicial_usd ?? cloudMap[sysName]?.saldo_inicial_usd ?? 0),
              saldo_inicial_cop: Number(p.saldo_inicial_cop ?? cloudMap[sysName]?.saldo_inicial_cop ?? 0),
            };
          }
        });
      }
    } catch (_) {}
  }

  return { ...DEFAULT_SYSTEM_KEYWORDS, ...parsedLocal, ...cloudMap };
}

/**
 * Saves system keyword mapping both to localStorage, Supabase profile metadata, and proveedores table
 */
export async function saveSystemKeywords(userId: string, keywords: SystemKeywordsMap): Promise<void> {
  if (typeof window !== 'undefined' && userId) {
    try {
      localStorage.setItem(`cms_sys_keywords_${userId}`, JSON.stringify(keywords));
    } catch (_) {}
  }

  if (userId) {
    try {
      await supabase
        .from('perfiles')
        .update({ direccion: JSON.stringify({ system_keywords: keywords }) })
        .eq('id', userId);
    } catch (e) {
      console.error('Error saving system keywords to cloud:', e);
    }

    // Sync saldos iniciales with proveedores table
    try {
      const entries = Object.entries(keywords);
      for (const [sysName, conf] of entries) {
        if (!sysName) continue;
        const upper = sysName.trim().toUpperCase();
        const { data: existing } = await supabase
          .from('proveedores')
          .select('id')
          .eq('user_id', userId)
          .eq('nombre_sistema', upper)
          .maybeSingle();

        const provPayload = {
          nombre_sistema: upper,
          saldo_inicial_bs: Number(conf.saldo_inicial_bs || 0),
          saldo_inicial_usd: Number(conf.saldo_inicial_usd || 0),
          saldo_inicial_cop: Number(conf.saldo_inicial_cop || 0),
          user_id: userId,
        };

        if (existing?.id) {
          await supabase.from('proveedores').update(provPayload).eq('id', existing.id);
        } else {
          await supabase.from('proveedores').insert(provPayload);
        }
      }
    } catch (e) {
      console.error('Error syncing proveedores saldos iniciales:', e);
    }
  }
}
