import { ScCard, ScSegmented } from '@repo/native-ui/primitives';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors, useTheme } from '@repo/native-ui/theme';
import type { Appearance } from '@repo/native-ui/tokens';
import { msg, useT } from '@repo/core/i18n';

const APPEARANCES: { value: Appearance; label: string }[] = [
  { value: 'system', label: msg('System') },
  { value: 'light', label: msg('Light') },
  { value: 'dark', label: msg('Dark') },
];

/**
 * Appearance (white-theme frame M): how the app looks on this phone; the web has no such
 * setting. Shown in Settings > Account and on Your account, which every seat reaches (an
 * operator has no Settings).
 */
export function AppearanceCard() {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  const { appearance, setAppearance } = useTheme();
  return (
    <ScCard>
      <T accessibilityRole="header" size={20} weight={600} lh={28}>
        {t('Appearance')}
      </T>
      <T size={14} lh={20} color={colors.textSecondary} style={styles.note}>
        {t("How the app looks on this phone. System follows your phone's setting.")}
      </T>
      <ScSegmented
        accessibilityLabel={t('Appearance')}
        options={APPEARANCES.map((option) => ({ ...option, label: t(option.label) }))}
        value={appearance}
        onChange={setAppearance}
        trackColor={colors.canvas}
      />
    </ScCard>
  );
}

const useStyles = createStyles(() => ({
  note: { marginTop: 4, marginBottom: 12 },
}));
