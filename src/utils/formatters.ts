import type { PlanType, ModuleId } from '../types';

export const TODOS_LOS_MODULOS_CMS: ModuleId[] = [
  'Inicio',
  'Pizarra Confirmaciones',
  'Sistemas',
  'Monedas',
  'Cuentas Bancarias',
  'Agencias',
  'Cobradores',
  'Cargar Ventas',
  'Pagos Agencias',
  'Gastos Agencias',
  'Saldo Agencias',
  'Venta Real',
  'Rep. Agencia',
  'Auditoría',
  'Caja Maestra',
  'Pagos a Operador',
  'Venta Operadora',
  'Reporte Operadora',
  'Cierre Operadora',
  'Config. Proveedores',
  'Gastos Administrativos',
  'Cierre ',
  'Ajustes',
];

export const ALL_MODULES = TODOS_LOS_MODULOS_CMS;

export const PLANES_MODULOS_DEFAULT: Record<PlanType, ModuleId[]> = {
  basico: [
    'Inicio',
    'Pizarra Confirmaciones',
    'Sistemas',
    'Monedas',
    'Cuentas Bancarias',
    'Agencias',
    'Cobradores',
    'Cargar Ventas',
    'Pagos Agencias',
    'Gastos Agencias',
    'Saldo Agencias',
    'Venta Real',
    'Rep. Agencia',
    'Caja Maestra',
    'Cierre ',
    'Ajustes',
  ],
  profesional: [
    'Inicio',
    'Pizarra Confirmaciones',
    'Sistemas',
    'Monedas',
    'Cuentas Bancarias',
    'Agencias',
    'Cobradores',
    'Cargar Ventas',
    'Pagos Agencias',
    'Gastos Agencias',
    'Saldo Agencias',
    'Venta Real',
    'Rep. Agencia',
    'Caja Maestra',
    'Pagos a Operador',
    'Venta Operadora',
    'Reporte Operadora',
    'Cierre Operadora',
    'Config. Proveedores',
    'Cierre ',
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
  let s = String(val).trim().toUpperCase();
  if (s.includes('AGENCIA:')) {
    s = s.replace('AGENCIA:', '').trim();
  }
  if (s.includes(' - ') && !isNaN(parseInt(s.split(' - ')[0], 10))) {
    s = s.split(' - ').slice(1).join(' - ').trim();
  }
  return s;
}

export function normalizarMoneda(mVal?: string | null): string {
  if (!mVal) return 'USD';
  const s = String(mVal).trim().toUpperCase();
  if (s.includes('BS') || s.includes('VES') || s.includes('BOLIVAR') || s.includes('BOL')) return 'BS';
  if (s.includes('COP') || s.includes('PESO') || s.includes('PES')) return 'COP';
  return 'USD';
}

export function formatCurrency(amount: number | string, currency = 'USD'): string {
  const num = typeof amount === 'number' ? amount : parseFloat(amount) || 0;
  const cleanCurr = normalizarMoneda(currency);
  const formatted = num.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  if (cleanCurr === 'BS') return `${formatted} Bs.`;
  if (cleanCurr === 'COP') return `$${formatted} COP`;
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
