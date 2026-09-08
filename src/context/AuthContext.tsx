import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import type { UserSession, UserProfile, SubUserAccess, SystemCycle, ModuleId, PlanType } from '../types';
import { normalizarNombrePlan, PLANES_MODULOS_DEFAULT, getTodayDateString } from '../utils/formatters';

const getDefaultCycle = (): SystemCycle => {
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0 Sunday, 1 Monday
  const diffToMonday = (dayOfWeek === 0 ? -6 : 1) - dayOfWeek;
  const monday = new Date(today);
  monday.setDate(today.getDate() + diffToMonday);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return {
    desde: monday.toISOString().slice(0, 10),
    hasta: sunday.toISOString().slice(0, 10),
    tipo: 'SEMANAL',
    semana: '01',
  };
};

interface AuthContextType {
  user: UserSession | null;
  profile: UserProfile | null;
  systemCycle: SystemCycle;
  allowedModules: ModuleId[];
  effectiveUserId: string;
  isAuthenticated: boolean;
  isLoading: boolean;
  subscriptionError: string | null;
  login: (email: string, pass: string) => Promise<{ success: boolean; message?: string }>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
  refreshSystemCycle: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserSession | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [systemCycle, setSystemCycle] = useState<SystemCycle>(getDefaultCycle());
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [subscriptionError, setSubscriptionError] = useState<string | null>(null);

  const effectiveUserId = useMemo(() => {
    return user?.effectiveId || '';
  }, [user?.effectiveId]);

  // Compute allowed modules according to plan and sub-user accesos
  const allowedModules = useMemo<ModuleId[]>(() => {
    if (!user) return ['Inicio'];
    const plan = user.plan || 'elite';
    const defaultMods = PLANES_MODULOS_DEFAULT[plan] || PLANES_MODULOS_DEFAULT.elite;

    if (user.isSubUser && user.subUserAccess?.accesos) {
      const subAccesos = user.subUserAccess.accesos as ModuleId[];
      const merged = ['Inicio' as ModuleId, ...subAccesos.filter((m) => defaultMods.includes(m))];
      return Array.from(new Set(merged));
    }

    const adminMods = [...defaultMods];
    if (!adminMods.includes('Usuarios')) {
      adminMods.push('Usuarios');
    }
    return Array.from(new Set(adminMods));
  }, [user]);

  // Fetch current working cycle from config_sistema
  const fetchSystemCycle = useCallback(async (targetUid: string) => {
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0 Sunday, 1 Monday
    const diffToMonday = (dayOfWeek === 0 ? -6 : 1) - dayOfWeek;
    const monday = new Date(today);
    monday.setDate(today.getDate() + diffToMonday);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    const defaultCycle: SystemCycle = {
      desde: monday.toISOString().slice(0, 10),
      hasta: sunday.toISOString().slice(0, 10),
      tipo: 'SEMANAL',
      semana: '01',
    };

    if (!targetUid) {
      setSystemCycle(defaultCycle);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('config_sistema')
        .select('parametro, valor')
        .eq('user_id', targetUid);

      if (!error && data && data.length > 0) {
        const map: Record<string, string> = {};
        data.forEach((r: any) => {
          if (r.parametro) {
            map[String(r.parametro).trim().toLowerCase()] = String(r.valor || '').trim();
          }
        });

        setSystemCycle({
          desde: map['fecha_desde'] || defaultCycle.desde,
          hasta: map['fecha_hasta'] || defaultCycle.hasta,
          tipo: (map['tipo_cierre']?.toUpperCase() === 'DIARIO' ? 'DIARIO' : 'SEMANAL') as 'SEMANAL' | 'DIARIO',
          semana: map['semana_no'] || defaultCycle.semana,
        });
        return;
      }
    } catch (e) {
      console.warn('Error fetching system cycle:', e);
    }
    setSystemCycle(defaultCycle);
  }, []);

  // Validate SaaS subscription (expiration, status)
  const validateSubscription = useCallback((prof: UserProfile | null): string | null => {
    if (!prof) return null;
    const status = String(prof.status || 'activo').toLowerCase();
    if (status === 'suspendido') {
      return '🚫 CUENTA SUSPENDIDA. Contacte al Administrador Comercial de Multibanca Express.';
    }

    if (prof.fecha_vencimiento) {
      const vencStr = String(prof.fecha_vencimiento).trim().slice(0, 10);
      const todayStr = getTodayDateString();
      if (todayStr > vencStr) {
        return `⏰ SU SUSCRIPCIÓN VENCIÓ EL ${vencStr}. Por favor, renueve su licencia comercial.`;
      }
    }
    return null;
  }, []);

