import React from 'react';
import { useAuth } from '../../context/AuthContext';
import type { ModuleId } from '../../types';
import { Menu, Calendar, RefreshCw, Bell } from 'lucide-react';
import { formatDate } from '../../utils/formatters';
import { supabase } from '../../lib/supabase';
import { notificationService } from '../../utils/notificationService';
import { realtimeBroadcast } from '../../utils/realtimeBroadcast';
import { ThemeToggle } from '../Common/ThemeToggle';
import { Logo } from '../Common/Logo';

interface HeaderProps {
  currentModule: ModuleId;
  onOpenMobile: () => void;
}

export const Header: React.FC<HeaderProps> = ({ currentModule, onOpenMobile }) => {
  const { systemCycle, refreshSystemCycle } = useAuth();
  const [refreshing, setRefreshing] = React.useState(false);
  const [hasNotificationPerm, setHasNotificationPerm] = React.useState(
    notificationService.getPermissionStatus() === 'granted'
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshSystemCycle();
    setTimeout(() => setRefreshing(false), 500);
  };

  // Listener global de pagos bancarios entrantes por WebSocket y Postgres Realtime
  React.useEffect(() => {
    // 1. WebSocket Broadcast ultra-rápido (0ms latency desde Taquilla)
    const unsubSocket = realtimeBroadcast.subscribe('NEW_BANK_PAYMENT', (data) => {
      notificationService.showNotification('🔔 Nuevo Pago Bancario de Taquilla', {
        body: `Agencia ${data.agencia || 'General'}: ${data.monto ? Number(data.monto).toLocaleString() : ''} ${data.moneda || 'Bs'} (Ref: ${data.referencia || 'N/A'})`,
        soundType: 'new_payment',
        toastType: 'payment',
        tag: `pago_banco_${data.id || data.referencia}`,
      });
    });

    const unsubCashSocket = realtimeBroadcast.subscribe('NEW_CASH_PAYMENT', (data) => {
      notificationService.showNotification('💵 Nueva Entrega de Efectivo / Cobrador', {
        body: `Agencia ${data.agencia || 'General'}: ${data.monto ? Number(data.monto).toLocaleString() : ''} ${data.moneda || 'Bs'}`,
        soundType: 'new_payment',
        toastType: 'cash',
        tag: `pago_efectivo_${data.id || data.referencia}`,
      });
    });

    // 2. Postgres Changes Realtime
    const channel = supabase
      .channel('cms_global_incoming_payments')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'cda_pagos_bancarios' },
        (payload: any) => {
          const row = payload.new;
          notificationService.showNotification('🔔 Nuevo Pago Bancario de Taquilla', {
            body: `Agencia ${row.agencia || 'General'}: ${row.monto ? Number(row.monto).toLocaleString() : ''} ${row.moneda || 'Bs'} (Ref: ${row.referencia || 'N/A'})`,
            soundType: 'new_payment',
            toastType: 'payment',
            tag: `pago_banco_${row.id || row.referencia}`,
          });
        }
      )
      .subscribe();

    return () => {
      unsubSocket();
      unsubCashSocket();
      supabase.removeChannel(channel);
    };
  }, []);

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

        <div className="flex items-center gap-2">
          <div className="lg:hidden mr-1">
            <Logo className="h-6 w-auto" />
          </div>
          <h1 className="text-base sm:text-lg font-black text-white tracking-tight flex items-center gap-2">
            <span>{currentModule}</span>
          </h1>
        </div>
      </div>

      {/* Right: Notification Toggle + Cycle Info Chip + Refresh */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Botón de Alertas y Sonido */}
        <button
          type="button"
          onClick={async () => {
            const granted = await notificationService.requestPermission();
            setHasNotificationPerm(granted);
            await notificationService.testAlerts();
          }}
          className={`px-2.5 py-1.5 rounded-xl border text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm ${
            hasNotificationPerm
              ? 'bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/20'
              : 'bg-slate-800/80 border-slate-700 text-slate-400 hover:text-white'
          }`}
          title="Probar sonido y alertas visuales"
        >
          <Bell className="w-3.5 h-3.5 text-amber-400" />
          <span className="hidden sm:inline">{hasNotificationPerm ? 'Alertas ON' : 'Activar Alertas'}</span>
        </button>

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

        {/* Selector de Tema Claro / Oscuro */}
        <ThemeToggle />
      </div>
    </header>
  );
};
