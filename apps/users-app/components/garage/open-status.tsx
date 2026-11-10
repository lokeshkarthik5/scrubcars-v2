import { hoursLeftShare, openStatus, type OpeningDay } from '@repo/core/opening-hours';
import { HoursRing } from '@repo/native-ui/finish';
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
  /** `ring`: the garage page's, the opening-hours ring before the words (§5). */
  variant?: 'line' | 'overlay' | 'ring';
}) {
  const colors = useColors();
  const styles = useStyles();
  const now = useMinuteClock();
  const status = openStatus(hours, now, closures);
  if (!status) return null;
  if (variant === 'ring') {
    return (
      <View style={styles.row}>
        <HoursRing share={status.isOpen ? hoursLeftShare(hours, now, closures) : null} play track={colors.scheme === 'light' ? colors.line : undefined} />
        <T variant="t4" numberOfLines={1} color={colors.scheme === 'light' ? colors.textSecondary : '#C8C8D0'} style={styles.shrink}>
          <T variant="t4" color={colors.textPrimary}>
            {status.isOpen ? 'Open' : status.closedToday ? 'Closed today' : 'Closed'}
          </T>
          {status.detail ? ` · ${status.detail}` : ''}
        </T>
      </View>
    );
  }
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
