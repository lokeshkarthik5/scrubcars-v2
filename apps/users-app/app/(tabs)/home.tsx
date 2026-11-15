import { useServiceReminderAction } from '@repo/core/api/hooks/use-car-history';
import { invalidateHome, useDismissReviewPrompt, useHome } from '@repo/core/api/hooks/use-home';
import { garageLive, useGaragePulls } from '@repo/core/api/hooks/use-garage';
import { rewardsEnabled, useRewardsConfig, useRewardsSummary } from '@repo/core/api/hooks/use-rewards';
import type { HomeCar } from '@repo/core/api/home';
import { bookingTypeParam } from '@repo/core/booking-types';
import { firstNameOf, initialOf } from '@repo/core/home-display';
import { useNow } from '@repo/core/hooks/use-now';
import { t, useT, useTn } from '@repo/core/i18n';
import { rewardRupees, stampsToGoLine } from '@repo/core/rewards';
import { useUserStore } from '@repo/core/stores/user-store';
import { IconBell, IconChevronRight } from '@repo/native-ui/icons';
import { ErrorState, PressRow, Skeleton } from '@repo/native-ui/primitives';
import { Figures, T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { toast } from '@repo/native-ui/toast';
import { useQueryClient } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { type Href, router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Image, View } from 'react-native';

import {
  BillDueCard,
  ComplaintAnswerCard,
  ExtraWorkHomeCard,
  GarageClosedCard,
  RateWashCard,
  ServiceReminderHomeCard,
  TimeProposalHomeCard,
} from '@/components/home/action-cards';
import { PullRevealSheet } from '@/components/collect/pull-reveal-sheet';
import { BadgeCelebration } from '@/components/rewards/badge-celebration';
import { ChallengeLine } from '@/components/rewards/challenge-card';
import { ContinueBookingCard } from '@/components/checkout/continue-booking';
import { AddCarSheet } from '@/components/home/add-car-sheet';
import { CarHero } from '@/components/home/car-hero';
import { NearbyCard, TipCard } from '@/components/home/nearby-tip';
import { HomeOffers } from '@/components/home/offers';
import { RightTile, WashStatusTile } from '@/components/home/tiles';
import { ToolTilesRow } from '@/components/repair-quotes/repair-quotes-tile';
import { repairQuotesOn, useRepairQuotesConfig } from '@repo/core/api/hooks/use-repair-quotes';
import { UpdatesBlock } from '@/components/home/updates-block';
import { ReachStatusCards } from '@/components/reach/reach-status';
import { CustomerShell } from '@/components/screen';
import { useAuth } from '@/lib/auth';
import { coarse, isCitywide, useLocationStore } from '@/lib/location';
import { otpFlow } from '@/lib/otp-flow';
import { usePendingCheckout } from '@/lib/pending-checkout';
import { useRefreshOnFocus } from '@/lib/use-refresh-on-focus';

/** "Good morning" before noon, "Good afternoon" until 5 pm, then "Good evening", in Chennai. */
function greetingFor(now: Date): string {
  const hour = new Date(now.getTime() + 330 * 60_000).getUTCHours();
  return hour < 12 ? t('Good morning') : hour < 17 ? t('Good afternoon') : t('Good evening');
}

function HomeHeader({ firstName, avatarUrl, hasUnread, now }: { firstName: string; avatarUrl: string | null; hasUnread: boolean; now: Date }) {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  return (
    <View style={styles.header}>
      <View style={styles.headerLeft}>
        <View style={styles.avatar}>
          <LinearGradient colors={[colors.avatarFrom, colors.avatarTo]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.avatarFill}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
            ) : (
              <T size={15} weight={500}>
                {initialOf(firstName)}
              </T>
            )}
          </LinearGradient>
        </View>
        <View style={styles.shrink}>
          <T size={13} lh={18} color={colors.dim}>
            {greetingFor(now)}
          </T>
          <T size={17} lh={22} tracking={-0.01} numberOfLines={1}>
            {firstName}
          </T>
        </View>
      </View>
      <PressRow accessibilityLabel={hasUnread ? t('Updates, new') : t('Updates')} onPress={() => router.push('/updates' as Href)} style={styles.bell}>
        <IconBell size={21} stroke={1.5} />
        {hasUnread ? <View style={styles.bellDot} /> : null}
      </PressRow>
    </View>
  );
}

