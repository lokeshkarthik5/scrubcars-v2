import { useCancelSlotAlert, useSlotAlerts } from '@repo/core/api/hooks/use-slot-alerts';
import { BOOKING_TYPE_LABELS } from '@repo/core/booking-types';
import { useT } from '@repo/core/i18n';
import { slotAlertSummary } from '@repo/core/slot-alerts';
import { ScButton } from '@repo/native-ui/button';
import { IconBell } from '@repo/native-ui/icons';
import { EmptyState, ErrorState, ScCard, Skeleton } from '@repo/native-ui/primitives';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { type Href, router } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PageHeader } from '@/components/page-header';
import { useAuth } from '@/lib/auth';

/** apps/users/app/profile/slot-alerts/page.tsx. */
export default function SlotAlertsScreen() {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const user = useAuth((s) => s.user);
  const alerts = useSlotAlerts({ enabled: !!user });
  const cancel = useCancelSlotAlert();
  const items = alerts.data?.items ?? [];
  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      <PageHeader title={t('Slot alerts')} backTo="/profile" />
      {!user ? (
        <View style={styles.center}>
          <T size={15} weight={600} align="center">
            {t('Sign in to see your slot alerts')}
          </T>
          <ScButton variant="main" fullWidth={false} paddingX={32} onPress={() => router.push(`/login?next=${encodeURIComponent('/profile/slot-alerts')}` as Href)}>
            {t('Sign in')}
          </ScButton>
        </View>
      ) : (
        <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 24 }]}>
          {alerts.isPending ? (
            <Skeleton height={96} />
          ) : alerts.isError && items.length === 0 ? (
            <ErrorState message={t("Couldn't load your slot alerts. Check your connection.")} onRetry={() => void alerts.refetch()} />
          ) : items.length === 0 ? (
            <View style={styles.none}>
              <EmptyState icon={<IconBell size={32} stroke={1.5} color={colors.textSecondary} />} title={t('No slot alerts')} subtitle={t('When a day is fully booked at checkout, tap Notify me if a slot opens.')} />
              <ScButton variant="outline" fullWidth={false} onPress={() => router.push('/garages' as Href)}>
                {t('Find garages')}
              </ScButton>
            </View>
          ) : (
            <>
              {items.map((alert) => (
                <ScCard key={alert.id} style={styles.card}>
                  <View style={styles.grow}>
                    <T size={15} weight={500} lh={20} accessibilityRole="link" onPress={() => router.push(`/garage/${alert.vendorId}` as Href)}>
                      {alert.vendorName}
                    </T>
                    <T size={13} lh={18} color={colors.textSecondary}>
                      {slotAlertSummary(alert)}
                    </T>
                    <T size={12} lh={16} color={colors.textMuted}>
                      {t(BOOKING_TYPE_LABELS[alert.bookingType])}
                    </T>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('Stop waiting for {name}, {when}', { name: alert.vendorName, when: slotAlertSummary(alert) })}
                    disabled={cancel.isPending}
                    onPress={() => cancel.mutate(alert.id)}
                    style={styles.stop}
                  >
                    <T size={12} weight={500} lh={16} style={styles.underline}>
                      {t('Stop waiting')}
                    </T>
                  </Pressable>
                </ScCard>
              ))}
              <T size={12} lh={16} color={colors.textMuted}>
                {t("Up to {max} at once. If a time opens it shows in Updates, and as a notification if they're on. It isn't held: the first to book gets it.", { max: alerts.data?.max ?? 5 })}
              </T>
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const useStyles = createStyles((c) => ({
  page: { flex: 1, backgroundColor: c.canvas },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  body: { paddingHorizontal: 16, paddingTop: 8, gap: 8 },
  none: { alignItems: 'center', gap: 12 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  grow: { flex: 1, minWidth: 0 },
  stop: { minHeight: 44, justifyContent: 'center' },
  underline: { textDecorationLine: 'underline' },
}));
