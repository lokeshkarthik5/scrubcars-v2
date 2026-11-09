import type { GarageClaim } from '@repo/core/api/guarantee';
import { CLAIM_STATUS_LABELS, GUARANTEE_RULES } from '@repo/core/guarantee';
import { useNow } from '@repo/core/hooks/use-now';
import { formatStepTime } from '@repo/core/job-records';
import { router, useLocalSearchParams } from 'expo-router';
import { type ComponentRef, useRef, useState } from 'react';
import { type ScrollView, View } from 'react-native';

import { AppShell, garageScreen } from '@/components/app-shell';
import { ScButton } from '@repo/native-ui/button';
import { FocusFrame } from '@/components/focus-frame';
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
import { CLAIM_MISSING, itemIdParam, type ScopeLookup } from '@/lib/focus-item';
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
  disputeIntro,
  disputeNote,
  DISPUTED_TOAST,
  guaranteeIntro,
  NOT_SWITCHED_ON,
  OWNER_ONLY,
} from '@/lib/guarantee-view';
import { useItemFocus } from '@/lib/use-item-focus';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { useT } from '@repo/core/i18n';

/**
 * apps/vendors/app/guarantee/page.tsx: free redo claims (Detlio Guarantee, 0051), for the
 * owner seat. Each customer's photos of the problem beside the garage's own before and
 * after photos, what they say is wrong, and the clock. Accept and the customer picks a
 * free redo time within 7 days; Dispute, saying why, and Detlio decides. No answer in time
 * approves the redo, and a job with no before/after photos is approved at once.
 */
function GuaranteeClaimsScreen() {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  const isVendorAdmin = useIsVendorAdmin();
  const config = useGuaranteeConfig();
  const on = config.data?.enabled === true;
  const [scope, setScope] = useState<'open' | 'closed'>('open');
  const available = on && isVendorAdmin;
  const openClaims = useGarageClaimsInbox('open', available && scope === 'open');
  const closedClaims = useGarageClaimsInbox('closed', available && scope === 'closed');
  const claims = scope === 'open' ? openClaims : closedClaims;
  // Ticks the countdowns once a minute.
  const now = useNow(60_000);

  // A notification or link for one claim (/guarantee#claim-<id>): the scope that has it,
  // scrolled to and flashed. Once per id named.
  const params = useLocalSearchParams<{ claim?: string }>();
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const { onListLayout, frameProps } = useItemFocus({
    id: itemIdParam(params.claim),
    ready: available,
    open: lookupOf(openClaims),
    closed: lookupOf(closedClaims),
    refetch: () => {
      void openClaims.refetch();
      void closedClaims.refetch();
    },
    onScope: setScope,
    missing: CLAIM_MISSING,
    scrollRef: scroll,
  });

  return (
    <AppShell gap={16} scrollRef={scroll}>
      <TopBar
        title={t('Free redo claims')}
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/home'))}
      />
      {!isVendorAdmin ? (
        <T size={13} color={colors.textSecondary}>
          {t(OWNER_ONLY)}
        </T>
      ) : !config.isLoading && !on ? (
        <T size={13} color={colors.textSecondary}>
          {t(NOT_SWITCHED_ON)}
        </T>
      ) : (
        <>
          <T size={12} color={colors.textSecondary}>
            {guaranteeIntro()}
          </T>
          <ScSegmented
            accessibilityLabel={t('Which claims')}
            value={scope}
            onChange={setScope}
            options={[
              { value: 'open', label: t('Open') },
              { value: 'closed', label: t('Closed') },
            ]}
          />
          {claims.isLoading || config.isLoading ? (
            <SkeletonList count={2} height={220} />
          ) : claims.isError && !claims.data ? (
            <LoadError what={t('your claims')} onRetry={() => void claims.refetch()} retrying={claims.isFetching} />
          ) : (claims.data?.items.length ?? 0) === 0 ? (
            <EmptyState
              icon={<IconShieldCheck size={28} stroke={1.5} color={colors.textSecondary} />}
              title={scope === 'open' ? t('No open claims') : t('No closed claims')}
              subtitle={t('Claims customers make on your jobs show here.')}
            />
          ) : (
            <View style={styles.list} onLayout={onListLayout}>
              {claims.data!.items.map((claim) => (
                <FocusFrame key={claim.id} {...frameProps(claim.id)}>
                  <ClaimCard claim={claim} now={now} />
                </FocusFrame>
              ))}
            </View>
          )}
        </>
      )}
    </AppShell>
  );
}

/** One scope's list as lib/focus-item.ts reads it. */
function lookupOf(query: ReturnType<typeof useGarageClaimsInbox>): ScopeLookup {
  return {
    ids: query.data?.items.map((claim) => claim.id),
    updatedAt: query.dataUpdatedAt,
    failedAt: query.errorUpdatedAt,
  };
}

function ClaimCard({ claim, now }: { claim: GarageClaim; now: number }) {
  const t = useT();
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
      toast.success(t(ACCEPTED_TOAST));
    } catch (error) {
      toast.error(errorText(error, t(ACCEPT_FAILED)));
    }
  };

  const dispute = async () => {
    try {
      await answer.mutateAsync({ claimId: claim.id, answer: 'dispute', note: disputeNote(note) });
      setDisputing(false);
      toast.success(t(DISPUTED_TOAST));
    } catch (error) {
      toast.error(errorText(error, t(DISPUTE_FAILED)));
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
          <ScBadge variant={claim.canAnswer ? 'pending' : 'muted'}>{t(CLAIM_STATUS_LABELS[claim.status])}</ScBadge>
        </View>
      </View>

      <View>
        <T size={12} weight={500}>
          {claim.issues.map((issue) => t(issue.label)).join(', ')}
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
        garageTitle={t('Your before and after photos')}
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
              {t('Accept — free redo')}
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
                {t('Dispute')}
              </ScButton>
            ) : null}
          </View>
        </View>
      ) : null}

      <ScSheet
        open={disputing}
        onClose={() => setDisputing(false)}
        dismissible={!answer.isPending}
        accessibilityLabel={t('Dispute this claim')}
        horizontalPadding={16}
      >
        <View style={styles.dispute}>
          <T accessibilityRole="header" size={15} weight={600}>
            {t('Dispute this claim')}
          </T>
          <T size={12} color={colors.textSecondary}>
            {disputeIntro()}
          </T>
          <ScTextarea
            label={t('Why')}
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
              {t('Back')}
            </ScButton>
            <ScButton
              variant="main"
              size="lg"
              fullWidth={false}
              style={styles.flex}
              onPress={() => void dispute()}
              disabled={!canSendDispute(note) || answer.isPending}
            >
              {t('Send to Detlio')}
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
