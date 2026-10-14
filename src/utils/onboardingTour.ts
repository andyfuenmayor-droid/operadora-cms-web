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
  // 1. Operadora & Suscriptor
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

  // 2. Menú Inicio
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

  // 3. Módulo Inicio: KPIs
  {
    moduleId: 'Inicio',
    menuDomId: 'menu-inicio',
    element: resolveModuleStep('#tour-inicio-kpi', 'Inicio', 'menu-inicio'),
    popover: {
      title: '📊 Módulo Inicio: Indicadores en Tiempo Real',
      description:
        'Cómo usarlo: Monitorea 4 métricas críticas: 1. Agencias activas vs cupo contratado. 2. Pagos por validar en la Pizarra de Confirmaciones. 3. Cobradores en calle. 4. Efectivo total circulante en ruta antes de ingresar a caja central.',
      side: 'bottom',
      align: 'start',
    },
  },

  // 4. Módulo Inicio: Balances Multidivisa
  {
    moduleId: 'Inicio',
    menuDomId: 'menu-inicio',
    element: resolveModuleStep('#tour-inicio-balances', 'Inicio', 'menu-inicio'),
    popover: {
      title: '💰 Módulo Inicio: Balance Maestro por Moneda',
      description:
        'Cómo usarlo: Consulta la salud financiera en Bolívares (BS), Dólares (USD) y Pesos (COP). Aplica la fórmula certificada: Saldo Anterior + Utilidad Ciclo - Gastos Agencias - Gastos Comercializadora - Cobros + Premios = Balance Final Neto.',
      side: 'top',
      align: 'start',
    },
  },

  // 5. Menú Confirmaciones
  {
    element: '#menu-confirmaciones',
    popover: {
      title: '📌 Menú Confirmaciones',
      description:
        'Desde este acceso ingresas a la Pizarra de Validación en tiempo real (0 ms) para procesar los reportes de pago emitidos por los cajeros desde la Taquilla Web.',
      side: 'right',
      align: 'start',
    },
  },

  // 6. Módulo Confirmaciones: Acciones Rápidas
  {
    moduleId: 'Confirmaciones',
    menuDomId: 'menu-confirmaciones',
    element: resolveModuleStep('#tour-confirmaciones-header', 'Confirmaciones', 'menu-confirmaciones'),
    popover: {
      title: '⚡ Módulo Confirmaciones: Acciones y Control',
      description:
        'Cómo usarlo: Usa "Sincronización Rápida" para refrescar pagos entrantes al instante o "Confirmar Todo" para validar en lote transferencias verificadas por tesorería.',
      side: 'bottom',
      align: 'start',
    },
  },

  // 7. Módulo Confirmaciones: Validación con OCR
  {
    moduleId: 'Confirmaciones',
    menuDomId: 'menu-confirmaciones',
    element: resolveModuleStep('#tour-confirmaciones-board', 'Confirmaciones', 'menu-confirmaciones'),
    popover: {
      title: '🔍 Módulo Confirmaciones: Validación con OCR',
      description:
        'Cómo usarlo: Cada tarjeta muestra agencia, monto y captura. Haz clic en ella para ampliar el comprobante y usar el escaneo OCR de referencia bancaria. Pulsa "Aprobar" para acreditar el saldo o "Rechazar" indicando el motivo al cajero.',
      side: 'top',
      align: 'start',
    },
  },

  // 8. Menú Confirmados
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

  // 9. Módulo Confirmados: Pestañas de Rendición
  {
    moduleId: 'Confirmados',
    menuDomId: 'menu-confirmados',
    element: resolveModuleStep('#tour-confirmados-tabs', 'Confirmados', 'menu-confirmados'),
    popover: {
      title: '📑 Módulo Confirmados: Pestañas de Rendición y Arqueo',
      description:
        'Cómo usarlo: 1. "Reporte General" para consultar todas las operaciones aprobadas. 2. "Auditoría Rechazados" para fiscalizar pagos denegados y sus causas. 3. "Arqueo y Efectivo" para conciliar el dinero físico bajo custodia de cada taquilla.',
      side: 'bottom',
      align: 'start',
    },
  },

  // 10. Módulo Confirmados: Filtros y Exportación CSV
  {
    moduleId: 'Confirmados',
    menuDomId: 'menu-confirmados',
    element: resolveModuleStep('#tour-confirmados-filters', 'Confirmados', 'menu-confirmados'),
    popover: {
      title: '🔎 Módulo Confirmados: Filtros y Planilla CSV',
      description:
        'Cómo usarlo: Filtra por rango de fechas (Desde / Hasta), agencia o banco. Pulsa "Exportar CSV" para descargar la planilla oficial de transacciones y conciliarla directamente contra tus extractos bancarios.',
      side: 'bottom',
      align: 'start',
    },
  },

  // 11. Menú Sistemas
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

  // 12. Módulo Sistemas: Formulario de Alta y Mapeo
  {
    moduleId: 'Sistemas',
    menuDomId: 'menu-sistemas',
    element: resolveModuleStep('#tour-sistemas-form', 'Sistemas', 'menu-sistemas'),
    popover: {
      title: '🎰 Módulo Sistemas: Alta y Mapeo de Columnas',
      description:
        'Cómo usarlo: 1. Escribe el nombre del sistema (ej. CDAPUESTAS, BETM3, KENO). 2. Define las palabras clave de las columnas en tus archivos Excel/PDF (ID Agencia, Ventas, Premios). 3. Fija la comisión comercializadora, % de participación y saldos iniciales en BS, USD y COP. 4. Guarda para automatizar las ventas.',
      side: 'bottom',
      align: 'start',
    },
  },

  // 13. Módulo Sistemas: Catálogo de Proveedores Activos
  {
    moduleId: 'Sistemas',
    menuDomId: 'menu-sistemas',
    element: resolveModuleStep('#tour-sistemas-table', 'Sistemas', 'menu-sistemas'),
    popover: {
      title: '📋 Módulo Sistemas: Catálogo de Proveedores Activos',
      description:
        'Cómo usarlo: Revisa todas las casas habilitadas. Usa los botones de acción para editar comisiones contractuales, ajustar saldos de arrastre iniciales o eliminar sistemas que no operen en tu banca.',
      side: 'top',
      align: 'start',
    },
  },

  // 14. Menú Monedas
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

  // 15. Módulo Monedas: Configuración Multidivisa
  {
    moduleId: 'Monedas',
    menuDomId: 'menu-monedas',
    element: resolveModuleStep('#tour-monedas-form', 'Monedas', 'menu-monedas'),
    popover: {
      title: '💵 Módulo Monedas: Configuración Multidivisa',
      description:
        'Cómo usarlo: Da de alta las monedas oficiales de tu banca (BS, USD, COP, USDT). En Multibanca Express cada moneda opera de forma 100% independiente en ventas, gastos, cobros y arqueos, garantizando cero distorsión cambiaria.',
      side: 'bottom',
      align: 'start',
    },
  },

  // 16. Menú Cuentas Bancarias
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

  // 17. Módulo Cuentas y POS: Gestión Receptora
  {
    moduleId: 'Cuentas Bancarias',
    menuDomId: 'menu-cuentas-bancarias',
    element: resolveModuleStep('#tour-cuentas-tabs', 'Cuentas Bancarias', 'menu-cuentas-bancarias'),
    popover: {
      title: '🏦 Módulo Cuentas y POS: Gestión Receptora',
      description:
        'Cómo usarlo: Alterna entre "Cuentas Bancarias" (para administrar cuentas receptoras de transferencias y Pago Móvil) y "Puntos de Venta (POS)" (para controlar terminales BioPago o dispositivos inalámbricos asignados a taquillas).',
      side: 'bottom',
      align: 'start',
    },
  },

  // 18. Módulo Cuentas: Alta de Cuentas y Terminales
  {
    moduleId: 'Cuentas Bancarias',
    menuDomId: 'menu-cuentas-bancarias',
    element: resolveModuleStep('#tour-cuentas-btn', 'Cuentas Bancarias', 'menu-cuentas-bancarias'),
    popover: {
      title: '➕ Módulo Cuentas: Alta de Cuentas y Terminales',
      description:
        'Cómo usarlo: Pulsa "+ NUEVA CUENTA" para registrar banco, número de cuenta de 20 dígitos, titular, moneda y agencias autorizadas a depositar en ella. En la sección POS, vincula el serial TID para habilitar cobros con tarjeta en taquilla.',
      side: 'bottom',
      align: 'start',
    },
  },

  // 19. Menú Agencias
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

  // 20. Módulo Agencias: Alta de Nuevos Puntos
  {
    moduleId: 'Agencias',
    menuDomId: 'menu-agencias',
    element: resolveModuleStep('#tour-agencias-actions', 'Agencias', 'menu-agencias'),
    popover: {
      title: '🏪 Módulo Agencias: Alta de Nuevos Puntos',
      description:
        'Cómo usarlo: Haz clic en "+ NUEVA AGENCIA" para registrar un punto de venta. Configura su nombre comercial, comisión asignada, sistemas autorizados y genera las credenciales de acceso para que el cajero opere en Taquilla Web.',
      side: 'bottom',
      align: 'start',
    },
  },

  // 21. Módulo Agencias: Directorio y Credenciales
  {
    moduleId: 'Agencias',
    menuDomId: 'menu-agencias',
    element: resolveModuleStep('#tour-agencias-table', 'Agencias', 'menu-agencias'),
    popover: {
      title: '🔑 Módulo Agencias: Directorio y Credenciales',
      description:
        'Cómo usarlo: Administra cada agencia: visualiza su usuario y clave de taquilla, edita comisiones individuales, asigna cobradores de ruta o abre directamente su estado de cuenta semanal con un solo clic.',
      side: 'top',
      align: 'start',
    },
  },

  // 22. Menú Cobradores
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

  // 23. Módulo Cobradores: Rutas de Calle y Cobranza
  {
    moduleId: 'Cobradores',
    menuDomId: 'menu-cobradores',
    element: resolveModuleStep('#tour-cobradores-tabs', 'Cobradores', 'menu-cobradores'),
    popover: {
      title: '🛵 Módulo Cobradores: Rutas de Calle y Cobranza',
      description:
        'Cómo usarlo: Gestiona tu personal de cobranza: "Lista de Cobradores" para ver el directorio, "Nuevo Cobrador" para crearlo con clave y teléfono, "Asignación de Rutas" para vincular agencias y "Descargar PDF" para imprimir la ruta diaria.',
      side: 'bottom',
      align: 'start',
    },
  },

  // 24. Módulo Cobradores: Token QR (10 Minutos)
  {
    moduleId: 'Cobradores',
    menuDomId: 'menu-cobradores',
    element: resolveModuleStep('#tour-cobradores-list', 'Cobradores', 'menu-cobradores'),
    popover: {
      title: '🔐 Módulo Cobradores: Token QR de Liquidación (10 Min)',
      description:
        'Cómo usarlo: Al momento de recibir efectivo de un cobrador, el sistema genera un Token QR dinámico con validez de 10 minutos. Al escanear el QR desde la taquilla o caja central, el dinero queda descargado y auditado al instante con máxima seguridad.',
      side: 'top',
      align: 'start',
    },
  },

  // 25. Menú Cargar Ventas
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

  // 26. Módulo Cargar Ventas: Importación Masiva
  {
    moduleId: 'Cargar Ventas',
    menuDomId: 'menu-cargar-ventas',
    element: resolveModuleStep('#tour-cargar-ventas-btn', 'Cargar Ventas', 'menu-cargar-ventas'),
    popover: {
      title: '📥 Módulo Cargar Ventas: Importación Masiva',
      description:
        'Cómo usarlo: 1. Pulsa "Carga Masiva (Excel / CSV / PDF)". 2. Arrastra las planillas descargadas de los proveedores o comprobantes térmicos en PDF. 3. Selecciona la fecha y el sistema. 4. El motor calcula venta bruta, comisiones y premios automáticamente.',
      side: 'bottom',
      align: 'start',
    },
  },

  // 27. Menú Pagos Agencias
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

  // 28. Módulo Pagos Agencias: Registro de Abonos
  {
    moduleId: 'Pagos Agencias',
    menuDomId: 'menu-pagos-agencias',
    element: resolveModuleStep('#tour-pagos-form', 'Pagos Agencias', 'menu-pagos-agencias'),
    popover: {
      title: '💳 Módulo Pagos Agencias: Registro de Abonos',
      description:
        'Cómo usarlo: 1. Selecciona la agencia en el menú (el sistema te muestra en vivo su saldo adeudado). 2. Indica la moneda y el monto a pagar. 3. Elige el método (Transferencia, Pago Móvil o Efectivo) y banco. 4. Guarda para descontar la deuda de inmediato.',
      side: 'bottom',
      align: 'start',
    },
  },

  // 29. Menú Gastos por Agencia
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

  // 30. Módulo Gastos Agencia: Deducciones Operativas
  {
    moduleId: 'Gastos por Agencia',
    menuDomId: 'menu-gastos-por-agencia',
    element: resolveModuleStep('#tour-gastos-form', 'Gastos por Agencia', 'menu-gastos-por-agencia'),
    popover: {
      title: '🧾 Módulo Gastos Agencia: Deducciones Operativas',
      description:
        'Cómo usarlo: Registra los gastos operativos directos de cada punto (alquiler de local, internet, luz, papelería, mantenimiento). Selecciona la agencia, el concepto y el monto para que se deduzca automáticamente en su estado de cuenta semanal.',
      side: 'bottom',
      align: 'start',
    },
  },

  // 31. Menú Saldo Agencias
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

  // 32. Módulo Saldo Agencias: Cartera Total por Divisa
  {
    moduleId: 'Saldo Agencias',
    menuDomId: 'menu-saldo-agencias',
    element: resolveModuleStep('#tour-saldos-summary', 'Saldo Agencias', 'menu-saldo-agencias'),
    popover: {
      title: '⚖️ Módulo Saldo Agencias: Cartera Total por Divisa',
      description:
        'Cómo usarlo: Consulta la cartera total exigible o por cobrar de toda tu red en Bolívares (BS), Dólares (USD) y Pesos (COP). Alterna entre las pestañas de moneda para conocer la posición financiera global de tu banca.',
      side: 'bottom',
      align: 'start',
    },
  },

  // 33. Módulo Saldo Agencias: Liquidación por Taquilla
  {
    moduleId: 'Saldo Agencias',
    menuDomId: 'menu-saldo-agencias',
    element: resolveModuleStep('#tour-saldos-table', 'Saldo Agencias', 'menu-saldo-agencias'),
    popover: {
      title: '📊 Módulo Saldo Agencias: Liquidación por Taquilla',
      description:
        'Cómo usarlo: Tabla de estado de cuenta cruzado por agencia: Saldo Anterior + Utilidad Ciclo - Gastos - Cobros + Premios = Balance Final. Emite estados de cuenta individuales en PDF o compártelos por WhatsApp con cada encargado.',
      side: 'top',
      align: 'start',
    },
  },

  // 34. Menú Venta Real
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

  // 35. Módulo Venta Real: Sincronización y Recálculo
  {
    moduleId: 'Venta Real',
    menuDomId: 'menu-venta-real',
    element: resolveModuleStep('#tour-ventareal-actions', 'Venta Real', 'menu-venta-real'),
    popover: {
      title: '📈 Módulo Venta Real: Sincronización y Recálculo',
      description:
        'Cómo usarlo: Si ajustaste comisiones de alguna agencia a mitad de semana, usa "Sincronizar con Agencias" para recalcular retroactivamente toda la venta del ciclo con las nuevas tasas. Pulsa "Exportar Excel" para respaldar los datos.',
      side: 'bottom',
      align: 'start',
    },
  },

  // 36. Menú Pagos a Proveedores
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

  // 37. Módulo Pagos Proveedor: Liquidación Casa Matriz
  {
    moduleId: 'Pagos a Proveedores',
    menuDomId: 'menu-pagos-a-proveedores',
    element: resolveModuleStep('#tour-pagosprov-form', 'Pagos a Proveedores', 'menu-pagos-a-proveedores'),
    popover: {
      title: '🤝 Módulo Pagos Proveedor: Liquidación Casa Matriz',
      description:
        'Cómo usarlo: Registra los pagos y liquidaciones efectuadas hacia las casas matrices u operadoras de lotería (ej. Betm3, Keno). Asienta el proveedor, moneda, banco emisor y referencia para mantener al día tus cuentas por pagar mayoristas.',
      side: 'bottom',
      align: 'start',
    },
  },

  // 38. Menú Reporte Proveedores
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

  // 39. Módulo Reporte Proveedores: Rendición GGR
  {
    moduleId: 'Reporte Proveedores',
    menuDomId: 'menu-reporte-proveedores',
    element: resolveModuleStep('#tour-reporteprov-table', 'Reporte Proveedores', 'menu-reporte-proveedores'),
    popover: {
      title: '📋 Módulo Reporte Proveedores: Rendición GGR',
      description:
        'Cómo usarlo: Cuadro de conciliación mayorista: audita venta bruta, premios pagados, GGR (Gross Gaming Revenue), comisión completa del proveedor, comisión de agencias, diferencial a favor del comercializador y balance final neto.',
      side: 'top',
      align: 'start',
    },
  },

  // 40. Menú Gastos Administrativos
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

  // 41. Módulo Gastos Administrativos: Egresos Centrales
  {
    moduleId: 'Gastos Administrativos',
    menuDomId: 'menu-gastos-administrativos',
    element: resolveModuleStep('#tour-gastosadmin-form', 'Gastos Administrativos', 'menu-gastos-administrativos'),
    popover: {
      title: '🧮 Módulo Gastos Administrativos: Egresos Centrales',
      description:
        'Cómo usarlo: Registra los egresos operativos corporativos de la comercializadora (nómina de supervisores y choferes, servidores web, telecomunicaciones, insumos). Asigna categoría, moneda, beneficiario y número de recibo correlativo.',
      side: 'bottom',
      align: 'start',
    },
  },

  // 42. Menú Cierre
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

  // 43. Módulo Cierre: Actas Oficiales PDF
  {
    moduleId: 'Cierre ',
    menuDomId: 'menu-cierre',
    element: resolveModuleStep('#tour-cierre-actas', 'Cierre ', 'menu-cierre'),
    popover: {
      title: '🔒 Módulo Cierre: Emisión de Actas Oficiales PDF',
      description:
        'Cómo usarlo: Antes del corte de ciclo, genera las Actas Oficiales de Auditoría: 1. Acta General Consolidada, 2. Acta de Gastos Agencias, 3. Acta de Gastos Comercializadora, 4. Acta de Bancos, 5. Acta de Efectivo y 6. Acta de Cobradores en Ruta.',
      side: 'bottom',
      align: 'start',
    },
  },

  // 44. Módulo Cierre: Arqueo Multi-Cajas BS / USD / COP
  {
    moduleId: 'Cierre ',
    menuDomId: 'menu-cierre',
    element: resolveModuleStep('#tour-cierre-cajas', 'Cierre ', 'menu-cierre'),
    popover: {
      title: '📦 Módulo Cierre: Arqueo Multi-Cajas BS / USD / COP',
      description:
        'Cómo usarlo: Audita las 3 Cajas Maestras en BS, USD y COP. Al validar que el dinero físico y saldos en banco cuadran con el sistema, confirma las casillas de verificación de Agencias y Proveedores para ejecutar el cierre y avanzar de semana.',
      side: 'top',
      align: 'start',
    },
  },

  // 45. Menú Auditoría
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

  // 46. Módulo Auditoría: Trazabilidad Inmutable
  {
    moduleId: 'Auditoría',
    menuDomId: 'menu-auditoria',
    element: resolveModuleStep('#tour-auditoria-header', 'Auditoría', 'menu-auditoria'),
    popover: {
      title: '🛡️ Módulo Auditoría: Trazabilidad Inmutable',
      description:
        'Cómo usarlo: Bitácora forense de seguridad. Monitorea confirmaciones de pago, ajustes de saldo, inicios de sesión y aperturas/cierres. Puedes descargar el Acta Oficial de Auditoría en PDF para contraloría o auditoría externa.',
      side: 'bottom',
      align: 'start',
    },
  },

  // 47. Menú Ajustes
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

  // 48. Módulo Ajustes: Ciclo Operativo y Apariencia
  {
    moduleId: 'Ajustes',
    menuDomId: 'menu-ajustes',
    element: resolveModuleStep('#tour-ajustes-ciclo', 'Ajustes', 'menu-ajustes'),
    popover: {
      title: '⚙️ Módulo Ajustes: Ciclo Operativo y Apariencia',
      description:
        'Cómo usarlo: Configura el tipo de corte de tu negocio (Semanal o Diario), número de semana activa y fechas maestras (Desde / Hasta). También puedes alternar el tema visual entre Modo Oscuro, Modo Claro o Automático.',
      side: 'bottom',
      align: 'start',
    },
  },

  // 49. Menú Usuarios
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

  // 50. Módulo Usuarios: Operadores y Permisos Granulares
  {
    moduleId: 'Usuarios',
    menuDomId: 'menu-usuarios',
    element: resolveModuleStep('#tour-usuarios-btn', 'Usuarios', 'menu-usuarios'),
    popover: {
      title: '👥 Módulo Usuarios: Operadores y Permisos Granulares',
      description:
        'Cómo usarlo: Pulsa "Nuevo Usuario" para crear cuentas para supervisores o cajeros. Asigna credenciales personales y selecciona exactamente qué módulos pueden ver y cuáles permanecen bloqueados para resguardar la privacidad de tus finanzas.',
      side: 'bottom',
      align: 'start',
    },
  },

  // 51. Finalización y Reinicio del Tour
  {
    element: '#header-tour-btn',
    popover: {
      title: '🎓 ¡Recorrido Explicativo Completado!',
      description:
        '¡Felicitaciones! Has completado el recorrido guiado por todas las opciones del menú lateral y el interior de cada módulo. Puedes volver a iniciar este demo explicativo en cualquier momento pulsando este botón "Tour Demo".',
      side: 'bottom',
      align: 'end',
    },
  },
];

/**
 * Inicia el tour guiado interactivo de Multibanca Express CRM
 * Navega automáticamente hacia cada opción del menú lateral y hacia el interior de cada módulo.
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
