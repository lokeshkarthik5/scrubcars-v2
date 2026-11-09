import { Pressable, View } from 'react-native';

import { IconCircleX } from './icons';
import { useT, type UiLang } from './lang';
import { ScSheet } from './sheet';
import { T } from './text';
import { createStyles, useColors } from './theme';

/**
 * LanguageSheet (packages/ui/src/features/language-sheet.tsx): English or தமிழ்,
 * one radio row per option as the sort sheet draws them. The options and the choice
 * are handed in (core's LANGUAGE_OPTIONS and useLang): this package has no
 * dependency on @repo/core. Each option is written in its own language.
 */
export function LanguageSheet({
  open,
  onClose,
  options,
  value,
  onChange,
}: {
  open: boolean;
  onClose: () => void;
  options: readonly { value: UiLang; label: string }[];
  value: UiLang;
  onChange: (lang: UiLang) => void;
}) {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  return (
    <ScSheet open={open} onClose={onClose} accessibilityLabel={t('Language')}>
      <View style={styles.head}>
        <T size={17} weight={600}>
          {t('Language')}
        </T>
        <Pressable accessibilityRole="button" accessibilityLabel={t('Close')} onPress={onClose} style={styles.close}>
          <IconCircleX size={22} color={colors.textSecondary} />
        </Pressable>
      </View>
      <View accessibilityRole="radiogroup">
        {options.map((option, i) => {
          const chosen = value === option.value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityState={{ checked: chosen }}
              accessibilityLanguage={option.value}
              onPress={() => {
                onChange(option.value);
                onClose();
              }}
              style={[styles.row, i < options.length - 1 && styles.rowLine]}
            >
              <T size={15}>{option.label}</T>
              <View style={[styles.radio, { borderColor: chosen ? colors.textPrimary : colors.textMuted }]}>
                {chosen ? <View style={styles.radioDot} /> : null}
              </View>
            </Pressable>
          );
        })}
      </View>
    </ScSheet>
  );
}

const useStyles = createStyles((c) => ({
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: c.border,
    paddingHorizontal: 20,
    paddingBottom: 16,
    paddingTop: 4,
  },
  close: { width: 44, height: 44, marginRight: -11, marginVertical: -11, alignItems: 'center', justifyContent: 'center' },
  row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16 },
  rowLine: { borderBottomWidth: 1, borderBottomColor: c.border },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: c.textPrimary },
}));
