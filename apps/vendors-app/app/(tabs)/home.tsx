import { getVendorReviews } from '@repo/core/api/reviews';
import type { ApiVendorProfile } from '@repo/core/api/types';
import { agreementBannerLine } from '@repo/core/agreements';
import { REQUEST_RULES } from '@repo/core/booking-requests';
import { GARAGE_NON_SOLICITATION_LINE } from '@repo/core/bypass-reports';
import { formatINR } from '@repo/core/format';
import { useNow } from '@repo/core/hooks/use-now';
import { isNewGarage, NEW_GARAGE_LABEL } from '@repo/core/ratings';
import type { Review } from '@repo/core/types';
import { formatRating, reviewCountLabel } from '@repo/core/vendor-stats';
import { type Href, router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppShell, garageScreen } from '@/components/app-shell';
import { GarageStatus } from '@/components/garage-status';
import { IconChevronRight, IconInbox, IconShieldCheck } from '@/components/icons';
import { NewBookingCard } from '@/components/new-booking-card';
import {
  CountBadge,
  LoadError,
  Notice,
  PressRow,
  ScCard,
  SkeletonList,
  Stars,
  StatTile,
  TileFigure,
} from '@/components/primitives';
import { PushBanner } from '@/components/push-banner';
import { T } from '@/components/text';
import { TierCard } from '@/components/tier-card';
import { useAuth, useIsVendorAdmin } from '@/lib/auth';
import {
  getMyVendor,
  useGarageAgreement,
  useGarageClaims,
  useGarageRequestCount,
  useGuaranteeConfig,
  weekEarnings,
} from '@/lib/garage-api';
import { sortByUrgency, todayView, waitingSummary } from '@/lib/jobs';
import { colors } from '@/lib/theme';
import { useRefreshOnFocus } from '@/lib/use-refresh-on-focus';
import { useVendorBookings } from '@/lib/use-vendor-bookings';

/** How many new-booking cards Home shows before "See all". */
const CARDS_ON_HOME = 3;

const go = (path: string) => router.push(path as Href);

