import type { CustomerRepairQuote, CustomerRepairRequest } from '@repo/core/api/repair-quotes';
import { useCancelRepairRequest, useMyRepairRequest } from '@repo/core/api/hooks/use-repair-quotes';
import { useNow } from '@repo/core/hooks/use-now';
import { useT, useTn } from '@repo/core/i18n';
import { CUSTOMER_QUOTE_WORD, QUOTE_TONE, showsQuotes } from '@repo/core/repair-quotes';
import { Edge } from '@repo/native-ui/finish';
import { IconCalendarCheck } from '@repo/native-ui/icons';
import { ErrorState, HubCard, Skeleton, StatusChip } from '@repo/native-ui/primitives';
import { ConfirmSheet } from '@repo/native-ui/sheet';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { type Href, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AnswerByRing } from '@/components/moments/answer-by-ring';
import { PageHeader } from '@/components/page-header';
import { BookVisitSheet } from '@/components/repair-quotes/book-visit-sheet';
import { BoxedPhoto, QuoteCard, QuoteLine } from '@/components/repair-quotes/parts';
import { errorText } from '@/lib/error-text';
import { carShortName } from '@/lib/repair-quote-view';

/**
 * apps/users/app/repair-quotes/[id]/page.tsx (0075): while no garage has answered, "Sent to
 * N garages" with the answer-by ring and each garage's state; once any has, the quotes with
 * Book a visit. Cancel while open. Pushes about it open here.
 */
export default function RepairRequestScreen() {
  const t = useT();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const request = useMyRepairRequest(id ?? null);
  const now = useNow(1000);
  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      <PageHeader title={t('Repair quotes')} backTo="/repair-quotes/new" />
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 24 }]}>
        {request.isPending ? (
          <Skeleton height={160} />
        ) : !request.data ? (
          <ErrorState message={t('Couldn’t load this request. Check your connection.')} onRetry={() => void request.refetch()} />
        ) : (
          <Body request={request.data} now={now} />
        )}
      </ScrollView>
    </View>
  );
}

function Body({ request, now }: { request: CustomerRepairRequest; now: number }) {
  const t = useT();
  const tn = useTn();
  const colors = useColors();
  const styles = useStyles();
  const cancel = useCancelRepairRequest();
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | undefined>();
  const [booking, setBooking] = useState<CustomerRepairQuote | null>(null);
  const open = request.state === 'open';
  const quoted = request.quotes.filter((quote) => quote.state === 'quoted');
  const others = request.quotes.filter((quote) => quote.state !== 'quoted');
  const car = carShortName(request.vehicle.label);
  const thumb = request.photos[request.brief.box?.image ?? 0] ?? request.photos[0];

  return (
    <>
      <View style={styles.top}>
        <T size={13} color={colors.dim}>
          {`${request.vehicle.label} · ${request.title}`}
        </T>
        {showsQuotes(request) ? (
          <>
            <T accessibilityRole="header" variant="title">
              {quoted.length === 0 ? t('No quotes yet for your {car}', { car }) : tn(quoted.length, '{count} quote for your {car}', '{count} quotes for your {car}', { car })}
            </T>
            <T size={15} color={colors.textSecondary}>
              {t('Estimates from your video. The garage sets the final price once it sees the car.')}
            </T>
          </>
        ) : (
          <>
            <View style={styles.titleRow}>
              <T accessibilityRole="header" variant="title" style={styles.shrink}>
                {tn(request.sentTo, 'Sent to {count} garage', 'Sent to {count} garages')}
              </T>
              {open && request.answerBy ? <AnswerByRing deadline={{ respondBy: request.answerBy, windowMins: request.answerWindowMins }} now={now} /> : null}
            </View>
            {open ? (
              <T size={15} color={colors.textSecondary}>
                {t('Answers within {hours} working hours. We’ll tell you as each one comes in.', { hours: request.answerWindowMins / 60 })}
              </T>
            ) : null}
          </>
        )}
      </View>

      <StateBanner request={request} />

      {showsQuotes(request) ? (
        <>
          {quoted.map((quote) => (
            <QuoteCard key={quote.id} quote={quote} canBook={open} onBook={setBooking} />
          ))}
          {others.map((quote) => (
            <QuoteLine key={quote.id} quote={quote} />
          ))}
        </>
      ) : (
        <>
          <HubCard style={styles.list} accessibilityLabel={t('Garages asked')}>
            {request.quotes.map((quote, index) => (
              <View key={quote.id} style={[styles.listRow, index > 0 && styles.listLine]}>
                <T size={15} numberOfLines={1} style={styles.shrink}>
                  {quote.garage.name}
                </T>
                <StatusChip tone={QUOTE_TONE[quote.state]}>{t(CUSTOMER_QUOTE_WORD[quote.state])}</StatusChip>
              </View>
            ))}
          </HubCard>
          <Edge innerStyle={styles.briefRow}>
            {thumb ? <BoxedPhoto uri={thumb.url} label={t('Your car')} box={null} style={styles.thumb} /> : null}
            <T size={13} color={colors.textSecondary} style={styles.shrink}>
              {request.brief.text}
            </T>
          </Edge>
        </>
      )}

      {open ? (
        <>
          <T size={13} color={colors.dim} align="center">
            {t('Quotes stay open for {hours} hours.', { hours: 48 })}
          </T>
          <Pressable accessibilityRole="button" onPress={() => setCancelling(true)} style={styles.cancel}>
            <T size={14} color="#A1A1AA">
              {t('Cancel request')}
            </T>
          </Pressable>
        </>
      ) : null}

      <ConfirmSheet
        open={cancelling}
        onClose={() => {
          setCancelling(false);
          setCancelError(undefined);
        }}
        onConfirm={async () => {
          try {
            await cancel.mutateAsync(request.id);
            setCancelling(false);
          } catch (err) {
            setCancelError(errorText(err, t('Couldn’t cancel it. Try again.')));
          }
        }}
        level="light"
        title={t('Cancel this request?')}
        body={t('Garages stop seeing it and can’t send quotes. Nothing was paid.')}
        confirmLabel={t('Cancel request')}
        cancelLabel={t('Keep it')}
        busy={cancel.isPending}
        error={cancelError}
      />
      <BookVisitSheet requestId={request.id} quote={booking} onClose={() => setBooking(null)} />
    </>
  );
}

