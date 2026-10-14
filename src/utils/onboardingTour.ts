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

export function notifyCurrentModule(mod: ModuleId) {
  currentActiveModule = mod;
}

export interface TourStepExtended extends DriveStep {
  moduleId?: ModuleId;
  menuDomId?: string;
}

/**
 * Helper para resolver el elemento DOM del interior de un módulo.
 * Si el módulo no está activo, ejecuta inmediatamente la navegación React
 * y acciona el botón del menú lateral para garantizar el cambio de pantalla.
 */
function resolveModuleStep(selector: string, moduleId: ModuleId, menuDomId: string): any {
  return () => {
    // 1. Asegurar navegación React hacia el módulo
    if (currentActiveModule !== moduleId) {
      currentActiveModule = moduleId;
      if (tourNavigator) {
        tourNavigator(moduleId);
      }
      const menuBtn = document.getElementById(menuDomId);
      if (menuBtn) {
        menuBtn.click();
      }
    }

    // 2. Buscar elemento interior en el DOM
    const el = document.querySelector(selector) as HTMLElement | null;
    return el;
  };
}

export const tourSteps: TourStepExtended[] = [
  // =========================================================================
  // 0. SUSCRIPTOR & PLAN CONTRATADO
  // =========================================================================
  {
    element: '#sidebar-subscriber-card',
    popover: {
      title: '🏢 Operadora & Plan Contratado',
      description:
        'Aquí visualizas la razón social de tu comercializadora o banca, el Plan SaaS activo (Básico, Profesional o Elite) y el usuario suscrito. Tu Plan Elite te otorga hasta 1.000 agencias activas y acceso irrestricto a todos los módulos maestros.',
      side: 'right',
      align: 'start',
    },
  },

  // =========================================================================
  // 1. INICIO (DASHBOARD EJECUTIVO)
  // =========================================================================
  {
    element: '#menu-inicio',
    popover: {
      title: '📌 Menú Inicio',
      description:
        'Opción principal de navegación. Haz clic aquí en cualquier momento para regresar al Centro de Control Ejecutivo y Monitoreo General de tu banca.',
      side: 'right',
      align: 'start',
    },
  },
  {
    moduleId: 'Inicio',
    menuDomId: 'menu-inicio',
    element: resolveModuleStep('#tour-inicio-header', 'Inicio', 'menu-inicio'),
    popover: {
      title: '📊 Inicio: Encabezado y Ciclo Activo',
      description:
        'Cómo usarlo: Muestra el estado de conexión del SaaS, el nombre oficial de la operadora y el ciclo operativo activo (Semana, Tipo de Corte y rango de fechas Desde / Hasta). El botón circular permite refrescar todas las métricas al instante.',
      side: 'bottom',
      align: 'start',
    },
  },
  {
    moduleId: 'Inicio',
    menuDomId: 'menu-inicio',
    element: resolveModuleStep('#tour-inicio-kpi', 'Inicio', 'menu-inicio'),
    popover: {
      title: '📈 Inicio: Indicadores en Tiempo Real (KPIs)',
      description:
        'Cómo usarlo: Supervisa 4 métricas críticas: 1. Agencias activas frente al límite contratado. 2. Pagos pendientes de validar en la Pizarra de Confirmaciones. 3. Cobradores activos en ruta. 4. Efectivo total circulando en calle antes de entrar a caja central.',
      side: 'bottom',
      align: 'start',
    },
  },
  {
    moduleId: 'Inicio',
    menuDomId: 'menu-inicio',
    element: resolveModuleStep('#tour-inicio-balances', 'Inicio', 'menu-inicio'),
    popover: {
      title: '💰 Inicio: Balance Multidivisa Consolidado',
      description:
        'Cómo usarlo: Consulta la salud financiera en Bolívares (BS), Dólares (USD) y Pesos (COP). Aplica la fórmula: Saldo Anterior + Utilidad Ciclo - Gastos Agencias - Gastos Comercializadora - Cobros + Premios = Balance Final Neto. Pulsa "Ver Detalle" para auditar cada taquilla.',
      side: 'top',
      align: 'start',
    },
  },

  // =========================================================================
  // 2. CONFIRMACIONES (PIZARRA EN TIEMPO REAL)
  // =========================================================================
  {
    element: '#menu-confirmaciones',
    popover: {
      title: '📌 Menú Confirmaciones',
      description:
        'Accede a la Pizarra de Validación en tiempo real (0 ms) para procesar los reportes de pago emitidos por los cajeros desde la Taquilla Web.',
      side: 'right',
      align: 'start',
    },
  },
  {
    moduleId: 'Confirmaciones',
    menuDomId: 'menu-confirmaciones',
    element: resolveModuleStep('#tour-confirmaciones-header', 'Confirmaciones', 'menu-confirmaciones'),
    popover: {
      title: '⚡ Confirmaciones: Barra de Acciones',
      description:
        'Cómo usarlo: Usa "Sincronización Rápida" para refrescar nuevas transferencias entrantes o "Confirmar Todo" para validar en bloque pagos previamente verificados por tesorería en tus cuentas bancarias.',
      side: 'bottom',
      align: 'start',
    },
  },
  {
    moduleId: 'Confirmaciones',
    menuDomId: 'menu-confirmaciones',
    element: resolveModuleStep('#tour-confirmaciones-metrics', 'Confirmaciones', 'menu-confirmaciones'),
    popover: {
      title: '📊 Confirmaciones: Métricas de Pagos por Validar',
      description:
        'Cómo usarlo: Monitorea cuántas transacciones están en espera y el monto total acumulado por moneda (BS, USD, COP). Te permite priorizar las aprobaciones de mayor importe.',
      side: 'bottom',
      align: 'start',
    },
  },
  {
    moduleId: 'Confirmaciones',
    menuDomId: 'menu-confirmaciones',
    element: resolveModuleStep('#tour-confirmaciones-board', 'Confirmaciones', 'menu-confirmaciones'),
    popover: {
      title: '🔍 Confirmaciones: Tarjetas y Escaneo OCR',
      description:
        'Cómo usarlo: Cada tarjeta representa un pago pendiente con su comprobante adjunto. Haz clic para ampliar y activar el escaneo OCR del número de referencia bancaria. Pulsa "Aprobar" para acreditar el saldo o "Rechazar" indicando el motivo al cajero.',
      side: 'top',
      align: 'start',
    },
  },

  // =========================================================================
  // 3. CONFIRMADOS (HISTORIAL & CUSTODIA)
  // =========================================================================
  {
    element: '#menu-confirmados',
    popover: {
      title: '📌 Menú Confirmados',
      description:
        'Accede al registro histórico de transacciones aprobadas, auditoría de pagos rechazados y conciliación de custodia de efectivo.',
      side: 'right',
      align: 'start',
    },
  },
  {
    moduleId: 'Confirmados',
    menuDomId: 'menu-confirmados',
    element: resolveModuleStep('#tour-confirmados-tabs', 'Confirmados', 'menu-confirmados'),
    popover: {
      title: '📑 Confirmados: Vistas de Rendición y Arqueo',
      description:
        'Cómo usarlo: 1. "Reporte General" para ver todas las operaciones aprobadas. 2. "Auditoría Rechazados" para fiscalizar pagos denegados y sus causas. 3. "Arqueo y Efectivo" para conciliar el dinero físico bajo custodia en cada taquilla.',
      side: 'bottom',
      align: 'start',
    },
  },
  {
    moduleId: 'Confirmados',
    menuDomId: 'menu-confirmados',
    element: resolveModuleStep('#tour-confirmados-filters', 'Confirmados', 'menu-confirmados'),
    popover: {
      title: '🔎 Confirmados: Filtros y Exportación CSV',
      description:
        'Cómo usarlo: Filtra por rango de fechas (Desde / Hasta), agencia o banco. Pulsa "Exportar CSV" para descargar la planilla oficial de transacciones y conciliarla directamente contra tus extractos bancarios.',
      side: 'bottom',
      align: 'start',
    },
  },
  {
    moduleId: 'Confirmados',
    menuDomId: 'menu-confirmados',
    element: resolveModuleStep('#tour-confirmados-table', 'Confirmados', 'menu-confirmados'),
    popover: {
      title: '📋 Confirmados: Detalle Cronológico de Transacciones',
      description:
        'Cómo usarlo: Tabla de auditoría que detalla fecha, agencia, cajero responsable, banco receptor, número de referencia, concepto y monto verificado.',
      side: 'top',
      align: 'start',
    },
  },

  // =========================================================================
  // 4. SISTEMAS Y PROVEEDORES
  // =========================================================================
  {
    element: '#menu-sistemas',
    popover: {
      title: '📌 Menú Sistemas',
      description:
        'Accede al Catálogo de Sistemas de Lotería y Proveedores para administrar conexiones a plataformas de apuestas (Animalitos, Ruletas, Parley, Hipismo).',
      side: 'right',
      align: 'start',
    },
  },
  {
    moduleId: 'Sistemas',
    menuDomId: 'menu-sistemas',
    element: resolveModuleStep('#tour-sistemas-form-inputs', 'Sistemas', 'menu-sistemas'),
    popover: {
      title: '🎰 Sistemas: Identificación y Mapeo de Archivos',
      description:
        'Cómo usarlo: 1. Ingresa el nombre del proveedor (ej. CDAPUESTAS, BETM3, KENO). 2. Define las palabras clave de las columnas de tus planillas Excel/PDF (ID Agencia, Venta, Premios) para que el lector inteligente las reconozca automáticamente.',
      side: 'bottom',
      align: 'start',
    },
  },
  {
    moduleId: 'Sistemas',
    menuDomId: 'menu-sistemas',
    element: resolveModuleStep('#tour-sistemas-form-conditions', 'Sistemas', 'menu-sistemas'),
    popover: {
      title: '⚙️ Sistemas: Comisiones y Saldos de Arrastre',
      description:
        'Cómo usarlo: Fija el % de comisión del comercializador, % de participación sobre utilidades y saldos iniciales de arrastre por divisa (BS, USD, COP). Pulsa "Guardar Sistema" para que los cálculos de venta se automaticen.',
      side: 'bottom',
      align: 'start',
    },
  },
  {
    moduleId: 'Sistemas',
    menuDomId: 'menu-sistemas',
    element: resolveModuleStep('#tour-sistemas-table', 'Sistemas', 'menu-sistemas'),
    popover: {
      title: '📋 Sistemas: Catálogo de Proveedores Activos',
      description:
        'Cómo usarlo: Revisa todas las casas habilitadas. Usa los botones de acción para editar comisiones contractuales, ajustar saldos de arrastre iniciales o eliminar sistemas que no operen en tu banca.',
      side: 'top',
      align: 'start',
    },
  },

  // =========================================================================
  // 5. MONEDAS Y DIVISAS
  // =========================================================================
  {
    element: '#menu-monedas',
    popover: {
      title: '📌 Menú Monedas',
      description:
        'Accede a la gestión de divisas operativas de trabajo en tu banca comercial.',
      side: 'right',
      align: 'start',
    },
  },
  {
    moduleId: 'Monedas',
    menuDomId: 'menu-monedas',
    element: resolveModuleStep('#tour-monedas-form', 'Monedas', 'menu-monedas'),
    popover: {
      title: '💵 Monedas: Alta de Nuevas Divisas',
      description:
        'Cómo usarlo: Escribe el código de la divisa (ej. BS, USD, COP, USDT) y pulsa "GUARDAR MONEDA". Cada divisa opera de forma 100% independiente en ventas, gastos, cobros y arqueos, garantizando cero distorsión cambiaria.',
      side: 'bottom',
      align: 'start',
    },
  },
  {
    moduleId: 'Monedas',
    menuDomId: 'menu-monedas',
    element: resolveModuleStep('#tour-monedas-table', 'Monedas', 'menu-monedas'),
    popover: {
      title: '🪙 Monedas: Divisas Habilitadas en el SaaS',
      description:
        'Cómo usarlo: Catálogo de monedas configuradas. Puedes eliminar divisas que tu banca ya no comercialice o auditar los símbolos oficiales que rigen los balances del sistema.',
      side: 'top',
      align: 'start',
    },
  },

  // =========================================================================
  // 6. CUENTAS BANCARIAS & POS
  // =========================================================================
  {
    element: '#menu-cuentas-bancarias',
    popover: {
      title: '📌 Menú Cuentas Bancarias & POS',
      description:
        'Accede a la administración de cuentas bancarias receptoras y terminales de punto de venta asignados a tus agencias.',
      side: 'right',
      align: 'start',
    },
  },
  {
    moduleId: 'Cuentas Bancarias',
    menuDomId: 'menu-cuentas-bancarias',
    element: resolveModuleStep('#tour-cuentas-tabs', 'Cuentas Bancarias', 'menu-cuentas-bancarias'),
    popover: {
      title: '🏦 Cuentas y POS: Gestión Receptora',
      description:
        'Cómo usarlo: Alterna entre "Cuentas Bancarias" (para administrar cuentas receptoras de transferencias y Pago Móvil) y "Puntos de Venta (POS)" (para controlar terminales BioPago o dispositivos inalámbricos asignados a taquillas).',
      side: 'bottom',
      align: 'start',
    },
  },
  {
    moduleId: 'Cuentas Bancarias',
    menuDomId: 'menu-cuentas-bancarias',
    element: resolveModuleStep('#tour-cuentas-btn', 'Cuentas Bancarias', 'menu-cuentas-bancarias'),
    popover: {
      title: '➕ Cuentas: Alta de Cuentas y Terminales',
      description:
        'Cómo usarlo: Pulsa "+ NUEVA CUENTA" para registrar banco, número de cuenta de 20 dígitos, titular, moneda y agencias autorizadas a depositar en ella. En la sección POS, vincula el serial TID para habilitar cobros con tarjeta en taquilla.',
      side: 'bottom',
      align: 'start',
    },
  },
  {
    moduleId: 'Cuentas Bancarias',
    menuDomId: 'menu-cuentas-bancarias',
    element: resolveModuleStep('#tour-cuentas-table', 'Cuentas Bancarias', 'menu-cuentas-bancarias'),
    popover: {
      title: '📋 Cuentas: Monitoreo de Cuentas Receptoras',
      description:
        'Cómo usarlo: Lista de cuentas bancarias activas con sus métodos aceptados (Pago Móvil, Transferencias), saldo inicial y agencias autorizadas a reportar depósitos.',
      side: 'top',
      align: 'start',
    },
  },

  // =========================================================================
  // 7. AGENCIAS Y TAQUILLAS
  // =========================================================================
  {
    element: '#menu-agencias',
    popover: {
      title: '📌 Menú Agencias',
      description:
        'Accede a la administración de tu red comercial de agencias, taquillas y puntos de venta.',
      side: 'right',
      align: 'start',
    },
  },
  {
    moduleId: 'Agencias',
    menuDomId: 'menu-agencias',
    element: resolveModuleStep('#tour-agencias-actions', 'Agencias', 'menu-agencias'),
    popover: {
      title: '🏪 Agencias: Alta de Nuevos Puntos',
      description:
        'Cómo usarlo: Haz clic en "+ NUEVA AGENCIA" para registrar un punto de venta. Configura su nombre comercial, comisión asignada, sistemas autorizados y genera las credenciales de acceso para que el cajero opere en Taquilla Web.',
      side: 'bottom',
      align: 'start',
    },
  },
  {
    moduleId: 'Agencias',
    menuDomId: 'menu-agencias',
    element: resolveModuleStep('#tour-agencias-quota', 'Agencias', 'menu-agencias'),
    popover: {
      title: '📈 Agencias: Cupo y Capacidad de Plan',
      description:
        'Cómo usarlo: Monitorea en vivo la cantidad de taquillas activas respecto a tu cuota contratada. Con tu Plan Elite cuentas con hasta 1.000 agencias para expandir tu red comercial sin límites técnicos.',
      side: 'bottom',
      align: 'start',
    },
  },
  {
    moduleId: 'Agencias',
    menuDomId: 'menu-agencias',
    element: resolveModuleStep('#tour-agencias-table', 'Agencias', 'menu-agencias'),
    popover: {
      title: '🔑 Agencias: Directorio y Credenciales',
      description:
        'Cómo usarlo: Administra cada agencia: visualiza su usuario y clave de taquilla, edita comisiones individuales, asigna cobradores de ruta o abre directamente su estado de cuenta semanal con un solo clic.',
      side: 'top',
      align: 'start',
    },
  },

  // =========================================================================
  // 8. COBRADORES EN RUTA & TOKEN QR
  // =========================================================================
  {
    element: '#menu-cobradores',
    popover: {
      title: '📌 Menú Cobradores',
      description:
        'Accede a la gestión de cobradores de calle, asignación de rutas y liquidaciones seguras con Token QR.',
      side: 'right',
      align: 'start',
    },
  },
  {
    moduleId: 'Cobradores',
    menuDomId: 'menu-cobradores',
    element: resolveModuleStep('#tour-cobradores-tabs', 'Cobradores', 'menu-cobradores'),
    popover: {
      title: '🛵 Cobradores: Rutas de Calle y Cobranza',
      description:
        'Cómo usarlo: Gestiona tu personal de cobranza: "Lista de Cobradores" para ver el directorio, "Nuevo Cobrador" para crearlo con clave y teléfono, "Asignación de Rutas" para vincular agencias y "Descargar PDF" para imprimir la ruta diaria.',
      side: 'bottom',
      align: 'start',
    },
  },
  {
    moduleId: 'Cobradores',
    menuDomId: 'menu-cobradores',
    element: resolveModuleStep('#tour-cobradores-kpi', 'Cobradores', 'menu-cobradores'),
    popover: {
      title: '📊 Cobradores: Métricas de Recaudación',
      description:
        'Cómo usarlo: Indicadores en vivo que detallan la cantidad de cobradores en ruta, agencias visitadas y el efectivo total recaudado que viaja en calle.',
      side: 'bottom',
      align: 'start',
    },
  },
  {
    moduleId: 'Cobradores',
    menuDomId: 'menu-cobradores',
    element: resolveModuleStep('#tour-cobradores-list', 'Cobradores', 'menu-cobradores'),
    popover: {
      title: '🔐 Cobradores: Token QR de Liquidación (10 Min)',
      description:
        'Cómo usarlo: Al momento de recibir efectivo de un cobrador, el sistema genera un Token QR dinámico con validez de 10 minutos. Al escanear el QR desde la taquilla o caja central, el dinero queda descargado y auditado al instante con máxima seguridad.',
      side: 'top',
      align: 'start',
    },
  },

  // =========================================================================
  // 9. CARGAR VENTAS (IMPORTACIÓN MASIVA)
  // =========================================================================
  {
    element: '#menu-cargar-ventas',
    popover: {
      title: '📌 Menú Cargar Ventas',
      description:
        'Accede al módulo de importación de reportes de ventas diarios en planillas Excel o tickets térmicos PDF.',
      side: 'right',
      align: 'start',
    },
  },
  {
    moduleId: 'Cargar Ventas',
    menuDomId: 'menu-cargar-ventas',
    element: resolveModuleStep('#tour-cargar-ventas-actions', 'Cargar Ventas', 'menu-cargar-ventas'),
    popover: {
      title: '📥 Cargar Ventas: Herramientas de Carga',
      description:
        'Cómo usarlo: Selecciona la fecha de operación y el sistema de apuestas. Usa el botón "Actualizar" para recalcular las ventas cargadas en el ciclo activo.',
      side: 'bottom',
      align: 'start',
    },
  },
  {
    moduleId: 'Cargar Ventas',
    menuDomId: 'menu-cargar-ventas',
    element: resolveModuleStep('#tour-cargar-ventas-btn', 'Cargar Ventas', 'menu-cargar-ventas'),
    popover: {
      title: '📂 Cargar Ventas: Importación Excel y PDF',
      description:
        'Cómo usarlo: Pulsa "Carga Masiva (Excel / CSV / PDF)". Arrastra los archivos descargados de los proveedores o comprobantes térmicos en PDF. El motor inteligente calcula ventas brutas, comisiones y premios automáticamente.',
      side: 'bottom',
      align: 'start',
    },
  },
  {
    moduleId: 'Cargar Ventas',
    menuDomId: 'menu-cargar-ventas',
    element: resolveModuleStep('#tour-cargar-ventas-table', 'Cargar Ventas', 'menu-cargar-ventas'),
    popover: {
      title: '📊 Cargar Ventas: Resumen Consolidado por Sistema',
      description:
        'Cómo usarlo: Muestra el total vendido, comisiones retenidas, premios asignados, venta neta y la utilidad estimada para la operadora y agencias en cada combinación sistema-moneda.',
      side: 'top',
      align: 'start',
    },
  },

  // =========================================================================
  // 10. PAGOS AGENCIAS (ABONOS)
  // =========================================================================
  {
    element: '#menu-pagos-agencias',
    popover: {
      title: '📌 Menú Pagos Agencias',
      description:
        'Accede al registro y control de abonos bancarios y entregas de efectivo efectuadas por las agencias.',
      side: 'right',
      align: 'start',
    },
  },
  {
    moduleId: 'Pagos Agencias',
    menuDomId: 'menu-pagos-agencias',
    element: resolveModuleStep('#tour-pagos-form', 'Pagos Agencias', 'menu-pagos-agencias'),
    popover: {
      title: '💳 Pagos Agencias: Registro de Abonos',
      description:
        'Cómo usarlo: 1. Selecciona la agencia en el menú (el sistema te muestra en vivo su saldo adeudado). 2. Indica la moneda y el monto a pagar. 3. Elige el método (Transferencia, Pago Móvil o Efectivo) y banco. 4. Guarda para descontar la deuda de inmediato.',
      side: 'bottom',
      align: 'start',
    },
  },
  {
    moduleId: 'Pagos Agencias',
    menuDomId: 'menu-pagos-agencias',
    element: resolveModuleStep('#tour-pagos-table', 'Pagos Agencias', 'menu-pagos-agencias'),
    popover: {
      title: '📋 Pagos Agencias: Historial Semanal y Recibos',
      description:
        'Cómo usarlo: Revisa la relación cronológica de abonos realizados en el ciclo. Puedes verificar números de referencia bancaria, corregir o anular cobros erróneos y generar recibos de entrega para las agencias.',
      side: 'top',
      align: 'start',
    },
  },

  // =========================================================================
  // 11. GASTOS POR AGENCIA
  // =========================================================================
  {
    element: '#menu-gastos-por-agencia',
    popover: {
      title: '📌 Menú Gastos por Agencia',
      description:
        'Accede a la carga de gastos operativos directos de cada punto para su deducción en la liquidación semanal.',
      side: 'right',
      align: 'start',
    },
  },
  {
    moduleId: 'Gastos por Agencia',
    menuDomId: 'menu-gastos-por-agencia',
    element: resolveModuleStep('#tour-gastos-form', 'Gastos por Agencia', 'menu-gastos-por-agencia'),
    popover: {
      title: '🧾 Gastos Agencia: Deducciones Operativas',
      description:
        'Cómo usarlo: Registra los gastos operativos directos de cada punto (alquiler de local, internet, luz, papelería, mantenimiento). Selecciona la agencia, el concepto y el monto para que se deduzca automáticamente en su estado de cuenta semanal.',
      side: 'bottom',
      align: 'start',
    },
  },
  {
    moduleId: 'Gastos por Agencia',
    menuDomId: 'menu-gastos-por-agencia',
    element: resolveModuleStep('#tour-gastos-table', 'Gastos por Agencia', 'menu-gastos-por-agencia'),
    popover: {
      title: '📑 Gastos Agencia: Control y Comprobantes',
      description:
        'Cómo usarlo: Consulta la lista de gastos autorizados por agencia. Permite visualizar los soportes adjuntos, totalizar por moneda y asegurar que los egresos cuenten con el debido respaldo contable.',
      side: 'top',
      align: 'start',
    },
  },

  // =========================================================================
  // 12. SALDO AGENCIAS (ESTADOS DE CUENTA)
  // =========================================================================
  {
    element: '#menu-saldo-agencias',
    popover: {
      title: '📌 Menú Saldo Agencias',
      description:
        'Accede a los balances, estados de cuenta y liquidaciones semanales de toda tu red de taquillas.',
      side: 'right',
      align: 'start',
    },
  },
  {
    moduleId: 'Saldo Agencias',
    menuDomId: 'menu-saldo-agencias',
    element: resolveModuleStep('#tour-saldos-summary', 'Saldo Agencias', 'menu-saldo-agencias'),
    popover: {
      title: '⚖️ Saldo Agencias: Cartera Total por Divisa',
      description:
        'Cómo usarlo: Consulta la cartera total exigible o por cobrar de toda tu red en Bolívares (BS), Dólares (USD) y Pesos (COP). Alterna entre las pestañas de moneda para conocer la posición financiera global de tu banca.',
      side: 'bottom',
      align: 'start',
    },
  },
  {
    moduleId: 'Saldo Agencias',
    menuDomId: 'menu-saldo-agencias',
    element: resolveModuleStep('#tour-saldos-table', 'Saldo Agencias', 'menu-saldo-agencias'),
    popover: {
      title: '📊 Saldo Agencias: Liquidación por Taquilla',
      description:
        'Cómo usarlo: Tabla de estado de cuenta cruzado por agencia: Saldo Anterior + Utilidad Ciclo - Gastos - Cobros + Premios = Balance Final. Emite estados de cuenta individuales en PDF o compártelos por WhatsApp con cada encargado.',
      side: 'top',
      align: 'start',
    },
  },

  // =========================================================================
  // 13. VENTA REAL DE TERMINALES
  // =========================================================================
  {
    element: '#menu-venta-real',
    popover: {
      title: '📌 Menú Venta Real',
      description:
        'Accede a la auditoría consolidada de ventas reales registradas por los terminales de taquilla.',
      side: 'right',
      align: 'start',
    },
  },
  {
    moduleId: 'Venta Real',
    menuDomId: 'menu-venta-real',
    element: resolveModuleStep('#tour-ventareal-actions', 'Venta Real', 'menu-venta-real'),
    popover: {
      title: '📈 Venta Real: Sincronización y Recálculo',
      description:
        'Cómo usarlo: Si ajustaste comisiones de alguna agencia a mitad de semana, usa "Sincronizar con Agencias" para recalcular retroactivamente toda la venta del ciclo con las nuevas tasas. Pulsa "Exportar Excel" para respaldar los datos.',
      side: 'bottom',
      align: 'start',
    },
  },
  {
    moduleId: 'Venta Real',
    menuDomId: 'menu-venta-real',
    element: resolveModuleStep('#tour-ventareal-currency', 'Venta Real', 'menu-venta-real'),
    popover: {
      title: '🪙 Venta Real: Filtro por Divisa y Búsqueda',
      description:
        'Cómo usarlo: Alterna entre BS, USD, COP o Todas las monedas, y busca cualquier punto de venta o sistema para auditar rápidamente los registros.',
      side: 'bottom',
      align: 'start',
    },
  },
  {
    moduleId: 'Venta Real',
    menuDomId: 'menu-venta-real',
    element: resolveModuleStep('#tour-ventareal-table', 'Venta Real', 'menu-venta-real'),
    popover: {
      title: '📊 Venta Real: Análisis de Rentabilidad',
      description:
        'Cómo usarlo: Inspecciona por divisa (BS, USD, COP) el rendimiento de cada punto de venta: volumen jugado, premios totales pagados, comisión retenida por la agencia y la utilidad neta correspondiente a la comercializadora.',
      side: 'top',
      align: 'start',
    },
  },

  // =========================================================================
  // 14. PAGOS A PROVEEDORES
  // =========================================================================
  {
    element: '#menu-pagos-a-proveedores',
    popover: {
      title: '📌 Menú Pagos a Proveedores',
      description:
        'Accede a la liquidación y registro de pagos efectuados hacia las empresas operadoras y casas matrices de lotería.',
      side: 'right',
      align: 'start',
    },
  },
  {
    moduleId: 'Pagos a Proveedores',
    menuDomId: 'menu-pagos-a-proveedores',
    element: resolveModuleStep('#tour-pagosprov-form', 'Pagos a Proveedores', 'menu-pagos-a-proveedores'),
    popover: {
      title: '🤝 Pagos Proveedor: Liquidación Casa Matriz',
      description:
        'Cómo usarlo: Registra los pagos y liquidaciones efectuadas hacia las casas matrices u operadoras de lotería (ej. Betm3, Keno). Asienta el proveedor, moneda, banco emisor y referencia para mantener al día tus cuentas por pagar mayoristas.',
      side: 'bottom',
      align: 'start',
    },
  },

  // =========================================================================
  // 15. REPORTE PROVEEDORES (RENDICIÓN GGR)
  // =========================================================================
  {
    element: '#menu-reporte-proveedores',
    popover: {
      title: '📌 Menú Reporte Proveedores',
      description:
        'Accede a la rendición financiera consolidada por casa proveedora: volumen jugado, comisión y liquidación neta.',
      side: 'right',
      align: 'start',
    },
  },
  {
    moduleId: 'Reporte Proveedores',
    menuDomId: 'menu-reporte-proveedores',
    element: resolveModuleStep('#tour-reporteprov-cards', 'Reporte Proveedores', 'menu-reporte-proveedores'),
    popover: {
      title: '📊 Reporte Proveedores: Resumen de Totales',
      description:
        'Cómo usarlo: Tarjetas de control financiero por divisa: Venta Global, Premios Pagados, Total Comisión Comercializador y Neto correspondiente a las Casas Operadoras.',
      side: 'bottom',
      align: 'start',
    },
  },
  {
    moduleId: 'Reporte Proveedores',
    menuDomId: 'menu-reporte-proveedores',
    element: resolveModuleStep('#tour-reporteprov-table', 'Reporte Proveedores', 'menu-reporte-proveedores'),
    popover: {
      title: '📋 Reporte Proveedores: Rendición GGR y Diferencial',
      description:
        'Cómo usarlo: Cuadro de conciliación mayorista: audita venta bruta, premios pagados, GGR (Gross Gaming Revenue), comisión completa del proveedor, comisión de agencias, diferencial a favor del comercializador y balance final neto.',
      side: 'top',
      align: 'start',
    },
  },

  // =========================================================================
  // 16. GASTOS ADMINISTRATIVOS CENTRALES
  // =========================================================================
  {
    element: '#menu-gastos-administrativos',
    popover: {
      title: '📌 Menú Gastos Administrativos',
      description:
        'Accede al registro de egresos operativos centrales de la comercializadora (nómina, servidores, logística, soporte).',
      side: 'right',
      align: 'start',
    },
  },
  {
    moduleId: 'Gastos Administrativos',
    menuDomId: 'menu-gastos-administrativos',
    element: resolveModuleStep('#tour-gastosadmin-kpis', 'Gastos Administrativos', 'menu-gastos-administrativos'),
    popover: {
      title: '💼 Gastos Admin: Egresos Centrales por Moneda',
      description:
        'Cómo usarlo: Muestra el gasto administrativo total acumulado en Bolívares (BS), Dólares (USD) y Pesos (COP) en el ciclo operativo actual.',
      side: 'bottom',
      align: 'start',
    },
  },
  {
    moduleId: 'Gastos Administrativos',
    menuDomId: 'menu-gastos-administrativos',
    element: resolveModuleStep('#tour-gastosadmin-form', 'Gastos Administrativos', 'menu-gastos-administrativos'),
    popover: {
      title: '🧮 Gastos Admin: Registro con Recibo Continuo',
      description:
        'Cómo usarlo: Registra los egresos operativos corporativos de la comercializadora (nómina de supervisores y choferes, servidores web, telecomunicaciones, insumos). Asigna categoría, moneda, beneficiario y número de recibo correlativo.',
      side: 'bottom',
      align: 'start',
    },
  },
  {
    moduleId: 'Gastos Administrativos',
    menuDomId: 'menu-gastos-administrativos',
    element: resolveModuleStep('#tour-gastosadmin-table', 'Gastos Administrativos', 'menu-gastos-administrativos'),
    popover: {
      title: '📑 Gastos Admin: Bitácora Histórica y Recibos',
      description:
        'Cómo usarlo: Bitácora histórica clasificada por categoría y moneda. Permite auditar los egresos del ciclo actual o históricos e imprimir recibos oficiales continuos de egreso de caja para soporte de contabilidad.',
      side: 'top',
      align: 'start',
    },
  },

  // =========================================================================
  // 17. CIERRE SEMANAL & ARQUEO DE CAJAS
  // =========================================================================
  {
    element: '#menu-cierre',
    popover: {
      title: '📌 Menú Cierre',
      description:
        'Accede al Centro de Cierre Semanal, emisión de actas de contraloría y arqueo de cajas multi-moneda.',
      side: 'right',
      align: 'start',
    },
  },
  {
    moduleId: 'Cierre ',
    menuDomId: 'menu-cierre',
    element: resolveModuleStep('#tour-cierre-actas', 'Cierre ', 'menu-cierre'),
    popover: {
      title: '🔒 Cierre: Emisión de las 6 Actas Oficiales en PDF',
      description:
        'Cómo usarlo: Antes del corte de ciclo, genera las Actas Oficiales de Auditoría: 1. Acta General Consolidada, 2. Acta de Gastos Agencias, 3. Acta de Gastos Comercializadora, 4. Acta de Bancos, 5. Acta de Efectivo y 6. Acta de Cobradores en Ruta.',
      side: 'bottom',
      align: 'start',
    },
  },
  {
    moduleId: 'Cierre ',
    menuDomId: 'menu-cierre',
    element: resolveModuleStep('#tour-cierre-cajas', 'Cierre ', 'menu-cierre'),
    popover: {
      title: '📦 Cierre: Arqueo Multi-Cajas BS / USD / COP',
      description:
        'Cómo usarlo: Audita las 3 Cajas Maestras en BS, USD y COP. Al validar que el dinero físico y saldos en banco cuadran con el sistema, confirma las casillas de verificación de Agencias y Proveedores para ejecutar el cierre y avanzar de semana.',
      side: 'top',
      align: 'start',
    },
  },

  // =========================================================================
  // 18. AUDITORÍA FORENSE
  // =========================================================================
  {
    element: '#menu-auditoria',
    popover: {
      title: '📌 Menú Auditoría',
      description:
        'Accede a la bitácora oficial de auditoría, trazabilidad inmutable y seguridad de contraloría.',
      side: 'right',
      align: 'start',
    },
  },
  {
    moduleId: 'Auditoría',
    menuDomId: 'menu-auditoria',
    element: resolveModuleStep('#tour-auditoria-header', 'Auditoría', 'menu-auditoria'),
    popover: {
      title: '🛡️ Auditoría: Certificación Forense',
      description:
        'Cómo usarlo: Centro de trazabilidad inalterable. Monitorea confirmaciones de pago, ajustes de saldo, inicios de sesión y aperturas/cierres. Pulsa "Imprimir Acta de Auditoría" para exportar el documento formal en PDF.',
      side: 'bottom',
      align: 'start',
    },
  },
  {
    moduleId: 'Auditoría',
    menuDomId: 'menu-auditoria',
    element: resolveModuleStep('#tour-auditoria-table', 'Auditoría', 'menu-auditoria'),
    popover: {
      title: '📋 Auditoría: Log Cronológico Certificado',
      description:
        'Cómo usarlo: Inspecciona cada evento en tiempo real con fecha, hora exacta, usuario responsable, dirección IP de origen, módulo afectado y la descripción detallada de la operación realizada.',
      side: 'top',
      align: 'start',
    },
  },

  // =========================================================================
  // 19. AJUSTES DEL CICLO & APARIENCIA
  // =========================================================================
  {
    element: '#menu-ajustes',
    popover: {
      title: '📌 Menú Ajustes',
      description:
        'Accede a la configuración del ciclo operativo (cortes semanal/diario, fechas) y apariencia visual del sistema.',
      side: 'right',
      align: 'start',
    },
  },
  {
    moduleId: 'Ajustes',
    menuDomId: 'menu-ajustes',
    element: resolveModuleStep('#tour-ajustes-ciclo', 'Ajustes', 'menu-ajustes'),
    popover: {
      title: '⚙️ Ajustes: Ciclo Operativo y Fechas Maestras',
      description:
        'Cómo usarlo: Configura el tipo de corte de tu negocio (Semanal o Diario), número de semana activa y fechas maestras (Desde / Hasta) que controlan la consolidación de ventas y pagos en toda la plataforma.',
      side: 'bottom',
      align: 'start',
    },
  },
  {
    moduleId: 'Ajustes',
    menuDomId: 'menu-ajustes',
    element: resolveModuleStep('#tour-ajustes-apariencia', 'Ajustes', 'menu-ajustes'),
    popover: {
      title: '🎨 Ajustes: Selector de Apariencia y Tema',
      description:
        'Cómo usarlo: Personaliza la interfaz según tu preferencia: Modo Oscuro (alto contraste y descanso visual), Modo Claro o Modo Automático que alterna el tema según la hora del día.',
      side: 'top',
      align: 'start',
    },
  },
  {
    moduleId: 'Ajustes',
    menuDomId: 'menu-ajustes',
    element: resolveModuleStep('#tour-ajustes-btn', 'Ajustes', 'menu-ajustes'),
    popover: {
      title: '💾 Ajustes: Guardar Configuración',
      description:
        'Cómo usarlo: Pulsa este botón para guardar las fechas y modalidad de ciclo en la base de datos central de tu suscripción.',
      side: 'top',
      align: 'start',
    },
  },

  // =========================================================================
  // 20. USUARIOS & PERMISOS
  // =========================================================================
  {
    element: '#menu-usuarios',
    popover: {
      title: '📌 Menú Usuarios',
      description:
        'Accede a la administración de usuarios secundarios, supervisores y cajeros con permisos por módulo.',
      side: 'right',
      align: 'start',
    },
  },
  {
    moduleId: 'Usuarios',
    menuDomId: 'menu-usuarios',
    element: resolveModuleStep('#tour-usuarios-btn', 'Usuarios', 'menu-usuarios'),
    popover: {
      title: '👥 Usuarios: Alta de Operadores y Supervisores',
      description:
        'Cómo usarlo: Haz clic en "Nuevo Usuario" para registrar operadores auxiliares, supervisores de ruta, cajeros o contadores. Asigna credenciales personales y selecciona exactamente qué módulos pueden ver y cuáles permanecen bloqueados.',
      side: 'bottom',
      align: 'start',
    },
  },
  {
    moduleId: 'Usuarios',
    menuDomId: 'menu-usuarios',
    element: resolveModuleStep('#tour-usuarios-list', 'Usuarios', 'menu-usuarios'),
    popover: {
      title: '🔐 Usuarios: Gestión Granular de Permisos',
      description:
        'Cómo usarlo: Administra tu equipo: modifica roles (Empleado, Auditor, Contador, Administrador), añade o remueve permisos por módulo en tiempo real o revoca accesos de inmediato cuando sea necesario.',
      side: 'top',
      align: 'start',
    },
  },

  // =========================================================================
  // 21. FINALIZACIÓN Y REINICIO
  // =========================================================================
  {
    element: '#header-tour-btn',
    popover: {
      title: '🎓 ¡Recorrido Explicativo Completado!',
      description:
        '¡Felicitaciones! Has completado el recorrido guiado por todas las opciones del menú lateral y cada una de las secciones internas de los módulos. Puedes volver a iniciar este demo explicativo en cualquier momento pulsando este botón "Tour Demo".',
      side: 'bottom',
      align: 'end',
    },
  },
];

/**
 * Inicia el tour guiado interactivo de Multibanca Express CRM
 * Navega automáticamente hacia cada opción del menú lateral y hacia el interior de cada sección de los módulos.
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
    waitForElement: 3000,
    skipMissingElement: true,
    allowClose: true,
    nextBtnText: 'Siguiente →',
    prevBtnText: '← Anterior',
    doneBtnText: '¡Comenzar a Operar! 🚀',
    progressText: '{{current}} de {{total}}',
    popoverClass: 'me-driver-theme',
    onHighlightStarted: (element, step) => {
      const stepItem = step as TourStepExtended;

      // 1. Si el paso especifica un módulo y difiere del actual, forzar navegación
      if (stepItem.moduleId && currentActiveModule !== stepItem.moduleId) {
        currentActiveModule = stepItem.moduleId;
        if (tourNavigator) {
          tourNavigator(stepItem.moduleId);
        }
        if (stepItem.menuDomId) {
          const btn = document.getElementById(stepItem.menuDomId);
          if (btn) btn.click();
        }
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
