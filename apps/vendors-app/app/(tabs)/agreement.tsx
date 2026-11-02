import { AGREEMENT_TICK } from '@repo/core/agreements';
import { acceptAgreement } from '@repo/core/api/agreements';
import { ApiError } from '@repo/core/api/client';
import { dateKeyLabel } from '@repo/core/certification';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppShell, garageScreen } from '@/components/app-shell';
import { ScButton } from '@/components/button';
import { IconCheck, IconCircleCheck } from '@/components/icons';
import { IconExternalLink, IconFileText } from '@/components/owner-icons';
import { Notice, ScCard, SkeletonList } from '@/components/primitives';
import { TopBar } from '@/components/rows';
import { T } from '@/components/text';
import { toast } from '@/components/toast';
import {
  acceptedLine,
  AGREEMENT_ACCEPT_FAILED,
  AGREEMENT_LOAD_FAILED,
  AGREEMENT_NONE_BODY,
  AGREEMENT_NONE_TITLE,
  AGREEMENT_RECORD_NOTE,
  graceLine,
  publishedLine,
  tickDetail,
  tickKeyFor,
} from '@/lib/agreement-view';
import { useAuth, useIsVendorAdmin } from '@/lib/auth';
import { errorText } from '@/lib/error-text';
import { useGarageAgreement } from '@/lib/garage-api';
import { colors } from '@/lib/theme';
import { useRefreshOnFocus } from '@/lib/use-refresh-on-focus';

// The web's back arrow goes to /settings; in the tab bar `back` would land on Home instead.
const goBack = () => router.navigate('/settings');

const readPdf = (url: string) =>
  WebBrowser.openBrowserAsync(url).catch(() => toast.error('Couldn’t open the agreement.'));

/**
 * apps/vendors/app/agreement/page.tsx: the Detlio garage agreement, click to agree (0063):
 * the latest version Detlio published, "Read (PDF)", the tick "I agree to the terms" and
 * Confirm. Accepting earns Bronze; a new version asks again (Home's banner says so) and the
 * garage keeps Bronze for 30 days meanwhile. The owner seat only; a Detlio support session
 * can read it but never accept it for the garage.
 */
