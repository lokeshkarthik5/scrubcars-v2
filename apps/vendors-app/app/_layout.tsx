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
import { type Href, router, Stack, useGlobalSearchParams, usePathname } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ScButton } from '@/components/button';
import { T } from '@/components/text';
import { ToastHost } from '@/components/toast';
import { installUnauthorizedHandler, useAuth, useIsVendorAdmin } from '@/lib/auth';
import { afterSignIn } from '@/lib/deep-link';
import { queryClient } from '@/lib/query-client';
import { gateRedirect } from '@/lib/route-gate';
import { colors } from '@/lib/theme';

export { ErrorBoundary } from 'expo-router';

void SplashScreen.preventAutoHideAsync();

/** A phone with a token and no signal: still signed in. */
function Unreachable() {
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

/** The route gate: the web's AppProvider. Renders nothing until the session is settled. */
function SessionGate() {
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

  const redirect = status === 'ready' ? gateRedirect(pathname, { signedIn, hasGarage, isAdmin }) : null;

  useEffect(() => {
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
  }, [params, pathname, redirect]);

  useEffect(() => {
    if (status !== 'restoring') void SplashScreen.hideAsync();
  }, [status]);

  if (status === 'unreachable') return <Unreachable />;

  return (
    <>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.brandBlack } }} />
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
    const removeHandler = installUnauthorizedHandler();
    void useAuth.getState().restore();
    return removeHandler;
  }, []);

  if (!fontsLoaded) return null;

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <StatusBar style="light" />
        <SessionGate />
        <ToastHost />
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  cover: { backgroundColor: colors.brandBlack },
  unreachable: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 24,
    backgroundColor: colors.brandBlack,
  },
});
