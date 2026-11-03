import type { Booking } from '@repo/core/types';
import { View } from 'react-native';

import { AddOnMark } from '@repo/native-ui/chip';
import { T } from '@repo/native-ui/text';
import { useColors } from '@repo/native-ui/theme';
import { addOnsOf } from '@/lib/add-on-lines';

/** Each add-on on its own marked line, under the service (add-ons frame F). */
export function JobAddOnLines({ items, size }: { items: Booking['items']; size: number }) {
  const colors = useColors();
  return (
    <>
      {addOnsOf({ items }).map((item) => (
        <View key={item.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <T size={size} color={colors.textSecondary} style={{ flexShrink: 1 }}>
            {item.name}
          </T>
          <AddOnMark />
        </View>
      ))}
    </>
  );
}
