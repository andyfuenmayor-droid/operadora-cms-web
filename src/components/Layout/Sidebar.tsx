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
  Building2,
  Crown,
  Mail,
} from 'lucide-react';

interface SidebarProps {
  currentModule: ModuleId;
  onSelectModule: (mod: ModuleId) => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

const moduleIconMap: Record<ModuleId, React.ComponentType<{ className?: string }>> = {
  Inicio: Home,
  Confirmaciones: CheckSquare,
  'Rep. Confirmaciones': ClipboardList,
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
  Auditoría: ShieldCheck,
  'Caja Maestra': Vault,
  'Pagos a Operador': Handshake,
  'Venta Operadora': BarChart3,
  'Reporte Operadora': FileText,
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
            <div className="flex items-center gap-2">
              <img 
                src="/logo.svg" 
                alt="Multibanca Express" 
                className="h-9 w-auto filter drop-shadow-[0_0_8px_rgba(0,229,255,0.35)]" 
              />
            </div>

            <button
              onClick={onCloseMobile}
              className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white lg:hidden cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Subscriber & Plan Card (Modern SaaS Aesthetics, Full Readability) */}
          <div className="mt-3.5 p-3 rounded-2xl bg-gradient-to-b from-[#0F242C]/90 to-[#071217]/95 border border-slate-700/60 shadow-lg shadow-black/20 space-y-2">
            {/* Organization / Company Name */}
            <div className="flex items-start gap-2">
              <div className="p-1 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0 mt-0.5">
                <Building2 className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-black text-slate-100 leading-snug tracking-tight break-words">
                  {bancaNombre}
                </div>
              </div>
            </div>

            {/* Plan Badge */}
            <div className="flex items-center gap-1.5 pt-1 border-t border-slate-800/80">
              <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-gradient-to-r from-amber-500/15 via-yellow-500/10 to-amber-500/5 text-amber-300 border border-amber-500/30 text-[10px] font-black uppercase tracking-wider shadow-xs">
                <Crown className="w-3 h-3 text-amber-400 shrink-0" />
                <span>{planDisplay}</span>
              </div>
            </div>

            {/* User Email */}
            <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-mono break-all pt-0.5">
              <Mail className="w-3 h-3 text-slate-500 shrink-0" />
              <span>{user?.email}</span>
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
