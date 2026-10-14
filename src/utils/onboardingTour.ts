import { driver, type DriveStep } from 'driver.js';
import 'driver.js/dist/driver.css';

const TOUR_STORAGE_KEY = 'me_cms_tour_completed_v1';

export const tourSteps: DriveStep[] = [
  {
    element: '#sidebar-subscriber-card',
    popover: {
      title: '🏢 Operadora & Plan Activo',
      description:
        'Aquí visualizas el nombre comercial de tu Operadora/Banca, tu Plan SaaS activo (Básico, Profesional o Elite) y el usuario suscrito. Tu plan determina el límite de agencias y herramientas disponibles.',
      side: 'right',
      align: 'start',
    },
  },
  {
    element: '#menu-inicio',
    popover: {
      title: '📊 Tablero Principal (Dashboard)',
      description:
        'Resumen gráfico en tiempo real con ventas netas, comisiones, pagos confirmados y balance consolidado multidivisa (Bolívares BS, Dólares USD y Pesos COP).',
      side: 'right',
      align: 'start',
    },
  },
  {
    element: '#menu-confirmaciones, #menu-pizarra-confirmaciones',
    popover: {
      title: '⚡ Pizarra de Confirmaciones',
      description:
        'El corazón operativo en tiempo real. Valida y confirma depósitos bancarios, transferencias y entregas de cobradores con lectura OCR instantánea y sincronización en 0 ms.',
      side: 'right',
      align: 'start',
    },
  },
  {
    element: '#menu-rep-confirmaciones',
    popover: {
      title: '📑 Reporte de Confirmaciones',
      description:
        'Historial de auditoría completo de todos los pagos aprobados y rechazados, con filtros avanzados por fecha, agencia, cajero y método de pago.',
      side: 'right',
      align: 'start',
    },
  },
  {
    element: '#menu-sistemas, #menu-config-proveedores',
    popover: {
      title: '🎰 Catálogo de Sistemas',
      description:
        'Administra los sistemas de lotería y apuestas (Animalitos, Ruletas, Parley). Configura la lectura de columnas para procesar automáticamente los reportes diarios.',
      side: 'right',
      align: 'start',
    },
  },
  {
    element: '#menu-monedas',
    popover: {
      title: '💵 Catálogo Multidivisa',
      description:
        'Configura las monedas oficiales de tu banca (BS, USD, COP). Todos los balances y cálculos financieros operan en multidivisa nativa e independiente.',
      side: 'right',
      align: 'start',
    },
  },
  {
    element: '#menu-cuentas-bancarias',
    popover: {
      title: '🏦 Cuentas Bancarias',
      description:
        'Registra las cuentas bancarias de la operadora asignadas a tus taquillas y agencias para la recepción de transferencias y pago móvil.',
      side: 'right',
      align: 'start',
    },
  },
  {
    element: '#menu-agencias',
    popover: {
      title: '🏪 Red de Agencias y Taquillas',
      description:
        'Gestión total de puntos de venta: asigna comisiones, sistemas permitidos, cuentas bancarias y credenciales de acceso para el personal de Taquilla Web.',
      side: 'right',
      align: 'start',
    },
  },
  {
    element: '#menu-cobradores',
    popover: {
      title: '🛵 Cobradores en Ruta y Token QR',
      description:
        'Gestiona tu equipo de cobradores en la calle. Incluye validación de cobros en efectivo con tokens QR de 10 minutos de alta seguridad.',
      side: 'right',
      align: 'start',
    },
  },
  {
    element: '#menu-cargar-ventas',
    popover: {
      title: '📥 Carga de Ventas Diarias',
      description:
        'Importa planillas Excel o tickets en PDF de tus sistemas de lotería. El sistema calcula automáticamente la venta neta, comisiones y premios a liquidar.',
      side: 'right',
      align: 'start',
    },
  },
  {
    element: '#menu-pagos-agencias',
    popover: {
      title: '💳 Pagos y Abonos de Agencias',
      description:
        'Registro y control de abonos bancarios o entregas en efectivo que realizan las agencias durante la semana para amortizar su balance.',
      side: 'right',
      align: 'start',
    },
  },
  {
    element: '#menu-gastos-por-agencia, #menu-gastos-agencias, #menu-gastos-administrativos',
    popover: {
      title: '🧾 Gastos por Agencia',
      description:
        'Registra gastos operativos directos de cada punto (alquiler, papelería, internet, viáticos) para que se descuenten automáticamente en su estado de cuenta.',
      side: 'right',
      align: 'start',
    },
  },
  {
    element: '#menu-saldo-agencias',
    popover: {
      title: '⚖️ Balances y Estados de Cuenta',
      description:
        'Liquidación en vivo de cada agencia: cruza ventas, comisiones ganadas, premios pagados, gastos y abonos para obtener el saldo neto por cobrar o pagar.',
      side: 'right',
      align: 'start',
    },
  },
  {
    element: '#menu-venta-real',
    popover: {
      title: '📈 Ventas Reales de Taquillas',
      description:
        'Auditoría y comparación de ventas reales registradas por los terminales frente a los reportes cargados de los proveedores.',
      side: 'right',
      align: 'start',
    },
  },
  {
    element: '#menu-cierre, #menu-cierre-operadora',
    popover: {
      title: '🔒 Cierre de Ciclo Operativo',
      description:
        'Cierre de semana o diario. Congela los saldos finales, traslada los balances pendientes al siguiente ciclo y genera los reportes de liquidación.',
      side: 'right',
      align: 'start',
    },
  },
  {
    element: '#menu-ajustes',
    popover: {
      title: '⚙️ Configuración del Sistema',
      description:
        'Configura el ciclo operativo activo (fechas desde/hasta de la semana), tasas de cambio referenciales y opciones de visualización.',
      side: 'right',
      align: 'start',
    },
  },
  {
    element: '#menu-usuarios',
    popover: {
      title: '👥 Operadores y Permisos',
      description:
        'Crea cuentas para supervisores y operadores auxiliares con permisos granulares por módulo para proteger la información de tu negocio.',
      side: 'right',
      align: 'start',
    },
  },
  {
    element: '#header-tour-btn',
    popover: {
      title: '🎓 Centro de Ayuda y Demo',
      description:
        '¡Listo! Ya conoces la plataforma. Puedes volver a ejecutar este demo guiado en cualquier momento haciendo clic en este botón.',
      side: 'bottom',
      align: 'end',
    },
  },
];