/** Booked, cancelled or closed: said once, above the garages. */
function StateBanner({ request }: { request: CustomerRepairRequest }) {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  if (request.state === 'booked') {
    const garage = request.quotes.find((quote) => quote.bookingId)?.garage.name;
    return (
      <Edge innerStyle={styles.banner}>
        <View style={[styles.inline, styles.shrink]}>
          <IconCalendarCheck size={18} color={colors.success} />
          <T size={13} style={styles.shrink}>
            {garage ? t('Visit booked at {garage}', { garage }) : t('Visit booked')}
          </T>
        </View>
        {request.bookingId ? (
          <Pressable accessibilityRole="link" onPress={() => router.push(`/bookings/${request.bookingId}` as Href)} style={styles.link}>
            <T size={13} weight={600}>
              {t('See booking')}
            </T>
          </Pressable>
        ) : null}
      </Edge>
    );
  }
  if (request.state === 'cancelled' || request.state === 'expired') {
    return (
      <Edge innerStyle={styles.banner}>
        <T size={13} color={colors.textSecondary} style={styles.shrink}>
          {request.state === 'cancelled' ? t('You cancelled this request.') : t('This request has closed.')}
        </T>
        <Pressable accessibilityRole="link" onPress={() => router.push('/repair-quotes/new' as Href)} style={styles.link}>
          <T size={13} weight={600}>
            {t('Send a new one')}
          </T>
        </Pressable>
      </Edge>
    );
  }
  return null;
}

const useStyles = createStyles((c) => ({
  page: { flex: 1, backgroundColor: c.canvas },
  body: { paddingHorizontal: 16, paddingTop: 8, gap: 12 },
  top: { gap: 4, paddingBottom: 4 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  shrink: { flexShrink: 1, minWidth: 0 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  list: { paddingHorizontal: 20 },
  listRow: { minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  listLine: { borderTopWidth: 1, borderTopColor: c.line },
  briefRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  thumb: { width: 76, height: 56, borderRadius: 10 },
  cancel: { alignSelf: 'center', minHeight: 44, justifyContent: 'center', paddingHorizontal: 12 },
  banner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: 16 },
  link: { minHeight: 44, justifyContent: 'center' },
}));
