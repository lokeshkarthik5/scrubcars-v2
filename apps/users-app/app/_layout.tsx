import {
  Inter_300Light,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import {
  SpaceGrotesk_300Light,
  SpaceGrotesk_400Regular,
  SpaceGrotesk_500Medium,
  SpaceGrotesk_600SemiBold,
  SpaceGrotesk_700Bold,
} from '@expo-google-fonts/space-grotesk';
import { ScButton } from '@repo/native-ui/button';
import { T } from '@repo/native-ui/text';
import { createStyles, ThemeProvider, useColors, useTheme } from '@repo/native-ui/theme';
import { ToastHost } from '@repo/native-ui/toast';
import { QueryClientProvider } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { useFonts } from 'expo-font';
import { type Href, router, Stack, useGlobalSearchParams, usePathname, useRootNavigationState } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { OfflineBanner } from '@/components/offline-banner';
import { PaymentRecovery } from '@/components/payment-recovery';
import { ShareHost } from '@/components/share-host';
import { UpdateRequired } from '@/components/update-required';
import { useForcedUpdate } from '@/lib/app-config';
import { installUnauthorizedHandler, isProfileIncomplete, useAuth } from '@/lib/auth';
import { devicePrefs } from '@/lib/device-prefs';
import { useColdStartLink, useNotificationTaps } from '@/lib/notifications';
// Registers for sign-out: this phone's notifications stop with the session.
import '@/lib/push-device';
import { otpFlow } from '@/lib/otp-flow';
import { queryClient } from '@/lib/query-client';
import { gateRedirect } from '@/lib/route-gate';
import { initSentry } from '@/lib/sentry';
import { setAnalyticsPath, startAnalytics, track } from '@/lib/shims/analytics';
import { heldLinkCode } from '@/lib/deep-link';

export { CrashScreen as ErrorBoundary } from '@/components/crash-screen';

initSentry();
void SplashScreen.preventAutoHideAsync();

const useStyles = createStyles((c) => ({
  cover: { backgroundColor: c.canvas },
  unreachable: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 24,
    backgroundColor: c.canvas,
  },
}));

/** A phone with a token and no signal: still signed in. */
function Unreachable() {
  const colors = useColors();
  const styles = useStyles();
  const restore = useAuth((s) => s.restore);
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

const SIGN_IN = new Set(['/login', '/verify-otp']);
const ALWAYS_DARK = new Set(['/welcome', ...SIGN_IN, '/profile-setup']);

/** The route gate: the web's AppProvider. Covers the screen until the session is settled. */
const WELCOME_SEEN = 'detlio.welcomeSeen';
const SCREEN_EVENTS: Record<string, 'home_view' | 'garage_list_view' | 'map_view'> = { '/home': 'home_view', '/garages': 'garage_list_view', '/map': 'map_view' };

function SessionGate() {
  const colors = useColors();
  const styles = useStyles();
  const status = useAuth((s) => s.status);
  const user = useAuth((s) => s.user);
  const pathname = usePathname();
  const params = useGlobalSearchParams();
  const state = { signedIn: user !== null, incomplete: isProfileIncomplete(user) };
  const redirect = status === 'ready' ? gateRedirect(pathname, state) : null;
  const paramsRef = useRef(params);
  paramsRef.current = params;

  // A cold-start link goes first: the router can miss it in Expo Go (lib/notifications.ts).
  const coldLink = useColdStartLink();
  const coldLinkUsed = useRef(false);
  const navigatorReady = Boolean(useRootNavigationState()?.key);
  useNotificationTaps(status === 'ready' && navigatorReady);

  useEffect(() => startAnalytics(), []);
  useEffect(() => {
    setAnalyticsPath(pathname);
    const name = SCREEN_EVENTS[pathname];
    if (name) track(name);
  }, [pathname]);

  useEffect(() => {
    if (status !== 'ready' || coldLink === undefined) return;
    // A printed coupon's link: its code never travels in a route (lib/deep-link.ts).
    const heldKind = heldLinkCode.kind();
    if (heldKind && pathname === '/') {
      router.replace((heldKind === 'c' ? '/coupon' : heldKind === 'gift' ? '/gift' : '/invite') as Href);
      return;
    }
    // A guest's first time on this phone.
    if (pathname === '/' && !user && !coldLink && !devicePrefs.getItem(WELCOME_SEEN)) {
      router.replace('/welcome' as Href);
      return;
    }
    if (coldLink && !coldLinkUsed.current && pathname === '/') {
      coldLinkUsed.current = true;
      router.replace(coldLink as Href);
      return;
    }
    if (!redirect || redirect === pathname) return;
    if (redirect === '/login') {
      // Back here after the code, kept in memory only.
      const query = new URLSearchParams(
        Object.entries(paramsRef.current).flatMap(([key, value]) => (typeof value === 'string' ? [[key, value]] : []))
      ).toString();
      otpFlow.setNext(`${pathname}${query ? `?${query}` : ''}`);
      router.replace('/login' as Href);
      return;
    }
    if (SIGN_IN.has(pathname)) {
      // Signed in: past the sign-in screens, to what it interrupted. A new customer gives
      // their name first, and `next` waits for them.
      const target = redirect === '/home' ? otpFlow.takeDestination() : redirect;
      router.dismissTo(target as Href);
      return;
    }
    router.replace(redirect as Href);
  }, [pathname, redirect, status, coldLink]);

  useEffect(() => {
    if (status !== 'restoring') void SplashScreen.hideAsync();
  }, [status]);

  if (status === 'unreachable') return <Unreachable />;

  return (
    <>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.canvas } }}>
        <Stack.Screen name="(tabs)" />
      </Stack>
      {status === 'ready' ? <PaymentRecovery /> : null}
      <OfflineBanner />
      {status === 'restoring' || (redirect && redirect !== pathname) ? (
        <View style={[StyleSheet.absoluteFill, styles.cover]} />
      ) : null}
    </>
  );
}

function ThemedRoot() {
  const { colors } = useTheme();
  const updateRequired = useForcedUpdate();
  const pathname = usePathname();
  // One status bar, so a screen leaving can't strand the wrong one: sign-in is always dark.
  const onDarkStage = Boolean(updateRequired) || ALWAYS_DARK.has(pathname);

  useEffect(() => {
    if (updateRequired) void SplashScreen.hideAsync();
  }, [updateRequired]);

  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style={onDarkStage ? 'light' : colors.statusBar} />
      {updateRequired ? <UpdateRequired answer={updateRequired} /> : <SessionGate />}
      <ShareHost />
      <ToastHost />
    </QueryClientProvider>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Inter_300Light,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    SpaceGrotesk_300Light,
    SpaceGrotesk_400Regular,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
  });

  useEffect(() => {
    // So a bug report can name the build it came from.
    console.log(`Detlio v${Constants.expoConfig?.version ?? 'unknown'}`);
    const removeHandler = installUnauthorizedHandler();
    void useAuth.getState().restore();
    return removeHandler;
  }, []);

  if (!fontsLoaded) return null;

  return (
    <SafeAreaProvider>
      <ThemeProvider storage={devicePrefs}>
        <ThemedRoot />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
