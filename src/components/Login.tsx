import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Shield, Sparkles, MessageSquare } from 'lucide-react';
import confetti from 'canvas-confetti';

export const Login: React.FC = () => {
  const { login } = useAuth();

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

  return (
    <div className="min-h-screen bg-[#071217] flex flex-col justify-between p-4 sm:p-6 lg:p-10 text-slate-100">
      <div className="max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center my-auto">
        
        {/* LEFT COLUMN: BRANDING & CONTACT */}
        <div className="lg:col-span-7 space-y-6">
          {/* Brand Logo & Name */}
          <div className="flex items-center gap-3">
            <img 
              src="/logo.svg" 
              alt="Multibanca Express" 
              className="h-12 w-auto filter drop-shadow-[0_0_15px_rgba(0,229,255,0.4)]" 
            />
            <div className="pl-3 border-l border-slate-700/80">
              <span className="text-[10px] tracking-widest font-black uppercase text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                CONTROL MAESTRO
              </span>
              <div className="text-xs text-slate-400 mt-0.5">SaaS Operadoras v3.0</div>
            </div>
          </div>

          {/* WhatsApp Attention Banner */}
          <a
            href="https://wa.me/19542259188?text=Hola%2C%20necesito%20atenci%C3%B3n%20y%20soporte%20en%20Multibanca%20Express"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between p-3.5 rounded-2xl bg-gradient-to-r from-emerald-950/40 to-teal-950/40 border border-emerald-500/30 hover:border-emerald-500/60 transition-all cursor-pointer group"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-lg">
                <MessageSquare className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <div className="text-xs font-bold text-white">¿Necesitas atención o soporte?</div>
                <div className="text-[11px] text-emerald-400 font-medium">WhatsApp de Atención: +1 (954) 225-9188</div>
              </div>
            </div>
            <span className="text-[10px] font-black uppercase px-2.5 py-1 rounded-lg bg-emerald-500 text-black group-hover:bg-emerald-400 transition-colors">
              Chatear Ahora 📲
            </span>
          </a>
        </div>

        {/* RIGHT COLUMN: AUTHENTICATION FORM */}
        <div className="lg:col-span-5">
          <div className="bg-[#0D1B22] border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl shadow-black/50 relative overflow-hidden">
            {/* Top Glowing Glow */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-1 bg-gradient-to-r from-transparent via-emerald-500 to-transparent" />

            {/* Header */}
            <div className="mb-6">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold mb-2">
                <span>🔐</span> Iniciar Sesión
              </div>
              <h2 className="text-xl font-bold text-white tracking-wide">Acceso al Panel</h2>
              <p className="text-xs text-slate-400 mt-1">
                Ingrese sus credenciales autorizadas para gestionar su operadora.
              </p>
            </div>

            {/* LOGIN FORM */}
            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                  📧 Correo de Suscriptor / Usuario
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="ejemplo@tubanca.com"
                  className="w-full bg-[#071217] border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                  🔑 Contraseña
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="••••••••••••"
                  className="w-full bg-[#071217] border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors font-mono"
                />
              </div>

              {loginError && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-semibold flex items-center gap-2">
                  <Shield className="w-4 h-4 shrink-0" />
                  <span>{loginError}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={loadingLogin}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-black font-extrabold text-sm tracking-wide transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {loadingLogin ? (
                  <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
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
      </div>

      {/* FOOTER */}
      <footer className="text-center text-[11px] text-slate-500 tracking-wider py-4 border-t border-slate-900 mt-6">
        © 2026 Multibanca Express SaaS v3.0 • Todos los derechos reservados • Conexión Segura SSL 256-Bit
      </footer>
    </div>
  );
};