  // Sign In implementation
  const login = async (emailInput: string, passInput: string): Promise<{ success: boolean; message?: string }> => {
    const emailClean = emailInput.trim().toLowerCase();
    const passClean = passInput.trim();

    if (!emailClean || !passClean) {
      return { success: false, message: 'Por favor ingrese correo y contraseña.' };
    }

    try {
      const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
        email: emailClean,
        password: passClean,
      });

      if (authErr || !authData?.user) {
        return { success: false, message: authErr?.message || 'Credenciales incorrectas. Verifique correo y contraseña.' };
      }

      const authUser = authData.user;
      const realUid = authUser.id;

      // 1. Check if user is a sub-user in usuarios_accesos
      let subAccess: SubUserAccess | null = null;
      try {
        const { data: accData } = await supabase
          .from('usuarios_accesos')
          .select('*')
          .eq('id', realUid)
          .maybeSingle();

        if (accData) {
          subAccess = accData as SubUserAccess;
        }
      } catch (e) {
        console.warn('usuarios_accesos lookup error:', e);
      }

      const effectiveId = subAccess?.parent_id ? String(subAccess.parent_id).trim() : realUid;
      const isSubUser = !!subAccess?.parent_id;

      // 2. Fetch Profile from perfiles table
      let loadedProfile: UserProfile | null = null;
      try {
        const { data: profData } = await supabase
          .from('perfiles')
          .select('*')
          .eq('id', effectiveId)
          .maybeSingle();

        if (profData) {
          loadedProfile = profData as UserProfile;
        } else {
          // Fallback by email
          const { data: profByEmail } = await supabase
            .from('perfiles')
            .select('*')
            .eq('email', emailClean)
            .maybeSingle();
          if (profByEmail) loadedProfile = profByEmail as UserProfile;
        }
      } catch (e) {
        console.warn('perfiles lookup error:', e);
      }

      // Check subscription
      const subError = validateSubscription(loadedProfile);
      setSubscriptionError(subError);

      const plan: PlanType = normalizarNombrePlan(loadedProfile?.plan);

      const sessionObj: UserSession = {
        id: realUid,
        effectiveId,
        email: emailClean,
        isSubUser,
        role: subAccess?.rol || loadedProfile?.rol || loadedProfile?.role || 'admin',
        plan,
        profile: loadedProfile,
        subUserAccess: subAccess,
      };

      setUser(sessionObj);
      setProfile(loadedProfile);
      localStorage.setItem('me_cms_user', JSON.stringify(sessionObj));
      localStorage.setItem('me_cms_profile', JSON.stringify(loadedProfile));

      await fetchSystemCycle(effectiveId);
      return { success: true };
    } catch (err: any) {
      console.error('Login error:', err);
      return { success: false, message: err?.message || 'Error de conexión con el servidor.' };
    }
  };

  const logout = async () => {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.warn('Error signing out:', e);
    }
    setUser(null);
    setProfile(null);
    setSystemCycle(getDefaultCycle());
    setSubscriptionError(null);
    localStorage.removeItem('me_cms_user');
    localStorage.removeItem('me_cms_profile');
  };

  const refreshSession = async () => {
    if (!user?.effectiveId) return;
    try {
      const { data: profData } = await supabase
        .from('perfiles')
        .select('*')
        .eq('id', user.effectiveId)
        .maybeSingle();

      if (profData) {
        setProfile(profData as UserProfile);
        setSubscriptionError(validateSubscription(profData as UserProfile));
        localStorage.setItem('me_cms_profile', JSON.stringify(profData));
      }
      await fetchSystemCycle(user.effectiveId);
    } catch (e) {
      console.warn('Error refreshing session:', e);
    }
  };

  const refreshSystemCycle = async () => {
    if (effectiveUserId) {
      await fetchSystemCycle(effectiveUserId);
    }
  };

  // Restore session from localStorage on mount
  useEffect(() => {
    try {
      const storedUser = localStorage.getItem('me_cms_user');
      const storedProfile = localStorage.getItem('me_cms_profile');

      if (storedUser) {
        const u = JSON.parse(storedUser) as UserSession;
        setUser(u);
        if (storedProfile) {
          const p = JSON.parse(storedProfile) as UserProfile;
          setProfile(p);
          setSubscriptionError(validateSubscription(p));
        }
        fetchSystemCycle(u.effectiveId);
      }
    } catch (err) {
      console.error('Failed to restore session:', err);
    } finally {
      setIsLoading(false);
    }
  }, [fetchSystemCycle, validateSubscription]);

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        systemCycle,
        allowedModules,
        effectiveUserId,
        isAuthenticated: !!user,
        isLoading,
        subscriptionError,
        login,
        logout,
        refreshSession,
        refreshSystemCycle,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
