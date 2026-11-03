import { ApiError } from '@repo/core/api/client';
import { useCancelSlotAlert, useSetSlotAlert, useSlotAlerts } from '@repo/core/api/hooks/use-slot-alerts';
import {
  inSlotAlertWindow,
  SLOT_ALERT_WINDOW_HINTS,
  SLOT_ALERT_WINDOW_LABELS,
  SLOT_ALERT_WINDOWS,
  slotAlertDayLabel,
  slotAlertSummary,
  type SlotAlertWindow,
} from '@repo/core/slot-alerts';
import type { BookingType } from '@repo/core/types';
import { ScButton } from '@repo/native-ui/button';
import { Chip } from '@repo/native-ui/chip';
import { IconBell, IconCircleCheck } from '@repo/native-ui/icons';
import { ScCard } from '@repo/native-ui/primitives';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { type Href, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { useAuth } from '@/lib/auth';
import { otpFlow } from '@/lib/otp-flow';
import type { SlotDayState } from '@/lib/when-picker';

/** SlotAlertAsk (apps/users/components/slot-alerts/slot-alert-ask.tsx). */
export function SlotAlertAsk({
  state,
  vendorId,
  serviceIds,
  bookingType,
  backTo,
}: {
  state: SlotDayState;
  vendorId: string;
  serviceIds: string[];
  bookingType: BookingType;
  /** Where signing in comes back to. */
  backTo: string;
}) {
  const colors = useColors();
  const styles = useStyles();
  const user = useAuth((s) => s.user);
  const alerts = useSlotAlerts({ enabled: !!user });
  const setAlert = useSetSlotAlert();
  const cancelAlert = useCancelSlotAlert();
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<SlotAlertWindow | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const hasFreeTime = (option: SlotAlertWindow) => state.slots.some((slot) => inSlotAlertWindow(slot, option));
  const waitable = SLOT_ALERT_WINDOWS.filter((option) => !hasFreeTime(option));
  const full = state.slots.length === 0 && state.allBooked;
  if (state.unavailable || (!full && state.slots.length === 0) || waitable.length === 0) return null;

  const part: SlotAlertWindow = picked && waitable.includes(picked) ? picked : waitable[0];
  const waiting = alerts.data?.items.find((alert) => alert.vendorId === vendorId && alert.date === state.date) ?? null;
  const day = slotAlertDayLabel(state.date);

  if (waiting) {
    return (
      <ScCard style={styles.waiting} accessibilityLiveRegion="polite">
        <IconCircleCheck size={20} stroke={1.6} color={colors.textPrimary} />
        <View style={styles.grow}>
          <T size={13} weight={500} lh={18}>
            {`Waiting for a slot on ${slotAlertSummary(waiting)}`}
          </T>
          <T size={12} lh={16} color={colors.textSecondary} style={styles.sub}>
            {"If one opens it shows in Updates, and as a notification if they're on. It isn't held for you. "}
            <T size={12} weight={500} lh={16} style={styles.underline} onPress={() => router.push('/profile/slot-alerts' as Href)}>
              Slot alerts
            </T>
          </T>
          <Pressable
            accessibilityRole="button"
            disabled={cancelAlert.isPending}
            onPress={() => cancelAlert.mutate(waiting.id)}
            style={styles.stop}
          >
            <T size={12} weight={500} lh={16} color={colors.textSecondary} style={styles.underline}>
              Stop waiting
            </T>
          </Pressable>
        </View>
      </ScCard>
    );
  }

  if (!full && !open) {
    return (
      <Pressable accessibilityRole="button" onPress={() => setOpen(true)} style={styles.ask}>
        <IconBell size={14} stroke={1.6} color={colors.textSecondary} />
        <T size={12} lh={16} color={colors.textSecondary}>
          {'None of these suit you? '}
          <T size={12} weight={500} lh={16} style={styles.underline}>
            Notify me if one opens
          </T>
        </T>
      </Pressable>
    );
  }

  const submit = () => {
    setProblem(null);
    if (!user) {
      otpFlow.setNext(backTo);
      router.push(`/login?next=${encodeURIComponent(backTo)}` as Href);
      return;
    }
    setAlert.mutate(
      { vendorId, date: state.date, window: part, bookingType, serviceIds },
      {
        onError: (err) => setProblem(err instanceof ApiError ? err.message : "Couldn't set that up. Check your connection and try again."),
      }
    );
  };

  const hint = SLOT_ALERT_WINDOW_HINTS[part];
  const crossed = waitable.length < SLOT_ALERT_WINDOWS.length;
  return (
    <ScCard style={styles.card}>
      <View>
        <T size={13} weight={600} lh={18}>
          Notify me if a slot opens
        </T>
        <T size={12} lh={16} color={colors.textSecondary} style={styles.sub}>
          {`If a time frees up on ${day}, it shows in Updates, and as a notification if they're on. It isn't held: the first to book gets it.`}
        </T>
      </View>
      <View style={styles.chips}>
        {SLOT_ALERT_WINDOWS.map((option) => (
          <Chip
            key={option}
            label={SLOT_ALERT_WINDOW_LABELS[option]}
            selected={part === option}
            disabled={hasFreeTime(option)}
            onPress={() => {
              setPicked(option);
              setProblem(null);
            }}
          />
        ))}
      </View>
      {hint || crossed ? (
        <T size={11} lh={15} color={colors.textMuted}>
          {[hint, crossed ? 'Crossed out: a time is free then. Pick it above.' : ''].filter(Boolean).join(' · ')}
        </T>
      ) : null}
      {problem ? (
        <T accessibilityRole="alert" size={12} lh={16} color={colors.warning}>
          {problem}
        </T>
      ) : null}
      <ScButton variant="outline" disabled={setAlert.isPending} onPress={submit}>
        {user ? 'Notify me' : 'Sign in to get notified'}
      </ScButton>
    </ScCard>
  );
}

const useStyles = createStyles(() => ({
  waiting: { marginTop: 12, flexDirection: 'row', gap: 12 },
  card: { marginTop: 12, gap: 12 },
  grow: { flex: 1, minWidth: 0 },
  sub: { marginTop: 2 },
  stop: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start', marginLeft: -4, paddingHorizontal: 4 },
  ask: { marginTop: 12, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6 },
  underline: { textDecorationLine: 'underline' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
}));
