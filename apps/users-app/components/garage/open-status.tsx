import { openStatus, type OpeningDay } from '@repo/core/opening-hours';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

function useMinuteClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const untilNextMinute = () => 60_000 - (Date.now() % 60_000);
    const tick = () => {
      setNow(new Date());
      timer = setTimeout(tick, untilNextMinute());
    };
    timer = setTimeout(tick, untilNextMinute());
    return () => clearTimeout(timer);
  }, []);
  return now;
}

/** OpenStatus: from real hours, in IST (core's openStatus). Nothing when the hours are unknown. */
export function OpenStatus({
  hours,
  closures,
  variant = 'line',
}: {
  hours: readonly OpeningDay[] | null | undefined;
  closures?: readonly string[];
  variant?: 'line' | 'overlay';
}) {
  const colors = useColors();
  const styles = useStyles();
  const now = useMinuteClock();
  const status = openStatus(hours, now, closures);
  if (!status) return null;
  const overlay = variant === 'overlay';
  // Over a photo, the pill and its words stay dark in both themes.
  const word = overlay ? '#FAFAFA' : colors.textPrimary;
  const rest = overlay ? '#B0B0B0' : colors.textSecondary;
  return (
    <View style={[styles.row, overlay && styles.overlay]}>
      <View style={[styles.dot, { backgroundColor: status.isOpen ? colors.successFill : colors.textMuted }]} />
      <T size={overlay ? 12 : 13} lh={overlay ? 16 : 18} numberOfLines={1} color={rest} style={styles.shrink}>
        <T size={overlay ? 12 : 13} lh={overlay ? 16 : 18} weight={500} color={word}>
          {status.isOpen ? 'Open' : status.closedToday ? 'Closed today' : 'Closed'}
        </T>
        {status.detail ? ` · ${status.detail}` : ''}
      </T>
    </View>
  );
}

const useStyles = createStyles(() => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 },
  overlay: { alignSelf: 'flex-start', borderRadius: 999, backgroundColor: 'rgba(10,10,11,0.75)', paddingHorizontal: 8, paddingVertical: 2 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  shrink: { flexShrink: 1 },
}));
