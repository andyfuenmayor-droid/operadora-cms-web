// @CRITICAL-LOCK: DO NOT MODIFY WITHOUT RUNNING CLOSURE SUITE (npm run test:closure)
/**
 * ==============================================================================
 * MOTOR CONTABLE PURO CERTIFICADO E INMUTABLE (CLOSURE ENGINE LOCK)
 * Proyecto: Operadora CMS / Multibanca Express
 * 
 * Reglas Arquitectónicas Inviolables:
 * 1. 100% TypeScript puro, desacoplado de React, DOM y Hooks.
 * 2. Fórmula Maestra: Saldo Final = Arrastre + Venta Neta - Gastos - Cobros + Reposición.
 * 3. Segregación Estricta: Entregas de efectivo JAMÁS se computan como bancos.
 * 4. Paridad de Actas: Matriz General === Actas 41-02, 41-03, 41-04, 41-05, 41-06.
 * ==============================================================================
 */

export type ClosureCurrency = 'BS' | 'USD' | 'COP' | string;

export interface RawSaleEntry {
  agencia: string;
  sistema: string;
  moneda: string;
  venta?: number;
  monto_ventas?: number;
  monto_venta?: number;
  comision?: number;
  premios?: number;
  monto_premios?: number;
  neto?: number;
  util_ag?: number;
  util_op?: number;
  fecha?: string;
}

export interface RawMovementEntry {
  id?: string | number;
  agencia?: string;
  nombre_agency?: string;
  moneda?: string;
  tipo_pago?: string;
  metodo?: string;
  monto?: number;
  referencia?: string;
  qr_token?: string;
  confirmado?: boolean;
  confirmado_supervisor?: boolean;
  fecha_escaneo_cobrador?: string;
  fecha_liquidacion_admin?: string;
  liquidado_admin?: boolean;
  confirmado_por?: string | null;
  estado?: string | null;
  rechazado?: boolean | null;
  fecha?: string;
  created_at?: string;
  [key: string]: any;
}

export interface RawExpenseEntry {
  id?: string | number;
  agencia?: string;
  moneda?: string;
  monto?: number;
  concepto?: string;
  tipo?: string;
  confirmado?: boolean;
  rechazado?: boolean;
  fecha?: string;
  created_at?: string;
}

export interface AgencyClosureRow {
  ag_id: number;
  entidad: string;
  moneda: ClosureCurrency;
  saldo_anterior: number;
  venta_bruta: number;
  comision: number;
  premios_taquilla: number;
  venta_neta: number;
  gastos: number;
  cobrador_ruta: number;
  cobrador_liquidado?: number;
  cobrador_en_ruta?: number;
  efectivo_taquilla: number;
  bancos: number;
  reposicion_premios: number;
  pagos_netos: number;
  saldo_final: number;
  status: 'pagado' | 'pendiente' | 'favor';
}

export interface ConsolidatedTotals {
  saldoAnterior: number;
  ventaNeta: number;
  gastos: number;
  gastosAgencias: number;
  gastosComercializadora: number;
  cobradorRuta: number;
  cobradorLiquidado: number;
  cobradorEnRuta: number;
  efectivoTaquilla: number;
  bancos: number;
  reposicionPremios: number;
  saldoFinal: number;
  count: number;
}

// @CRITICAL-LOCK: Normalización estricta de divisa con soporte dinámico
export function normalizarMonedaPura(m?: string | null): ClosureCurrency {
  const clean = String(m || '').trim().toUpperCase();
  if (['BS', 'VES', 'BOLIVARES', 'BOLÍVARES', 'BS.'].includes(clean)) return 'BS';
  if (['USD', 'DOLARES', 'DÓLARES', 'US$', '$'].includes(clean)) return 'USD';
  if (['COP', 'PESOS', 'COL'].includes(clean)) return 'COP';
  return clean || 'BS';
}

// @CRITICAL-LOCK: Limpieza de nombre de agencia
export function cleanAgencyNamePura(name?: string | null): string {
  if (!name) return '';
  return String(name)
    .trim()
    .toUpperCase()
    .replace(/^AGENCIA\s+/i, '')
    .replace(/^AG\s+/i, '')
    .replace(/^CDA\s+/i, '')
    .trim();
}

