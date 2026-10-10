import type { Agency } from '../types';

export interface ThermalTicketParseResult {
  isThermalTicket: boolean;
  agencyName?: string;
  matchedAgency?: Agency;
  date?: string; // YYYY-MM-DD
  currency?: 'BS' | 'USD' | 'COP';
  systemName?: string;
  venta: number;
  premio: number;
  comision: number;
  neto: number;
  synthesizedRows?: string[][];
}

/**
 * Utility to parse formatted decimal numbers from tickets (e.g. "880000,00", "-620000,00", "1.500.000,00")
 */
export function parseTicketNumber(val: string): number {
  if (!val) return 0;
  let clean = val.trim();
  // Remove currency signs and plus signs
  clean = clean.replace(/[$+\s]/g, '');
  if (!clean) return 0;

  // Handle negative sign
  const isNegative = clean.includes('-');
  clean = clean.replace(/-/g, '');

  // If format is like "1.500.000,00" or "880000,00"
  if (clean.includes(',') && clean.includes('.')) {
    clean = clean.replace(/\./g, '').replace(',', '.');
  } else if (clean.includes(',')) {
    // If single comma as decimal separator: "880000,00"
    const parts = clean.split(',');
    if (parts[1]?.length <= 2) {
      clean = parts[0] + '.' + parts[1];
    } else {
      clean = clean.replace(/,/g, '');
    }
  } else if (clean.includes('.')) {
    const parts = clean.split('.');
    if (parts[1]?.length > 2) {
      clean = clean.replace(/\./g, '');
    }
  }

  const num = parseFloat(clean);
  if (isNaN(num)) return 0;
  return isNegative ? -Math.abs(num) : num;
}

/**
 * Detects and parses vertical thermal ticket receipts (such as GatoWeb, Banklot, Keno, POS thermal receipts).
 */
