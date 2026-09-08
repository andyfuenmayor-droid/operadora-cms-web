import React from 'react';
import { useAuth } from '../../context/AuthContext';
import type { ModuleId } from '../../types';
import {
  Home,
  CheckSquare,
  Layers,
  Coins,
  Landmark,
  Store,
  Bike,
  CloudUpload,
  CircleDollarSign,
  Receipt,
  Wallet,
  TrendingUp,
  FileText,
  ShieldCheck,
  Vault,
  Handshake,
  BarChart3,
  ClipboardList,
  Archive,
  SlidersHorizontal,
  Calculator,
  Lock,
  Settings,
  Users,
  LogOut,
  X,
} from 'lucide-react';

interface SidebarProps {
  currentModule: ModuleId;
  onSelectModule: (mod: ModuleId) => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

const moduleIconMap: Record<ModuleId, React.ComponentType<{ className?: string }>> = {
  Inicio: Home,
  'Pizarra Confirmaciones': CheckSquare,
  Sistemas: Layers,
  Monedas: Coins,
  'Cuentas Bancarias': Landmark,
  Agencias: Store,
  Cobradores: Bike,
  'Cargar Ventas': CloudUpload,
  'Pagos Agencias': CircleDollarSign,
  'Gastos Agencias': Receipt,
  'Saldo Agencias': Wallet,
  'Venta Real': TrendingUp,
  'Rep. Agencia': FileText,
  Auditoría: ShieldCheck,
  'Caja Maestra': Vault,
  'Pagos a Operador': Handshake,
  'Venta Operadora': BarChart3,
  'Reporte Operadora': ClipboardList,
  'Cierre Operadora': Archive,
  'Config. Proveedores': SlidersHorizontal,
  'Gastos Administrativos': Calculator,
  'Cierre ': Lock,
  Ajustes: Settings,
  Usuarios: Users,
};

export const Sidebar: React.FC<SidebarProps> = ({
  currentModule,
  onSelectModule,
  mobileOpen,
  onCloseMobile,
}) => {
  const { user, profile, allowedModules, logout } = useAuth();

  const bancaNombre = (profile?.nombre_banca || profile?.banca || 'BANCA Y OPERADORA').toUpperCase();
  const planRaw = user?.plan || 'elite';
  const planDisplay =
    planRaw === 'basico'
      ? 'PLAN BÁSICO (SAAS)'
      : planRaw === 'profesional'
      ? 'PLAN PROFESIONAL (SAAS)'
      : 'PLAN ELITE (SAAS)';

  return (
    <>
      {/* Mobile Backdrop */}
      {mobileOpen && (
        <div
          onClick={onCloseMobile}
          className="fixed inset-0 bg-black/60 backdrop-blur-xs z-40 lg:hidden"
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 w-64 bg-[#0D1B22] border-r border-slate-800/80 flex flex-col justify-between transition-transform duration-200 ease-in-out lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Top: Branding & Company details */}
        <div className="p-4 border-b border-slate-800/80">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 p-0.5 shadow-sm">
                <div className="w-full h-full bg-[#071217] rounded-[10px] flex items-center justify-center">
                  <span className="text-emerald-400 font-black text-sm">ME</span>
                </div>
              </div>
              <div>
                <div className="text-sm font-black text-white tracking-tight leading-tight">
                  Multibanca <span className="text-emerald-400">Express</span>
                </div>
                <div className="text-[10px] font-bold text-slate-400 tracking-wider">
                  CONTROL MAESTRO
                </div>
              </div>
            </div>

            <button
              onClick={onCloseMobile}
              className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white lg:hidden cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Subscriber & Plan Card */}
          <div className="mt-3 p-2.5 rounded-xl bg-slate-900/60 border border-slate-800/80">
            <div className="text-[11px] font-black text-emerald-400 truncate tracking-wide">
              🏢 {bancaNombre}
            </div>
            <div className="text-[9.5px] font-bold text-sky-400 tracking-wider mt-0.5">
              🥇 {planDisplay}
            </div>
            <div className="text-[10px] text-slate-400 truncate font-mono mt-0.5">
              {user?.email}
            </div>
          </div>
        </div>

        {/* Middle: Navigation Items */}
        <div className="flex-1 overflow-y-auto py-2 px-2.5 space-y-0.5">
          {allowedModules.map((modId) => {
            const IconComp = moduleIconMap[modId] || Layers;
            const isActive = currentModule === modId;

            return (
              <button
                key={modId}
                onClick={() => {
                  onSelectModule(modId);
                  onCloseMobile();
                }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold transition-all text-left cursor-pointer ${
                  isActive
                    ? 'bg-emerald-500 text-black shadow-md font-extrabold shadow-emerald-500/10'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/50'
                }`}
              >
                <IconComp className={`w-4 h-4 shrink-0 ${isActive ? 'text-black' : 'text-emerald-400'}`} />
                <span className="truncate">{modId}</span>
              </button>
            );
          })}
        </div>

        {/* Bottom: Logout */}
        <div className="p-3 border-t border-slate-800/80">
          <button
            onClick={() => logout()}
            className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-slate-800/80 hover:bg-rose-500/20 text-slate-300 hover:text-rose-400 text-xs font-bold transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>Cerrar Sesión</span>
          </button>
        </div>
      </aside>
    </>
  );
};
