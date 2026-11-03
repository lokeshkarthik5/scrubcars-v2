import { useQueryClient } from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';

/**
 * A tab stays mounted on the phone, so react-query's own "refetch on mount" never fires when it is
 * opened again, where the web's page is new each time. This marks these queries stale on every
 * focus, and the ones on screen are read again.
 */
export function useRefreshOnFocus(queryKey: readonly unknown[]) {
  const queryClient = useQueryClient();
  const key = JSON.stringify(queryKey);
  useFocusEffect(
    useCallback(() => {
      void queryClient.invalidateQueries({ queryKey: JSON.parse(key) as unknown[] });
    }, [queryClient, key])
  );
}
