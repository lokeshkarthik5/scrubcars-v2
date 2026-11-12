import { useBookingsStore } from '@repo/core/stores/bookings-store';
import type { Booking } from '@repo/core/types';
import { useState } from 'react';
import { View } from 'react-native';

import { readFreshBookings } from '@/lib/fresh-bookings';
import { createStyles, useColors } from '@repo/native-ui/theme';

import { ScInput } from '@repo/native-ui/inputs';
import { ConfirmSheet } from '@repo/native-ui/sheet';
import { T } from '@repo/native-ui/text';
import { toast } from '@repo/native-ui/toast';
import { errorText } from '@/lib/error-text';
import { useT } from '@repo/core/i18n';

/** RejectBookingSheet: "Can't do", asked the same way everywhere; a reason the customer sees. */
export function RejectBookingSheet({
  booking,
  open,
  onClose,
  onDone,
}: {
  booking: Booking;
  open: boolean;
  onClose: () => void;
  onDone?: () => void;
}) {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  const updateStatus = useBookingsStore((s) => s.updateStatus);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const who = booking.customerName || t('The customer');
  const paid = booking.paymentStatus === 'paid';

  const reject = async () => {
    setBusy(true);
    try {
      await updateStatus(booking.id, 'cancelled', reason.trim() || undefined);
      toast.success(t('Booking rejected'));
      setReason('');
      onClose();
      onDone?.();
    } catch (error) {
      // The slot started, or the customer cancelled a moment ago: say so and re-read.
      toast.error(errorText(error, t('Could not reject this booking')));
      void readFreshBookings().catch(() => undefined);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <ConfirmSheet
      open={open}
      onClose={onClose}
      onConfirm={reject}
      level="firm"
      title={t("Can't do this booking?")}
      body={
        <View style={styles.body}>
          <T size={15} color={colors.textSecondary}>
            {paid
              ? t("{who} gets a full refund, and we tell them you can't take it.", { who })
              : t("We tell {who} you can't take it.", { who })}
          </T>
          <ScInput
            accessibilityLabel={t('Reason for rejecting (optional)')}
            placeholder={t('Reason for rejecting (optional)')}
            value={reason}
            onChangeText={setReason}
          />
        </View>
      }
      confirmLabel={t('Reject booking')}
      cancelLabel={t('Keep')}
      busy={busy}
    />
  );
}

const useStyles = createStyles(() => ({ body: { gap: 12 } }));
