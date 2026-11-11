import { msg, t, useT } from '@repo/core/i18n';
import { IconCircleX } from '@repo/native-ui/icons';
import { ScSheet } from '@repo/native-ui/sheet';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { Pressable, View } from 'react-native';

export type SortKey = 'distance' | 'relevance' | 'rating' | 'price_asc' | 'price_desc';

export const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'distance', label: msg('Nearest First') },
  { value: 'relevance', label: msg('Relevance') },
  { value: 'rating', label: msg('Top Rated') },
  { value: 'price_asc', label: msg('Cost: Low to High') },
  { value: 'price_desc', label: msg('Cost: High to Low') },
];

export const sortLabel = (value: SortKey) => t(SORT_OPTIONS.find((o) => o.value === value)?.label ?? 'Relevance');

/** Until a listed garage has a review, "Top Rated" sorts by a number nobody has. */
export function canSortByRating(vendors: readonly { reviewCount: number }[], currentSort: SortKey, hasMore: boolean) {
  return currentSort === 'rating' || hasMore || vendors.some((v) => v.reviewCount > 0);
}

/** SortSheet (packages/ui/src/sc/sort-sheet.tsx). */
export function SortSheet({
  open,
  value,
  onChange,
  onClose,
  locationUnavailable = false,
  ratingAvailable,
}: {
  open: boolean;
  value: SortKey;
  onChange: (value: SortKey) => void;
  onClose: () => void;
  locationUnavailable?: boolean;
  ratingAvailable: boolean;
}) {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  return (
    <ScSheet open={open} onClose={onClose} accessibilityLabel={t('Sort by')}>
      <View style={styles.head}>
        <T size={17} weight={600}>
          {t('Sort by')}
        </T>
        <Pressable accessibilityRole="button" accessibilityLabel={t('Close')} onPress={onClose} style={styles.close}>
          <IconCircleX size={22} color={colors.textSecondary} />
        </Pressable>
      </View>
      {SORT_OPTIONS.filter((opt) => opt.value !== 'rating' || ratingAvailable).map((opt, i, all) => {
        const disabled = opt.value === 'distance' && locationUnavailable;
        const chosen = value === opt.value;
        return (
          <Pressable
            key={opt.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: chosen, disabled }}
            disabled={disabled}
            onPress={() => {
              onChange(opt.value);
              onClose();
            }}
            style={[styles.row, i < all.length - 1 && styles.rowLine, disabled && styles.off]}
          >
            <View>
              <T size={15}>{t(opt.label)}</T>
              {disabled ? (
                <T size={11} color={colors.textMuted}>
                  {t('Turn on location to use this')}
                </T>
              ) : null}
            </View>
            <View style={[styles.radio, { borderColor: chosen ? colors.textPrimary : colors.textMuted }]}>
              {chosen ? <View style={styles.radioDot} /> : null}
            </View>
          </Pressable>
        );
      })}
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
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16 },
  rowLine: { borderBottomWidth: 1, borderBottomColor: c.border },
  off: { opacity: 0.4 },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: c.textPrimary },
}));
