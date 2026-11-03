import { useMyRequests } from '@repo/core/api/hooks/use-booking-requests';
import { useNow } from '@repo/core/hooks/use-now';
import { ScButton } from '@repo/native-ui/button';
import { IconSend } from '@repo/native-ui/icons';
import { EmptyState, ErrorState, Skeleton } from '@repo/native-ui/primitives';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { type Href, router } from 'expo-router';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FreeWashPiece } from '@/components/reach/free-wash';
import { PageHeader } from '@/components/page-header';
import { RequestCard } from '@/components/reach/request-card';
import { useAuth } from '@/lib/auth';

/** apps/users/app/requests/page.tsx. */
export default function RequestsScreen() {
  const colors = useColors();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const user = useAuth((s) => s.user);
  const requests = useMyRequests({ enabled: !!user });
  const now = useNow(1000);
  const items = requests.data ?? [];
  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      <PageHeader title="Your requests" />
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 24 }]}>
        {requests.isPending ? (
          <Skeleton height={132} />
        ) : requests.isError && items.length === 0 ? (
          <ErrorState message="Couldn't load your requests. Check your connection." onRetry={() => void requests.refetch()} />
        ) : items.length === 0 ? (
          <View style={styles.none}>
            <EmptyState
              icon={<IconSend size={28} stroke={1.5} color={colors.textSecondary} />}
              title="No requests"
              subtitle="Ask a garage just outside its area to come to you, from the Doorstep or Pickup & drop list."
            />
            <ScButton variant="outline" fullWidth={false} onPress={() => router.push('/garages?mode=doorstep' as Href)}>
              See who comes to you
            </ScButton>
          </View>
        ) : (
          <>
            {items.map((request) => (
              <RequestCard key={request.rootId} request={request} now={now} />
            ))}
            {items.some((r) => r.state === 'no_garage') ? <FreeWashPiece placement="bottom" /> : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const useStyles = createStyles((c) => ({
  page: { flex: 1, backgroundColor: c.canvas },
  body: { paddingHorizontal: 16, paddingTop: 8, gap: 12 },
  none: { alignItems: 'center', gap: 12 },
}));
