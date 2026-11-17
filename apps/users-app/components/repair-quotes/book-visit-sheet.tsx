import type { CustomerRepairQuote } from '@repo/core/api/repair-quotes';
import { useBookRepairVisit, useRepairVisitTimes } from '@repo/core/api/hooks/use-repair-quotes';
import { useT, useTn } from '@repo/core/i18n';
import { nextFreeDayLabel, nextFreeTimeLabels, upcomingNextFree } from '@repo/core/next-free';
import { priceRangeLabel } from '@repo/core/repair-quotes';
import { ScButton } from '@repo/native-ui/button';
import { Raised, RedLight } from '@repo/native-ui/finish';
import { IconClock, IconInfoCircle } from '@repo/native-ui/icons';
import { PressScale } from '@repo/native-ui/motion';
import { Skeleton } from '@repo/native-ui/primitives';
import { ScSheet } from '@repo/native-ui/sheet';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors, useFinish } from '@repo/native-ui/theme';
import { LinearGradient } from 'expo-linear-gradient';
import { type Href, router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { errorText } from '@/lib/error-text';

/**
 * apps/users/components/repair-quotes/book-visit-sheet.tsx: Book a visit (0076). The
 * garage looks at the car and confirms the price before any work. Booked as today's "price
 * on inspection" visit with no fee (0073): Inspection Free, their estimate as the guide, the
 * garage's next free times for that visit, and "Book visit · Free".
 */
export function BookVisitSheet({ requestId, quote, onClose }: { requestId: string; quote: CustomerRepairQuote | null; onClose: () => void }) {
  const t = useT();
  const tn = useTn();
  const colors = useColors();
  const { fx } = useFinish();
  const styles = useStyles();
  const times = useRepairVisitTimes(requestId, quote?.id ?? null);
  const book = useBookRepairVisit(requestId);
  const [picked, setPicked] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const free = upcomingNextFree(times.data);
  const chosen = picked && free?.times.includes(picked) ? picked : null;

  const close = () => {
    setPicked(null);
    setError(null);
    onClose();
  };

  const confirm = async () => {
    if (!quote || !chosen) return;
    setError(null);
    try {
      const { bookingId } = await book.mutateAsync({ quoteId: quote.id, scheduledAt: chosen });
      close();
      router.push(`/bookings/${bookingId}` as Href);
    } catch (err) {
      setError(errorText(err, t('Couldn’t book the visit. Try again.')));
    }
  };

  return (
    <ScSheet open={quote !== null} onClose={close} dismissible={!book.isPending} accessibilityLabel={t('Book a visit')} horizontalPadding={16}>
      {quote ? (
        <View>
          <T accessibilityRole="header" variant="t2" style={styles.title}>
            {t('Book a visit at {garage}', { garage: quote.garage.name })}
          </T>
          <T size={13} color={colors.textSecondary} style={styles.sub}>
            {t('They look at the car and confirm the price before any work.')}
          </T>
          <View style={styles.rows}>
            <Row label={t('Inspection')} value={t('Free')} />
            <Row label={t('Their estimate')} value={priceRangeLabel(quote.priceFrom ?? 0, quote.priceTo ?? 0)} />
            {quote.days !== null ? <Row label={t('Days needed')} value={tn(quote.days, '{count} day', '{count} days')} last /> : null}
          </View>

          <View style={styles.times}>
            {times.isPending ? (
              <Skeleton height={76} radius={12} />
            ) : !free ? (
              <T size={13} color={colors.textSecondary}>
                {t('No free time at this garage this week. Try another garage.')}
              </T>
            ) : (
              <>
                <View style={styles.nextHead}>
                  <IconClock size={14} color={colors.success} />
                  <T variant="over" color={fx.quiet}>
                    {t('Next free')}
                  </T>
                  <T variant="over" weight={400} color={fx.quiet}>
                    ·
                  </T>
                  <T variant="over" color={fx.soft}>
                    {t(nextFreeDayLabel(free))}
                  </T>
                </View>
                <View accessibilityRole="radiogroup" accessibilityLabel={t('Visit time')} style={styles.timeRow}>
                  {free.times.map((time, i) => {
                    const on = chosen === time;
                    const face = (
                      <>
                        <T num variant="t4" weight={600} color={on ? fx.graphiteInk : fx.soft}>
                          {nextFreeTimeLabels(free)[i]}
                        </T>
                        <RedLight state={on ? 'on' : 'off'} style={styles.light} />
                      </>
                    );
                    return (
                      <PressScale
                        key={time}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: on }}
                        onPress={() => setPicked(time)}
                        style={styles.cell}
                      >
                        {on ? (
                          <View style={styles.time}>
                            <LinearGradient colors={[...fx.graphite]} locations={[0, 0.52, 1]} style={[StyleSheet.absoluteFill, styles.timeFace]} />
                            {face}
                          </View>
                        ) : (
                          <Raised radius={12} style={styles.time} innerStyle={styles.timeInner}>
                            {face}
                          </Raised>
                        )}
                      </PressScale>
                    );
                  })}
                </View>
              </>
            )}
          </View>

          <View style={styles.note}>
            <IconInfoCircle size={14} color={colors.dim} />
            <T size={11} color={colors.dim} style={styles.shrink}>
              {t('The final price is set at the garage. Anything more than the bill needs your OK in the app first.')}
            </T>
          </View>
          {error ? (
            <T accessibilityRole="alert" size={13} color={colors.error} style={styles.error}>
              {error}
            </T>
          ) : null}
          <ScButton
            variant="main"
            size="lg"
            onPress={() => void confirm()}
            disabled={!chosen || book.isPending}
            disabledReason={free && !chosen ? t('Pick a time first') : undefined}
          >
            {book.isPending ? t('Booking…') : t('Book visit · Free')}
          </ScButton>
        </View>
      ) : null}
    </ScSheet>
  );
}

function Row({ label, value, last }: { label: string; value: string; last?: boolean }) {
  const styles = useStyles();
  return (
    <View style={[styles.row, !last && styles.rowLine]}>
      <T size={15}>{label}</T>
      <T num size={15}>
        {value}
      </T>
    </View>
  );
}

const useStyles = createStyles((c) => ({
  title: { paddingTop: 4 },
  sub: { marginTop: 4 },
  rows: { marginTop: 8 },
  row: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowLine: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.line },
  times: { marginTop: 14, gap: 8 },
  nextHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  timeRow: { flexDirection: 'row', gap: 8 },
  cell: { flex: 1 },
  time: { height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  timeFace: { borderRadius: 12 },
  timeInner: { alignItems: 'center', justifyContent: 'center' },
  light: { position: 'absolute', bottom: 4, alignSelf: 'center' },
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginVertical: 14 },
  shrink: { flexShrink: 1 },
  error: { marginBottom: 8 },
}));
