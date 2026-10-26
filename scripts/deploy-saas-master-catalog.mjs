import fs from 'fs';
import path from 'path';

const SAAS_DIR = 'C:/Users/andyf/Downloads/saas-administrador-web-main';

console.log('🚀 Desplegando componentes del Catálogo Maestro en SaaS Admin...');

// 1. types/index.ts
const typesPath = path.join(SAAS_DIR, 'src/types/index.ts');
const typesContent = `export interface ClientProfile {
  id: string;
  email: string;
  nombre_banca: string;
  plan: string;
  limite_agencias: number;
  status: 'activo' | 'suspendido' | 'vencido' | string;
  fecha_inicio?: string;
  fecha_vencimiento: string;
  representante?: string;
  telefono?: string;
  estado?: string;
  direccion?: string;
  role?: string;
  rol?: string;
  created_at?: string;
}

export interface Lead {
  id: string | number;
  banca: string;
  representante: string;
  email?: string;
  telefono?: string;
  puntos_venta: number | string;
  estado?: string;
  direccion?: string;
  created_at?: string;
}

export interface TrackingLead {
  id: string | number;
  banca: string;
  representante: string;
  email?: string;
  telefono?: string;
  puntos_venta: number;
  plan_cotizado: string;
  total_cotizado: number;
  estado_seguimiento: string;
  estado?: string;
  direccion?: string;
  created_at?: string;
}

export interface PlanConfig {
  costo_base: number;
  costo_por_punto: number;
  limite_puntos?: number;
  descripcion: string;
  modulos: string[];
}

export type CatalogPlans = Record<string, PlanConfig>;

export interface MasterSystem {
  id?: number;
  nombre_sistema: string;
  col_agencia: string;
  col_venta: string;
  col_premio: string;
  descripcion?: string;
  icono?: string;
  creado_por_user_id?: string;
  created_at?: string;
  updated_at?: string;
}

export interface MasterCurrency {
  id?: number;
  codigo: string;
  nombre: string;
  simbolo: string;
  decimales: number;
  es_base: boolean;
  icono?: string;
  creado_por_user_id?: string;
  created_at?: string;
  updated_at?: string;
}

export const TODOS_LOS_MODULOS_CMS: string[] = [
  'Inicio', 'Pizarra Confirmaciones', 'Sistemas', 'Monedas', 'Cuentas Bancarias', 'Agencias', 'Cobradores',
  'Cargar Ventas', 'Pagos Agencias', 'Gastos Agencias', 'Saldo Agencias', 
  'Venta Real', 'Auditoría', 'Caja Maestra',
  'Pagos a Operador', 'Venta Operadora', 'Reporte Operadora', 'Cierre Operadora', 'Config. Proveedores',
  'Gastos Administrativos', 'Cierre ', 'Ajustes'
];

export const PLANES_DEFAULT_DICT: CatalogPlans = {
  'Básico (SaaS)': {
    costo_base: 150.0,
    costo_por_punto: 5.0,
    limite_puntos: 15,
    descripcion: 'Gestión operativa completa de agencias hasta Caja Maestra.',
    modulos: [
      'Inicio', 'Pizarra Confirmaciones', 'Sistemas', 'Monedas', 'Cuentas Bancarias', 'Agencias', 'Cobradores',
      'Cargar Ventas', 'Pagos Agencias', 'Gastos Agencias', 'Saldo Agencias', 
      'Venta Real', 'Caja Maestra',
      'Cierre ', 'Ajustes'
    ]
  },
  'Profesional': {
    costo_base: 250.0,
    costo_por_punto: 8.0,
    limite_puntos: 50,
    descripcion: 'Gestión integral de Agencias, Operadoras y Proveedores.',
    modulos: [
      'Inicio', 'Pizarra Confirmaciones', 'Sistemas', 'Monedas', 'Cuentas Bancarias', 'Agencias', 'Cobradores',
      'Cargar Ventas', 'Pagos Agencias', 'Gastos Agencias', 'Saldo Agencias', 
      'Venta Real', 'Caja Maestra',
      'Pagos a Operador', 'Venta Operadora', 'Reporte Operadora', 'Cierre Operadora', 'Config. Proveedores',
      'Cierre ', 'Ajustes'
    ]
  },
  'Elite': {
    costo_base: 500.0,
    costo_por_punto: 12.0,
    limite_puntos: 0,
    descripcion: 'Control total sin límites: Incluye Auditoría Híbrida y Gastos Administrativos.',
    modulos: [...TODOS_LOS_MODULOS_CMS]
  }
};
`;
fs.writeFileSync(typesPath, typesContent, 'utf8');
console.log('✓ types/index.ts actualizado');

// 2. Directorio components/MasterCatalogTab
const catalogTabDir = path.join(SAAS_DIR, 'src/components/MasterCatalogTab');
if (!fs.existsSync(catalogTabDir)) {
  fs.mkdirSync(catalogTabDir, { recursive: true });
}

