import type { GarageClaim } from '@repo/core/api/guarantee';
import { CLAIM_STATUS_LABELS, GUARANTEE_RULES } from '@repo/core/guarantee';
import { useNow } from '@repo/core/hooks/use-now';
import { formatStepTime } from '@repo/core/job-records';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { AppShell, garageScreen } from '@/components/app-shell';
import { ScButton } from '@repo/native-ui/button';
import { ScBadge } from '@/components/form-controls';
import { GuaranteeEvidence } from '@/components/guarantee-evidence';
import { IconShieldCheck } from '@repo/native-ui/icons';
import { ScTextarea } from '@repo/native-ui/inputs';
import { EmptyState, LoadError, ScCard, ScSegmented, SkeletonList } from '@repo/native-ui/primitives';
import { TopBar } from '@/components/rows';
import { ScSheet } from '@repo/native-ui/sheet';
import { T } from '@repo/native-ui/text';
import { toast } from '@repo/native-ui/toast';
import { useIsVendorAdmin } from '@/lib/auth';
import { errorText } from '@/lib/error-text';
import { useGuaranteeConfig } from '@/lib/garage-api';
import { useAnswerClaim, useGarageClaimsInbox } from '@/lib/guarantee-api';
import {
  ACCEPT_FAILED,
  ACCEPTED_TOAST,
  answerByLine,
  canSendDispute,
  claimNotes,
  claimSubtitle,
  claimTitle,
  DISPUTE_FAILED,
  DISPUTE_INTRO,
  disputeNote,
  DISPUTED_TOAST,
  GUARANTEE_INTRO,
  NOT_SWITCHED_ON,
  OWNER_ONLY,
} from '@/lib/guarantee-view';
import { createStyles, useColors } from '@repo/native-ui/theme';

/**
 * apps/vendors/app/guarantee/page.tsx: free redo claims (Detlio Guarantee, 0051), for the
 * owner seat. Each customer's photos of the problem beside the garage's own before and
 * after photos, what they say is wrong, and the clock. Accept and the customer picks a
 * free redo time within 7 days; Dispute, saying why, and Detlio decides. No answer in time
 * approves the redo, and a job with no before/after photos is approved at once.
 */
function GuaranteeClaimsScreen() {
  const colors = useColors();
  const styles = useStyles();
  const isVendorAdmin = useIsVendorAdmin();
  const config = useGuaranteeConfig();
  const on = config.data?.enabled === true;
  const [scope, setScope] = useState<'open' | 'closed'>('open');
  const claims = useGarageClaimsInbox(scope, on && isVendorAdmin);
  // Ticks the countdowns once a minute.
  const now = useNow(60_000);

  return (
    <AppShell gap={16}>
      <TopBar
        title="Free redo claims"
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/home'))}
      />
      {!isVendorAdmin ? (
        <T size={13} color={colors.textSecondary}>
          {OWNER_ONLY}
        </T>
      ) : !config.isLoading && !on ? (
        <T size={13} color={colors.textSecondary}>
          {NOT_SWITCHED_ON}
        </T>
      ) : (
        <>
          <T size={12} color={colors.textSecondary}>
            {GUARANTEE_INTRO}
          </T>
          <ScSegmented
            accessibilityLabel="Which claims"
            value={scope}
            onChange={setScope}
            options={[
              { value: 'open', label: 'Open' },
              { value: 'closed', label: 'Closed' },
            ]}
          />
          {claims.isLoading || config.isLoading ? (
            <SkeletonList count={2} height={220} />
          ) : claims.isError && !claims.data ? (
            <LoadError what="your claims" onRetry={() => void claims.refetch()} retrying={claims.isFetching} />
          ) : (claims.data?.items.length ?? 0) === 0 ? (
            <EmptyState
              icon={<IconShieldCheck size={28} stroke={1.5} color={colors.textSecondary} />}
              title={scope === 'open' ? 'No open claims' : 'No closed claims'}
              subtitle="Claims customers make on your jobs show here."
            />
          ) : (
            <View style={styles.list}>
              {claims.data!.items.map((claim) => (
                <ClaimCard key={claim.id} claim={claim} now={now} />
              ))}
            </View>
          )}
        </>
      )}
    </AppShell>
  );
}

