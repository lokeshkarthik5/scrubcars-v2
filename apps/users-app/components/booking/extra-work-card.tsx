import { getBooking } from '@repo/core/api/bookings';
import { ApiError } from '@repo/core/api/client';
import { declineExtraWork } from '@repo/core/api/job-records';
import { formatRupees } from '@repo/core/job-records';
import type { Booking, ExtraWork } from '@repo/core/types';
import { Label, ScButton } from '@repo/native-ui/button';
import { IconArrowUpRight, IconCircleCheck, IconTool } from '@repo/native-ui/icons';
import { ScCard, Spinner } from '@repo/native-ui/primitives';
import { Figures, T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { toast } from '@repo/native-ui/toast';
import { useRef, useState } from 'react';
import { Image, Pressable, ScrollView, View } from 'react-native';

import { PaymentReceivedPanel } from '@/components/checkout/payment-received-panel';
import { payCharge } from '@/lib/charge-payment';
import { errorText } from '@/lib/error-text';

import { PhotoViewer } from './photo-viewer';

interface WorkPayment {
  paymentId: string;
  phase: 'confirming' | 'paid' | 'unconfirmed' | 'failed';
  refundMessage?: string;
}

const STATE_LINE: Record<Exclude<ExtraWork['state'], 'awaiting'>, string> = {
  paid: 'Approved and paid',
  declined: 'You declined it',
  withdrawn: 'The garage withdrew it',
  closed: 'Closed with the booking',
};

const paidOn = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
const extraWorkOpen = (booking: Booking) => booking.status === 'confirmed' || booking.status === 'in_progress';

/** ExtraWorkCard (apps/users/components/extra-work-card.tsx). */
export function ExtraWorkCard({
  booking,
  onUpdated,
  customer,
}: {
  booking: Booking;
  onUpdated: (booking: Booking) => void;
  customer?: { name?: string; phone?: string };
}) {
  const colors = useColors();
  const styles = useStyles();
  const [payments, setPayments] = useState<Record<string, WorkPayment>>({});
  const [opening, setOpening] = useState<string | null>(null);
  const [declining, setDeclining] = useState<string | null>(null);
  const [viewing, setViewing] = useState<{ url: string; name: string } | null>(null);
  const paidRef = useRef(new Set<string>());
  const record = (id: string, payment: WorkPayment) => setPayments((current) => ({ ...current, [id]: payment }));
  const firstAwaiting = booking.extraWork.find((work) => work.state === 'awaiting')?.id;

  const handlePay = async (work: ExtraWork) => {
    if (opening || paidRef.current.has(work.id) || payments[work.id]) return;
    setOpening(work.id);
    try {
      const result = await payCharge({
        what: 'extra_work',
        booking,
        chargeId: work.id,
        description: `Extra work at ${booking.vendorName}`,
        customer,
        onPaid: (paymentId) => {
          paidRef.current.add(work.id);
          record(work.id, { paymentId, phase: 'confirming' });
        },
      });
      if (result.kind === 'cancelled') toast.info('Payment cancelled. You can approve it any time from this page.');
      else if (result.kind === 'failed-to-pay') toast.error(result.message);
      else if (result.outcome.kind === 'booked') {
        const updated = await getBooking(booking.id);
        if (updated) onUpdated(updated);
        record(work.id, { paymentId: result.paymentId, phase: 'paid' });
        toast.success(`Approved. ${booking.vendorName} can go ahead.`);
      } else {
        const refundMessage = result.outcome.kind === 'failed' ? result.outcome.message : undefined;
        record(work.id, { paymentId: result.paymentId, phase: result.outcome.kind, refundMessage });
        if (refundMessage) toast.error(refundMessage);
      }
    } catch (error) {
      toast.error(errorText(error, 'Could not start the payment. Please try again.'));
      if (error instanceof ApiError && error.code === 'EXTRA_WORK_CLOSED') {
        const fresh = await getBooking(booking.id);
        if (fresh) onUpdated(fresh);
      }
    } finally {
      setOpening(null);
    }
  };

  const handleDecline = async (work: ExtraWork) => {
    if (declining || opening) return;
    setDeclining(work.id);
    try {
      await declineExtraWork(booking.id, work.id);
      toast.success(`Declined. ${booking.vendorName} can see your answer.`);
    } catch (error) {
      toast.error(errorText(error, 'Something went wrong. Please try again.'));
    } finally {
      const fresh = await getBooking(booking.id).catch(() => null);
      if (fresh) onUpdated(fresh);
      setDeclining(null);
    }
  };

  if (booking.extraWork.length === 0) return null;
  return (
    <ScCard style={styles.card}>
      <View>
        {firstAwaiting && extraWorkOpen(booking) ? (
          <View style={styles.needs}>
            <View style={styles.dot} />
            <T size={13} lh={18} color={colors.dim}>
              Needs your answer
            </T>
          </View>
        ) : null}
        <View style={styles.titleRow}>
          <IconTool size={18} stroke={1.5} color={colors.textSecondary} />
          <T size={17} weight={500} lh={24}>
            Extra work
          </T>
        </View>
        <T size={13} lh={18} color={colors.textSecondary} style={styles.sub}>
          {`Asked for by ${booking.vendorName}. Nothing is done or charged unless you approve and pay here.`}
        </T>
      </View>
      {booking.extraWork.map((work, index) => {
        const payment = payments[work.id];
        const settled = work.state === 'paid' || payment?.phase === 'paid';
        const showPanel = !settled && (payment?.phase === 'unconfirmed' || payment?.phase === 'failed');
        const open = work.state === 'awaiting' && !payment && extraWorkOpen(booking);
        const busy = opening !== null || declining !== null;
        return (
          <View key={work.id} style={[styles.work, index > 0 && styles.divided]}>
            {work.photos.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photos}>
                {work.photos.map((photo, i) => (
                  <Pressable
                    key={photo.url}
                    accessibilityRole="imagebutton"
                    accessibilityLabel={`Open photo ${i + 1} of ${work.photos.length} of ${work.description}`}
                    onPress={() => setViewing({ url: photo.url, name: work.description })}
                  >
                    <Image source={{ uri: photo.url }} style={styles.photo} />
                  </Pressable>
                ))}
              </ScrollView>
            ) : null}
            <View style={styles.row}>
              <T size={17} lh={22} style={styles.grow}>
                {work.description}
              </T>
              <T num size={17} lh={22}>
                {formatRupees(work.amount)}
              </T>
            </View>
            {work.note ? (
              <T size={13} lh={18} color={colors.textSecondary}>
                <T size={13} weight={500} lh={18}>
                  {"Garage's note: "}
                </T>
                {work.note}
              </T>
            ) : null}
            {settled ? (
              <View style={styles.okLine}>
                <IconCircleCheck size={16} color={colors.success} />
                <T size={13} weight={500} lh={18} color={colors.success}>
                  <Figures size={13} weight={500} color={colors.success} text={`Approved and paid on ${paidOn(work.paidAt ?? new Date().toISOString())}`} />
                </T>
              </View>
            ) : payment?.phase === 'confirming' ? (
              <ScButton variant="quiet" height={52} disabled>
                <Spinner size={16} />
                <Label>Payment received — confirming…</Label>
              </ScButton>
            ) : showPanel && payment ? (
              <PaymentReceivedPanel paymentId={payment.paymentId} refundMessage={payment.phase === 'failed' ? payment.refundMessage : undefined} waitingOn="bill_not_marked_paid" />
            ) : open ? (
              <View style={styles.actions}>
                {work.id === firstAwaiting ? (
                  <ScButton variant="hero" disabled={busy} onPress={() => void handlePay(work)}>
                    <Label color={colors.white}>
                      <Figures color={colors.white} size={15} weight={700} text={opening === work.id ? 'Opening payment...' : `Approve & pay ${formatRupees(work.amount)}`} />
                    </Label>
                    {opening !== work.id ? <IconArrowUpRight size={17} stroke={1.5} color={colors.white} /> : null}
                  </ScButton>
                ) : (
                  <ScButton variant="outline" disabled={busy} onPress={() => void handlePay(work)}>
                    {opening === work.id ? 'Opening payment...' : `Approve & pay ${formatRupees(work.amount)}`}
                  </ScButton>
                )}
                <ScButton variant="text" disabled={busy} accessibilityLabel={`No thanks to ${work.description}`} onPress={() => void handleDecline(work)}>
                  {declining === work.id ? 'Declining...' : 'No thanks'}
                </ScButton>
              </View>
            ) : work.state !== 'awaiting' ? (
              <T size={13} lh={18} color={colors.textSecondary}>
                {STATE_LINE[work.state]}
              </T>
            ) : null}
          </View>
        );
      })}
      <PhotoViewer photo={viewing} onClose={() => setViewing(null)} />
    </ScCard>
  );
}

const useStyles = createStyles((c) => ({
  card: { gap: 16, padding: 16 },
  needs: { marginBottom: 4, flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { height: 6, width: 6, borderRadius: 3, backgroundColor: c.redFill },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sub: { marginTop: 2 },
  work: { gap: 10 },
  divided: { borderTopWidth: 1, borderTopColor: c.border, paddingTop: 12 },
  photos: { gap: 8 },
  photo: { height: 96, width: 96, borderRadius: 14, borderWidth: 1, borderColor: c.line },
  row: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  grow: { flex: 1, minWidth: 0 },
  okLine: { flexDirection: 'row', gap: 6 },
  actions: { gap: 8 },
}));
