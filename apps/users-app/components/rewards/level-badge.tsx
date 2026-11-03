import type { RewardLevel } from '@repo/core/rewards';
import { T } from '@repo/native-ui/text';
import { useColors } from '@repo/native-ui/theme';
import { View } from 'react-native';

const TINTS: Partial<Record<RewardLevel, { border: string; background: string; color?: string }>> = {
  gold: { border: 'rgba(227,182,82,0.5)', background: 'rgba(227,182,82,0.12)', color: '#B98A1F' },
  silver: { border: 'rgba(160,168,184,0.5)', background: 'rgba(160,168,184,0.12)' },
  platinum: { border: 'rgba(160,168,184,0.5)', background: 'rgba(160,168,184,0.12)' },
  diamond: { border: 'rgba(120,175,235,0.5)', background: 'rgba(120,175,235,0.12)' },
  icon: { border: 'rgba(227,182,82,0.6)', background: 'rgba(240,220,170,0.14)' },
};

/** LevelBadge: a level's name as a quiet pill. */
export function LevelBadge({ level, label, large = false }: { level: RewardLevel; label: string; large?: boolean }) {
  const colors = useColors();
  const tint = TINTS[level];
  return (
    <View style={{ alignSelf: 'flex-start', borderRadius: 999, borderWidth: 1, borderColor: tint?.border ?? colors.stroke, backgroundColor: tint?.background, paddingHorizontal: large ? 10 : 8, paddingVertical: large ? 4 : 2 }}>
      <T size={large ? 13 : 11} weight={500} lh={large ? 18 : 15} color={tint?.color ?? colors.textPrimary}>
        {label}
      </T>
    </View>
  );
}