/** apps/vendors/app/home/page.tsx, in its order. */
function HomeScreen() {
  const vendor = useAuth((s) => s.vendor);
  const { bookings, loaded, failed, retrying, reload } = useVendorBookings();
  const now = useNow(10_000);
  const [reviews, setReviews] = useState<Review[] | null>(null);
  const [reviewsFailed, setReviewsFailed] = useState(false);
  const [profile, setProfile] = useState<ApiVendorProfile | null>(null);
  const [week, setWeek] = useState<number | null>(null);
  const isVendorAdmin = useIsVendorAdmin();

  const isVerified = vendor?.isVerified ?? false;
  const needsLocation = profile !== null && profile.lat === null;
  const paused = profile !== null && profile.bookingsPausedAt != null;

  const pending = useMemo(
    () =>
      sortByUrgency(
        bookings.filter((b) => b.status === 'pending'),
        now
      ),
    [bookings, now]
  );
  const waiting = useMemo(() => waitingSummary(pending, now), [pending, now]);
  const today = useMemo(() => todayView(bookings, now), [bookings, now]);
  const jobsUnknown = failed && bookings.length === 0;

  useEffect(() => {
    if (!vendor?.id) return;
    getVendorReviews(vendor.id)
      .then((list) => {
        setReviews(list);
        setReviewsFailed(false);
      })
      .catch(() => setReviewsFailed(true));
  }, [vendor?.id]);

  // On every return, not once: a tab stays mounted here, and pausing or resuming
  // in Settings must show on Home as it does on the web's fresh page.
  useFocusEffect(
    useCallback(() => {
      if (!vendor?.id) return;
      getMyVendor()
        .then(setProfile)
        .catch(() => undefined);
    }, [vendor?.id])
  );

  // Money is a separate call, and an operator's home page never makes it.
  useEffect(() => {
    if (!vendor?.id || !isVendorAdmin) return;
    weekEarnings()
      .then(setWeek)
      .catch(() => setWeek(null));
  }, [vendor?.id, isVendorAdmin]);

  const reviewCount = reviews?.length ?? 0;
  const newGarage = isNewGarage(reviewCount);
  const avgRating = reviewCount > 0 ? reviews!.reduce((sum, r) => sum + r.rating, 0) / reviewCount : 0;

  return (
    <AppShell showBrand brandRight={<GarageStatus />}>
      {needsLocation ? (
        <Notice title="Set your garage location" onPress={() => go('/settings?tab=location')}>
          {"Customers can't find you until your garage is on the map, and we can't show you to customers without it. Tap to pin it."}
        </Notice>
      ) : !isVerified ? (
        <Notice tone="neutral" title="Not shown to customers yet">
          {"Detlio is checking your garage. You'll be told once customers can find you."}
        </Notice>
      ) : null}

      {isVendorAdmin ? <AgreementBanner vendorId={vendor?.id} /> : null}

      {paused ? (
        isVendorAdmin ? (
          <Notice title="New bookings are paused" onPress={() => go('/settings?tab=time-off')}>
            {"Customers can't find or book you. Bookings you already have stay as they are. Tap to resume in Settings."}
          </Notice>
        ) : (
          <Notice title="New bookings are paused">
            {"Customers can't find or book this garage. Bookings already made stay as they are."}
          </Notice>
        )
      ) : null}

      <PushBanner />

      <View style={styles.section}>
        <View style={styles.sectionHead}>
          <View style={styles.titleRow}>
            <T accessibilityRole="header" size={18} weight={600}>
              Waiting for your answer
            </T>
            {waiting.count > 0 ? <CountBadge count={waiting.count} /> : null}
          </View>
          <Pressable
            accessibilityRole="link"
            onPress={() => go('/bookings?tab=new')}
            style={styles.seeAll}
          >
            <T size={15} weight={500} color={colors.textSecondary}>
              See all
            </T>
            <IconChevronRight size={18} color={colors.textSecondary} />
          </Pressable>
        </View>

        {!loaded && bookings.length === 0 ? (
          <SkeletonList count={2} height={256} />
        ) : jobsUnknown ? (
          <LoadError what="your bookings" onRetry={reload} retrying={retrying} />
        ) : pending.length === 0 ? (
          <View style={styles.noBookings}>
            <IconInbox size={22} color={colors.textSecondary} />
            <T size={15} color={colors.textSecondary} style={styles.flex}>
              No new bookings. They show here the moment a customer pays.
            </T>
          </View>
        ) : (
          <>
            {pending.slice(0, CARDS_ON_HOME).map((b) => (
              <NewBookingCard key={b.id} booking={b} now={now} onChanged={reload} />
            ))}
            {pending.length > CARDS_ON_HOME ? (
              <Pressable
                accessibilityRole="link"
                onPress={() => go('/bookings?tab=new')}
                style={styles.seeAllRow}
              >
                <T size={15} weight={500}>
                  {'See all '}
                  <T num size={15} weight={500}>
                    {pending.length}
                  </T>
                  {' new bookings'}
                </T>
              </Pressable>
            ) : null}
          </>
        )}
      </View>

      <RequestsHomeCard />

      <View style={styles.tiles}>
        <PressRow
          style={styles.tileCell}
          accessibilityLabel={
            jobsUnknown
              ? "Today's jobs: unknown. Open Today"
              : `Today's jobs: ${today.working.length + today.next.length}. Open Today`
          }
          onPress={() => go('/bookings?tab=today')}
        >
          <StatTile
            label="Today's jobs"
            value={jobsUnknown ? '–' : today.working.length + today.next.length}
            hint={today.working.length > 0 ? `${today.working.length} under way` : undefined}
          />
        </PressRow>
        {isVendorAdmin ? (
          <PressRow
            style={styles.tileCell}
            accessibilityLabel={`This week: ${week === null ? 'not loaded' : formatINR(week)}. Open Earnings`}
            onPress={() => go('/earnings')}
          >
            {/* A dash, never ₹0, until the figure arrives (or when it fails). */}
            <StatTile label="This week" value={week === null ? '–' : formatINR(week)} />
          </PressRow>
        ) : null}
        <PressRow
          style={styles.tileCell}
          accessibilityLabel={
            reviews === null
              ? 'Average rating: not loaded. See reviews'
              : reviewCount === 0
                ? 'Average rating: no reviews yet. See reviews'
                : newGarage
                  ? `Average rating: ${NEW_GARAGE_LABEL}, ${reviewCountLabel(reviewCount)}. See reviews`
                  : `Average rating ${formatRating(avgRating)} from ${reviewCountLabel(reviewCount)}. See reviews`
          }
          onPress={() => go('/reviews')}
        >
          <StatTile
            label="Avg rating"
            value={
              reviews === null ? (
                '–'
              ) : reviewCount > 0 && newGarage ? (
                <TileFigure size={15}>{NEW_GARAGE_LABEL}</TileFigure>
              ) : (
                <View style={styles.rating}>
                  <TileFigure>{formatRating(avgRating)}</TileFigure>
                  {reviewCount > 0 ? <Stars rating={avgRating} size={12} /> : null}
                </View>
              )
            }
            hint={reviewsFailed ? "Couldn't load" : reviews === null ? undefined : reviewCountLabel(reviewCount)}
          />
        </PressRow>
        {/* An odd tile keeps its half, as the web's two-column grid does. */}
        {isVendorAdmin ? <View style={styles.tileCell} /> : null}
      </View>

      {isVendorAdmin ? <GuaranteeHomeCard /> : null}
      {isVendorAdmin ? <TierCard vendorId={vendor?.id} /> : null}

      <PressRow onPress={() => go('/account')} style={styles.account}>
        <T size={15}>Your account</T>
        <IconChevronRight size={18} color={colors.textMuted} />
      </PressRow>

      <T size={13} color={colors.textSecondary} style={styles.reminder}>
        {GARAGE_NON_SOLICITATION_LINE}
      </T>
    </AppShell>
  );
}

