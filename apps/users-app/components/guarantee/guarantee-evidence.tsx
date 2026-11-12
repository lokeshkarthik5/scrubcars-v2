import { useT } from '@repo/core/i18n';
import { angleLabel } from '@repo/core/job-photo-standards';
import type { JobPhoto } from '@repo/core/types';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { useState } from 'react';
import { Image, Pressable, View } from 'react-native';

import { BeforeAfterCompare } from '@/components/booking/before-after';
import { PhotoViewer } from '@/components/booking/photo-viewer';

/** GuaranteeEvidence (packages/ui/src/features/guarantee-photos.tsx). */
export function GuaranteeEvidence({
  customerPhotos,
  garagePhotos,
  customerTitle,
  garageTitle,
}: {
  customerPhotos?: readonly { id: string; url: string }[];
  garagePhotos: readonly JobPhoto[];
  customerTitle?: string;
  garageTitle?: string;
}) {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  const [open, setOpen] = useState<{ url: string; name: string } | null>(null);
  const garage = garagePhotos.filter((photo) => photo.by === 'garage');
  const thumb = (key: string, url: string, name: string) => (
    <Pressable key={key} accessibilityRole="imagebutton" accessibilityLabel={t('View {name}', { name })} onPress={() => setOpen({ url, name })}>
      <Image source={{ uri: url }} style={styles.thumb} />
    </Pressable>
  );
  return (
    <View style={styles.column}>
      {customerPhotos ? (
        <View style={styles.part}>
          <T size={12} weight={500} lh={16}>
            {customerTitle ?? t("Customer's photos of the problem")}
          </T>
          <View style={styles.thumbs}>{customerPhotos.map((photo, i) => thumb(photo.id, photo.url, t('Problem photo {number}', { number: i + 1 })))}</View>
        </View>
      ) : null}
      <View style={styles.part}>
        <T size={12} weight={500} lh={16}>
          {garageTitle ?? t("Garage's before and after photos")}
        </T>
        {garage.length === 0 ? (
          <T size={12} lh={16} color={colors.textSecondary}>
            {t('The garage took no photos of this job.')}
          </T>
        ) : (
          <>
            <BeforeAfterCompare photos={garage} title={t('Compare before and after')} />
            {(['before', 'after'] as const).map((stage) => {
              const photos = garage.filter((photo) => photo.stage === stage);
              return photos.length > 0 ? (
                <View key={stage} style={styles.part}>
                  <T size={11} lh={15} color={colors.textSecondary}>
                    {stage === 'before' ? t('Before') : t('After')}
                  </T>
                  <View style={styles.thumbs}>{photos.map((photo) => thumb(photo.id, photo.url, `${stage === 'before' ? t('Before') : t('After')} — ${angleLabel(photo.angle)}`))}</View>
                </View>
              ) : (
                <T key={stage} size={12} lh={16} color={colors.textSecondary}>
                  {stage === 'before' ? t('No before photos from the garage.') : t('No after photos from the garage.')}
                </T>
              );
            })}
          </>
        )}
      </View>
      <PhotoViewer photo={open} onClose={() => setOpen(null)} />
    </View>
  );
}

const useStyles = createStyles((c) => ({
  column: { gap: 12 },
  part: { gap: 6 },
  thumbs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  thumb: { height: 64, width: 64, borderRadius: 10, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border },
}));
