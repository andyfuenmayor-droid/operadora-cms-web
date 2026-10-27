// @CRITICAL-SALES-ENGINE-LOCK: DO NOT MODIFY WITHOUT RUNNING SALES TEST SUITE (npm run test:sales)
/**
 * ==============================================================================
 * MOTOR DE VENTAS, PALABRAS CLAVE Y COINCIDENCIA DE AGENCIAS INMUTABLE (SALES ENGINE LOCK)
 * Proyecto: Operadora CMS / Multibanca Express
 * 
 * Reglas Arquitectónicas Inviolables:
 * 1. 100% TypeScript puro, desacoplado de React, DOM y Hooks.
 * 2. Inmutabilidad Total: Las reglas y palabras clave canónicas están congeladas con Object.freeze().
 * 3. Anti-Secuestro de Sistema: Un archivo o sistema seleccionado (ej. KENO) NUNCA puede ser
 *    mutado a otro sistema (ej. BETM3) por coincidencias parciales.
 * 4. Jerarquía Estricta de Match: Exacto de Sistema Activo > Código Exacto > Nombre Limpio > Parcial de Sistema Activo.
 * 5. Integridad de Duplicados: Duplicados se verifican estrictamente por la 4-tupla (Agencia, Sistema, Moneda, Fecha).
 * ==============================================================================
 */

/**
 * Helper puro de limpieza y normalización de nombres de agencia
 */
