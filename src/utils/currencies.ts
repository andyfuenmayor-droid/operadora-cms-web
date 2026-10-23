import { supabase } from '../lib/supabase';

export interface CurrencyConfig {
  id?: number;
  codigo: string;
  nombre: string;
  simbolo: string;
  decimales: number;
  es_default?: boolean;
}

export const DEFAULT_CURRENCIES: CurrencyConfig[] = [
  { id: 1, codigo: 'BS', nombre: 'Bolívares', simbolo: 'Bs.', decimales: 2, es_default: true },
  { id: 2, codigo: 'USD', nombre: 'Dólares', simbolo: '$', decimales: 2, es_default: true },
  { id: 3, codigo: 'COP', nombre: 'Pesos Colombianos', simbolo: 'COP$', decimales: 0, es_default: true },
];

/**
 * Normaliza cualquier valor de divisa soportando alias comunes y respetando códigos dinámicos
 */
export function normalizeCurrency(mVal?: string | null): string {
  if (!mVal) return 'BS';
  const clean = String(mVal).trim().toUpperCase();
  if (['BS', 'VES', 'BOLIVARES', 'BOLÍVARES', 'BS.'].includes(clean)) return 'BS';
  if (['USD', 'DOLARES', 'DÓLARES', 'US$', '$'].includes(clean)) return 'USD';
  if (['COP', 'PESOS', 'COL'].includes(clean)) return 'COP';
  return clean;
}

/**
 * Devuelve la bandera o ícono representativo de la divisa
 */
export function getCurrencyFlag(currency: string): string {
  const norm = normalizeCurrency(currency);
  if (norm === 'BS') return '🇻🇪';
  if (norm === 'USD') return '🇺🇸';
  if (norm === 'COP') return '🇨🇴';
  if (norm === 'EUR') return '🇪🇺';
  if (norm === 'USDT') return '₮';
  if (norm === 'BRL') return '🇧🇷';
  return '🌐';
}

/**
 * Clases de estilo Tailwind para badges de monedas
 */
export function getCurrencyBadgeClasses(currency: string): string {
  const norm = normalizeCurrency(currency);
  if (norm === 'BS') {
    return 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/20';
  }
  if (norm === 'USD') {
    return 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20';
  }
  if (norm === 'COP') {
    return 'bg-sky-50 dark:bg-sky-500/10 text-sky-700 dark:text-sky-400 border border-sky-200 dark:border-sky-500/20';
  }
  if (norm === 'EUR') {
    return 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-500/20';
  }
  if (norm === 'USDT') {
    return 'bg-teal-50 dark:bg-teal-500/10 text-teal-700 dark:text-teal-400 border border-teal-200 dark:border-teal-500/20';
  }
  return 'bg-purple-50 dark:bg-purple-500/10 text-purple-700 dark:text-purple-400 border border-purple-200 dark:border-purple-500/20';
}

/**
 * Carga la lista completa de monedas activas desde Supabase con fallback a las predeterminadas
 */
export async function loadCurrencies(userId?: string): Promise<CurrencyConfig[]> {
  const mergedMap = new Map<string, CurrencyConfig>();

  // 1. Agregar monedas base por defecto
  DEFAULT_CURRENCIES.forEach((c) => mergedMap.set(c.codigo, { ...c }));

  // 2. Si no hay userId, devolver las predeterminadas
  if (!userId) {
    return Array.from(mergedMap.values());
  }

  try {
    const { data, error } = await supabase
      .from('monedas')
      .select('*')
      .eq('user_id', userId)
      .order('id', { ascending: true });

    if (!error && Array.isArray(data)) {
      data.forEach((row: any) => {
        const rawCode = String(row.Nombre_Moneda || row.nombre_moneda || row.moneda || '').trim().toUpperCase();
        if (!rawCode) return;
        const normCode = normalizeCurrency(rawCode);
        const existing = mergedMap.get(normCode);

        mergedMap.set(normCode, {
          id: row.id || existing?.id,
          codigo: normCode,
          nombre: existing?.nombre || rawCode,
          simbolo: String(row.Simbolo || row.simbolo || existing?.simbolo || normCode).trim(),
          decimales: existing?.decimales ?? (normCode === 'COP' ? 0 : 2),
          es_default: Boolean(existing?.es_default),
        });
      });
    }
  } catch (e) {
    console.warn('Error loading dynamic currencies from database:', e);
  }

  return Array.from(mergedMap.values());
}