// @CRITICAL-LOCK: Filtro de exclusión para que efectivo JAMÁS se compute como banco
export function isEfectivoPayment(p: RawMovementEntry): boolean {
  const met = String(p.metodo || '').toUpperCase();
  const idStr = String(p.id || '');
  const ref = String(p.referencia || '').toUpperCase();
  const tipo = String(p.tipo_pago || '').toUpperCase();

  return (
    met === 'EFECTIVO' ||
    idStr.startsWith('pd_') ||
    ref.includes('EFECTIVO') ||
    tipo.includes('EFECTIVO') ||
    tipo.includes('COBRADOR') ||
    Boolean(p.qr_token)
  );
}

// @CRITICAL-LOCK: Identificación de reposición de premios / abonos
export function isPremioPayment(p: RawMovementEntry): boolean {
  const tipo = String(p.tipo_pago || '').toUpperCase();
  const ref = String(p.referencia || '').toUpperCase();
  const met = String(p.metodo || '').toUpperCase();
  return (
    tipo.includes('PREMIO') ||
    ref.includes('PREMIO') ||
    tipo.includes('REPOSICION') ||
    ref.includes('REPOSICION') ||
    tipo.includes('REPOSICIÓN') ||
    ref.includes('REPOSICIÓN') ||
    met.includes('PREMIO')
  );
}

