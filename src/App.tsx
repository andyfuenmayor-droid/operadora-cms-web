import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Login } from './components/Login';
import { Shell } from './components/Layout/Shell';
import type { ModuleId } from './types';

// Components
import { HomeDashboard } from './components/Home/HomeDashboard';
import { ConfirmationsBoard } from './components/Confirmations/ConfirmationsBoard';
import { AuditTab } from './components/Audit/AuditTab';
import { SystemsTab } from './components/Catalogs/SystemsTab';
import { CurrenciesTab } from './components/Catalogs/CurrenciesTab';
import { BankAccountsTab } from './components/Catalogs/BankAccountsTab';
import { AgenciesTab } from './components/Agencies/AgenciesTab';
import { CollectorsTab } from './components/Collectors/CollectorsTab';
import { SalesEntryTab } from './components/Finance/SalesEntryTab';
import { PaymentsTab } from './components/Finance/PaymentsTab';
import { ExpensesTab } from './components/Finance/ExpensesTab';
import { AccountBalancesTab } from './components/Finance/AccountBalancesTab';
import { WeeklyClosureTab } from './components/Finance/WeeklyClosureTab';
import { OperatorsTab } from './components/Administration/OperatorsTab';
import { CycleSettingsTab } from './components/Settings/CycleSettingsTab';
import { UsersTab } from './components/Administration/UsersTab';

const AppContent: React.FC = () => {
  const { isAuthenticated, isLoading, allowedModules } = useAuth();
  const [currentModule, setCurrentModule] = useState<ModuleId>('Inicio');

  // Loading Screen
  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#071217] flex flex-col items-center justify-center text-center p-4">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-emerald-500 via-teal-400 to-sky-400 p-0.5 shadow-2xl shadow-emerald-500/30 animate-pulse mb-4">
          <div className="w-full h-full bg-[#0D1B22] rounded-[14px] flex items-center justify-center">
            <span className="text-emerald-400 font-black text-xl">ME</span>
          </div>
        </div>
        <h3 className="text-lg font-bold text-white">Multibanca Express</h3>
        <p className="text-xs text-slate-400 mt-1">Cargando Control Maestro SaaS...</p>
      </div>
    );
  }

  // Authentication Guard
  if (!isAuthenticated) {
    return <Login />;
  }

  // Adjust active module if user no longer has access to it
  const activeModule = allowedModules.includes(currentModule) ? currentModule : allowedModules[0] || 'Inicio';

  const renderModuleContent = () => {
    switch (activeModule) {
      case 'Inicio':
        return <HomeDashboard onNavigate={setCurrentModule} />;

      case 'Pizarra Confirmaciones':
      case 'Caja Maestra':
        return <ConfirmationsBoard />;

      case 'Auditoría':
        return <AuditTab />;

      case 'Sistemas':
      case 'Config. Proveedores':
        return <SystemsTab />;

      case 'Monedas':
        return <CurrenciesTab />;

      case 'Cuentas Bancarias':
        return <BankAccountsTab />;

      case 'Agencias':
        return <AgenciesTab />;

      case 'Cobradores':
        return <CollectorsTab />;

      case 'Cargar Ventas':
      case 'Venta Real':
        return <SalesEntryTab />;

      case 'Pagos Agencias':
      case 'Pagos a Operador':
        return <PaymentsTab />;

      case 'Gastos Agencias':
      case 'Gastos Administrativos':
        return <ExpensesTab />;

      case 'Saldo Agencias':
      case 'Rep. Agencia':
        return <AccountBalancesTab />;

      case 'Cierre ':
        return <WeeklyClosureTab />;

      case 'Venta Operadora':
      case 'Reporte Operadora':
      case 'Cierre Operadora':
        return <OperatorsTab />;

      case 'Ajustes':
        return <CycleSettingsTab />;

      case 'Usuarios':
        return <UsersTab />;

      default:
        return <HomeDashboard onNavigate={setCurrentModule} />;
    }
  };

  return (
    <Shell currentModule={activeModule} onSelectModule={setCurrentModule}>
      {renderModuleContent()}
    </Shell>
  );
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
};

export default App;
