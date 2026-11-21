import type { CustomerRepairQuote, RepairBox } from '@repo/core/api/repair-quotes';
import { useT, useTn } from '@repo/core/i18n';
import { priceRangeLabel } from '@repo/core/repair-quotes';
import { Edge, Raised } from '@repo/native-ui/finish';
import { IconCheck, IconClock, IconEye } from '@repo/native-ui/icons';
import { DetlioMark } from '@repo/native-ui/rating-marks';
import { StatusChip } from '@repo/native-ui/primitives';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { Image, Pressable, type StyleProp, View, type ViewStyle } from 'react-native';

/**
 * The parts of the repair-quote screens (0076), each the web's of the same name
 * (apps/users/components/repair-quotes): the boxed photo, a garage's line, its quote
 * card and the line for one that can't do it or hasn't answered.
 */

/** BoxedPhoto: a picture with Detlio's red box on the damage and the damage in a few words. */
export function BoxedPhoto({
  uri,
  label,
  box,
  caption,
  style,
}: {
  uri: string;
  label: string;
  box: RepairBox | null;
  caption?: string | null;
  style?: StyleProp<ViewStyle>;
}) {
  const styles = useStyles();
  return (
    <View style={[styles.photo, style]}>
      <Image source={{ uri }} accessibilityLabel={label} resizeMode="cover" style={styles.fill} />
      {box ? (
        <>
          <View
            pointerEvents="none"
            style={[styles.box, { left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.w * 100}%`, height: `${box.h * 100}%` }]}
          />
          {caption ? (
            <View pointerEvents="none" style={[styles.caption, { left: `${Math.min(box.x * 100, 60)}%`, top: `${Math.min((box.y + box.h) * 100 + 2, 86)}%` }]}>
              <T size={11} weight={600} color="#FFFFFF" numberOfLines={1}>
                {caption}
              </T>
            </View>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

/** "d. 4.8 (126) · 2.1 km", or "New on Detlio · 2.1 km". */
export function GarageLine({ quote }: { quote: CustomerRepairQuote }) {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  return (
    <View style={styles.garageLine}>
      {quote.garage.rating !== null ? (
        <>
          <DetlioMark size={14} rating={quote.garage.rating} />
          <T num size={13} weight={500} accessibilityElementsHidden importantForAccessibility="no">
            {quote.garage.rating.toFixed(1)}
          </T>
          <T num size={13} color={colors.textSecondary}>
            {`(${quote.garage.reviewCount}) ·`}
          </T>
        </>
      ) : (
        <T size={13} color={colors.textSecondary}>
          {`${t('New on Detlio')} ·`}
        </T>
      )}
      <T num size={13} color={colors.textSecondary}>
        {`${quote.distanceKm.toFixed(1)} km`}
      </T>
    </View>
  );
}

function Pill({ icon, children }: { icon: React.ReactNode; children: string }) {
  const styles = useStyles();
  return (
    <Raised radius={999} innerStyle={styles.pill}>
      {icon}
      <T size={11} weight={500} color="#D4D4DA">
        {children}
      </T>
    </Raised>
  );
}

/** QuoteCard: one garage's "Can do", and Book a visit while the request is open. */
export function QuoteCard({ quote, canBook, onBook }: { quote: CustomerRepairQuote; canBook: boolean; onBook: (quote: CustomerRepairQuote) => void }) {
  const t = useT();
  const tn = useTn();
  const colors = useColors();
  const styles = useStyles();
  return (
    <Edge innerStyle={styles.card}>
      <View style={styles.head}>
        <View style={styles.shrink}>
          <T accessibilityRole="header" size={15} weight={600} numberOfLines={1}>
            {quote.garage.name}
          </T>
          <GarageLine quote={quote} />
        </View>
        <StatusChip tone="done">{t('Can do')}</StatusChip>
      </View>
      <View style={styles.priceRow}>
        <T num size={22} weight={600} lh={24}>
          {priceRangeLabel(quote.priceFrom ?? 0, quote.priceTo ?? 0)}
        </T>
        {quote.days !== null ? (
          <View style={styles.days}>
            <IconClock size={14} color="#A8A8B2" />
            <T num size={13} color="#A8A8B2">
              {tn(quote.days, '{count} day', '{count} days')}
            </T>
          </View>
        ) : null}
      </View>
      {quote.needsInspection || quote.billsMatchQuotes ? (
        <View style={styles.pills}>
          {quote.needsInspection ? <Pill icon={<IconEye size={13} color="#D4D4DA" />}>{t('Needs to see the car')}</Pill> : null}
          {quote.billsMatchQuotes ? <Pill icon={<IconCheck size={13} color={colors.success} />}>{t('Final bills match quotes')}</Pill> : null}
        </View>
      ) : null}
      {quote.note ? (
        <T size={13} color="#A1A1AA">
          {`“${quote.note}”`}
        </T>
      ) : null}
      {canBook ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('Book a visit at {garage}', { garage: quote.garage.name })}
          onPress={() => onBook(quote)}
          style={styles.book}
        >
          <T size={13} weight={600}>
            {t('Book a visit')}
          </T>
        </Pressable>
      ) : null}
    </Edge>
  );
}

/** QuoteLine: a garage that can't do it, or hasn't answered. */
export function QuoteLine({ quote }: { quote: CustomerRepairQuote }) {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  const word = quote.state === 'declined' ? t('Can’t do') : quote.state === 'waiting' ? t('Waiting') : t('No answer');
  return (
    <Edge innerStyle={styles.line}>
      <View style={styles.shrink}>
        <T size={15} weight={500} color="#D4D4DA" numberOfLines={1}>
          {quote.garage.name}
        </T>
        {quote.state === 'declined' && quote.declineReason ? (
          <T size={13} color={colors.dim}>
            {`“${quote.declineReason}”`}
          </T>
        ) : (
          <GarageLine quote={quote} />
        )}
      </View>
      <StatusChip tone="closed">{word}</StatusChip>
    </Edge>
  );
}

const useStyles = createStyles((c) => ({
  photo: { overflow: 'hidden', borderRadius: 14, backgroundColor: c.surfaceElevated },
  fill: { width: '100%', height: '100%' },
  box: {
    position: 'absolute',
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#FF2D4A',
    shadowColor: '#FF2D4A',
    shadowOpacity: 0.55,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 0 },
  },
  caption: { position: 'absolute', maxWidth: '60%', borderRadius: 6, backgroundColor: 'rgba(0,0,0,0.75)', paddingHorizontal: 6, paddingVertical: 2 },
  garageLine: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  card: { gap: 10, padding: 16 },
  line: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: 16 },
  head: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  shrink: { flexShrink: 1, minWidth: 0 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 14 },
  days: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 32, paddingHorizontal: 12 },
  book: { height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' },
}));
