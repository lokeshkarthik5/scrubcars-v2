import { useId } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, Pattern, Rect } from 'react-native-svg';

import { type CalendarKind, type ClosedDay, closedNote, closedTitle } from '@/lib/jobs';
import { createStyles, useColors } from '@repo/native-ui/theme';
import type { Tokens } from '@repo/native-ui/tokens';
import { T } from '@repo/native-ui/text';

/**
 * apps/vendors/components/calendar-parts.tsx: what the Bookings calendar's
 * Month and Day views share. The web hatches a closed day with a repeating
 * gradient; a phone draws the same diagonal lines as an SVG pattern.
 */

/** One colour per state, as the legend says. */
export function dotColour(colors: Tokens, kind: CalendarKind): string {
  if (kind === 'answer') return colors.tones.new.dot;
  if (kind === 'done') return colors.tones.done.dot;
  return colors.tones.progress.text;
}

export function Dot({ kind, size = 6 }: { kind: CalendarKind; size?: number }) {
  const colors = useColors();
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: dotColour(colors, kind) }} />;
}

/**
 * Diagonal hatching over its parent, which clips it (overflow hidden and its
 * own radius): a day customers can't book. `wide` is the closed card's.
 */
export function Hatch({ wide = false }: { wide?: boolean }) {
  const colors = useColors();
  // An SVG id can't hold the colons React's ids have.
  const id = `hatch${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const step = wide ? 14 : 6;
  return (
    <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <Pattern id={id} patternUnits="userSpaceOnUse" width={step} height={step} patternTransform="rotate(45)">
          <Rect width={wide ? 6 : 2} height={step} fill={colors.line} />
        </Pattern>
      </Defs>
      <Rect width="100%" height="100%" fill={`url(#${id})`} />
    </Svg>
  );
}

/** A closed day: why, and where to change it. Jobs already on it are listed after. */
export function ClosedCard({ closed }: { closed: ClosedDay }) {
  const colors = useColors();
  const styles = useStyles();
  return (
    <View style={styles.card}>
      <Hatch wide />
      <T size={16} weight={600}>
        {closedTitle(closed)}
      </T>
      <T size={14} color={colors.textSecondary}>
        {closedNote(closed)}
      </T>
    </View>
  );
}

const useStyles = createStyles((colors) => ({
  card: {
    gap: 4,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 16,
    overflow: 'hidden',
  },
}));
