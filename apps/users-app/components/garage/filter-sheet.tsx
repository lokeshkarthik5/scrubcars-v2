import { CATEGORY_LABELS } from '@repo/core/categories';
import type { ServiceCategory } from '@repo/core/types';
import { Pearl, Raised } from '@repo/native-ui/finish';
import {
  IconDots,
  IconDroplet,
  IconLayoutGrid,
  IconPackage,
  IconShieldCheck,
  IconSparkles,
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

/** The filter's services, in the order the chips had them (apps/users/components/garages/filter-sheet.tsx). */
export const SERVICE_FILTERS: ServiceFilter[] = [
  'all',
  'package',
  'car_wash',
  'detailing',
  'coating',
  'scratch_removal',
  'others',
];

const ICONS: Record<ServiceFilter, (props: IconProps) => ReactElement> = {
  all: IconLayoutGrid,
  package: IconPackage,
  car_wash: IconDroplet,
  detailing: IconSparkles,
  coating: IconShieldCheck,
  scratch_removal: IconWand,
  others: IconDots,
};

/** "All services", "Packages", "Car wash" … as the filter button and its sheet say them. */
export function serviceFilterLabel(filter: ServiceFilter): string {
  if (filter === 'all') return 'All services';
  if (filter === 'package') return 'Packages';
  return CATEGORY_LABELS[filter];
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
  const styles = useStyles();
  const { fx } = useFinish();
  return (
    <ScSheet open={open} onClose={onClose} accessibilityLabel="Choose a service" horizontalPadding={10}>
      <T variant="t3" weight={600} style={styles.title}>
        Service
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
                numberOfLines={1}
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
                accessibilityLabel={`${serviceFilterLabel(filter)}${counts[filter] ? `, ${counts[filter]} garages` : ''}`}
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
  label: { flex: 1, minWidth: 0 },
}));
