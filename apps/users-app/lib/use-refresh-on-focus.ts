import { useQueryClient } from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';

/**
 * A tab stays mounted on the phone, so react-query's own "refetch on mount" never fires when it is
 * opened again, where the web's page is new each time. On every focus the ones on screen that
 * have gone stale (older than their staleTime, 30 s by default) are read again: the web's rule
 * for a new page. Every focus used to re-read them, so each tap on Home fetched Home again.
 */
export function useRefreshOnFocus(queryKey: readonly unknown[]) {
  const queryClient = useQueryClient();
  const key = JSON.stringify(queryKey);
  useFocusEffect(
    useCallback(() => {
      void queryClient.refetchQueries({ queryKey: JSON.parse(key) as unknown[], type: 'active', stale: true });
    }, [queryClient, key])
  );
}