/**
 * Inicia el tour guiado interactivo de Multibanca Express CRM
 * @param force Si es true, inicia el tour incluso si el usuario ya lo vio previamente
 */
export function startOnboardingTour(force: boolean = false) {
  if (!force) {
    const alreadySeen = localStorage.getItem(TOUR_STORAGE_KEY);
    if (alreadySeen) return;
  }

  // Filtrar solo los pasos cuyos elementos existen en el DOM
  // Si estamos en móvil y el sidebar está cerrado, omitimos los que no están presentes
  const availableSteps = tourSteps.filter((step) => {
    if (typeof step.element === 'string') {
      return document.querySelector(step.element) !== null;
    }
    return true;
  });

  if (availableSteps.length === 0) return;

  const driverObj = driver({
    showProgress: true,
    animate: true,
    overlayColor: '#000000',
    overlayOpacity: 0.75,
    stagePadding: 6,
    stageRadius: 12,
    smoothScroll: true,
    skipMissingElement: true,
    allowClose: true,
    nextBtnText: 'Siguiente →',
    prevBtnText: '← Anterior',
    doneBtnText: '¡Comenzar a Operar! 🚀',
    progressText: '{{current}} de {{total}}',
    popoverClass: 'me-driver-theme',
    onDestroyed: () => {
      localStorage.setItem(TOUR_STORAGE_KEY, 'true');
    },
    steps: availableSteps,
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
