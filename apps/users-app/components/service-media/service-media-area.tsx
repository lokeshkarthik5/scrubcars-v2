import { customerMedia, formatClipLength } from '@repo/core/service-media';
import type { Service, ServiceMedia } from '@repo/core/types';
import { IconBuildingStore, IconX } from '@repo/native-ui/icons';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { useEvent } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** "From <garage>": only the garage's own photos and video are shown to a customer. */
function MediaTag({ garageName }: { garageName: string }) {
  const styles = useStyles();
  return (
    <View style={styles.tag}>
      <IconBuildingStore size={15} stroke={1.6} color="#FFFFFF" />
      <T size={13} lh={18} numberOfLines={1} color="rgba(255,255,255,0.75)" style={styles.shrink}>
        {'From '}
        <T size={13} weight={500} lh={18} color="#FFFFFF">
          {garageName}
        </T>
      </T>
    </View>
  );
}

/** ServiceVideo: the poster, then the phone's own player (play, seek, mute, full screen) on tap. */
function ServiceVideo({ video, serviceName, garageName }: { video: ServiceMedia; serviceName: string; garageName: string }) {
  const colors = useColors();
  const styles = useStyles();
  const [started, setStarted] = useState(false);
  // Nothing loads until the tap, as on the web.
  const player = useVideoPlayer(null);
  const { status } = useEvent(player, 'statusChange', { status: player.status });
  const start = () => {
    setStarted(true);
    player.replace(video.url);
    player.play();
  };
  return (
    <View style={styles.hero}>
      {started ? (
        <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls fullscreenOptions={{ enable: true }} />
      ) : (
        <Pressable accessibilityRole="button" accessibilityLabel={`Play the video of ${serviceName}`} onPress={start} style={StyleSheet.absoluteFill}>
          {video.posterUrl ? <Image source={{ uri: video.posterUrl }} resizeMode="cover" style={[StyleSheet.absoluteFill, styles.fill]} /> : null}
          <View style={styles.play}>
            <T size={18} lh={22} color="#FFFFFF">
              ▶
            </T>
          </View>
          {video.durationSecs !== null ? (
            <View style={styles.clip}>
              <T num size={11} weight={500} lh={14} color="#FFFFFF">
                {formatClipLength(video.durationSecs)}
              </T>
            </View>
          ) : null}
        </Pressable>
      )}
      {!started ? (
        <View pointerEvents="none" style={styles.tagAt}>
          <MediaTag garageName={garageName} />
        </View>
      ) : null}
      {started && status === 'error' ? (
        <View style={styles.failed}>
          <T accessibilityRole="alert" size={13} lh={18} align="center" color={colors.white}>
            The video did not load. Check the connection and try again.
          </T>
        </View>
      ) : null}
    </View>
  );
}

/** PhotoViewer: full screen, swipe between them, the counter and dots, close. */
function PhotoViewer({ photos, startIndex, garageName, serviceName, onClose }: { photos: ServiceMedia[]; startIndex: number; garageName: string; serviceName: string; onClose: () => void }) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [index, setIndex] = useState(startIndex);
  return (
    <Modal visible animationType="fade" onRequestClose={onClose}>
      <View style={styles.viewer}>
        <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} contentOffset={{ x: startIndex * width, y: 0 }} onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}>
          {photos.map((photo, i) => (
            <Image key={photo.id} source={{ uri: photo.url }} accessibilityLabel={`Photo ${i + 1} of ${serviceName}`} resizeMode="contain" style={{ width, height: '100%' }} />
          ))}
        </ScrollView>
        <View style={[styles.viewerTop, { top: insets.top + 8 }]}>
          <MediaTag garageName={garageName} />
          <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={styles.close}>
            <IconX size={20} color="#FFFFFF" />
          </Pressable>
        </View>
        {photos.length > 1 ? (
          <View style={[styles.viewerBottom, { bottom: insets.bottom + 16 }]}>
            <T num size={13} lh={18} color="#FFFFFF">{`${index + 1} / ${photos.length}`}</T>
            <View style={styles.dots}>
              {photos.map((photo, i) => (
                <View key={photo.id} style={[styles.dot, i === index && styles.dotOn]} />
              ))}
            </View>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

/** ServiceMediaArea (apps/users/components/service-media/service-media-area.tsx). */
export function ServiceMediaArea({ service, garageName }: { service: Pick<Service, 'media' | 'name'>; garageName: string }) {
  const styles = useStyles();
  const [viewing, setViewing] = useState<number | null>(null);
  const media = customerMedia(service.media);
  const video = media.find((item) => item.kind === 'video') ?? null;
  const photos = media.filter((item) => item.kind === 'image');
  if (!video && photos.length === 0) return null;
  const hero = video ? null : photos[0];
  const thumbs = video ? photos : photos.slice(1);
  return (
    <View style={styles.area}>
      {video ? (
        <ServiceVideo video={video} serviceName={service.name} garageName={garageName} />
      ) : hero ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`Open photo 1 of ${service.name}`} onPress={() => setViewing(0)} style={styles.hero}>
          <Image source={{ uri: hero.url }} resizeMode="cover" style={[StyleSheet.absoluteFill, styles.fill]} />
          <View style={styles.tagAt}>
            <MediaTag garageName={garageName} />
          </View>
        </Pressable>
      ) : null}
      {thumbs.length > 0 ? (
        <View style={styles.thumbs}>
          {thumbs.map((photo) => {
            const index = photos.indexOf(photo);
            return (
              <Pressable key={photo.id} accessibilityRole="button" accessibilityLabel={`Open photo ${index + 1} of ${service.name}`} onPress={() => setViewing(index)} style={styles.thumb}>
                <Image source={{ uri: photo.url }} resizeMode="cover" style={[StyleSheet.absoluteFill, styles.fill]} />
              </Pressable>
            );
          })}
        </View>
      ) : null}
      {viewing !== null ? <PhotoViewer photos={photos} startIndex={viewing} garageName={garageName} serviceName={service.name} onClose={() => setViewing(null)} /> : null}
    </View>
  );
}

const useStyles = createStyles((c) => ({
  area: { gap: 6, marginBottom: 12 },
  hero: { width: '100%', aspectRatio: 16 / 9, overflow: 'hidden', borderRadius: 14, borderWidth: 1, borderColor: c.border, backgroundColor: c.fillSoft },
  fill: { width: '100%', height: '100%' },
  tagAt: { position: 'absolute', left: 10, top: 10, maxWidth: '90%' },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', backgroundColor: 'rgba(0,0,0,0.65)', paddingHorizontal: 10, paddingVertical: 4 },
  shrink: { flexShrink: 1 },
  play: { position: 'absolute', left: '50%', top: '50%', width: 48, height: 48, marginLeft: -24, marginTop: -24, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.6)' },
  clip: { position: 'absolute', right: 8, bottom: 8, borderRadius: 6, backgroundColor: 'rgba(0,0,0,0.75)', paddingHorizontal: 6, paddingVertical: 2 },
  failed: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: 'rgba(0,0,0,0.75)' },
  thumbs: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  thumb: { width: '32%', height: 62, overflow: 'hidden', borderRadius: 10, borderWidth: 1, borderColor: c.border, backgroundColor: c.fillSoft },
  viewer: { flex: 1, backgroundColor: '#000000' },
  viewerTop: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  close: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.65)' },
  viewerBottom: { position: 'absolute', left: 0, right: 0, alignItems: 'center', gap: 8 },
  dots: { flexDirection: 'row', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.35)' },
  dotOn: { backgroundColor: '#FFFFFF' },
}));
