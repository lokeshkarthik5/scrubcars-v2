import { fill, useT } from '@repo/core/i18n';
import {
  LUXURY_BADGE_LABEL,
  LUXURY_FILTER_LABEL,
  LUXURY_NAME,
  LUXURY_SHEET_BRANDS,
  LUXURY_SHEET_FOOT,
  LUXURY_SHEET_INTRO,
  LUXURY_STANDARDS,
  handlesBrands,
} from '@repo/core/luxury';
import { Pearl, Raised, usePearlInk } from '@repo/native-ui/finish';
import { IconCircleCheck, IconX } from '@repo/native-ui/icons';
import { PressScale } from '@repo/native-ui/motion';
import { ScSheet } from '@repo/native-ui/sheet';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors, useFinish } from '@repo/native-ui/theme';
import { ICON_LINE } from '@repo/native-ui/tokens';
import { Fragment, useState } from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

/**
 * Luxury car specialists (0083; apps/users's packages/ui/src/features/luxury-badge.tsx):
 * the quiet grey badge of a garage the Detlio team approved for luxury cars. Never red,
 * never a metal: it sits apart from the Bronze / Silver / Gold medal (tier.tsx). Every
 * colour is the theme's, so it reads the same in light and dark.
 */

/** Tabler's steering wheel, drawn with the finish's line like the rest of the icons. */
export function LuxuryIcon({ size = 13, color }: { size?: number; color?: string }) {
  const fallback = useColors().textPrimary;
  const { on: finish } = useFinish();
  const width = finish ? (ICON_LINE * 24) / size : 2;
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color ?? fallback}
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Path d="M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0" />
      <Path d="M10 12a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" />
      <Path d="M12 14l0 7" />
      <Path d="M10 12l-6.75 -2" />
      <Path d="M14 12l6.75 -2" />
    </Svg>
  );
}

/** On a garage card, with "Comes to you too" and the other chips: "Luxury specialist". */
export function LuxuryCardChip() {
  const t = useT();
  const styles = useStyles();
  const { fx } = useFinish();
  return (
    <Raised radius={999} style={styles.cardChip} innerStyle={styles.cardChipInner}>
      <LuxuryIcon size={13} color={fx.quietBright} />
      <T variant="t4" color={fx.soft}>
        {t(LUXURY_BADGE_LABEL)}
      </T>
    </Raised>
  );
}

/**
 * The list's "Luxury specialists" chip, on its own short line under Service and Silver+.
 * Plain until chosen; then pearl (the Service sheet's "chosen" look) with an ×.
 */
export function LuxuryFilterChip({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  const t = useT();
  const styles = useStyles();
  const { fx } = useFinish();
  const ink = usePearlInk();
  const label = t(LUXURY_FILTER_LABEL);
  const content = (color: string) => (
    <>
      <LuxuryIcon size={15} color={color} />
      <T variant="t4" weight={on ? 600 : 500} color={color}>
        {label}
      </T>
      {on ? <IconX size={14} color={color} /> : null}
    </>
  );
  return (
    <PressScale
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: on }}
      onPress={onToggle}
      style={styles.filterWrap}
    >
      {on ? (
        <Pearl radius={999} style={styles.filter}>
          <View style={styles.filterInner}>{content(ink)}</View>
        </Pearl>
      ) : (
        <Raised radius={999} style={styles.filter} innerStyle={styles.filterInner}>
          {content(fx.soft)}
        </Raised>
      )}
    </PressScale>
  );
}

/**
 * On the garage page, under the area and the medal: the badge with "What this means",
 * and "Handles BMW · Mercedes-Benz · …" with the customer's own make in the main text
 * colour. "What this means" opens a sheet built like the medal's.
 */
export function LuxuryBlock({ brands, customerMake }: { brands: readonly string[]; customerMake?: string | null }) {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  const [open, setOpen] = useState(false);
  const named = handlesBrands(brands, customerMake);
  const name = t(LUXURY_NAME);
  return (
    <View style={styles.block}>
      <View style={styles.row}>
        <View style={styles.pageChip}>
          <LuxuryIcon size={15} color={colors.textSecondary} />
          <T size={12} weight={600} lh={16} color={colors.textPrimary}>
            {t(LUXURY_BADGE_LABEL)}
          </T>
        </View>
        <Pressable accessibilityRole="button" hitSlop={12} onPress={() => setOpen(true)}>
          <T size={12} weight={500} color={colors.textSecondary} style={styles.underline}>
            {t('What this means')}
          </T>
        </Pressable>
      </View>
      {named.length > 0 ? (
        <T size={12} lh={17} color={colors.textMuted}>
          {fill(t('Handles {brands}'), {
            brands: (
              <>
                {named.map((item, i) => (
                  <Fragment key={item.brand}>
                    {i > 0 ? ' · ' : ''}
                    {item.mine ? (
                      <T size={12} weight={600} lh={17} color={colors.textPrimary}>
                        {item.brand}
                      </T>
                    ) : (
                      item.brand
                    )}
                  </Fragment>
                ))}
              </>
            ),
          })}
        </T>
      ) : null}

      <ScSheet open={open} onClose={() => setOpen(false)} accessibilityLabel={t('{name}: what this means', { name })} horizontalPadding={16}>
        <View style={styles.sheetHead}>
          <LuxuryIcon size={24} color={colors.textPrimary} />
          <T size={17} weight={600}>
            {name}
          </T>
        </View>
        <T size={13} color={colors.textSecondary} style={styles.sheetLine}>
          {t(LUXURY_SHEET_INTRO)}
        </T>
        <View style={styles.group}>
          {LUXURY_STANDARDS.map((line) => (
            <View key={line} style={styles.line}>
              <IconCircleCheck size={15} color={colors.success} />
              <T size={13} lh={18} color={colors.textPrimary} style={styles.lineText}>
                {t(line)}
              </T>
            </View>
          ))}
        </View>
        {named.length > 0 ? (
          <View style={styles.brands}>
            <T size={11} weight={600} tracking={0.07} uppercase color={colors.textMuted}>
              {t(LUXURY_SHEET_BRANDS)}
            </T>
            <View style={styles.brandRow}>
              {named.map((item) => (
                <View key={item.brand} style={[styles.brand, item.mine && styles.brandMine]}>
                  <T size={13} weight={500} color={item.mine ? colors.textPrimary : colors.textSecondary}>
                    {item.brand}
                  </T>
                </View>
              ))}
            </View>
          </View>
        ) : null}
        <T size={12} color={colors.textMuted} style={styles.foot}>
          {t(LUXURY_SHEET_FOOT)}
        </T>
      </ScSheet>
    </View>
  );
}

const useStyles = createStyles((c) => ({
  cardChip: { height: 26 },
  cardChipInner: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10 },
  filterWrap: { alignSelf: 'flex-start' },
  filter: { height: 34 },
  filterInner: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12 },
  block: { gap: 4, marginTop: 10 },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 8 },
  pageChip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 6, backgroundColor: c.disc, paddingHorizontal: 8, paddingVertical: 2 },
  underline: { textDecorationLine: 'underline' },
  sheetHead: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 8 },
  sheetLine: { marginTop: 6 },
  group: { marginTop: 12, gap: 8 },
  line: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  lineText: { flexShrink: 1 },
  brands: { marginTop: 16, gap: 8 },
  brandRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  brand: { borderRadius: 999, borderWidth: 1, borderColor: c.border, paddingHorizontal: 12, paddingVertical: 4 },
  brandMine: { borderColor: c.textSecondary },
  foot: { marginTop: 16 },
}));
