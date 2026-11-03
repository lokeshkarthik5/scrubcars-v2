import type { JobPhoto } from '@repo/core/types';
import { ScCard } from '@repo/native-ui/primitives';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { useState } from 'react';
import { Image, Pressable, View } from 'react-native';

import { BeforeAfterCompare } from './before-after';
import { PhotoViewer } from './photo-viewer';

const STAGES: { stage: JobPhoto['stage']; label: string }[] = [
  { stage: 'before', label: 'Before' },
  { stage: 'after', label: 'After' },
];

/** JobPhotosCard (apps/users/components/job-photos-card.tsx). */
export function JobPhotosCard({ photos: all, completed = false }: { photos: JobPhoto[]; completed?: boolean }) {
  const colors = useColors();
  const styles = useStyles();
  const [open, setOpen] = useState<{ url: string; name: string } | null>(null);
  const photos = all.filter((photo) => photo.by === 'garage');
  if (photos.length === 0) return null;
  return (
    <ScCard style={styles.card}>
      <T size={14} weight={600} lh={20}>
        Job photos
      </T>
      {completed ? <BeforeAfterCompare photos={all} /> : null}
      {STAGES.map(({ stage, label }) => {
        const ofStage = photos.filter((photo) => photo.stage === stage);
        if (ofStage.length === 0) return null;
        return (
          <View key={stage} style={styles.stage}>
            <T size={11} weight={500} lh={15} uppercase tracking={0.05} color={colors.textSecondary}>
              {label}
            </T>
            <View style={styles.thumbs}>
              {ofStage.map((photo, i) => {
                const name = `${label} photo ${i + 1} of ${ofStage.length}`;
                return (
                  <Pressable key={photo.id} accessibilityRole="imagebutton" accessibilityLabel={`View ${name.toLowerCase()}`} onPress={() => setOpen({ url: photo.url, name })}>
                    <Image source={{ uri: photo.url }} style={styles.thumb} />
                  </Pressable>
                );
              })}
            </View>
          </View>
        );
      })}
      <PhotoViewer photo={open} onClose={() => setOpen(null)} />
    </ScCard>
  );
}

const useStyles = createStyles((c) => ({
  card: { gap: 12 },
  stage: { gap: 6 },
  thumbs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  thumb: { height: 64, width: 64, borderRadius: 10, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border },
}));
