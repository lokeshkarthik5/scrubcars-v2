import { useSavedGarages } from '@repo/core/api/hooks/use-favourites';
import { useT } from '@repo/core/i18n';
import { ScButton } from '@repo/native-ui/button';
import { IconHeart } from '@repo/native-ui/icons';
import { EmptyState, ErrorState, Skeleton } from '@repo/native-ui/primitives';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { type Href, router } from 'expo-router';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { VendorCard } from '@/components/garage/vendor-card';
import { PageHeader } from '@/components/page-header';
import { useAuth } from '@/lib/auth';

/** apps/users/app/profile/saved-garages/page.tsx. */
export default function SavedGaragesScreen() {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const user = useAuth((s) => s.user);
  const saved = useSavedGarages({ enabled: !!user });
  const vendors = saved.data?.vendors ?? [];
  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      <PageHeader title={t('Saved garages')} backTo="/profile" />
      {!user ? (
        <View style={styles.center}>
          <T size={15} weight={600} align="center">
            {t('Sign in to see your saved garages')}
          </T>
          <ScButton variant="main" fullWidth={false} paddingX={32} onPress={() => router.push(`/login?next=${encodeURIComponent('/profile/saved-garages')}` as Href)}>
            {t('Sign in')}
          </ScButton>
        </View>
      ) : (
        <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 24 }]}>
          {saved.isPending ? (
            <>
              <Skeleton height={220} />
              <Skeleton height={220} />
            </>
          ) : saved.isError && vendors.length === 0 ? (
            <ErrorState message={t("Couldn't load your saved garages. Check your connection.")} onRetry={() => void saved.refetch()} />
          ) : vendors.length === 0 ? (
            <View style={styles.none}>
              <EmptyState icon={<IconHeart size={32} stroke={1.5} color={colors.textSecondary} />} title={t('No saved garages yet')} subtitle={t('Tap the heart on a garage to keep it here.')} />
              <ScButton variant="outline" fullWidth={false} onPress={() => router.push('/garages' as Href)}>
                {t('Find garages')}
              </ScButton>
            </View>
          ) : (
            vendors.map((vendor) => <VendorCard key={vendor.id} vendor={vendor} note={vendor.bookingsPaused ? t('Not taking bookings right now') : null} />)
          )}
        </ScrollView>
      )}
    </View>
  );
}

const useStyles = createStyles((c) => ({
  page: { flex: 1, backgroundColor: c.canvas },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  body: { paddingHorizontal: 16, paddingTop: 8, gap: 12 },
  none: { alignItems: 'center', gap: 12 },
}));
