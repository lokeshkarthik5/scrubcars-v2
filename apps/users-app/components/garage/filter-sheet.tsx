import { CATEGORY_LABELS, PLAIN_CATEGORY_ORDER } from '@repo/core/categories';
import { t, useT } from '@repo/core/i18n';
import type { ServiceCategory } from '@repo/core/types';
import { Pearl, Raised } from '@repo/native-ui/finish';
import {
  IconDots,
  IconDroplet,
  IconEngine,
  IconLayoutGrid,
  IconPackage,
  IconShieldCheck,
  IconSparkles,
  IconSpray,
  IconTool,
  IconWand,
  type IconProps,
} from '@repo/native-ui/icons';
import { PressScale, Rise } from '@repo/native-ui/motion';
import { ScSheet } from '@repo/native-ui/sheet';
import { T } from '@repo/native-ui/text';
import { createStyles, useFinish } from '@repo/native-ui/theme';
import type { ReactElement } from 'react';
import { View } from 'react-native';

export type ServiceFilter = ServiceCategory | 'all';

/** The filter's services: All and Packages, then every plain category in the order used everywhere (apps/users/components/garages/filter-sheet.tsx). */
export const SERVICE_FILTERS: ServiceFilter[] = ['all', 'package', ...PLAIN_CATEGORY_ORDER];

const ICONS: Record<ServiceFilter, (props: IconProps) => ReactElement> = {
  all: IconLayoutGrid,
  package: IconPackage,
  car_wash: IconDroplet,
  detailing: IconSparkles,
  coating: IconShieldCheck,
  scratch_removal: IconWand,
  general_service: IconEngine,
  repairs: IconTool,
  dent_paint: IconSpray,
  others: IconDots,
};

/** "All services", "Packages", "Car wash" … as the filter button and its sheet say them. */
export function serviceFilterLabel(filter: ServiceFilter): string {
  if (filter === 'all') return t('All services');
  if (filter === 'package') return t('Packages');
  return t(CATEGORY_LABELS[filter]);
}

export function ServiceFilterIcon({
  filter,
  size = 18,
  color,
}: {
  filter: ServiceFilter;
  size?: number;
  color?: string;
}) {
  const Icon = ICONS[filter];
  return <Icon size={size} color={color} />;
}

/** How long the chosen tile shows pearl before the sheet goes. */
const CLOSE_AFTER_MS = 160;

/**
 * The glass filter sheet (§3): every service as a tile, two to a row, with how many of
 * the garages here offer it, rising in one after another. A tap applies it and closes the
 * sheet. A count the list cannot vouch for is left off rather than shown as 0.
 */
export function FilterSheet({
  open,
  value,
  counts,
  onChange,
  onClose,
}: {
  open: boolean;
  value: ServiceFilter;
  /** Garages per service; null for a service the list cannot count. */
  counts: Record<ServiceFilter, string | null>;
  onChange: (value: ServiceFilter) => void;
  onClose: () => void;
}) {
  const t = useT();
  const styles = useStyles();
  const { fx } = useFinish();
  return (
    <ScSheet open={open} onClose={onClose} accessibilityLabel={t('Choose a service')} horizontalPadding={10}>
      <T variant="t3" weight={600} style={styles.title}>
        {t('Service')}
      </T>
      <View style={styles.grid}>
        {SERVICE_FILTERS.map((filter, i) => {
          const selected = filter === value;
          const body = (
            <>
              <ServiceFilterIcon filter={filter} color={selected ? fx.pearlInk : fx.quietBright} />
              <T
                variant="t3"
                weight={selected ? 600 : 500}
                numberOfLines={2}
                color={selected ? fx.pearlInk : undefined}
                style={styles.label}
              >
                {serviceFilterLabel(filter)}
              </T>
              {counts[filter] ? (
                <T num variant="t4" weight={600} color={selected ? '#55555E' : fx.quiet}>
                  {counts[filter]}
                </T>
              ) : null}
            </>
          );
          return (
            <Rise key={filter} index={i} delay={80} play={open} style={styles.cell}>
              <PressScale
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={`${serviceFilterLabel(filter)}${counts[filter] ? `, ${t('{count} garages', { count: counts[filter] })}` : ''}`}
                onPress={() => {
                  onChange(filter);
                  setTimeout(onClose, CLOSE_AFTER_MS);
                }}
              >
                {selected ? (
                  <Pearl radius={16} style={styles.tile}>
                    <View style={styles.tileRow}>{body}</View>
                  </Pearl>
                ) : (
                  <Raised radius={16} style={styles.tile} innerStyle={styles.tileRow}>
                    {body}
                  </Raised>
                )}
              </PressScale>
            </Rise>
          );
        })}
      </View>
    </ScSheet>
  );
}

const useStyles = createStyles(() => ({
  title: { marginHorizontal: 10, marginBottom: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 2, paddingBottom: 4 },
  cell: { width: '48.5%' },
  tile: { height: 56, width: '100%' },
  tileRow: { flex: 1, width: '100%', flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12 },
  // Two lines rather than cut short, as the web: "Scratch removal" and "General service"
  // do not fit beside a count.
  label: { flex: 1, minWidth: 0, lineHeight: 17 },
}));
