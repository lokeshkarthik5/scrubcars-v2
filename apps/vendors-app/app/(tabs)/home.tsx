import { repairQuotesOn, useGarageRepairQuoteCount, useRepairQuotesConfig } from '@repo/core/api/hooks/use-repair-quotes';
import { getVendorReviews } from '@repo/core/api/reviews';
import type { ApiVendorProfile } from '@repo/core/api/types';
import { agreementBannerLine } from '@repo/core/agreements';
import { REQUEST_RULES } from '@repo/core/booking-requests';
import { GARAGE_NON_SOLICITATION_LINE } from '@repo/core/bypass-reports';
import { formatINR } from '@repo/core/format';
import { useNow } from '@repo/core/hooks/use-now';
import { isNewGarage, NEW_GARAGE_LABEL } from '@repo/core/ratings';
import type { Review } from '@repo/core/types';
import { formatRating, greetingFor, reviewCountLabel } from '@repo/core/vendor-stats';
import { type Href, router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { AppShell, garageScreen } from '@/components/app-shell';
import { GarageStatus } from '@/components/garage-status';
import { IconInbox, IconMessage, IconShieldCheck, IconStar, IconUser, IconWallet } from '@repo/native-ui/icons';
import { NewBookingCard } from '@/components/new-booking-card';
import { CountBadge, HubCard, LoadError, Notice, SkeletonList, Stars } from '@repo/native-ui/primitives';
import { BigFigure, HubHeading, HubList, HubRow, HubTile, HubTitle, SeeAll, TileRow } from '@/components/hub/parts';
import { completedToday, TodayCard } from '@/components/hub/today-card';
import { PushBanner } from '@/components/push-banner';
import { T } from '@repo/native-ui/text';
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
import { createStyles, useColors } from '@repo/native-ui/theme';
import { useRefreshOnFocus } from '@/lib/use-refresh-on-focus';
import { useVendorBookings } from '@/lib/use-vendor-bookings';
import { useGarageBookOn } from '@/lib/garage-book';
import { BookHome } from '@/components/book/book-home';
import { fill, useT, useTn } from '@repo/core/i18n';

/** How many new-booking cards Home shows before "See all". */
const CARDS_ON_HOME = 3;

const go = (path: string) => router.push(path as Href);

/** apps/vendors/app/home/page.tsx, in its order. */
function HomeScreen() {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  const vendor = useAuth((s) => s.vendor);
  const user = useAuth((s) => s.user);
  const { bookings, loaded, failed, retrying, reload } = useVendorBookings();
  const now = useNow(10_000);
  const [reviews, setReviews] = useState<Review[] | null>(null);
  const [reviewsFailed, setReviewsFailed] = useState(false);
  const [profile, setProfile] = useState<ApiVendorProfile | null>(null);
  const [week, setWeek] = useState<number | null>(null);
  const isVendorAdmin = useIsVendorAdmin();
  // Garage Book (0072): Home is the book's (B1) while it is on; off, exactly as it was.
  const book = useGarageBookOn();

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
  const doneToday = useMemo(() => completedToday(bookings, now), [bookings, now]);
  // The signed-in person's first name; no name, no greeting (never "Good morning, ").
  const first = (user?.name ?? '').trim().split(/\s+/)[0] ?? '';

  return (
    <AppShell showBrand brandRight={<GarageStatus />} gap={book ? 16 : 12}>
      {needsLocation ? (
        <Notice title={t('Set your garage location')} onPress={() => go('/settings?section=location')}>
          {t(
            "Customers can't find you until your garage is on the map, and we can't show you to customers without it. Tap to pin it."
          )}
        </Notice>
      ) : !isVerified ? (
        <Notice tone="neutral" title={t('Not shown to customers yet')}>
          {t("Detlio is checking your garage. You'll be told once customers can find you.")}
        </Notice>
      ) : null}

      {isVendorAdmin ? <AgreementBanner vendorId={vendor?.id} /> : null}

      {paused ? (
        isVendorAdmin ? (
          <Notice title={t('New bookings are paused')} onPress={() => go('/settings?section=time-off')}>
            {t("Customers can't find or book you. Bookings you already have stay as they are. Tap to resume in Settings.")}
          </Notice>
        ) : (
          <Notice title={t('New bookings are paused')}>
            {t("Customers can't find or book this garage. Bookings already made stay as they are.")}
          </Notice>
        )
      ) : null}

      <PushBanner />

      {book ? (
        <>
          <BookHome pending={pending} now={now} onChanged={reload} />
          <HomeList isVendorAdmin={isVendorAdmin} />
        </>
      ) : (
        <>
          {first ? <HubTitle>{`${greetingFor(new Date(now))}, ${first}`}</HubTitle> : null}

          <TodayCard
            today={today}
            done={doneToday}
            unknown={jobsUnknown}
            loading={!loaded && bookings.length === 0}
            onOpen={() => go('/bookings?tab=today')}
          />

          <View style={styles.section}>
            <HubHeading
              title={t('Waiting for your answer')}
              count={waiting.count}
              right={<SeeAll label={t('See all')} onPress={() => go('/bookings?tab=new')} />}
            />

            {!loaded && bookings.length === 0 ? (
              <SkeletonList count={2} height={256} />
            ) : jobsUnknown ? (
              <LoadError what={t('your bookings')} onRetry={reload} retrying={retrying} />
            ) : pending.length === 0 ? (
              <HubCard style={styles.noBookings}>
                <IconInbox size={22} color={colors.textSecondary} />
                <T size={15} color={colors.textSecondary} style={styles.flex}>
                  {t('No new bookings. They show here the moment a customer pays.')}
                </T>
              </HubCard>
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
                      {fill(t('See all {count} new bookings'), {
                        count: (
                          <T num size={15} weight={500}>
                            {pending.length}
                          </T>
                        ),
                      })}
                    </T>
                  </Pressable>
                ) : null}
              </>
            )}
          </View>

          <TileRow>
            {isVendorAdmin ? (
              <HubTile
                label={t('This week')}
                icon={IconWallet}
                accessibilityLabel={t('This week: {value}. Open Earnings', {
                  value: week === null ? t('not loaded') : formatINR(week),
                })}
                onPress={() => go('/earnings')}
                // A dash, never ₹0, until the figure arrives (or when it fails).
                value={week === null ? '–' : formatINR(week)}
                line={`${t('Earnings')} ›`}
              />
            ) : null}
            <HubTile
              label={t('Avg rating')}
              icon={IconStar}
              accessibilityLabel={
                reviews === null
                  ? t('Average rating: not loaded. See reviews')
                  : reviewCount === 0
                    ? t('Average rating: no reviews yet. See reviews')
                    : newGarage
                      ? t('Average rating: {label}, {reviews}. See reviews', {
                          label: t(NEW_GARAGE_LABEL),
                          reviews: reviewCountLabel(reviewCount),
                        })
                      : t('Average rating {rating} from {reviews}. See reviews', {
                          rating: formatRating(avgRating),
                          reviews: reviewCountLabel(reviewCount),
                        })
              }
              onPress={() => go('/reviews')}
              value={
                reviews === null ? (
                  '–'
                ) : reviewCount > 0 && newGarage ? (
                  <T size={20} weight={400} lh={26}>
                    {t(NEW_GARAGE_LABEL)}
                  </T>
                ) : (
                  <View style={styles.rating}>
                    <BigFigure>{formatRating(avgRating)}</BigFigure>
                    {reviewCount > 0 ? <Stars rating={avgRating} size={12} /> : null}
                  </View>
                )
              }
              line={reviewsFailed ? t("Couldn't load") : reviews === null ? undefined : `${reviewCountLabel(reviewCount)} ›`}
            />
          </TileRow>

          <HomeList isVendorAdmin={isVendorAdmin} />
        </>
      )}

      {isVendorAdmin ? <TierCard vendorId={vendor?.id} /> : null}

      <T size={13} color={colors.textSecondary} style={styles.reminder}>
        {t(GARAGE_NON_SOLICITATION_LINE)}
      </T>
    </AppShell>
  );
}

