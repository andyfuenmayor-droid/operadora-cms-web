import { supabase } from '../lib/supabase';
import type { BetSystem, MasterSystem } from '../types';
import { loadSystemKeywords, saveSystemKeywords } from './systemKeywords';

export const DEFAULT_MASTER_SYSTEMS: MasterSystem[] = [
  { nombre_sistema: 'BETM3', col_agencia: 'Nombre', col_venta: 'Venta', col_premio: 'Premio', descripcion: 'Apuestas deportivas BetM3' },
  { nombre_sistema: 'KENO', col_agencia: 'Agent', col_venta: 'Total accepted', col_premio: 'Total paid', descripcion: 'Keno internacional' },
  { nombre_sistema: 'CDAPUESTAS', col_agencia: 'Agencia', col_venta: 'Venta', col_premio: 'Premio', descripcion: 'Loterías y jugadas CDA' },
  { nombre_sistema: 'GATOWEB', col_agencia: 'USUARIO', col_venta: 'VENTAS', col_premio: 'PREMIOS', descripcion: 'Plataforma GatoWeb' },
  { nombre_sistema: 'GATO PESOS', col_agencia: 'Agencia', col_venta: 'VENTA', col_premio: 'PREMIOS', descripcion: 'GatoWeb en Pesos Colombianos' },
  { nombre_sistema: 'HIPISMO', col_agencia: 'Agencia', col_venta: 'Ventas', col_premio: 'Premios', descripcion: 'Carreras hípicas nacionales e internacionales' },
  { nombre_sistema: 'PARLEY', col_agencia: 'Agencia', col_venta: 'Venta', col_premio: 'Premio', descripcion: 'Parley tradicional' },
  { nombre_sistema: 'LOTERIAS', col_agencia: 'Agencia', col_venta: 'Venta', col_premio: 'Premio', descripcion: 'Loterías de terminales' },
];

/**
 * Consulta el Catálogo Maestro Global de Sistemas (Tabla Padre en Supabase / Postgres)
 * con fallback instantáneo a DEFAULT_MASTER_SYSTEMS en caso de tabla aún no migrada
 */
export async function loadMasterSystems(): Promise<MasterSystem[]> {
  try {
    const { data, error } = await supabase
      .from('catalogo_sistemas_maestro')
      .select('*')
      .order('nombre_sistema', { ascending: true });

    if (!error && Array.isArray(data) && data.length > 0) {
      return data;
    }
  } catch (err) {
    console.warn('catalogo_sistemas_maestro query notice:', err);
  }
  return DEFAULT_MASTER_SYSTEMS;
}

/**
 * Retroalimenta la Tabla Padre Global cuando un SaaS crea un sistema nuevo que no existía
 */
export async function contributeMasterSystem(
  sys: { nombre_sistema: string; col_agencia?: string; col_venta?: string; col_premio?: string; descripcion?: string },
  userId?: string
): Promise<void> {
  const cleanName = sys.nombre_sistema?.trim().toUpperCase();
  if (!cleanName) return;

  try {
    await supabase.from('catalogo_sistemas_maestro').upsert(
      {
        nombre_sistema: cleanName,
        col_agencia: sys.col_agencia?.trim() || 'Agencia',
        col_venta: sys.col_venta?.trim() || 'Venta',
        col_premio: sys.col_premio?.trim() || 'Premio',
        descripcion: sys.descripcion || `Sistema ${cleanName}`,
        creado_por_user_id: userId || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'nombre_sistema' }
    );
  } catch (err) {
    console.warn('Could not contribute to catalogo_sistemas_maestro (non-fatal):', err);
  }
}

/**
 * Obtiene el conjunto de nombres de sistemas desactivados/ocultados por el suscriptor (user_id)
 * Persiste en config_sistema (parametro: 'sistemas_desactivados') y en system_keywords
 */
export async function getInactiveSystemsSet(userId?: string): Promise<Set<string>> {
  const inactiveSet = new Set<string>();
  if (!userId) return inactiveSet;

  // 1. Intentar desde config_sistema
  try {
    const { data } = await supabase
      .from('config_sistema')
      .select('valor')
      .eq('user_id', userId)
      .eq('parametro', 'sistemas_desactivados')
      .maybeSingle();

    if (data?.valor) {
      const list = JSON.parse(data.valor);
      if (Array.isArray(list)) {
        list.forEach((item: string) => {
          if (item) inactiveSet.add(String(item).trim().toUpperCase());
        });
      }
    }
  } catch (_) {}

  // 2. Verificar también en systemKeywords (si activo === false)
  try {
    const kwMap = await loadSystemKeywords(userId);
    if (kwMap && typeof kwMap === 'object') {
      Object.entries(kwMap).forEach(([name, conf]) => {
        if (conf && conf.activo === false) {
          inactiveSet.add(name.trim().toUpperCase());
        }
      });
    }
  } catch (_) {}

  return inactiveSet;
}

/**
 * Activa o Desactiva/Oculta un sistema para el suscriptor especificado (userId)
 * Aísla 100% el cambio por user_id y actualiza config_sistema, system_keywords y la tabla sistemas
 */
