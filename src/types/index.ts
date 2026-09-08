export type PlanType = 'basico' | 'profesional' | 'elite';

export interface UserProfile {
  id: string;
  email: string;
  nombre_banca?: string;
  banca?: string;
  plan?: string;
  status?: string;
  fecha_inicio?: string;
  fecha_vencimiento?: string;
  role?: string;
  rol?: string;
  limite_agencias?: number;
  estado?: string;
}

export interface SubUserAccess {
  id: string;
  email: string;
  parent_id: string;
  rol: string;
  accesos: string[];
}

export interface UserSession {
  id: string; // real auth id
  effectiveId: string; // parent_id if sub-user, otherwise real id
  email: string;
  isSubUser: boolean;
  role: string;
  plan: PlanType;
  profile: UserProfile | null;
  subUserAccess: SubUserAccess | null;
}

export interface SystemCycle {
  desde: string; // YYYY-MM-DD
  hasta: string; // YYYY-MM-DD
  tipo: 'SEMANAL' | 'DIARIO';
  semana: string;
}

export interface Agency {
  id: number;
  nombre_agencia: string;
  comision?: number;
  comisiones_sistemas?: Record<string, number> | string;
  monedas?: string;
  sistemas?: string;
  cuentas_asignadas?: string | string[];
  usuario_taquilla?: string;
  clave_taquilla?: string;
  auditoria_activa?: boolean;
  saldo_inicial_bs?: number;
  saldo_inicial_usd?: number;
  saldo_inicial_cop?: number;
  user_id?: string;
  created_at?: string;
}

export interface BetSystem {
  id: number;
  nombre_sistema: string;
  user_id?: string;
  created_at?: string;
}

export interface Currency {
  id: number;
  nombre_moneda: string;
  user_id?: string;
  created_at?: string;
}

export interface BankAccount {
  id: number;
  banco: string;
  titular: string;
  numero_cuenta: string;
  moneda: string;
  tipo_cuenta?: string;
  agencia_asignada?: string;
  saldo_inicial?: number;
  estatus?: string;
  user_id?: string;
  metodos_aceptados?: string;
}

export interface PaymentDevice {
  id: number;
  alias_nombre: string;
  tipo_dispositivo: string;
  serial_tid: string;
  cuenta_asociada?: string;
  agencia_asignada?: string;
  moneda: string;
  estatus?: string;
  notas?: string;
  user_id?: string;
}

export interface Collector {
  id: string | number;
  nombre: string;
  usuario: string;
  clave?: string;
  telefono?: string;
  cedula_identidad?: string;
  activo: boolean;
  user_id?: string;
  created_at?: string;
}

export interface ConfirmationTransaction {
  id: number;
  origen_tabla: 'cda_pagos_bancarios' | 'cda_pagos_diarios' | 'cda_gastos_diarios' | 'pagos_semana';
  categoria: 'Bancos' | 'Efectivo' | 'Gastos';
  fecha: string;
  agencia: string;
  cajero_id?: string;
  cajero_nombre?: string;
  metodo: string;
  monto: number;
  moneda: string;
  referencia: string;
  concepto: string;
  pagador: string;
  pos_o_cuenta?: string;
  confirmado: boolean;
  confirmado_por?: string;
  rechazado: boolean;
  rechazado_por?: string;
  motivo_rechazo?: string;
  fecha_rechazo?: string;
  cobrador_nombre?: string;
  qr_token?: string;
  liquidado_admin?: boolean;
  fecha_escaneo_cobrador?: string;
  created_at?: string;
}

export interface DailySaleItem {
  id: number;
  fecha: string;
  agencia: string;
  sistema: string;
  moneda: string;
  monto_venta: number;
  comision: number;
  monto_premios: number;
  util_op?: number;
  cerrado?: boolean;
  user_id?: string;
}

export interface DailyExpenseItem {
  id: number;
  fecha: string;
  agencia: string;
  concepto: string;
  descripcion?: string;
  monto: number;
  moneda: string;
  confirmado?: boolean;
  rechazado?: boolean;
  motivo_rechazo?: string;
  comprobante_url?: string;
  user_id?: string;
  cajero_id?: string;
}

export type ModuleId =
  | 'Inicio'
  | 'Pizarra Confirmaciones'
  | 'Agencias'
  | 'Cobradores'
  | 'Sistemas'
  | 'Monedas'
  | 'Cuentas Bancarias'
  | 'Cargar Ventas'
  | 'Pagos Agencias'
  | 'Gastos Agencias'
  | 'Saldo Agencias'
  | 'Venta Real'
  | 'Rep. Agencia'
  | 'Auditoría'
  | 'Caja Maestra'
  | 'Pagos a Operador'
  | 'Venta Operadora'
  | 'Reporte Operadora'
  | 'Cierre Operadora'
  | 'Config. Proveedores'
  | 'Gastos Administrativos'
  | 'Cierre '
  | 'Ajustes'
  | 'Usuarios';
