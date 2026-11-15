import { shineOn, useBookingShine, useShineConfig } from '@repo/core/api/hooks/use-shine-score';
import { useT } from '@repo/core/i18n';
import { SHINE_AREA_LABELS, jobPhotoForArea } from '@repo/core/shine-score';
import type { JobPhoto } from '@repo/core/types';
import { IconChevronRight, IconShare } from '@repo/native-ui/icons';
import { ScCard } from '@repo/native-ui/primitives';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { Image, Pressable, View } from 'react-native';

import { shareShineScore } from './shine-share';

/**
 * "Your Shine went 46 → 92" (0075; the web's components/shine/booking-shine-card.tsx): on
 * the booking page once the job is done, from the garage's own before and after photos of
 * the same areas. Nothing while Shine Score is off, while it is being scored, or when the
 * photos share fewer than two areas.
 */
export function BookingShineCard({ bookingId, completed, photos }: { bookingId: string; completed: boolean; photos: JobPhoto[] }) {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  const config = useShineConfig(completed);
  const on = shineOn(config.data) && completed;
  const shine = useBookingShine(bookingId, on);
  const data = shine.data;
  if (!on || data?.state !== 'scored') return null;

  const area = data.biggestChange ?? data.areas[0]?.area ?? null;
  const before = area ? jobPhotoForArea(photos, area, 'before') : null;
  const after = area ? jobPhotoForArea(photos, area, 'after') : null;

  return (
    <ScCard style={styles.card}>
      <T size={12} color={colors.textSecondary} accessibilityRole="header">
        {t('Shine Score, from the garage’s photos')}
      </T>
      <View style={styles.figures} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <T num size={40} weight={500} lh={40} tracking={-0.045} color={colors.textMuted}>
          {data.before}
        </T>
        <IconChevronRight size={18} stroke={1.6} color={colors.textMuted} />
        <T num size={40} weight={500} lh={40} tracking={-0.045}>
          {data.after}
        </T>
      </View>
      <T size={15} lh={21} color={colors.textSecondary}>
        <T size={15} lh={21} weight={500}>
          {t('Your Shine went {before} → {after}.', { before: data.before, after: data.after })}
        </T>
        {data.biggestChange ? ` ${t('Biggest change: {area}.', { area: t(SHINE_AREA_LABELS[data.biggestChange]).toLowerCase() })}` : ''}
      </T>
      {before && after ? (
        <View style={styles.pair}>
          {[
            { photo: before, label: t('Before · {score}', { score: data.before }) },
            { photo: after, label: t('After · {score}', { score: data.after }) },
          ].map(({ photo, label }) => (
            <View key={photo.id} style={styles.photoBox}>
              <Image source={{ uri: photo.url }} style={styles.photo} resizeMode="cover" />
              <View style={styles.caption}>
                <T num size={12} weight={500} color="#fff">
                  {label}
                </T>
              </View>
            </View>
          ))}
        </View>
      ) : null}
      <View style={styles.foot}>
        <T size={12} color={colors.textMuted} style={styles.grow}>
          {t('Scored from the before & after job photos.')}
        </T>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('Share')}
          onPress={() => void shareShineScore({ before: data.before, after: data.after })}
          style={styles.share}
        >
          <IconShare size={16} stroke={1.5} color={colors.textPrimary} />
          <T size={13} weight={500}>
            {t('Share')}
          </T>
        </Pressable>
      </View>
    </ScCard>
  );
}

const useStyles = createStyles((c) => ({
  card: { gap: 12, paddingHorizontal: 20 },
  figures: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pair: { flexDirection: 'row', gap: 8 },
  photoBox: { flex: 1, aspectRatio: 4 / 3, borderRadius: 12, overflow: 'hidden', backgroundColor: c.surface },
  photo: { width: '100%', height: '100%' },
  caption: { position: 'absolute', left: 6, bottom: 6, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 8, paddingVertical: 2 },
  foot: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  grow: { flex: 1, minWidth: 0 },
  share: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8, marginRight: -8 },
}));
