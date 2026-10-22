import type { SystemKeywordsMap } from './systemKeywords.ts';

/**
 * Balances Oficiales Auditados de la Semana 40 (2026-09-28 al 2026-10-04)
 * Extraídos directamente del Acta Oficial de Entrega, Arqueo y Recepción de Fondos
 * y Pre-Cierre Oficial de Operadoras de Corporación Calendario, CA.
 */
export const AUDITED_SEMANA_40_BALANCES: Record<string, { bs: number; usd: number; cop: number }> = {
  'JYY': { bs: 990.00, usd: 0.00, cop: 0.00 },
  'CHUCHO': { bs: 11503.20, usd: 0.00, cop: 0.00 },
  'CENTRO GUAJIRO': { bs: 0.00, usd: 0.00, cop: 0.00 },
  'EL FUTURO': { bs: 0.00, usd: -2.30, cop: 0.00 },
  'EDUARDO 1': { bs: 0.00, usd: 0.00, cop: 0.00 },
  'TERMINAL 1': { bs: 0.00, usd: 0.00, cop: 0.00 },
  'LA GAVIOTA': { bs: 0.00, usd: 0.00, cop: 0.00 },
  'EL CUJI': { bs: -50.00, usd: 0.00, cop: 0.00 },
  'YERITZA': { bs: 0.00, usd: 0.00, cop: 0.00 },
  'WENDYS': { bs: 0.00, usd: 0.00, cop: 972070.00 },
  'AG NUEVA LUCHA': { bs: 68708.62, usd: 5.24, cop: 0.00 },
  'LAS VIVIENDAS': { bs: 8014.00, usd: 0.00, cop: 0.00 },
  'EL 40': { bs: 7713.10, usd: 0.00, cop: 0.00 },
  'MAXIMA CDA 02 T2': { bs: 0.00, usd: 0.00, cop: 0.00 },
  'AGENCIA JAVIER': { bs: 0.00, usd: 123.00, cop: 0.00 },
  'AG ORLANDO': { bs: 0.00, usd: 0.00, cop: 0.00 },
};

export const AUDITED_SEMANA_40_OPERATORS: SystemKeywordsMap = {
  KENO: {
    venta: 'Total accepted',
    premio: 'Total paid',
    agencia: 'Agencia',
    comision_comercializador: 0,
    participacion_comercializador: 88,
    saldo_inicial_bs: 0,
    saldo_inicial_usd: 0,
    saldo_inicial_cop: 246650.04,
  },
  BETM3: {
    venta: 'Venta',
    premio: 'Premio',
    agencia: 'Nombre',
    comision_comercializador: 16,
    participacion_comercializador: 40,
    saldo_inicial_bs: 188032.95,
    saldo_inicial_usd: -113.73,
    saldo_inicial_cop: 7664154.93,
  },
  GATOWEB: {
    venta: 'VENTAS',
    premio: 'PREMIOS',
    agencia: 'USUARIO',
    saldo_inicial_bs: 26381.25,
    saldo_inicial_usd: 0,
    saldo_inicial_cop: 561437.50,
  },
  CDAPUESTAS: {
    venta: 'Venta',
    premio: 'Premio',
    agencia: 'Agencias',
    comision_comercializador: 0,
    participacion_comercializador: 0,
    saldo_inicial_bs: 0,
    saldo_inicial_usd: 200.00,
    saldo_inicial_cop: 0,
  },
  'GATO PESOS': {
    venta: 'VENTA',
    premio: 'PREMIOS',
    agencia: 'MAXIMA CDA 02 T2',
    comision_comercializador: 25,
    participacion_comercializador: 30,
    saldo_inicial_bs: 0,
    saldo_inicial_usd: 0,
    saldo_inicial_cop: 0,
  },
};

export const AUDITED_CYCLE_SEMANA_41 = {
  fecha_desde: '2026-10-05',
  fecha_hasta: '2026-10-11',
  tipo_cierre: 'SEMANAL',
  semana_no: '41',
};

/**
 * Verifica si los saldos de arrastre en la base de datos están corrompidos
 * (por ejemplo, números negativos enormes resultantes de un cierre duplicado sin ventas)
 */
