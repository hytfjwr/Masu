import { useCallback, useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import type { ThemeMode } from '../types/theme';
import { STORAGE_KEYS } from '../utils/storageKeys';

const STORAGE_KEY = STORAGE_KEYS.theme;

function applyTheme(mode: ThemeMode): void {
  const isDark =
    mode === 'dark' ||
    (mode === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', isDark);
}

export function getStoredTheme(): ThemeMode {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark' || stored === 'auto') {
    return stored;
  }
  return 'auto';
}

export function resolveTheme(mode: ThemeMode, prefersDark: boolean): 'light' | 'dark' {
  if (mode === 'auto') return prefersDark ? 'dark' : 'light';
  return mode;
}

/** Screen point (px) the theme change reveal expands from, e.g. the center of the toggle control. */
export interface ThemeRevealOrigin {
  x: number;
  y: number;
}

const REVEAL_DURATION_MS = 550;

function isDarkApplied(): boolean {
  return document.documentElement.classList.contains('dark');
}

/**
 * Run `update` (which flips the theme class) inside a View Transition and reveal the new theme as a
 * circle growing from `origin`. Falls back to an instant switch when unsupported / reduced motion /
 * the light-dark appearance doesn't actually change.
 */
function withThemeReveal(
  update: () => void,
  willBeDark: boolean,
  origin: ThemeRevealOrigin | undefined,
): void {
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  if (!origin || !document.startViewTransition || reducedMotion || willBeDark === isDarkApplied()) {
    update();
    return;
  }
  const root = document.documentElement;
  // Suppress color transitions so the incoming snapshot is the final theme, not a mid-fade frame
  root.classList.add('theme-reveal');
  const transition = document.startViewTransition(update);
  const radius = Math.hypot(
    Math.max(origin.x, window.innerWidth - origin.x),
    Math.max(origin.y, window.innerHeight - origin.y),
  );
  transition.ready
    .then(() => {
      root.animate(
        {
          clipPath: [
            `circle(0px at ${origin.x}px ${origin.y}px)`,
            `circle(${radius}px at ${origin.x}px ${origin.y}px)`,
          ],
        },
        {
          duration: REVEAL_DURATION_MS,
          easing: 'cubic-bezier(0.65, 0, 0.35, 1)',
          pseudoElement: '::view-transition-new(root)',
        },
      );
    })
    .catch(() => {
      /* transition skipped — the theme was still applied by update() */
    });
  transition.finished.finally(() => root.classList.remove('theme-reveal'));
}

export interface UseThemeReturn {
  theme: ThemeMode;
  setTheme: (mode: ThemeMode, origin?: ThemeRevealOrigin) => void;
}

export function useTheme(): UseThemeReturn {
  const [theme, setThemeState] = useState<ThemeMode>(() => getStoredTheme());

  // useEffect required: syncs theme CSS class on document.documentElement
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // useEffect required: subscribes to OS color scheme change events (matchMedia)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      if (theme === 'auto') {
        applyTheme('auto');
      }
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [theme]);

  const setTheme = useCallback((mode: ThemeMode, origin?: ThemeRevealOrigin) => {
    localStorage.setItem(STORAGE_KEY, mode);
    const willBeDark =
      resolveTheme(mode, window.matchMedia('(prefers-color-scheme: dark)').matches) === 'dark';
    withThemeReveal(
      () => {
        // flushSync so the new-state snapshot also shows the updated toggle
        flushSync(() => setThemeState(mode));
        applyTheme(mode);
      },
      willBeDark,
      origin,
    );
  }, []);

  return { theme, setTheme };
}