export async function toggleSystemActiveStatus(
  userId: string,
  sysName: string,
  active: boolean
): Promise<void> {
  const upper = sysName.trim().toUpperCase();
  if (!upper || !userId) return;

  // 1. Obtener lista actual de inactivos
  const currentSet = await getInactiveSystemsSet(userId);
  if (active) {
    currentSet.delete(upper);
  } else {
    currentSet.add(upper);
  }

  const inactiveList = Array.from(currentSet);

  // 2. Guardar lista en config_sistema
  try {
    await supabase.from('config_sistema').upsert(
      {
        user_id: userId,
        parametro: 'sistemas_desactivados',
        valor: JSON.stringify(inactiveList),
      },
      { onConflict: 'user_id,parametro' }
    );
  } catch (err) {
    console.warn('Error saving sistemas_desactivados to config_sistema:', err);
  }

  // 3. Actualizar systemKeywords con el flag activo
  try {
    const kwMap = await loadSystemKeywords(userId);
    const existing = kwMap[upper] || { venta: 'Venta', premio: 'Premio', agencia: 'Agencia' };
    kwMap[upper] = { ...existing, activo: active };
    await saveSystemKeywords(userId, kwMap);
  } catch (_) {}

  // 4. Intentar actualizar columna activo en la tabla sistemas si existe
  try {
    await supabase
      .from('sistemas')
      .update({ activo: active } as any)
      .eq('user_id', userId)
      .eq('nombre_sistema', upper);
  } catch (_) {}

  // 5. Limpiar caché local para reflejo inmediato
  try {
    localStorage.removeItem(`cms_saas_systems_${userId}`);
  } catch (_) {}
}

/**
 * Fuente Única de Verdad (Single Source of Truth) para los sistemas / casas operadoras
 * habilitadas para un suscriptor SaaS específico (userId / effectiveUserId).
 *
 * Por defecto filtra y devuelve ÚNICAMENTE los sistemas ACTIVOS (activo !== false).
 * Esto garantiza que ningún sistema oculto aparezca en Agencias, Grupos, Ventas, Cierre ni Taquilla.
 *
 * Para el panel de configuración (SystemsTab), use { includeInactive: true } o loadAllSaaSSystems.
 */
export async function loadSaaSActiveSystems(
  userId?: string,
  options?: { includeInactive?: boolean }
): Promise<BetSystem[]> {
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
    // 2. Consultar en paralelo: tabla sistemas, palabras clave, ventas e inactivos
    const [sysRes, keywordsMap, salesRes, inactiveSet] = await Promise.all([
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
      getInactiveSystemsSet(userId),
    ]);

    let loadedSystems: BetSystem[] = (sysRes.data || []).map((s: any) => {
      const nameUpper = String(s.nombre_sistema || '').trim().toUpperCase();
      const isInactive = inactiveSet.has(nameUpper) || s.activo === false || keywordsMap[nameUpper]?.activo === false;
      return {
        ...s,
        activo: !isInactive,
      };
    });

    // 3. Recopilar todos los nombres de sistemas conocidos para este suscriptor
    const knownNamesSet = new Set<string>();

    // Desde la tabla SQL
    loadedSystems.forEach((s) => {
      if (s.nombre_sistema?.trim()) {
        knownNamesSet.add(s.nombre_sistema.trim().toUpperCase());
      }
    });

    // Desde keywords en perfil del SaaS (solo si no están marcados como inactivos)
    if (keywordsMap && typeof keywordsMap === 'object') {
      Object.entries(keywordsMap).forEach(([k, conf]) => {
        if (k && k.trim()) {
          const upper = k.trim().toUpperCase();
          if (!inactiveSet.has(upper) && conf?.activo !== false) {
            knownNamesSet.add(upper);
          }
        }
      });
    }

    // Desde ventas del SaaS
    if (salesRes.data && Array.isArray(salesRes.data)) {
      salesRes.data.forEach((r: any) => {
        const sys = String(r.sistema || '').trim().toUpperCase();
        if (sys) knownNamesSet.add(sys);
      });
    }

    // 4. Si la tabla sistemas carece de alguno de los sistemas conocidos del SaaS (y NO está inactivo), sincronizar
    const missingSystems = Array.from(knownNamesSet).filter(
      (name) => !inactiveSet.has(name) && !loadedSystems.some((s) => s.nombre_sistema?.trim().toUpperCase() === name)
    );

    if (missingSystems.length > 0) {
      try {
        const toInsert = missingSystems.map((nombre_sistema) => ({
          nombre_sistema,
          user_id: userId,
          activo: true,
        }));

        const { data: inserted, error: insErr } = await supabase
          .from('sistemas')
          .insert(toInsert)
          .select();

        if (!insErr && inserted && inserted.length > 0) {
          const formatted = inserted.map((s: any) => ({ ...s, activo: true }));
          loadedSystems = [...loadedSystems, ...formatted];
        } else {
          const synthetic: BetSystem[] = missingSystems.map((name, idx) => ({
            id: 2000 + idx,
            nombre_sistema: name,
            user_id: userId,
            comision_comercializador: keywordsMap?.[name]?.comision_comercializador ?? 0,
            participacion_comercializador: keywordsMap?.[name]?.participacion_comercializador ?? 0,
            activo: true,
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
          activo: true,
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

    // Si se solicita includeInactive, devolver todos con su propiedad activo
    if (options?.includeInactive) {
      return loadedSystems;
    }

    // Por defecto, devolver ÚNICAMENTE los sistemas activos
    const activeOnly = loadedSystems.filter((s) => s.activo !== false);
    return activeOnly.length > 0 ? activeOnly : loadedSystems;
  } catch (err) {
    console.warn('Error loading SaaS active systems, falling back to cache:', err);
    if (options?.includeInactive) {
      return cachedList;
    }
    return cachedList.filter((s) => s.activo !== false);
  }
}

/**
 * Carga TODOS los sistemas del suscriptor (tanto activos como ocultos/inactivos)
 * Diseñado específicamente para el panel de administración de Sistemas (SystemsTab)
 */
export async function loadAllSaaSSystems(userId?: string): Promise<BetSystem[]> {
  return loadSaaSActiveSystems(userId, { includeInactive: true });
}
