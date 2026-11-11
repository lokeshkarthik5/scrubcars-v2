import { chooseProposedTime, declineProposedTimes } from '@repo/core/api/bookings';
import { ApiError } from '@repo/core/api/client';
import { formatClock } from '@repo/core/format';
import { bookingDayLabel } from '@repo/core/home-display';
import { useT } from '@repo/core/i18n';
import type { Booking, TimeProposal } from '@repo/core/types';
import { ScButton } from '@repo/native-ui/button';
import { IconCalendarQuestion } from '@repo/native-ui/icons';
import { ScCard, Spinner } from '@repo/native-ui/primitives';
import { Figures, T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { toast } from '@repo/native-ui/toast';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { errorText } from '@/lib/error-text';

const proposedTimeLabel = (iso: string) => `${bookingDayLabel(iso)}, ${formatClock(iso)}`;

/** TimeProposalCard (apps/users/components/time-proposal-card.tsx). */
export function TimeProposalCard({
  booking,
  proposal,
  onMoved,
  onDeclined,
  onStale,
}: {
  booking: Booking;
  proposal: TimeProposal;
  onMoved: (moved: Booking) => void;
  onDeclined: (cancelled: Booking) => void;
  onStale: () => void;
}) {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDecline, setConfirmDecline] = useState(false);
  const [gone, setGone] = useState<string[]>([]);
  const options = proposal.options.filter((option) => !gone.includes(option));

  const choose = async (slot: string) => {
    if (busy) return;
    setBusy(slot);
    try {
      const moved = await chooseProposedTime(booking.id, slot);
      toast.success(t('Booked for {time}. {name} has accepted it.', { time: proposedTimeLabel(slot), name: booking.vendorName }));
      onMoved(moved);
    } catch (error) {
      if (error instanceof ApiError && error.code === 'TIME_PROPOSAL_SLOT_GONE') {
        setGone((current) => [...current, slot]);
        toast.error(error.message);
      } else if (error instanceof ApiError && error.code === 'TIME_PROPOSAL_CLOSED') {
        toast.error(error.message);
        onStale();
      } else {
        toast.error(errorText(error, t('Something went wrong. Please try again.')));
      }
    } finally {
      setBusy(null);
    }
  };

  const decline = async () => {
    if (busy) return;
    setBusy('decline');
    try {
      const cancelled = await declineProposedTimes(booking.id);
      toast.success(t('Booking cancelled. Your payment will be refunded in full.'));
      onDeclined(cancelled);
    } catch (error) {
      toast.error(errorText(error, t('Something went wrong. Please try again.')));
      if (error instanceof ApiError && error.code === 'TIME_PROPOSAL_CLOSED') onStale();
    } finally {
      setBusy(null);
      setConfirmDecline(false);
    }
  };

  const paid = booking.paymentStatus === 'paid';
  return (
    <ScCard style={styles.card}>
      <View style={styles.head}>
        <IconCalendarQuestion size={20} stroke={1.5} color={colors.textSecondary} />
        <View style={styles.grow}>
          <T size={17} weight={500} lh={24}>
            <Figures size={17} weight={500} text={t("{name} can't do {time} — pick another time", { name: booking.vendorName, time: formatClock(booking.scheduledAtIso) })} />
          </T>
          <T size={13} lh={18} color={colors.textSecondary} style={styles.sub}>
            <Figures size={13} color={colors.textSecondary} text={t("Pick one by {time}. It's accepted as soon as you pick it.", { time: proposedTimeLabel(proposal.expiresAt) })} />
          </T>
        </View>
      </View>
      {proposal.note ? (
        <T size={12} lh={16} color={colors.textSecondary}>
          <T size={12} weight={500} lh={16}>
            {`${t("Garage's note:")} `}
          </T>
          {proposal.note}
        </T>
      ) : null}
      {options.length > 0 ? (
        <View style={styles.options}>
          {options.map((option) => (
            <Pressable
              key={option}
              accessibilityRole="button"
              accessibilityLabel={t('Book {time}', { time: proposedTimeLabel(option) })}
              disabled={busy !== null}
              onPress={() => void choose(option)}
              style={[styles.option, busy === option && styles.optionBusy]}
            >
              <T num size={15} lh={20}>
                {proposedTimeLabel(option)}
              </T>
              {busy === option ? (
                <Spinner size={16} />
              ) : (
                <T size={13} lh={18} color={colors.textSecondary}>
                  {t('Pick')}
                </T>
              )}
            </Pressable>
          ))}
        </View>
      ) : (
        <T size={13} lh={18} color={colors.textSecondary}>
          {t('The times {name} suggested have all been taken. You can cancel for a full refund, or use Help with this booking.', { name: booking.vendorName })}
        </T>
      )}
      {confirmDecline ? (
        <View style={styles.confirm}>
          <T size={13} lh={18} color={colors.textSecondary}>
            {paid ? t('Cancel this booking? Your payment will be refunded in full to your original payment method.') : t('Cancel this booking? Nothing was paid, so there is nothing to refund.')}
          </T>
          <View style={styles.row}>
            <View style={styles.grow}>
              <ScButton variant="outline" disabled={busy !== null} onPress={() => setConfirmDecline(false)}>
                {t('Keep it')}
              </ScButton>
            </View>
            <View style={styles.grow}>
              <ScButton variant="danger-outline" disabled={busy !== null} onPress={() => void decline()}>
                {busy === 'decline' ? t('Cancelling...') : t('Yes, cancel')}
              </ScButton>
            </View>
          </View>
        </View>
      ) : (
        <ScButton variant="text" disabled={busy !== null} height={44} onPress={() => setConfirmDecline(true)}>
          {t('None of these work — cancel for a full refund')}
        </ScButton>
      )}
    </ScCard>
  );
}

const useStyles = createStyles((c) => ({
  card: { gap: 12, padding: 16 },
  head: { flexDirection: 'row', gap: 10 },
  grow: { flex: 1, minWidth: 0 },
  sub: { marginTop: 2 },
  options: { gap: 8 },
  option: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderRadius: 14, borderWidth: 1, borderColor: c.line, backgroundColor: c.fillSoft, paddingHorizontal: 16 },
  optionBusy: { borderColor: c.textPrimary },
  confirm: { gap: 8, borderTopWidth: 1, borderTopColor: c.border, paddingTop: 12 },
  row: { flexDirection: 'row', gap: 8 },
}));
