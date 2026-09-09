import { supabase } from '../lib/supabase';
import { normalizarMoneda, getTodayDateString } from './formatters';

export interface ConsolidatedPaymentItem {
  id: string;
  agencia: string;
  moneda: 'BS' | 'USD' | 'COP';
  tipo_pago: 'Pago' | 'Pago de Premios';
  metodo: string;
  monto: number;
  referencia: string;
  confirmado: boolean;
  confirmado_por?: string | null;
  rechazado: boolean;
  fecha: string;
  user_id?: string;
}

export interface ConsolidatedExpenseItem {
  id: string;
  agencia: string;
  tipo: string;
  moneda: 'BS' | 'USD' | 'COP';
  monto: number;
  concepto: string;
  user_id?: string;
  fecha: string;
  confirmado: boolean;
  rechazado: boolean;
}

export interface ConsolidationOptions {
  fechaDesde?: string;
  fechaHasta?: string;
  filtrarPeriodo?: boolean;
}

/**
 * Obtiene y consolida todos los pagos de:
 * 1. pagos_semana (manuales en CMS)
 * 2. cda_pagos_bancarios (confirmados de taquilla)
 * 3. cda_pagos_diarios (efectivo y cobros diarios de taquilla)
 * Con deduplicación exacta por ID único, referencia bancaria y clave compuesta.
 */
