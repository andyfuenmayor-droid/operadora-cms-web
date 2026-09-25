import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export type AppTheme = 'dark' | 'light';

interface ThemeContextType {
  theme: AppTheme;
  isLight: boolean;
  toggleTheme: () => void;
  setTheme: (newTheme: AppTheme) => void;
}

const THEME_STORAGE_KEY = 'app_theme_mode';

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<AppTheme>(() => {
    try {
      const stored = localStorage.getItem(THEME_STORAGE_KEY);
      if (stored === 'light' || stored === 'dark') {
        return stored;
      }
    } catch (e) {
      console.warn('Error reading theme from localStorage:', e);
    }
    return 'dark'; // Modo oscuro original por defecto
  });

  // Aplica la clase .light en el elemento <html>
  const applyThemeToDOM = useCallback((currentTheme: AppTheme) => {
    const root = document.documentElement;
    if (currentTheme === 'light') {
      root.classList.add('light');
    } else {
      root.classList.remove('light');
    }
  }, []);

  // Efecto inicial y cambio de tema
  useEffect(() => {
    applyThemeToDOM(theme);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch (e) {
      console.warn('Error saving theme to localStorage:', e);
    }
  }, [theme, applyThemeToDOM]);

  // Consultar configuración remota guardada en config_sistema si existe
  useEffect(() => {
    const fetchConfigTheme = async () => {
      try {
        const { data: config } = await supabase
          .from('config_sistema')
          .select('valor')
          .eq('parametro', 'tema')
          .maybeSingle();

        if (config?.valor) {
          const val = String(config.valor).toLowerCase().trim();
          if (val === 'claro' || val === 'light') {
            setThemeState('light');
          } else if (val === 'oscuro' || val === 'dark') {
            setThemeState('dark');
          }
        }
      } catch (err) {
        // Fallback silencioso si no hay sesión o tabla
      }
    };
    fetchConfigTheme();
  }, []);

  const setTheme = useCallback(async (newTheme: AppTheme) => {
    setThemeState(newTheme);
    applyThemeToDOM(newTheme);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, newTheme);
      // Actualizar en config_sistema en segundo plano si está autenticado
      const dbVal = newTheme === 'light' ? 'Claro' : 'Oscuro';
      await supabase
        .from('config_sistema')
        .upsert(
          { parametro: 'tema', valor: dbVal },
          { onConflict: 'user_id,parametro' }
        );
    } catch (e) {
      // Ignorar error si no hay sesión de admin
    }
  }, [applyThemeToDOM]);

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [theme, setTheme]);

  const value = {
    theme,
    isLight: theme === 'light',
    toggleTheme,
    setTheme,
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
