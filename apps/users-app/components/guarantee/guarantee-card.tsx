import { useBookingGuarantee, useGuaranteeConfig, useWithdrawClaim } from '@repo/core/api/hooks/use-guarantee';
import { GUARANTEE_BUTTON, GUARANTEE_NAME } from '@repo/core/guarantee';
import { formatStepTime } from '@repo/core/job-records';
import type { Booking } from '@repo/core/types';
import { ScButton } from '@repo/native-ui/button';
import { IconChevronRight, IconShieldCheck } from '@repo/native-ui/icons';
import { ScCard } from '@repo/native-ui/primitives';
import { ConfirmSheet } from '@repo/native-ui/sheet';
import { Figures, T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { toast } from '@repo/native-ui/toast';
import { type Href, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { errorText } from '@/lib/error-text';

/** GuaranteeCard (apps/users/components/guarantee/guarantee-card.tsx). */
export function GuaranteeCard({ booking }: { booking: Booking }) {
  const colors = useColors();
  const styles = useStyles();
  const config = useGuaranteeConfig();
  const on = config.data?.enabled === true;
  const completed = booking.status === 'completed';
  const guarantee = useBookingGuarantee(booking.id, on && completed && !booking.guaranteeRedo);
  const withdraw = useWithdrawClaim(booking.id);
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawError, setWithdrawError] = useState<string | undefined>();
  if (!on) return null;
  if (booking.guaranteeRedo) {
    return (
      <ScCard style={styles.row}>
        <IconShieldCheck size={20} color={colors.textPrimary} />
        <View style={styles.grow}>
          <T size={14} weight={600} lh={20}>
            {`Free redo · ${GUARANTEE_NAME}`}
          </T>
          <T size={12} lh={16} color={colors.textSecondary} style={styles.mt2}>
            This booking redoes an earlier job at no charge. There is nothing to pay and no receipt for it.
          </T>
        </View>
      </ScCard>
    );
  }
  const data = guarantee.data;
  if (!completed || !data) return null;
  const claimPath = `/bookings/${booking.id}/guarantee` as Href;
  if (data.claim) {
    const claim = data.claim;
    return (
      <ScCard style={styles.card}>
        <View style={styles.row}>
          <IconShieldCheck size={20} color={colors.textPrimary} />
          <View style={styles.grow}>
            <T size={11} weight={500} lh={15} color={colors.textSecondary}>
              {GUARANTEE_NAME}
            </T>
            <T size={15} weight={500} lh={20}>
              {claim.title}
            </T>
            {claim.body ? (
              <T size={13} lh={18} color={colors.textSecondary} style={styles.mt2}>
                {claim.body}
              </T>
            ) : null}
          </View>
        </View>
        {claim.canBookRedo ? (
          <ScButton variant="main" onPress={() => router.push(claimPath)}>
            Pick a time for your free redo
          </ScButton>
        ) : null}
        {claim.redoBooking ? (
          <Pressable accessibilityRole="link" onPress={() => router.push(`/bookings/${claim.redoBooking!.id}` as Href)} style={styles.link}>
            <T size={13} lh={18} style={styles.grow}>
              <Figures size={13} text={`Free redo · ${formatStepTime(claim.redoBooking.scheduledAt)}`} />
            </T>
            <IconChevronRight size={16} color={colors.textMuted} />
          </Pressable>
        ) : null}
        {!claim.canBookRedo ? (
          <Pressable accessibilityRole="link" onPress={() => router.push(claimPath)} style={styles.link}>
            <T size={13} weight={500} lh={18} style={styles.underline}>
              See your claim
            </T>
          </Pressable>
        ) : null}
        {claim.canWithdraw ? (
          <Pressable accessibilityRole="button" onPress={() => setWithdrawing(true)} style={styles.link}>
            <T size={12} weight={500} lh={16} color={colors.textSecondary} style={styles.underline}>
              Withdraw claim
            </T>
          </Pressable>
        ) : null}
        <ConfirmSheet
          open={withdrawing}
          onClose={() => {
            setWithdrawing(false);
            setWithdrawError(undefined);
          }}
          onConfirm={async () => {
            try {
              await withdraw.mutateAsync(claim.id);
              toast.success('Claim withdrawn');
              setWithdrawing(false);
            } catch (err) {
              setWithdrawError(errorText(err, 'Could not withdraw the claim'));
            }
          }}
          level="light"
          title="Withdraw your free redo claim?"
          body="We'll close it and no redo is arranged. A booking takes one claim, so you can't claim on it again."
          confirmLabel="Withdraw claim"
          cancelLabel="Keep it"
          busy={withdraw.isPending}
          error={withdrawError}
        />
      </ScCard>
    );
  }
  if (!data.canClaim) return null;
  return (
    <ScCard style={styles.card}>
      <ScButton variant="outline" onPress={() => router.push(claimPath)}>
        {GUARANTEE_BUTTON}
      </ScButton>
      {data.claimBy ? (
        <T size={12} lh={16} color={colors.textSecondary} align="center">
          <Figures size={12} color={colors.textSecondary} text={`Ask with photos of the problem by ${formatStepTime(data.claimBy)}.`} />
        </T>
      ) : null}
    </ScCard>
  );
}

const useStyles = createStyles(() => ({
  card: { gap: 12 },
  row: { flexDirection: 'row', gap: 12 },
  grow: { flex: 1, minWidth: 0 },
  mt2: { marginTop: 2 },
  link: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 },
  underline: { textDecorationLine: 'underline' },
}));