function AgreementBanner({ vendorId }: { vendorId: string | undefined }) {
  const { data } = useGarageAgreement(vendorId);
  // Home stays mounted: accepting (or a new version) shows when it is opened again.
  useRefreshOnFocus(['agreement', 'garage', vendorId]);
  if (!data) return null;
  const line = agreementBannerLine(data.standing);
  if (!line) return null;
  return (
    <Notice title="Accept the Detlio garage agreement" onPress={() => go('/agreement')}>
      {line}
    </Notice>
  );
}

function RequestsHomeCard() {
  const count = useGarageRequestCount();
  const waiting = count.data?.waiting ?? 0;
  if (waiting <= 0) return null;
  return (
    <PressRow onPress={() => go('/requests')} style={styles.requests}>
      <View style={styles.flex}>
        <View style={styles.titleRow}>
          <T size={15} weight={600}>
            Requests
          </T>
          <CountBadge count={waiting} />
        </View>
        <T size={13} color={colors.textSecondary}>
          {`${waiting} ${waiting === 1 ? 'request' : 'requests'} waiting · answer within ${REQUEST_RULES.respondMinutes / 60} h`}
        </T>
      </View>
      <IconChevronRight size={18} />
    </PressRow>
  );
}

function GuaranteeHomeCard() {
  const config = useGuaranteeConfig();
  const on = config.data?.enabled === true;
  const claims = useGarageClaims(on);
  if (!on || !claims.data) return null;
  const toAnswer = claims.data.items.filter((claim) => claim.canAnswer).length;
  return (
    <PressRow onPress={() => go('/guarantee')}>
      <ScCard style={styles.guarantee}>
        <IconShieldCheck size={22} />
        <View style={styles.flex}>
          <T accessibilityRole="header" size={14} weight={600}>
            Free redo claims
          </T>
          <T size={12} color={colors.textSecondary}>
            {toAnswer > 0
              ? `${toAnswer} to answer within ${claims.data.reviewHours} hours of opening — no answer approves the redo.`
              : 'Before and after photos on every job are your defence if a customer claims.'}
          </T>
        </View>
        <IconChevronRight size={18} color={colors.textSecondary} />
      </ScCard>
    </PressRow>
  );
}

export default garageScreen(HomeScreen);

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  section: { gap: 12 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  seeAll: { minHeight: 48, marginVertical: -8, flexDirection: 'row', alignItems: 'center', gap: 2 },
  noBookings: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 16,
  },
  seeAllRow: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tileCell: { width: '48.8%', flexGrow: 1, flexBasis: '45%' },
  rating: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  requests: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(245,165,36,0.4)',
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  guarantee: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  account: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  reminder: { paddingHorizontal: 4 },
});
