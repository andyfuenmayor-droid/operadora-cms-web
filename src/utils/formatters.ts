import type { PlanType, ModuleId } from '../types';

export const TODOS_LOS_MODULOS_CMS: ModuleId[] = [
  'Inicio',
  'Confirmaciones',
  'Confirmados',
  'Sistemas',
  'Monedas',
  'Cuentas Bancarias',
  'Agencias',
  'Cobradores',
  'Cargar Ventas',
  'Pagos Agencias',
  'Gastos por Agencia',
  'Saldo Agencias',
  'Venta Real',
  'Pagos a Operador',
  'Reporte Operadora',
  'Config. Proveedores',
  'Gastos Administrativos',
  'Cierre ',
  'Auditoría',
  'Ajustes',
];

export const ALL_MODULES = TODOS_LOS_MODULOS_CMS;

export const PLANES_MODULOS_DEFAULT: Record<PlanType, ModuleId[]> = {
  basico: [
    'Inicio',
    'Confirmaciones',
    'Confirmados',
    'Sistemas',
    'Monedas',
    'Cuentas Bancarias',
    'Agencias',
    'Cobradores',
    'Cargar Ventas',
    'Pagos Agencias',
    'Gastos por Agencia',
    'Saldo Agencias',
    'Venta Real',
    'Cierre ',
    'Auditoría',
    'Ajustes',
  ],
  profesional: [
    'Inicio',
    'Confirmaciones',
    'Confirmados',
    'Sistemas',
    'Monedas',
    'Cuentas Bancarias',
    'Agencias',
    'Cobradores',
    'Cargar Ventas',
    'Pagos Agencias',
    'Gastos por Agencia',
    'Gastos Administrativos',
    'Saldo Agencias',
    'Venta Real',
    'Pagos a Operador',
    'Reporte Operadora',
    'Config. Proveedores',
    'Cierre ',
    'Auditoría',
    'Ajustes',
  ],
  elite: [...TODOS_LOS_MODULOS_CMS],
};

export function normalizarNombrePlan(planVal?: string | null): PlanType {
  if (!planVal) return 'elite';
  const p = String(planVal).toLowerCase().trim();
  if (p.includes('básic') || p.includes('basic')) return 'basico';
  if (p.includes('profesional') || p.includes('pro')) return 'profesional';
  return 'elite';
}

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

export function normalizarMoneda(mVal?: string | null): string {
  if (!mVal) return 'USD';
  const s = String(mVal).trim().toUpperCase();
  if (s.includes('BS') || s.includes('VES') || s.includes('BOLIVAR') || s.includes('BOL')) return 'BS';
  if (s.includes('COP') || s.includes('PESO') || s.includes('PES')) return 'COP';
  return 'USD';
}

export function formatCurrency(amount: number | string, currency = 'USD'): string {
  const rawNum = typeof amount === 'number' ? amount : parseFloat(amount) || 0;
  const num = Math.abs(rawNum) < 0.0001 ? 0 : rawNum;
  const cleanCurr = normalizarMoneda(currency);
  const formatted = num.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  if (cleanCurr === 'BS') return `${formatted} Bs.`;
  if (cleanCurr === 'COP') return `${formatted} COP`;
  return `$${formatted}`;
}

export function getTodayDateString(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function formatDate(dateVal?: string | null): string {
  if (!dateVal) return '';
  const clean = String(dateVal).split('T')[0].split(' ')[0];
  const parts = clean.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return clean;
}

export function formatDateTime(dateTimeVal?: string | null): string {
  if (!dateTimeVal) return '';
  try {
    const d = new Date(dateTimeVal);
    if (isNaN(d.getTime())) return String(dateTimeVal);
    return d.toLocaleString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return String(dateTimeVal);
  }
}

export function montoEnLetras(monto: number, moneda = 'BS'): string {
  const unidades = ['', 'UN', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE'];
  const especiales = ['DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISÉIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE'];
  const decenas = ['', 'DIEZ', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
  const centenas = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];

  function convertirGrupo(n: number): string {
    let salida = '';
    const c = Math.floor(n / 100);
    const d = Math.floor((n % 100) / 10);
    const u = n % 10;

    if (n === 100) return 'CIEN';
    if (c > 0) salida += centenas[c] + ' ';

    if (d === 1 && u >= 0 && u <= 9) {
      salida += especiales[u];
    } else if (d === 2 && u > 0) {
      salida += 'VEINTI' + unidades[u];
    } else {
      if (d > 0) salida += decenas[d] + (u > 0 ? ' Y ' : '');
      if (u > 0) salida += unidades[u];
    }
    return salida.trim();
  }

  const entero = Math.floor(Math.abs(monto));
  const centavos = Math.round((Math.abs(monto) - entero) * 100);
  const centavosStr = String(centavos).padStart(2, '0') + '/100';

  const cleanMoneda = normalizarMoneda(moneda);
  let monedaNombre = 'BOLÍVARES';
  if (cleanMoneda === 'USD') monedaNombre = 'DÓLARES';
  if (cleanMoneda === 'COP') monedaNombre = 'PESOS';

  if (entero === 0) return `CERO ${monedaNombre} CON ${centavosStr}`;

  const millones = Math.floor(entero / 1000000);
  const miles = Math.floor((entero % 1000000) / 1000);
  const cientos = entero % 1000;

  let resultado = '';
  if (millones === 1) resultado += 'UN MILLÓN ';
  else if (millones > 1) resultado += convertirGrupo(millones) + ' MILLONES ';

  if (miles === 1) resultado += 'MIL ';
  else if (miles > 1) resultado += convertirGrupo(miles) + ' MIL ';

  if (cientos > 0) resultado += convertirGrupo(cientos);

  return `${resultado.trim()} ${monedaNombre} CON ${centavosStr}`;
}
