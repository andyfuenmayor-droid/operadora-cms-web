import { driver, type DriveStep } from 'driver.js';
import 'driver.js/dist/driver.css';
import type { ModuleId } from '../types';

const TOUR_STORAGE_KEY = 'me_cms_tour_completed_v1';

export type TourNavigateCallback = (modId: ModuleId) => void;

let tourNavigator: TourNavigateCallback | null = null;

export function registerTourNavigator(fn: TourNavigateCallback) {
  tourNavigator = fn;
}

export interface TourStepExtended extends DriveStep {
  moduleId?: ModuleId;
}

export const tourSteps: TourStepExtended[] = [
  {
    element: '#sidebar-subscriber-card',
    popover: {
      title: '🏢 Operadora & Plan Contratado',
      description:
        'Visualiza la razón social de tu comercializadora o banca, el Plan SaaS activo (Básico, Profesional o Elite) y el usuario suscrito. Tu Plan Elite te otorga hasta 1.000 agencias activas y acceso irrestricto a todos los módulos maestros.',
      side: 'right',
      align: 'start',
    },
  },
  {
    moduleId: 'Inicio',
    element: '#menu-inicio',
    popover: {
      title: '📊 Tablero Principal (Dashboard)',
      description:
        'Centro de control ejecutivo en tiempo real. Monitorea gráficos de ventas brutas y netas, comisiones acumuladas, depósitos bancarios confirmados y balance consolidado en Bolívares (BS), Dólares (USD) y Pesos (COP).',
      side: 'right',
      align: 'start',
    },
  },
  {
    moduleId: 'Confirmaciones',
    element: '#menu-confirmaciones, #menu-pizarra-confirmaciones',
    popover: {
      title: '⚡ Pizarra de Confirmaciones (0 ms)',
      description:
        'Recepción instantánea de pagos de taquillas y cobradores. Integra escaneo inteligente con OCR de capturas de pantalla, confirmación bancaria contra cuentas y sincronización por Webhook en tiempo real.',
      side: 'right',
      align: 'start',
    },
  },
  {
    moduleId: 'Confirmados',
    element: '#menu-confirmados, #menu-rep-confirmaciones',
    popover: {
      title: '📑 Historial de Confirmados',
      description:
        'Bitácora histórica de transacciones aprobadas y rechazadas. Permite filtrar por rango de fechas, agencia, cajero o banco, y exportar actas de custodia de tesorería.',
      side: 'right',
      align: 'start',
    },
  },
  {
    moduleId: 'Sistemas',
    element: '#menu-sistemas',
    popover: {
      title: '🎰 Catálogo de Sistemas de Lotería',
      description:
        'Administra las conexiones a plataformas de apuestas y juegos (Animalitos, Ruletas, Parley, Hipismo). Define los sistemas habilitados para comercialización en tu red.',
      side: 'right',
      align: 'start',
    },
  },
  {
    moduleId: 'Monedas',
    element: '#menu-monedas',
    popover: {
      title: '💵 Gestión Multidivisa Nativa',
      description:
        'Administra las divisas de trabajo (BS, USD, COP). Todos los balances, comisiones, pagos y cierres operan con cuentas separadas por moneda sin distorsión cambiaria.',
      side: 'right',
      align: 'start',
    },
  },
  {
    moduleId: 'Cuentas Bancarias',
    element: '#menu-cuentas-bancarias',
    popover: {
      title: '🏦 Cuentas Bancarias y Puntos POS',
      description:
        'Registra las cuentas receptoras de la banca (Pago Móvil y Transferencias) y dispositivos BioPago / POS asignados a tus agencias y cajeros.',
      side: 'right',
      align: 'start',
    },
  },
  {
    moduleId: 'Agencias',
    element: '#menu-agencias',
    popover: {
      title: '🏪 Red de Agencias y Taquillas',
      description:
        'Gestión total de puntos de venta: asigna porcentajes de comisión, sistemas permitidos, cuentas bancarias asignadas y credenciales de acceso para el personal de Taquilla Web.',
      side: 'right',
      align: 'start',
    },
  },
  {
    moduleId: 'Cobradores',
    element: '#menu-cobradores',
    popover: {
      title: '🛵 Cobradores en Ruta y Token QR',
      description:
        'Control y liquidación de cobradores de calle. Incluye el sistema de tokens QR dinámicos con vencimiento de 10 minutos para liquidar entregas de efectivo en ruta con máxima seguridad.',
      side: 'right',
      align: 'start',
    },
  },
  {
    moduleId: 'Cargar Ventas',
    element: '#menu-cargar-ventas',
    popover: {
      title: '📥 Carga de Ventas Diarias',
      description:
        'Importa reportes de ventas diarios en planillas Excel o tickets térmicos PDF. El algoritmo calcula automáticamente venta neta, comisiones de agencia y premios acumulados.',
      side: 'right',
      align: 'start',
    },
  },
  {
    moduleId: 'Pagos Agencias',
    element: '#menu-pagos-agencias',
    popover: {
      title: '💳 Pagos y Abonos de Agencias',
      description:
        'Registro y control de las entregas en efectivo, transferencias bancarias y abonos realizados por las agencias durante la semana para amortizar su balance.',
      side: 'right',
      align: 'start',
    },
  },
  {
    moduleId: 'Gastos por Agencia',
    element: '#menu-gastos-por-agencia, #menu-gastos-agencias',
    popover: {
      title: '🧾 Gastos por Agencia',
      description:
        'Carga los gastos operativos directos de cada punto (alquiler, luz, internet, papelería, mantenimiento). Se deducen de forma directa en su estado de cuenta semanal.',
      side: 'right',
      align: 'start',
    },
  },
  {
    moduleId: 'Saldo Agencias',
    element: '#menu-saldo-agencias',
    popover: {
      title: '⚖️ Balances y Estados de Cuenta',
      description:
        'Liquidación en vivo de cada agencia: cruza ventas brutas, comisiones, premios pagados, gastos y abonos para calcular el saldo neto exigible o a favor.',
      side: 'right',
      align: 'start',
    },
  },
  {
    moduleId: 'Venta Real',
    element: '#menu-venta-real',
    popover: {
      title: '📈 Venta Real de Terminales',
      description:
        'Auditoría y comparación de ventas reales registradas por los terminales de taquilla versus los reportes suministrados por las plataformas de lotería.',
      side: 'right',
      align: 'start',
    },
  },
  {
    moduleId: 'Pagos a Proveedores',
    element: '#menu-pagos-a-proveedores, #menu-pagos-a-operador',
    popover: {
      title: '🤝 Pagos a Proveedores y Casas Matrices',
      description:
        'Liquidación y control de pagos efectuados hacia los proveedores y operadores de sistemas de apuestas. Permite registrar abonos, retenciones y conciliar saldos pendientes.',
      side: 'right',
      align: 'start',
    },
  },
  {
    moduleId: 'Reporte Proveedores',
    element: '#menu-reporte-proveedores, #menu-reporte-operadora',
    popover: {
      title: '📊 Reporte de Rendición de Proveedores',
      description:
        'Resumen financiero consolidado por casa proveedora: volumen jugado, porcentaje de comisión del comercializador, premios devengados y liquidación neta a pagar.',
      side: 'right',
      align: 'start',
    },
  },
  {
    moduleId: 'Config. Proveedores',
    element: '#menu-config-proveedores',
    popover: {
      title: '⚙️ Configuración y Mapeo de Proveedores',
      description:
        'Mapeo inteligente de reportes: define nombres de columnas en archivos (ID Agencia, Ventas, Premios), % de comisión comercializadora, % de participación y saldos de arrastre iniciales por divisa (BS, USD, COP).',
      side: 'right',
      align: 'start',
    },
  },
  {
    moduleId: 'Gastos Administrativos',
    element: '#menu-gastos-administrativos',
    popover: {
      title: '🧮 Gastos Administrativos Generales',
      description:
        'Registro de egresos operativos centrales de la comercializadora (nómina, servidores, logística, soporte) para calcular con exactitud la utilidad neta de tu banca.',
      side: 'right',
      align: 'start',
    },
  },
  {
    moduleId: 'Cierre ',
    element: '#menu-cierre, #menu-cierre-operadora',
    popover: {
      title: '🔒 Centro de Cierre y Registro Maestro',
      description:
        'Arqueo y Pre-Cierre en tiempo real. Genera Actas Oficiales (General, Gastos Agencias, Gastos Comercializadora, Bancos, Efectivo, Cobradores) y consolida las Cajas en BS, USD y COP para cierre de ciclo y avance de semana.',
      side: 'right',
      align: 'start',
    },
  },
  {
    moduleId: 'Auditoría',
    element: '#menu-auditoria',
    popover: {
      title: '🛡️ Bitácora Oficial de Auditoría y Seguridad',
      description:
        'Registro inmutable de trazabilidad financiera: eventos de sistema, confirmaciones, reajustes de saldo, aperturas/cierres y generación de Actas Oficiales de Auditoría en PDF para contraloría.',
      side: 'right',
      align: 'start',
    },
  },
  {
    moduleId: 'Ajustes',
    element: '#menu-ajustes',
    popover: {
      title: '⚙️ Configuración de Ciclo Operativo',
      description:
        'Define la modalidad de corte (Semanal o Diario), número de semana activa, fechas maestras de inicio/cierre y el tema visual del sistema (Modo Oscuro, Claro o Automático según horario).',
      side: 'right',
      align: 'start',
    },
  },
  {
    moduleId: 'Usuarios',
    element: '#menu-usuarios',
    popover: {
      title: '👥 Operadores y Permisos de Acceso',
      description:
        'Crea cuentas para supervisores, cajeros y operadores auxiliares con permisos selectivos por módulo para resguardar la seguridad y confidencialidad de la operadora.',
      side: 'right',
      align: 'start',
    },
  },
  {
    element: '#header-tour-btn',
    popover: {
      title: '🎓 Paseo Explicativo Finalizado',
      description:
        '¡Enhorabuena! Has completado el recorrido por todos los módulos del Control Maestro Multibanca Express. Puedes volver a iniciar este demo interactivo cuando lo desees haciendo clic aquí.',
      side: 'bottom',
      align: 'end',
    },
  },
];

/**
 * Inicia el tour guiado interactivo de Multibanca Express CRM
 * Cambia dinámicamente de pantalla durante el recorrido para una experiencia 100% interactiva
 * @param force Si es true, inicia el tour incluso si el usuario ya lo vio previamente
 */
export function startOnboardingTour(force: boolean = false) {
  if (!force) {
    const alreadySeen = localStorage.getItem(TOUR_STORAGE_KEY);
    if (alreadySeen) return;
  }

  // Filtrar los pasos disponibles en el DOM
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
    stageRadius: 14,
    smoothScroll: true,
    skipMissingElement: true,
    allowClose: true,
    nextBtnText: 'Siguiente →',
    prevBtnText: '← Anterior',
    doneBtnText: '¡Comenzar a Operar! 🚀',
    progressText: '{{current}} de {{total}}',
    popoverClass: 'me-driver-theme',
    onHighlightStarted: (element, step) => {
      const stepItem = step as TourStepExtended;

      // 1. Navegar en vivo al módulo en la vista principal
      if (stepItem.moduleId && tourNavigator) {
        tourNavigator(stepItem.moduleId);
      }

      // 2. Desplazar suavemente el botón en el menú lateral para que siempre sea visible
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    },
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
