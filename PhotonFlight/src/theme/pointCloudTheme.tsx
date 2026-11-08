import { createTheme, ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type ThemeMode = 'dark' | 'light';

const THEME_STORAGE_KEY = 'photon-flight-theme-mode';
const ThemeModeContext = createContext<{
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
}>({ mode: 'dark', setMode: () => undefined });

export function usePointCloudTheme() {
  return useContext(ThemeModeContext);
}

export function createPointCloudTheme(mode: ThemeMode) {
  const dark = mode === 'dark';
  return createTheme({
  palette: {
    mode,
    primary: { main: dark ? '#38bdf8' : '#0369a1' },
    secondary: { main: dark ? '#a78bfa' : '#7c3aed' },
    error: { main: dark ? '#f87171' : '#dc2626' },
    background: dark
      ? { default: '#07111f', paper: '#10243a' }
      : { default: '#edf6fb', paper: '#ffffff' },
    text: dark
      ? { primary: '#eaf6ff', secondary: '#9fb7ca' }
      : { primary: '#102a43', secondary: '#526b80' },
  },
  shape: { borderRadius: 10 },
  components: {
    MuiPaper: {
      styleOverrides: { root: { backgroundImage: 'none' } },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          fontWeight: 700,
          textTransform: 'none',
        },
        containedPrimary: {
          color: dark ? '#07111f' : '#ffffff',
          '&:hover': {
            backgroundColor: dark ? '#bae6fd' : '#075985',
          },
        },
        outlinedPrimary: {
          borderColor: dark ? 'rgba(125, 211, 252, 0.55)' : '#0284c7',
          color: dark ? '#7dd3fc' : '#0369a1',
          '&:hover': {
            borderColor: dark ? '#7dd3fc' : '#075985',
            backgroundColor: dark ? 'rgba(125, 211, 252, 0.12)' : 'rgba(2, 132, 199, 0.08)',
          },
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          backgroundColor: dark ? 'rgba(8, 23, 38, 0.78)' : 'rgba(255, 255, 255, 0.92)',
          '& .MuiOutlinedInput-notchedOutline': { borderColor: dark ? 'rgba(125, 211, 252, 0.35)' : 'rgba(2, 105, 161, 0.28)' },
          '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: dark ? 'rgba(125, 211, 252, 0.72)' : '#0284c7' },
        },
      },
    },
    MuiInputLabel: {
      styleOverrides: {
        root: {
          color: dark ? '#9fb7ca' : '#526b80',
          '&.Mui-focused': { color: dark ? '#7dd3fc' : '#0369a1' },
        },
      },
    },
    MuiMenuItem: {
      styleOverrides: {
        root: {
          '&.Mui-selected': { backgroundColor: 'rgba(125, 211, 252, 0.16)' },
          '&.Mui-selected:hover': { backgroundColor: 'rgba(125, 211, 252, 0.24)' },
        },
      },
    },
    MuiFab: {
      styleOverrides: {
        root: {
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.38)',
          backdropFilter: 'blur(12px)',
        },
      },
    },
    MuiSlider: {
      styleOverrides: {
        root: { color: '#7dd3fc' },
        rail: { opacity: 0.35 },
      },
    },
  },
  });
}

export const pointCloudTheme = createPointCloudTheme('dark');

export function PointCloudThemeProvider({ children }: { children: ReactNode }) {
  const storedMode = window.localStorage.getItem(THEME_STORAGE_KEY);
  const [mode, setModeState] = useState<ThemeMode>(storedMode === 'light' ? 'light' : 'dark');
  const theme = useMemo(() => createPointCloudTheme(mode), [mode]);

  const setMode = (nextMode: ThemeMode) => {
    setModeState(nextMode);
    window.localStorage.setItem(THEME_STORAGE_KEY, nextMode);
    window.electronAPI?.setThemeMode?.(nextMode);
  };

  useEffect(() => {
    window.electronAPI?.getThemeMode?.().then((savedMode: ThemeMode) => {
      if (savedMode === 'light' || savedMode === 'dark') setMode(savedMode);
    }).catch(() => undefined);

    return window.electronAPI?.onThemeModeChanged?.((nextMode: ThemeMode) => {
      if (nextMode === 'light' || nextMode === 'dark') setMode(nextMode);
    });
  }, []);

  return (
    <ThemeModeContext.Provider value={{ mode, setMode }}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </ThemeModeContext.Provider>
  );
}
