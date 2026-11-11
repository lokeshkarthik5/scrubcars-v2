import { useDismissOffer } from '@repo/core/api/hooks/use-home';
import type { HomeOffer } from '@repo/core/api/home';
import { offerFigureOf, offerMetaLines } from '@repo/core/home-display';
import { useT } from '@repo/core/i18n';
import { formatOfferFigure, stripOfferCode, type OfferFigureSize } from '@repo/core/offer-figure';
import { IconArrowUpRight, IconBuildingStore, IconSparkles, IconX } from '@repo/native-ui/icons';
import { PressRow } from '@repo/native-ui/primitives';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { type Href, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, useWindowDimensions, View } from 'react-native';

import { usePendingCheckout } from '@/lib/pending-checkout';

const GAP = 8;
/** packages/ui/styles/globals.css, offer-coupon__figure[data-size]. */
const FIGURE_SIZE: Record<OfferFigureSize, number> = { percent: 40, amount: 34, 'amount-sm': 26, 'amount-xs': 20, free: 26 };

function Coupon({ offer, hasCar, muted, onSelect, onDismiss, width }: {
  offer: HomeOffer;
  hasCar: boolean;
  muted: boolean;
  onSelect: () => void;
  onDismiss: () => void;
  width: number;
}) {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  const fig = formatOfferFigure(offerFigureOf(offer));
  const code = offer.code.trim();
  const meta = offerMetaLines(offer, { hasCar }).map((line) => stripOfferCode(line, code)).filter(Boolean);
  const Eyebrow = offer.vendorId ? IconBuildingStore : IconSparkles;
  const label = offer.vendorId ? (offer.vendorName ?? t('Garage')) : 'Detlio';
  return (
    <View style={[styles.ticket, { width, opacity: muted ? 0.72 : 1 }]}>
      <PressRow
        accessibilityLabel={[t('{title} at {name}', { title: offer.title, name: label }), code && t('code {code}', { code }), ...meta, t('use offer')].filter(Boolean).join(', ')}
        onPress={onSelect}
        style={styles.hit}
      >
        <View style={styles.main}>
          <View style={styles.eyebrow}>
            <Eyebrow size={15} stroke={1.5} color={colors.dim} />
            <T size={13} numberOfLines={1} color={colors.dim} style={styles.shrink}>
              {t('{label} · Offer', { label })}
            </T>
          </View>
          <T size={20} lh={24} tracking={-0.022} numberOfLines={2} style={styles.title}>
            {offer.title}
          </T>
          {meta.map((line, i) => (
            <T key={i} size={13} lh={17} numberOfLines={1} color={colors.textSoft} style={i === 0 ? styles.meta : undefined}>
              {line}
            </T>
          ))}
        </View>
        <View style={styles.stub}>
          <T num size={FIGURE_SIZE[fig.size]} weight={500} lh={FIGURE_SIZE[fig.size] + 4} tracking={-0.03}>
            {fig.prefix ? <T num size={Math.min(20, FIGURE_SIZE[fig.size])} weight={500}>{fig.prefix}</T> : null}
            {fig.value}
            {fig.suffix ? <T num size={18} weight={500}>{fig.suffix}</T> : null}
          </T>
          {code ? (
            <View style={styles.code}>
              <T num size={11} weight={500} lh={14} tracking={0.04} numberOfLines={1} color={colors.redText} style={styles.shrink}>
                {code}
              </T>
              <IconArrowUpRight size={14} stroke={1.8} color={colors.redText} />
            </View>
          ) : null}
        </View>
      </PressRow>
      <Pressable accessibilityRole="button" accessibilityLabel={t('Hide offer')} onPress={onDismiss} style={styles.dismiss}>
        <IconX size={18} stroke={1.5} color={colors.dim} />
      </Pressable>
    </View>
  );
}

/**
 * HomeOffers + OfferCoupon/OfferCarousel: up to three tickets in Home's one swipe row. A tap
 * remembers the code and goes where it can be used; × hides the offer for good.
 */
export function HomeOffers({
  offers,
  userId,
  vehicleId,
  hasCar,
  muted,
  onNeedCar,
}: {
  offers: HomeOffer[];
  userId: string;
  vehicleId: string | null;
  hasCar: boolean;
  muted: boolean;
  onNeedCar: (go: (carId: string) => void) => void;
}) {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  const dismiss = useDismissOffer();
  const rememberOffer = usePendingCheckout((s) => s.rememberOffer);
  const { width: screen } = useWindowDimensions();
  const [active, setActive] = useState(0);
  const one = offers.length === 1;
  const width = one ? screen - 32 : screen - 32 - 16;

  const go = (offer: HomeOffer, carId: string | null) => {
    rememberOffer({ userId, code: offer.code, vendorId: offer.vendorId, vehicleId: carId, endsAt: offer.endsAt });
    if (offer.vendorId) router.push(`/garage/${offer.vendorId}?code=${encodeURIComponent(offer.code)}` as Href);
    else router.navigate('/garages' as Href);
  };

  return (
    <View>
      <ScrollView
        horizontal
        accessibilityLabel={t('Offers')}
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={width + GAP}
        snapToAlignment="start"
        scrollEnabled={!one}
        style={styles.track}
        contentContainerStyle={styles.trackInner}
        scrollEventThrottle={100}
        onScroll={(e) => setActive(Math.round(e.nativeEvent.contentOffset.x / (width + GAP)))}
      >
        {offers.map((offer) => (
          <Coupon
            key={offer.id}
            offer={offer}
            hasCar={hasCar}
            muted={muted}
            width={width}
            onSelect={() => (hasCar ? go(offer, vehicleId) : onNeedCar((carId) => go(offer, carId)))}
            onDismiss={() => dismiss.mutate(offer.id)}
          />
        ))}
      </ScrollView>
      {one ? null : (
        <View style={styles.dots}>
          {offers.map((offer, i) => (
            <View key={offer.id} style={[styles.dot, { backgroundColor: i === active ? colors.textPrimary : colors.stroke }]} />
          ))}
        </View>
      )}
    </View>
  );
}

const useStyles = createStyles((c) => ({
  track: { marginHorizontal: -16 },
  trackInner: { gap: GAP, paddingHorizontal: 16 },
  ticket: { borderRadius: 28, overflow: 'hidden', borderWidth: 1, borderColor: c.scheme === 'light' ? c.border : c.line, backgroundColor: c.scheme === 'light' ? c.surface : c.cardBottom },
  hit: { flexDirection: 'row', minHeight: 120 },
  main: { flex: 1, minWidth: 0, paddingTop: 16, paddingRight: 12, paddingBottom: 16, paddingLeft: 20 },
  eyebrow: { height: 20, flexDirection: 'row', alignItems: 'center', gap: 6 },
  shrink: { flexShrink: 1, minWidth: 0 },
  title: { marginTop: 8 },
  meta: { marginTop: 4 },
  stub: {
    width: 104,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 6,
    borderLeftWidth: 1,
    borderStyle: 'dashed',
    borderColor: c.scheme === 'light' ? c.stroke : '#3A3A42',
    backgroundColor: c.scheme === 'light' ? c.canvas : '#121215',
  },
  code: { flexDirection: 'row', alignItems: 'center', gap: 2, maxWidth: '100%' },
  dismiss: { position: 'absolute', right: 2, top: 2, width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  dots: { marginTop: 8, flexDirection: 'row', justifyContent: 'center', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3 },
}));
