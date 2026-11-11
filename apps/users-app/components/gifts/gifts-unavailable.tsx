import { useT } from '@repo/core/i18n';
import { ScButton } from '@repo/native-ui/button';
import { IconGift } from '@repo/native-ui/icons';
import { EmptyState } from '@repo/native-ui/primitives';
import { useColors } from '@repo/native-ui/theme';
import { type Href, router } from 'expo-router';
import { View } from 'react-native';

/** GiftsUnavailable: Gift a wash is switched off at the API (GIFTS_ENABLED). */
export function GiftsUnavailable() {
  const t = useT();
  const colors = useColors();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, paddingHorizontal: 16 }}>
      <EmptyState icon={<IconGift size={32} stroke={1.5} color={colors.textSecondary} />} title={t("Gifts aren't available yet")} subtitle={t('You can still book a wash as usual.')} />
      <ScButton variant="outline" fullWidth={false} onPress={() => router.push('/garages' as Href)}>
        {t('Find garages')}
      </ScButton>
    </View>
  );
}
