import { apiClient } from '@repo/core/api/client';
import type { GarageClaim } from '@repo/core/api/guarantee';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

/**
 * The garage side of Detlio Guarantee (0051). packages/core/src/api/guarantee.ts
 * can't come to the phone (it imports job-records, so image-upload and the
 * browser-only metadata stripper), so the three garage requests are copied from
 * it, with the hooks from api/hooks/use-guarantee.ts. The key
 * ['guarantee', 'garage', 'open'] is the one Home's card (lib/garage-api.ts) reads,
 * so answering a claim here refreshes Home as well.
 */

/** GET /vendors/me/guarantee/claims?scope= */
const getGarageClaims = (scope: 'open' | 'closed') =>
  apiClient<{ items: GarageClaim[]; reviewHours: number }>('/vendors/me/guarantee/claims', { params: { scope } });

/** POST /vendors/me/guarantee/claims/:id/accept */
const acceptClaim = (claimId: string) =>
  apiClient<GarageClaim>(`/vendors/me/guarantee/claims/${claimId}/accept`, { method: 'POST' });

/** POST /vendors/me/guarantee/claims/:id/dispute */
const disputeClaim = (claimId: string, note: string) =>
  apiClient<GarageClaim>(`/vendors/me/guarantee/claims/${claimId}/dispute`, {
    method: 'POST',
    body: JSON.stringify({ note }),
  });

const GARAGE_KEY = ['guarantee', 'garage'] as const;

/** The inbox for one scope. The countdown runs on the screen; the list refreshes now and then. */
export function useGarageClaimsInbox(scope: 'open' | 'closed', enabled = true) {
  return useQuery({
    enabled,
    queryKey: [...GARAGE_KEY, scope],
    queryFn: () => getGarageClaims(scope),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

export function useAnswerClaim() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { claimId: string; answer: 'accept' } | { claimId: string; answer: 'dispute'; note: string }) =>
      input.answer === 'accept' ? acceptClaim(input.claimId) : disputeClaim(input.claimId, input.note),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: GARAGE_KEY });
    },
  });
}