export async function getConsolidatedPayments(
  effectiveUserId: string,
  options: ConsolidationOptions = {}
): Promise<ConsolidatedPaymentItem[]> {
  if (!effectiveUserId) return [];

  const { fechaDesde, fechaHasta, filtrarPeriodo = true } = options;

  try {
    // 1. Cargar las 3 tablas en paralelo
    const [resPs, resPb, resPd] = await Promise.all([
      supabase.from('pagos_semana').select('*').eq('user_id', effectiveUserId),
      supabase
        .from('cda_pagos_bancarios')
        .select('*')
        .eq('user_id', effectiveUserId)
        .eq('confirmado', true),
      supabase
        .from('cda_pagos_diarios')
        .select('*')
        .eq('user_id', effectiveUserId),
    ]);

    const dfPs = resPs.data || [];
    const dfPb = resPb.data || [];
    const dfPd = resPd.data || [];

    const listaItems: ConsolidatedPaymentItem[] = [];
    const psRefs = new Set<string>();
    const psUnrefKeys = new Set<string>();

    // 1. Procesar pagos_semana (Manuales de CMS)
    dfPs.forEach((r: any) => {
      const isRech = Boolean(r.rechazado) || String(r.estado || '').toUpperCase() === 'RECHAZADO';
      if (isRech) return;

      const ag = String(r.agencia || '').trim().toUpperCase();
      const mo = normalizarMoneda(r.moneda) as 'BS' | 'USD' | 'COP';
      const mto = Math.round((Number(r.monto) || 0) * 100) / 100;
      const fechaRaw = String(r.fecha || r.created_at || '').trim();
      const fCorta = fechaRaw.slice(0, 10);
      const refVal = String(r.referencia || '').trim().toUpperCase();

      if (refVal && refVal !== 'N/A') {
        psRefs.add(refVal);
      } else if (ag && mto > 0) {
        psUnrefKeys.add(`${ag}_${mto}_${mo}_${fCorta}`);
      }

      const tRaw = String(r.tipo_pago || 'PAGO').toUpperCase();
      const metRaw = String(r.metodo || '').toUpperCase();
      const isPremPs = ['PREMIO', 'PÉRDIDA', 'PERDIDA', 'ABONO', 'REPOSICION', 'REPOSICIÓN'].some(
        (k) => `${tRaw} ${refVal} ${metRaw}`.includes(k)
      );

      listaItems.push({
        id: `ps_${r.id}`,
        agencia: ag,
        moneda: mo,
        tipo_pago: isPremPs ? 'Pago de Premios' : 'Pago',
        metodo: metRaw || 'DIRECTO',
        monto: mto,
        referencia: refVal || 'PAGO CMS',
        confirmado: true,
        confirmado_por: r.confirmado_por || 'ADMIN',
        rechazado: false,
        fecha: fechaRaw,
        user_id: r.user_id,
      });
    });

    // 2. Incorporar cda_pagos_bancarios (confirmados no rechazados)
    const pbSeenTx = new Set<string>();
    dfPb.forEach((r: any) => {
      const isRech = Boolean(r.rechazado) || String(r.estado || '').toUpperCase() === 'RECHAZADO';
      if (isRech) return;

      const agNom = String(r.agencia || '').trim().toUpperCase();
      const montoVal = Math.round((Number(r.monto) || 0) * 100) / 100;
      const fechaRaw = String(r.fecha || r.created_at || '').trim();
      const fCorta = fechaRaw.slice(0, 10);
      const monNorm = normalizarMoneda(r.moneda) as 'BS' | 'USD' | 'COP';
      const refRaw = String(r.referencia || 'N/A').trim().toUpperCase();

      const pbId = r.id;
      if (pbId && pbSeenTx.has(`pb_${pbId}`)) return;
      if (pbId) pbSeenTx.add(`pb_${pbId}`);

      // Deduplicar si ya existe en pagos_semana
      let yaEnPs = false;
      if (refRaw && refRaw !== 'N/A') {
        for (const psRef of psRefs) {
          if (psRef.includes(refRaw)) {
            yaEnPs = true;
            break;
          }
        }
      } else if (psUnrefKeys.has(`${agNom}_${montoVal}_${monNorm}_${fCorta}`)) {
        yaEnPs = true;
      }

      if (yaEnPs) return;

      if (agNom && montoVal > 0) {
        const pagadorRaw = String(r.datos_pagador || '').trim().toUpperCase();
        const refLabel = `REF: ${refRaw}${pagadorRaw && pagadorRaw !== 'N/A' ? ` - ${pagadorRaw}` : ''} [✅ CONFIRMADO BANCO]`;
        const metodoRaw = String(r.metodo_pago || 'BANCO').trim().toUpperCase();
        const concRaw = String(r.concepto || '').trim().toUpperCase();
        const isPremB = ['PREMIO', 'PÉRDIDA', 'PERDIDA', 'ABONO', 'REPOSICION', 'REPOSICIÓN'].some(
          (k) => `${concRaw} ${metodoRaw} ${refRaw}`.includes(k)
        );

        listaItems.push({
          id: `pb_${r.id}`,
          agencia: agNom,
          moneda: monNorm,
          tipo_pago: isPremB ? 'Pago de Premios' : 'Pago',
          metodo: metodoRaw,
          monto: montoVal,
          referencia: refLabel,
          confirmado: true,
          confirmado_por: String(r.confirmado_por || 'ADMIN').trim(),
          rechazado: false,
          fecha: fechaRaw,
          user_id: String(r.cajero_id || r.user_id || effectiveUserId),
        });
      }
    });

    // 3. Incorporar cda_pagos_diarios (efectivo confirmado)
    const pdSeenTx = new Set<string>();
    dfPd.forEach((r: any) => {
      const isRech = Boolean(r.rechazado) || String(r.estado || '').toUpperCase() === 'RECHAZADO';
      const isConf = Boolean(r.confirmado) || Boolean(r.confirmado_supervisor);
      if (!isConf || isRech) return;

      const tipoP = String(r.tipo_pago || 'EFECTIVO').trim().toUpperCase();

      // Si es pura transferencia bancaria, omitir si no involucra efectivo/comercializador
      if (
        tipoP.includes('TRANSFERENCIA') &&
        !['EFECTIVO', 'COMERCIALIZADOR', 'ADMIN'].some((k) => tipoP.includes(k))
      ) {
        return;
      }

      // Entregas de custodia logística a cobrador / administración no son pagos de agencia
      if (['COBRADOR', 'ENTREGADO A ADMIN', 'ENTREGA_ADMIN'].some((k) => tipoP.includes(k))) {
        return;
      }

      const pdId = r.id;
      if (pdId && pdSeenTx.has(`pd_${pdId}`)) return;
      if (pdId) pdSeenTx.add(`pd_${pdId}`);

      const agNom = String(r.agencia || '').trim().toUpperCase();
      const montoVal = Math.round((Number(r.monto) || 0) * 100) / 100;
      const fechaRaw = String(r.fecha || r.created_at || '').trim();
      const fCorta = fechaRaw.slice(0, 10);
      const monNorm = normalizarMoneda(r.moneda) as 'BS' | 'USD' | 'COP';
      const refD = String(r.referencia || '').trim().toUpperCase();

      let yaEnPs = false;
      if (refD && refD !== 'N/A') {
        for (const psRef of psRefs) {
          if (psRef.includes(refD)) {
            yaEnPs = true;
            break;
          }
        }
      } else if (psUnrefKeys.has(`${agNom}_${montoVal}_${monNorm}_${fCorta}`)) {
        yaEnPs = true;
      }

      if (yaEnPs) return;

      if (agNom && montoVal > 0) {
        const metodoCat = tipoP.includes('EFECTIVO')
          ? 'EFECTIVO'
          : tipoP.includes('COMERCIALIZADOR')
          ? 'COMERCIALIZADOR'
          : 'DIARIO';
        const concD = String(r.concepto || '').toUpperCase();
        const isPremD = ['PREMIO', 'PÉRDIDA', 'PERDIDA', 'ABONO', 'REPOSICION', 'REPOSICIÓN'].some(
          (k) => `${tipoP} ${concD} ${refD}`.includes(k)
        );

        listaItems.push({
          id: `pd_${r.id}`,
          agencia: agNom,
          moneda: monNorm,
          tipo_pago: isPremD ? 'Pago de Premios' : 'Pago',
          metodo: metodoCat,
          monto: montoVal,
          referencia: `PAGO DIARIO: ${tipoP} [✅ CONFIRMADO]`,
          confirmado: true,
          confirmado_por: String(r.supervisor_nombre || r.confirmado_por || 'ADMIN').trim(),
          rechazado: false,
          fecha: fechaRaw,
          user_id: String(r.cajero_id || r.user_id || effectiveUserId),
        });
      }
    });

    // 4. Filtrar fechas según ciclo operativo (preservando pagos manuales del CMS del ciclo abierto)
    if (filtrarPeriodo && (fechaDesde || fechaHasta)) {
      const hoyStr = getTodayDateString();
      const limiteHasta = fechaHasta ? (fechaHasta > hoyStr ? fechaHasta : hoyStr) : hoyStr;

      return listaItems.filter((item) => {
        // Los pagos ingresados directamente en pagos_semana pertenecen al ciclo abierto actual
        if (!item.id.startsWith('pb_') && !item.id.startsWith('pd_')) {
          return true;
        }

        const fStr = item.fecha.slice(0, 10);
        if (fStr.length === 10 && fStr.includes('-')) {
          if (fechaDesde && fStr < fechaDesde) return false;
          if (limiteHasta && fStr > limiteHasta) return false;
        }
        return true;
      });
    }

    return listaItems;
  } catch (err) {
    console.error('Error fetching consolidated payments:', err);
    return [];
  }
}

