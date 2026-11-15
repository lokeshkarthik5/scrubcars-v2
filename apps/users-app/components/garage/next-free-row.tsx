import { useNextFree } from '@repo/core/api/hooks/use-next-free';
import { bookingTypeParam } from '@repo/core/booking-types';
import { useT } from '@repo/core/i18n';
import { nextFreeDayLabel, nextFreeTimeLabels, upcomingNextFree, type NextFree } from '@repo/core/next-free';
import type { BookingType, Vendor } from '@repo/core/types';
import { Raised, RedLight } from '@repo/native-ui/finish';
import { IconClock } from '@repo/native-ui/icons';
import { PressScale, Rise } from '@repo/native-ui/motion';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors, useFinish } from '@repo/native-ui/theme';
import { LinearGradient } from 'expo-linear-gradient';
import { type Href, router } from 'expo-router';
import { useState } from 'react';
import { type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native';

/**
 * A card's "Next free" row (§3, §9; apps/users/components/garages/next-free-row.tsx):
 * "NEXT FREE · TODAY" and the next three times as buttons. Asked for only once the card
 * is on screen, together with every other card that came into view at the same moment
 * (one request for the screen, core's useNextFree). A time opens the booking on this
 * garage with it picked (`slot`), which the booking keeps if it is still free.
 *
 * Nothing at all while it loads, fails, or the garage has no time this week: a row of
 * "no times" would read as "fully booked", which it may not be.
 */
export function NextFreeRow({
  vendor,
  mode,
  visible,
  serviceIds,
  preset,
  style,
}: {
  vendor: Vendor;
  mode: BookingType;
  visible: boolean;
  /** The services already picked, on the garage page: a time then books them, as Book now would. */
  serviceIds?: readonly string[];
  /**
   * Times already worked out (the rescue's, near a cancelled booking's slot): shown instead of
   * asking for the garage's next free ones, with their own day words ("Today, near 10:30 am")
   * and links (the same job, picked). The website's NextFreeRow takes the same.
   */
  preset?: { free: NextFree; dayLabel: string; hrefFor: (time: string) => string };
  style?: StyleProp<ViewStyle>;
}) {
  const t = useT();
  const styles = useStyles();
  const colors = useColors();
  const { fx } = useFinish();
  const next = useNextFree(vendor.id, mode, visible && !preset);
  const [picked, setPicked] = useState<string | null>(null);
  const free = upcomingNextFree(preset ? preset.free : next.data);
  if (!free) return null;

  // formatDay stays English (screens compare it); "Today" is shown through t.
  const day = preset ? preset.dayLabel : t(nextFreeDayLabel(free));
  const labels = nextFreeTimeLabels(free);
  const modeParam = bookingTypeParam(mode);

  return (
    <View style={[styles.row, style]}>
      <View style={styles.head}>
        <IconClock size={14} color={colors.success} />
        <T variant="over" color={fx.quiet}>
          {t('Next free')}
        </T>
        <T variant="over" weight={400} color={fx.quiet}>
          ·
        </T>
        <T variant="over" color={fx.soft}>
          {day}
        </T>
      </View>
      <View style={styles.times}>
        {free.times.map((time, i) => {
          const chosen = picked === time;
          const query = new URLSearchParams();
          if (serviceIds && serviceIds.length > 0) query.set('service', serviceIds.join(','));
          if (modeParam) query.set('mode', modeParam);
          query.set('slot', time);
          const face = (
            <>
              <T num variant="t4" weight={600} color={chosen ? fx.graphiteInk : fx.soft}>
                {labels[i]}
              </T>
              <RedLight state={chosen ? 'on' : 'off'} style={styles.light} />
            </>
          );
          return (
            <Rise key={time} index={i} play={visible} style={styles.cell}>
              <PressScale
                accessibilityRole="button"
                accessibilityLabel={t('Book {name}, {day} at {time}', { name: vendor.name, day, time: labels[i] })}
                onPress={() => {
                  setPicked(time);
                  router.push((preset ? preset.hrefFor(time) : `/book/${vendor.id}?${query.toString()}`) as Href);
                }}
              >
                {chosen ? (
                  <View style={styles.time}>
                    <LinearGradient
                      colors={[...fx.graphite]}
                      locations={[0, 0.52, 1]}
                      style={[StyleSheet.absoluteFill, styles.timeFace]}
                    />
                    {face}
                  </View>
                ) : (
                  <Raised radius={12} style={styles.time} innerStyle={styles.timeInner}>
                    {face}
                  </Raised>
                )}
              </PressScale>
            </Rise>
          );
        })}
      </View>
    </View>
  );
}

const useStyles = createStyles(() => ({
  row: { gap: 8, paddingHorizontal: 14, paddingBottom: 14, paddingTop: 2 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  times: { flexDirection: 'row', gap: 8 },
  cell: { flex: 1 },
  time: { height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  timeInner: { alignItems: 'center', justifyContent: 'center' },
  timeFace: { borderRadius: 12 },
  light: { position: 'absolute', bottom: 4, alignSelf: 'center' },
}));