function ClaimCard({ claim, now }: { claim: GarageClaim; now: number }) {
  const colors = useColors();
  const styles = useStyles();
  const answer = useAnswerClaim();
  const [disputing, setDisputing] = useState(false);
  const [note, setNote] = useState('');
  const time = (iso: string) => formatStepTime(iso, now);
  const answerBy = answerByLine(claim, now, time);
  const notes = claimNotes(claim, time);

  const accept = async () => {
    try {
      await answer.mutateAsync({ claimId: claim.id, answer: 'accept' });
      toast.success(ACCEPTED_TOAST);
    } catch (error) {
      toast.error(errorText(error, ACCEPT_FAILED));
    }
  };

  const dispute = async () => {
    try {
      await answer.mutateAsync({ claimId: claim.id, answer: 'dispute', note: disputeNote(note) });
      setDisputing(false);
      toast.success(DISPUTED_TOAST);
    } catch (error) {
      toast.error(errorText(error, DISPUTE_FAILED));
    }
  };

  return (
    <ScCard style={styles.card}>
      <View style={styles.head}>
        <View style={styles.flex}>
          <T size={13} weight={600}>
            {claimTitle(claim)}
          </T>
          <T size={12} color={colors.textSecondary}>
            {claimSubtitle(claim, time)}
          </T>
        </View>
        {/* shrink-0 on the web; a long status ("Redo approved — customer to pick a time") wraps here. */}
        <View style={styles.badge}>
          <ScBadge variant={claim.canAnswer ? 'pending' : 'muted'}>{CLAIM_STATUS_LABELS[claim.status]}</ScBadge>
        </View>
      </View>

      <View>
        <T size={12} weight={500}>
          {claim.issues.map((issue) => issue.label).join(', ')}
        </T>
        {claim.otherText ? (
          <T size={12} color={colors.textSecondary} style={styles.other}>
            {`“${claim.otherText}”`}
          </T>
        ) : null}
      </View>

      <GuaranteeEvidence
        customerPhotos={claim.customerPhotos}
        garagePhotos={claim.garagePhotos}
        garageTitle="Your before and after photos"
      />

      {notes.map((line) => (
        <T key={line.text} size={12} color={line.primary ? colors.textPrimary : colors.textSecondary}>
          {line.text}
        </T>
      ))}

      {claim.canAnswer ? (
        <View style={styles.answer}>
          {answerBy ? (
            <T size={12} weight={500} color={colors.warning}>
              {answerBy}
            </T>
          ) : null}
          <View style={styles.actions}>
            <ScButton
              variant="main"
              size="lg"
              fullWidth={false}
              style={styles.flex}
              onPress={() => void accept()}
              disabled={answer.isPending}
            >
              Accept — free redo
            </ScButton>
            {claim.canDispute ? (
              <ScButton
                variant="outline"
                size="md"
                fullWidth={false}
                style={styles.flex}
                onPress={() => setDisputing(true)}
                disabled={answer.isPending}
              >
                Dispute
              </ScButton>
            ) : null}
          </View>
        </View>
      ) : null}

      <ScSheet
        open={disputing}
        onClose={() => setDisputing(false)}
        dismissible={!answer.isPending}
        accessibilityLabel="Dispute this claim"
        horizontalPadding={16}
      >
        <View style={styles.dispute}>
          <T accessibilityRole="header" size={15} weight={600}>
            Dispute this claim
          </T>
          <T size={12} color={colors.textSecondary}>
            {DISPUTE_INTRO}
          </T>
          <ScTextarea
            label="Why"
            rows={4}
            maxLength={GUARANTEE_RULES.garageNoteMax}
            value={note}
            onChangeText={setNote}
          />
          <View style={styles.actions}>
            <ScButton
              variant="outline"
              size="md"
              fullWidth={false}
              style={styles.flex}
              onPress={() => setDisputing(false)}
              disabled={answer.isPending}
            >
              Back
            </ScButton>
            <ScButton
              variant="main"
              size="lg"
              fullWidth={false}
              style={styles.flex}
              onPress={() => void dispute()}
              disabled={!canSendDispute(note) || answer.isPending}
            >
              Send to Detlio
            </ScButton>
          </View>
        </View>
      </ScSheet>
    </ScCard>
  );
}

export default garageScreen(GuaranteeClaimsScreen);

const useStyles = createStyles((colors) => ({
  flex: { flex: 1, minWidth: 0 },
  list: { gap: 12 },
  card: { gap: 12 },
  head: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  badge: { flexShrink: 0, maxWidth: '55%' },
  other: { marginTop: 2 },
  answer: { gap: 8 },
  actions: { flexDirection: 'row', gap: 8 },
  dispute: { gap: 12, paddingTop: 4 },
}));
