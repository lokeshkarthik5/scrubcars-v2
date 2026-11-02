import {
  acceptRequest,
  declineRequest,
  getRequestStartTimes,
  listGarageRequests,
  withdrawRequest,
} from '@repo/core/api/booking-requests';
import type { TravelFee } from '@repo/core/booking-requests';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

/**
 * The garage's visit requests inbox: the hooks of packages/core/src/api/hooks/use-booking-requests.ts
 * (garage half), whose file also pulls in the customer's hooks and the area ones.
 * The requests themselves are core's api/booking-requests.ts, imported as it is.
 *
 * Home's badge reads ['requests', 'garage-count'] (lib/garage-api.ts), which is not
 * under ['requests', 'garage'], so every answer refreshes both.
 */

const GARAGE_KEY = ['requests', 'garage'] as const;
const COUNT_KEY = ['requests', 'garage-count'] as const;

/** The inbox, re-read every 15 s while Open is shown: requests have a clock. */
export function useGarageRequestsInbox(scope: 'open' | 'closed') {
  return useQuery({
    queryKey: [...GARAGE_KEY, scope],
    queryFn: () => listGarageRequests(scope),
    refetchInterval: scope === 'open' ? 15_000 : false,
  });
}

export function useRequestStartTimes(id: string | null) {
  return useQuery({
    queryKey: ['requests', 'start-times', id ?? 'none'],
    queryFn: () => getRequestStartTimes(id!),
    enabled: id !== null,
    staleTime: 15_000,
  });
}

function useRefreshGarage() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: GARAGE_KEY });
    void queryClient.invalidateQueries({ queryKey: COUNT_KEY });
  };
}

export function useAcceptRequest() {
  const refresh = useRefreshGarage();
  return useMutation({
    mutationFn: (input: { id: string; startAt: string; travelFee: TravelFee }) =>
      acceptRequest(input.id, { startAt: input.startAt, travelFee: input.travelFee }),
    onSettled: refresh,
  });
}

/** Take back a yes before the customer pays (0066). */
export function useWithdrawRequest() {
  const refresh = useRefreshGarage();
  return useMutation({ mutationFn: (id: string) => withdrawRequest(id), onSettled: refresh });
}

export function useDeclineRequest() {
  const refresh = useRefreshGarage();
  return useMutation({ mutationFn: (id: string) => declineRequest(id), onSettled: refresh });
}
