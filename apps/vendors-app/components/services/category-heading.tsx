import { categoryLabel } from '@repo/core/categories';
import type { ServiceCategory } from '@repo/core/types';
import { View } from 'react-native';

import {
  IconDots,
  IconDroplet,
  IconEngine,
  IconPackage,
  IconShieldCheck,
  IconSparkles,
  IconSpray,
  IconTool,
  IconWand,
} from '@repo/native-ui/icons';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';

/** Each category's icon, as the portal's twin (apps/vendors/components/category-heading.tsx). */
export const CATEGORY_ICONS: Record<ServiceCategory, typeof IconDroplet> = {
  car_wash: IconDroplet,
  detailing: IconSparkles,
  coating: IconShieldCheck,
  scratch_removal: IconWand,
  general_service: IconEngine,
  repairs: IconTool,
  dent_paint: IconSpray,
  others: IconDots,
  package: IconPackage,
};

/**
 * "Your services" small heading (16 Nov 2026): the category's icon, its name and how
 * many services are under it, as the portal draws it. Read as "Repairs 2".
 */
export function CategoryHeading({ category, count }: { category: ServiceCategory; count: number }) {
  const colors = useColors();
  const styles = useStyles();
  const Icon = CATEGORY_ICONS[category];
  const label = categoryLabel(category);
  return (
    <View accessible accessibilityRole="header" accessibilityLabel={`${label} ${count}`} style={styles.row}>
      <Icon size={14} line={1.6} color={colors.textSecondary} />
      <T size={12} weight={500} color={colors.textSecondary}>
        {label}
      </T>
      <T num size={12} color={colors.textMuted}>
        {count}
      </T>
    </View>
  );
}

const useStyles = createStyles(() => ({
  // gap-1.5 px-1 pt-1, as the portal's h3.
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4, paddingTop: 4 },
}));
