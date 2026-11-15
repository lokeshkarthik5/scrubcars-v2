import { useT } from '@repo/core/i18n';
import { IconSparkles } from '@repo/native-ui/icons';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { type Href, router } from 'expo-router';
import { View } from 'react-native';

import { Tile } from '@/components/home/tiles';

/**
 * Home's Shine Score tile (0078; the web's components/shine/shine-tile.tsx): the left tile of
 * the row under the car's tiles, the same tile as Book again. Opens the guided photos. Shown
 * only while the API's /shine/config says on.
 */
export function ShineScoreTile() {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  return (
    <Tile label={t('How clean is your car?')} icon={IconSparkles} onPress={() => router.push('/shine' as Href)}>
      <View style={styles.spring} />
      <T size={22} lh={25} tracking={-0.022} numberOfLines={2}>
        {t('Shine Score')}
      </T>
      <T size={13} lh={17} numberOfLines={2} color={colors.dim} style={styles.foot}>
        {t('Free · 4 photos')}
      </T>
    </Tile>
  );
}

const useStyles = createStyles(() => ({
  spring: { flex: 1 },
  foot: { marginTop: 8 },
}));
