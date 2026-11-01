import { focusManager, onlineManager, QueryClient } from '@tanstack/react-query';
import { addNetworkStateListener } from 'expo-network';
import { AppState } from 'react-native';

/** Queries refresh when the app comes back, and stop polling while it is away. */
focusManager.setEventListener((setFocused) => {
  const subscription = AppState.addEventListener('change', (state) => setFocused(state === 'active'));
  return () => subscription.remove();
});

/** Back online, what failed is asked again. */
onlineManager.setEventListener((setOnline) => {
  const subscription = addNetworkStateListener((state) => setOnline(state.isConnected !== false && state.isInternetReachable !== false));
  return () => subscription.remove();
});

export const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});