// 3. SystemMasterModal.tsx
const systemModalPath = path.join(catalogTabDir, 'SystemMasterModal.tsx');
const systemModalContent = `import React, { useState, useEffect } from 'react';
import { MasterSystem } from '../../types';
import { X, Save, AlertCircle, Layers } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  system: MasterSystem | null;
  onSave: (sys: Partial<MasterSystem>) => Promise<boolean>;
}

export const SystemMasterModal: React.FC<Props> = ({ isOpen, onClose, system, onSave }) => {
  const [nombre, setNombre] = useState('');
  const [colAgencia, setColAgencia] = useState('Agencia');
  const [colVenta, setColVenta] = useState('Venta');
  const [colPremio, setColPremio] = useState('Premio');
  const [descripcion, setDescripcion] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (system) {
      setNombre(system.nombre_sistema || '');
      setColAgencia(system.col_agencia || 'Agencia');
      setColVenta(system.col_venta || 'Venta');
      setColPremio(system.col_premio || 'Premio');
      setDescripcion(system.descripcion || '');
    } else {
      setNombre('');
      setColAgencia('Agencia');
      setColVenta('Venta');
      setColPremio('Premio');
      setDescripcion('');
    }
    setError(null);
  }, [system, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanNombre = nombre.trim().toUpperCase();
    if (!cleanNombre) {
      setError('El nombre del sistema es obligatorio.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const ok = await onSave({
        ...(system?.id ? { id: system.id } : {}),
        nombre_sistema: cleanNombre,
        col_agencia: colAgencia.trim() || 'Agencia',
        col_venta: colVenta.trim() || 'Venta',
        col_premio: colPremio.trim() || 'Premio',
        descripcion: descripcion.trim() || undefined,
      });
      if (ok) {
        onClose();
      } else {
        setError('No se pudo guardar el sistema. Verifica que el nombre no esté duplicado.');
      }
    } catch (err: any) {
      setError(err?.message || 'Error guardando sistema en el catálogo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-lg bg-[#0b171c] border border-white/10 rounded-2xl p-6 shadow-2xl text-slate-200">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/5 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white font-['Outfit']">
              {system ? 'Editar Sistema Global' : 'Nuevo Sistema Global'}
            </h3>
            <p className="text-xs text-slate-400">
              {system
                ? 'Corrige el nombre o las cabeceras de Excel asignadas a este proveedor.'
                : 'Agrega un nuevo proveedor para que esté disponible en todos los SaaS.'}
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Nombre del Sistema <span className="text-emerald-400">*</span>
            </label>
            <input
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value.toUpperCase())}
              placeholder="Ej: BETM3, KENO, GATOWEB..."
              required
              className="w-full px-3.5 py-2.5 bg-slate-900/80 border border-white/10 rounded-xl text-sm font-bold text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              Se guarda en mayúsculas para estandarización en todo el ecosistema.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Columna Agencia
              </label>
              <input
                type="text"
                value={colAgencia}
                onChange={(e) => setColAgencia(e.target.value)}
                placeholder="Agencia"
                className="w-full px-3 py-2 bg-slate-900/80 border border-white/10 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Columna Venta
              </label>
              <input
                type="text"
                value={colVenta}
                onChange={(e) => setColVenta(e.target.value)}
                placeholder="Venta"
                className="w-full px-3 py-2 bg-slate-900/80 border border-white/10 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Columna Premio
              </label>
              <input
                type="text"
                value={colPremio}
                onChange={(e) => setColPremio(e.target.value)}
                placeholder="Premio"
                className="w-full px-3 py-2 bg-slate-900/80 border border-white/10 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Descripción / Notas (Opcional)
            </label>
            <input
              type="text"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Ej: Apuestas deportivas y juegos virtuales"
              className="w-full px-3.5 py-2.5 bg-slate-900/80 border border-white/10 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/5">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold shadow-lg shadow-emerald-500/20 flex items-center gap-2 transition-all disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>{loading ? 'Guardando...' : system ? 'Actualizar Sistema' : 'Crear Sistema'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
`;
fs.writeFileSync(systemModalPath, systemModalContent, 'utf8');
console.log('✓ SystemMasterModal.tsx creado');

// 4. SystemsMasterTable.tsx
const systemsTablePath = path.join(catalogTabDir, 'SystemsMasterTable.tsx');
const systemsTableContent = `import React, { useState } from 'react';
import { MasterSystem } from '../../types';
import { Search, Plus, Edit2, Trash2, Layers, FileSpreadsheet } from 'lucide-react';

interface Props {
  systems: MasterSystem[];
  onOpenCreate: () => void;
  onOpenEdit: (sys: MasterSystem) => void;
  onDelete: (sys: MasterSystem) => void;
}

export const SystemsMasterTable: React.FC<Props> = ({
  systems,
  onOpenCreate,
  onOpenEdit,
  onDelete,
}) => {
  const [search, setSearch] = useState('');

  const filtered = systems.filter((s) => {
    const q = search.toLowerCase().trim();
    if (!q) return true;
    return (
      s.nombre_sistema.toLowerCase().includes(q) ||
      (s.col_agencia && s.col_agencia.toLowerCase().includes(q)) ||
      (s.col_venta && s.col_venta.toLowerCase().includes(q)) ||
      (s.col_premio && s.col_premio.toLowerCase().includes(q)) ||
      (s.descripcion && s.descripcion.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre, columna o descripción..."
            className="w-full pl-10 pr-4 py-2 bg-slate-900/80 border border-white/10 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
          />
        </div>

        <button
          onClick={onOpenCreate}
          className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold rounded-xl shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 transition-all shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Nuevo Sistema Global</span>
        </button>
      </div>

      <div className="bg-slate-900/50 border border-white/5 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/60 text-slate-400 border-b border-white/5 uppercase tracking-wider text-[10px]">
              <tr>
                <th className="px-4 py-3.5 font-bold">Sistema / Proveedor</th>
                <th className="px-4 py-3.5 font-bold">Mapeo Cabeceras Excel (Agencia / Venta / Premio)</th>
                <th className="px-4 py-3.5 font-bold">Descripción</th>
                <th className="px-4 py-3.5 font-bold text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-slate-200">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                    No se encontraron sistemas globales registrados.
                  </td>
                </tr>
              ) : (
                filtered.map((sys) => (
                  <tr key={sys.id || sys.nombre_sistema} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
                          <Layers className="w-3.5 h-3.5" />
                        </div>
                        <div>
                          <div className="font-bold text-white text-sm font-['Outfit']">
                            {sys.nombre_sistema}
                          </div>
                          <div className="text-[10px] text-slate-500">
                            ID: #{sys.id || 'N/A'}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="px-4 py-3.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="px-2 py-0.5 rounded bg-slate-800 border border-white/5 text-[11px] font-mono text-slate-300 flex items-center gap-1">
                          <FileSpreadsheet className="w-3 h-3 text-sky-400" />
                          <span className="text-slate-500">Ag:</span> {sys.col_agencia}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-slate-800 border border-white/5 text-[11px] font-mono text-slate-300 flex items-center gap-1">
                          <FileSpreadsheet className="w-3 h-3 text-emerald-400" />
                          <span className="text-slate-500">Vta:</span> {sys.col_venta}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-slate-800 border border-white/5 text-[11px] font-mono text-slate-300 flex items-center gap-1">
                          <FileSpreadsheet className="w-3 h-3 text-amber-400" />
                          <span className="text-slate-500">Prm:</span> {sys.col_premio}
                        </span>
                      </div>
                    </td>

                    <td className="px-4 py-3.5 text-slate-400 max-w-xs truncate">
                      {sys.descripcion || '—'}
                    </td>

                    <td className="px-4 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => onOpenEdit(sys)}
                          title="Editar sistema o cabeceras"
                          className="p-1.5 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/20 transition-colors"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => onDelete(sys)}
                          title="Eliminar del catálogo maestro"
                          className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
`;
fs.writeFileSync(systemsTablePath, systemsTableContent, 'utf8');
console.log('✓ SystemsMasterTable.tsx creado');

