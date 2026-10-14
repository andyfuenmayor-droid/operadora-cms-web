import { driver, type DriveStep } from 'driver.js';
import 'driver.js/dist/driver.css';
import type { ModuleId } from '../types';

const TOUR_STORAGE_KEY = 'me_cms_tour_completed_v1';

export type TourNavigateCallback = (modId: ModuleId) => void;

let tourNavigator: TourNavigateCallback | null = null;
let currentActiveModule: ModuleId = 'Inicio';

/**
 * Registra la función de navegación reactiva para que el tour cambie
 * de pantalla en vivo cuando se desplace a un módulo específico.
 */
export function registerTourNavigator(fn: TourNavigateCallback, currentMod?: ModuleId) {
  if (currentMod) {
    currentActiveModule = currentMod;
  }
  tourNavigator = (modId: ModuleId) => {
    currentActiveModule = modId;
    fn(modId);
  };
}

export interface TourStepExtended extends DriveStep {
  moduleId?: ModuleId;
}

/**
 * Helper para resolver el elemento DOM del paso de manera reactiva.
 * Si el paso pertenece a un módulo diferente al actual, dispara inmediatamente
 * la navegación de React y deja que Driver.js espere a que el elemento aparezca en el DOM.
 */
function createStepElementResolver(selector: string, targetModuleId?: ModuleId): any {
  return () => {
    // Si este paso pertenece a un módulo y aún no está activo, navegar a él
    if (targetModuleId && tourNavigator && currentActiveModule !== targetModuleId) {
      currentActiveModule = targetModuleId;
      tourNavigator(targetModuleId);
    }
    const el = document.querySelector(selector) as HTMLElement | null;
    // Si no está aún y tenemos módulo objetivo, asegurar navegación
    if (!el && targetModuleId && tourNavigator) {
      tourNavigator(targetModuleId);
    }
    return el;
  };
}