export function cleanAgencyName(val?: string | null): string {
  if (!val) return '';
  let s = String(val).trim().toUpperCase().replace(/["']/g, '');
  if (s.includes('AGENCIA:')) {
    s = s.replace('AGENCIA:', '').trim();
  }
  const prefixes = ['AGENCIA ', 'AG. ', 'AG.', 'AG ', 'AG-'];
  for (const p of prefixes) {
    if (s.startsWith(p)) {
      s = s.substring(p.length).trim();
      break;
    }
  }
  if (s.includes(' - ') && !isNaN(parseInt(s.split(' - ')[0], 10))) {
    s = s.split(' - ').slice(1).join(' - ').trim();
  }
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * Normaliza cualquier variante de divisa a la clave canónica ('BS' | 'USD' | 'COP')
 */
export function normalizarMoneda(mVal?: string | null): string {
  if (!mVal) return 'USD';
  const s = String(mVal).trim().toUpperCase();
  if (s.includes('BS') || s.includes('VES') || s.includes('BOLIVAR') || s.includes('BOL')) return 'BS';
  if (s.includes('COP') || s.includes('PESO') || s.includes('PES')) return 'COP';
  if (s.includes('USD') || s.includes('DOLAR') || s.includes('DÓLAR') || s === '$') return 'USD';
  return s;
}

export interface AgencyLike {
  id?: number | string;
  nombre_agencia: string;
  condiciones_sistemas?: any;
  sistemas?: string;
  monedas?: string;
  [key: string]: any;
}

export interface CanonicalSystemRule {
  readonly sistema: string;
  readonly defaultMoneda: 'COP' | 'BS' | 'USD';
  readonly multiMoneda: boolean;
  readonly signatures: readonly string[];
  readonly colAgencia: readonly string[];
  readonly colVenta: readonly string[];
  readonly colPremio: readonly string[];
  readonly colComision: readonly string[];
  readonly colNeto: readonly string[];
  readonly defaultComisionPct?: number;
  readonly defaultParticipacionPct?: number;
}

/**
 * Diccionario Canónico Inmutable de Sistemas y Palabras Clave Oficiales.
 * Congelado en tiempo de compilación. Ninguna mutación desde la base de datos
 * ni localStorage puede alterar estas reglas fundamentales.
 */
export const CANONICAL_SYSTEM_RULES: Readonly<Record<string, CanonicalSystemRule>> = Object.freeze({
  KENO: Object.freeze({
    sistema: 'KENO',
    defaultMoneda: 'COP',
    multiMoneda: false,
    signatures: Object.freeze([
      'VIRTUAL GAMES REPORT',
      'TOTAL ACCEPTED',
      'TOTAL PAID',
      'TICKETS ACCEPTED',
      'LOTTERYADMIN',
      'LOTTERY',
      'KENO',
    ]),
    colAgencia: Object.freeze(['AGENT', 'AGENCIA', 'NOMBRE', 'TAQUILLA', 'USUARIO', 'TERMINAL']),
    colVenta: Object.freeze(['TOTAL ACCEPTED', 'ACCEPTED', 'VENTA', 'VENTAS', 'TOTAL VENTA', 'JUGADO', 'BRUTO']),
    colPremio: Object.freeze(['TOTAL PAID', 'PAID OUT', 'PREMIO', 'PREMIOS', 'TOTAL PREMIOS', 'PAGADO', 'PAGADOS']),
    colComision: Object.freeze(['COMISION', 'COMISIÓN', 'COMISIONES', 'GANANCIA', 'COM']),
    colNeto: Object.freeze(['PROFIT', 'NETO', 'TOTAL NETO', 'SALDO', 'TOTAL SALDO', 'BALANCE', 'TOTAL A PAGAR']),
    defaultComisionPct: 0,
    defaultParticipacionPct: 0,
  }),

  BETM3: Object.freeze({
    sistema: 'BETM3',
    defaultMoneda: 'COP',
    multiMoneda: true,
    signatures: Object.freeze([
      'BETM3',
      'PESO - COP',
      'PESO-COP',
      'PESOS - COP',
      'BOLIVAR - VES',
      'BOLIVARES - VES',
      'DOLAR - USD',
      'DOLARES - USD',
      'BET',
    ]),
    colAgencia: Object.freeze(['NOMBRE', 'AGENCIA', 'USUARIO', 'AGENT', 'CLIENTE']),
    colVenta: Object.freeze(['VENTA', 'VENTAS', 'TOTAL VENTA', 'TOTAL VENTAS', 'JUGADO', 'BRUTO']),
    colPremio: Object.freeze(['PREMIO', 'PREMIOS', 'TOTAL PREMIOS', 'TOTAL PREMIO', 'PAGADOS']),
    colComision: Object.freeze(['COMISION', 'COMISIÓN', 'COMISIONES', 'COM']),
    colNeto: Object.freeze(['NETO', 'SALDO', 'TOTAL NETO', 'TOTAL SALDO', 'BALANCE']),
    defaultComisionPct: 0,
    defaultParticipacionPct: 0,
  }),

  GATOWEB: Object.freeze({
    sistema: 'GATOWEB',
    defaultMoneda: 'BS',
    multiMoneda: false,
    signatures: Object.freeze([
      'BANKLOT',
      'GATOWEB',
      'GATOBETS',
      'ANALISIS POR PERIODO',
      'ANÁLISIS POR PERÍODO',
      'REPORTE POR AGENCIA',
      'DISTRIBUIDOR',
      'USUARIO',
    ]),
    colAgencia: Object.freeze(['USUARIO', 'AGENCIA', 'NOMBRE', 'TAQUILLA', 'AGENT']),
    colVenta: Object.freeze(['VENTAS', 'VENTA', 'TOTAL VENTA', 'TOTAL VENTAS', 'JUGADO']),
    colPremio: Object.freeze(['PREMIOS', 'PREMIO', 'TOTAL PREMIOS', 'PAGADOS']),
    colComision: Object.freeze(['COMISION', 'COMISIÓN', 'COMISIONES']),
    colNeto: Object.freeze(['SALDO', 'TOTAL SALDO', 'NETO', 'TOTAL NETO']),
    defaultComisionPct: 0,
    defaultParticipacionPct: 0,
  }),

  'GATO PESOS': Object.freeze({
    sistema: 'GATO PESOS',
    defaultMoneda: 'COP',
    multiMoneda: false,
    signatures: Object.freeze([
      'GATOPESO',
      'GATO PESO',
      'GATO PESOS',
      'ACIERTO',
    ]),
    colAgencia: Object.freeze(['AGENCIA', 'NOMBRE', 'USUARIO', 'AGENT', 'TAQUILLA']),
    colVenta: Object.freeze(['VENTA', 'VENTAS', 'TOTAL VENTA', 'JUGADO', 'BRUTO']),
    colPremio: Object.freeze(['PREMIOS', 'PREMIO', 'ACIERTO', 'ACIERTOS', 'TOTAL PREMIOS']),
    colComision: Object.freeze(['COMISION', 'COMISIÓN', 'COM']),
    colNeto: Object.freeze(['SALDO', 'NETO', 'BALANCE']),
    defaultComisionPct: 25,
    defaultParticipacionPct: 30,
  }),

  CDAPUESTAS: Object.freeze({
    sistema: 'CDAPUESTAS',
    defaultMoneda: 'USD',
    multiMoneda: false,
    signatures: Object.freeze([
      'CDAPUESTAS',
      'CDA',
      'UTILIDAD FINAL',
      'PARTICIPACION',
      'LIQUIDACION',
      'LIQUIDACIÓN',
    ]),
    colAgencia: Object.freeze(['AGENCIA', 'AGENCIAS', 'NOMBRE', 'CLIENTE']),
    colVenta: Object.freeze(['VENTA', 'VENTAS', 'TOTAL VENTA']),
    colPremio: Object.freeze(['PREMIO', 'PREMIOS', 'TOTAL PREMIOS']),
    colComision: Object.freeze(['COMISION', 'COMISIÓN']),
    colNeto: Object.freeze(['UTILIDAD FINAL', 'SALDO', 'NETO']),
    defaultComisionPct: 0,
    defaultParticipacionPct: 0,
  }),

  HIPISMO: Object.freeze({
    sistema: 'HIPISMO',
    defaultMoneda: 'BS',
    multiMoneda: false,
    signatures: Object.freeze([
      'HIPISMO',
      'HIPICA',
      'HÍPICA',
      'CARRERAS',
      'CABALLOS',
      'INH',
    ]),
    colAgencia: Object.freeze(['AGENCIA', 'NOMBRE', 'USUARIO', 'TAQUILLA']),
    colVenta: Object.freeze(['VENTAS', 'VENTA', 'TOTAL VENTA']),
    colPremio: Object.freeze(['PREMIOS', 'PREMIO', 'TOTAL PREMIOS']),
    colComision: Object.freeze(['COMISION', 'COMISIÓN', 'COM']),
    colNeto: Object.freeze(['SALDO', 'NETO', 'BALANCE']),
    defaultComisionPct: 0,
    defaultParticipacionPct: 0,
  }),

  'PARLEY INH': Object.freeze({
    sistema: 'PARLEY INH',
    defaultMoneda: 'BS',
    multiMoneda: false,
    signatures: Object.freeze([
      'PARLEY INH',
      'PARLEY',
      'INH',
    ]),
    colAgencia: Object.freeze(['AGENCIA', 'NOMBRE', 'USUARIO', 'TAQUILLA']),
    colVenta: Object.freeze(['VENTA', 'VENTAS', 'TOTAL VENTA']),
    colPremio: Object.freeze(['PREMIO', 'PREMIOS', 'TOTAL PREMIOS']),
    colComision: Object.freeze(['COMISION', 'COMISIÓN', 'COM']),
    colNeto: Object.freeze(['SALDO', 'NETO', 'BALANCE']),
    defaultComisionPct: 0,
    defaultParticipacionPct: 0,
  }),
});

/**
 * Detecta el sistema canónico a partir de las firmas del archivo (nombre y ADN del encabezado)
 */
export function detectSystemFromDna(
  fileName: string,
  headerDna: string,
  userSelectedSystem = 'AUTO',
  availableSystems: { nombre_sistema: string }[] = []
): string {
  // 1. Si el usuario fijó explícitamente el sistema en el selector, TIENE PRIORIDAD ABSOLUTA
  if (userSelectedSystem && userSelectedSystem !== 'AUTO') {
    return userSelectedSystem;
  }

  const fUpper = (fileName || '').toUpperCase();
  const dnaUpper = (headerDna || '').toUpperCase();

  // 2. KENO / LotteryAdmin
  if (
    dnaUpper.includes('VIRTUAL GAMES REPORT') ||
    fUpper.includes('LOTTERYADMIN') ||
    fUpper.includes('LOTTERY') ||
    (dnaUpper.includes('TOTAL ACCEPTED') && dnaUpper.includes('TOTAL PAID')) ||
    fUpper.includes('KENO') ||
    dnaUpper.includes('KENO')
  ) {
    return 'KENO';
  }

  // 3. GATOWEB / Banklot
  if (
    dnaUpper.includes('BANKLOT') ||
    dnaUpper.includes('GATOWEB') ||
    dnaUpper.includes('ANALISIS POR PERIODO') ||
    dnaUpper.includes('ANÁLISIS POR PERÍODO') ||
    fUpper.includes('BANKLOT') ||
    (fUpper.includes('GATO') && !fUpper.includes('PESO'))
  ) {
    return 'GATOWEB';
  }

  // 4. GATO PESOS
  if (
    fUpper.includes('GATOPESO') ||
    (fUpper.includes('GATO') && fUpper.includes('PESO')) ||
    dnaUpper.includes('GATOPESO') ||
    (dnaUpper.includes('GATO') && dnaUpper.includes('PESO'))
  ) {
    return 'GATO PESOS';
  }

  // 5. CDAPUESTAS
  if (
    fUpper.includes('CDAPUESTAS') ||
    dnaUpper.includes('CDAPUESTAS') ||
    /(?:^|[^A-Z0-9])CDA(?:[^A-Z0-9]|$)/i.test(fUpper) ||
    /(?:^|[^A-Z0-9])CDA[\s_/-]/i.test(dnaUpper) ||
    dnaUpper.includes('CDA ') ||
    dnaUpper.includes('CDA_') ||
    dnaUpper.includes('CDA-') ||
    (dnaUpper.includes('UTILIDAD FINAL') && dnaUpper.includes('PARTICIPACION'))
  ) {
    return 'CDAPUESTAS';
  }

  // 6. BETM3
  if (
    fUpper.includes('BETM3') ||
    dnaUpper.includes('BETM3') ||
    (fUpper.includes('BET') && !fUpper.includes('ALPHABET') && !fUpper.includes('GATO'))
  ) {
    return 'BETM3';
  }

  // 7. Dynamic matching contra sistemas registrados
  for (const s of availableSystems) {
    const sClean = s.nombre_sistema.replace(/\s+/g, '').toUpperCase();
    if (fUpper.replace(/\s+/g, '').includes(sClean) || dnaUpper.replace(/\s+/g, '').includes(sClean)) {
      return s.nombre_sistema;
    }
  }

  // NUNCA adivinar ciegamente BETM3 si no hay certeza
  return '';
}

/**
 * Detecta la moneda intrínseca del archivo según encabezados y firmas
 */
export function detectFileIntrinsicCurrency(
  fileName: string,
  headerDna: string,
  systemName: string,
  userSelectedCurrency = 'AUTO'
): string {
  const fUpper = (fileName || '').toUpperCase();
  const dnaUpper = (headerDna || '').toUpperCase();

  // 1. Detección explícita de divisa en el nombre de archivo (e.g. 2026-10-19_2026-10-25_USD.xlsx)
  if (/(?:^|[-_.\s])(USD|USDT)(?:[-_.\s]|$)/i.test(fUpper) || fUpper.endsWith('_USD.XLSX') || fUpper.endsWith('-USD.XLSX')) {
    return 'USD';
  }
  if (/(?:^|[-_.\s])(COP|PESOS?)(?:[-_.\s]|$)/i.test(fUpper) || fUpper.endsWith('_COP.XLSX') || fUpper.endsWith('-COP.XLSX')) {
    return 'COP';
  }
  if (/(?:^|[-_.\s])(BS|VES|BOLIVARES?)(?:[-_.\s]|$)/i.test(fUpper) || fUpper.endsWith('_BS.XLSX') || fUpper.endsWith('-BS.XLSX')) {
    return 'BS';
  }

  // 2. Si el usuario seleccionó manualmente una divisa específica y el archivo no declara otra en el nombre:
  if (userSelectedCurrency && userSelectedCurrency !== 'AUTO' && userSelectedCurrency !== 'MULTI') {
    return normalizarMoneda(userSelectedCurrency);
  }

  // 3. Firmas específicas en el ADN del encabezado
  if (
    dnaUpper.includes('PESO - COP') ||
    dnaUpper.includes('PESO-COP') ||
    dnaUpper.includes('PESOS - COP') ||
    dnaUpper.includes('PESO COP') ||
    /(?:^|[^A-Z0-9])COP(?:[^A-Z0-9]|$)/i.test(dnaUpper) ||
    (dnaUpper.includes('PESO') && !dnaUpper.includes('BOLIVAR') && !dnaUpper.includes('DOLAR'))
  ) {
    return 'COP';
  }

  if (
    dnaUpper.includes('BOLIVAR - VES') ||
    dnaUpper.includes('BOLIVARES - VES') ||
    dnaUpper.includes('BOLIVAR - BS') ||
    dnaUpper.includes('BOLIVARES - BS') ||
    /(?:^|[^A-Z0-9])(VES|BS|BSF|BSD)(?:[^A-Z0-9]|$)/i.test(dnaUpper) ||
    dnaUpper.includes('BOLIVAR') ||
    dnaUpper.includes('BOLIVARES')
  ) {
    return 'BS';
  }

  if (
    dnaUpper.includes('DOLAR - USD') ||
    dnaUpper.includes('DOLARES - USD') ||
    dnaUpper.includes('DOLAR-USD') ||
    /(?:^|[^A-Z0-9])(USD|USDT|\$USD)(?:[^A-Z0-9]|$)/i.test(dnaUpper) ||
    dnaUpper.includes('DOLAR') ||
    dnaUpper.includes('DOLARES')
  ) {
    return 'USD';
  }

  // 4. Fallback por sistema canónico
  const canon = CANONICAL_SYSTEM_RULES[systemName.toUpperCase()];
  if (canon) {
    return canon.defaultMoneda;
  }

  return 'COP';
}

export interface StrictMatchResult<T = AgencyLike> {
  agency?: T;
  system: string;
  moneda: string;
  matchType: 'EXACT_CODE' | 'ID_CODE' | 'EXACT_NAME' | 'CLEAN_NAME' | 'PARTIAL_SYSTEM' | 'NONE';
  matchedCode?: string;
}

/**
 * Función Maestra Certificada de Coincidencia de Agencias (Anti-Secuestro)
 * 
 * Jerarquía Inviolable:
 * 1. El sistema de la fila NUNCA muta si targetSystem está definido.
 * 2. Si la agencia tiene un código específico para targetSystem, ese código MANDA.
 * 3. Coincidencia Exacta > ID Numérico > Nombre Limpio > Subcadena del Sistema.
 * 4. Jamás un código de BETM3 puede robarse una fila de KENO.
 */
export function matchAgencyStrict<T extends AgencyLike = AgencyLike>(
  cellVal: string,
  targetSystem: string,
  targetMoneda: string,
  agencies: T[]
): StrictMatchResult<T> {
  if (!cellVal) {
    return { system: targetSystem, moneda: targetMoneda, matchType: 'NONE' };
  }

  const upCell = cellVal.trim().toUpperCase();
  const clnCell = cleanAgencyName(cellVal);
  const sysUpper = (targetSystem || 'BETM3').trim().toUpperCase();
  const monUpper = normalizarMoneda(targetMoneda || 'COP');

  // Extraer ID numérico si existe (ej. "MAXIMA CDA 02 T2 (5024)" -> "5024")
  const idMatch = cellVal.match(/\((\d+)\)/) || cellVal.match(/\b(\d{4,8})\b/);
  const numericId = idMatch ? idMatch[1] : '';

  // Helper para inferir moneda de agencia cuando el reporte no trae divisa explícita
  const getEffectiveAgencyMoneda = (agency: T, conditions: Record<string, any>): string => {
    const agCurrs = (agency.monedas || '')
      .split(',')
      .map((m: string) => normalizarMoneda(m.trim()))
      .filter(Boolean);
    const sysCurrs = Object.keys(conditions)
      .filter((k) => k.toUpperCase().startsWith(`${sysUpper}_`))
      .map((k) => normalizarMoneda(k.split('_')[1]));
    if (sysCurrs.length === 1) return sysCurrs[0];
    if (agCurrs.length === 1) return agCurrs[0];
    return monUpper;
  };

  // PASO 1: Búsqueda de Código Exacto en el SISTEMA ACTIVO (Prioridad Máxima)
  for (const ag of agencies) {
    if (!ag.condiciones_sistemas) continue;
    let cond: Record<string, any> = {};
    try {
      cond = typeof ag.condiciones_sistemas === 'string'
        ? JSON.parse(ag.condiciones_sistemas)
        : ag.condiciones_sistemas;
    } catch (_) {
      continue;
    }

    // Probar combinaciones del sistema activo, incluyendo todas las divisas configuradas para este sistema
    const sysPrefix = `${sysUpper}_`;
    const sysSpecificKeys = Object.keys(cond).filter((k) => k.toUpperCase().startsWith(sysPrefix));
    const candidateKeys = Array.from(new Set([
      `${sysUpper}_${monUpper}`,
      `${targetSystem}_${monUpper}`,
      ...sysSpecificKeys,
      sysUpper,
      targetSystem,
    ]));

    for (const key of candidateKeys) {
      const entry = cond[key];
      if (entry?.codigo) {
        const codigos = String(entry.codigo)
          .split(',')
          .map((c) => c.trim().toUpperCase())
          .filter(Boolean);

        const inferredMoneda = entry.moneda
          ? normalizarMoneda(entry.moneda)
          : key.includes('_')
          ? normalizarMoneda(key.split('_')[1])
          : monUpper;

        // 1a. Coincidencia Exacta con la celda completa o celda limpia
        if (codigos.includes(upCell) || codigos.includes(clnCell)) {
          return {
            agency: ag,
            system: sysUpper,
            moneda: inferredMoneda,
            matchType: 'EXACT_CODE',
            matchedCode: entry.codigo,
          };
        }

        // 1b. Coincidencia por ID numérico en reporte (ej. "5024")
        if (numericId && codigos.includes(numericId)) {
          return {
            agency: ag,
            system: sysUpper,
            moneda: inferredMoneda,
            matchType: 'ID_CODE',
            matchedCode: numericId,
          };
        }

        // 1c. Si el código configurado es idéntico al ID entre paréntesis
        if (numericId && codigos.some((c) => c.includes(`(${numericId})`) || c === numericId)) {
          return {
            agency: ag,
            system: sysUpper,
            moneda: inferredMoneda,
            matchType: 'ID_CODE',
            matchedCode: numericId,
          };
        }
      }
    }
  }

  // PASO 2: Coincidencia Directa por Nombre de Agencia en el Sistema Activo
  for (const ag of agencies) {
    const agNomUpper = (ag.nombre_agencia || '').trim().toUpperCase();
    const agNomClean = cleanAgencyName(ag.nombre_agencia);

    if (agNomUpper === upCell || agNomClean === clnCell) {
      let cond: Record<string, any> = {};
      try {
        cond = typeof ag.condiciones_sistemas === 'string'
          ? JSON.parse(ag.condiciones_sistemas)
          : (ag.condiciones_sistemas || {});
      } catch (_) {}
      const effectiveMoneda = getEffectiveAgencyMoneda(ag, cond);

      return {
        agency: ag,
        system: sysUpper,
        moneda: effectiveMoneda,
        matchType: 'EXACT_NAME',
      };
    }
  }

  // PASO 3: Coincidencia por Prefijo / Nombre Base dentro de la Celda
  // (ej. Celda: "MAXIMA CDA 02 T2 (5024)" -> Nombre base: "MAXIMA CDA 02 T2")
  const baseNameFromCell = upCell.replace(/\s*\(\d+\)\s*$/, '').trim();
  const cleanBaseFromCell = cleanAgencyName(baseNameFromCell);

  if (baseNameFromCell || cleanBaseFromCell) {
    for (const ag of agencies) {
      const agNomUpper = (ag.nombre_agencia || '').trim().toUpperCase();
      const agNomClean = cleanAgencyName(ag.nombre_agencia);

      if (agNomUpper === baseNameFromCell || agNomClean === cleanBaseFromCell) {
        let cond: Record<string, any> = {};
        try {
          cond = typeof ag.condiciones_sistemas === 'string'
            ? JSON.parse(ag.condiciones_sistemas)
            : (ag.condiciones_sistemas || {});
        } catch (_) {}
        const effectiveMoneda = getEffectiveAgencyMoneda(ag, cond);

        return {
          agency: ag,
          system: sysUpper,
          moneda: effectiveMoneda,
          matchType: 'CLEAN_NAME',
        };
      }
    }
  }

  // PASO 4: Coincidencia Parcial dentro del SISTEMA ACTIVO ÚNICAMENTE
  for (const ag of agencies) {
    if (!ag.condiciones_sistemas) continue;
    let cond: Record<string, any> = {};
    try {
      cond = typeof ag.condiciones_sistemas === 'string'
        ? JSON.parse(ag.condiciones_sistemas)
        : ag.condiciones_sistemas;
    } catch (_) {
      continue;
    }

    const candidateKeys = [`${sysUpper}_${monUpper}`, sysUpper];
    for (const key of candidateKeys) {
      const entry = cond[key];
      if (entry?.codigo) {
        const codigos = String(entry.codigo)
          .split(',')
          .map((c) => c.trim().toUpperCase())
          .filter(Boolean);

        if (codigos.some((c) => upCell.includes(c) || (cleanBaseFromCell && c.includes(cleanBaseFromCell)))) {
          return {
            agency: ag,
            system: sysUpper,
            moneda: entry.moneda ? normalizarMoneda(entry.moneda) : monUpper,
            matchType: 'PARTIAL_SYSTEM',
            matchedCode: entry.codigo,
          };
        }
      }
    }
  }

  return { system: sysUpper, moneda: monUpper, matchType: 'NONE' };
}

/**
 * Validador de Duplicados Estricto y Determinístico
 * Comprueba la 4-tupla exacta: (Agencia, Sistema, Moneda, Fecha)
 */
export function isSaleDuplicate(
  existingSales: Array<{ agencia?: string; sistema?: string; moneda?: string; fecha?: string }>,
  targetAgencyName: string,
  targetSystem: string,
  targetMoneda: string,
  targetFecha: string
): boolean {
  const clnTarget = cleanAgencyName(targetAgencyName);
  const sysTarget = (targetSystem || '').trim().toUpperCase();
  const monTarget = normalizarMoneda(targetMoneda || 'COP');

  return existingSales.some((s) => {
    const clnExisting = cleanAgencyName(s.agencia);
    const sysExisting = String(s.sistema || '').trim().toUpperCase();
    const monExisting = normalizarMoneda(s.moneda);
    const fExisting = String(s.fecha || '').trim().slice(0, 10);
    const fTarget = String(targetFecha || '').trim().slice(0, 10);

    return (
      clnExisting === clnTarget &&
      sysExisting === sysTarget &&
      monExisting === monTarget &&
      fExisting === fTarget
    );
  });
}