// @CRITICAL-LOCK: Cálculo puro y determinista de la Matriz de Arqueo de Agencias (Soporte Multi-Divisa Dinámico)
export function computeCertifiedAgencyMatrix(params: {
  agencies: Array<{ id: number; nombre_agencia: string; monedas?: string; [key: string]: any }>;
  sales: RawSaleEntry[];
  payments: RawMovementEntry[];
  expenses: RawExpenseEntry[];
  rawDailyPayments: RawMovementEntry[];
  systemCycle?: { desde?: string; hasta?: string };
  participationCalculator?: (ag: any, sistema: string, mon: string) => { partPct: number };
  customCurrencies?: string[];
}): AgencyClosureRow[] {
  const { agencies, sales, payments, expenses, rawDailyPayments, systemCycle, participationCalculator, customCurrencies } = params;
  const list: AgencyClosureRow[] = [];

  const baseCurrencies = customCurrencies && customCurrencies.length > 0 ? customCurrencies : ['BS', 'USD', 'COP'];
  const dynamicCurrencies = Array.from(
    new Set([
      ...baseCurrencies,
      ...sales.map((s) => normalizarMonedaPura(s.moneda)),
      ...payments.map((p) => normalizarMonedaPura(p.moneda)),
      ...expenses.map((e) => normalizarMonedaPura(e.moneda)),
    ])
  ).filter(Boolean);

  dynamicCurrencies.forEach((mon) => {
    const colIni = mon === 'BS' ? 'saldo_inicial_bs' : mon === 'USD' ? 'saldo_inicial_usd' : mon === 'COP' ? 'saldo_inicial_cop' : `saldo_inicial_${mon.toLowerCase()}`;

    agencies.forEach((ag) => {
      const nom = String(ag.nombre_agencia || '').trim().toUpperCase();
      const cleanNom = cleanAgencyNamePura(nom);
      const confMon = String(ag.monedas || '').toUpperCase();
      let sAnt = Number(ag[colIni] || 0);
      if (!sAnt && ag.saldos_iniciales && typeof ag.saldos_iniciales === 'object') {
        sAnt = Number(ag.saldos_iniciales[mon] || 0);
      }

      // 1. Filtrar ventas correspondientes a esta agencia y moneda
      const agSales = sales.filter((s) => {
        if (normalizarMonedaPura(s.moneda) !== mon) return false;
        const sNom = String(s.agencia || '').trim().toUpperCase();
        return sNom === nom || cleanAgencyNamePura(sNom) === cleanNom;
      });

      const vtaBruta = agSales.reduce((sum, curr) => sum + Number(curr.venta || curr.monto_ventas || curr.neto || 0), 0);
      const com = agSales.reduce((sum, curr) => sum + Number(curr.comision || 0), 0);
      const premTaq = agSales.reduce((sum, curr) => sum + Number(curr.monto_premios || curr.premios || 0), 0);

      const vtaNeta = agSales.reduce((sum, s) => {
        const partPct = participationCalculator ? participationCalculator(ag, s.sistema, mon).partPct : 0;
        const v = Number(s.venta ?? s.monto_venta ?? 0);
        const c = Number(s.comision ?? 0);
        const p = Number(s.premios ?? s.monto_premios ?? 0);
        const neto = s.neto !== undefined && s.neto !== null ? Number(s.neto) : Math.round((v - c - p) * 100) / 100;

        let utilAg = 0;
        if (partPct > 0) {
          utilAg = Math.round((neto * (partPct / 100)) * 100) / 100;
        } else if (Number(s.util_ag || 0) > 0) {
          utilAg = Number(s.util_ag);
        }

        const utilOp = Math.round((neto - utilAg) * 100) / 100;
        return sum + utilOp;
      }, 0);

      const isBaseCurrency = baseCurrencies.map((c) => normalizarMonedaPura(c)).includes(mon);
      const isConfiguredAndAllowed = confMon.includes(mon) && isBaseCurrency;
      if (isConfiguredAndAllowed || Math.abs(sAnt) > 0.01 || agSales.length > 0) {
        // 2. Gastos confirmados en ciclo
        const agExp = expenses.filter((g) => {
          const gNom = String(g.agencia || '').trim().toUpperCase();
          const matchAg = gNom === nom || cleanAgencyNamePura(gNom) === cleanNom;
          const matchMon = normalizarMonedaPura(g.moneda) === mon;
          const fStr = String(g.fecha || g.created_at || '').slice(0, 10);
          const inCycle = !systemCycle?.desde || (fStr >= systemCycle.desde && fStr <= (systemCycle.hasta || fStr));
          return matchAg && matchMon && Boolean(g.confirmado) && inCycle && !g.rechazado;
        });
        const gTot = agExp.reduce((sum, curr) => sum + Number(curr.monto || 0), 0);

        // 3. Pagos diarios en físico y taquilla (desglosados por canal para evitar duplicar custodia de supervisor)
        const agDailyFiltered = rawDailyPayments.filter((p) => {
          const pNom = String(p.agencia || p.nombre_agency || '').trim().toUpperCase();
          const matchAg = pNom === nom || cleanAgencyNamePura(pNom) === cleanNom;
          const matchMon = normalizarMonedaPura(p.moneda) === mon;
          const isRech = Boolean(p.rechazado) || String(p.estado || '').toUpperCase() === 'RECHAZADO';
          const isConf = Boolean(p.confirmado) || Boolean(p.confirmado_supervisor) || Boolean(p.fecha_escaneo_cobrador);
          if (!matchAg || !matchMon || !isConf || isRech) return false;

          const fOperativa = String(p.fecha || p.created_at || '').slice(0, 10);
          const fEscaneo = String(p.fecha_escaneo_cobrador || '').slice(0, 10);
          const inOperativa = fOperativa && (!systemCycle?.desde || fOperativa >= systemCycle.desde) && (!systemCycle?.hasta || fOperativa <= systemCycle.hasta);
          const inEscaneo = fEscaneo && (!systemCycle?.desde || fEscaneo >= systemCycle.desde) && (!systemCycle?.hasta || fEscaneo <= systemCycle.hasta);
          return inOperativa || inEscaneo;
        });

        // Clasificar en grupos: Admin, Cobrador, Comercializador, Supervisor
        const pdGroup = {
          admin: [] as RawMovementEntry[],
          cobrador: [] as RawMovementEntry[],
          comercializador: [] as RawMovementEntry[],
          supervisorCustodia: [] as RawMovementEntry[],
        };

        agDailyFiltered.forEach((p) => {
          const tipoP = String(p.tipo_pago || 'EFECTIVO').trim().toUpperCase();
          const isCob = Boolean(p.qr_token) || tipoP.includes('COBRADOR');
          const isAdmin =
            tipoP.includes('ADMIN') ||
            tipoP.includes('ENTREGADO A ADMIN') ||
            tipoP.includes('ENTREGA_ADMIN') ||
            (p.confirmado_por && String(p.confirmado_por).trim().length > 0 && !tipoP.includes('SUPERVISOR'));
          const isComercializador = tipoP.includes('COMERCIALIZADOR');
          const isSupervisor = tipoP.includes('SUPERVISOR') || tipoP === 'ENTREGADO A SUPERVISOR';

          if (isAdmin) {
            pdGroup.admin.push(p);
          } else if (isCob) {
            pdGroup.cobrador.push(p);
          } else if (isComercializador) {
            pdGroup.comercializador.push(p);
          } else if (isSupervisor) {
            pdGroup.supervisorCustodia.push(p);
          } else {
            pdGroup.admin.push(p);
          }
        });

        // Métricas de Cobrador en Ruta (QR)
        const cobradorRutaTot = pdGroup.cobrador.reduce((sum, curr) => sum + Number(curr.monto || 0), 0);
        const cobradorLiquidadoTot = pdGroup.cobrador.filter((p) => Boolean(p.liquidado_admin)).reduce((sum, curr) => sum + Number(curr.monto || 0), 0);
        const cobradorEnRutaTot = pdGroup.cobrador.filter((p) => !p.liquidado_admin).reduce((sum, curr) => sum + Number(curr.monto || 0), 0);

        // Métricas de Efectivo Taquilla y entregas a Admin
        const adminSum = pdGroup.admin.reduce((sum, curr) => sum + Number(curr.monto || 0), 0);
        const comercializadorSum = pdGroup.comercializador.reduce((sum, curr) => sum + Number(curr.monto || 0), 0);
        const supervisorSum = pdGroup.supervisorCustodia.reduce((sum, curr) => sum + Number(curr.monto || 0), 0);

        // Custodia interna: si el supervisor ya entregó fondos a Admin o Cobrador, la custodia cajero->supervisor se absorbe
        const turnedOver = adminSum + cobradorRutaTot;
        const excessCustodia = Math.max(0, supervisorSum - turnedOver);
        const remanenteCustodia = (turnedOver === 0 && excessCustodia > 0) ? excessCustodia : 0;

        const efectivoTaquillaTot = adminSum + comercializadorSum + remanenteCustodia;

        // 4. Bancos ordinarios confirmados (excluyendo efectivo y reposición de premios)
        const agBancosList = payments.filter((p) => {
          const pNom = String(p.agencia || '').trim().toUpperCase();
          const matchAg = pNom === nom || cleanAgencyNamePura(pNom) === cleanNom;
          const matchMon = normalizarMonedaPura(p.moneda) === mon;
          const isPrem = isPremioPayment(p);
          const isEf = isEfectivoPayment(p);
          const fStr = String(p.fecha || p.created_at || '').slice(0, 10);
          const inCycle = !systemCycle?.desde || (fStr >= systemCycle.desde && fStr <= (systemCycle.hasta || fStr));
          return matchAg && matchMon && !isPrem && !isEf && Boolean(p.confirmado) && inCycle && !p.rechazado;
        });
        const bancosTot = agBancosList.reduce((sum, curr) => sum + Number(curr.monto || 0), 0);

        // 5. Reposición de Premios (Abonos por pérdidas)
        const agPremiosList = payments.filter((p) => {
          const pNom = String(p.agencia || '').trim().toUpperCase();
          const matchAg = pNom === nom || cleanAgencyNamePura(pNom) === cleanNom;
          const matchMon = normalizarMonedaPura(p.moneda) === mon;
          const isPrem = isPremioPayment(p);
          const fStr = String(p.fecha || p.created_at || '').slice(0, 10);
          const inCycle = !systemCycle?.desde || (fStr >= systemCycle.desde && fStr <= (systemCycle.hasta || fStr));
          return matchAg && matchMon && isPrem && Boolean(p.confirmado) && inCycle && !p.rechazado;
        });
        const reposicionPremiosTot = agPremiosList.reduce((sum, curr) => sum + Number(curr.monto || 0), 0);

        const totalCobros = efectivoTaquillaTot + cobradorRutaTot + bancosTot;
        const pagosNetos = totalCobros - reposicionPremiosTot;

        // @CRITICAL-LOCK: FÓRMULA MAESTRA DE SALDO FINAL
        // Saldo Final = Arrastre Anterior + Venta Neta - Gastos - Cobros + Reposición de Premios
        const saldoFinal = Math.round((sAnt + vtaNeta - gTot - totalCobros + reposicionPremiosTot) * 100) / 100;

        let status: 'pagado' | 'pendiente' | 'favor' = 'pagado';
        if (Math.abs(saldoFinal) < 0.1) status = 'pagado';
        else if (saldoFinal > 0) status = 'pendiente';
        else status = 'favor';

        list.push({
          ag_id: ag.id,
          entidad: nom,
          moneda: mon,
          saldo_anterior: Math.round(sAnt * 100) / 100,
          venta_bruta: Math.round(vtaBruta * 100) / 100,
          comision: Math.round(com * 100) / 100,
          premios_taquilla: Math.round(premTaq * 100) / 100,
          venta_neta: Math.round(vtaNeta * 100) / 100,
          gastos: Math.round(gTot * 100) / 100,
          cobrador_ruta: Math.round(cobradorRutaTot * 100) / 100,
          cobrador_liquidado: Math.round(cobradorLiquidadoTot * 100) / 100,
          cobrador_en_ruta: Math.round(cobradorEnRutaTot * 100) / 100,
          efectivo_taquilla: Math.round(efectivoTaquillaTot * 100) / 100,
          bancos: Math.round(bancosTot * 100) / 100,
          reposicion_premios: Math.round(reposicionPremiosTot * 100) / 100,
          pagos_netos: Math.round(pagosNetos * 100) / 100,
          saldo_final: saldoFinal,
          status,
        });
      }
    });
  });

  return list;
}

