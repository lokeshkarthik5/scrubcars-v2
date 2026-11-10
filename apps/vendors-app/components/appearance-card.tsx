import { GraphiteSwitch } from '@repo/native-ui/finish';
import { ScCard } from '@repo/native-ui/primitives';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors, useTheme } from '@repo/native-ui/theme';
import type { Appearance } from '@repo/native-ui/tokens';

const APPEARANCES: { value: Appearance; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

/**
 * Appearance (white-theme frame M): how the app looks on this phone; the web has no such
 * setting. Shown in Settings > Account and on Your account, which every seat reaches (an
 * operator has no Settings).
 */
export function AppearanceCard() {
  const colors = useColors();
  const styles = useStyles();
  const { appearance, setAppearance } = useTheme();
  return (
    <ScCard>
      <T accessibilityRole="header" size={20} weight={600} lh={28}>
        Appearance
      </T>
      <T size={14} lh={20} color={colors.textSecondary} style={styles.note}>
        How the app looks on this phone. System follows your phone&apos;s setting.
      </T>
      <GraphiteSwitch
        pinned
        accessibilityLabel="Appearance"
        options={APPEARANCES}
        value={appearance}
        onChange={setAppearance}
        style={styles.switch}
      />
    </ScCard>
  );
}

const useStyles = createStyles(() => ({
  note: { marginTop: 4, marginBottom: 12 },
  // The garage's graphite switch, at the tab strips' height.
  switch: { height: 52 },
}));
