import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Login } from './components/Login';
import { Shell } from './components/Layout/Shell';
import type { ModuleId } from './types';
import { Construction, Sparkles } from 'lucide-react';

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

  return (
    <Shell currentModule={activeModule} onSelectModule={setCurrentModule}>
      {/* Dynamic Module Router */}
      <div className="space-y-6">
        <div className="bg-[#0D1B22] border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-3 rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-black text-white">{activeModule}</h2>
              <p className="text-xs text-slate-400">
                Módulo central de Operadora CMS Web • Multibanca Express
              </p>
            </div>
          </div>

          <div className="mt-6 p-6 rounded-2xl bg-[#071217] border border-slate-800/80 text-center space-y-3">
            <Construction className="w-10 h-10 text-amber-400 mx-auto animate-bounce" />
            <div className="text-sm font-bold text-white">
              Fase 1 completada con éxito: Infraestructura, Auth SaaS y Shell de Navegación
            </div>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              El entorno de desarrollo, TypeScript, TailwindCSS v4, AuthContext y el sistema de sub-usuarios están listos. A continuación implementaremos la Fase 2 (Dashboard Inicio, Sistemas, Monedas, Cuentas Bancarias y POS).
            </p>
          </div>
        </div>
      </div>
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