export function checkIsBalancesCorrupted(agList: any[]): boolean {
  if (!agList || agList.length === 0) return false;
  return agList.some((a) => {
    const nom = String(a.nombre_agencia || '').trim().toUpperCase();
    const sBs = Number(a.saldo_inicial_bs || 0);
    const sCop = Number(a.saldo_inicial_cop || 0);
    return (
      (nom === 'CENTRO GUAJIRO' && sBs < -1000) ||
      (nom === 'CHUCHO' && sBs < -1000) ||
      (nom === 'LA GAVIOTA' && sBs < -1000) ||
      (nom === 'EL CUJI' && sBs < -1000) ||
      (nom === 'YERITZA' && sBs < -1000) ||
      (nom === 'MAXIMA CDA 02 T2' && sCop < -10000)
    );
  });
}

/**
 * Restaura de forma atómica y fidedigna todos los saldos de arrastre iniciales
 * de Agencias y Operadoras, y ubica el ciclo exactamente en la Semana 41 (2026-10-05 al 2026-10-11).
 */
export async function executeRestoreAuditedBalances(
  userId: string,
  agList?: any[],
  refreshCycleFn?: () => Promise<void>
): Promise<boolean> {
  if (!userId) return false;

  try {
    const { supabase } = await import('../lib/supabase.ts');
    const { saveSystemKeywords } = await import('./systemKeywords.ts');
    // 1. Obtener agencias si no se proporcionaron
    let list = agList;
    if (!list || list.length === 0) {
      const { data } = await supabase.from('agencias').select('*').eq('user_id', userId);
      list = data || [];
    }

    // 2. Actualizar cada agencia con el saldo final oficial de la Semana 40
    for (const ag of list) {
      const nom = String(ag.nombre_agencia || '').trim().toUpperCase();
      const target = AUDITED_SEMANA_40_BALANCES[nom];
      if (target) {
        await supabase
          .from('agencias')
          .update({
            saldo_inicial_bs: target.bs,
            saldo_inicial_usd: target.usd,
            saldo_inicial_cop: target.cop,
          })
          .eq('id', ag.id)
          .eq('user_id', userId);
        ag.saldo_inicial_bs = target.bs;
        ag.saldo_inicial_usd = target.usd;
        ag.saldo_inicial_cop = target.cop;
      }
    }

    // 3. Restaurar configuración del ciclo a Semana 41
    const cycleUpdates = [
      { parametro: 'fecha_desde', valor: AUDITED_CYCLE_SEMANA_41.fecha_desde },
      { parametro: 'fecha_hasta', valor: AUDITED_CYCLE_SEMANA_41.fecha_hasta },
      { parametro: 'tipo_cierre', valor: AUDITED_CYCLE_SEMANA_41.tipo_cierre },
      { parametro: 'semana_no', valor: AUDITED_CYCLE_SEMANA_41.semana_no },
    ];

    try {
      await supabase
        .from('config_sistema')
        .delete()
        .eq('user_id', userId)
        .in('parametro', ['fecha_desde', 'fecha_hasta', 'tipo_cierre', 'semana_no']);

      await supabase
        .from('config_sistema')
        .insert(cycleUpdates.map((c) => ({ user_id: userId, parametro: c.parametro, valor: c.valor })));
    } catch (_) {
      for (const item of cycleUpdates) {
        await supabase.from('config_sistema').upsert(
          { user_id: userId, parametro: item.parametro, valor: item.valor },
          { onConflict: 'user_id,parametro' }
        );
      }
    }

    // 4. Actualizar localStorage para el ciclo
    try {
      localStorage.setItem(
        'me_cms_system_cycle',
        JSON.stringify({
          desde: AUDITED_CYCLE_SEMANA_41.fecha_desde,
          hasta: AUDITED_CYCLE_SEMANA_41.fecha_hasta,
          tipo: AUDITED_CYCLE_SEMANA_41.tipo_cierre,
          semana: AUDITED_CYCLE_SEMANA_41.semana_no,
        })
      );
    } catch (_) {}

    // 5. Restaurar saldos iniciales de Operadoras (Proveedores)
    await saveSystemKeywords(userId, AUDITED_SEMANA_40_OPERATORS);

    // 6. Refrescar ciclo si se pasó la función
    if (refreshCycleFn) {
      await refreshCycleFn();
    }

    return true;
  } catch (err) {
    console.error('Error restaurando saldos auditados S40:', err);
    return false;
  }
}