// @CRITICAL-LOCK: Consolidación total de balances por divisa con redondeo estricto
export function computeCertifiedTotals(
  agencyRows: AgencyClosureRow[],
  adminExpensesByCurrency: Record<string, number>
): Record<string, ConsolidatedTotals> {
  const result: Record<string, ConsolidatedTotals> = {
    BS: { saldoAnterior: 0, ventaNeta: 0, gastos: 0, gastosAgencias: 0, gastosComercializadora: Number(adminExpensesByCurrency.BS || 0), cobradorRuta: 0, cobradorLiquidado: 0, cobradorEnRuta: 0, efectivoTaquilla: 0, bancos: 0, reposicionPremios: 0, saldoFinal: 0, count: 0 },
    USD: { saldoAnterior: 0, ventaNeta: 0, gastos: 0, gastosAgencias: 0, gastosComercializadora: Number(adminExpensesByCurrency.USD || 0), cobradorRuta: 0, cobradorLiquidado: 0, cobradorEnRuta: 0, efectivoTaquilla: 0, bancos: 0, reposicionPremios: 0, saldoFinal: 0, count: 0 },
    COP: { saldoAnterior: 0, ventaNeta: 0, gastos: 0, gastosAgencias: 0, gastosComercializadora: Number(adminExpensesByCurrency.COP || 0), cobradorRuta: 0, cobradorLiquidado: 0, cobradorEnRuta: 0, efectivoTaquilla: 0, bancos: 0, reposicionPremios: 0, saldoFinal: 0, count: 0 },
  };

  agencyRows.forEach((r) => {
    const cur = r.moneda;
    if (result[cur]) {
      result[cur].saldoAnterior += r.saldo_anterior;
      result[cur].ventaNeta += r.venta_neta;
      result[cur].gastos += r.gastos;
      result[cur].gastosAgencias += r.gastos;
      result[cur].cobradorRuta += r.cobrador_ruta;
      result[cur].cobradorLiquidado += r.cobrador_liquidado || 0;
      result[cur].cobradorEnRuta += r.cobrador_en_ruta || 0;
      result[cur].efectivoTaquilla += r.efectivo_taquilla;
      result[cur].bancos += r.bancos;
      result[cur].reposicionPremios += r.reposicion_premios;
      result[cur].saldoFinal += r.saldo_final;
      result[cur].count += 1;
    }
  });

  (['BS', 'USD', 'COP'] as ClosureCurrency[]).forEach((cur) => {
    const t = result[cur];
    if (t) {
      t.saldoAnterior = Math.round(t.saldoAnterior * 100) / 100;
      t.ventaNeta = Math.round(t.ventaNeta * 100) / 100;
      t.gastos = Math.round(t.gastos * 100) / 100;
      t.gastosAgencias = Math.round(t.gastosAgencias * 100) / 100;
      t.gastosComercializadora = Math.round(t.gastosComercializadora * 100) / 100;
      t.cobradorRuta = Math.round(t.cobradorRuta * 100) / 100;
      t.cobradorLiquidado = Math.round(t.cobradorLiquidado * 100) / 100;
      t.cobradorEnRuta = Math.round(t.cobradorEnRuta * 100) / 100;
      t.efectivoTaquilla = Math.round(t.efectivoTaquilla * 100) / 100;
      t.bancos = Math.round(t.bancos * 100) / 100;
      t.reposicionPremios = Math.round(t.reposicionPremios * 100) / 100;
      t.saldoFinal = Math.round(t.saldoFinal * 100) / 100;
    }
  });

  return result;
}

