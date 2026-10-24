import { supabase } from '../lib/supabase';
import type { BetSystem } from '../types';
import { loadSystemKeywords } from './systemKeywords';

/**
 * Fuente Única de Verdad (Single Source of Truth) para los sistemas / casas operadoras
 * habilitadas para un suscriptor SaaS específico (userId / effectiveUserId).
 *
 * Combina:
 * 1. Tabla 'sistemas' en Postgres (filtrada por user_id).
 * 2. Metadatos de configuración en perfil ('perfiles.direccion.system_keywords').
 * 3. Sistemas registrados en cargas de ventas ('carga_actual').
 *
 * Realiza auto-sincronización a la base de datos y memoria caché para que
 * TODOS los módulos (Agencias, Grupos, Ventas, Cierre) operen con la misma lista.
 */
export async function loadSaaSActiveSystems(userId?: string): Promise<BetSystem[]> {
  if (!userId) return [];

  const localKey = `cms_saas_systems_${userId}`;

  // 1. Intentar recuperación rápida de caché local
  let cachedList: BetSystem[] = [];
  try {
    const raw = localStorage.getItem(localKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        cachedList = parsed;
      }
    }
  } catch (_) {}

  try {
    // 2. Consultar en paralelo: tabla sistemas, palabras clave/config en perfil y ventas
    const [sysRes, keywordsMap, salesRes] = await Promise.all([
      supabase
        .from('sistemas')
        .select('*')
        .eq('user_id', userId)
        .order('nombre_sistema', { ascending: true }),
      loadSystemKeywords(userId),
      supabase
        .from('carga_actual')
        .select('sistema')
        .eq('user_id', userId),
    ]);

    let loadedSystems: BetSystem[] = sysRes.data || [];

    // 3. Recopilar todos los nombres de sistemas conocidos para este suscriptor
    const knownNamesSet = new Set<string>();

    // Desde la tabla SQL
    loadedSystems.forEach((s) => {
      if (s.nombre_sistema?.trim()) {
        knownNamesSet.add(s.nombre_sistema.trim().toUpperCase());
      }
    });

    // Desde keywords en perfil del SaaS
    if (keywordsMap && typeof keywordsMap === 'object') {
      Object.keys(keywordsMap).forEach((k) => {
        if (k && k.trim()) knownNamesSet.add(k.trim().toUpperCase());
      });
    }

    // Desde ventas del SaaS
    if (salesRes.data && Array.isArray(salesRes.data)) {
      salesRes.data.forEach((r: any) => {
        const sys = String(r.sistema || '').trim().toUpperCase();
        if (sys) knownNamesSet.add(sys);
      });
    }

    // 4. Si la tabla sistemas carece de alguno de los sistemas conocidos del SaaS, sincronizar
    const missingSystems = Array.from(knownNamesSet).filter(
      (name) => !loadedSystems.some((s) => s.nombre_sistema?.trim().toUpperCase() === name)
    );

    if (missingSystems.length > 0) {
      try {
        const toInsert = missingSystems.map((nombre_sistema) => ({
          nombre_sistema,
          user_id: userId,
        }));

        const { data: inserted, error: insErr } = await supabase
          .from('sistemas')
          .insert(toInsert)
          .select();

        if (!insErr && inserted && inserted.length > 0) {
          loadedSystems = [...loadedSystems, ...inserted];
        } else {
          // Si hay restricción RLS o falla de inserción, generar identificadores virtuales
          const synthetic: BetSystem[] = missingSystems.map((name, idx) => ({
            id: 2000 + idx,
            nombre_sistema: name,
            user_id: userId,
            comision_comercializador: keywordsMap?.[name]?.comision_comercializador ?? 0,
            participacion_comercializador: keywordsMap?.[name]?.participacion_comercializador ?? 0,
          }));
          loadedSystems = [...loadedSystems, ...synthetic];
        }
      } catch {
        const synthetic: BetSystem[] = missingSystems.map((name, idx) => ({
          id: 2000 + idx,
          nombre_sistema: name,
          user_id: userId,
          comision_comercializador: keywordsMap?.[name]?.comision_comercializador ?? 0,
          participacion_comercializador: keywordsMap?.[name]?.participacion_comercializador ?? 0,
        }));
        loadedSystems = [...loadedSystems, ...synthetic];
      }
    }

    // Ordenar alfabéticamente
    loadedSystems.sort((a, b) => (a.nombre_sistema || '').localeCompare(b.nombre_sistema || ''));

    // Guardar en caché local aislada para el suscriptor
    try {
      localStorage.setItem(localKey, JSON.stringify(loadedSystems));
    } catch (_) {}

    return loadedSystems;
  } catch (err) {
    console.warn('Error loading SaaS active systems, falling back to cache:', err);
    return cachedList;
  }
}