// 5. CurrencyMasterModal.tsx
const currencyModalPath = path.join(catalogTabDir, 'CurrencyMasterModal.tsx');
const currencyModalContent = `import React, { useState, useEffect } from 'react';
import { MasterCurrency } from '../../types';
import { X, Save, AlertCircle, Coins } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  currency: MasterCurrency | null;
  onSave: (cur: Partial<MasterCurrency>) => Promise<boolean>;
}

export const CurrencyMasterModal: React.FC<Props> = ({ isOpen, onClose, currency, onSave }) => {
  const [codigo, setCodigo] = useState('');
  const [nombre, setNombre] = useState('');
  const [simbolo, setSimbolo] = useState('');
  const [decimales, setDecimales] = useState('2');
  const [esBase, setEsBase] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (currency) {
      setCodigo(currency.codigo || '');
      setNombre(currency.nombre || '');
      setSimbolo(currency.simbolo || '');
      setDecimales(String(currency.decimales ?? 2));
      setEsBase(Boolean(currency.es_base));
    } else {
      setCodigo('');
      setNombre('');
      setSimbolo('');
      setDecimales('2');
      setEsBase(false);
    }
    setError(null);
  }, [currency, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCodigo = codigo.trim().toUpperCase();
    const cleanNombre = nombre.trim();
    const cleanSimbolo = simbolo.trim();

    if (!cleanCodigo || !cleanNombre || !cleanSimbolo) {
      setError('Código, nombre y símbolo son campos obligatorios.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const ok = await onSave({
        ...(currency?.id ? { id: currency.id } : {}),
        codigo: cleanCodigo,
        nombre: cleanNombre,
        simbolo: cleanSimbolo,
        decimales: Math.max(0, parseInt(decimales, 10) || 0),
        es_base: esBase,
      });
      if (ok) {
        onClose();
      } else {
        setError('No se pudo guardar la divisa. Verifica que el código no esté duplicado.');
      }
    } catch (err: any) {
      setError(err?.message || 'Error guardando divisa en el catálogo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-md bg-[#0b171c] border border-white/10 rounded-2xl p-6 shadow-2xl text-slate-200">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/5 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
            <Coins className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white font-['Outfit']">
              {currency ? 'Editar Divisa Global' : 'Nueva Divisa Global'}
            </h3>
            <p className="text-xs text-slate-400">
              {currency
                ? 'Corrige el código, nombre, símbolo o decimales de la moneda.'
                : 'Registra una nueva moneda para el catálogo maestro.'}
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Código ISO <span className="text-amber-400">*</span>
              </label>
              <input
                type="text"
                value={codigo}
                onChange={(e) => setCodigo(e.target.value.toUpperCase())}
                placeholder="USD, BS, COP..."
                required
                className="w-full px-3.5 py-2.5 bg-slate-900/80 border border-white/10 rounded-xl text-sm font-bold text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-colors uppercase"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Símbolo <span className="text-amber-400">*</span>
              </label>
              <input
                type="text"
                value={simbolo}
                onChange={(e) => setSimbolo(e.target.value)}
                placeholder="$, Bs., COP$, €..."
                required
                className="w-full px-3.5 py-2.5 bg-slate-900/80 border border-white/10 rounded-xl text-sm font-bold text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Nombre de la Moneda <span className="text-amber-400">*</span>
            </label>
            <input
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej: Dólares Americanos, Bolívares..."
              required
              className="w-full px-3.5 py-2.5 bg-slate-900/80 border border-white/10 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-colors"
            />
          </div>

          <div className="grid grid-cols-2 gap-3 items-center">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Decimales Contables
              </label>
              <select
                value={decimales}
                onChange={(e) => setDecimales(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-900/80 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500 transition-colors"
              >
                <option value="0">0 (Sin decimales - ej: COP)</option>
                <option value="2">2 (Estándar - ej: USD, BS)</option>
                <option value="4">4 (Cripto / Precisión)</option>
              </select>
            </div>

            <div className="pt-5">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={esBase}
                  onChange={(e) => setEsBase(e.target.checked)}
                  className="w-4 h-4 rounded bg-slate-900 border-white/20 text-amber-500 focus:ring-0 focus:ring-offset-0"
                />
                <span className="text-xs font-semibold text-slate-300">
                  Moneda Base
                </span>
              </label>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/5">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold shadow-lg shadow-amber-500/20 flex items-center gap-2 transition-all disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>{loading ? 'Guardando...' : currency ? 'Actualizar Divisa' : 'Crear Divisa'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
`;
fs.writeFileSync(currencyModalPath, currencyModalContent, 'utf8');
console.log('✓ CurrencyMasterModal.tsx creado');

// 6. CurrenciesMasterTable.tsx
const currenciesTablePath = path.join(catalogTabDir, 'CurrenciesMasterTable.tsx');
const currenciesTableContent = `import React, { useState } from 'react';
import { MasterCurrency } from '../../types';
import { Search, Plus, Edit2, Trash2, Coins, CheckCircle2 } from 'lucide-react';

interface Props {
  currencies: MasterCurrency[];
  onOpenCreate: () => void;
  onOpenEdit: (cur: MasterCurrency) => void;
  onDelete: (cur: MasterCurrency) => void;
}

export const CurrenciesMasterTable: React.FC<Props> = ({
  currencies,
  onOpenCreate,
  onOpenEdit,
  onDelete,
}) => {
  const [search, setSearch] = useState('');

  const filtered = currencies.filter((c) => {
    const q = search.toLowerCase().trim();
    if (!q) return true;
    return (
      c.codigo.toLowerCase().includes(q) ||
      c.nombre.toLowerCase().includes(q) ||
      c.simbolo.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por código, nombre o símbolo..."
            className="w-full pl-10 pr-4 py-2 bg-slate-900/80 border border-white/10 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-colors"
          />
        </div>

        <button
          onClick={onOpenCreate}
          className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded-xl shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 transition-all shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Nueva Moneda Global</span>
        </button>
      </div>

      <div className="bg-slate-900/50 border border-white/5 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/60 text-slate-400 border-b border-white/5 uppercase tracking-wider text-[10px]">
              <tr>
                <th className="px-4 py-3.5 font-bold">Código ISO</th>
                <th className="px-4 py-3.5 font-bold">Nombre Completo</th>
                <th className="px-4 py-3.5 font-bold">Símbolo</th>
                <th className="px-4 py-3.5 font-bold">Decimales</th>
                <th className="px-4 py-3.5 font-bold">Tipo</th>
                <th className="px-4 py-3.5 font-bold text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-slate-200">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    No se encontraron monedas globales registradas.
                  </td>
                </tr>
              ) : (
                filtered.map((cur) => (
                  <tr key={cur.id || cur.codigo} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 shrink-0 font-bold font-mono">
                          {cur.codigo}
                        </div>
                        <div>
                          <div className="font-bold text-white text-sm font-['Outfit']">
                            {cur.codigo}
                          </div>
                          <div className="text-[10px] text-slate-500">
                            ID: #{cur.id || 'N/A'}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="px-4 py-3.5 font-medium text-slate-200">
                      {cur.nombre}
                    </td>

                    <td className="px-4 py-3.5 font-bold font-mono text-emerald-400 text-sm">
                      {cur.simbolo}
                    </td>

                    <td className="px-4 py-3.5 text-slate-300 font-mono">
                      {cur.decimales} dec
                    </td>

                    <td className="px-4 py-3.5">
                      {cur.es_base ? (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-bold inline-flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          Moneda Base
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-white/5 text-[10px] font-semibold">
                          Secundaria
                        </span>
                      )}
                    </td>

                    <td className="px-4 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => onOpenEdit(cur)}
                          title="Editar divisa"
                          className="p-1.5 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/20 transition-colors"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => onDelete(cur)}
                          title="Eliminar divisa global"
                          className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
`;
fs.writeFileSync(currenciesTablePath, currenciesTableContent, 'utf8');
console.log('✓ CurrenciesMasterTable.tsx creado');

