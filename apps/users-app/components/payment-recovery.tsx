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
import { checkPending, failedTitle, paymentFlowOnScreen, pendingPayment } from '@/lib/pending-payment';

const RECHECK_MS = 10_000;

/**
 * Back in the app after a payment it lost sight of, killed in Razorpay's window, say. The
 * webhook settled it or didn't; this reads what the server says and shows that, never a
 * guess. No answer yet leaves the record in place, and checkout won't start a second payment
 * over it.
 */
export function PaymentRecovery() {
  const colors = useColors();
  const queryClient = useQueryClient();
  const [failed, setFailed] = useState<{ title: string; message: string } | null>(null);
  const checking = useRef(false);

  useEffect(() => {
    const check = async () => {
      if (checking.current || paymentFlowOnScreen()) return;
      const payments = pendingPayment.list();
      if (payments.length === 0) return;
      checking.current = true;
      try {
        for (const payment of payments) {
          const outcome = await checkPending(payment);
          if (outcome.kind === 'booked' && payment.kind === 'gift') {
            void queryClient.invalidateQueries();
            toast.success('Your gift is paid. Get its link in Gifts you sent.');
            router.push('/profile/gifts' as Href);
          } else if (outcome.kind === 'booked') {
            if (payment.kind === 'intent') clearBookingDraft();
            void invalidateHome(queryClient);
            void queryClient.invalidateQueries();
            toast.success(payment.kind === 'intent' ? 'Your payment went through. The booking is with the garage.' : 'Your payment went through.');
            router.push(`/bookings/${outcome.bookingId}` as Href);
          } else if (outcome.kind === 'failed') {
            setFailed({ title: failedTitle(payment.kind), message: outcome.message });
          }
          if (paymentFlowOnScreen()) return;
        }
      } finally {
        checking.current = false;
      }
    };
    void check();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void check();
    });
    // Pay reads "checking your payment" until this resolves, so it can't wait for a return.
    const watching = setInterval(() => void check(), RECHECK_MS);
    return () => {
      subscription.remove();
      clearInterval(watching);
    };
  }, [queryClient]);

  return (
    <ScSheet horizontalPadding={16} open={failed !== null} onClose={() => setFailed(null)} accessibilityLabel="Your payment">
      <T size={20} lh={28} tracking={-0.015}>
        {failed?.title ?? ''}
      </T>
      <T size={15} lh={22} color={colors.textSecondary} style={{ marginTop: 8 }}>
        {failed?.message ?? ''}
      </T>
      <View style={{ marginTop: 20 }}>
        <ScButton variant="main" onPress={() => setFailed(null)}>
          OK
        </ScButton>
      </View>
    </ScSheet>
  );
}
