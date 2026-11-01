import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ProgressBar } from '@/components/form-controls';
import { IconArrowLeft, IconLogout } from '@repo/native-ui/icons';
import { T } from '@repo/native-ui/text';
import { useAuth } from '@/lib/auth';
import { type OnboardingDraft, type OnboardingStep, progressFor } from '@/lib/onboarding-logic';
import { writeDraft } from '@/lib/onboarding-draft';
import { colors } from '@/lib/theme';

/**
 * "Sign out" on the first sign-up step (0066). A login with no garage lands here and had no
 * way out: the wrong number, a staff login whose garage removed it, or someone who only wanted
 * to look. Signing out empties the draft too (lib/onboarding-draft.ts).
 */
export function OnboardingSignOut() {
  const [busy, setBusy] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Sign out"
      disabled={busy}
      onPress={() => {
        setBusy(true);
        void useAuth
          .getState()
          .signOut()
          .finally(() => setBusy(false));
      }}
      style={[styles.signOut, busy && { opacity: 0.5 }]}
    >
      <IconLogout size={18} color={colors.textSecondary} />
      <T size={14} weight={500} lh={20} color={colors.textSecondary}>
        Sign out
      </T>
    </Pressable>
  );
}

/**
 * The top of each sign-up step (apps/vendors/components/onboarding-header.tsx): back to the
 * step before (or Sign out on the first), how far along, and what this step is about.
 */
export function OnboardingHeader({
  step,
  title,
  subtitle,
  onBack,
}: {
  step: OnboardingStep;
  title: string;
  subtitle?: string;
  /** The step before. Absent on step 1. */
  onBack?: () => void;
}) {
  return (
    <View style={styles.header}>
      {onBack ? (
        <View style={styles.topBar}>
          <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={onBack} style={styles.back}>
            <IconArrowLeft size={22} stroke={1.5} />
          </Pressable>
        </View>
      ) : (
        <View style={styles.signOutRow}>
          <OnboardingSignOut />
        </View>
      )}
      <ProgressBar progress={progressFor(step)} />
      <View>
        <T size={11} weight={500} color={colors.textSecondary}>
          Step{' '}
          <T size={11} weight={500} num color={colors.textSecondary}>
            {step}
          </T>{' '}
          of{' '}
          <T size={11} weight={500} num color={colors.textSecondary}>
            4
          </T>
        </T>
        <T accessibilityRole="header" size={20} weight={600} lh={28} tracking={-0.025} style={styles.title}>
          {title}
        </T>
        {subtitle ? (
          <T size={13} color={colors.textSecondary} style={styles.subtitle}>
            {subtitle}
          </T>
        ) : null}
      </View>
    </View>
  );
}

/** SectionHeader with its one-line subtitle (packages/ui/src/sc/section-header.tsx). */
export function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View>
      <T accessibilityRole="header" size={15} weight={600}>
        {title}
      </T>
      {subtitle ? (
        <T size={12} color={colors.textSecondary} style={styles.sectionSubtitle}>
          {subtitle}
        </T>
      ) : null}
    </View>
  );
}

/** A small label over a group of chips: the web's 11px medium secondary line. */
export function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <T size={11} weight={500} color={colors.textSecondary}>
      {children}
    </T>
  );
}

/**
 * Keeps the draft up to date while a step is being filled in, a moment after the last change
 * and once more when the step closes, so a killed app resumes. Typing does not write on every key.
 */
export function useDraftSync(values: Partial<OnboardingDraft>) {
  const latest = useRef(values);
  latest.current = values;
  const key = JSON.stringify(values);
  useEffect(() => {
    const timer = setTimeout(() => writeDraft(latest.current), 400);
    return () => clearTimeout(timer);
  }, [key]);
  useEffect(() => () => writeDraft(latest.current), []);
}

const styles = StyleSheet.create({
  header: { gap: 16 },
  topBar: { minHeight: 44, flexDirection: 'row', alignItems: 'center' },
  back: { width: 44, height: 44, marginLeft: -11, marginRight: -11, alignItems: 'center', justifyContent: 'center' },
  signOutRow: { flexDirection: 'row', justifyContent: 'flex-end' },
  signOut: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4 },
  title: { marginTop: 4 },
  subtitle: { marginTop: 4 },
  sectionSubtitle: { marginTop: 2 },
});