// 7. MasterCatalogTab.tsx
const masterTabPath = path.join(catalogTabDir, 'MasterCatalogTab.tsx');
const masterTabContent = `import React, { useState } from 'react';
import { MasterSystem, MasterCurrency } from '../../types';
import { SystemsMasterTable } from './SystemsMasterTable';
import { SystemMasterModal } from './SystemMasterModal';
import { CurrenciesMasterTable } from './CurrenciesMasterTable';
import { CurrencyMasterModal } from './CurrencyMasterModal';
import { Layers, Coins, Database, CheckCircle2, AlertCircle } from 'lucide-react';

interface Props {
  systems: MasterSystem[];
  currencies: MasterCurrency[];
  onSaveSystem: (sys: Partial<MasterSystem>) => Promise<boolean>;
  onDeleteSystem: (sys: MasterSystem) => Promise<boolean>;
  onSaveCurrency: (cur: Partial<MasterCurrency>) => Promise<boolean>;
  onDeleteCurrency: (cur: MasterCurrency) => Promise<boolean>;
}

export const MasterCatalogTab: React.FC<Props> = ({
  systems,
  currencies,
  onSaveSystem,
  onDeleteSystem,
  onSaveCurrency,
  onDeleteCurrency,
}) => {
  const [subTab, setSubTab] = useState<'systems' | 'currencies'>('systems');

  const [isSystemModalOpen, setIsSystemModalOpen] = useState(false);
  const [selectedSystem, setSelectedSystem] = useState<MasterSystem | null>(null);

  const [isCurrencyModalOpen, setIsCurrencyModalOpen] = useState(false);
  const [selectedCurrency, setSelectedCurrency] = useState<MasterCurrency | null>(null);

  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleEditSystem = (sys: MasterSystem) => {
    setSelectedSystem(sys);
    setIsSystemModalOpen(true);
  };

  const handleCreateSystem = () => {
    setSelectedSystem(null);
    setIsSystemModalOpen(true);
  };

  const handleDeleteSystem = async (sys: MasterSystem) => {
    if (!window.confirm(\`¿Seguro que deseas eliminar el sistema '\${sys.nombre_sistema}' del catálogo maestro global?\`)) {
      return;
    }
    const ok = await onDeleteSystem(sys);
    if (ok) {
      setFeedbackMsg({ type: 'success', text: \`Sistema '\${sys.nombre_sistema}' eliminado con éxito del catálogo maestro.\` });
      setTimeout(() => setFeedbackMsg(null), 4000);
    } else {
      setFeedbackMsg({ type: 'error', text: 'Error al eliminar sistema del catálogo maestro.' });
      setTimeout(() => setFeedbackMsg(null), 4000);
    }
  };

  const handleEditCurrency = (cur: MasterCurrency) => {
    setSelectedCurrency(cur);
    setIsCurrencyModalOpen(true);
  };

  const handleCreateCurrency = () => {
    setSelectedCurrency(null);
    setIsCurrencyModalOpen(true);
  };

  const handleDeleteCurrency = async (cur: MasterCurrency) => {
    if (!window.confirm(\`¿Seguro que deseas eliminar la moneda '\${cur.codigo}' (\${cur.nombre}) del catálogo maestro global?\`)) {
      return;
    }
    const ok = await onDeleteCurrency(cur);
    if (ok) {
      setFeedbackMsg({ type: 'success', text: \`Moneda '\${cur.codigo}' eliminada con éxito del catálogo maestro.\` });
      setTimeout(() => setFeedbackMsg(null), 4000);
    } else {
      setFeedbackMsg({ type: 'error', text: 'Error al eliminar moneda del catálogo maestro.' });
      setTimeout(() => setFeedbackMsg(null), 4000);
    }
  };

  return (
    <div className="space-y-5 animate-fadeIn">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <Database className="w-4 h-4" />
            </span>
            <h2 className="text-lg font-bold text-white font-['Outfit']">
              Catálogo Maestro Global (Sistemas y Monedas)
            </h2>
          </div>
          <p className="text-xs text-slate-400">
            Administra las plataformas y divisas centrales del ecosistema. Los nombres y cabeceras configurados aquí
            se sincronizan y sugieren automáticamente a todas las bancas SaaS.
          </p>
        </div>

        <div className="flex items-center gap-1.5 bg-slate-900/80 p-1 rounded-xl border border-white/5 self-start sm:self-auto shrink-0">
          <button
            onClick={() => setSubTab('systems')}
            className={\`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 \${
              subTab === 'systems'
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow'
                : 'text-slate-400 hover:text-white'
            }\`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Sistemas ({systems.length})</span>
          </button>

          <button
            onClick={() => setSubTab('currencies')}
            className={\`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 \${
              subTab === 'currencies'
                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30 shadow'
                : 'text-slate-400 hover:text-white'
            }\`}
          >
            <Coins className="w-3.5 h-3.5" />
            <span>Monedas ({currencies.length})</span>
          </button>
        </div>
      </div>

      {feedbackMsg && (
        <div
          className={\`p-3 rounded-xl text-xs flex items-center gap-2 animate-fadeIn \${
            feedbackMsg.type === 'success'
              ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-300'
              : 'bg-rose-500/10 border border-rose-500/20 text-rose-300'
          }\`}
        >
          {feedbackMsg.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
          )}
          <span>{feedbackMsg.text}</span>
        </div>
      )}

      {subTab === 'systems' ? (
        <SystemsMasterTable
          systems={systems}
          onOpenCreate={handleCreateSystem}
          onOpenEdit={handleEditSystem}
          onDelete={handleDeleteSystem}
        />
      ) : (
        <CurrenciesMasterTable
          currencies={currencies}
          onOpenCreate={handleCreateCurrency}
          onOpenEdit={handleEditCurrency}
          onDelete={handleDeleteCurrency}
        />
      )}

      <SystemMasterModal
        isOpen={isSystemModalOpen}
        onClose={() => setIsSystemModalOpen(false)}
        system={selectedSystem}
        onSave={onSaveSystem}
      />

      <CurrencyMasterModal
        isOpen={isCurrencyModalOpen}
        onClose={() => setIsCurrencyModalOpen(false)}
        currency={selectedCurrency}
        onSave={onSaveCurrency}
      />
    </div>
  );
};
`;
fs.writeFileSync(masterTabPath, masterTabContent, 'utf8');
console.log('✓ MasterCatalogTab.tsx creado');