/**
 * Obtiene y consolida todos los gastos de:
 * 1. gastos (manuales en CMS)
 * 2. cda_gastos_diarios (confirmados de taquilla)
 * Deduplicando registros idénticos por agencia, fecha, monto, moneda y concepto.
 */
export async function getConsolidatedExpenses(
  effectiveUserId: string,
  options: ConsolidationOptions = {}
): Promise<ConsolidatedExpenseItem[]> {
  if (!effectiveUserId) return [];

  const { fechaDesde, fechaHasta, filtrarPeriodo = true } = options;

  try {
    const [resGc, resGd] = await Promise.all([
      supabase.from('gastos').select('*').eq('user_id', effectiveUserId),
      supabase.from('cda_gastos_diarios').select('*').eq('user_id', effectiveUserId),
    ]);

    const dfGc = resGc.data || [];
    const dfGd = resGd.data || [];

    const listaGastos: ConsolidatedExpenseItem[] = [];
    const gcSeenKeys = new Set<string>();

    // 1. Procesar gastos de CMS
    dfGc.forEach((r: any) => {
      const isRech = Boolean(r.rechazado) || String(r.estado || '').toUpperCase() === 'RECHAZADO';
      if (isRech) return;

      const agNom = String(r.agencia || '').trim().toUpperCase();
      const montoVal = Math.round((Number(r.monto) || 0) * 100) / 100;
      const fechaRaw = String(r.fecha || r.created_at || '').trim();
      const conceptoRaw = String(r.concepto || r.tipo || 'GASTO').trim().toUpperCase();
      const monNorm = normalizarMoneda(r.moneda) as 'BS' | 'USD' | 'COP';

      if (agNom && montoVal > 0) {
        gcSeenKeys.add(`${agNom}_${fechaRaw.slice(0, 10)}_${montoVal}_${monNorm}_${conceptoRaw}`);
        listaGastos.push({
          id: `gc_${r.id}`,
          agencia: agNom,
          tipo: 'Agencia',
          moneda: monNorm,
          monto: montoVal,
          concepto: conceptoRaw,
          user_id: String(r.user_id || effectiveUserId),
          fecha: fechaRaw,
          confirmado: true,
          rechazado: false,
        });
      }
    });

    // 2. Incorporar gastos diarios de taquilla
    const gdSeenIds = new Set<string>();
    dfGd.forEach((r: any) => {
      const isRech = Boolean(r.rechazado) || String(r.estado || '').toUpperCase() === 'RECHAZADO';
      const isConf = Boolean(r.confirmado) || Boolean(r.confirmado_supervisor);
      if (!isConf || isRech) return;

      const gdId = r.id;
      if (gdId && gdSeenIds.has(`gd_${gdId}`)) return;
      if (gdId) gdSeenIds.add(`gd_${gdId}`);

      const agNom = String(r.agencia || r.nombre_agency || '').trim().toUpperCase();
      const montoVal = Math.round((Number(r.monto) || 0) * 100) / 100;
      const fechaRaw = String(r.fecha || r.created_at || '').trim();
      const conceptoRaw = String(r.concepto || r.descripcion || 'GASTO').trim().toUpperCase();
      const monNorm = normalizarMoneda(r.moneda) as 'BS' | 'USD' | 'COP';

      // Evitar duplicar si ya fue registrado en gastos manuales de CMS
      const k = `${agNom}_${fechaRaw.slice(0, 10)}_${montoVal}_${monNorm}_${conceptoRaw}`;
      if (gcSeenKeys.has(k)) return;

      listaGastos.push({
        id: `gd_${r.id}`,
        agencia: agNom,
        tipo: 'Taquilla',
        moneda: monNorm,
        monto: montoVal,
        concepto: conceptoRaw,
        user_id: String(r.cajero_id || r.user_id || effectiveUserId),
        fecha: fechaRaw,
        confirmado: true,
        rechazado: false,
      });
    });

    // 3. Filtrar fechas según ciclo operativo
    if (filtrarPeriodo && (fechaDesde || fechaHasta)) {
      const hoyStr = getTodayDateString();
      const limiteHasta = fechaHasta ? (fechaHasta > hoyStr ? fechaHasta : hoyStr) : hoyStr;

      return listaGastos.filter((item) => {
        if (!item.id.startsWith('gd_')) return true;

        const fStr = item.fecha.slice(0, 10);
        if (fStr.length === 10 && fStr.includes('-')) {
          if (fechaDesde && fStr < fechaDesde) return false;
          if (limiteHasta && fStr > limiteHasta) return false;
        }
        return true;
      });
    }

    return listaGastos;
  } catch (err) {
    console.error('Error fetching consolidated expenses:', err);
    return [];
  }
}
