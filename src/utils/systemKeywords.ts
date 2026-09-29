import { supabase } from '../lib/supabase';

export interface SystemKeywordConfig {
  venta: string;
  premio: string;
  agencia?: string;
}

export type SystemKeywordsMap = Record<string, SystemKeywordConfig>;

export const DEFAULT_SYSTEM_KEYWORDS: SystemKeywordsMap = {
  KENO: {
    venta: 'Total accepted',
    premio: 'Total paid',
    agencia: 'Agent',
  },
  BETM3: {
    venta: 'Venta',
    premio: 'Premio',
    agencia: 'Nombre',
  },
  GATOWEB: {
    venta: 'VENTAS',
    premio: 'PREMIOS',
    agencia: 'USUARIO',
  },
};

/**
 * Loads system keyword mapping merging defaults, local cache and Supabase cloud sync
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
  }

  return { ...DEFAULT_SYSTEM_KEYWORDS, ...parsedLocal, ...cloudMap };
}

/**
 * Saves system keyword mapping both to localStorage and Supabase profile metadata
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
  }
}
