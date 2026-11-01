import { invalidateHome } from '@repo/core/api/hooks/use-home';
import { ScButton } from '@repo/native-ui/button';
import { ScSheet } from '@repo/native-ui/sheet';
import { T } from '@repo/native-ui/text';
import { useColors } from '@repo/native-ui/theme';
import { toast } from '@repo/native-ui/toast';
import { useQueryClient } from '@tanstack/react-query';
import { type Href, router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AppState, View } from 'react-native';

import { clearBookingDraft } from '@/lib/booking-draft';
import { isPendingExpired, paymentFlowOnScreen, pendingPayment, readPendingOutcome } from '@/lib/pending-payment';

/**
 * Back in the app after a payment it lost sight of, killed in Razorpay's window, say. The
 * webhook settled it or didn't; this reads what the server says and shows that, never a
 * guess. No answer yet leaves the record in place, and checkout won't start a second payment
 * over it.
 */
export function PaymentRecovery() {
  const colors = useColors();
  const queryClient = useQueryClient();
  const [failed, setFailed] = useState<string | null>(null);
  const checking = useRef(false);

  useEffect(() => {
    const check = async () => {
      if (checking.current || paymentFlowOnScreen()) return;
      const payment = pendingPayment.read();
      if (!payment) return;
      checking.current = true;
      try {
        const outcome = await readPendingOutcome(payment);
        if (paymentFlowOnScreen()) return;
        if (outcome.kind === 'booked') {
          pendingPayment.clear();
          if (payment.kind === 'intent') clearBookingDraft();
          void invalidateHome(queryClient);
          void queryClient.invalidateQueries();
          toast.success(payment.kind === 'intent' ? 'Your payment went through. The booking is with the garage.' : 'Your payment went through.');
          router.push(`/bookings/${outcome.bookingId}` as Href);
        } else if (outcome.kind === 'failed') {
          pendingPayment.clear();
          setFailed(outcome.message);
        } else if (isPendingExpired(payment, Date.now())) {
          // Razorpay's window is long closed, and no webhook came: it was never paid.
          pendingPayment.clear();
        }
      } catch {
        // No signal: asked again next time.
      } finally {
        checking.current = false;
      }
    };
    void check();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void check();
    });
    return () => subscription.remove();
  }, [queryClient]);

  return (
    <ScSheet open={failed !== null} onClose={() => setFailed(null)} accessibilityLabel="Your payment">
      <T size={20} lh={28} tracking={-0.015}>
        Your payment didn&apos;t make a booking
      </T>
      <T size={15} lh={22} color={colors.textSecondary} style={{ marginTop: 8 }}>
        {failed ?? ''}
      </T>
      <View style={{ marginTop: 20 }}>
        <ScButton variant="main" onPress={() => setFailed(null)}>
          OK
        </ScButton>
      </View>
    </ScSheet>
  );
}