export const tourSteps: TourStepExtended[] = [
  // 1. Operadora & Suscriptor
  {
    element: createStepElementResolver('#sidebar-subscriber-card'),
    popover: {
      title: '🏢 Operadora & Plan Contratado',
      description:
        'Visualiza la razón social de tu comercializadora o banca, el Plan SaaS activo (Básico, Profesional o Elite) y el usuario suscrito. Tu Plan Elite te otorga hasta 1.000 agencias activas y acceso irrestricto a todos los módulos maestros.',
      side: 'right',
      align: 'start',
    },
  },

  // 2. Inicio: Monitoreo en Vivo (KPIs)
  {
    moduleId: 'Inicio',
    element: createStepElementResolver('#tour-inicio-kpi, #menu-inicio', 'Inicio'),
    popover: {
      title: '📊 Inicio: Monitoreo en Vivo (KPIs)',
      description:
        'Cómo usarlo: Este panel te muestra los 4 indicadores clave en tiempo real: 1. Agencias activas contra el límite de tu plan. 2. Pagos pendientes de validar en pizarra. 3. Cobradores activos en calle. 4. Efectivo total circulando en ruta antes de ingresar a caja central.',
      side: 'bottom',
      align: 'start',
    },
  },

  // 3. Inicio: Estado Financiero Multidivisa
  {
    moduleId: 'Inicio',
    element: createStepElementResolver('#tour-inicio-balances, #menu-inicio', 'Inicio'),
    popover: {
      title: '💰 Inicio: Balance Maestro por Moneda',
      description:
        'Cómo usarlo: Consulta la salud financiera de tu banca separada por divisa: Bolívares (BS), Dólares (USD) y Pesos (COP). Aplica la fórmula certificada: Saldo Arrastre + Utilidad Ciclo - Gastos Agencias - Gastos Comercializadora - Cobros + Reposición de Premios = Balance Final Neto.',
      side: 'top',
      align: 'start',
    },
  },

  // 4. Confirmaciones: Barra de Control
  {
    moduleId: 'Confirmaciones',
    element: createStepElementResolver('#tour-confirmaciones-header, #menu-confirmaciones', 'Confirmaciones'),
    popover: {
      title: '⚡ Confirmaciones: Control y Aprobación',
      description:
        'Cómo usarlo: Recibe al instante (0 ms) los reportes de pago emitidos por los cajeros desde la Taquilla Web. Usa el botón "Sincronización Rápida" para refrescar nuevas transferencias o "Confirmar Todo" para validar en lote abonos ya conciliados con tu banco.',
      side: 'bottom',
      align: 'start',
    },
  },

  // 5. Confirmaciones: Pizarra de Validación OCR
  {
    moduleId: 'Confirmaciones',
    element: createStepElementResolver('#tour-confirmaciones-board, #menu-confirmaciones', 'Confirmaciones'),
    popover: {
      title: '🔍 Pizarra: Verificación Inteligente con OCR',
      description:
        'Cómo usarlo: Cada tarjeta representa un pago pendiente de taquilla con su captura. Haz clic en la tarjeta para ampliar el comprobante y usar el escaneo OCR de referencia bancaria. Pulsa "Aprobar" para acreditar el saldo o "Rechazar" indicando el motivo para notificar al cajero.',
      side: 'top',
      align: 'start',
    },
  },

  // 6. Confirmados: Pestañas de Rendición
  {
    moduleId: 'Confirmados',
    element: createStepElementResolver('#tour-confirmados-tabs, #menu-confirmados', 'Confirmados'),
    popover: {
      title: '📑 Confirmados: Vistas de Rendición y Arqueo',
      description:
        'Cómo usarlo: Organiza tu auditoría en 3 pestañas: 1. "Reporte General" para consultar todas las operaciones aprobadas. 2. "Auditoría Rechazados" para fiscalizar pagos denegados y sus causas. 3. "Arqueo y Efectivo" para conciliar el dinero físico bajo custodia de cada taquilla.',
      side: 'bottom',
      align: 'start',
    },
  },

  // 7. Confirmados: Filtros y Exportación CSV
  {
    moduleId: 'Confirmados',
    element: createStepElementResolver('#tour-confirmados-filters, #menu-confirmados', 'Confirmados'),
    popover: {
      title: '🔎 Confirmados: Filtros y Exportación CSV',
      description:
        'Cómo usarlo: Selecciona el rango de fechas (Desde / Hasta), filtra por agencia específica o por banco receptor. Pulsa "Exportar CSV" para descargar la planilla oficial de transacciones y conciliarla directamente contra los extractos de tus cuentas bancarias.',
      side: 'bottom',
      align: 'start',
    },
  },

  // 8. Sistemas: Formulario de Configuración y Mapeo
  {
    moduleId: 'Sistemas',
    element: createStepElementResolver('#tour-sistemas-form, #menu-sistemas', 'Sistemas'),
    popover: {
      title: '🎰 Sistemas: Alta y Mapeo de Columnas',
      description:
        'Cómo usarlo: 1. Escribe el nombre del sistema (ej. CDAPUESTAS, BETM3, KENO). 2. Define las palabras clave de las columnas en tus archivos Excel/PDF (ID Agencia, Ventas, Premios). 3. Fija la comisión comercializadora, % de participación y saldos iniciales en BS, USD y COP. 4. Guarda para automatizar las ventas.',
      side: 'bottom',
      align: 'start',
    },
  },

  // 9. Sistemas: Catálogo de Proveedores Activos
  {
    moduleId: 'Sistemas',
    element: createStepElementResolver('#tour-sistemas-table, #menu-sistemas', 'Sistemas'),
    popover: {
      title: '📋 Sistemas: Catálogo de Conexiones',
      description:
        'Cómo usarlo: Monitorea todas las casas y plataformas habilitadas en tu red. Usa los botones de acción para editar porcentajes contractuales, ajustar saldos de arrastre iniciales o eliminar sistemas que ya no operen en tu banca.',
      side: 'top',
      align: 'start',
    },
  },

  // 10. Monedas: Gestión Multidivisa
  {
    moduleId: 'Monedas',
    element: createStepElementResolver('#tour-monedas-form, #menu-monedas', 'Monedas'),
    popover: {
      title: '💵 Monedas: Configuración Multidivisa',
      description:
        'Cómo usarlo: Da de alta las monedas oficiales de tu banca (BS, USD, COP, USDT). En Multibanca Express cada moneda opera de forma 100% independiente en ventas, gastos, cobros y arqueos, garantizando cero distorsión cambiaria.',
      side: 'bottom',
      align: 'start',
    },
  },

  // 11. Cuentas Bancarias & POS: Conmutador de Pestañas
  {
    moduleId: 'Cuentas Bancarias',
    element: createStepElementResolver('#tour-cuentas-tabs, #menu-cuentas-bancarias', 'Cuentas Bancarias'),
    popover: {
      title: '🏦 Cuentas y POS: Gestión Receptora',
      description:
        'Cómo usarlo: Conmuta entre "Cuentas Bancarias" (para administrar cuentas receptoras de transferencias y Pago Móvil) y "Puntos de Venta (POS)" (para controlar terminales BioPago o dispositivos inalámbricos asignados a taquillas).',
      side: 'bottom',
      align: 'start',
    },
  },

  // 12. Cuentas Bancarias & POS: Alta de Cuentas y Terminales
  {
    moduleId: 'Cuentas Bancarias',
    element: createStepElementResolver('#tour-cuentas-btn, #menu-cuentas-bancarias', 'Cuentas Bancarias'),
    popover: {
      title: '➕ Cuentas: Alta de Cuentas y Terminales',
      description:
        'Cómo usarlo: Pulsa "+ NUEVA CUENTA" para registrar el banco, número de cuenta de 20 dígitos, titular, moneda y agencias autorizadas a depositar en ella. En la sección POS, vincula el serial TID para habilitar cobros con tarjeta en taquilla.',
      side: 'bottom',
      align: 'start',
    },
  },

  // 13. Agencias: Acciones y Alta
  {
    moduleId: 'Agencias',
    element: createStepElementResolver('#tour-agencias-actions, #menu-agencias', 'Agencias'),
    popover: {
      title: '🏪 Agencias: Alta y Control de Puntos',
      description:
        'Cómo usarlo: Haz clic en "+ NUEVA AGENCIA" para registrar un punto de venta. Configura su nombre comercial, porcentaje de comisión asignado, sistemas autorizados y genera las credenciales de acceso para que el cajero opere en Taquilla Web.',
      side: 'bottom',
      align: 'start',
    },
  },

  // 14. Agencias: Cupo y Capacidad
  {
    moduleId: 'Agencias',
    element: createStepElementResolver('#tour-agencias-quota, #menu-agencias', 'Agencias'),
    popover: {
      title: '📈 Agencias: Cupo y Límites de Plan',
      description:
        'Cómo usarlo: Monitorea en vivo la cantidad de taquillas activas respecto a tu cuota contratada. Con tu Plan Elite cuentas con hasta 1.000 agencias para expandir tu red comercial sin límites técnicos.',
      side: 'bottom',
      align: 'start',
    },
  },

  // 15. Agencias: Directorio y Credenciales
  {
    moduleId: 'Agencias',
    element: createStepElementResolver('#tour-agencias-table, #menu-agencias', 'Agencias'),
    popover: {
      title: '🔑 Agencias: Credenciales y Estados de Cuenta',
      description:
        'Cómo usarlo: Administra cada agencia: visualiza su usuario y clave de taquilla, edita comisiones individuales, asigna cobradores de ruta o abre directamente su estado de cuenta semanal con un solo clic.',
      side: 'top',
      align: 'start',
    },
  },

  // 16. Cobradores: Rutas de Calle
  {
    moduleId: 'Cobradores',
    element: createStepElementResolver('#tour-cobradores-tabs, #menu-cobradores', 'Cobradores'),
    popover: {
      title: '🛵 Cobradores: Rutas de Calle y Cobranza',
      description:
        'Cómo usarlo: Gestiona tu personal de cobranza en calle: "Lista de Cobradores" para consultar el directorio, "Nuevo Cobrador" para crearlo con clave y teléfono, "Asignación de Rutas" para vincular agencias y "Descargar PDF" para imprimir la ruta diaria.',
      side: 'bottom',
      align: 'start',
    },
  },

  // 17. Cobradores: Token QR de Liquidación (10 Minutos)
  {
    moduleId: 'Cobradores',
    element: createStepElementResolver('#tour-cobradores-list, #menu-cobradores', 'Cobradores'),
    popover: {
      title: '🔐 Cobradores: Liquidación Segura con Token QR',
      description:
        'Cómo usarlo: Al momento de recibir efectivo de un cobrador, el sistema genera un Token QR dinámico con validez de 10 minutos. Al escanear el QR desde la taquilla o caja central, el dinero queda descargado y auditado al instante con máxima seguridad.',
      side: 'top',
      align: 'start',
    },
  },

  // 18. Cargar Ventas: Importación Masiva
  {
    moduleId: 'Cargar Ventas',
    element: createStepElementResolver('#tour-cargar-ventas-btn, #menu-cargar-ventas', 'Cargar Ventas'),
    popover: {
      title: '📥 Cargar Ventas: Importación Excel y PDF',
      description:
        'Cómo usarlo: 1. Pulsa "Carga Masiva (Excel / CSV / PDF)". 2. Arrastra las planillas descargadas de los proveedores o comprobantes térmicos en PDF. 3. Selecciona la fecha y el sistema. 4. El motor calcula venta bruta, comisiones y premios automáticamente.',
      side: 'bottom',
      align: 'start',
    },
  },

  // 19. Venta Real: Sincronización y Recálculo
  {
    moduleId: 'Venta Real',
    element: createStepElementResolver('#tour-ventareal-actions, #menu-venta-real', 'Venta Real'),
    popover: {
      title: '📈 Venta Real: Sincronización y Recálculo',
      description:
        'Cómo usarlo: Si ajustaste comisiones de alguna agencia a mitad de semana, usa "Sincronizar con Agencias" para recalcular retroactivamente toda la venta del ciclo con las nuevas tasas. Pulsa "Exportar Excel" para respaldar los datos.',
      side: 'bottom',
      align: 'start',
    },
  },

  // 20. Venta Real: Tablas Consolidadas por Divisa
  {
    moduleId: 'Venta Real',
    element: createStepElementResolver('#tour-ventareal-table, #menu-venta-real', 'Venta Real'),
    popover: {
      title: '📊 Venta Real: Análisis de Rentabilidad',
      description:
        'Cómo usarlo: Inspecciona por divisa (BS, USD, COP) el rendimiento de cada punto de venta: volumen jugado, premios totales pagados, comisión retenida por la agencia y la utilidad neta correspondiente a la comercializadora.',
      side: 'top',
      align: 'start',
    },
  },

  // 21. Pagos Agencias: Registro de Abonos
  {
    moduleId: 'Pagos Agencias',
    element: createStepElementResolver('#tour-pagos-form, #menu-pagos-agencias', 'Pagos Agencias'),
    popover: {
      title: '💳 Pagos Agencias: Registro de Abonos',
      description:
        'Cómo usarlo: 1. Selecciona la agencia en el menú (el sistema te muestra en vivo su saldo adeudado). 2. Indica la moneda y el monto a pagar. 3. Elige el método (Transferencia, Pago Móvil o Efectivo) y banco. 4. Guarda para descontar la deuda de inmediato.',
      side: 'bottom',
      align: 'start',
    },
  },

  // 22. Pagos Agencias: Historial Semanal
  {
    moduleId: 'Pagos Agencias',
    element: createStepElementResolver('#tour-pagos-table, #menu-pagos-agencias', 'Pagos Agencias'),
    popover: {
      title: '📋 Pagos Agencias: Historial y Recibos',
      description:
        'Cómo usarlo: Revisa la relación cronológica de abonos realizados en el ciclo. Puedes verificar números de referencia bancaria, corregir o anular cobros erróneos y generar recibos de entrega para las agencias.',
      side: 'top',
      align: 'start',
    },
  },

  // 23. Gastos por Agencia: Deducciones Operativas
  {
    moduleId: 'Gastos por Agencia',
    element: createStepElementResolver('#tour-gastos-form, #menu-gastos-por-agencia', 'Gastos por Agencia'),
    popover: {
      title: '🧾 Gastos Agencia: Deducciones Operativas',
      description:
        'Cómo usarlo: Registra los gastos operativos directos de cada punto (alquiler de local, internet, luz, papelería, mantenimiento). Selecciona la agencia, el concepto y el monto para que se deduzca automáticamente en su estado de cuenta semanal.',
      side: 'bottom',
      align: 'start',
    },
  },

  // 24. Gastos por Agencia: Historial y Comprobantes
  {
    moduleId: 'Gastos por Agencia',
    element: createStepElementResolver('#tour-gastos-table, #menu-gastos-por-agencia', 'Gastos por Agencia'),
    popover: {
      title: '📑 Gastos Agencia: Control y Comprobantes',
      description:
        'Cómo usarlo: Consulta la lista de gastos autorizados por agencia. Permite visualizar los soportes adjuntos, totalizar por moneda y asegurar que los egresos cuenten con el debido respaldo contable.',
      side: 'top',
      align: 'start',
    },
  },

  // 25. Saldo Agencias: Cartera Pendiente Total
  {
    moduleId: 'Saldo Agencias',
    element: createStepElementResolver('#tour-saldos-summary, #menu-saldo-agencias', 'Saldo Agencias'),
    popover: {
      title: '⚖️ Saldo Agencias: Cartera Total por Divisa',
      description:
        'Cómo usarlo: Consulta la cartera total exigible o por cobrar de toda tu red en Bolívares (BS), Dólares (USD) y Pesos (COP). Alterna entre las pestañas de moneda para conocer la posición financiera global de tu banca.',
      side: 'bottom',
      align: 'start',
    },
  },

  // 26. Saldo Agencias: Liquidación por Taquilla
  {
    moduleId: 'Saldo Agencias',
    element: createStepElementResolver('#tour-saldos-table, #menu-saldo-agencias', 'Saldo Agencias'),
    popover: {
      title: '📊 Saldo Agencias: Liquidación por Taquilla',
      description:
        'Cómo usarlo: Tabla de estado de cuenta cruzado por agencia: Saldo Anterior + Utilidad Ciclo - Gastos - Cobros + Premios = Balance Final. Emite estados de cuenta individuales en PDF o compártelos por WhatsApp con cada encargado.',
      side: 'top',
      align: 'start',
    },
  },

  // 27. Pagos a Proveedores: Liquidación Casa Matriz
  {
    moduleId: 'Pagos a Proveedores',
    element: createStepElementResolver('#tour-pagosprov-form, #menu-pagos-a-proveedores', 'Pagos a Proveedores'),
    popover: {
      title: '🤝 Pagos Proveedor: Liquidación Casa Matriz',
      description:
        'Cómo usarlo: Registra los pagos y liquidaciones efectuadas hacia las casas matrices u operadoras de lotería (ej. Betm3, Keno). Asienta el proveedor, moneda, banco emisor y referencia para mantener al día tus cuentas por pagar mayoristas.',
      side: 'bottom',
      align: 'start',
    },
  },

  // 28. Reporte Proveedores: Rendición GGR
  {
    moduleId: 'Reporte Proveedores',
    element: createStepElementResolver('#tour-reporteprov-table, #menu-reporte-proveedores', 'Reporte Proveedores'),
    popover: {
      title: '📋 Rendición Proveedores: GGR y Diferencial',
      description:
        'Cómo usarlo: Cuadro de conciliación mayorista: audita venta bruta, premios pagados, GGR (Gross Gaming Revenue), comisión completa del proveedor, comisión de agencias, diferencial a favor del comercializador y balance final neto.',
      side: 'top',
      align: 'start',
    },
  },

  // 29. Gastos Administrativos: Egresos Centrales
  {
    moduleId: 'Gastos Administrativos',
    element: createStepElementResolver('#tour-gastosadmin-form, #menu-gastos-administrativos', 'Gastos Administrativos'),
    popover: {
      title: '🧮 Gastos Administrativos: Egresos Centrales',
      description:
        'Cómo usarlo: Registra los egresos operativos corporativos de la comercializadora (nómina de supervisores y choferes, servidores web, telecomunicaciones, insumos). Asigna categoría, moneda, beneficiario y número de recibo correlativo.',
      side: 'bottom',
      align: 'start',
    },
  },

  // 30. Gastos Administrativos: Bitácora y Recibos
  {
    moduleId: 'Gastos Administrativos',
    element: createStepElementResolver('#tour-gastosadmin-table, #menu-gastos-administrativos', 'Gastos Administrativos'),
    popover: {
      title: '📑 Gastos Administrativos: Bitácora y Recibos',
      description:
        'Cómo usarlo: Bitácora histórica clasificada por categoría y moneda. Permite auditar los egresos del ciclo actual o históricos e imprimir recibos oficiales continuos de egreso de caja para soporte de contabilidad.',
      side: 'top',
      align: 'start',
    },
  },

  // 31. Cierre: Actas Oficiales PDF
  {
    moduleId: 'Cierre ',
    element: createStepElementResolver('#tour-cierre-actas, #menu-cierre', 'Cierre '),
    popover: {
      title: '🔒 Centro de Cierre: Emisión de Actas PDF',
      description:
        'Cómo usarlo: Antes del corte de ciclo, genera las Actas Oficiales de Auditoría: 1. Acta General Consolidada, 2. Acta de Gastos Agencias, 3. Acta de Gastos Comercializadora, 4. Acta de Bancos, 5. Acta de Efectivo y 6. Acta de Cobradores en Ruta.',
      side: 'bottom',
      align: 'start',
    },
  },

  // 32. Cierre: Arqueo Multi-Cajas BS / USD / COP
  {
    moduleId: 'Cierre ',
    element: createStepElementResolver('#tour-cierre-cajas, #menu-cierre', 'Cierre '),
    popover: {
      title: '📦 Cierre: Arqueo Multi-Cajas BS / USD / COP',
      description:
        'Cómo usarlo: Audita las 3 Cajas Maestras en BS, USD y COP. Al validar que el dinero físico y saldos en banco cuadran con el sistema, confirma las casillas de verificación de Agencias y Proveedores para ejecutar el cierre y avanzar de semana.',
      side: 'top',
      align: 'start',
    },
  },

  // 33. Auditoría: Seguridad y Trazabilidad
  {
    moduleId: 'Auditoría',
    element: createStepElementResolver('#tour-auditoria-header, #menu-auditoria', 'Auditoría'),
    popover: {
      title: '🛡️ Auditoría: Trazabilidad Inmutable',
      description:
        'Cómo usarlo: Bitácora forense de seguridad. Monitorea confirmaciones de pago, ajustes de saldo, inicios de sesión y aperturas/cierres. Puedes descargar el Acta Oficial de Auditoría en PDF para contraloría o auditoría externa.',
      side: 'bottom',
      align: 'start',
    },
  },

  // 34. Auditoría: Log Cronológico
  {
    moduleId: 'Auditoría',
    element: createStepElementResolver('#tour-auditoria-table, #menu-auditoria', 'Auditoría'),
    popover: {
      title: '📋 Auditoría: Log Cronológico Certificado',
      description:
        'Cómo usarlo: Inspecciona cada evento en tiempo real con fecha, hora exacta, usuario responsable, dirección IP de origen, módulo afectado y la descripción detallada de la operación realizada.',
      side: 'top',
      align: 'start',
    },
  },

  // 35. Ajustes: Ciclo Operativo
  {
    moduleId: 'Ajustes',
    element: createStepElementResolver('#tour-ajustes-ciclo, #menu-ajustes', 'Ajustes'),
    popover: {
      title: '⚙️ Ajustes: Ciclo Operativo y Fechas',
      description:
        'Cómo usarlo: Configura el tipo de corte de tu negocio (Semanal o Diario), el número de semana activa y las fechas maestras (Desde / Hasta) que controlan la consolidación de ventas y pagos en toda la plataforma.',
      side: 'bottom',
      align: 'start',
    },
  },

  // 36. Ajustes: Apariencia y Tema
  {
    moduleId: 'Ajustes',
    element: createStepElementResolver('#tour-ajustes-apariencia, #menu-ajustes', 'Ajustes'),
    popover: {
      title: '🎨 Ajustes: Selector de Apariencia y Tema',
      description:
        'Cómo usarlo: Personaliza la interfaz según tu preferencia: Modo Oscuro (alto contraste y descanso visual), Modo Claro o Modo Automático que alterna el tema según la hora del día.',
      side: 'top',
      align: 'start',
    },
  },

  // 37. Usuarios: Alta y Roles
  {
    moduleId: 'Usuarios',
    element: createStepElementResolver('#tour-usuarios-btn, #menu-usuarios', 'Usuarios'),
    popover: {
      title: '👥 Usuarios: Operadores y Supervisores',
      description:
        'Cómo usarlo: Haz clic en "Nuevo Usuario" para registrar operadores auxiliares, supervisores de ruta, cajeros o contadores. Asigna credenciales personales y selecciona exactamente qué módulos pueden ver y cuáles permanecen bloqueados.',
      side: 'bottom',
      align: 'start',
    },
  },

  // 38. Usuarios: Gestión Granular de Permisos
  {
    moduleId: 'Usuarios',
    element: createStepElementResolver('#tour-usuarios-list, #menu-usuarios', 'Usuarios'),
    popover: {
      title: '🔐 Usuarios: Gestión Granular de Permisos',
      description:
        'Cómo usarlo: Administra tu equipo: modifica roles (Empleado, Auditor, Contador, Administrador), añade o remueve permisos por módulo en tiempo real o revoca accesos de inmediato cuando sea necesario.',
      side: 'top',
      align: 'start',
    },
  },

  // 39. Finalización y Reinicio del Tour
  {
    element: createStepElementResolver('#header-tour-btn'),
    popover: {
      title: '🎓 ¡Recorrido Explicativo Completado!',
      description:
        '¡Felicitaciones! Has completado el recorrido operativo por todos los módulos del Control Maestro Multibanca Express. Puedes volver a iniciar este demo explicativo en cualquier momento pulsando este botón "Tour Demo".',
      side: 'bottom',
      align: 'end',
    },
  },
];

