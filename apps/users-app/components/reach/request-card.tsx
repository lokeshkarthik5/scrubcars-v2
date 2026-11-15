import type { CustomerRequest } from '@repo/core/api/booking-requests';
import { useCancelRequest } from '@repo/core/api/hooks/use-booking-requests';
import { countdownLabel, istClock, istStartLabel, REQUEST_RULES, triedLine } from '@repo/core/booking-requests';
import { useT } from '@repo/core/i18n';
import { pickupLineLabel, requestFeeAcceptedNote, requestFeeWaitingLine } from '@repo/core/pickup-fee';
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
  const t = useT();
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
      toast.error(errorText(error, t("Couldn't cancel it. Try again.")));
    }
  };

  return (
    <View style={[styles.card, request.state === 'accepted' ? styles.green : styles.plain]}>
      {request.state === 'waiting' ? (
        <>
          <View style={styles.between}>
            <View style={styles.grow}>
              <T size={11} weight={500} lh={15} uppercase tracking={0.12} color={colors.warning}>
                {t('Request sent')}
              </T>
              <T size={17} weight={500} lh={24} style={styles.mt4}>
                {t('Waiting for {name}', { name: request.garage.name })}
              </T>
              <T size={13} lh={18} color={colors.textSecondary}>
                {`${services} · ${request.window.label}`}
              </T>
            </View>
            <View style={styles.right}>
              <T num size={22} lh={28} align="right" accessibilityLabel={t('Time left for the garage')}>
                {countdownLabel(Date.parse(request.respondBy) - now)}
              </T>
              <T size={12} lh={16} color={colors.textMuted} align="right">
                {t('They reply by {time}', { time: istClock(request.respondBy) })}
              </T>
            </View>
          </View>
          <View style={styles.steps}>
            <T size={13} lh={18}>
              {t('Sent · {time}', { time: istClock(request.createdAt) })}
            </T>
            <View>
              <T size={13} lh={18}>
                {t('{name} is deciding', { name: request.garage.name })}
              </T>
              <T size={12} lh={16} color={colors.textMuted}>
                {t("Detlio also calls them if there's no reply in {minutes} min.", { minutes: REQUEST_RULES.alertAfterMinutes })}
              </T>
            </View>
            {/* Ask for pickup (0079): Detlio's suggestion and the most the garage may ask. */}
            {pickup && request.suggestedFee != null && request.maxFee != null ? (
              <T size={13} lh={18}>
                {requestFeeWaitingLine(request.suggestedFee, request.maxFee)}
              </T>
            ) : null}
            <T size={13} lh={18} color={colors.textSecondary}>
              {request.tried.length < request.maxGarages ? t('If not: we ask the next nearest garage, with the same details.') : triedLine(request.tried.length, request.maxGarages)}
            </T>
          </View>
          <View style={styles.foot}>
            <T size={13} lh={18} color={colors.textSecondary}>
              {t('Cancel any time')}
            </T>
            <ScButton variant="text" fullWidth={false} height={44} disabled={cancel.isPending} onPress={() => void cancelIt(t('Request cancelled'))}>
              {t('Cancel request')}
            </ScButton>
          </View>
        </>
      ) : null}
      {request.state === 'accepted' && request.acceptedStartAt && request.confirmBy ? (
        <>
          <T size={11} weight={500} lh={15} uppercase tracking={0.12} color={colors.success}>
            {t('Accepted')}
          </T>
          <T size={17} weight={500} lh={24}>
            {pickup
              ? t('{name} will collect your car {when}', { name: request.garage.name, when: istStartLabel(request.acceptedStartAt) })
              : t('{name} will come {when}', { name: request.garage.name, when: istStartLabel(request.acceptedStartAt) })}
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
            {pickup ? (
              // The pickup fee the garage said yes at (0079), in place of the travel fee: locked from here.
              <View>
                <View style={styles.between}>
                  <T size={14} lh={20} color={colors.textSecondary}>
                    {pickupLineLabel(request.roadKm)}
                  </T>
                  <T num size={14} lh={20}>
                    {request.travelFee ? money(request.travelFee) : t('Free')}
                  </T>
                </View>
                {request.suggestedFee != null && request.maxFee != null && request.suggestedFee > 0 ? (
                  <T size={12} lh={16} color={colors.textMuted}>
                    {requestFeeAcceptedNote(request.suggestedFee, request.maxFee)}
                  </T>
                ) : null}
              </View>
            ) : (
              <View style={styles.between}>
                <T size={14} lh={20} color={colors.textSecondary}>
                  {t('Travel fee')}
                </T>
                <T num size={14} lh={20}>
                  {request.travelFee ? money(request.travelFee) : t('None')}
                </T>
              </View>
            )}
            <View style={[styles.between, styles.total]}>
              <T size={14} lh={20}>
                {t('To pay')}
              </T>
              <T num size={17} lh={22}>
                {money(requestTotal(request))}
              </T>
            </View>
          </View>
          <View style={styles.held}>
            <IconClockHour4 size={15} color={colors.success} />
            <T size={13} lh={18} color={colors.success} style={styles.grow}>
              {t('Held for you until {time} ({left} left)', { time: istClock(request.confirmBy), left: countdownLabel(Date.parse(request.confirmBy) - now) })}
            </T>
          </View>
          <ScButton variant="cta" height={48} onPress={() => router.push(confirmHref(request) as Href)}>
            {t('Confirm & pay {amount}', { amount: money(requestTotal(request)) })}
          </ScButton>
          <ScButton variant="text" height={44} disabled={cancel.isPending} onPress={() => void cancelIt(t('Request closed'))}>
            {t('No thanks')}
          </ScButton>
        </>
      ) : null}
      {request.state === 'no_garage' || request.state === 'lapsed' ? (
        <>
          <T size={11} weight={500} lh={15} uppercase tracking={0.12} color={colors.textMuted}>
            {t('Update')}
          </T>
          <T size={17} weight={500} lh={24}>
            {request.state === 'lapsed'
              ? t("{name}'s yes has expired", { name: request.garage.name })
              : request.tried.length > 1
                ? t('No nearby garage could take it this time')
                : t("{name} can't make it this time", { name: request.garage.name })}
          </T>
          <View style={styles.held}>
            <IconInfoCircle size={16} color={colors.textSecondary} />
            <T size={13} lh={18} color={colors.textSecondary} style={styles.grow}>
              {request.state === 'lapsed'
                ? t('It was not confirmed in time. Send a new request whenever you like.')
                : `${triedLine(request.tried.length, request.maxGarages)} ${t('Visit a garage instead, or get a free wash when we reach your area.')}`}
            </T>
          </View>
          <View style={styles.links}>
            <Pressable accessibilityRole="link" onPress={() => router.push('/garages' as Href)} style={styles.link}>
              <T size={14} lh={18}>
                {t('See garages to visit')}
              </T>
            </Pressable>
            <Pressable accessibilityRole="link" onPress={() => router.push(`/garages?mode=${request.bookingType}` as Href)} style={styles.link}>
              <T size={14} lh={18}>
                {t('Ask another garage')}
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
              {t('Booked with {name}', { name: request.garage.name })}
            </T>
          </View>
          {request.bookingId ? (
            <T size={14} lh={20} style={styles.underline} accessibilityRole="link" onPress={() => router.push(`/bookings/${request.bookingId}` as Href)}>
              {t('See your booking')}
            </T>
          ) : null}
        </>
      ) : null}
      {request.state === 'cancelled' ? (
        <T size={15} lh={22} color={colors.textSecondary}>
          {request.withdrawnByGarage
            ? t('{name} can no longer come. Nothing was paid; send a new request any time.', { name: request.garage.name })
            : t('Request to {name} cancelled', { name: request.garage.name })}
        </T>
      ) : null}
    </View>
  );
}

const useStyles = createStyles((c) => ({
  card: { gap: 12, borderRadius: 18, borderWidth: 1, padding: 16 },
  green: { borderColor: c.acceptedBorder, backgroundColor: c.acceptedBg },
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
