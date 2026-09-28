import React from 'react';
import { useAuth } from '../../context/AuthContext';
import type { ModuleId } from '../../types';
import { Menu, Calendar, RefreshCw, Bell, LogOut } from 'lucide-react';
import { formatDate, formatCurrency } from '../../utils/formatters';
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
  const { systemCycle, refreshSystemCycle, logout } = useAuth();
  const [refreshing, setRefreshing] = React.useState(false);
  const [hasNotificationPerm, setHasNotificationPerm] = React.useState(
    notificationService.getPermissionStatus() === 'granted'
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshSystemCycle();
    setTimeout(() => setRefreshing(false), 500);
  };

  // Listener global de pagos entrantes (Taquilla + Agencias CMS) por WebSocket y Postgres Realtime
  React.useEffect(() => {
    // 1. WebSocket Broadcast ultra-rápido (0ms latency)
    const unsubSocket = realtimeBroadcast.subscribe('NEW_BANK_PAYMENT', (data) => {
      notificationService.showNotification('🔔 Nuevo Pago Bancario de Taquilla', {
        body: `Agencia ${data.agencia || 'General'}: ${formatCurrency(Number(data.monto || 0), (data.moneda || 'BS') as any)} (Ref: ${data.referencia || 'N/A'})`,
        soundType: 'new_payment',
        toastType: 'payment',
        tag: `pago_banco_${data.id || data.referencia}`,
      });
    });

    const unsubCashSocket = realtimeBroadcast.subscribe('NEW_CASH_PAYMENT', (data) => {
      notificationService.showNotification('💵 Nueva Entrega de Efectivo / Cobrador', {
        body: `Agencia ${data.agencia || 'General'}: ${formatCurrency(Number(data.monto || 0), (data.moneda || 'BS') as any)}`,
        soundType: 'new_payment',
        toastType: 'cash',
        tag: `pago_efectivo_${data.id || data.referencia}`,
      });
    });

    const unsubAgencySocket = realtimeBroadcast.subscribe('NEW_AGENCY_PAYMENT', (data) => {
      notificationService.showNotification(`🔔 Nuevo Pago de Agencia (${data.metodo_pago || 'BANCO'})`, {
        body: `Agencia ${data.agencia || 'General'}: ${formatCurrency(Number(data.monto || 0), (data.moneda || 'BS') as any)} (Ref: ${data.referencia || 'N/A'})`,
        soundType: 'new_payment',
        toastType: data.metodo_pago === 'EFECTIVO' ? 'cash' : 'payment',
        tag: `pago_semana_${data.id || data.referencia}`,
      });
    });

    const unsubPrizeSocket = realtimeBroadcast.subscribe('NEW_PRIZE_PAYMENT', (data) => {
      notificationService.showNotification('🏆 Nuevo Pago de Premios de Agencia', {
        body: `Agencia ${data.agencia || 'General'}: ${formatCurrency(Number(data.monto || 0), (data.moneda || 'BS') as any)} (Ref: ${data.referencia || 'N/A'})`,
        soundType: 'new_payment',
        toastType: 'payment',
        tag: `pago_semana_premio_${data.id || data.referencia}`,
      });
    });

    const unsubExpenseSocket = realtimeBroadcast.subscribe('NEW_EXPENSE', (data) => {
      const tbl = data.tabla || 'gastos';
      notificationService.showNotification('🧾 Nuevo Gasto por Agencia', {
        body: `Agencia ${data.agencia || 'General'}: ${formatCurrency(Number(data.monto || 0), (data.moneda || 'BS') as any)} • ${data.concepto || 'Gasto Operativo'}`,
        soundType: 'new_payment',
        toastType: 'expense',
        tag: `gasto_${tbl}_${data.id || data.referencia || Date.now()}`,
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
          if (!row.confirmado && !row.rechazado) {
            notificationService.showNotification('🔔 Nuevo Pago Bancario de Taquilla', {
              body: `Agencia ${row.agencia || 'General'}: ${formatCurrency(Number(row.monto || 0), (row.moneda || 'BS') as any)} (Ref: ${row.referencia || 'N/A'})`,
              soundType: 'new_payment',
              toastType: 'payment',
              tag: `pago_banco_${row.id || row.referencia}`,
            });
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'cda_pagos_diarios' },
        (payload: any) => {
          const row = payload.new;
          if (!row.confirmado && !row.rechazado) {
            notificationService.showNotification('💵 Nueva Entrega de Efectivo / Cobrador', {
              body: `Agencia ${row.agencia || 'General'}: ${formatCurrency(Number(row.monto || 0), (row.moneda || 'BS') as any)}`,
              soundType: 'new_payment',
              toastType: 'cash',
              tag: `pago_efectivo_${row.id || row.referencia}`,
            });
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'pagos_semana' },
        (payload: any) => {
          const row = payload.new;
          if (!row.confirmado && !row.rechazado) {
            const isPremio = String(row.tipo_pago || '').toUpperCase().includes('PREMIO') ||
              String(row.referencia || '').toUpperCase().includes('PREMIO');
            const notifTitle = isPremio ? '🏆 Nuevo Pago de Premios de Agencia' : `🔔 Nuevo Pago de Agencia (${row.metodo || 'BANCO'})`;
            const tagKey = isPremio ? `pago_semana_premio_${row.id || row.referencia}` : `pago_semana_${row.id || row.referencia}`;

            notificationService.showNotification(notifTitle, {
              body: `Agencia ${row.agencia || 'General'}: ${formatCurrency(Number(row.monto || 0), (row.moneda || 'BS') as any)} (Ref: ${row.referencia || 'N/A'})`,
              soundType: 'new_payment',
              toastType: row.metodo === 'EFECTIVO' ? 'cash' : 'payment',
              tag: tagKey,
            });
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'gastos' },
        (payload: any) => {
          const row = payload.new;
          if (!row.confirmado && !row.rechazado) {
            notificationService.showNotification('🧾 Nuevo Gasto por Agencia', {
              body: `Agencia ${row.agencia || 'General'}: ${formatCurrency(Number(row.monto || 0), (row.moneda || 'BS') as any)} • ${row.concepto || 'Gasto'}`,
              soundType: 'new_payment',
              toastType: 'expense',
              tag: `gasto_gastos_${row.id}`,
            });
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'cda_gastos_diarios' },
        (payload: any) => {
          const row = payload.new;
          if (!row.confirmado && !row.rechazado) {
            notificationService.showNotification('🧾 Nuevo Gasto Diario de Agencia', {
              body: `Agencia ${row.agencia || 'General'}: ${formatCurrency(Number(row.monto || 0), (row.moneda || 'BS') as any)} • ${row.concepto || row.descripcion || 'Gasto'}`,
              soundType: 'new_payment',
              toastType: 'expense',
              tag: `gasto_cda_gastos_diarios_${row.id}`,
            });
          }
        }
      )
      .subscribe();

    return () => {
      unsubSocket();
      unsubCashSocket();
      unsubAgencySocket();
      unsubPrizeSocket();
      unsubExpenseSocket();
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

        {/* Botón de Cerrar Sesión (Estilo Taquilla Web) */}
        <button
          type="button"
          onClick={logout}
          title="Cerrar Sesión"
          className="p-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 transition-all cursor-pointer"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