function AgreementBanner({ vendorId }: { vendorId: string | undefined }) {
  const t = useT();
  const { data } = useGarageAgreement(vendorId);
  // Home stays mounted: accepting (or a new version) shows when it is opened again.
  useRefreshOnFocus(['agreement', 'garage', vendorId]);
  if (!data) return null;
  const line = agreementBannerLine(data.standing);
  if (!line) return null;
  return (
    <Notice title={t('Accept the Detlio garage agreement')} onPress={() => go('/agreement')}>
      {line}
    </Notice>
  );
}

/**
 * Requests (while any wait), Free redo claims (while the guarantee is on, owner seat) and
 * Your account, in one list card (mockup garage-hub 1).
 */
function HomeList({ isVendorAdmin }: { isVendorAdmin: boolean }) {
  const t = useT();
  const tn = useTn();
  const count = useGarageRequestCount();
  // Repair quotes (0075) wait in the same list, so they count here too (as the website).
  const repairOn = repairQuotesOn(useRepairQuotesConfig().data);
  const repairCount = useGarageRepairQuoteCount(repairOn);
  const repairs = repairOn ? (repairCount.data?.waiting ?? 0) : 0;
  const waiting = (count.data?.waiting ?? 0) + repairs;
  const config = useGuaranteeConfig();
  const guaranteeOn = isVendorAdmin && config.data?.enabled === true;
  const claims = useGarageClaims(guaranteeOn);
  const toAnswer = claims.data ? claims.data.items.filter((claim) => claim.canAnswer).length : 0;
  const showClaims = guaranteeOn && Boolean(claims.data);

  return (
    <HubList>
      {waiting > 0 ? (
        <HubRow
          first
          icon={IconMessage}
          label={t('Requests')}
          onPress={() => go('/requests')}
          sub={
            repairs > 0
              ? tn(waiting, '{count} request waiting', '{count} requests waiting')
              : tn(waiting, '{count} request waiting · answer within {hours} h', '{count} requests waiting · answer within {hours} h', {
                  hours: REQUEST_RULES.respondMinutes / 60,
                })
          }
          value={<CountBadge count={waiting} small />}
        />
      ) : null}
      {showClaims && claims.data ? (
        <HubRow
          first={waiting <= 0}
          icon={IconShieldCheck}
          label={t('Free redo claims')}
          onPress={() => go('/guarantee')}
          sub={
            toAnswer > 0
              ? t('{count} to answer within {hours} hours of opening — no answer approves the redo.', {
                  count: toAnswer,
                  hours: claims.data.reviewHours,
                })
              : t('Before and after photos on every job are your defence if a customer claims.')
          }
        />
      ) : null}
      <HubRow first={waiting <= 0 && !showClaims} icon={IconUser} label={t('Your account')} onPress={() => go('/account')} />
    </HubList>
  );
}

export default garageScreen(HomeScreen);

const useStyles = createStyles((colors) => ({
  flex: { flex: 1, minWidth: 0 },
  section: { gap: 12 },
  noBookings: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 18 },
  seeAllRow: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.disc,
  },
  rating: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  reminder: { paddingHorizontal: 4, marginTop: 8 },
}));
