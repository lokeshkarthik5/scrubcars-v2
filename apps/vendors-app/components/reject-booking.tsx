import { useBookingsStore } from '@repo/core/stores/bookings-store';
import type { Booking } from '@repo/core/types';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { colors } from '@/lib/theme';

import { ScInput } from './inputs';
import { ConfirmSheet } from './sheet';
import { T } from './text';
import { toast } from './toast';

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
  const updateStatus = useBookingsStore((s) => s.updateStatus);
  const fetchVendorBookings = useBookingsStore((s) => s.fetchVendorBookings);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const who = booking.customerName || 'The customer';
  const paid = booking.paymentStatus === 'paid';

  const reject = async () => {
    setBusy(true);
    try {
      await updateStatus(booking.id, 'cancelled', reason.trim() || undefined);
      toast.success('Booking rejected');
      setReason('');
      onClose();
      onDone?.();
    } catch (error) {
      // The slot started, or the customer cancelled a moment ago: say so and re-read.
      toast.error(error instanceof Error ? error.message : 'Could not reject this booking');
      void fetchVendorBookings().catch(() => undefined);
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
      title="Can't do this booking?"
      body={
        <View style={styles.body}>
          <T size={15} color={colors.textSecondary}>
            {paid ? `${who} gets a full refund, and we tell them you can't take it.` : `We tell ${who} you can't take it.`}
          </T>
          <ScInput
            accessibilityLabel="Reason for rejecting (optional)"
            placeholder="Reason for rejecting (optional)"
            value={reason}
            onChangeText={setReason}
          />
        </View>
      }
      confirmLabel="Reject booking"
      cancelLabel="Keep"
      busy={busy}
    />
  );
}

const styles = StyleSheet.create({ body: { gap: 12 } });
