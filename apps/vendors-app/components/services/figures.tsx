import type { ReactNode } from 'react';
import { Text } from 'react-native';

import { splitFigures } from '@/lib/service-form';

import { font } from '@repo/native-ui/text';

/**
 * packages/ui/src/sc/figures.tsx: a label whose figures ("₹599", "₹399–₹7999", "45") are set
 * in the brand's numeric face while its words stay in Inter. Goes inside a `T`, which
 * gives the size and colour.
 */
export function Figures({ text }: { text: string }) {
  return (
    <>
      {splitFigures(text).map((part, index) =>
        part.figure ? (
          <Text key={index} style={{ fontFamily: font(400, true) }}>
            {part.text}
          </Text>
        ) : (
          part.text
        )
      )}
    </>
  );
}

/** A figure on its own, in the numeric face, inside a `T`. */
export function Num({ children, weight = 400 }: { children: ReactNode; weight?: 400 | 500 | 600 | 700 }) {
  return <Text style={{ fontFamily: font(weight, true) }}>{children}</Text>;
}
