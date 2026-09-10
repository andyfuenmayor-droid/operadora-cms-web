import React from 'react';
import { useAuth } from '../../context/AuthContext';
import type { ModuleId } from '../../types';
import { Menu, Calendar, RefreshCw, UserCheck } from 'lucide-react';
import { formatDate } from '../../utils/formatters';

interface HeaderProps {
  currentModule: ModuleId;
  onOpenMobile: () => void;
}

export const Header: React.FC<HeaderProps> = ({ currentModule, onOpenMobile }) => {
  const { user, systemCycle, refreshSystemCycle } = useAuth();
  const [refreshing, setRefreshing] = React.useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshSystemCycle();
    setTimeout(() => setRefreshing(false), 500);
  };

  return (
    <header className="sticky top-0 z-30 bg-[#071217]/90 backdrop-blur-md border-b border-slate-800/80 px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
      {/* Left: Hamburger + Current Title */}
      <div className="flex items-center gap-3">
        <button
          onClick={onOpenMobile}
          className="p-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white lg:hidden cursor-pointer"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div>
          <img src="/logo.svg" alt="Multibanca Express" className="h-6 w-auto lg:hidden mr-1 filter drop-shadow-[0_0_6px_rgba(0,229,255,0.3)]" />
          <h1 className="text-base sm:text-lg font-black text-white tracking-tight flex items-center gap-2">
            <span>{currentModule}</span>
          </h1>
        </div>
      </div>

      {/* Right: Cycle Info Chip + Refresh + User Role */}
      <div className="flex items-center gap-2 sm:gap-3">
        {systemCycle && (
          <div className="hidden sm:flex items-center gap-2 bg-[#0D1B22] border border-slate-800 px-3 py-1.5 rounded-xl text-xs">
            <Calendar className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className="font-bold text-slate-300">
              Semana {systemCycle.semana}:
            </span>
            <span className="text-slate-400 font-mono text-[11px]">
              {formatDate(systemCycle.desde)} al {formatDate(systemCycle.hasta)}
            </span>
            <button
              onClick={handleRefresh}
              className="ml-1 text-slate-400 hover:text-white transition-colors cursor-pointer"
              title="Actualizar ciclo"
            >
              <RefreshCw className={`w-3 h-3 ${refreshing ? 'animate-spin text-emerald-400' : ''}`} />
            </button>
          </div>
        )}

        <div className="flex items-center gap-2 px-2.5 py-1 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold">
          <UserCheck className="w-3.5 h-3.5" />
          <span className="capitalize">{user?.role || 'Admin'}</span>
        </div>
      </div>
    </header>
  );
};