// ==============================================================================
// 5. MOTOR CONTABLE PURO PARA GRUPOS (INTERMEDIARIOS / SUB-COMERCIALIZADORES)
// ==============================================================================

export interface GroupClosureRow {
  grupo_id: number;
  nombre_grupo: string;
  moneda: ClosureCurrency;
  agencias_count: number;
  agencias_hijas?: string[];
  venta_bruta_arbol: number;
  premios_arbol: number;
  ggr: number;
  comision_agencias: number;
  comision_grupo_total: number;
  dif_com_grupo: number;
  dif_part_grupo: number;
  utilidad_grupo: number;
  saldo_anterior: number;
  pagos_netos: number;
  saldo_final: number;
  status: 'pagado' | 'pendiente' | 'favor';

  // CamelCase aliases para interoperabilidad total
  grupoId: number;
  grupoNombre: string;
  agenciasHijas: string[];
  ventaBrutaArbol: number;
  premiosArbol: number;
  utilidadBrutaArbol: number;
  comisionAgenciasHijas: number;
  comisionGrupoTotal: number;
  diferencialComisionGrupo: number;
  diferencialParticipacionGrupo: number;
  gananciaTotalGrupo: number;
  saldoInicial: number;
  pagosLiquidados: number;
  saldoFinal: number;
}

