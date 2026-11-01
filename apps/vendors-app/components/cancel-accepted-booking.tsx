import { garageCancelBooking } from '@repo/core/api/bookings';
import {
  canGarageCancel,
  GARAGE_CANCEL_LATE_HOURS,
  GARAGE_CANCEL_REASON_MAX,
  GARAGE_CANCEL_REASON_MIN,
  isLateGarageCancel,
} from '@repo/core/garage-cancel';
import { useBookingsStore } from '@repo/core/stores/bookings-store';
import type { Booking } from '@repo/core/types';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { colors } from '@/lib/theme';

import { ScButton } from '@repo/native-ui/button';
import { ScTextarea } from '@repo/native-ui/inputs';
import { ConfirmSheet } from '@repo/native-ui/sheet';
import { T } from '@repo/native-ui/text';
import { toast } from '@repo/native-ui/toast';
import { errorText } from '@/lib/error-text';

/** CancelAcceptedBooking: accepted, not started, the garage can no longer do it. */
export function CancelAcceptedBooking({
  booking,
  now,
  onChanged,
}: {
  booking: Booking;
  now: number;
  onChanged: () => void;
}) {
  const writeVendorBooking = useBookingsStore((s) => s.writeVendorBooking);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | undefined>();

  if (!canGarageCancel(booking)) return null;

  const who = booking.customerName || 'The customer';
  const late = isLateGarageCancel(new Date(booking.scheduledAtIso), new Date(now));
  const paid = booking.paymentStatus === 'paid';

  const close = () => {
    setOpen(false);
    setError(undefined);
  };

  const cancel = async () => {
    const text = reason.trim();
    if (text.length < GARAGE_CANCEL_REASON_MIN) {
      setError('Say why you are cancelling, so Detlio can help the customer.');
      return;
    }
    setError(undefined);
    try {
      await writeVendorBooking(booking.id, () => garageCancelBooking(booking.id, text));
      toast.success('Booking cancelled');
      setReason('');
      setOpen(false);
      onChanged();
    } catch (err) {
      setError(errorText(err, 'Could not cancel this booking'));
      onChanged();
    }
  };

  return (
    <View>
      <ScButton
        variant="outline"
        accessibilityLabel={`Cancel booking for ${booking.customerName || 'the customer'}`}
        onPress={() => setOpen(true)}
      >
        Cancel booking
      </ScButton>
      <ConfirmSheet
        open={open}
        onClose={close}
        onConfirm={cancel}
        level="firm"
        title="Cancel this booking?"
        body={
          <View style={styles.body}>
            <T size={15} color={colors.textSecondary}>
              {paid ? `${who} gets a full refund, and we tell them you had to cancel.` : `We tell ${who} you had to cancel.`}
            </T>
            <T size={15} color={late ? colors.warning : colors.textSecondary}>
              {late
                ? `This is within ${GARAGE_CANCEL_LATE_HOURS} hours of the booking, so it counts as a missed booking for your medal.`
                : `More than ${GARAGE_CANCEL_LATE_HOURS} hours before the booking, it counts like a booking you couldn't take.`}
            </T>
            <ScTextarea
              label="Why are you cancelling?"
              rows={3}
              maxLength={GARAGE_CANCEL_REASON_MAX}
              value={reason}
              onChangeText={setReason}
            />
          </View>
        }
        confirmLabel="Cancel booking"
        cancelLabel="Keep booking"
        error={error}
      />
    </View>
  );
}

const styles = StyleSheet.create({ body: { gap: 12 } });
