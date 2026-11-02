import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { StyleSheet, useColorScheme, type ImageStyle, type TextStyle, type ViewStyle } from 'react-native';

import {
  DEFAULT_APPEARANCE,
  parseAppearance,
  resolveScheme,
  tokensFor,
  type Appearance,
  type Scheme,
  type Tokens,
} from './tokens';

interface ThemeValue {
  scheme: Scheme;
  colors: Tokens;
  appearance: Appearance;
  setAppearance: (next: Appearance) => void;
}

const ThemeContext = createContext<ThemeValue>({
  scheme: 'dark',
  colors: tokensFor('dark'),
  appearance: DEFAULT_APPEARANCE,
  setAppearance: () => undefined,
});

/** Where the choice is kept: handed in, so this package needs no storage module. */
export interface AppearanceStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

const STORAGE_KEY = 'detlio.appearance';

/**
 * System / Light / Dark, remembered on this phone. Read synchronously for the first
 * render, so the app never flashes the other theme. A change restyles every screen at
 * once: screens read their colours through useColors and useStyles, never at import.
 */
export function ThemeProvider({ storage, children }: { storage: AppearanceStorage; children: ReactNode }) {
  const phone = useColorScheme();
  const [appearance, setChoice] = useState<Appearance>(() => parseAppearance(storage.getItem(STORAGE_KEY)));
  const setAppearance = useCallback(
    (next: Appearance) => {
      setChoice(next);
      storage.setItem(STORAGE_KEY, next);
    },
    [storage]
  );
  const scheme = resolveScheme(appearance, phone);
  const value = useMemo(
    () => ({ scheme, colors: tokensFor(scheme), appearance, setAppearance }),
    [scheme, appearance, setAppearance]
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** A part of the app that keeps one theme whatever is chosen: sign-in is always dark. */
export function ThemeScope({ scheme, children }: { scheme: Scheme; children: ReactNode }) {
  const outer = useContext(ThemeContext);
  const value = useMemo(() => ({ ...outer, scheme, colors: tokensFor(scheme) }), [outer, scheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
export const useColors = () => useContext(ThemeContext).colors;

/**
 * StyleSheet.create with the theme's colours: a screen's styles, one sheet per theme,
 * made once. `const useStyles = createStyles((c) => ({ page: { backgroundColor: c.canvas } }))`.
 */
export function createStyles<T extends Record<string, ViewStyle | TextStyle | ImageStyle>>(make: (colors: Tokens) => T) {
  const made: Partial<Record<Scheme, T>> = {};
  return function useStyles(): T {
    const { scheme, colors } = useContext(ThemeContext);
    return (made[scheme] ??= StyleSheet.create(make(colors) as never) as unknown as T);
  };
}
