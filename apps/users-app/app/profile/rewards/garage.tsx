import { garageLive, useGarageAlbum, useGaragePulls } from '@repo/core/api/hooks/use-garage';
import { useRewardsConfig } from '@repo/core/api/hooks/use-rewards';
import { ScButton } from '@repo/native-ui/button';
import { IconCards } from '@repo/native-ui/icons';
import { EmptyState, ErrorState, Skeleton } from '@repo/native-ui/primitives';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { type Href, router, useLocalSearchParams } from 'expo-router';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { firstNameOf, GarageAlbumView } from '@/components/collect/garage-album';
import { PullRevealSheet } from '@/components/collect/pull-reveal-sheet';
import { PageHeader } from '@/components/page-header';
import { useAuth } from '@/lib/auth';

/** apps/users/app/profile/rewards/garage/page.tsx. */
export default function GarageScreen() {
  const colors = useColors();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { pull } = useLocalSearchParams<{ pull?: string }>();
  const user = useAuth((s) => s.user);
  const config = useRewardsConfig();
  const on = garageLive(config.data);
  const album = useGarageAlbum(on && !!user);
  const pulls = useGaragePulls(on && !!user);
  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      <PageHeader title="Detlio Garage" backTo="/profile/rewards" />
      {!user ? (
        <View style={styles.center}>
          <T size={15} weight={600} align="center">
            Sign in to see your Garage
          </T>
          <ScButton variant="main" fullWidth={false} paddingX={32} onPress={() => router.push(`/login?next=${encodeURIComponent('/profile/rewards/garage')}` as Href)}>
            Sign in
          </ScButton>
        </View>
      ) : !config.isPending && !on ? (
        <View style={styles.center}>
          <EmptyState icon={<IconCards size={32} stroke={1.5} color={colors.textSecondary} />} title="The Garage isn't open right now" subtitle="Your rewards are still on the Rewards page." />
          <ScButton variant="outline" fullWidth={false} onPress={() => router.push('/profile/rewards' as Href)}>
            Detlio Rewards
          </ScButton>
        </View>
      ) : (
        <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 24 }]}>
          {config.isPending || album.isPending ? (
            <>
              <Skeleton height={160} />
              <Skeleton height={160} />
            </>
          ) : album.isError || !album.data ? (
            <ErrorState message="Couldn't load your Garage. Check your connection." onRetry={() => void album.refetch()} />
          ) : (
            <>
              <GarageAlbumView album={album.data} firstName={firstNameOf(user.name)} />
              {pulls.data && pulls.data.unseen > 0 ? <PullRevealSheet pulls={pulls.data.pulls} focusId={pull ?? null} firstName={firstNameOf(user.name)} /> : null}
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const useStyles = createStyles((c) => ({
  page: { flex: 1, backgroundColor: c.canvas },
  body: { gap: 14, paddingHorizontal: 16, paddingTop: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, paddingHorizontal: 16 },
}));
