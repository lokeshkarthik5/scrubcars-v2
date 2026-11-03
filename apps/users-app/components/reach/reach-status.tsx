import type { AreaSignup } from '@repo/core/api/area';
import { markLaunchBannerSeen } from '@repo/core/api/area';
import type { CustomerRequest } from '@repo/core/api/booking-requests';
import { useAreaStatus, useLeaveAreaList, useMarkBannerSeen } from '@repo/core/api/hooks/use-area';
import { waitingLine } from '@repo/core/area-signups';
import { countdownLabel, istClock } from '@repo/core/booking-requests';
import { useNow } from '@repo/core/hooks/use-now';
import { IconChevronRight, IconConfetti, IconGift, IconX } from '@repo/native-ui/icons';
import { ConfirmSheet } from '@repo/native-ui/sheet';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { toast } from '@repo/native-ui/toast';
import { type Href, router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';

import { useAuth } from '@/lib/auth';
import { errorText } from '@/lib/error-text';

const dateLabel = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });

/** ReachStatusCards (apps/users/components/reach/reach-status.tsx): requests, the area's list, a free wash ready, launch day. */
export function ReachStatusCards() {
  const colors = useColors();
  const styles = useStyles();
  const user = useAuth((s) => s.user);
  const status = useAreaStatus({ enabled: !!user });
  const now = useNow(1000);
  const data = status.data;
  if (!data) return null;
  const banner = data.signups.find((s) => s.launchBanner);
  const requests = data.requests;
  const ready = data.signups.filter((s) => s.freeWashReady);
  const waiting = data.signups.filter((s) => !s.live);
  if (!banner && requests.length === 0 && ready.length === 0 && waiting.length === 0) return null;
  return (
    <View style={styles.column}>
      {banner ? <LaunchBanner signup={banner} /> : null}
      {requests.map((request) => (
        <RequestStatusCard key={request.rootId} request={request} now={now} />
      ))}
      {ready.map((signup) => (
        <Pressable key={`ready-${signup.zone.slug}`} accessibilityRole="link" onPress={() => router.push('/garages?category=car_wash' as Href)} style={[styles.row, styles.green]}>
          <IconGift size={20} color={colors.success} />
          <View style={styles.grow}>
            <T size={15} weight={500} lh={20}>
              Your free wash is ready
            </T>
            <T size={12} lh={16} color={colors.textSecondary}>
              {`Up to ₹${signup.freeWashReady!.amount} off a car wash in ${signup.zone.name} · use by ${dateLabel(signup.freeWashReady!.endsAt)}`}
            </T>
          </View>
          <IconChevronRight size={18} color={colors.textSecondary} />
        </Pressable>
      ))}
      {waiting.map((signup) => (
        <WaitingListCard key={`list-${signup.zone.slug}`} signup={signup} />
      ))}
    </View>
  );
}

function WaitingListCard({ signup }: { signup: AreaSignup }) {
  const colors = useColors();
  const styles = useStyles();
  const leave = useLeaveAreaList();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | undefined>();
  return (
    <View style={styles.list}>
      <View style={styles.grow}>
        <T size={14} lh={18}>
          {`On the list for ${signup.zone.name}`}
        </T>
        <T size={12} lh={16} color={colors.textMuted}>
          {`${signup.freeWash ? 'Free wash saved · ' : ''}${waitingLine(signup.zone.name, signup.waiting)}`}
        </T>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={`Leave the list for ${signup.zone.name}`} onPress={() => setConfirming(true)} style={styles.leave}>
        <T size={12} weight={500} lh={16} color={colors.textSecondary} style={styles.underline}>
          Leave
        </T>
      </Pressable>
      <ConfirmSheet
        open={confirming}
        onClose={() => {
          setConfirming(false);
          setError(undefined);
        }}
        onConfirm={async () => {
          try {
            await leave.mutateAsync(signup.zone.slug);
            toast.success(`You left the list for ${signup.zone.name}`);
            setConfirming(false);
          } catch (err) {
            setError(errorText(err, 'Could not leave the list'));
          }
        }}
        level="light"
        title={`Leave the list for ${signup.zone.name}?`}
        body={signup.freeWash ? "We'll stop sending you news about this area, and your saved free wash goes with it." : "We'll stop sending you news about this area. You can join again any time."}
        confirmLabel="Leave the list"
        cancelLabel="Stay on it"
        busy={leave.isPending}
        error={error}
      />
    </View>
  );
}