export function detectAndParseThermalTicket(
  rows: string[][],
  agencies: Agency[] = [],
  knownSystems: string[] = [],
  fileName: string = ''
): ThermalTicketParseResult {
  // Flatten text lines
  const lines: string[] = rows
    .map((r) => r.map((c) => String(c ?? '').trim()).filter(Boolean).join(' '))
    .filter((l) => l.trim().length > 0);

  const fullTextUpper = lines.join('\n').toUpperCase();
  const fileUpper = (fileName || '').toUpperCase();

  // Signature checks for thermal ticket
  const isTicketIndicator =
    (fullTextUpper.includes('RESUMEN DE VENTA') || fullTextUpper.includes('TAQUILLA:') || fullTextUpper.includes('TODOS LOS PRODUCTOS')) ||
    ((fullTextUpper.includes('TOTAL VENTA') || fullTextUpper.includes('VENTA +')) &&
      (fullTextUpper.includes('TOTAL PREMIO') || fullTextUpper.includes('PREMIO -'))) ||
    (fullTextUpper.includes('CONEXION +') && fullTextUpper.includes('PAGAR +')) ||
    ((fullTextUpper.includes('LOTERIA') || fullTextUpper.includes('ANIMALITOS')) && fullTextUpper.includes('VENTA +'));

  if (!isTicketIndicator && !fileUpper.includes('TICKET')) {
    return {
      isThermalTicket: false,
      venta: 0,
      premio: 0,
      comision: 0,
      neto: 0,
    };
  }

  // 1. Detect Currency
  let currency: 'BS' | 'USD' | 'COP' = 'COP';
  if (/\b(BS|VES|BOLIVAR|BOLIVARES)\b/i.test(fullTextUpper) || /\b(BS|VES)\b/i.test(fileUpper)) {
    currency = 'BS';
  } else if (/\b(USD|DOLAR|DOLARES)\b/i.test(fullTextUpper) || fileUpper.includes('USD')) {
    currency = 'USD';
  } else if (fullTextUpper.includes('$') || /\b(COP|PESO|PESOS)\b/i.test(fullTextUpper) || fileUpper.includes('PESO') || fileUpper.includes('COP')) {
    currency = 'COP';
  }

  // 2. Detect Date (e.g., "Desde 28/09/2026 al 04/10/2026" or "Hecho : 05/10/2026")
  let date: string | undefined;
  const alDateMatch = fullTextUpper.match(/AL\s+(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/i);
  if (alDateMatch) {
    const [, d, m, y] = alDateMatch;
    date = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  } else {
    const hechoMatch = fullTextUpper.match(/HECHO\s*:\s*(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/i);
    if (hechoMatch) {
      const [, d, m, y] = hechoMatch;
      date = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
  }

  // 3. Detect Agency from top lines (first 10 lines)
  let agencyName = '';
  let matchedAgency: Agency | undefined;

  const topLines = lines.slice(0, 10);
  for (const line of topLines) {
    const lineUpper = line.toUpperCase().trim();
    if (
      !lineUpper ||
      lineUpper.startsWith('RESUMEN') ||
      lineUpper.startsWith('TODOS') ||
      lineUpper.startsWith('DESDE') ||
      lineUpper.startsWith('HECHO') ||
      lineUpper.startsWith('LOTERIA') ||
      lineUpper.startsWith('ANIMALITOS')
    ) {
      continue;
    }

    // Try finding in agencies catalog
    const found = agencies.find((a) => {
      const aUpper = a.nombre_agencia.toUpperCase().trim();
      return (
        lineUpper === aUpper ||
        lineUpper.includes(aUpper) ||
        aUpper.includes(lineUpper) ||
        (a.usuario_taquilla && lineUpper.includes(a.usuario_taquilla.toUpperCase()))
      );
    });

    if (found) {
      agencyName = found.nombre_agencia;
      matchedAgency = found;
      break;
    }

    if (!agencyName && lineUpper.length >= 3 && !lineUpper.includes('$') && !lineUpper.includes(':')) {
      agencyName = line.trim();
    }
  }

  if (!agencyName && agencies.length > 0) {
    agencyName = agencies[0].nombre_agencia;
    matchedAgency = agencies[0];
  }

  // 4. Financial Amounts Extraction
  let venta = 0;
  let premio = 0;
  let comision = 0;
  let saldo = 0;

  // Search line by line for financial values
  for (const line of lines) {
    const lineUpper = line.toUpperCase();

    // TOTAL VENTA or VENTA +
    if (lineUpper.includes('TOTAL VENTA') || (!venta && lineUpper.startsWith('VENTA +'))) {
      const match = line.match(/(?:TOTAL\s+VENTA|VENTA)\s*[\+\$]*\s*([\-]?[\d\.,]+)/i);
      if (match?.[1]) {
        venta = parseTicketNumber(match[1]);
      } else {
        const nums = line.match(/[\-]?\d[\d\.,]*/g);
        if (nums && nums.length > 0) {
          venta = parseTicketNumber(nums[nums.length - 1]);
        }
      }
    }

    // TOTAL PREMIO or PREMIO -
    if (lineUpper.includes('TOTAL PREMIO') || (!premio && lineUpper.startsWith('PREMIO -'))) {
      const match = line.match(/(?:TOTAL\s+PREMIO|PREMIO)\s*[\-\$]*\s*([\-]?[\d\.,]+)/i);
      if (match?.[1]) {
        premio = parseTicketNumber(match[1]);
      } else {
        const nums = line.match(/[\-]?\d[\d\.,]*/g);
        if (nums && nums.length > 0) {
          premio = parseTicketNumber(nums[nums.length - 1]);
        }
      }
    }

    // TOTAL COMIS or COMIS -
    if (lineUpper.includes('TOTAL COMIS') || lineUpper.includes('COMIS -')) {
      const match = line.match(/(?:TOTAL\s+COMIS|COMIS)\s*[\-\$]*\s*([\-]?[\d\.,]+)/i);
      if (match?.[1]) {
        comision = parseTicketNumber(match[1]);
      }
    }

    // PAGAR or SALDO
    if (lineUpper.includes('PAGAR +') || lineUpper.includes('SALDO +')) {
      const match = line.match(/(?:PAGAR|SALDO)\s*[\+\$]*\s*([\-]?[\d\.,]+)/i);
      if (match?.[1]) {
        saldo = parseTicketNumber(match[1]);
      }
    }
  }

  // Net calculation fallback: Venta - Comision - Premio
  const computedNeto = Math.round((venta - comision - premio) * 100) / 100;
  const neto = saldo !== 0 ? saldo : computedNeto;

  // 5. Detect System Name
  let systemName = 'GATO PESOS';
  if (knownSystems.length > 0) {
    const foundSys = knownSystems.find((s) => {
      const sClean = s.replace(/\s+/g, '').toUpperCase();
      const fClean = fileUpper.replace(/\s+/g, '');
      return (
        (fClean.includes('GATO') && fClean.includes('PESO') && sClean.includes('GATO') && sClean.includes('PESO')) ||
        fClean.includes(sClean) ||
        fullTextUpper.includes(s.toUpperCase())
      );
    });
    if (foundSys) systemName = foundSys;
    else {
      // Check if GATO PESOS or GATOWEB exists in knownSystems
      const gatoPesos = knownSystems.find((s) => s.replace(/\s+/g, '').toUpperCase() === 'GATOPESOS');
      if (gatoPesos) systemName = gatoPesos;
      else {
        const gato = knownSystems.find((s) => s.toUpperCase().includes('GATO'));
        if (gato) systemName = gato;
      }
    }
  }

  // Synthesize table rows
  const synthesizedRows: string[][] = [
    ['AGENCIA', 'VENTA', 'PREMIOS', 'COMISION', 'SALDO'],
    [
      agencyName || 'MAXIMA CDA 02 T2',
      String(venta || 0),
      String(premio || 0),
      String(comision || 0),
      String(neto || 0),
    ],
  ];

  return {
    isThermalTicket: true,
    agencyName: agencyName || 'MAXIMA CDA 02 T2',
    matchedAgency,
    date,
    currency,
    systemName,
    venta,
    premio,
    comision,
    neto,
    synthesizedRows,
  };
}

/**
 * Parses raw text from copied/pasted thermal ticket
 */
export function parseRawTicketText(
  rawText: string,
  agencies: Agency[] = [],
  knownSystems: string[] = []
): ThermalTicketParseResult {
  const rows = rawText
    .split('\n')
    .map((l) => [l.trim()])
    .filter((r) => r[0].length > 0);
  return detectAndParseThermalTicket(rows, agencies, knownSystems);
}
