import { focusManager, QueryClient } from '@tanstack/react-query';
import { AppState } from 'react-native';

/** Queries refresh when the app comes back, and stop polling while it is away. */
focusManager.setEventListener((setFocused) => {
  const subscription = AppState.addEventListener('change', (state) => setFocused(state === 'active'));
  return () => subscription.remove();
});

export const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});