// 8. tenantProvisioner.ts
const provisionerPath = path.join(SAAS_DIR, 'src/utils/tenantProvisioner.ts');
const provisionerContent = `import { supabase } from '../lib/supabase';

export interface ProvisioningResult {
  success: boolean;
  currenciesCount: number;
  systemsCount: number;
  agencyId: number | null;
  agencyName: string;
  taquillaUser: string;
  taquillaPass: string;
  error?: string;
}

function cleanName(str: string): string {
  return (str || '').trim();
}

/**
 * Extrae dinámicamente el catálogo maestro de monedas y sistemas actualmente activos en la base de datos
 * Prioriza las tablas padre globales (catalogo_sistemas_maestro y catalogo_monedas_maestro)
 */
export async function fetchDatabaseCatalog(): Promise<{
  currencies: { Nombre_Moneda: string; Simbolo: string }[];
  systems: string[];
}> {
  try {
    const currencyMap = new Map<string, { Nombre_Moneda: string; Simbolo: string }>();
    const systemSet = new Set<string>();

    // 1. Monedas desde catálogo maestro global
    try {
      const { data: masterCurrencies } = await supabase
        .from('catalogo_monedas_maestro')
        .select('codigo, nombre, simbolo')
        .order('es_base', { ascending: false });

      if (masterCurrencies && masterCurrencies.length > 0) {
        masterCurrencies.forEach((c: any) => {
          const code = cleanName(c.codigo || c.nombre || '');
          const symbol = cleanName(c.simbolo || code);
          if (code && !currencyMap.has(code.toUpperCase())) {
            currencyMap.set(code.toUpperCase(), { Nombre_Moneda: code, Simbolo: symbol });
          }
        });
      }
    } catch (_) {}

    // Fallback de monedas operativas
    if (currencyMap.size === 0) {
      const { data: rawCurrencies } = await supabase
        .from('monedas')
        .select('Nombre_Moneda, Simbolo');

      if (rawCurrencies && rawCurrencies.length > 0) {
        rawCurrencies.forEach((c: any) => {
          const name = cleanName(c.Nombre_Moneda || c.nombre_moneda || '');
          const symbol = cleanName(c.Simbolo || c.simbolo || name);
          if (name) {
            const key = name.toUpperCase();
            if (!currencyMap.has(key)) {
              currencyMap.set(key, { Nombre_Moneda: name, Simbolo: symbol });
            }
          }
        });
      }
    }

    // Fallback de seguridad si no hubiese monedas
    if (currencyMap.size === 0) {
      currencyMap.set('BS', { Nombre_Moneda: 'Bs', Simbolo: 'Bs' });
      currencyMap.set('USD', { Nombre_Moneda: 'USD', Simbolo: '$' });
      currencyMap.set('COP', { Nombre_Moneda: 'COP', Simbolo: 'COP' });
    }

    // 2. Sistemas desde catálogo maestro global
    try {
      const { data: masterSystems } = await supabase
        .from('catalogo_sistemas_maestro')
        .select('nombre_sistema')
        .order('nombre_sistema', { ascending: true });

      if (masterSystems && masterSystems.length > 0) {
        masterSystems.forEach((s: any) => {
          const name = cleanName(s.nombre_sistema || '');
          if (name) systemSet.add(name.toUpperCase());
        });
      }
    } catch (_) {}

    // Fallback de sistemas operativos
    if (systemSet.size === 0) {
      const { data: rawSystems } = await supabase
        .from('sistemas')
        .select('nombre_sistema');

      if (rawSystems && rawSystems.length > 0) {
        rawSystems.forEach((s: any) => {
          const name = cleanName(s.nombre_sistema || '');
          if (name) systemSet.add(name.toUpperCase());
        });
      }
    }

    // Fallback de seguridad si no hubiera ninguno
    if (systemSet.size === 0) {
      ['BETM3', 'CDAPUESTAS', 'GATOWEB', 'KENO', 'BETF4', 'GATO PESOS'].forEach((s) =>
        systemSet.add(s)
      );
    }

    return {
      currencies: Array.from(currencyMap.values()),
      systems: Array.from(systemSet.values()),
    };
  } catch (err) {
    console.warn('Error extrayendo catálogo dinámico de la BD, usando predeterminados:', err);
    return {
      currencies: [
        { Nombre_Moneda: 'Bs', Simbolo: 'Bs' },
        { Nombre_Moneda: 'USD', Simbolo: '$' },
        { Nombre_Moneda: 'COP', Simbolo: 'COP' },
      ],
      systems: ['BETM3', 'CDAPUESTAS', 'GATOWEB', 'KENO', 'BETF4', 'GATO PESOS'],
    };
  }
}

/**
 * Aprovisiona completamente un nuevo SaaS Tenant con Monedas, Sistemas,
 * Agencia Demo y Terminal Taquilla con cajero operativo.
 */
export async function provisionTenantFromDatabase(
  userId: string,
  bancaName: string
): Promise<ProvisioningResult> {
  const result: ProvisioningResult = {
    success: false,
    currenciesCount: 0,
    systemsCount: 0,
    agencyId: null,
    agencyName: 'AGENCIA 01 - DEMO',
    taquillaUser: 'taquilla1',
    taquillaPass: '123456',
  };

  if (!userId) {
    result.error = 'No se proporcionó un ID de usuario válido';
    return result;
  }

  try {
    const { currencies, systems } = await fetchDatabaseCatalog();

    const currenciesPayload = currencies.map((c) => ({
      Nombre_Moneda: c.Nombre_Moneda,
      Simbolo: c.Simbolo,
      user_id: userId,
    }));

    const { error: currErr } = await supabase.from('monedas').insert(currenciesPayload);
    if (!currErr) {
      result.currenciesCount = currenciesPayload.length;
    } else {
      console.error('Error insertando monedas para el tenant:', currErr);
    }

    const systemsPayload = systems.map((sys) => ({
      nombre_sistema: sys,
      user_id: userId,
    }));

    const { error: sysErr } = await supabase.from('sistemas').insert(systemsPayload);
    if (!sysErr) {
      result.systemsCount = systemsPayload.length;
    } else {
      console.error('Error insertando sistemas para el tenant:', sysErr);
    }

    const safeBancaSlug = (bancaName || 'banca')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .slice(0, 8);
    const taquillaUser = \`taq_\${safeBancaSlug || 'demo'}\`;
    const taquillaPass = '123456';
    const agencyName = 'AGENCIA 01 - DEMO';

    result.taquillaUser = taquillaUser;
    result.taquillaPass = taquillaPass;
    result.agencyName = agencyName;

    const currencyNames = currencies.map((c) => c.Nombre_Moneda);
    const condicionesSistemas: Record<string, any> = {};

    systems.forEach((sys) => {
      currencyNames.forEach((mon) => {
        const comboKey = \`\${sys}_\${mon}\`;
        condicionesSistemas[comboKey] = {
          sistema: sys,
          moneda: mon,
          codigo: agencyName,
          comision: 15,
          participacion: 0,
        };
      });
      condicionesSistemas[sys] = {
        sistema: sys,
        codigo: agencyName,
        comision: 15,
      };
    });

    const agencyPayload = {
      nombre_agencia: agencyName,
      sistemas: systems.join(', '),
      monedas: currencyNames.join(', '),
      comision: 15,
      participacion_ag: 0,
      saldo_inicial_bs: 0,
      saldo_inicial_usd: 0,
      saldo_inicial_cop: 0,
      Saldo_BS: 0,
      Saldo_USD: 0,
      Saldo_COP: 0,
      auditoria_activa: true,
      cuentas_asignadas: 'NINGUNA',
      usuario_taquilla: taquillaUser,
      clave_taquilla: taquillaPass,
      condiciones_sistemas: JSON.stringify(condicionesSistemas),
      user_id: userId,
    };

    const { data: agencyData, error: agErr } = await supabase
      .from('agencias')
      .insert(agencyPayload)
      .select('id')
      .single();

    if (agErr) {
      console.error('Error creando agencia demo:', agErr);
    } else if (agencyData) {
      result.agencyId = agencyData.id;

      const cashierPayload = {
        user_id: userId,
        agencia_id: agencyData.id,
        usuario: taquillaUser,
        clave: taquillaPass,
        nombre_cajero: 'Cajero Demo 01',
        rol: 'cajero',
        activo: true,
      };

      const { error: cashierErr } = await supabase
        .from('taquilla_usuarios')
        .insert(cashierPayload);

      if (cashierErr) {
        console.error('Error creando usuario taquilla demo:', cashierErr);
      }
    }

    result.success = true;
    return result;
  } catch (err: any) {
    console.error('Error general en aprovisionamiento dinámico:', err);
    result.error = err.message || 'Error desconocido';
    return result;
  }
}
`;
fs.writeFileSync(provisionerPath, provisionerContent, 'utf8');
console.log('✓ tenantProvisioner.ts actualizado');