function LaunchBanner({ signup }: { signup: AreaSignup }) {
  const colors = useColors();
  const styles = useStyles();
  const seen = useMarkBannerSeen();
  const told = useRef(false);
  const [closed, setClosed] = useState(false);
  useEffect(() => {
    if (told.current) return;
    told.current = true;
    void markLaunchBannerSeen(signup.zone.slug).catch(() => undefined);
  }, [signup.zone.slug]);
  if (closed) return null;
  const garages = signup.launchBanner?.garages ?? 1;
  return (
    <View style={styles.banner}>
      <IconConfetti size={22} color={colors.success} />
      <View style={styles.grow}>
        <T size={15} weight={500} lh={20}>
          {`Detlio is now in ${signup.zone.name}`}
        </T>
        <T size={13} lh={18} color={colors.textSecondary}>
          {`${garages} ${garages === 1 ? 'garage' : 'garages'} near you.${signup.freeWashReady ? ' Your free wash is ready to book.' : ''}`}
        </T>
        <Pressable accessibilityRole="link" onPress={() => router.push('/garages' as Href)} style={styles.see}>
          <T size={14} lh={18} style={styles.underline}>
            See them
          </T>
        </Pressable>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close the launch banner"
        onPress={() => {
          setClosed(true);
          seen.mutate(signup.zone.slug);
        }}
        style={styles.close}
      >
        <IconX size={18} color={colors.textSecondary} />
      </Pressable>
    </View>
  );
}

function RequestStatusCard({ request, now }: { request: CustomerRequest; now: number }) {
  const colors = useColors();
  const styles = useStyles();
  const [title, line] =
    request.state === 'accepted' && request.confirmBy
      ? [`Accepted: confirm by ${istClock(request.confirmBy)}`, `${request.garage.name} said yes · ${request.window.label}`]
      : request.state === 'waiting'
        ? ['Your request', `${request.garage.name} · waiting · ${countdownLabel(Date.parse(request.respondBy) - now)} left`]
        : request.state === 'lapsed'
          ? ['Your request expired', `${request.garage.name}'s yes ran out · send a new one`]
          : ["Your request didn't find a garage", 'See what to do next'];
  return (
    <Pressable accessibilityRole="link" onPress={() => router.push('/requests' as Href)} style={[styles.row, request.state === 'accepted' ? styles.green : styles.plain]}>
      <View style={styles.grow}>
        <T size={15} weight={500} lh={20}>
          {title}
        </T>
        <T size={12} lh={16} color={colors.textSecondary}>
          {line}
        </T>
      </View>
      <IconChevronRight size={18} color={colors.textSecondary} />
    </Pressable>
  );
}

const useStyles = createStyles((c) => ({
  column: { gap: 8 },
  row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 12 },
  green: { borderColor: c.acceptedBorder, backgroundColor: c.acceptedBg },
  plain: { borderColor: c.border, backgroundColor: c.surface },
  grow: { flex: 1, minWidth: 0 },
  list: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderRadius: 16, borderWidth: 1, borderColor: c.border, paddingHorizontal: 16, paddingVertical: 8 },
  leave: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  underline: { textDecorationLine: 'underline' },
  banner: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, borderRadius: 16, borderWidth: 1, borderColor: c.acceptedBorder, backgroundColor: c.acceptedBg, padding: 16 },
  see: { marginTop: 8, minHeight: 44, justifyContent: 'center' },
  close: { marginRight: -8, marginTop: -8, height: 44, width: 44, alignItems: 'center', justifyContent: 'center' },
}));
