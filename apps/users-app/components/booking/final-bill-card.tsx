import { formatRupees } from '@repo/core/job-records';
import { getBooking } from '@repo/core/api/bookings';
import type { Booking, FinalBill } from '@repo/core/types';
import { Label, ScButton } from '@repo/native-ui/button';
import { IconArrowUpRight, IconCircleCheck } from '@repo/native-ui/icons';
import { ScCard, Spinner } from '@repo/native-ui/primitives';
import { Figures, T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { toast } from '@repo/native-ui/toast';
import { useRef, useState } from 'react';
import { View } from 'react-native';

import { PaymentReceivedPanel } from '@/components/checkout/payment-received-panel';
import { payCharge } from '@/lib/charge-payment';
import { errorText } from '@/lib/error-text';

export interface BillPayment {
  paymentId: string;
  phase: 'confirming' | 'paid' | 'unconfirmed' | 'failed';
  refundMessage?: string;
}

const paidOn = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });

/** FinalBillCard (apps/users/components/final-bill-card.tsx). */
export function FinalBillCard({
  booking,
  bill,
  payment: paid,
  onPayment,
  onUpdated,
  customer,
}: {
  booking: Booking;
  bill: FinalBill;
  payment?: BillPayment;
  onPayment: (chargeId: string, payment: BillPayment) => void;
  onUpdated: (booking: Booking) => void;
  customer?: { name?: string; phone?: string };
}) {
  const colors = useColors();
  const styles = useStyles();
  const [opening, setOpening] = useState(false);
  const paidRef = useRef(false);
  const setPaid = (next: BillPayment) => onPayment(bill.id, next);

  const handlePay = async () => {
    if (opening || paidRef.current || paid || bill.status !== 'due') return;
    setOpening(true);
    try {
      const result = await payCharge({
        what: 'final_bill',
        booking,
        chargeId: bill.id,
        description: `Final bill at ${booking.vendorName}`,
        customer,
        onPaid: (paymentId) => {
          paidRef.current = true;
          setPaid({ paymentId, phase: 'confirming' });
        },
      });
      if (result.kind === 'cancelled') toast.info('Payment cancelled. You can pay the bill any time from this page.');
      else if (result.kind === 'failed-to-pay') toast.error(result.message);
      else if (result.outcome.kind === 'booked') {
        const updated = await getBooking(booking.id);
        if (updated) onUpdated(updated);
        setPaid({ paymentId: result.paymentId, phase: 'paid' });
        toast.success('Final bill paid');
      } else {
        const refundMessage = result.outcome.kind === 'failed' ? result.outcome.message : undefined;
        setPaid({ paymentId: result.paymentId, phase: result.outcome.kind, refundMessage });
        if (refundMessage) toast.error(refundMessage);
      }
    } catch (error) {
      toast.error(errorText(error, 'Could not start the payment. Please try again.'));
    } finally {
      setOpening(false);
    }
  };

  const settled = bill.status === 'paid' || paid?.phase === 'paid';
  const showPanel = !settled && (paid?.phase === 'unconfirmed' || paid?.phase === 'failed');
  const discount = bill.paidBefore > 0 && booking.discountAmount > 0 ? Math.min(booking.discountAmount, bill.paidBefore) : 0;

  return (
    <ScCard style={styles.card}>
      <T size={17} weight={500} lh={24}>
        Final bill
      </T>
      <T size={12} lh={16} color={colors.textSecondary} style={styles.from}>
        {`From ${booking.vendorName}, after inspecting your car.`}
      </T>
      <View style={styles.lines}>
        {bill.lines.map((line, i) => (
          <View key={i} style={styles.row}>
            <T size={13} lh={18} color={colors.textSecondary} style={styles.grow}>
              {line.description}
            </T>
            <T num size={13} weight={500} lh={18}>
              {formatRupees(line.amount)}
            </T>
          </View>
        ))}
      </View>
      <View style={styles.sums}>
        <View style={styles.row}>
          <T size={13} lh={18} color={colors.textSecondary}>
            Total
          </T>
          <T num size={13} weight={500} lh={18}>
            {formatRupees(bill.total)}
          </T>
        </View>
        <View style={styles.row}>
          <T size={13} lh={18} color={colors.textSecondary}>
            Paid at booking
          </T>
          <T num size={13} weight={500} lh={18}>
            {`−${formatRupees(bill.paidBefore - discount)}`}
          </T>
        </View>
        {discount > 0 ? (
          <View style={styles.row}>
            <T size={13} lh={18} color={colors.success}>
              {`Discount${booking.discountCode ? ` (${booking.discountCode})` : ''}`}
            </T>
            <T num size={13} weight={500} lh={18} color={colors.success}>
              {`−${formatRupees(discount)}`}
            </T>
          </View>
        ) : null}
        <View style={[styles.row, styles.due]}>
          <T size={15} weight={600} lh={20}>
            {settled ? 'Paid in the app' : 'To pay'}
          </T>
          <T num size={15} weight={700} lh={20}>
            {formatRupees(bill.amountDue)}
          </T>
        </View>
      </View>
      {bill.note ? (
        <T size={12} lh={16} color={colors.textSecondary}>
          <T size={12} weight={500} lh={16}>
            {"Garage's note: "}
          </T>
          {bill.note}
        </T>
      ) : null}
      {bill.status === 'not_needed' ? (
        <View style={styles.okLine}>
          <IconCircleCheck size={16} color={colors.success} />
          <T size={13} lh={18} style={styles.grow}>
            Nothing more to pay. The work came to no more than you paid at booking.
          </T>
        </View>
      ) : settled ? (
        <View style={styles.okLine}>
          <IconCircleCheck size={16} color={colors.success} />
          <T size={13} weight={500} lh={18} color={colors.success}>
            <Figures size={13} weight={500} color={colors.success} text={`Paid on ${paidOn(bill.paidAt ?? new Date().toISOString())}`} />
          </T>
        </View>
      ) : paid?.phase === 'confirming' ? (
        <ScButton variant="quiet" height={52} disabled>
          <Spinner size={16} />
          <Label>Payment received — confirming…</Label>
        </ScButton>
      ) : showPanel && paid ? (
        <PaymentReceivedPanel paymentId={paid.paymentId} refundMessage={paid.phase === 'failed' ? paid.refundMessage : undefined} waitingOn="bill_not_marked_paid" />
      ) : booking.status === 'cancelled' ? null : (
        <ScButton variant="hero" disabled={opening} onPress={() => void handlePay()}>
          <Label color={colors.white}>
            <Figures color={colors.white} size={15} weight={700} text={opening ? 'Opening payment...' : `Pay ${formatRupees(bill.amountDue)}`} />
          </Label>
          {!opening ? <IconArrowUpRight size={17} stroke={1.5} color={colors.white} /> : null}
        </ScButton>
      )}
    </ScCard>
  );
}

const useStyles = createStyles((c) => ({
  card: { gap: 12, padding: 16 },
  from: { marginTop: -8 },
  lines: { gap: 6 },
  row: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  grow: { flex: 1, minWidth: 0 },
  sums: { gap: 6, borderTopWidth: 1, borderTopColor: c.border, paddingTop: 12 },
  due: { borderTopWidth: 1, borderTopColor: c.border, paddingTop: 8, alignItems: 'center' },
  okLine: { flexDirection: 'row', gap: 6 },
}));
