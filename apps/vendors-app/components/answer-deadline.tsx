import { deadlineState } from '@repo/core/format';
import { useNow } from '@repo/core/hooks/use-now';
import { garageCountdown } from '@repo/core/response-deadline';
import type { ResponseDeadline } from '@repo/core/types';
import { useEffect, useRef } from 'react';
import { Animated, View } from 'react-native';

import { createStyles, useColors } from '@repo/native-ui/theme';

import { IconAlarm } from '@repo/native-ui/icons';
import { Disc } from '@repo/native-ui/primitives';
import { T } from '@repo/native-ui/text';
import { useT } from '@repo/core/i18n';

const MINUTE_MS = 60 * 1000;

/** AnswerDeadline: how long is left to answer, big, with a bar that drains. Ticks every 10 s. */
export function AnswerDeadline({ deadline }: { deadline: ResponseDeadline }) {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  const now = useNow(10_000);
  const respondBy = new Date(deadline.respondBy).getTime();
  const windowMs = deadline.windowMins * MINUTE_MS;
  const state = deadlineState(deadline.respondBy, {
    now,
    shopOpen: respondBy - now <= windowMs,
    startedAt: new Date(respondBy - windowMs),
  });
  const percent = state.kind === 'missed' || state.kind === 'closed' ? 0 : Math.max(2, Math.round(state.fractionLeft * 100));
  const width = useRef(new Animated.Value(percent)).current;

  useEffect(() => {
    Animated.timing(width, { toValue: percent, duration: 1000, useNativeDriver: false }).start();
  }, [percent, width]);

  if (state.kind === 'missed') {
    // With auto-cancel on the booking is going; off, the garage is only late.
    return (
      <View accessibilityLiveRegion="polite" style={styles.missed}>
        <T size={15} weight={500} color={colors.textSecondary}>
          {garageCountdown(deadline, now).text}
        </T>
      </View>
    );
  }

  const urgent = state.kind === 'urgent';
  const tint = urgent ? colors.warning : colors.textPrimary;
  return (
    <View
      accessibilityLiveRegion={urgent ? 'polite' : 'none'}
      style={[styles.box, urgent && styles.urgent]}
    >
      <View style={styles.row}>
        <View style={styles.words}>
          {state.kind === 'closed' ? (
            <>
              <T num size={28} weight={300} lh={30} tracking={-0.03} color={tint}>
                {state.label}
              </T>
              <T size={14} lh={20} color={urgent ? tint : colors.textSecondary}>
                {t('to answer')}
              </T>
            </>
          ) : (
            <>
              <T num size={34} weight={300} lh={38} tracking={-0.03} color={tint}>
                {state.label}
              </T>
              <T size={14} lh={20} color={urgent ? tint : colors.textSecondary}>
                {t('left to answer')}
              </T>
            </>
          )}
        </View>
        <Disc>
          <IconAlarm size={20} stroke={1.5} color={urgent ? colors.warning : colors.textPrimary} />
        </Disc>
      </View>
      {state.kind !== 'closed' ? (
        <View style={styles.track}>
          <Animated.View
            style={[
              styles.fill,
              {
                backgroundColor: urgent ? colors.warningFill : colors.textPrimary,
                width: width.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }),
              },
            ]}
          />
        </View>
      ) : null}
    </View>
  );
}

const useStyles = createStyles((colors) => ({
  box: {
    overflow: 'hidden',
    borderTopLeftRadius: 27,
    borderTopRightRadius: 27,
  },
  urgent: { backgroundColor: colors.warningSoft },
  missed: {
    borderTopLeftRadius: 27,
    borderTopRightRadius: 27,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    backgroundColor: colors.surfaceElevated,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 12,
  },
  words: { flexDirection: 'row', alignItems: 'baseline', gap: 8, flexShrink: 1 },
  track: { height: 4, backgroundColor: colors.discStrong },
  fill: { height: '100%', borderTopRightRadius: 3, borderBottomRightRadius: 3 },
}));