/** apps/users/components/home/home-hub-screen.tsx. Only ever a signed-in customer's. */
export default function HomeScreen() {
  const tn = useTn();
  const t = useT();
  const styles = useStyles();
  const queryClient = useQueryClient();
  const authUser = useAuth((s) => s.user);
  const profile = useUserStore((s) => s.profile);
  const location = useLocationStore((s) => s.location);
  const repairOn = repairQuotesOn(useRepairQuotesConfig().data);
  const rememberCar = usePendingCheckout((s) => s.rememberCar);
  const dismissRate = useDismissReviewPrompt();
  const reminderAction = useServiceReminderAction();

  // Rounded to ~110 m before it leaves the phone; "All of Chennai" is no place, so not sent.
  const origin = location && !isCitywide(location) ? coarse(location) : null;
  const home = useHome(origin, { enabled: !!authUser });
  const rewardsConfig = useRewardsConfig();
  const rewards = useRewardsSummary(rewardsEnabled(rewardsConfig.data) && !!authUser);
  const garagePulls = useGaragePulls(garageLive(rewardsConfig.data) && !!authUser);
  const clock = useNow();
  useRefreshOnFocus(['home']);

  const [selectedCar, setSelectedCar] = useState(0);
  const [addCarOpen, setAddCarOpen] = useState(false);
  const [pulling, setPulling] = useState(false);
  const afterAdding = useRef<((carId: string) => void) | null>(null);

  useEffect(() => {
    if (authUser) void useUserStore.getState().fetchProfile().catch(() => undefined);
  }, [authUser]);

  const data = home.data;
  const firstName = data?.header.firstName || firstNameOf((profile ?? authUser)?.name);

  useEffect(() => {
    if (firstName && otpFlow.takeWelcome()) toast.success(t('Welcome, {name}! Find your first car wash.', { name: firstName }));
  }, [firstName]);

  if (!authUser) return null;

  // The server's clock, so "today" and "8 days ago" count from the moment it counted them.
  const now = new Date(data?.now ?? clock);
  const cars = data?.cars ?? [];
  const carIndex = Math.min(selectedCar, Math.max(0, cars.length - 1));
  const car: HomeCar | undefined = cars[carIndex];
  const offers = data?.offers ?? [];
  const mustAct = data?.mustAct ?? null;
  // One red action on the screen: the must-act card's while one carries it, else Book a wash.
  const billDue = mustAct?.kind === 'bill_due' || mustAct?.kind === 'time_proposal' || mustAct?.kind === 'extra_work_due';
  const soft = !mustAct ? (data?.softCard ?? null) : null;

  const bookWash = (picked: HomeCar) => {
    rememberCar({ userId: authUser.id, vehicleId: picked.id });
    const lastMode = picked.rightTile.kind === 'book_again' ? bookingTypeParam(picked.rightTile.bookingType) : null;
    router.navigate((lastMode ? `/garages?mode=${lastMode}` : '/garages') as Href);
  };

  return (
    <CustomerShell
      gap={12}
      refreshing={pulling}
      onRefresh={() => {
        setPulling(true);
        void home.refetch().finally(() => setPulling(false));
      }}
    >
      <HomeHeader
        firstName={firstName}
        avatarUrl={data?.header.avatarUrl ?? profile?.avatarUrl ?? null}
        hasUnread={data?.header.hasUnread ?? false}
        now={now}
      />
      <ContinueBookingCard />
      <ReachStatusCards />
      {home.isPending ? (
        <>
          <Skeleton height={124} radius={28} />
          <Skeleton height={314} radius={28} />
        </>
      ) : !data ? (
        <ErrorState message={t("Couldn't load your Home. Check your connection.")} onRetry={() => void home.refetch()} />
      ) : (
        <>
          {mustAct?.kind === 'time_proposal' ? <TimeProposalHomeCard card={mustAct} /> : null}
          {mustAct?.kind === 'extra_work_due' ? <ExtraWorkHomeCard card={mustAct} now={now} /> : null}
          {mustAct?.kind === 'bill_due' ? <BillDueCard card={mustAct} now={now} /> : null}
          {mustAct?.kind === 'garage_closed' ? <GarageClosedCard card={mustAct} /> : null}
          {soft?.kind === 'rate' ? (
            <RateWashCard card={soft} dismissing={dismissRate.isPending} onDismiss={() => dismissRate.mutate(soft.bookingId)} />
          ) : null}
          {soft?.kind === 'complaint_resolved' ? <ComplaintAnswerCard card={soft} /> : null}
          {soft?.kind === 'service_reminder' ? (
            <ServiceReminderHomeCard
              card={soft}
              now={now}
              busy={reminderAction.isPending}
              onBook={() => rememberCar({ userId: authUser.id, vehicleId: soft.vehicleId })}
              onSnooze={() => reminderAction.mutate({ reminderId: soft.reminderId, action: 'snooze' })}
              onDismiss={() => reminderAction.mutate({ reminderId: soft.reminderId, action: 'dismiss' })}
            />
          ) : null}

          <CarHero
            cars={cars}
            selected={carIndex}
            onSelect={setSelectedCar}
            short={!!mustAct}
            quiet={billDue}
            onBookWash={bookWash}
            onAddCar={() => setAddCarOpen(true)}
            shine={rewards.data && cars.length > 0 ? rewards.data.card : null}
          />

          {rewards.data?.extras && rewards.data.extras.unseen.length > 0 ? <BadgeCelebration badges={rewards.data.extras.unseen} /> : null}
          {/* Badges first; new cars on the next visit, so two sheets never open at once. */}
          {garagePulls.data && garagePulls.data.unseen > 0 && !(rewards.data?.extras && rewards.data.extras.unseen.length > 0) ? <PullRevealSheet pulls={garagePulls.data.pulls} firstName={firstNameOf(authUser.name)} /> : null}

          {car ? (
            <View style={styles.tiles}>
              <RightTile tile={car.rightTile} onBook={() => rememberCar({ userId: authUser.id, vehicleId: car.id })} />
              <WashStatusTile car={car} now={now} />
            </View>
          ) : data.nextBooking ? (
            <View style={styles.tiles}>
              <RightTile tile={data.nextBooking} />
              <View style={styles.flex} />
            </View>
          ) : null}

          {/* Tools (0075): Repair quotes now, Shine Score beside it later. */}
          <ToolTilesRow show={repairOn} />

          {offers.length > 0 ? (
            <HomeOffers
              offers={offers}
              userId={authUser.id}
              vehicleId={car?.id ?? null}
              hasCar={cars.length > 0}
              muted={billDue}
              onNeedCar={(go) => {
                afterAdding.current = go;
                setAddCarOpen(true);
              }}
            />
          ) : null}

          {rewards.data ? (
            <PressRow onPress={() => router.push('/profile/rewards' as Href)} style={styles.rewards}>
              <T size={13} lh={18} style={styles.shrink}>
                <Figures
                  size={13}
                  lh={18}
                  text={
                    rewards.data.scratchWaiting > 0
                      ? tn(rewards.data.scratchWaiting, '{count} scratch card waiting', '{count} scratch cards waiting')
                      : rewards.data.vouchersAvailable > 0
                        ? t('{amount} off ready to use', { amount: rewardRupees(rewards.data.vouchers[0]?.amount) })
                        : stampsToGoLine(rewards.data.card.toGo)
                  }
                />
              </T>
              <View style={styles.rewardsRight}>
                <View style={styles.level}>
                  <T size={11} weight={500} lh={15}>
                    {rewards.data.level.label}
                  </T>
                </View>
                <IconChevronRight size={16} />
              </View>
            </PressRow>
          ) : null}

          {rewards.data?.extras?.challenge ? <ChallengeLine challenge={rewards.data.extras.challenge} /> : null}

          {data.updates ? <UpdatesBlock updates={data.updates} now={now} /> : null}
          <NearbyCard nearby={data.nearby} located={!!origin} />
          <TipCard tip={data.tip} now={now} />
        </>
      )}

      <AddCarSheet
        open={addCarOpen}
        onClose={() => setAddCarOpen(false)}
        onAdded={(vehicle) => {
          void invalidateHome(queryClient);
          afterAdding.current?.(vehicle.id);
          afterAdding.current = null;
        }}
      />
    </CustomerShell>
  );
}

const useStyles = createStyles((c) => ({
  flex: { flex: 1 },
  shrink: { flexShrink: 1, minWidth: 0 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 6, paddingBottom: 14 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flexShrink: 1, minWidth: 0 },
  avatar: { width: 40, height: 40, borderRadius: 20, overflow: 'hidden' },
  avatarFill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  avatarImage: { width: 40, height: 40 },
  bell: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: c.line, backgroundColor: c.disc, alignItems: 'center', justifyContent: 'center' },
  bellDot: { position: 'absolute', top: 9, right: 10, width: 8, height: 8, borderRadius: 4, backgroundColor: c.red, borderWidth: 2, borderColor: c.canvas, boxSizing: 'content-box' },
  tiles: { flexDirection: 'row', gap: 12 },
  rewards: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderRadius: 22, borderWidth: 1, borderColor: c.line, paddingHorizontal: 16, paddingVertical: 10 },
  rewardsRight: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 },
  level: { borderRadius: 999, borderWidth: 1, borderColor: c.stroke, paddingHorizontal: 8, paddingVertical: 2 },
}));
