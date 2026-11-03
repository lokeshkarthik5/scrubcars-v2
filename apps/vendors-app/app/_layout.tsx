import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import {
  SpaceGrotesk_400Regular,
  SpaceGrotesk_500Medium,
  SpaceGrotesk_600SemiBold,
  SpaceGrotesk_700Bold,
} from '@expo-google-fonts/space-grotesk';
import { QueryClientProvider } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { useFonts } from 'expo-font';
import { type Href, router, Stack, useGlobalSearchParams, usePathname, useRootNavigationState } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ScButton } from '@repo/native-ui/button';
import { T } from '@repo/native-ui/text';
import { createStyles, ThemeProvider, useColors, useTheme } from '@repo/native-ui/theme';
import { ToastHost } from '@repo/native-ui/toast';
import { AppLockGate } from '@/components/app-lock-screen';
import { UpdateRequired } from '@/components/update-required';
import { useForcedUpdate } from '@/lib/app-config';
import { installUnauthorizedHandler, useAuth, useIsVendorAdmin } from '@/lib/auth';
import { afterSignIn } from '@/lib/deep-link';
import { clearPrivateCache } from '@/lib/private-cache';
import { queryClient } from '@/lib/query-client';
import { useColdStartLink, useNotificationTaps } from '@/lib/notifications';
import { gateRedirect } from '@/lib/route-gate';
import { initSentry } from '@/lib/sentry';
import { devicePrefs } from '@/lib/device-prefs';

export { ErrorBoundary } from 'expo-router';

initSentry();
void SplashScreen.preventAutoHideAsync();

/** A phone with a token and no signal: still signed in. */
function Unreachable() {
  const restore = useAuth((s) => s.restore);
  const colors = useColors();
  const styles = useStyles();
  return (
    <View style={styles.unreachable}>
      <T accessibilityRole="header" size={18} weight={700} align="center">
        Could not reach Detlio
      </T>
      <T size={14} color={colors.textSecondary} align="center">
        You are still signed in. Check your connection.
      </T>
      <ScButton variant="outline" fullWidth={false} onPress={() => void restore()}>
        Try again
      </ScButton>
    </View>
  );
}

/** The route gate: the web's AppProvider. Renders nothing until the session is settled. */
function SessionGate() {
  const colors = useColors();
  const styles = useStyles();
  const status = useAuth((s) => s.status);
  const signedIn = useAuth((s) => s.user !== null);
  const hasGarage = useAuth((s) => s.vendor !== null);
  const isAdmin = useIsVendorAdmin();
  const pathname = usePathname();
  const params = useGlobalSearchParams();
  // A link opened signed out is kept for after the code, in memory only.
  const pending = useRef<string | null>(null);
  // After a sign-out the screen left behind is not a link to come back to.
  const wasSignedIn = useRef(false);
  if (signedIn) wasSignedIn.current = true;

  const coldLink = useColdStartLink();
  const coldLinkUsed = useRef(false);

  const redirect = status === 'ready' ? gateRedirect(pathname, { signedIn, hasGarage, isAdmin }) : null;

  useEffect(() => {
    if (status !== 'ready' || coldLink === undefined) return;
    if (coldLink && !coldLinkUsed.current && pathname === '/') {
      coldLinkUsed.current = true;
      router.replace(coldLink as Href);
      return;
    }
    if (!redirect || redirect === pathname) return;
    if (redirect === '/login') {
      if (pathname !== '/' && !wasSignedIn.current) {
        const query = new URLSearchParams(
          Object.entries(params).flatMap(([key, value]) => (typeof value === 'string' ? [[key, value]] : []))
        ).toString();
        pending.current = `${pathname}${query ? `?${query}` : ''}`;
      }
      wasSignedIn.current = false;
    }
    if (redirect === '/home' && pending.current) {
      const next = afterSignIn(pending.current, redirect);
      pending.current = null;
      router.replace(next as Href);
      return;
    }
    router.replace(redirect as Href);
  }, [coldLink, params, pathname, redirect, status]);

  useEffect(() => {
    if (status !== 'restoring') void SplashScreen.hideAsync();
  }, [status]);

  const navigatorReady = Boolean(useRootNavigationState()?.key);
  useNotificationTaps(status === 'ready' && navigatorReady);

  if (status === 'unreachable') return <Unreachable />;

  return (
    <>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.canvas } }} />
      {status === 'restoring' || redirect ? <View style={[StyleSheet.absoluteFill, styles.cover]} /> : null}
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    SpaceGrotesk_400Regular,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
  });

  useEffect(() => {
    // So a bug report can name the build it came from.
    console.log(`Detlio v${Constants.expoConfig?.version ?? 'unknown'}`);
    // Nothing private from an earlier run stays on the disk (also cleared on sign-out).
    clearPrivateCache();
    return installUnauthorizedHandler();
  }, []);

  // The refresh token isn't read until the optional lock has opened. Nothing below the gate
  // runs before it: not the session, the alerts' tap handler or the cold-start link (they
  // mount with the session gate), so a notification tapped while locked is handled after.
  const [unlocked, setUnlocked] = useState(false);
  const opened = useCallback(() => {
    setUnlocked(true);
    void useAuth.getState().restore();
  }, []);

  if (!fontsLoaded) return null;

  return (
    <SafeAreaProvider>
      <ThemeProvider storage={devicePrefs}>
        {unlocked ? <ThemedRoot /> : <AppLockGate onOpen={opened} />}
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

/** Sign-in and the code screen are dark whatever is chosen (the owner's Option 1). */
const ALWAYS_DARK = new Set(['/', '/login', '/verify-otp']);

function ThemedRoot() {
  const { colors } = useTheme();
  const updateRequired = useForcedUpdate();
  const pathname = usePathname();
  // One status bar, so a screen leaving can't strand the wrong one.
  const onDarkStage = Boolean(updateRequired) || ALWAYS_DARK.has(pathname);

  useEffect(() => {
    if (updateRequired) void SplashScreen.hideAsync();
  }, [updateRequired]);

  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style={onDarkStage ? 'light' : colors.statusBar} />
      {updateRequired ? <UpdateRequired answer={updateRequired} /> : <SessionGate />}
      <ToastHost />
    </QueryClientProvider>
  );
}

const useStyles = createStyles((colors) => ({
  cover: { backgroundColor: colors.canvas },
  unreachable: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 24,
    backgroundColor: colors.canvas,
  },
}));
