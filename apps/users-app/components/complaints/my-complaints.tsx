import type { CustomerComplaint } from '@repo/core/api/complaints';
import { useMyComplaints, useWithdrawComplaint } from '@repo/core/api/hooks/use-complaints';
import {
  COMPLAINT_CATEGORY_LABELS,
  COMPLAINT_SOURCE_CUSTOMER_LINES,
  COMPLAINT_STATUS_LABELS,
  formatComplaintDate,
} from '@repo/core/complaints';
import { ScCard } from '@repo/native-ui/primitives';
import { ConfirmSheet } from '@repo/native-ui/sheet';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { toast } from '@repo/native-ui/toast';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { errorText } from '@/lib/error-text';

import { RaiseComplaintSheet } from './raise-complaint-sheet';

function ComplaintRow({ complaint }: { complaint: CustomerComplaint }) {
  const colors = useColors();
  const styles = useStyles();
  const withdrawn = Boolean(complaint.withdrawnAt);
  const answered = (complaint.status === 'resolved' || complaint.status === 'closed') && !withdrawn;
  const withdraw = useWithdrawComplaint();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const positive = complaint.status === 'resolved';
  return (
    <ScCard style={styles.card}>
      <View style={styles.top}>
        <T num size={13} weight={500} lh={18}>
          {complaint.number}
        </T>
        <View style={[styles.badge, positive ? styles.badgeGood : styles.badgeQuiet]}>
          <T size={11} weight={500} lh={15} color={positive ? colors.success : colors.textSecondary}>
            {withdrawn ? 'Withdrawn' : COMPLAINT_STATUS_LABELS[complaint.status]}
          </T>
        </View>
        <T size={11} lh={15} color={colors.textMuted} style={styles.date}>
          {formatComplaintDate(complaint.receivedAt)}
        </T>
      </View>
      <T size={13} lh={18} color={colors.textSecondary}>
        {[COMPLAINT_CATEGORY_LABELS[complaint.category], complaint.bookingRef ? `booking #${complaint.bookingRef}` : null, complaint.garageName].filter(Boolean).join(' · ')}
      </T>
      {complaint.source !== 'app' ? (
        <T size={12} lh={16} color={colors.textMuted}>
          {COMPLAINT_SOURCE_CUSTOMER_LINES[complaint.source]}
        </T>
      ) : null}
      <T size={13} lh={18}>
        {complaint.message}
      </T>
      {complaint.canWithdraw ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`Withdraw complaint ${complaint.number}`} onPress={() => setConfirming(true)} style={styles.withdraw}>
          <T size={12} weight={500} lh={16} color={colors.textSecondary} style={styles.underline}>
            Withdraw
          </T>
        </Pressable>
      ) : null}
      <ConfirmSheet
        open={confirming}
        onClose={() => {
          setConfirming(false);
          setError(undefined);
        }}
        onConfirm={async () => {
          try {
            await withdraw.mutateAsync(complaint.id);
            toast.success('Complaint withdrawn');
            setConfirming(false);
          } catch (err) {
            setError(errorText(err, 'Could not withdraw it'));
          }
        }}
        level="light"
        title={`Withdraw complaint ${complaint.number}?`}
        body="We'll close it without answering. You can raise a new one any time."
        confirmLabel="Withdraw complaint"
        cancelLabel="Keep it"
        busy={withdraw.isPending}
        error={error}
      />
      {answered && complaint.resolutionNote ? (
        <View style={styles.answer}>
          <T size={11} weight={500} lh={15} color={colors.textSecondary}>
            Our answer
          </T>
          <T size={13} lh={18}>
            {complaint.resolutionNote}
          </T>
        </View>
      ) : null}
    </ScCard>
  );
}

/** MyComplaints (apps/users/components/complaints/my-complaints.tsx). */
export function MyComplaints() {
  const colors = useColors();
  const styles = useStyles();
  const { data: complaints = [], isPending, isError, refetch } = useMyComplaints();
  const [raising, setRaising] = useState(false);
  return (
    <View style={styles.section}>
      <View style={styles.headRow}>
        <T size={14} weight={600} lh={20}>
          My complaints
        </T>
        <Pressable accessibilityRole="button" onPress={() => setRaising(true)} style={styles.raise}>
          <T size={12} weight={500} lh={16} style={styles.underline}>
            Raise a complaint
          </T>
        </Pressable>
      </View>
      {isPending ? (
        <ScCard>
          <T size={13} lh={18} color={colors.textSecondary}>
            Loading…
          </T>
        </ScCard>
      ) : isError && complaints.length === 0 ? (
        <ScCard style={styles.card}>
          <T size={13} lh={18} color={colors.textSecondary}>
            {"Couldn't load your complaints."}
          </T>
          <Pressable accessibilityRole="button" onPress={() => void refetch()} style={styles.withdraw}>
            <T size={13} weight={500} lh={18} style={styles.underline}>
              Try again
            </T>
          </Pressable>
        </ScCard>
      ) : complaints.length === 0 ? (
        <ScCard>
          <T size={13} lh={18} color={colors.textSecondary}>
            None so far. About a booking? Use Help with this booking on its page.
          </T>
        </ScCard>
      ) : (
        complaints.map((complaint) => <ComplaintRow key={complaint.id} complaint={complaint} />)
      )}
      <RaiseComplaintSheet open={raising} onClose={() => setRaising(false)} booking={null} />
    </View>
  );
}

const useStyles = createStyles((c) => ({
  section: { gap: 8 },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  raise: { minHeight: 44, justifyContent: 'center' },
  underline: { textDecorationLine: 'underline' },
  card: { gap: 6 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  date: { marginLeft: 'auto' },
  badge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  badgeGood: { backgroundColor: c.successMuted },
  badgeQuiet: { borderWidth: 1, borderColor: c.border },
  withdraw: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  answer: { marginTop: 4, gap: 2, borderRadius: 10, backgroundColor: c.fillChosen, padding: 12 },
}));
