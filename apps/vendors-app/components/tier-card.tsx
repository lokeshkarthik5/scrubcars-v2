import type { TierStep } from '@repo/core/api/tiers';
import { dateKeyLabel } from '@repo/core/certification';
import { TIER_GARAGE_LINES, TIER_LABELS, TIER_STEP_LINKS, type Tier } from '@repo/core/tiers';
import { type Href, router } from 'expo-router';
import { Fragment, useId } from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';

import { useGarageTier } from '@/lib/garage-api';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { useRefreshOnFocus } from '@/lib/use-refresh-on-focus';

import { IconChevronRight, IconCircleCheck, IconCircleDashed } from '@repo/native-ui/icons';
import { ScCard } from '@repo/native-ui/primitives';
import { T } from '@repo/native-ui/text';
import { fill, useT } from '@repo/core/i18n';

const METALS: Record<Tier, { light: string; dark: string; ribbon: string }> = {
  bronze: { light: '#E0A672', dark: '#8A5528', ribbon: '#6B4424' },
  silver: { light: '#EEF1F4', dark: '#8B939C', ribbon: '#5B636C' },
  gold: { light: '#F6DB8A', dark: '#B0802A', ribbon: '#7D5A1C' },
};

/** TierMedalIcon (packages/ui/src/features/tier-medal.tsx): the same drawing. */
export function TierMedalIcon({ tier, size = 16, grey }: { tier: Tier; size?: number; grey?: boolean }) {
  const id = `m${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const metal = grey ? { light: '#BDBDBD', dark: '#6F6F6F', ribbon: '#555555' } : METALS[tier];
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16">
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={metal.light} />
          <Stop offset="1" stopColor={metal.dark} />
        </LinearGradient>
      </Defs>
      <Path d="M4.2 0.8h2.6l1.6 4.2-2.3 1.1z" fill={metal.ribbon} />
      <Path d="M11.8 0.8H9.2L7.6 5l2.3 1.1z" fill={metal.ribbon} opacity={0.85} />
      <Circle cx="8" cy="10.2" r="5.2" fill={`url(#${id})`} />
      <Circle cx="8" cy="10.2" r="3.4" fill="none" stroke="#000" strokeOpacity={0.22} strokeWidth={0.9} />
    </Svg>
  );
}

function Eyebrow({ children }: { children: string }) {
  const colors = useColors();
  return (
    <T size={11} weight={600} tracking={0.07} uppercase color={colors.textMuted}>
      {children}
    </T>
  );
}

function StepList({ steps, label }: { steps: TierStep[]; label: string }) {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  return (
    <View accessibilityLabel={label} style={styles.steps}>
      <Eyebrow>{label}</Eyebrow>
      <View>
        {steps.map((step, index) => {
          const link = !step.met && step.action ? TIER_STEP_LINKS[step.action] : null;
          return (
            <View
              key={step.key}
              style={[
                styles.step,
                index === 0 && styles.stepFirst,
                index === steps.length - 1 && styles.stepLast,
                index > 0 && styles.stepDivider,
              ]}
            >
              <View style={styles.stepIcon}>
                {step.met ? (
                  <IconCircleCheck size={18} color={colors.success} />
                ) : (
                  <IconCircleDashed size={18} color={colors.textMuted} />
                )}
              </View>
              <View style={styles.flex}>
                <T size={13} weight={500}>
                  {step.label}
                </T>
                <T size={12} color={colors.textSecondary}>
                  {step.value}
                  {!step.met ? <T size={12} color={colors.textMuted}>{` · ${t('Needs: {target}', { target: step.target })}`}</T> : null}
                </T>
              </View>
              {link ? (
                <Pressable
                  accessibilityRole="link"
                  hitSlop={12}
                  onPress={() => router.push(link.href as Href)}
                  style={styles.stepLink}
                >
                  <T size={12} weight={500} style={styles.underline}>
                    {t(link.label)}
                  </T>
                  <IconChevronRight size={14} />
                </Pressable>
              ) : null}
            </View>
          );
        })}
      </View>
    </View>
  );
}

