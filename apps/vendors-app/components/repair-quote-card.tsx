import type { GarageRepairQuote } from '@repo/core/api/repair-quotes';
import { useAnswerRepairQuote } from '@repo/core/api/hooks/use-repair-quotes';
import { useNow } from '@repo/core/hooks/use-now';
import { useT } from '@repo/core/i18n';
import { REPAIR_QUOTE_RULES, priceRangeLabel, timeLeftLabel } from '@repo/core/repair-quotes';
import { ScButton } from '@repo/native-ui/button';
import { IconPlayerPlayFilled, IconX } from '@repo/native-ui/icons';
import { ScTextarea } from '@repo/native-ui/inputs';
import { ScCard } from '@repo/native-ui/primitives';
import { ScSheet } from '@repo/native-ui/sheet';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { toast } from '@repo/native-ui/toast';
import { type Href, router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Image, Modal, Pressable, ScrollView, View } from 'react-native';

import { ScBadge } from '@/components/form-controls';
import { errorText } from '@/lib/error-text';
import { CAR_TYPE, CLOSED_WORD } from '@/lib/repair-quote-view';

/**
 * apps/vendors/components/repair-quote-card.tsx: a repair quote in the garage's Requests
 * list (0075). The clock, the damage, the car, how far, the video and pictures, the summary,
 * and Can't do / Can do. Nothing of the customer's but their car and words: no name, no
 * phone (that comes with a booked visit). The video opens in the phone's player through
 * its short private link; nothing is downloaded.
 */

export function carLine(quote: Pick<GarageRepairQuote, 'vehicle'>, t: (english: string) => string) {
  const type = CAR_TYPE[quote.vehicle.type];
  return `${quote.vehicle.label} · ${type ? t(type) : quote.vehicle.type}`;
}

export function RepairMediaRow({ quote }: { quote: GarageRepairQuote }) {
  const t = useT();
  const styles = useStyles();
  const [photo, setPhoto] = useState<string | null>(null);
  return (
    <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.media}>
        {quote.video ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('Play the video, {secs} seconds', { secs: quote.video.secs ?? 0 })}
            onPress={() => void WebBrowser.openBrowserAsync(quote.video!.url).catch(() => toast.error(t('Couldn’t open the video.')))}
            style={styles.video}
          >
            {quote.photos[0] ? <Image source={{ uri: quote.photos[0].url }} style={styles.fill} /> : null}
            <View style={styles.center} pointerEvents="none">
              <IconPlayerPlayFilled size={20} color="#FFFFFF" />
            </View>
            {quote.video.secs !== null ? (
              <T num size={11} weight={600} color="#FFFFFF" style={styles.secs}>
                {`0:${String(quote.video.secs).padStart(2, '0')}`}
              </T>
            ) : null}
          </Pressable>
        ) : null}
        {quote.photos.map((p, index) => (
          <Pressable key={p.url || index} accessibilityRole="button" accessibilityLabel={t('Open picture {n}', { n: index + 1 })} onPress={() => setPhoto(p.url)} style={styles.thumb}>
            <Image source={{ uri: p.url }} style={styles.fill} />
          </Pressable>
        ))}
      </ScrollView>
      <Modal visible={photo !== null} transparent animationType="fade" onRequestClose={() => setPhoto(null)}>
        <View style={styles.viewer}>
          {photo ? <Image source={{ uri: photo }} accessibilityLabel={t('The damage')} resizeMode="contain" style={styles.big} /> : null}
          <Pressable accessibilityRole="button" accessibilityLabel={t('Close')} onPress={() => setPhoto(null)} style={styles.close}>
            <IconX size={18} color="#FFFFFF" />
          </Pressable>
        </View>
      </Modal>
    </>
  );
}

/** Detlio's summary, and what the customer wrote. */
export function RepairBriefBox({ quote }: { quote: GarageRepairQuote }) {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  return (
    <>
      <View style={styles.brief}>
        <T size={12} color={colors.textSecondary}>
          {quote.brief.source === 'customer' ? t('The customer’s summary') : t('Detlio’s summary')}
        </T>
        <T size={14} style={styles.mt2}>
          {quote.brief.text}
        </T>
        <T size={12} color={colors.textSecondary} style={styles.mt6}>
          {t('Customer wrote: “{note}”', { note: quote.note })}
        </T>
      </View>
      {quote.brief.source !== 'customer' ? (
        <T size={12} color={colors.textSecondary}>
          {t('The summary is written by Detlio from the video. Check the video before you quote.')}
        </T>
      ) : null}
    </>
  );
}