export interface RawGroupPaymentEntry {
  id?: number | string;
  grupo_id?: number;
  grupo_nombre?: string;
  moneda?: string;
  monto?: number;
  tipo_pago?: string;
  fecha?: string;
}

/**
 * @CRITICAL-LOCK: Cálculo puro y determinista de la Matriz de Liquidación de Grupos (Intermediarios).
 * Regla Suprema: Cero impacto sobre la deuda o caja de las agencias hijas.
 */
export function computeCertifiedGroupMatrix(params: {
  groups: Array<{
    id: number;
    nombre_grupo: string;
    monedas?: string;
    comision_pct_default?: number;
    participacion_pct_default?: number;
    condiciones_sistemas?: Record<string, any> | string;
    saldo_inicial_bs?: number;
    saldo_inicial_usd?: number;
    saldo_inicial_cop?: number;
    saldos_iniciales_json?: Record<string, number> | string;
    activo?: boolean;
    [key: string]: any;
  }>;
  agencies: Array<{
    id: number;
    nombre_agencia: string;
    grupo_id?: number | null;
    grupo_nombre?: string | null;
    monedas?: string;
    comision?: number;
    participacion_ag?: number;
    condiciones_sistemas?: Record<string, any> | string;
    [key: string]: any;
  }>;
  sales: RawSaleEntry[];
  groupPayments?: RawGroupPaymentEntry[];
  systemCycle?: { desde?: string; hasta?: string };
  participationCalculator?: (ag: any, sistema: string, mon: string) => { partPct: number };
  customCurrencies?: string[];
}): GroupClosureRow[] {
  const { groups, agencies, sales, groupPayments, participationCalculator, customCurrencies } = params;
  const list: GroupClosureRow[] = [];

  const baseCurrencies = customCurrencies && customCurrencies.length > 0 ? customCurrencies : ['BS', 'USD', 'COP'];
  const dynamicCurrencies = Array.from(
    new Set([
      ...baseCurrencies,
      ...sales.map((s) => normalizarMonedaPura(s.moneda)),
      ...(groupPayments || []).map((p) => normalizarMonedaPura(p.moneda)),
    ])
  ).filter(Boolean);

  groups.forEach((grp) => {
    if (grp.activo === false) return;

    // Parsear condiciones del grupo
    let grpConds: Record<string, any> = {};
    try {
      grpConds = typeof grp.condiciones_sistemas === 'string'
        ? JSON.parse(grp.condiciones_sistemas)
        : (grp.condiciones_sistemas || {});
    } catch (_) {
      grpConds = {};
    }

    const getGroupPct = (sistema: string, mon: string) => {
      const sysUpper = String(sistema || '').trim().toUpperCase();
      const comboKey = `${sysUpper}_${mon}`;
      const c = grpConds[comboKey] || grpConds[sysUpper] || {};
      const comPct = c.comision !== undefined && c.comision !== null && c.comision !== ''
        ? Number(c.comision)
        : Number(grp.comision_pct_default || 0);
      const partPct = c.participacion !== undefined && c.participacion !== null && c.participacion !== ''
        ? Number(c.participacion)
        : Number(grp.participacion_pct_default || 0);
      return { comPct, partPct };
    };

    // Identificar agencias del árbol
    const gId = Number(grp.id);
    const gNom = String(grp.nombre_grupo || '').trim().toUpperCase();
    const daughterAgencies = agencies.filter((ag) => {
      const agGId = ag.grupo_id !== undefined && ag.grupo_id !== null ? Number(ag.grupo_id) : null;
      const agGNom = String(ag.grupo_nombre || '').trim().toUpperCase();
      return (agGId !== null && agGId === gId) || (Boolean(agGNom) && agGNom === gNom);
    });

    dynamicCurrencies.forEach((mon) => {
      let ventaBrutaArbol = 0;
      let premiosArbol = 0;
      let comisionAgenciasTotal = 0;
      let comisionGrupoTotal = 0;
      let difComGrupoTotal = 0;
      let difPartGrupoTotal = 0;

      daughterAgencies.forEach((ag) => {
        const agNom = String(ag.nombre_agencia || '').trim().toUpperCase();
        const cleanAgNom = cleanAgencyNamePura(agNom);

        const agSales = sales.filter((s) => {
          if (normalizarMonedaPura(s.moneda) !== mon) return false;
          const sNom = String(s.agencia || '').trim().toUpperCase();
          return sNom === agNom || cleanAgencyNamePura(sNom) === cleanAgNom;
        });

        agSales.forEach((s) => {
          const v = Number(s.venta ?? s.monto_venta ?? s.monto_ventas ?? 0);
          const p = Number(s.premios ?? s.monto_premios ?? 0);
          const sys = String(s.sistema || '').toUpperCase();

          const grpRules = getGroupPct(sys, mon);

          let agPartPct = 0;
          let agComPct = Number(ag.comision || 0);

          if (participationCalculator) {
            agPartPct = participationCalculator(ag, sys, mon).partPct;
          } else {
            let agConds: any = {};
            try {
              agConds = typeof ag.condiciones_sistemas === 'string'
                ? JSON.parse(ag.condiciones_sistemas)
                : (ag.condiciones_sistemas || {});
            } catch (_) {
              agConds = {};
            }
            const combo = agConds[`${sys}_${mon}`] || agConds[sys] || {};
            agComPct = combo.comision !== undefined ? Number(combo.comision) : agComPct;
            agPartPct = combo.participacion !== undefined ? Number(combo.participacion) : Number(ag.participacion_ag || 0);
          }

          const comAg = s.comision !== undefined && s.comision !== null && Number(s.comision) > 0
            ? Number(s.comision)
            : Math.round((v * (agComPct / 100)) * 100) / 100;

          const comGrp = Math.round((v * (grpRules.comPct / 100)) * 100) / 100;
          const difCom = Math.max(0, Math.round((comGrp - comAg) * 100) / 100);

          const baseNeta = v - comGrp - p;
          let difPart = 0;
          if (baseNeta > 0 && grpRules.partPct > agPartPct) {
            difPart = Math.round((baseNeta * ((grpRules.partPct - agPartPct) / 100)) * 100) / 100;
          }

          ventaBrutaArbol += v;
          premiosArbol += p;
          comisionAgenciasTotal += comAg;
          comisionGrupoTotal += comGrp;
          difComGrupoTotal += difCom;
          difPartGrupoTotal += difPart;
        });
      });

      // Saldo anterior
      let sAnt = 0;
      if (mon === 'BS') sAnt = Number(grp.saldo_inicial_bs || 0);
      else if (mon === 'USD') sAnt = Number(grp.saldo_inicial_usd || 0);
      else if (mon === 'COP') sAnt = Number(grp.saldo_inicial_cop || 0);

      if (!sAnt) {
        let saldosJson: any = grp.saldos_iniciales_json || grp.saldos_iniciales;
        if (typeof saldosJson === 'string') {
          try {
            saldosJson = JSON.parse(saldosJson);
          } catch (_) {
            saldosJson = {};
          }
        }
        if (saldosJson && typeof saldosJson === 'object' && saldosJson[mon] !== undefined) {
          sAnt = Number(saldosJson[mon] || 0);
        }
      }

      // Pagos al grupo
      const gPayments = (groupPayments || []).filter((p) => {
        const matchId = p.grupo_id !== undefined && p.grupo_id !== null && Number(p.grupo_id) === gId;
        const pNom = String(p.grupo_nombre || '').trim().toUpperCase();
        const matchNom = Boolean(pNom) && pNom === gNom;
        return (matchId || matchNom) && normalizarMonedaPura(p.moneda) === mon;
      });
      const pagosNetos = gPayments.reduce((sum, curr) => sum + Number(curr.monto || 0), 0);

      const confMon = String(grp.monedas || 'BS,USD,COP').toUpperCase();
      const hasSales = ventaBrutaArbol > 0 || premiosArbol > 0;
      const hasBalance = Math.abs(sAnt) > 0.01;
      const hasPayments = pagosNetos > 0;
      const isBaseCurrency = baseCurrencies.map((c) => normalizarMonedaPura(c)).includes(mon);
      const hasDaughters = daughterAgencies.length > 0 && confMon.includes(mon) && isBaseCurrency;

      if (hasSales || hasBalance || hasPayments || hasDaughters) {
        const ggr = Math.round((ventaBrutaArbol - premiosArbol) * 100) / 100;
        const difCom = Math.round(difComGrupoTotal * 100) / 100;
        const difPart = Math.round(difPartGrupoTotal * 100) / 100;
        const utilidadGrupo = Math.round((difCom + difPart) * 100) / 100;
        const saldoFinal = Math.round((sAnt + utilidadGrupo - pagosNetos) * 100) / 100;
        const status: 'pagado' | 'pendiente' | 'favor' =
          saldoFinal > 0.01 ? 'pendiente' : saldoFinal < -0.01 ? 'favor' : 'pagado';

        const vb = Math.round(ventaBrutaArbol * 100) / 100;
        const pr = Math.round(premiosArbol * 100) / 100;
        const ca = Math.round(comisionAgenciasTotal * 100) / 100;
        const cg = Math.round(comisionGrupoTotal * 100) / 100;
        const sa = Math.round(sAnt * 100) / 100;
        const pn = Math.round(pagosNetos * 100) / 100;
        const daughterNames = daughterAgencies.map((a) => a.nombre_agencia);

        list.push({
          grupo_id: grp.id,
          nombre_grupo: grp.nombre_grupo,
          moneda: mon,
          agencias_count: daughterAgencies.length,
          agencias_hijas: daughterNames,
          venta_bruta_arbol: vb,
          premios_arbol: pr,
          ggr,
          comision_agencias: ca,
          comision_grupo_total: cg,
          dif_com_grupo: difCom,
          dif_part_grupo: difPart,
          utilidad_grupo: utilidadGrupo,
          saldo_anterior: sa,
          pagos_netos: pn,
          saldo_final: saldoFinal,
          status,

          // CamelCase aliases
          grupoId: grp.id,
          grupoNombre: grp.nombre_grupo,
          agenciasHijas: daughterNames,
          ventaBrutaArbol: vb,
          premiosArbol: pr,
          utilidadBrutaArbol: ggr,
          comisionAgenciasHijas: ca,
          comisionGrupoTotal: cg,
          diferencialComisionGrupo: difCom,
          diferencialParticipacionGrupo: difPart,
          gananciaTotalGrupo: utilidadGrupo,
          saldoInicial: sa,
          pagosLiquidados: pn,
          saldoFinal,
        });
      }
    });
  });

  return list;
}
