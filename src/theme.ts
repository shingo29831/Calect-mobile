// src/theme.ts
import { useColorScheme } from 'react-native';

export type ThemeMode = 'light' | 'dark' | 'system';
export type Theme = {
  mode: 'light' | 'dark';
  // surfaces
  appBg: string;
  surface: string;
  border: string;
  // text
  textPrimary: string;
  textSecondary: string;
  // accents
  accent: string;
  accentText: string;
  // lines
  lineColor: string;
  lineColorSelected: string;
  // calendar day colors
  dayDisabled: string;
  dayWeekday: string;
  daySun: string;
  daySat: string;
  // event defaults
  eventDefaultFg: string;
  eventDefaultBg: string; // rgba などOK
};

const LIGHT: Theme = {
  mode: 'light',
  appBg: '#ffffff',
  surface: '#ffffff',
  border: '#e5e7eb',
  textPrimary: '#111827',
  textSecondary: '#475569',
  accent: '#2563eb',
  accentText: '#ffffff',
  lineColor: '#e6e9ef',
  lineColorSelected: '#94a3b8',
  dayDisabled: '#9ca3af',
  dayWeekday: '#0f172a',
  daySun: '#ef4444',
  daySat: '#3b82f6',
  eventDefaultFg: '#2563eb',
  eventDefaultBg: 'rgba(37, 99, 235, 0.12)',
};

const DARK: Theme = {
  mode: 'dark',
  appBg: '#0b1220',
  surface: '#111827',
  border: '#334155',
  textPrimary: '#e2e8f0',
  textSecondary: '#94a3b8',
  accent: '#60a5fa',
  accentText: '#0b1220',
  lineColor: '#223045',
  lineColorSelected: '#64748b',
  dayDisabled: '#94a3b8',
  dayWeekday: '#e2e8f0',
  daySun: '#ef4444',
  daySat: '#60a5fa',
  eventDefaultFg: '#60a5fa',
  eventDefaultBg: 'rgba(96,165,250,0.12)',
};

/** RNの ColorSchemeName が環境によって undefined を含むためガード */
function normalizeScheme(
  s: 'light' | 'dark' | null | undefined
): 'light' | 'dark' | null {
  if (s === 'light' || s === 'dark') return s;
  return null;
}

export function getTheme(
  mode: ThemeMode,
  systemScheme: 'light' | 'dark' | null
): Theme {
  const resolved = mode === 'system' ? (systemScheme ?? 'light') : mode;
  return resolved === 'dark' ? DARK : LIGHT;
}

export function useAppTheme(preferred?: ThemeMode): Theme {
  // useColorScheme(): ColorSchemeName => 'light' | 'dark' | null（環境により undefined 型が混入することがある）
  const sysRaw = useColorScheme();
  const sys = normalizeScheme(sysRaw as 'light' | 'dark' | null | undefined);
  return getTheme(preferred ?? 'system', sys);
}
