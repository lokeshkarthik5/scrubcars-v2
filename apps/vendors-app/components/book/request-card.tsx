import { formatClock, formatINR, formatWhen } from '@repo/core/format';
import { answerByRing } from '@repo/core/moments';
import type { Booking } from '@repo/core/types';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Edge, RedButton } from '@repo/native-ui/finish';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';

import { RejectBookingSheet } from '@/components/reject-booking';
import { serviceOnlyLine } from '@/lib/add-on-lines';
import { useIsVendorAdmin } from '@/lib/auth';
import { changeStatusWithUndo, useDeferredStatus } from '@/lib/deferred-status';
import { jobPrice } from '@/lib/jobs';

import { AnswerRing } from './moments';
import { go, Overline, RaisedButton } from './parts';

/**
 * A new Detlio request pinned on top of Home (B1; the web's components/book/request-card.tsx)
 * with the answer-by ring (moment 1), Decline and the red Accept, through the same Undo queue
 * and decline sheet as Bookings › New. Money is the owner's.
 */
export function RequestCard({ booking: b, now, more, onChanged }: { booking: Booking; now: number; more: number; onChanged: () => void }) {
  const styles = useStyles();
  const colors = useColors();
  const [declining, setDeclining] = useState(false);
  const accepting = useDeferredStatus(b.id) === 'confirmed';
  const isOwner = useIsVendorAdmin();
  const ring = b.responseDeadline ? answerByRing(b.responseDeadline, now) : { fraction: 1, minutesLeft: null };
  const what = [serviceOnlyLine(b), b.customerName, b.vehicle?.model].filter(Boolean).join(' · ');
  const label =
    ring.minutesLeft !== null
      ? `${ring.minutesLeft} minutes left to answer`
      : b.responseDeadline
        ? `Answer by ${formatClock(b.responseDeadline.respondBy)}`
        : 'New request';
  return (
    <Edge radius={22} innerStyle={styles.card}>
      <View style={styles.top}>
        <AnswerRing fraction={ring.fraction} label={ring.minutesLeft !== null ? `${ring.minutesLeft}m` : 'New'} accessibilityLabel={label} />
        <Pressable accessibilityRole="link" onPress={() => go(`/bookings/${b.id}`)} style={styles.flex}>
          <Overline red>New Detlio request</Overline>
          <T variant="t2" numberOfLines={1} style={styles.when}>
            {formatWhen(b.scheduledAtIso, now)}
          </T>
          <T variant="t4" weight={400} color={colors.textSecondary} numberOfLines={1}>
            {what}
          </T>
        </Pressable>
        {isOwner ? (
          <T num size={20} weight={600}>
            {formatINR(jobPrice(b))}
          </T>
        ) : null}
      </View>
      <View style={styles.buttons}>
        <RaisedButton label="Decline" onPress={() => setDeclining(true)} disabled={accepting} style={styles.flex} />
        <RedButton onPress={() => changeStatusWithUndo(b.id, 'confirmed')} disabled={accepting} height={48} radius={18} style={styles.flex}>
          {accepting ? 'Accepting…' : 'Accept'}
        </RedButton>
      </View>
      {more > 0 ? (
        <T variant="t4" color={colors.textSecondary} align="center" onPress={() => go('/bookings?tab=new')}>
          {`See all ${more + 1} new requests`}
        </T>
      ) : null}
      <RejectBookingSheet booking={b} open={declining} onClose={() => setDeclining(false)} onDone={onChanged} />
    </Edge>
  );
}

const useStyles = createStyles(() => ({
  flex: { flex: 1, minWidth: 0 },
  card: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 16, gap: 14 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  when: { marginTop: 4 },
  buttons: { flexDirection: 'row', gap: 8 },
}));
