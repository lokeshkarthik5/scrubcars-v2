import { shineShareText } from '@repo/core/shine-score';
import { T } from '@repo/native-ui/text';
import { LinearGradient } from 'expo-linear-gradient';
import { Share, StyleSheet, View } from 'react-native';

import { sharePicture } from '@/components/share-host';
import { WashGauge } from '@/components/moments/wash-gauge';

type ShareInput = { score: number } | { before: number; after: number };

/**
 * The square picture of a score (the web's lib/shine-share.ts): the number, the gauge and
 * the app's name, nothing else. No name, car, plate, place or photo, so it can go anywhere.
 * Laid out at a third of its 1080 px (share-host.tsx).
 */
function ShineSharePicture({ input }: { input: ShareInput }) {
  const score = 'score' in input ? input.score : input.after;
  return (
    <LinearGradient colors={['#1a0b0f', '#09090b']} style={styles.picture}>
      <T size={19} weight={600} color="#fff">
        Shine Score
      </T>
      <View style={styles.gauge}>
        <WashGauge daysSinceWash={score} intervalDays={100} over={false} reversed />
      </View>
      <T num size={56} weight={600} color="#fff" lh={60}>
        {'score' in input ? String(input.score) : `${input.before} → ${input.after}`}
      </T>
      <T size={16} color="rgba(255,255,255,0.6)">
        {'score' in input ? 'out of 100' : 'before → after'}
      </T>
      <View style={styles.spring} />
      <T size={17} weight={600} color="#fff">
        Detlio
      </T>
    </LinearGradient>
  );
}

/** Shares through the phone's share sheet: the picture, or the plain line if it can't be made. */
export async function shareShineScore(input: ShareInput): Promise<void> {
  const ok = await sharePicture(<ShineSharePicture input={input} />, { width: 1080, height: 1080 }, 'Shine Score');
  if (!ok) await Share.share({ message: `${shineShareText(input)} https://detlio.com` }).catch(() => undefined);
}

const styles = StyleSheet.create({
  picture: { flex: 1, alignItems: 'center', paddingTop: 48, paddingBottom: 32, gap: 10 },
  gauge: { transform: [{ scale: 1.6 }], marginVertical: 24 },
  spring: { flex: 1 },
});