/**
 * Inicia el tour guiado interactivo de Multibanca Express CRM
 * Navega automáticamente hacia el interior de cada pantalla y explica detalladamente el uso de cada herramienta.
 * @param force Si es true, inicia el tour incluso si el usuario ya lo vio previamente
 */
export function startOnboardingTour(force: boolean = false) {
  if (!force) {
    const alreadySeen = localStorage.getItem(TOUR_STORAGE_KEY);
    if (alreadySeen) return;
  }

  const driverObj = driver({
    showProgress: true,
    animate: true,
    overlayColor: '#000000',
    overlayOpacity: 0.75,
    stagePadding: 8,
    stageRadius: 14,
    smoothScroll: true,
    waitForElement: 2500,
    skipMissingElement: true,
    allowClose: true,
    nextBtnText: 'Siguiente →',
    prevBtnText: '← Anterior',
    doneBtnText: '¡Comenzar a Operar! 🚀',
    progressText: '{{current}} de {{total}}',
    popoverClass: 'me-driver-theme',
    onHighlightStarted: (element, step) => {
      const stepItem = step as TourStepExtended;

      // 1. Asegurar navegación hacia el módulo correspondiente si difiere del actual
      if (stepItem.moduleId && tourNavigator && currentActiveModule !== stepItem.moduleId) {
        currentActiveModule = stepItem.moduleId;
        tourNavigator(stepItem.moduleId);
      }

      // 2. Desplazar suavemente el elemento resaltado al centro del viewport
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
      }
    },
    onDestroyed: () => {
      localStorage.setItem(TOUR_STORAGE_KEY, 'true');
    },
    steps: tourSteps,
  });

  driverObj.drive();
}

/**
 * Resetea el indicador del tour para que vuelva a mostrarse
 */
export function resetOnboardingTour() {
  localStorage.removeItem(TOUR_STORAGE_KEY);
  startOnboardingTour(true);
}
