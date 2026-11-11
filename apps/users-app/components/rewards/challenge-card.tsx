import type { CustomerChallenge } from '@repo/core/api/reward-extras';
import { useT } from '@repo/core/i18n';
import { challengeWinsLine } from '@repo/core/rewards';
import { IconCheck, IconTrophy } from '@repo/native-ui/icons';
import { PressRow } from '@repo/native-ui/primitives';
import { FigureLine, T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { type Href, router } from 'expo-router';
import { View } from 'react-native';

/** The challenge's bar: silver, never red; full once won. */
export function ChallengeBar({ count, goal, won }: { count: number; goal: number; won: boolean }) {
  const colors = useColors();
  const percent = won ? 100 : Math.round((Math.min(count, goal) / Math.max(1, goal)) * 100);
  return (
    <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: goal, now: Math.min(count, goal) }} style={{ height: 4, borderRadius: 2, overflow: 'hidden', backgroundColor: colors.fillSoft }}>
      <View style={{ height: '100%', borderRadius: 2, backgroundColor: colors.meterOn, width: `${Math.max(won ? 100 : 4, percent)}%` }} />
    </View>
  );
}

/** ChallengeCard. */
export function ChallengeCard({ challenge, highlight = false }: { challenge: CustomerChallenge; highlight?: boolean }) {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  return (
    <View style={[styles.card, highlight && styles.highlight, challenge.daysLeft === 0 && !challenge.won && styles.dim]}>
      <View style={styles.top}>
        <View style={styles.shrink}>
          <T size={15} weight={600} lh={20}>
            {challenge.title}
          </T>
          <FigureLine size={12} lh={16} color={colors.textSecondary} text={challengeWinsLine(challenge)} />
        </View>
        <View style={[styles.mark, challenge.won && styles.markWon]}>
          {challenge.won ? <IconCheck size={16} stroke={2.5} color={colors.canvas} /> : <IconTrophy size={16} stroke={1.6} color={colors.textSecondary} />}
        </View>
      </View>
      {challenge.description ? (
        <T size={12} lh={16} color={colors.textMuted}>
          {challenge.description}
        </T>
      ) : null}
      <ChallengeBar count={challenge.count} goal={challenge.goal} won={challenge.won} />
      <FigureLine size={12} lh={16} color={challenge.won ? colors.textPrimary : colors.textSecondary} text={challenge.won ? t('You won: {reward}', { reward: challenge.reward }) : challenge.line} />
    </View>
  );
}

/** ChallengeLine: Home's line, under the rewards line. */
export function ChallengeLine({ challenge }: { challenge: CustomerChallenge }) {
  const colors = useColors();
  const styles = useStyles();
  return (
    <PressRow onPress={() => router.push(`/profile/rewards?challenge=${challenge.id}` as Href)} style={styles.line}>
      <View style={styles.lineTop}>
        <View style={[styles.lineTitle, styles.shrink]}>
          <IconTrophy size={14} stroke={1.6} color={colors.textSecondary} />
          <T size={13} lh={18} numberOfLines={1} style={styles.shrink}>
            {challenge.title}
          </T>
        </View>
        <FigureLine size={12} lh={16} color={colors.textSecondary} text={challenge.reward} />
      </View>
      <ChallengeBar count={challenge.count} goal={challenge.goal} won={challenge.won} />
      <FigureLine size={11} lh={15} color={colors.textMuted} text={challenge.line} />
    </PressRow>
  );
}

const useStyles = createStyles((c) => ({
  card: { gap: 10, borderRadius: 14, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, paddingHorizontal: 14, paddingVertical: 14 },
  highlight: { borderColor: c.meterOn },
  dim: { opacity: 0.7 },
  top: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  shrink: { flexShrink: 1, minWidth: 0 },
  mark: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: c.stroke },
  markWon: { borderColor: c.textPrimary, backgroundColor: c.textPrimary },
  line: { gap: 6, borderRadius: 14, borderWidth: 1, borderColor: c.line, paddingHorizontal: 14, paddingVertical: 10 },
  lineTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  lineTitle: { flexDirection: 'row', alignItems: 'center', gap: 6 },
}));
