import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import type { ModuleId } from '../../types';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { AlertTriangle, LogOut } from 'lucide-react';

interface ShellProps {
  currentModule: ModuleId;
  onSelectModule: (mod: ModuleId) => void;
  children: React.ReactNode;
}

export const Shell: React.FC<ShellProps> = ({
  currentModule,
  onSelectModule,
  children,
}) => {
  const { subscriptionError, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#071217] text-slate-100 flex flex-col">
      {/* Sidebar Navigation */}
      <Sidebar
        currentModule={currentModule}
        onSelectModule={onSelectModule}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />

      {/* Main Content Area (Offset for Desktop Sidebar) */}
      <div className="lg:ml-64 flex-1 flex flex-col min-h-screen">
        {/* Top Header */}
        <Header
          currentModule={currentModule}
          onOpenMobile={() => setMobileOpen(true)}
        />

        {/* Subscription Alert Warning if any */}
        {subscriptionError && (
          <div className="bg-rose-500/20 border-b border-rose-500/40 px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3 text-rose-300 text-xs font-bold">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{subscriptionError}</span>
            </div>
            <button
              onClick={() => logout()}
              className="px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-extrabold transition-colors flex items-center gap-1 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Cerrar Sesión</span>
            </button>
          </div>
        )}

        {/* Page Content Viewport */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto animate-fadeIn">
          {children}
        </main>
      </div>
    </div>
  );
};
