import type { DisplayScale, ThemeMode } from '../models/ui';

const TOKEN_KEY = 'factmap_access_token';
const THEME_KEY = 'factmap_theme';
const SCALE_KEY = 'factmap_display_scale';

export const tokenStorage = {
  getToken(): string | null {
    try {
      return window.localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },

  setToken(token: string): void {
    try {
      window.localStorage.setItem(TOKEN_KEY, token);
    } catch {
      // Ignore storage quota / privacy-mode failures
    }
  },

  clearToken(): void {
    try {
      window.localStorage.removeItem(TOKEN_KEY);
    } catch {
      // Ignore storage failures
    }
  },

  getTheme(): ThemeMode {
    try {
      const stored = window.localStorage.getItem(THEME_KEY);
      if (stored === 'light' || stored === 'dark') {
        return stored;
      }
      if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
        return 'dark';
      }
    } catch {
      // Fallback to light
    }
    return 'light';
  },

  setTheme(theme: ThemeMode): void {
    try {
      window.localStorage.setItem(THEME_KEY, theme);
    } catch {
      // Ignore storage failures
    }
  },

  getScale(): DisplayScale {
    try {
      const stored = window.localStorage.getItem(SCALE_KEY);
      if (stored === '0.9' || stored === '1' || stored === '1.12' || stored === '1.25') {
        return stored;
      }
    } catch {
      // Fallback to 1
    }
    return '1';
  },

  setScale(scale: DisplayScale): void {
    try {
      window.localStorage.setItem(SCALE_KEY, scale);
    } catch {
      // Ignore storage failures
    }
  },
};
