import { ApiError } from '@repo/core/api/client';
import { type CarHistoryItem, type ServiceReminder } from '@repo/core/api/car-history';
import { useCarHistory, useServiceReminderAction } from '@repo/core/api/hooks/use-car-history';
import { canSnoozeReminder, historyDateLabel, reminderBookHref, reminderDueLine, servicesLine, sinceLabel, washCount } from '@repo/core/car-history';
import { formatRupees } from '@repo/core/job-records';
import { categoryLabel } from '@repo/core/categories';
import type { ServiceCategory } from '@repo/core/types';
import { ScButton } from '@repo/native-ui/button';
import { Chip } from '@repo/native-ui/chip';
import { IconCalendarCheck, IconCar, IconHistory, IconSparkles } from '@repo/native-ui/icons';
import { EmptyState, ErrorState, ScCard, Skeleton } from '@repo/native-ui/primitives';
import { Figures, T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { toast } from '@repo/native-ui/toast';
import { type Href, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PageHeader } from '@/components/page-header';
import { useAuth } from '@/lib/auth';
import { errorText } from '@/lib/error-text';
import { usePendingCheckout } from '@/lib/pending-checkout';

const money = (amount: string) => formatRupees(Number(amount));

function HistoryCard({ item, now }: { item: CarHistoryItem; now: Date }) {
  const colors = useColors();
  const styles = useStyles();
  const date = historyDateLabel(item.doneAt, now);
  const services = servicesLine(item.services);
  const photos = item.photos.before + item.photos.after;
  return (
    <Pressable accessibilityRole="link" accessibilityLabel={`${services} at ${item.vendorName}, ${date}, ${money(item.amountPaid)}`} onPress={() => router.push(`/bookings/${item.bookingId}` as Href)}>
      <ScCard style={styles.history}>
        <View style={styles.between}>
          <View style={styles.grow}>
            <T size={15} lh={20}>
              {services}
            </T>
            <T size={13} lh={18} color={colors.textSecondary}>
              {item.vendorName}
            </T>
          </View>
          <T num size={15} lh={20}>
            {money(item.amountPaid)}
          </T>
        </View>
        <View style={styles.foot}>
          <T size={12} lh={16} color={colors.textMuted} style={styles.grow}>
            {date}
          </T>
          {item.receiptAvailable ? (
            <Pressable accessibilityRole="link" accessibilityLabel={`Receipt: ${services}, ${date}`} onPress={() => router.push(`/bookings/${item.bookingId}/receipt` as Href)} style={styles.footLink}>
              <T size={12} weight={600} lh={16}>
                Receipt
              </T>
            </Pressable>
          ) : null}
          {photos > 0 ? (
            <Pressable accessibilityRole="link" accessibilityLabel={`Before and after photos: ${services}, ${date}`} onPress={() => router.push(`/bookings/${item.bookingId}` as Href)} style={styles.footLink}>
              <T size={12} weight={600} lh={16}>
                Photos
              </T>
            </Pressable>
          ) : null}
        </View>
      </ScCard>
    </Pressable>
  );
}

function ReminderCard({ reminder, now, onBook }: { reminder: ServiceReminder; now: Date; onBook: () => void }) {
  const colors = useColors();
  const styles = useStyles();
  const action = useServiceReminderAction();
  const run = (kind: 'dismiss' | 'snooze') =>
    action.mutate(
      { reminderId: reminder.id, action: kind },
      {
        onSuccess: () => toast.success(kind === 'dismiss' ? 'Reminder dismissed' : 'Snoozed for 2 weeks'),
        onError: (err) => toast.error(errorText(err, 'Something went wrong')),
      }
    );
  const booked = reminder.state === 'booked' && reminder.booked;
  const due = reminder.state === 'due' || reminder.state === 'overdue';
  return (
    <ScCard accessibilityLabel={`Reminder: ${reminder.title}`} style={styles.reminder}>
      <View style={styles.row}>
        {booked ? <IconCalendarCheck size={18} color={colors.textPrimary} /> : <IconSparkles size={18} color={colors.textPrimary} />}
        <View style={styles.grow}>
          <T size={14} weight={600} lh={20}>
            {reminder.title}
          </T>
          <T size={12} lh={16} color={due ? colors.warning : colors.textSecondary}>
            {reminderDueLine(reminder, now)}
          </T>
          <T size={12} lh={16} color={colors.textSecondary}>
            {reminder.reason}
          </T>
        </View>
      </View>
      {booked ? (
        <ScButton variant="outline" height={44} onPress={() => router.push(`/bookings/${reminder.booked!.bookingId}` as Href)}>
          See the booking
        </ScButton>
      ) : (
        <View style={styles.actions}>
          <ScButton
            variant="outline"
            height={40}
            fullWidth={false}
            onPress={() => {
              onBook();
              router.push(reminderBookHref(reminder) as Href);
            }}
          >
            Book
          </ScButton>
          {canSnoozeReminder(reminder) ? (
            <Pressable accessibilityRole="button" disabled={action.isPending} onPress={() => run('snooze')} style={styles.footLink}>
              <T size={12} weight={500} lh={16} color={colors.textSecondary}>
                Remind me in 2 weeks
              </T>
            </Pressable>
          ) : null}
          <Pressable accessibilityRole="button" accessibilityLabel={`Dismiss reminder: ${reminder.title}`} disabled={action.isPending} onPress={() => run('dismiss')} style={styles.footLink}>
            <T size={12} weight={500} lh={16} color={colors.textSecondary}>
              Dismiss
            </T>
          </Pressable>
        </View>
      )}
    </ScCard>
  );
}

/** apps/users/app/profile/cars/[id]/page.tsx. The certificate comes with v1.1. */
export default function CarHistoryScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = String(params.id);
  const colors = useColors();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const user = useAuth((s) => s.user);
  const rememberCar = usePendingCheckout((s) => s.rememberCar);
  const [category, setCategory] = useState<ServiceCategory | null>(null);
  const history = useCarHistory(id, category, { enabled: !!user });
  const now = new Date();
  const chooseThisCar = () => {
    if (user) rememberCar({ userId: user.id, vehicleId: id });
  };
  const data = history.data;
  const notFound = history.error instanceof ApiError && history.error.status === 404;
  const carName = data ? `${data.car.make} ${data.car.model}` : 'Car history';

  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      <PageHeader title={carName} backTo="/profile" />
      {!user ? (
        <View style={styles.center}>
          <T size={15} weight={600} align="center">
            {"Sign in to see your car's history"}
          </T>
          <ScButton variant="main" fullWidth={false} paddingX={32} onPress={() => router.push(`/login?next=${encodeURIComponent(`/profile/cars/${id}`)}` as Href)}>
            Sign in
          </ScButton>
        </View>
      ) : (
        <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 24 }]}>
          {history.isPending ? (
            <>
              <Skeleton height={96} />
              <Skeleton height={96} />
            </>
          ) : notFound ? (
            <View style={styles.none}>
              <EmptyState icon={<IconCar size={32} stroke={1.5} color={colors.textSecondary} />} title="This car isn't in your garage" subtitle="It may have been removed. Your cars are in Profile." />
              <ScButton variant="outline" fullWidth={false} onPress={() => router.navigate('/profile?section=vehicles' as Href)}>
                Go to Profile
              </ScButton>
            </View>
          ) : !data ? (
            <ErrorState message="Couldn't load this car's history. Check your connection." onRetry={() => void history.refetch()} />
          ) : (
            <>
              <T size={13} lh={18} color={colors.textSecondary}>
                {`Service history${data.car.licensePlate ? ` · ${data.car.licensePlate}` : ''}`}
              </T>
              {data.reminder ? <ReminderCard reminder={data.reminder} now={now} onBook={chooseThisCar} /> : null}
              {data.items.length > 0 || category ? (
                <View style={styles.tiles}>
                  <ScCard style={styles.tile}>
                    <T size={12} lh={16} color={colors.textSecondary}>
                      Washes this year
                    </T>
                    <T num size={20} weight={600} lh={26}>
                      {String(data.totals.washesThisYear)}
                    </T>
                  </ScCard>
                  <ScCard style={styles.tile}>
                    <T size={12} lh={16} color={colors.textSecondary}>
                      Spent this year
                    </T>
                    <T num size={20} weight={600} lh={26}>
                      {money(data.totals.spentThisYear)}
                    </T>
                  </ScCard>
                </View>
              ) : null}
              {data.totals.since ? (
                <T size={12} lh={16} color={colors.textSecondary}>
                  <Figures size={12} color={colors.textSecondary} text={`${money(data.totals.spentTotal)} on ${washCount(data.totals.washesTotal)} since ${sinceLabel(data.totals.since)}`} />
                </T>
              ) : null}
              {data.categories.length > 1 ? (
                <View style={styles.chips}>
                  <Chip label="All" selected={category === null} onPress={() => setCategory(null)} />
                  {data.categories.map((each) => (
                    <Chip key={each} label={categoryLabel(each)} selected={category === each} onPress={() => setCategory(each)} />
                  ))}
                </View>
              ) : null}
              {data.items.length === 0 ? (
                category ? (
                  <ScCard>
                    <T size={13} lh={18} color={colors.textSecondary}>
                      {`No ${categoryLabel(category).toLowerCase()} jobs for this car yet.`}
                    </T>
                  </ScCard>
                ) : (
                  <View style={styles.none}>
                    <EmptyState icon={<IconHistory size={32} stroke={1.5} color={colors.textSecondary} />} title="No washes yet" subtitle="Every job done on this car will be listed here, with its receipt and photos." />
                    <ScButton
                      variant="outline"
                      fullWidth={false}
                      onPress={() => {
                        chooseThisCar();
                        router.push('/garages' as Href);
                      }}
                    >
                      Book a wash
                    </ScButton>
                  </View>
                )
              ) : (
                data.items.map((item) => <HistoryCard key={item.bookingId} item={item} now={now} />)
              )}
              {data.cancelledCount > 0 ? (
                <T size={12} lh={16} color={colors.textMuted}>
                  {`${data.cancelledCount === 1 ? '1 cancelled booking for this car isn’t listed here.' : `${data.cancelledCount} cancelled bookings for this car aren’t listed here.`} `}
                  <T size={12} lh={16} color={colors.textMuted} style={styles.underline} onPress={() => router.push('/bookings?tab=past' as Href)}>
                    See My bookings
                  </T>
                </T>
              ) : null}
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
  body: { paddingHorizontal: 16, paddingTop: 8, gap: 12 },
  none: { alignItems: 'center', gap: 12 },
  history: { gap: 8 },
  between: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  grow: { flex: 1, minWidth: 0 },
  foot: { flexDirection: 'row', alignItems: 'center', gap: 4, borderTopWidth: 1, borderTopColor: c.line, paddingTop: 2 },
  footLink: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
  reminder: { gap: 12 },
  row: { flexDirection: 'row', gap: 12 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4 },
  tiles: { flexDirection: 'row', gap: 8 },
  tile: { flex: 1, gap: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  underline: { textDecorationLine: 'underline' },
}));