function AgreementScreen() {
  const isVendorAdmin = useIsVendorAdmin();
  const vendorId = useAuth((s) => s.activeVendorId) ?? undefined;
  const { data, isError, refetch } = useGarageAgreement(vendorId, isVendorAdmin);
  const queryClient = useQueryClient();
  // The tab stays mounted: a version Detlio published meanwhile shows when it is opened again.
  useRefreshOnFocus(['agreement', 'garage', vendorId]);
  // The tick is for one version of one garage's agreement: a new version starts unticked.
  const [tickedFor, setTickedFor] = useState<string | null>(null);

  // The gate sends an operator home already; this is the web's own redirect.
  useEffect(() => {
    if (!isVendorAdmin) router.replace('/home');
  }, [isVendorAdmin]);

  // Accepting answers with the agreement as it now stands; Home's banner and the tier card
  // are refreshed too (core's useAcceptAgreement).
  const accept = useMutation({
    mutationFn: (version: number) => acceptAgreement(version),
    onSuccess: (next) => queryClient.setQueryData(['agreement', 'garage', vendorId], next),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['agreement', 'garage', vendorId] });
      void queryClient.invalidateQueries({ queryKey: ['tier', 'garage', vendorId] });
    },
  });

  const latest = data?.latest ?? null;
  const tickKey = tickKeyFor(vendorId, latest?.version);
  const agreed = tickKey !== null && tickedFor === tickKey;

  const confirm = () => {
    if (!latest || !agreed) return;
    accept.mutate(latest.version, {
      onSuccess: () => toast.success(`You accepted ${latest.title}.`),
      onError: (error) => {
        if (error instanceof ApiError && error.code === 'AGREEMENT_VERSION_CHANGED') void refetch();
        toast.error(errorText(error, AGREEMENT_ACCEPT_FAILED));
      },
    });
  };

  return (
    <AppShell>
      <TopBar title="Garage agreement" onBack={goBack} />

      {isError ? (
        <View accessibilityRole="alert" style={styles.error}>
          <T size={13} color={colors.error}>
            {AGREEMENT_LOAD_FAILED}
          </T>
          <ScButton variant="outline" size="md" fullWidth={false} onPress={() => void refetch()} paddingX={16}>
            Try again
          </ScButton>
        </View>
      ) : !data ? (
        <SkeletonList count={2} height={128} />
      ) : !latest ? (
        <Notice tone="neutral" title={AGREEMENT_NONE_TITLE}>
          {AGREEMENT_NONE_BODY}
        </Notice>
      ) : (
        <>
          <ScCard style={styles.card}>
            <View style={styles.head}>
              <View style={styles.fileIcon}>
                <IconFileText size={22} color={colors.textSecondary} />
              </View>
              <View style={styles.flex}>
                <T accessibilityRole="header" size={16} weight={600}>
                  {latest.title}
                </T>
                <T size={12} color={colors.textSecondary}>
                  {publishedLine(latest.publishedAt, latest.note)}
                </T>
              </View>
            </View>
            {/* The web's link opens the PDF in a new tab; here it opens in the in-app browser. */}
            <Pressable
              accessibilityRole="link"
              accessibilityLabel="Read (PDF)"
              onPress={() => void readPdf(latest.url)}
              style={({ pressed }) => [styles.read, pressed && { backgroundColor: colors.surfaceElevated }]}
            >
              <T size={14} weight={500}>
                Read (PDF)
              </T>
              <IconExternalLink size={16} />
            </Pressable>
          </ScCard>

          {data.accepted ? (
            <Notice tone="neutral" title={`You accepted v${latest.version}`}>
              {acceptedLine(data.accepted.at, data.accepted.by)}
            </Notice>
          ) : (
            <ScCard style={styles.card}>
              {data.standing.status === 'grace' && data.standing.acceptBy ? (
                <View style={styles.grace}>
                  <T size={12} color={colors.warning}>
                    {graceLine(latest.version, dateKeyLabel(data.standing.acceptBy))}
                  </T>
                </View>
              ) : null}
              <Pressable
                accessibilityRole="checkbox"
                accessibilityLabel={AGREEMENT_TICK}
                accessibilityState={{ checked: agreed }}
                onPress={() => setTickedFor(agreed ? null : tickKey)}
                style={styles.tick}
              >
                <View style={[styles.box, agreed && styles.boxOn]}>
                  {agreed ? <IconCheck size={14} stroke={2.5} color={colors.white} /> : null}
                </View>
                <View style={styles.flex}>
                  <T size={14}>{AGREEMENT_TICK}</T>
                  <T size={12} color={colors.textSecondary}>
                    {tickDetail(latest.title)}
                  </T>
                </View>
              </Pressable>
              <ScButton
                onPress={confirm}
                disabled={!agreed || accept.isPending}
                disabledReason={agreed ? undefined : `Tick “${AGREEMENT_TICK}” first`}
              >
                {accept.isPending ? 'Confirming…' : 'Confirm'}
              </ScButton>
            </ScCard>
          )}

          {data.accepted ? (
            <View style={styles.record}>
              <IconCircleCheck size={14} color={colors.success} />
              <T size={12} color={colors.textMuted} style={styles.flex}>
                {AGREEMENT_RECORD_NOTE}
              </T>
            </View>
          ) : null}
        </>
      )}
    </AppShell>
  );
}

export default garageScreen(AgreementScreen);

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  error: { alignItems: 'flex-start', gap: 8 },
  card: { gap: 12 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  fileIcon: { marginTop: 2 },
  read: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  grace: { borderRadius: 10, backgroundColor: colors.warningMuted, paddingHorizontal: 12, paddingVertical: 8 },
  tick: { minHeight: 44, flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  box: {
    marginTop: 1,
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // The web's raw checkbox takes the brand red as its accent (accent-[var(--color-brand-red)]).
  boxOn: { backgroundColor: colors.brandRedFill, borderColor: colors.brandRedFill },
  record: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4 },
});
