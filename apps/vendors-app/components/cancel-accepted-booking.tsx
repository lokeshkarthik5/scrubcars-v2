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
import { View } from 'react-native';

import { createStyles, useColors } from '@repo/native-ui/theme';

import { ScButton } from '@repo/native-ui/button';
import { ScTextarea } from '@repo/native-ui/inputs';
import { ConfirmSheet } from '@repo/native-ui/sheet';
import { T } from '@repo/native-ui/text';
import { toast } from '@repo/native-ui/toast';
import { errorText } from '@/lib/error-text';
import { useT } from '@repo/core/i18n';

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
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  const writeVendorBooking = useBookingsStore((s) => s.writeVendorBooking);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | undefined>();

  if (!canGarageCancel(booking)) return null;

  const who = booking.customerName || t('The customer');
  const late = isLateGarageCancel(new Date(booking.scheduledAtIso), new Date(now));
  const paid = booking.paymentStatus === 'paid';

  const close = () => {
    setOpen(false);
    setError(undefined);
  };

  const cancel = async () => {
    const text = reason.trim();
    if (text.length < GARAGE_CANCEL_REASON_MIN) {
      setError(t('Say why you are cancelling, so Detlio can help the customer.'));
      return;
    }
    setError(undefined);
    try {
      await writeVendorBooking(booking.id, () => garageCancelBooking(booking.id, text));
      toast.success(t('Booking cancelled'));
      setReason('');
      setOpen(false);
      onChanged();
    } catch (err) {
      setError(errorText(err, t('Could not cancel this booking')));
      onChanged();
    }
  };

  return (
    <View>
      <ScButton
        variant="outline"
        accessibilityLabel={t('Cancel booking for {name}', { name: booking.customerName || t('the customer') })}
        onPress={() => setOpen(true)}
      >
        {t('Cancel booking')}
      </ScButton>
      <ConfirmSheet
        open={open}
        onClose={close}
        onConfirm={cancel}
        level="firm"
        title={t('Cancel this booking?')}
        body={
          <View style={styles.body}>
            <T size={15} color={colors.textSecondary}>
              {paid
                ? t('{who} gets a full refund, and we tell them you had to cancel.', { who })
                : t('We tell {who} you had to cancel.', { who })}
            </T>
            <T size={15} color={late ? colors.warning : colors.textSecondary}>
              {late
                ? t('This is within {hours} hours of the booking, so it counts as a missed booking for your medal.', {
                    hours: GARAGE_CANCEL_LATE_HOURS,
                  })
                : t("More than {hours} hours before the booking, it counts like a booking you couldn't take.", {
                    hours: GARAGE_CANCEL_LATE_HOURS,
                  })}
            </T>
            <ScTextarea
              label={t('Why are you cancelling?')}
              rows={3}
              maxLength={GARAGE_CANCEL_REASON_MAX}
              value={reason}
              onChangeText={setReason}
            />
          </View>
        }
        confirmLabel={t('Cancel booking')}
        cancelLabel={t('Keep booking')}
        error={error}
      />
    </View>
  );
}

const useStyles = createStyles(() => ({ body: { gap: 12 } }));
