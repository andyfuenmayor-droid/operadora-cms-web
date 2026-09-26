import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { Shield, Sparkles, MessageSquare } from 'lucide-react';
import confetti from 'canvas-confetti';
import { Logo } from './Common/Logo';

export const Login: React.FC = () => {
  const { login } = useAuth();
  const { isLight } = useTheme();

  // Login form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loadingLogin, setLoadingLogin] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setLoginError('Por favor ingrese correo y contraseña.');
      return;
    }

    setLoadingLogin(true);
    setLoginError(null);

    const res = await login(email, password);
    if (!res.success) {
      setLoginError(res.message || 'Error de autenticación.');
      setLoadingLogin(false);
    } else {
      confetti({ particleCount: 40, spread: 60, origin: { y: 0.8 } });
    }
  };

  const renderWhatsAppBanner = () => (
    <a
      href="https://wa.me/19542259188?text=Hola%2C%20necesito%20atenci%C3%B3n%20y%20soporte%20en%20Multibanca%20Express"
      target="_blank"
      rel="noopener noreferrer"
      className={`flex items-center justify-between gap-2.5 sm:gap-4 p-3 sm:p-4 rounded-2xl transition-all cursor-pointer group shadow-lg overflow-hidden border ${
        isLight
          ? 'bg-gradient-to-r from-white via-emerald-50/50 to-white border-emerald-200/90 hover:border-emerald-400 shadow-emerald-500/5'
          : 'bg-gradient-to-r from-emerald-950/40 to-teal-950/40 border border-emerald-500/30 hover:border-emerald-500/60 shadow-black/20'
      }`}
    >
      <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
        <div
          className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center text-lg shrink-0 border transition-transform group-hover:scale-105 ${
            isLight
              ? 'bg-emerald-100 text-emerald-700 border-emerald-300'
              : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
          }`}
        >
          <MessageSquare className="w-4 h-4 sm:w-5 sm:h-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className={`text-xs sm:text-sm font-black truncate leading-tight ${isLight ? 'text-slate-900' : 'text-white'}`}>
            ¿Necesitas soporte?
          </div>
          <div className={`text-[10px] sm:text-[11px] font-semibold truncate mt-0.5 ${isLight ? 'text-emerald-700' : 'text-emerald-400'}`}>
            WhatsApp: +1 (954) 225-9188
          </div>
        </div>
      </div>
      <span
        className={`text-[10px] sm:text-xs font-black uppercase px-2.5 sm:px-3 py-1.5 rounded-xl transition-all shrink-0 whitespace-nowrap shadow-sm text-center ${
          isLight
            ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
            : 'bg-emerald-500 text-black group-hover:bg-emerald-400'
        }`}
      >
        Chatear Ahora 📲
      </span>
    </a>
  );

  return (
    <div
      className={`min-h-screen flex flex-col justify-between p-4 sm:p-6 lg:p-10 relative overflow-hidden transition-colors ${
        isLight ? 'bg-slate-50 text-slate-800' : 'bg-[#071217] text-slate-100'
      }`}
    >
      {/* Ambient Lighting Glows */}
      <div
        className={`absolute top-0 right-1/4 w-96 h-96 rounded-full blur-3xl pointer-events-none transition-opacity ${
          isLight ? 'bg-emerald-200/40 opacity-70' : 'bg-emerald-500/10'
        }`}
      />
      <div
        className={`absolute bottom-10 left-10 w-96 h-96 rounded-full blur-3xl pointer-events-none transition-opacity ${
          isLight ? 'bg-sky-200/40 opacity-70' : 'bg-sky-500/10'
        }`}
      />

      <div className="max-w-7xl mx-auto w-full my-auto flex flex-col lg:grid lg:grid-cols-12 gap-6 lg:gap-12 items-center relative z-10">
        {/* BRANDING (Mobile: Top / Desktop: Left Top) */}
        <div className="w-full lg:col-span-7 flex flex-col justify-between space-y-6">
          {/* Brand Logo & Name */}
          <div className="flex items-center gap-3 justify-center sm:justify-start">
            <Logo className="h-12 sm:h-14 w-auto" />
            <div className={`pl-3 border-l ${isLight ? 'border-slate-300' : 'border-slate-700/80'}`}>
              <span
                className={`text-[10px] tracking-widest font-black uppercase px-2 py-0.5 rounded border ${
                  isLight
                    ? 'text-emerald-800 bg-emerald-100/90 border-emerald-300 font-bold'
                    : 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                }`}
              >
                CONTROL MAESTRO
              </span>
              <div className={`text-xs mt-0.5 font-medium ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                SaaS Operadoras v3.0
              </div>
            </div>
          </div>

          {/* Desktop WhatsApp Banner */}
          <div className="hidden lg:block">{renderWhatsAppBanner()}</div>
        </div>

        {/* AUTHENTICATION FORM CARD (Mobile: Middle / Desktop: Right Column) */}
        <div className="w-full lg:col-span-5">
          <div
            className={`border rounded-3xl p-6 sm:p-8 relative overflow-hidden transition-all ${
              isLight
                ? 'bg-white border-slate-200/90 shadow-2xl shadow-slate-300/40'
                : 'bg-[#0D1B22] border-slate-800 shadow-2xl shadow-black/50'
            }`}
          >
            {/* Top Glowing Glow / Accent line */}
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-teal-400 via-emerald-500 to-teal-400" />

            {/* Header */}
            <div className="mb-6">
              <div
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold mb-2 border ${
                  isLight
                    ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                    : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                }`}
              >
                <span>🔐</span> Iniciar Sesión
              </div>
              <h2 className={`text-xl font-black tracking-tight ${isLight ? 'text-slate-900' : 'text-white'}`}>
                Acceso al Panel
              </h2>
              <p className={`text-xs mt-1 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                Ingrese sus credenciales autorizadas para gestionar su operadora.
              </p>
            </div>

            {/* LOGIN FORM */}
            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div>
                <label
                  className={`block text-xs font-bold uppercase tracking-wider mb-1.5 ${
                    isLight ? 'text-slate-700' : 'text-slate-300'
                  }`}
                >
                  📧 Correo de Suscriptor / Usuario
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="ejemplo@tubanca.com"
                  className={`w-full rounded-xl px-3.5 py-2.5 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500/30 ${
                    isLight
                      ? 'bg-slate-50 border border-slate-300 text-slate-900 placeholder-slate-400 focus:bg-white focus:border-emerald-500'
                      : 'bg-[#071217] border border-slate-700 text-white placeholder-slate-500 focus:border-emerald-500'
                  }`}
                />
              </div>

              <div>
                <label
                  className={`block text-xs font-bold uppercase tracking-wider mb-1.5 ${
                    isLight ? 'text-slate-700' : 'text-slate-300'
                  }`}
                >
                  🔑 Contraseña
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="••••••••••••"
                  className={`w-full rounded-xl px-3.5 py-2.5 text-sm transition-all font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/30 ${
                    isLight
                      ? 'bg-slate-50 border border-slate-300 text-slate-900 placeholder-slate-400 focus:bg-white focus:border-emerald-500'
                      : 'bg-[#071217] border border-slate-700 text-white placeholder-slate-500 focus:border-emerald-500'
                  }`}
                />
              </div>

              {loginError && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-500 text-xs font-semibold flex items-center gap-2">
                  <Shield className="w-4 h-4 shrink-0" />
                  <span>{loginError}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={loadingLogin}
                className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-black text-sm tracking-wider uppercase transition-all shadow-lg shadow-emerald-500/25 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {loadingLogin ? (
                  <div className="w-5 h-5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <span>INGRESAR AL PANEL</span>
                    <Sparkles className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          </div>
        </div>

        {/* Mobile WhatsApp Banner (Mobile: Bottom below form) */}
        <div className="w-full lg:hidden">{renderWhatsAppBanner()}</div>
      </div>

      {/* FOOTER */}
      <footer
        className={`text-center text-[11px] tracking-wider py-4 border-t mt-6 relative z-10 ${
          isLight ? 'border-slate-200 text-slate-500' : 'border-slate-900 text-slate-500'
        }`}
      >
        © 2026 Multibanca Express SaaS v3.0 • Todos los derechos reservados • Conexión Segura SSL 256-Bit
      </footer>
    </div>
  );
};

export default Login;
