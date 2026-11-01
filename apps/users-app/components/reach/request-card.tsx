import type { CustomerRequest } from '@repo/core/api/booking-requests';
import { useCancelRequest } from '@repo/core/api/hooks/use-booking-requests';
import { countdownLabel, istClock, istStartLabel, REQUEST_RULES, triedLine } from '@repo/core/booking-requests';
import { ScButton } from '@repo/native-ui/button';
import { IconCircleCheck, IconClockHour4, IconInfoCircle } from '@repo/native-ui/icons';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { toast } from '@repo/native-ui/toast';
import { type Href, router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { errorText } from '@/lib/error-text';

const money = (rupees: number) => `₹${rupees.toLocaleString('en-IN')}`;

export const requestTotal = (request: CustomerRequest) => Math.round((Number(request.subtotal) + (request.travelFee ?? 0)) * 100) / 100;

export function confirmHref(request: CustomerRequest): string {
  const services = request.items.map((item) => item.serviceId).join(',');
  return `/book/${request.garage.id}?service=${services}&mode=${request.bookingType}&request=${request.id}`;
}

/** RequestCard (apps/users/components/reach/request-card.tsx). */
export function RequestCard({ request, now }: { request: CustomerRequest; now: number }) {
  const colors = useColors();
  const styles = useStyles();
  const cancel = useCancelRequest();
  const services = request.items.map((item) => item.name).join(' + ');
  const pickup = request.bookingType === 'pickup';
  const cancelIt = async (words: string) => {
    try {
      await cancel.mutateAsync(request.id);
      toast.success(words);
    } catch (error) {
      toast.error(errorText(error, "Couldn't cancel it. Try again."));
    }
  };

  return (
    <View style={[styles.card, request.state === 'accepted' ? styles.green : styles.plain]}>
      {request.state === 'waiting' ? (
        <>
          <View style={styles.between}>
            <View style={styles.grow}>
              <T size={11} weight={500} lh={15} uppercase tracking={0.12} color={colors.warning}>
                Request sent
              </T>
              <T size={17} weight={500} lh={24} style={styles.mt4}>
                {`Waiting for ${request.garage.name}`}
              </T>
              <T size={13} lh={18} color={colors.textSecondary}>
                {`${services} · ${request.window.label}`}
              </T>
            </View>
            <View style={styles.right}>
              <T num size={22} lh={28} align="right" accessibilityLabel="Time left for the garage">
                {countdownLabel(Date.parse(request.respondBy) - now)}
              </T>
              <T size={12} lh={16} color={colors.textMuted} align="right">
                {`They reply by ${istClock(request.respondBy)}`}
              </T>
            </View>
          </View>
          <View style={styles.steps}>
            <T size={13} lh={18}>
              {`Sent · ${istClock(request.createdAt)}`}
            </T>
            <View>
              <T size={13} lh={18}>
                {`${request.garage.name} is deciding`}
              </T>
              <T size={12} lh={16} color={colors.textMuted}>
                {`Detlio also calls them if there's no reply in ${REQUEST_RULES.alertAfterMinutes} min.`}
              </T>
            </View>
            <T size={13} lh={18} color={colors.textSecondary}>
              {request.tried.length < request.maxGarages ? 'If not: we ask the next nearest garage, with the same details.' : triedLine(request.tried.length, request.maxGarages)}
            </T>
          </View>
          <View style={styles.foot}>
            <T size={13} lh={18} color={colors.textSecondary}>
              Cancel any time
            </T>
            <ScButton variant="text" fullWidth={false} height={44} disabled={cancel.isPending} onPress={() => void cancelIt('Request cancelled')}>
              Cancel request
            </ScButton>
          </View>
        </>
      ) : null}
      {request.state === 'accepted' && request.acceptedStartAt && request.confirmBy ? (
        <>
          <T size={11} weight={500} lh={15} uppercase tracking={0.12} color={colors.success}>
            Accepted
          </T>
          <T size={17} weight={500} lh={24}>
            {`${request.garage.name} will ${pickup ? 'collect your car' : 'come'} ${istStartLabel(request.acceptedStartAt)}`}
          </T>
          <View style={styles.sums}>
            {request.items.map((item) => (
              <View key={item.serviceId} style={styles.between}>
                <T size={14} lh={20} color={colors.textSecondary} style={styles.grow}>
                  {item.name}
                </T>
                <T num size={14} lh={20}>
                  {money(Number(item.amount))}
                </T>
              </View>
            ))}
            <View style={styles.between}>
              <T size={14} lh={20} color={colors.textSecondary}>
                Travel fee
              </T>
              <T num size={14} lh={20}>
                {request.travelFee ? money(request.travelFee) : 'None'}
              </T>
            </View>
            <View style={[styles.between, styles.total]}>
              <T size={14} lh={20}>
                To pay
              </T>
              <T num size={17} lh={22}>
                {money(requestTotal(request))}
              </T>
            </View>
          </View>
          <View style={styles.held}>
            <IconClockHour4 size={15} color={colors.success} />
            <T size={13} lh={18} color={colors.success} style={styles.grow}>
              {`Held for you until ${istClock(request.confirmBy)} (${countdownLabel(Date.parse(request.confirmBy) - now)} left)`}
            </T>
          </View>
          <ScButton variant="cta" height={48} onPress={() => router.push(confirmHref(request) as Href)}>
            {`Confirm & pay ${money(requestTotal(request))}`}
          </ScButton>
          <ScButton variant="text" height={44} disabled={cancel.isPending} onPress={() => void cancelIt('Request closed')}>
            No thanks
          </ScButton>
        </>
      ) : null}
      {request.state === 'no_garage' || request.state === 'lapsed' ? (
        <>
          <T size={11} weight={500} lh={15} uppercase tracking={0.12} color={colors.textMuted}>
            Update
          </T>
          <T size={17} weight={500} lh={24}>
            {request.state === 'lapsed'
              ? `${request.garage.name}'s yes has expired`
              : request.tried.length > 1
                ? 'No nearby garage could take it this time'
                : `${request.garage.name} can't make it this time`}
          </T>
          <View style={styles.held}>
            <IconInfoCircle size={16} color={colors.textSecondary} />
            <T size={13} lh={18} color={colors.textSecondary} style={styles.grow}>
              {request.state === 'lapsed'
                ? 'It was not confirmed in time. Send a new request whenever you like.'
                : `${triedLine(request.tried.length, request.maxGarages)} Visit a garage instead, or get a free wash when we reach your area.`}
            </T>
          </View>
          <View style={styles.links}>
            <Pressable accessibilityRole="link" onPress={() => router.push('/garages' as Href)} style={styles.link}>
              <T size={14} lh={18}>
                See garages to visit
              </T>
            </Pressable>
            <Pressable accessibilityRole="link" onPress={() => router.push(`/garages?mode=${request.bookingType}` as Href)} style={styles.link}>
              <T size={14} lh={18}>
                Ask another garage
              </T>
            </Pressable>
          </View>
        </>
      ) : null}
      {request.state === 'booked' ? (
        <>
          <View style={styles.bookedRow}>
            <IconCircleCheck size={18} color={colors.success} />
            <T size={17} weight={500} lh={24} style={styles.grow}>
              {`Booked with ${request.garage.name}`}
            </T>
          </View>
          {request.bookingId ? (
            <T size={14} lh={20} style={styles.underline} accessibilityRole="link" onPress={() => router.push(`/bookings/${request.bookingId}` as Href)}>
              See your booking
            </T>
          ) : null}
        </>
      ) : null}
      {request.state === 'cancelled' ? (
        <T size={15} lh={22} color={colors.textSecondary}>
          {request.withdrawnByGarage
            ? `${request.garage.name} can no longer come. Nothing was paid; send a new request any time.`
            : `Request to ${request.garage.name} cancelled`}
        </T>
      ) : null}
    </View>
  );
}

const useStyles = createStyles((c) => ({
  card: { gap: 12, borderRadius: 18, borderWidth: 1, padding: 16 },
  green: { borderColor: c.successFill, backgroundColor: c.successMuted },
  plain: { borderColor: c.border, backgroundColor: c.surface },
  between: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  grow: { flex: 1, minWidth: 0 },
  mt4: { marginTop: 4 },
  right: { flexShrink: 0, alignItems: 'flex-end' },
  steps: { gap: 8, borderLeftWidth: 1, borderLeftColor: c.border, paddingLeft: 16 },
  foot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderTopWidth: 1, borderTopColor: c.line, paddingTop: 12 },
  sums: { gap: 6 },
  total: { borderTopWidth: 1, borderTopColor: c.line, paddingTop: 8 },
  held: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  links: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  link: { minHeight: 44, justifyContent: 'center', borderRadius: 999, borderWidth: 1, borderColor: c.stroke, paddingHorizontal: 16 },
  bookedRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  underline: { textDecorationLine: 'underline' },
}));
