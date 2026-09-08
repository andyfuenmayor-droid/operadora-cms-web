import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { Shield, Sparkles, Send, CheckCircle2, MessageSquare } from 'lucide-react';
import confetti from 'canvas-confetti';

export const Login: React.FC = () => {
  const { login } = useAuth();
  const [activeTab, setActiveTab] = useState<'login' | 'register'>('login');

  // Login form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loadingLogin, setLoadingLogin] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // Lead registration form state
  const [banca, setBanca] = useState('');
  const [representante, setRepresentante] = useState('');
  const [pais, setPais] = useState('');
  const [leadEmail, setLeadEmail] = useState('');
  const [telefono, setTelefono] = useState('');
  const [puntosVenta, setPuntosVenta] = useState(5);
  const [direccion, setDireccion] = useState('');
  const [loadingLead, setLoadingLead] = useState(false);
  const [leadSuccess, setLeadSuccess] = useState(false);
  const [leadError, setLeadError] = useState<string | null>(null);

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

  const handleLeadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!banca.trim() || !representante.trim() || !leadEmail.trim() || !telefono.trim()) {
      setLeadError('Por favor rellene los campos obligatorios (*).');
      return;
    }

    setLoadingLead(true);
    setLeadError(null);

    try {
      const payload = {
        banca: banca.trim(),
        representante: representante.trim(),
        estado: pais.trim(),
        email: leadEmail.trim(),
        telefono: telefono.trim(),
        puntos_venta: puntosVenta,
        direccion: direccion.trim(),
        fecha: new Date().toISOString(),
      };

      const { error } = await supabase.from('suscriptores_leads').insert(payload);
      if (error) throw error;

      confetti({ particleCount: 50, spread: 70, origin: { y: 0.6 } });
      setLeadSuccess(true);
    } catch (err: any) {
      setLeadError(err?.message || 'Error al enviar solicitud de afiliación.');
    } finally {
      setLoadingLead(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#071217] flex flex-col justify-between p-4 sm:p-6 lg:p-10 text-slate-100">
      <div className="max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center my-auto">
        
        {/* LEFT COLUMN: BRANDING & FEATURES */}
        <div className="lg:col-span-7 space-y-6">
          {/* Brand Logo & Name */}
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-600 via-teal-500 to-sky-400 p-0.5 shadow-lg shadow-emerald-500/20">
              <div className="w-full h-full bg-[#0D1B22] rounded-[14px] flex items-center justify-center">
                <svg viewBox="10 8 75 64" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-9 h-9">
                  <defs>
                    <linearGradient id="meMGrad" x1="0%" y1="15%" x2="100%" y2="85%">
                      <stop offset="0%" stopColor="#00C8FF" />
                      <stop offset="35%" stopColor="#00E5D4" />
                      <stop offset="70%" stopColor="#00F59B" />
                      <stop offset="100%" stopColor="#00E676" />
                    </linearGradient>
                  </defs>
                  <path
                    d="M 18 64 L 18 26 C 18 16 28 10 37 18 L 47.5 30 L 58 18 C 67 10 77 16 77 26 L 77 64"
                    stroke="url(#meMGrad)"
                    strokeWidth="12"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                  />
                </svg>
              </div>
            </div>
            <div>
              <div className="text-2xl font-black tracking-tight text-white flex items-center gap-1.5">
                <span>Multibanca</span>
                <span className="text-emerald-400">Express</span>
              </div>
              <span className="text-[10px] tracking-widest font-black uppercase text-slate-400">
                Control Maestro • SaaS Operadoras v3.0
              </span>
            </div>
          </div>

          <div>
            <h1 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight leading-tight">
              La Plataforma SaaS <span className="bg-gradient-to-r from-emerald-400 via-teal-300 to-sky-400 bg-clip-text text-transparent">#1 para Operadoras</span> y Bancas de Apuestas
            </h1>
            <p className="text-sm text-slate-400 mt-2 max-w-xl">
              Gestión centralizada de agencias, liquidación multimoneda en tiempo real, auditoría de cobradores y arqueos bancarios automatizados.
            </p>
          </div>

          {/* Feature Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-2">
            <div className="bg-[#0D1B22]/80 border border-slate-800/80 rounded-2xl p-3.5 hover:border-emerald-500/40 transition-colors shadow-sm">
              <div className="flex items-center justify-between text-xs font-bold text-white mb-1">
                <span className="flex items-center gap-1.5">
                  <span>🎯</span> Mercado Total 360°
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-extrabold">LIVE</span>
              </div>
              <p className="text-xs text-slate-400">
                Parley, loterías, hipismo y animalitos consolidados por sistema.
              </p>
            </div>

            <div className="bg-[#0D1B22]/80 border border-slate-800/80 rounded-2xl p-3.5 hover:border-emerald-500/40 transition-colors shadow-sm">
              <div className="flex items-center justify-between text-xs font-bold text-white mb-1">
                <span className="flex items-center gap-1.5">
                  <span>💰</span> Multimoneda Auto
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-400 font-extrabold">BS / USD / COP</span>
              </div>
              <p className="text-xs text-slate-400">
                Manejo simultáneo de divisas con balances y arqueos independientes.
              </p>
            </div>

            <div className="bg-[#0D1B22]/80 border border-slate-800/80 rounded-2xl p-3.5 hover:border-emerald-500/40 transition-colors shadow-sm">
              <div className="flex items-center justify-between text-xs font-bold text-white mb-1">
                <span className="flex items-center gap-1.5">
                  <span>🛡️</span> Seguridad Blindada
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-400 font-extrabold">AES-256</span>
              </div>
              <p className="text-xs text-slate-400">
                Cierres de caja encriptados, auditoría de cobros y trazabilidad total.
              </p>
            </div>

            <div className="bg-[#0D1B22]/80 border border-slate-800/80 rounded-2xl p-3.5 hover:border-emerald-500/40 transition-colors shadow-sm">
              <div className="flex items-center justify-between text-xs font-bold text-white mb-1">
                <span className="flex items-center gap-1.5">
                  <span>⚡</span> Pizarra de Pagos
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 font-extrabold">1-CLICK</span>
              </div>
              <p className="text-xs text-slate-400">
                Aprobación instantánea de transferencias bancarias y punto de venta.
              </p>
            </div>
          </div>

          {/* Metrics bar */}
          <div className="bg-[#0D1B22]/40 border border-slate-800 rounded-2xl p-3 flex flex-wrap items-center justify-around gap-4 text-center">
            <div>
              <div className="text-sm font-extrabold text-emerald-400">BS • USD • COP</div>
              <div className="text-[10px] text-slate-400 font-medium">Multidivisa Nativa</div>
            </div>
            <div className="w-px h-6 bg-slate-800 hidden sm:block" />
            <div>
              <div className="text-sm font-extrabold text-white">99.9%</div>
              <div className="text-[10px] text-slate-400 font-medium">Disponibilidad Cloud</div>
            </div>
            <div className="w-px h-6 bg-slate-800 hidden sm:block" />
            <div>
              <div className="text-sm font-extrabold text-sky-400">24/7</div>
              <div className="text-[10px] text-slate-400 font-medium">Soporte Dedicado</div>
            </div>
          </div>

          {/* WhatsApp Affiliate Banner */}
          <a
            href="https://wa.me/19542259188?text=Hola%2C%20quiero%20informaci%C3%B3n%20sobre%20el%20SaaS%20de%20Multibanca%20Express"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between p-3.5 rounded-2xl bg-gradient-to-r from-emerald-950/40 to-teal-950/40 border border-emerald-500/30 hover:border-emerald-500/60 transition-all cursor-pointer group"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-lg">
                <MessageSquare className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <div className="text-xs font-bold text-white">¿Deseas afiliar tu Banca u Operadora?</div>
                <div className="text-[11px] text-emerald-400 font-medium">WhatsApp Comercial: +1 (954) 225-9188</div>
              </div>
            </div>
            <span className="text-[10px] font-black uppercase px-2.5 py-1 rounded-lg bg-emerald-500 text-black group-hover:bg-emerald-400 transition-colors">
              Chatear Ahora 📲
            </span>
          </a>
        </div>

        {/* RIGHT COLUMN: AUTHENTICATION FORMS */}
        <div className="lg:col-span-5">
          <div className="bg-[#0D1B22] border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl shadow-black/50 relative overflow-hidden">
            {/* Top Glowing Glow */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-1 bg-gradient-to-r from-transparent via-emerald-500 to-transparent" />

            {/* Tabs Selector */}
            <div className="grid grid-cols-2 p-1 bg-[#071217] rounded-xl border border-slate-800 mb-6">
              <button
                onClick={() => { setActiveTab('login'); setLeadSuccess(false); }}
                className={`py-2 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-2 ${
                  activeTab === 'login'
                    ? 'bg-emerald-500 text-black shadow-md font-extrabold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <span>🔐</span> Iniciar Sesión
              </button>
              <button
                onClick={() => { setActiveTab('register'); setLeadSuccess(false); }}
                className={`py-2 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-2 ${
                  activeTab === 'register'
                    ? 'bg-emerald-500 text-black shadow-md font-extrabold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <span>📝</span> Solicitar Afiliación
              </button>
            </div>

            {/* TAB 1: LOGIN FORM */}
            {activeTab === 'login' && (
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
            )}

            {/* TAB 2: AFFILIATION FORM */}
            {activeTab === 'register' && (
              <div>
                {leadSuccess ? (
                  <div className="text-center py-6 space-y-4 animate-fadeIn">
                    <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center mx-auto">
                      <CheckCircle2 className="w-8 h-8" />
                    </div>
                    <div>
                      <h3 className="text-base font-extrabold text-white">¡EXPEDIENTE RECIBIDO CON ÉXITO!</h3>
                      <p className="text-xs text-slate-400 mt-1">
                        Hemos recibido los datos de su banca. Nuestro equipo comercial se comunicará vía WhatsApp/Email para activar sus credenciales y puntos de venta.
                      </p>
                    </div>
                    <button
                      onClick={() => { setLeadSuccess(false); setActiveTab('login'); }}
                      className="px-5 py-2 rounded-xl bg-emerald-500 text-black font-bold text-xs hover:bg-emerald-400 cursor-pointer"
                    >
                      ⬅️ Volver al Inicio de Sesión
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleLeadSubmit} className="space-y-3">
                    <p className="text-[11px] text-slate-400">
                      Complete el formulario para que un ejecutivo comercial active su expediente de suscriptor.
                    </p>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">
                        Nombre de la Compañía / Banca *
                      </label>
                      <input
                        type="text"
                        value={banca}
                        onChange={(e) => setBanca(e.target.value)}
                        required
                        placeholder="Ej: Inversiones La Fortuna"
                        className="w-full bg-[#071217] border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">
                        Representante Legal *
                      </label>
                      <input
                        type="text"
                        value={representante}
                        onChange={(e) => setRepresentante(e.target.value)}
                        required
                        placeholder="Nombre y Apellido"
                        className="w-full bg-[#071217] border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">
                          Estado / País *
                        </label>
                        <input
                          type="text"
                          value={pais}
                          onChange={(e) => setPais(e.target.value)}
                          required
                          placeholder="Ej: Táchira, Venezuela"
                          className="w-full bg-[#071217] border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">
                          WhatsApp *
                        </label>
                        <input
                          type="text"
                          value={telefono}
                          onChange={(e) => setTelefono(e.target.value)}
                          required
                          placeholder="+58 412 0000000"
                          className="w-full bg-[#071217] border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">
                          Correo Electrónico *
                        </label>
                        <input
                          type="email"
                          value={leadEmail}
                          onChange={(e) => setLeadEmail(e.target.value)}
                          required
                          placeholder="contacto@banca.com"
                          className="w-full bg-[#071217] border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">
                          Puntos de Venta
                        </label>
                        <input
                          type="number"
                          min={1}
                          value={puntosVenta}
                          onChange={(e) => setPuntosVenta(Number(e.target.value))}
                          className="w-full bg-[#071217] border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">
                        Dirección Física
                      </label>
                      <input
                        type="text"
                        value={direccion}
                        onChange={(e) => setDireccion(e.target.value)}
                        placeholder="Ciudad, Sector, Dirección"
                        className="w-full bg-[#071217] border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                      />
                    </div>

                    {leadError && (
                      <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-semibold">
                        {leadError}
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={loadingLead}
                      className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-black font-extrabold text-xs tracking-wide transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 mt-2"
                    >
                      {loadingLead ? (
                        <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <>
                          <span>ENVIAR SOLICITUD DE AFILIACIÓN</span>
                          <Send className="w-3.5 h-3.5" />
                        </>
                      )}
                    </button>
                  </form>
                )}
              </div>
            )}
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