export function WaitingRepairQuoteCard({ quote }: { quote: GarageRepairQuote }) {
  const t = useT();
  // Its own clock: the Requests screen does not re-render every second for it.
  const now = useNow(1000);
  const colors = useColors();
  const styles = useStyles();
  const [declining, setDeclining] = useState(false);
  const left = timeLeftLabel(Date.parse(quote.respondBy) - now);
  return (
    <ScCard style={[styles.card, styles.cardWaiting]}>
      <View style={styles.head}>
        <T size={11} weight={600} color={colors.warning} uppercase tracking={0.08} style={styles.flex}>
          {t('Repair quote · new')}
        </T>
        <T num size={13} weight={600} color={colors.warning} accessibilityLabel={t('Time left to answer: {time}', { time: left })}>
          {left}
        </T>
      </View>
      <View>
        <T accessibilityRole="header" size={17} weight={600}>
          {quote.title}
        </T>
        <T size={13} style={styles.mt4}>
          {carLine(quote, t)}
        </T>
        <T size={13} color={colors.textSecondary}>
          {quote.area ? t('{area} · {km} km from you', { area: quote.area, km: quote.distanceKm }) : t('{km} km from you', { km: quote.distanceKm })}
        </T>
      </View>
      <RepairMediaRow quote={quote} />
      <RepairBriefBox quote={quote} />
      <View style={styles.actions}>
        <ScButton variant="outline" fullWidth={false} style={styles.flex} onPress={() => setDeclining(true)}>
          {t('Can’t do')}
        </ScButton>
        <ScButton variant="main" fullWidth={false} style={styles.flex} onPress={() => router.push(`/repair-quote/${quote.id}` as Href)}>
          {t('Can do')}
        </ScButton>
      </View>
      <DeclineSheet quote={quote} open={declining} onClose={() => setDeclining(false)} />
    </ScCard>
  );
}

/** "Can't do", with an optional reason the customer reads. */
function DeclineSheet({ quote, open, onClose }: { quote: GarageRepairQuote; open: boolean; onClose: () => void }) {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  const answer = useAnswerRepairQuote();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const send = async () => {
    setError(null);
    try {
      await answer.mutateAsync({ quoteId: quote.id, answer: { canDo: false, ...(reason.trim() ? { reason: reason.trim() } : {}) } });
      toast.success(t('Sent. The customer can ask other garages.'));
      onClose();
    } catch (err) {
      setError(errorText(err, t('Could not answer. Please try again.')));
    }
  };
  return (
    <ScSheet open={open} onClose={onClose} dismissible={!answer.isPending} accessibilityLabel={t('Can’t do this repair')} horizontalPadding={16}>
      <View style={styles.sheet}>
        <T accessibilityRole="header" size={17} weight={600}>
          {t('Can’t do this repair?')}
        </T>
        <T size={13} color={colors.textSecondary}>
          {quote.title}
        </T>
        <ScTextarea
          label={t('Reason for the customer (optional)')}
          value={reason}
          maxLength={REPAIR_QUOTE_RULES.garageNoteMax}
          rows={2}
          onChangeText={setReason}
          placeholder={t('We don’t do paint work.')}
        />
        {error ? (
          <T accessibilityRole="alert" size={13} color={colors.error}>
            {error}
          </T>
        ) : null}
        <View style={styles.actions}>
          <ScButton variant="outline" fullWidth={false} style={styles.flex} onPress={onClose} disabled={answer.isPending}>
            {t('Keep it')}
          </ScButton>
          <ScButton variant="main" fullWidth={false} style={styles.flex} onPress={() => void send()} disabled={answer.isPending}>
            {answer.isPending ? t('Sending…') : t('Send')}
          </ScButton>
        </View>
      </View>
    </ScSheet>
  );
}

export function ClosedRepairQuoteCard({ quote }: { quote: GarageRepairQuote }) {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  const booked = quote.bookingId !== null;
  return (
    <ScCard style={styles.closed}>
      <View style={styles.head}>
        <T accessibilityRole="header" size={15} weight={600} style={styles.flex}>
          {`${t('Repair quote')} · ${quote.title}`}
        </T>
        <ScBadge variant={booked || quote.state === 'quoted' ? 'success' : 'muted'}>
          {booked ? t('Visit booked') : t(CLOSED_WORD[quote.state] ?? 'Closed')}
        </ScBadge>
      </View>
      <T size={13} color={colors.textSecondary}>
        {carLine(quote, t)}
        {quote.state === 'quoted' && quote.priceFrom !== null && quote.priceTo !== null ? ` · ${priceRangeLabel(quote.priceFrom, quote.priceTo)}` : ''}
      </T>
      {booked ? (
        <Pressable accessibilityRole="link" onPress={() => router.push('/bookings' as Href)} style={styles.link}>
          <T size={13} weight={500}>
            {t('See it on Bookings')}
          </T>
        </Pressable>
      ) : null}
    </ScCard>
  );
}

const useStyles = createStyles((c) => ({
  flex: { flex: 1, minWidth: 0 },
  card: { gap: 12 },
  cardWaiting: { borderColor: c.waitingBorder },
  closed: { gap: 4 },
  head: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  mt2: { marginTop: 2 },
  mt4: { marginTop: 4 },
  mt6: { marginTop: 6 },
  media: { gap: 8 },
  video: { width: 96, height: 72, overflow: 'hidden', borderRadius: 12, backgroundColor: c.surfaceElevated },
  thumb: { width: 72, height: 72, overflow: 'hidden', borderRadius: 12, backgroundColor: c.surfaceElevated },
  fill: { width: '100%', height: '100%' },
  center: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  secs: { position: 'absolute', left: 6, bottom: 4 },
  brief: { borderRadius: 12, borderWidth: 1, borderColor: c.border, backgroundColor: c.canvas, paddingHorizontal: 12, paddingVertical: 10 },
  actions: { flexDirection: 'row', gap: 8 },
  sheet: { gap: 12 },
  link: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  viewer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  big: { width: '100%', height: '80%' },
  close: { position: 'absolute', top: 56, right: 20, width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.6)' },
}));