/** TierCard: the garage's medal and what the next one takes; nothing until loaded or on failure. */
export function TierCard({ vendorId }: { vendorId: string | undefined }) {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  const { data } = useGarageTier(vendorId);
  useRefreshOnFocus(['tier', 'garage', vendorId]);
  if (!data) return null;

  const next = data.next;
  const keep = data.keep ?? [];
  const percent = next && next.total > 0 ? Math.round((next.done / next.total) * 100) : 100;

  return (
    <ScCard accessibilityLabel={t('Your tier')} style={styles.card}>
      <View style={styles.head}>
        <View style={[styles.medal, !data.tier && styles.medalNone]}>
          <TierMedalIcon tier={data.tier ?? 'bronze'} size={26} grey={!data.tier} />
        </View>
        <View style={styles.flex}>
          <Eyebrow>{t('Your tier')}</Eyebrow>
          <T size={16} weight={600}>
            {data.tier ? t("You're {tier}", { tier: t(TIER_LABELS[data.tier]) }) : t('No tier yet')}
          </T>
          <T size={12} color={colors.textSecondary}>
            {next ? (
              <Fragment>
                {fill(t('Next: {tier}, {done} of {total} done', { tier: t(TIER_LABELS[next.tier]) }), {
                  done: (
                    <T num size={12} color={colors.textSecondary}>
                      {next.done}
                    </T>
                  ),
                  total: (
                    <T num size={12} color={colors.textSecondary}>
                      {next.total}
                    </T>
                  ),
                })}
              </Fragment>
            ) : (
              t('That’s the top tier. Keep meeting the standards to keep it.')
            )}
          </T>
        </View>
      </View>

      {next ? (
        <View
          accessibilityRole="progressbar"
          accessibilityLabel={t('Progress to {tier}', { tier: t(TIER_LABELS[next.tier]) })}
          accessibilityValue={{ min: 0, max: next.total, now: next.done }}
          style={styles.track}
        >
          <View style={[styles.fill, { width: `${percent}%` }]} />
        </View>
      ) : null}

      {data.atRisk ? (
        <View style={styles.risk}>
          <T size={12} color={colors.warning}>
            {fill(
              t('You don’t meet every {tier} standard right now. Put it right by {date} to keep {tier}.', {
                tier: t(TIER_LABELS[data.atRisk.tier]),
              }),
              {
                date: (
                  <T num size={12} color={colors.warning}>
                    {dateKeyLabel(data.atRisk.keepsUntil)}
                  </T>
                ),
              }
            )}
          </T>
        </View>
      ) : null}

      {keep.length > 0 && data.tier ? <StepList steps={keep} label={t('To keep {tier}', { tier: t(TIER_LABELS[data.tier]) })} /> : null}
      {next ? <StepList steps={next.steps} label={t('Steps to {tier}', { tier: t(TIER_LABELS[next.tier]) })} /> : null}

      {next?.tier === 'gold' ? (
        <T size={12} color={colors.textMuted}>
          {t('When every step is done, Detlio visits in person and awards Gold.')}
        </T>
      ) : null}
      {data.tier ? (
        <T size={12} color={colors.textMuted}>
          {t(TIER_GARAGE_LINES[data.tier])}
        </T>
      ) : null}
    </ScCard>
  );
}

const useStyles = createStyles((colors) => ({
  flex: { flex: 1, minWidth: 0 },
  card: { gap: 12 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  medal: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  medalNone: { opacity: 0.6 },
  track: { height: 6, borderRadius: 999, overflow: 'hidden', backgroundColor: colors.surfaceElevated },
  fill: { height: '100%', borderRadius: 999, backgroundColor: colors.textPrimary },
  risk: { borderRadius: 10, backgroundColor: colors.warningMuted, paddingHorizontal: 12, paddingVertical: 8 },
  steps: { gap: 6 },
  step: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 10 },
  stepFirst: { paddingTop: 0 },
  stepLast: { paddingBottom: 0 },
  stepDivider: { borderTopWidth: 1, borderTopColor: colors.line },
  stepIcon: { marginTop: 1 },
  stepLink: { flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'center' },
  underline: { textDecorationLine: 'underline' },
}));