// 9. App.tsx
const appPath = path.join(SAAS_DIR, 'src/App.tsx');
const appContent = `import React, { useState, useEffect } from 'react';
import { useAuth } from './context/AuthContext';
import { supabase } from './lib/supabase';
import { ClientProfile, Lead, TrackingLead, CatalogPlans, MasterSystem, MasterCurrency, PLANES_DEFAULT_DICT, TODOS_LOS_MODULOS_CMS } from './types';
import { Header } from './components/Header';
import { MetricsCards } from './components/MetricsCards';
import { Login } from './components/Login';
import { ClientsTable } from './components/ClientsTab/ClientsTable';
import { ClientModal } from './components/ClientsTab/ClientModal';
import { PasswordModal } from './components/ClientsTab/PasswordModal';
import { LeadsList } from './components/LeadsTab/LeadsList';
import { QuotationEngine } from './components/LeadsTab/QuotationEngine';
import { TrackingList } from './components/TrackingTab/TrackingList';
import { ActivationModal } from './components/TrackingTab/ActivationModal';
import { SuccessModal } from './components/TrackingTab/SuccessModal';
import { PlansSummary } from './components/PlansTab/PlansSummary';
import { PlanEditor } from './components/PlansTab/PlanEditor';
import { NewPlanForm } from './components/PlansTab/NewPlanForm';
import { FactoryReset } from './components/PlansTab/FactoryReset';
import { MasterCatalogTab } from './components/MasterCatalogTab/MasterCatalogTab';
import { Users, Send, Clock, Settings2, RefreshCw, ExternalLink, Globe, Database } from 'lucide-react';

export const App: React.FC = () => {
  const { isAuthenticated, adminId } = useAuth();

  const [activeTab, setActiveTab] = useState<'clients' | 'leads' | 'tracking' | 'plans' | 'master-catalog'>('clients');
  const [loading, setLoading] = useState(true);

  // Data states
  const [clients, setClients] = useState<ClientProfile[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [trackingLeads, setTrackingLeads] = useState<TrackingLead[]>([]);
  const [catalog, setCatalog] = useState<CatalogPlans>(PLANES_DEFAULT_DICT);
  const [masterSystems, setMasterSystems] = useState<MasterSystem[]>([]);
  const [masterCurrencies, setMasterCurrencies] = useState<MasterCurrency[]>([]);

  // Modal states
  const [selectedClientForEdit, setSelectedClientForEdit] = useState<ClientProfile | null>(null);
  const [selectedClientForPassword, setSelectedClientForPassword] = useState<ClientProfile | null>(null);
  const [selectedLeadForQuote, setSelectedLeadForQuote] = useState<Lead | null>(null);
  const [selectedLeadForActivation, setSelectedLeadForActivation] = useState<TrackingLead | null>(null);
  const [activationSuccessData, setActivationSuccessData] = useState<any>(null);

  // Normalizador de nombre de plan
  const normalizePlanName = (p: string): string => {
    const s = (p || '').toLowerCase().trim();
    if (s.includes('básic') || s.includes('basic') || s.includes('sico')) return 'basico';
    if (s.includes('profesional') || s.includes('pro')) return 'profesional';
    if (s.includes('elite') || s.includes('élit') || s.includes('premium') || s.includes('admin')) return 'elite';
    return s.replace(/[^a-zA-Z0-9_]/g, '') || 'plan';
  };

  // Carga de datos
  const loadAllData = async () => {
    setLoading(true);
    try {
      // 1. Clientes (perfiles)
      const { data: pData } = await supabase.from('perfiles').select('*').order('nombre_banca', { ascending: true });
      if (pData) setClients(pData as ClientProfile[]);

      // 2. Leads (suscriptores_leads)
      const { data: lData } = await supabase.from('suscriptores_leads').select('*').order('id', { ascending: false });
      if (lData) {
        setLeads(lData as Lead[]);
        if (lData.length > 0 && !selectedLeadForQuote) {
          setSelectedLeadForQuote(lData[0] as Lead);
        }
      }

      // 3. Seguimiento (leads_seguimiento)
      const { data: sData } = await supabase.from('leads_seguimiento').select('*').eq('estado_seguimiento', 'esperando_pago').order('id', { ascending: false });
      if (sData) setTrackingLeads(sData as TrackingLead[]);

      // 4. Catálogo de planes
      const { data: cData } = await supabase.from('config_sistema').select('valor').eq('parametro', 'planes_saas_catalogo');
      if (cData && cData.length > 0 && cData[0].valor) {
        try {
          const parsed = JSON.parse(cData[0].valor);
          if (parsed && typeof parsed === 'object') {
            setCatalog(parsed);
          }
        } catch (e) {
          console.error('Error parseando planes_saas_catalogo:', e);
        }
      }

      // 5. Catálogo Maestro de Sistemas Globales
      try {
        const { data: sysData, error: sysErr } = await supabase
          .from('catalogo_sistemas_maestro')
          .select('*')
          .order('nombre_sistema', { ascending: true });
        if (!sysErr && sysData) {
          setMasterSystems(sysData as MasterSystem[]);
        }
      } catch (err) {
        console.warn('Error cargando catalogo_sistemas_maestro:', err);
      }

      // 6. Catálogo Maestro de Monedas Globales
      try {
        const { data: curData, error: curErr } = await supabase
          .from('catalogo_monedas_maestro')
          .select('*')
          .order('es_base', { ascending: false });
        if (!curErr && curData) {
          setMasterCurrencies(curData as MasterCurrency[]);
        }
      } catch (err) {
        console.warn('Error cargando catalogo_monedas_maestro:', err);
      }
    } catch (err) {
      console.error('Error cargando datos del sistema:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      loadAllData();
    }
  }, [isAuthenticated]);

  // Guardar catálogo completo de planes en DB
  const saveCatalogToDb = async (newCatalog: CatalogPlans): Promise<boolean> => {
    try {
      const uId = adminId || 'f300c8ad-ddd5-4953-a267-d5b3eb80ce39';

      const { data: existing } = await supabase
        .from('config_sistema')
        .select('parametro')
        .eq('parametro', 'planes_saas_catalogo');

      let insErr = null;
      if (existing && existing.length > 0) {
        const { error } = await supabase
          .from('config_sistema')
          .update({ valor: JSON.stringify(newCatalog) })
          .eq('parametro', 'planes_saas_catalogo');
        insErr = error;
      } else {
        const { error } = await supabase
          .from('config_sistema')
          .insert({
            parametro: 'planes_saas_catalogo',
            valor: JSON.stringify(newCatalog),
            user_id: uId
          });
        insErr = error;
      }

      if (insErr) {
        console.error('Error guardando planes_saas_catalogo:', insErr);
        return false;
      }

      for (const [name, info] of Object.entries(newCatalog)) {
        const norm = normalizePlanName(name);
        const paramKey = `plan_modulos_${norm}`;
        const { data: exMod } = await supabase
          .from('config_sistema')
          .select('parametro')
          .eq('parametro', paramKey);

        const modVal = JSON.stringify(info.modulos || TODOS_LOS_MODULOS_CMS);
        if (exMod && exMod.length > 0) {
          await supabase
            .from('config_sistema')
            .update({ valor: modVal })
            .eq('parametro', paramKey);
        } else {
          await supabase
            .from('config_sistema')
            .insert({
              parametro: paramKey,
              valor: modVal,
              user_id: uId
            });
        }
      }

      setCatalog(newCatalog);
      return true;
    } catch (err) {
      console.error('Error guardando catálogo en DB:', err);
      return false;
    }
  };

  const handleSavePlan = async (oldName: string, newName: string, updatedData: any): Promise<boolean> => {
    const updatedCatalog = { ...catalog };
    if (oldName !== newName) {
      delete updatedCatalog[oldName];
    }
    updatedCatalog[newName] = updatedData;
    return await saveCatalogToDb(updatedCatalog);
  };

  const handleCreatePlan = async (planName: string, planData: any): Promise<boolean> => {
    const updatedCatalog = {
      ...catalog,
      [planName]: planData
    };
    return await saveCatalogToDb(updatedCatalog);
  };

  const handleDeletePlan = async (planName: string): Promise<boolean> => {
    const updatedCatalog = { ...catalog };
    delete updatedCatalog[planName];
    return await saveCatalogToDb(updatedCatalog);
  };

  const handleResetToFactory = async (): Promise<boolean> => {
    return await saveCatalogToDb(PLANES_DEFAULT_DICT);
  };

  // Operaciones de Catálogo Maestro Global
  const handleSaveMasterSystem = async (sys: Partial<MasterSystem>): Promise<boolean> => {
    try {
      if (sys.id) {
        const { error } = await supabase
          .from('catalogo_sistemas_maestro')
          .update({
            nombre_sistema: sys.nombre_sistema,
            col_agencia: sys.col_agencia,
            col_venta: sys.col_venta,
            col_premio: sys.col_premio,
            descripcion: sys.descripcion,
            updated_at: new Date().toISOString()
          })
          .eq('id', sys.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('catalogo_sistemas_maestro')
          .insert({
            nombre_sistema: sys.nombre_sistema,
            col_agencia: sys.col_agencia || 'Agencia',
            col_venta: sys.col_venta || 'Venta',
            col_premio: sys.col_premio || 'Premio',
            descripcion: sys.descripcion || null
          });
        if (error) throw error;
      }
      await loadAllData();
      return true;
    } catch (err) {
      console.error('Error guardando sistema maestro:', err);
      return false;
    }
  };

  const handleDeleteMasterSystem = async (sys: MasterSystem): Promise<boolean> => {
    try {
      if (!sys.id) return false;
      const { error } = await supabase
        .from('catalogo_sistemas_maestro')
        .delete()
        .eq('id', sys.id);
      if (error) throw error;
      await loadAllData();
      return true;
    } catch (err) {
      console.error('Error eliminando sistema maestro:', err);
      return false;
    }
  };

  const handleSaveMasterCurrency = async (cur: Partial<MasterCurrency>): Promise<boolean> => {
    try {
      if (cur.id) {
        const { error } = await supabase
          .from('catalogo_monedas_maestro')
          .update({
            codigo: cur.codigo,
            nombre: cur.nombre,
            simbolo: cur.simbolo,
            decimales: cur.decimales,
            es_base: cur.es_base,
            updated_at: new Date().toISOString()
          })
          .eq('id', cur.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('catalogo_monedas_maestro')
          .insert({
            codigo: cur.codigo,
            nombre: cur.nombre,
            simbolo: cur.simbolo,
            decimales: cur.decimales ?? 2,
            es_base: cur.es_base ?? false
          });
        if (error) throw error;
      }
      await loadAllData();
      return true;
    } catch (err) {
      console.error('Error guardando moneda maestra:', err);
      return false;
    }
  };

  const handleDeleteMasterCurrency = async (cur: MasterCurrency): Promise<boolean> => {
    try {
      if (!cur.id) return false;
      const { error } = await supabase
        .from('catalogo_monedas_maestro')
        .delete()
        .eq('id', cur.id);
      if (error) throw error;
      await loadAllData();
      return true;
    } catch (err) {
      console.error('Error eliminando moneda maestra:', err);
      return false;
    }
  };

  const handleDeleteTrackingLead = async (lead: TrackingLead) => {
    if (!window.confirm(`¿Eliminar la solicitud de ${lead.banca}?`)) return;
    try {
      await supabase.from('leads_seguimiento').delete().eq('id', lead.id);
      loadAllData();
    } catch (err) {
      console.error('Error eliminando lead en seguimiento:', err);
    }
  };

  if (!isAuthenticated) {
    return <Login />;
  }

  return (
    <div className="min-h-screen bg-[#071217] text-slate-100 flex flex-col font-['Plus_Jakarta_Sans'] selection:bg-emerald-500 selection:text-black">
      <Header />

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        
        {/* Top KPIs */}
        <MetricsCards clients={clients} />

        {/* Tab Navigation Capsule */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/60 p-1.5 rounded-2xl border border-white/5">
          <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto">
            <button
              onClick={() => setActiveTab('clients')}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
                activeTab === 'clients'
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow-lg shadow-emerald-500/10'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>Clientes ({clients.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('leads')}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
                activeTab === 'leads'
                  ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30 shadow-lg shadow-sky-500/10'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Send className="w-4 h-4" />
              <span>Solicitudes ({leads.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('tracking')}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
                activeTab === 'tracking'
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30 shadow-lg shadow-amber-500/10'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Clock className="w-4 h-4" />
              <span>Seguimiento ({trackingLeads.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('plans')}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
                activeTab === 'plans'
                  ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30 shadow-lg shadow-purple-500/10'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Settings2 className="w-4 h-4" />
              <span>Planes ({Object.keys(catalog).length})</span>
            </button>

            <button
              onClick={() => setActiveTab('master-catalog')}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
                activeTab === 'master-catalog'
                  ? 'bg-teal-500/20 text-teal-400 border border-teal-500/30 shadow-lg shadow-teal-500/10'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Database className="w-4 h-4" />
              <span>Catálogo Global ({masterSystems.length + masterCurrencies.length})</span>
            </button>
          </div>

          <button
            onClick={loadAllData}
            disabled={loading}
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-400 hover:text-emerald-400 transition-colors disabled:opacity-50"
            title="Recargar datos"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Actualizar</span>
          </button>
        </div>

        {/* Tab Content */}
        <div>
          {/* Tab 1: Clientes */}
          {activeTab === 'clients' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-white font-['Outfit']">
                    Gestión de Clientes Activos y Licencias
                  </h2>
                  <p className="text-xs text-slate-400">
                    Edite bancos, amplíe puntos de venta, asigne planes y extienda suscripciones en tiempo real.
                  </p>
                </div>
              </div>

              <ClientsTable
                clients={clients}
                onSelectClient={(c) => setSelectedClientForEdit(c)}
                onOpenPasswordModal={(c) => setSelectedClientForPassword(c)}
              />
            </div>
          )}

          {/* Tab 2: Solicitudes */}
          {activeTab === 'leads' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-white/5">
                <div>
                  <h2 className="text-lg font-bold text-white font-['Outfit']">
                    Gestión Estratégica de Leads (Solicitudes Entrantes)
                  </h2>
                  <p className="text-xs text-slate-400">
                    Prospectos capturados desde el formulario de la landing comercial pública.
                  </p>
                </div>

                <a
                  href="https://multibancaexpress.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3.5 py-1.5 rounded-xl bg-slate-900 border border-slate-700/60 hover:border-amber-500/40 text-amber-400 text-xs font-semibold flex items-center gap-1.5 transition-colors self-start sm:self-auto"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Ver Formulario Público</span>
                </a>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-5">
                  <LeadsList
                    leads={leads}
                    selectedLead={selectedLeadForQuote}
                    onSelectLead={(l) => setSelectedLeadForQuote(l)}
                  />
                </div>

                <div className="lg:col-span-7">
                  {selectedLeadForQuote ? (
                    <QuotationEngine
                      lead={selectedLeadForQuote}
                      catalog={catalog}
                      onMovedToTracking={() => {
                        loadAllData();
                        setSelectedLeadForQuote(null);
                        setActiveTab('tracking');
                      }}
                    />
                  ) : (
                    <div className="glass-panel p-8 rounded-2xl text-center text-slate-500 text-xs">
                      Seleccione una solicitud de la lista izquierda para iniciar la cotización dinámica.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Tab 3: Seguimiento */}
          {activeTab === 'tracking' && (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-bold text-white font-['Outfit']">
                  Prospectos en Espera de Activación
                </h2>
                <p className="text-xs text-slate-400">
                  Verifique pagos acordados y active el SaaS creando las credenciales oficiales en un solo clic.
                </p>
              </div>

              <TrackingList
                trackingLeads={trackingLeads}
                onSelectToActivate={(t) => setSelectedLeadForActivation(t)}
                onDeleteLead={handleDeleteTrackingLead}
              />
            </div>
          )}

          {/* Tab 4: Planes */}
          {activeTab === 'plans' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-white/5">
                <div>
                  <h2 className="text-lg font-bold text-white font-['Outfit']">
                    Catálogo Dinámico de Planes SaaS y Matriz de Permisos
                  </h2>
                  <p className="text-xs text-slate-400">
                    Cree y modifique en tiempo real todos los renglones y columnas de los planes oficiales.
                  </p>
                </div>

                <a
                  href="https://multibancaexpress.com/#planes"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3.5 py-1.5 rounded-xl bg-slate-900 border border-slate-700/60 hover:border-sky-500/40 text-sky-400 text-xs font-semibold flex items-center gap-1.5 transition-colors self-start sm:self-auto"
                >
                  <Globe className="w-3.5 h-3.5" />
                  <span>Ver Planes en la Web (Público)</span>
                </a>
              </div>

              {/* 1. Summary Table */}
              <PlansSummary catalog={catalog} />

              {/* 2. Editor & New Plan */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <PlanEditor
                  catalog={catalog}
                  onSavePlan={handleSavePlan}
                  onDeletePlan={handleDeletePlan}
                />
                <NewPlanForm
                  catalog={catalog}
                  onCreatePlan={handleCreatePlan}
                />
              </div>

              {/* 3. Factory Reset */}
              <FactoryReset onResetToFactory={handleResetToFactory} />
            </div>
          )}

          {/* Tab 5: Catálogo Global Maestro */}
          {activeTab === 'master-catalog' && (
            <MasterCatalogTab
              systems={masterSystems}
              currencies={masterCurrencies}
              onSaveSystem={handleSaveMasterSystem}
              onDeleteSystem={handleDeleteMasterSystem}
              onSaveCurrency={handleSaveMasterCurrency}
              onDeleteCurrency={handleDeleteMasterCurrency}
            />
          )}
        </div>

      </main>

      {/* MODALS */}
      {selectedClientForEdit && (
        <ClientModal
          client={selectedClientForEdit}
          catalog={catalog}
          onClose={() => setSelectedClientForEdit(null)}
          onSaved={() => loadAllData()}
        />
      )}

      {selectedClientForPassword && (
        <PasswordModal
          client={selectedClientForPassword}
          onClose={() => setSelectedClientForPassword(null)}
        />
      )}

      {selectedLeadForActivation && (
        <ActivationModal
          lead={selectedLeadForActivation}
          onClose={() => setSelectedLeadForActivation(null)}
          onActivated={(creds) => {
            setSelectedLeadForActivation(null);
            setActivationSuccessData(creds);
            loadAllData();
          }}
        />
      )}

      {activationSuccessData && (
        <SuccessModal
          credentials={activationSuccessData}
          onClose={() => setActivationSuccessData(null)}
        />
      )}

    </div>
  );
};

export default App;
`;
fs.writeFileSync(appPath, appContent, 'utf8');
console.log('✓ App.tsx actualizado con la pestaña Catálogo Global');

console.log('\n=============================================================');
console.log('🎉 TODOS LOS COMPONENTES CREADOS Y SINCRONIZADOS CON ÉXITO');
console.log('=============================================================\n');
