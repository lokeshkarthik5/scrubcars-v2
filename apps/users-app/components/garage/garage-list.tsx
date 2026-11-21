import { track } from '@/lib/shims/analytics';
import { BringGarageCard } from '@/components/reach/bring-garage';
import { FreeWashPiece } from '@/components/reach/free-wash';
import { RequestSheet } from '@/components/reach/request-sheet';
import { useTierConfig } from '@repo/core/api/hooks/use-tiers';
import { useVendorSearch } from '@repo/core/api/hooks/use-vendors';
import { BOOKING_TYPE_LABELS, BOOKING_TYPES, bookingTypeParam } from '@repo/core/booking-types';
import { CATEGORY_LABELS } from '@repo/core/categories';
import { detlioInLine, farEmptyLine, firstFarIndex, inCityHeading, isSmallCity, nearGarageCount } from '@repo/core/customer-city';
import { cardPickupChip } from '@repo/core/pickup-fee-customer';
import { atGarageReach, canCollectFrom, nextTabOffer, outsideLine, skipTheDriveTitle, type NextTabOffer, type SkipTheDriveRow } from '@repo/core/reach';
import { requestActionLabel } from '@repo/core/booking-requests';
import { SILVER_KEY_LABEL, SILVER_KEY_QUIET } from '@repo/core/tiers';
import { LUXURY_APPROVED_LINE, LUXURY_FILTER_LABEL, specialistRow, type LuxuryMake } from '@repo/core/luxury';
import type { BookingType, Vendor } from '@repo/core/types';
import type { JustOutsideVendor } from '@repo/core/api/vendors';
import { msg, t, useT } from '@repo/core/i18n';
import { ScButton } from '@repo/native-ui/button';
import { Glass, GraphiteSwitch, Odometer, Raised, Recessed, SilverKey, TwoLineControl } from '@repo/native-ui/finish';
import {
  IconArrowRight,
  IconArrowsSort,
  IconBuildingStore,
  IconCamera,
  IconCarGarage,
  IconChevronDown,
  IconChevronRight,
  IconHome,
  IconKey,
  IconSearch,
  IconShieldCheck,
  type IconProps,
} from '@repo/native-ui/icons';
import { PressScale, Rise, SeenProvider, useReduceMotion, useSeenHost } from '@repo/native-ui/motion';
import { ErrorState, HubCard, PressRow, Spinner } from '@repo/native-ui/primitives';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors, useFinish } from '@repo/native-ui/theme';
import { type Href, router } from 'expo-router';
import { type ComponentRef, Fragment, type ReactElement, type ReactNode, useEffect, useRef, useState } from 'react';
import {
  Animated,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useNavClearance } from '@/components/hub-nav';
import { PullCar } from '@/components/moments/pull-car';
import { useCustomerPlace } from '@/lib/customer-place';
import { useDefaultCarMake } from '@/lib/default-car';
import { luxuryCaption, luxuryPeekWords } from '@repo/core/luxury';
import { cityCentreParams, coarse, isApproximate, isCitywide, shouldOfferLocationPrompt, useLocationStore } from '@/lib/location';

import { FilterSheet, SERVICE_FILTERS, ServiceFilterIcon, serviceFilterLabel, type ServiceFilter } from './filter-sheet';
import { MapPeek } from './map-peek';
import { QuickLook } from './quick-look';
import { RollingHint } from './rolling-hint';
import { LuxuryFilterChip } from './luxury';
import { ShowroomCard } from './showroom-card';
import { canSortByRating, sortLabel, SortSheet, type SortKey } from './sort-sheet';
import { TierMedalIcon } from './tier';
import { VendorCard } from './vendor-card';

function SkipTheDriveCard({
  rows,
  nearestKm,
  onSwitch,
}: {
  rows: SkipTheDriveRow[];
  nearestKm: number | null;
  onSwitch: (mode: BookingType) => void;
}) {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  return (
    <View style={styles.skip}>
      <View>
        <T size={11} weight={500} tracking={0.12} uppercase color={colors.skipKicker}>
          {t('Skip the drive')}
        </T>
        <T size={17} weight={500} style={styles.skipTitle}>
          {skipTheDriveTitle(nearestKm)}
        </T>
        <T size={13} color={colors.textSecondary}>
          {t('Get it done without driving:')}
        </T>
      </View>
      {rows.map((row) => (
        <PressRow key={row.mode} onPress={() => onSwitch(row.mode)} style={styles.skipRow}>
          <View style={styles.flex}>
            <T size={15}>{row.title}</T>
            <T size={12} color={colors.textSecondary}>
              {row.detail}
            </T>
          </View>
          <IconChevronRight size={18} color={colors.textSecondary} />
        </PressRow>
      ))}
    </View>
  );
}

function PickupExplainer() {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  const steps = [
    t('Collected from your address. You hand it over with a code from the app.'),
    t('Worked on at the garage. Follow each step on your booking, from picked up to on its way back.'),
    t('Brought back to the same address, handed over with a second code.'),
  ];
  const safe = [
    { Icon: IconShieldCheck, words: t('Garage responsible for your car') },
    { Icon: IconKey, words: t('Handover codes both ways') },
    { Icon: IconCamera, words: t('Add your own photos before pickup') },
  ];
  return (
    <HubCard style={styles.explainer}>
      <T size={17} weight={500}>
        {t('They collect, you relax')}
      </T>
      {steps.map((step, i) => (
        <View key={step} style={styles.step}>
          <View style={styles.stepNo}>
            <T num size={11} lh={14}>
              {i + 1}
            </T>
          </View>
          <T size={13} lh={18} color={colors.textSecondary} style={styles.flex}>
            {step}
          </T>
        </View>
      ))}
      <View style={styles.safeRow}>
        {safe.map(({ Icon, words }) => (
          <View key={words} style={styles.safe}>
            <Icon size={13} color={colors.success} />
            <T size={12} lh={16} color={colors.success}>
              {words}
            </T>
          </View>
        ))}
      </View>
    </HubCard>
  );
}

const garageCardSeen = { done: false };

function JustOutsideSection({ items, mode }: { items: JustOutsideVendor[]; mode: 'doorstep' | 'pickup' }) {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  const [requesting, setRequesting] = useState<JustOutsideVendor | null>(null);
  const modeParam = bookingTypeParam(mode);
  return (
    <View style={styles.outside}>
      <View style={styles.headRow}>
        <T size={17} weight={500}>
          {t('Just outside their area')}
        </T>
        <T size={12} color={colors.textMuted}>
          {t('by distance')}
        </T>
      </View>
      {items.map((item) => (
        <VendorCard
          key={item.vendor.id}
          vendor={item.vendor}
          mode={mode}
          showSave={false}
          chips={
            <T size={12} weight={500} color={colors.warning}>
              {outsideLine(item.coverKm, item.outsideKm)}
            </T>
          }
          footer={
            <View style={styles.outsideActions}>
              <PressRow
                accessibilityLabel={t('See prices at {name}', { name: item.vendor.name })}
                onPress={() => router.push(`/garage/${item.vendor.id}${modeParam ? `?mode=${modeParam}` : ''}` as Href)}
                style={styles.seePrices}
              >
                <T size={14}>{t('See prices')}</T>
              </PressRow>
              <PressRow
                accessibilityLabel={t('{action} from {name}', { action: requestActionLabel(mode), name: item.vendor.name })}
                onPress={() => setRequesting(item)}
                style={styles.request}
              >
                <T size={14} weight={500} color={colors.chosenText}>
                  {requestActionLabel(mode)}
                </T>
              </PressRow>
            </View>
          }
        />
      ))}
      {requesting ? <RequestSheet open onClose={() => setRequesting(null)} garage={requesting} mode={mode} /> : null}
    </View>
  );
}

function NextTabFooter({ offer, onSwitch }: { offer: NextTabOffer | null; onSwitch: (mode: BookingType) => void }) {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  if (!offer) return null;
  return (
    <PressRow onPress={() => onSwitch(offer.mode)} style={styles.nextTab}>
      <View style={styles.flex}>
        <T size={12} color={colors.textMuted}>
          {t('Nothing here suits you?')}
        </T>
        <T size={15}>{offer.label}</T>
      </View>
      <IconArrowRight size={18} color={colors.textSecondary} />
    </PressRow>
  );
}

/** The mode switch's quiet second lines and icons (§3). */
const MODE_QUIET: Record<BookingType, string> = {
  dropin: msg('Drive it in'),
  doorstep: msg('We come to you'),
  pickup: msg('We collect it'),
};
const MODE_ICONS: Record<BookingType, (props: IconProps) => ReactElement> = {
  dropin: IconBuildingStore,
  doorstep: IconHome,
  pickup: IconCarGarage,
};

/** "5 garages", "20+ garages", "1 garage". */
function garagesWord(count: number, more: boolean): string {
  return count === 1 && !more ? t('garage') : t('garages');
}

/** Whether a list card offers the service, from its tags (codes or their names). */
function offers(vendor: Vendor, filter: Exclude<ServiceFilter, 'all'>): boolean {
  const names = [filter, CATEGORY_LABELS[filter]].map((n) => n.toLowerCase());
  return vendor.serviceTags.some((tag) => names.includes(tag.toLowerCase()));
}

/** A card where the list put it, so its photos can drift with the scroll from there. */
function Placed({ listTop, children }: { listTop: number; children: (top: number) => ReactNode }) {
  const [y, setY] = useState(0);
  return <View onLayout={(event) => setY(event.nativeEvent.layout.y)}>{children(listTop + y)}</View>;
}

/**
 * GarageList (apps/users/components/garages/garage-list.tsx, customer UI round §3): the
 * recessed search with its rolling hint, the map peek, the graphite mode switch and the
 * filter row (pinned to the top on glass while the list scrolls), sort, the garages as
 * Showroom cards, and the "never empty" pieces around them. It owns the screen's scroll,
 * so the controls can stick and the cards can drift; `header` is what sits above it all
 * (the brand row, a booking left half way).
 */
export function GarageList({
  mode,
  onModeChange,
  onAskArea,
  header,
}: {
  mode: BookingType;
  onModeChange: (mode: BookingType) => void;
  onAskArea: () => void;
  header: ReactNode;
}) {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  const { fx } = useFinish();
  const reduce = useReduceMotion();
  const insets = useSafeAreaInsets();
  const clearance = useNavClearance();
  const [category, setCategory] = useState<ServiceFilter>('all');
  const silverFilterOffered = useTierConfig().data?.silverFilter === true;
  const [silverChosen, setSilverChosen] = useState(false);
  const silverOnly = silverChosen && silverFilterOffered;
  // "Luxury specialists" (0083): a filter on the server like Silver+, so the list, its
  // count, the map peek and the reach pieces all follow it, with every service and mode.
  // null: off; 'all': every specialist (the chip); a make: the specialists the team approved for
  // that make ("Specialists for your <Make>"'s See all, luxuryMake on the server, so its count and
  // the list agree).
  const [luxuryFilter, setLuxuryFilter] = useState<LuxuryMake | 'all' | null>(null);
  const luxuryOn = luxuryFilter !== null;
  const luxuryMake = luxuryFilter !== null && luxuryFilter !== 'all' ? luxuryFilter : undefined;
  // The signed-in customer's main car, for "Specialists for your <Make>".
  const carMake = useDefaultCarMake();
  const { width: screen } = useWindowDimensions();
  const [chosenSort, setChosenSort] = useState<SortKey | null>(null);
  const [sortOpen, setSortOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [quickLook, setQuickLook] = useState<Vendor | null>(null);
  const [pinned, setPinned] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [listTop, setListTop] = useState(0);
  const controlsY = useRef<number | null>(null);
  const scroll = useRef<ComponentRef<typeof Animated.ScrollView>>(null);
  const scrollY = useRef(new Animated.Value(0)).current;
  const seen = useSeenHost();

  const location = useLocationStore((s) => s.location);
  const permission = useLocationStore((s) => s.permission);
  const promptDismissedAt = useLocationStore((s) => s.promptDismissedAt);
  const refreshPermission = useLocationStore((s) => s.refreshPermission);
  const selectCity = useLocationStore((s) => s.selectCity);
  // The customer's city (0070): Chennai until they are elsewhere. Fewer than three garages in
  // it: no counts anywhere, "In Madurai", and one quiet way to recommend a garage (mockup D).
  const { city, place } = useCustomerPlace();
  const small = isSmallCity(city);

  // A whole city sends no origin, only its centre for the 150 km limit (cityCentreParams).
  const citywide = isCitywide(location);
  const origin = citywide || !location ? undefined : coarse(location);
  const cityParams = cityCentreParams(location, city);
  const approximate = isApproximate(location);
  const sort: SortKey = chosenSort ?? (origin ? 'distance' : 'relevance');
  const effectiveSort = origin ? sort : sort === 'distance' ? 'relevance' : sort;
  const categoryParam = category === 'all' ? undefined : category;

  const { vendors, reach, outside, hasMore, isLoading, isRefreshing, isFetchingMore, isError, retry, loadMore } = useVendorSearch(
    {
      bookingType: mode,
      category: categoryParam,
      silverAndAbove: silverOnly || undefined,
      luxury: luxuryOn || undefined,
      luxuryMake,
      lat: origin?.lat,
      lng: origin?.lng,
      ...cityParams,
      sort: effectiveSort,
    },
    { keepPrevious: true }
  );

  // The same list with every service: the map peek's dots and the filter sheet's counts.
  // With "All services" chosen it is the very query above (the same key), so it costs
  // nothing; with a service chosen it is the one the list showed a moment before.
  const everyService = useVendorSearch(
    {
      bookingType: mode,
      silverAndAbove: silverOnly || undefined,
      luxury: luxuryOn || undefined,
      luxuryMake,
      lat: origin?.lat,
      lng: origin?.lng,
      ...cityParams,
      sort: effectiveSort,
    },
    { keepPrevious: true }
  );
  const counts = Object.fromEntries(
    SERVICE_FILTERS.map((filter) => {
      if (everyService.isLoading) return [filter, null];
      const n = filter === 'all' ? everyService.vendors.length : everyService.vendors.filter((v) => offers(v, filter)).length;
      // A count the loaded garages cannot vouch for is left off, never 0; a small city counts nothing.
      return [filter, n > 0 && !small ? `${n}${everyService.hasMore ? '+' : ''}` : null];
    })
  ) as Record<ServiceFilter, string | null>;

  const firstUnlocatedIndex = origin ? vendors.findIndex((v) => v.distanceKm === null) : -1;
  // Where the near garages end and the ones in other towns begin (Tirupur,
  // 387 km): listed after a line, never counted as "near you". "Near" is the city's own reach.
  const firstFar = firstFarIndex(vendors, { located: !!origin, nearestFirst: effectiveSort === 'distance', city });
  const atGarage =
    mode === 'dropin' && !isRefreshing
      ? atGarageReach(reach, !!origin, { counted: !small })
      : { skipTheDrive: null, atHomeLine: false, nearestKm: null };
  const listEnded = !isLoading && !isError && !hasMore && !isRefreshing;
  // An empty At garage list with every service, from a place: nothing within 150 km (0070), not a filter.
  const farEmpty = !silverOnly && !luxuryOn && mode === 'dropin' && category === 'all' && (!!origin || cityParams.cityLat !== undefined);
  const justOutside = (mode === 'doorstep' || mode === 'pickup') && listEnded ? (outside ?? []) : [];
  const nextOffer = nextTabOffer(mode, reach);

  // Once a visit, when a garage card first shows.
  useEffect(() => {
    if (vendors.length > 0 && !garageCardSeen.done) {
      garageCardSeen.done = true;
      track('garage_card_seen', mode ? { mode } : {});
    }
  }, [vendors.length, mode]);

  useEffect(() => {
    void refreshPermission();
  }, [refreshPermission]);

  // Offered only after results are on screen, never a cold prompt.
  useEffect(() => {
    if (isLoading || vendors.length === 0) return;
    if (!shouldOfferLocationPrompt({ location, permission, promptDismissedAt })) return;
    const timer = setTimeout(onAskArea, 1200);
    return () => clearTimeout(timer);
  }, [onAskArea, isLoading, vendors.length, location, permission, promptDismissedAt]);

  /** The switch: a tap to another mode is a mode_switch, wherever it is made. */
  const changeMode = (next: BookingType) => {
    if (next !== mode) track('mode_switch', { mode: next });
    onModeChange(next);
  };

  /** A tap that moves to another tab: back up to where the controls sit before they pin. */
  const switchTo = (next: BookingType) => {
    changeMode(next);
    scroll.current?.scrollTo({ y: Math.max(0, (controlsY.current ?? 0) - 1), animated: !reduce });
  };

  // Pull to refresh (moment 6): the little car rolls in as the list is pulled, and the
  // list asks again. Held until the answer lands, so the car has somewhere to drive to.
  const refresh = () => {
    setRefreshing(true);
    Promise.resolve(retry())
      .catch(() => undefined)
      .finally(() => setRefreshing(false));
  };

  const onScroll = Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
    useNativeDriver: true,
    listener: ({ nativeEvent: e }: NativeSyntheticEvent<NativeScrollEvent>) => {
      seen.notify();
      const at = controlsY.current;
      if (at !== null) {
        const now = e.contentOffset.y > at;
        setPinned((was) => (was === now ? was : now));
      }
      if (e.layoutMeasurement.height + e.contentOffset.y >= e.contentSize.height - 400) loadMore();
    },
  });

  const mapReady = !everyService.isLoading && !everyService.isError;
  // Only garages within reach (or inside the customer's city, with no location) are
  // "near you": the far towns further down the list are not.
  const near = nearGarageCount(everyService.vendors, {
    located: !!origin,
    hasMore: everyService.hasMore,
    nearestFirst: effectiveSort === 'distance',
    city,
  });
  // "Specialists for your BMW" (0083): the specialists among the garages listed, above
  // Nearby garages, for a customer whose main car is a luxury make; not with the filter
  // on, nor with fewer than two.
  const specialists = isLoading || isError ? null : specialistRow(carMake, vendors, luxuryOn);
  const turnLuxuryOn = (make: LuxuryMake) => {
    setLuxuryFilter(make);
    scroll.current?.scrollTo({ y: Math.max(0, (controlsY.current ?? 0) - 1), animated: !reduce });
  };

  const listCount = isLoading || small ? null : `${vendors.length}${hasMore ? '+' : ''} ${garagesWord(vendors.length, hasMore)}`;

  const controls = (
    <View
      key="controls"
      onLayout={(event) => {
        // Its place in the list before it pins; a pinned bar's own layout says nothing.
        if (!pinned) controlsY.current = event.nativeEvent.layout.y;
      }}
      style={[styles.controls, pinned && { borderBottomColor: fx.glassEdge }]}
    >
      {pinned ? <Glass pointerEvents="none" radius={0} edge={false} base={fx.glassPinned} style={StyleSheet.absoluteFill} /> : null}
      <GraphiteSwitch
        accessibilityLabel={t('Service mode')}
        value={mode}
        onChange={changeMode}
        pinned={pinned}
        options={BOOKING_TYPES.map((value) => {
          const Icon = MODE_ICONS[value];
          return {
            value,
            label: t(BOOKING_TYPE_LABELS[value]),
            quiet: t(MODE_QUIET[value]),
            icon: (ink: string) => <Icon size={18} color={ink} />,
          };
        })}
      />
      <View style={styles.filterRow}>
        <TwoLineControl
          onPress={() => setFilterOpen(true)}
          accessibilityLabel={listCount ? t('Service: {service}, {count}. Change', { service: serviceFilterLabel(category), count: listCount }) : t('Service: {service}. Change', { service: serviceFilterLabel(category) })}
          pinned={pinned}
          style={styles.flex}
          tile={(ink) => <ServiceFilterIcon filter={category} color={ink} />}
          main={serviceFilterLabel(category)}
          quiet={
            small ? undefined : isLoading ? (
              t('Finding garages…')
            ) : (
              <View style={styles.countLine}>
                <Odometer value={`${vendors.length}${hasMore ? '+' : ''}`} numeric={vendors.length} size={11} weight={500} lh={15} color={fx.quiet} />
                <T variant="t5" color={fx.quiet}>
                  {` ${garagesWord(vendors.length, hasMore)}`}
                </T>
              </View>
            )
          }
          trailing={<IconChevronDown size={16} color={fx.quiet} />}
        />
        {/* Not there at all while Detlio shows neither Silver nor Gold. */}
        {silverFilterOffered ? (
          <SilverKey
            on={silverOnly}
            onToggle={() => setSilverChosen((on) => !on)}
            label={t(SILVER_KEY_LABEL)}
            quiet={t(SILVER_KEY_QUIET)}
            pinned={pinned}
            medal={<TierMedalIcon tier="silver" size={18} />}
          />
        ) : null}
      </View>
      {/* "Luxury specialists" (0083): its own short line under Service and Silver+. */}
      <View style={styles.luxuryRow}>
        <LuxuryFilterChip on={luxuryOn} onToggle={() => setLuxuryFilter(luxuryOn ? null : 'all')} />
      </View>
    </View>
  );

  const cardChips = (vendor: Vendor) =>
    mode === 'dropin' && canCollectFrom(vendor, origin) ? (
      <View style={styles.collect}>
        <T size={12} weight={500} lh={16} color={colors.collectText}>
          {t('Can collect your car')}
        </T>
      </View>
    ) : mode === 'pickup' && cardPickupChip(vendor) ? (
      // The pickup fee for this card's distance (0079), in the same chip.
      <View style={styles.collect}>
        <T size={12} weight={500} lh={16} color={colors.collectText}>
          {cardPickupChip(vendor)}
        </T>
      </View>
    ) : undefined;

  const cards = vendors.map((vendor, i) => (
    <Fragment key={vendor.id}>
      {i === firstFar ? (
        <T variant="t5" color={colors.textMuted} style={styles.unlocated}>
          {t('Further away · other towns')}
        </T>
      ) : null}
      {i === firstUnlocatedIndex ? (
        <T variant="t5" color={colors.textMuted} style={styles.unlocated}>
          {t('Other garages — location not set yet')}
        </T>
      ) : null}
      <Placed listTop={listTop}>
        {(top) => (
          <Rise index={Math.min(i, 6)}>
            <ShowroomCard
              vendor={vendor}
              mode={mode}
              approxDistance={approximate}
              onQuickLook={setQuickLook}
              scrollY={scrollY}
              top={top}
              chips={cardChips(vendor)}
            />
          </Rise>
        )}
      </Placed>
    </Fragment>
  ));

  // The scroll's direct children: what is above the controls, the controls (which stick),
  // and the rest.
  const above = (
    <View key="above" style={styles.stack}>
      {header}
      <PressScale accessibilityRole="button" accessibilityLabel={t('Search garages or services')} onPress={() => router.navigate('/search' as Href)}>
        <Recessed radius={16} style={styles.search} innerStyle={styles.searchInner}>
          <IconSearch size={18} color={fx.quiet} />
          <T variant="t3" weight={400} color={fx.quiet}>
            {t('Search')}
          </T>
          <RollingHint hints={SEARCH_HINTS.map((hint) => t(hint))} color={fx.quiet} />
        </Recessed>
      </PressScale>
      {/* After the list's own first answer, so it never stands between the customer and the first garage. */}
      {mapReady ? (
        <MapPeek
          vendors={everyService.vendors}
          origin={origin}
          centre={origin ?? city.centre}
          mode={mode}
          category={categoryParam}
          luxury={luxuryOn}
          luxuryMake={luxuryMake}
          scrollY={scrollY}
          countLabel={
            small
              ? { count: null, words: detlioInLine(city) }
              : {
                  count: `${near.count}${near.more ? '+' : ''}`,
                  words: luxuryOn
                    ? luxuryPeekWords(near.count, near.more, !!origin, city.name, t)
                    : near.count === 1 && !near.more
                      ? origin
                        ? t('garage near you')
                        : t('garage in {city}', { city: city.name })
                      : origin
                        ? t('garages near you')
                        : t('garages in {city}', { city: city.name }),
                }
          }
        />
      ) : null}
    </View>
  );

  const below = (
    <View key="below" style={styles.stack}>
      {mode === 'pickup' ? <PickupExplainer /> : null}
      {atGarage.skipTheDrive ? (
        <SkipTheDriveCard rows={atGarage.skipTheDrive} nearestKm={atGarage.nearestKm} onSwitch={switchTo} />
      ) : null}
      {mode !== 'pickup' ? <FreeWashPiece placement="top" /> : null}

      {specialists ? (
        <View style={styles.section}>
          <View style={styles.headRow}>
            <View style={styles.flex}>
              <T variant="t2" accessibilityRole="header">
                {t('Specialists for your {make}', { make: specialists.make })}
              </T>
              <T variant="t5" color={fx.quiet} style={styles.caption}>
                {t(LUXURY_APPROVED_LINE)}
              </T>
            </View>
            <PressScale accessibilityRole="button" onPress={() => turnLuxuryOn(specialists.make)}>
              <Raised radius={12} style={styles.sort} innerStyle={styles.sortInner}>
                <T variant="t4" numberOfLines={1} color={fx.soft}>
                  {t('See all {count}', { count: `${specialists.garages.length}${hasMore ? '+' : ''}` })}
                </T>
                <IconChevronRight size={15} color={fx.quiet} />
              </Raised>
            </PressScale>
          </View>
          {/* Sideways, the same cards as the list: the next one peeks in. */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            snapToInterval={screen - 60 + 12}
            decelerationRate="fast"
            style={styles.rowScroll}
            contentContainerStyle={styles.rowContent}
          >
            {specialists.garages.map((vendor) => (
              <ShowroomCard
                key={vendor.id}
                vendor={vendor}
                mode={mode}
                width={screen - 60}
                approxDistance={approximate}
                onQuickLook={setQuickLook}
                chips={cardChips(vendor)}
              />
            ))}
          </ScrollView>
        </View>
      ) : null}

      <View style={styles.section}>
        <View>
          <View style={styles.headRow}>
            {/* No count beside it: the count lives in the filter button. */}
            <T variant="t2" accessibilityRole="header" style={styles.flex}>
              {luxuryMake ? t('Specialists for your {make}', { make: luxuryMake }) : luxuryOn ? t(LUXURY_FILTER_LABEL) : mode === 'dropin' && atGarage.skipTheDrive ? t('Or drive to') : small ? inCityHeading(city) : t('Nearby garages')}
            </T>
            <PressScale accessibilityRole="button" onPress={() => setSortOpen(true)}>
              <Raised radius={12} style={styles.sort} innerStyle={styles.sortInner}>
                <IconArrowsSort size={15} color={fx.quiet} />
                <T variant="t4" numberOfLines={1} color={fx.soft}>
                  {sortLabel(sort)}
                </T>
              </Raised>
            </PressScale>
          </View>
          {luxuryOn && vendors.length > 0 ? (
            <T variant="t5" color={fx.quiet} style={styles.caption}>
              {luxuryCaption(!!origin && sort === 'distance', t)}
            </T>
          ) : null}
          {!luxuryOn && origin && location && vendors.length > 0 && sort === 'distance' ? (
            <T variant="t5" color={fx.quiet} style={styles.caption}>
              {t('Nearest first from {label}', { label: t(location.label) })}
              {approximate ? ` ${t('(distances from the area’s centre)')}` : ''}
            </T>
          ) : null}
          {mode === 'pickup' && !origin && vendors.length > 0 ? (
            <T variant="t5" color={colors.textMuted} style={styles.caption}>
              {t('Set your location to see only garages that collect from your area. Checkout checks your address either way.')}
            </T>
          ) : null}
        </View>
        {atGarage.atHomeLine ? (
          <Pressable accessibilityRole="button" onPress={() => switchTo('doorstep')} style={styles.atHome}>
            <T size={13} color={colors.textSecondary}>
              {t('or have it done at home')}
            </T>
            <IconArrowRight size={14} color={colors.textSecondary} />
          </Pressable>
        ) : null}

        <View
          onLayout={(event) => setListTop(event.nativeEvent.layout.y)}
          style={[styles.list, isRefreshing && styles.refreshing]}
        >
          {isLoading || (isRefreshing && vendors.length === 0) ? (
            <T variant="t4" color={colors.textSecondary} align="center" style={styles.finding}>
              {t('Finding garages…')}
            </T>
          ) : isError ? (
            <ErrorState message={t("Couldn't load garages. Check your connection.")} onRetry={retry} />
          ) : vendors.length === 0 ? (
            <View style={styles.none}>
              <T variant="t3" weight={400} color={colors.textSecondary} align="center">
                {luxuryOn
                  ? t('No luxury specialists here yet. Turn off “{label}” to see every garage.', { label: t(LUXURY_FILTER_LABEL) })
                  : silverOnly
                  ? t('No Silver or Gold garages here yet. Turn off “{label}” to see every garage.', { label: t(SILVER_KEY_LABEL) })
                  : mode === 'pickup'
                    ? t('No garage collects from your area yet.')
                    : mode === 'doorstep' && !citywide
                      ? t('No garage travels to your area yet.')
                      : farEmpty
                        ? farEmptyLine(place)
                        : t('No garages match these filters.')}
              </T>
              <View style={styles.noneActions}>
                {/* Nothing within 150 km (0070): another city, in the area sheet. */}
                {farEmpty ? (
                  <ScButton variant="outline" fullWidth={false} onPress={onAskArea}>
                    {t('Choose a city')}
                  </ScButton>
                ) : null}
                {luxuryOn ? (
                  <ScButton variant="outline" fullWidth={false} onPress={() => setLuxuryFilter(null)}>
                    {t('Show every garage')}
                  </ScButton>
                ) : null}
                {!luxuryOn && silverOnly ? (
                  <ScButton variant="outline" fullWidth={false} onPress={() => setSilverChosen(false)}>
                    {t('Show every garage')}
                  </ScButton>
                ) : null}
                {!silverOnly && !luxuryOn && category !== 'all' ? (
                  <ScButton variant="outline" fullWidth={false} onPress={() => setCategory('all')}>
                    {t('Show all services')}
                  </ScButton>
                ) : null}
                {!silverOnly && !luxuryOn && origin && mode !== 'dropin' ? (
                  <ScButton variant="outline" fullWidth={false} onPress={() => selectCity(city)}>
                    {t('Show all of {city}', { city: city.name })}
                  </ScButton>
                ) : null}
                {!silverOnly && !luxuryOn && mode !== 'dropin' ? (
                  <ScButton variant="outline" fullWidth={false} onPress={() => switchTo('dropin')}>
                    {t('Try {mode}', { mode: t(BOOKING_TYPE_LABELS.dropin) })}
                  </ScButton>
                ) : null}
              </View>
            </View>
          ) : (
            cards
          )}
          {isFetchingMore ? <Spinner /> : null}
          {listEnded && justOutside.length > 0 ? (
            <JustOutsideSection items={justOutside} mode={mode as 'doorstep' | 'pickup'} />
          ) : null}
          {/* Bring your garage (21 Nov 2026): after the last garage, in every area; in a small
              city it is the one way to tell us about another (it replaced the quiet row). */}
          {listEnded ? <BringGarageCard /> : null}
          {listEnded && mode !== 'pickup' ? <NextTabFooter offer={nextOffer} onSwitch={switchTo} /> : null}
          {listEnded && mode === 'pickup' ? <FreeWashPiece placement="bottom" /> : null}
        </View>
      </View>
    </View>
  );

  return (
    <SeenProvider value={seen.value}>
      <PullCar scrollY={scrollY} refreshing={refreshing} top={insets.top} />
      <Animated.ScrollView
        ref={scroll}
        style={styles.scroll}
        keyboardShouldPersistTaps="handled"
        onScroll={onScroll}
        scrollEventThrottle={16}
        stickyHeaderIndices={[1]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={Platform.OS === 'ios' && !reduce ? 'transparent' : undefined} />}
        contentContainerStyle={{ paddingTop: 16, paddingBottom: clearance }}
      >
        {above}
        {controls}
        {below}
      </Animated.ScrollView>

      <FilterSheet open={filterOpen} value={category} counts={counts} onChange={setCategory} onClose={() => setFilterOpen(false)} />
      <SortSheet
        open={sortOpen}
        value={sort}
        onChange={setChosenSort}
        onClose={() => setSortOpen(false)}
        locationUnavailable={citywide}
        ratingAvailable={canSortByRating(vendors, sort, hasMore)}
      />
      <QuickLook vendor={quickLook} mode={mode} onClose={() => setQuickLook(null)} />
    </SeenProvider>
  );
}

const SEARCH_HINTS = [msg('garages or services'), msg('foam wash'), msg('ceramic coating'), msg('interior cleaning'), msg('scratch removal')];

const useStyles = createStyles((c) => ({
  flex: { flex: 1, minWidth: 0 },
  scroll: { flex: 1 },
  stack: { gap: 16, paddingHorizontal: 16 },
  search: { height: 50 },
  searchInner: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16 },
  controls: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    marginBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'transparent',
  },
  filterRow: { marginTop: 8, flexDirection: 'row', gap: 8 },
  luxuryRow: { marginTop: 8, flexDirection: 'row' },
  rowScroll: { marginHorizontal: -16 },
  rowContent: { gap: 12, paddingHorizontal: 16, paddingBottom: 4 },
  countLine: { flexDirection: 'row', alignItems: 'flex-end' },
  skip: { gap: 12, borderRadius: 18, borderWidth: 1, borderColor: c.skipBorder, backgroundColor: c.skipBg, padding: 16 },
  skipTitle: { marginTop: 6 },
  skipRow: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: c.line,
    backgroundColor: c.disc,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  explainer: { gap: 12, padding: 16 },
  step: { flexDirection: 'row', gap: 12 },
  stepNo: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: c.discStrong },
  safeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  safe: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 6, backgroundColor: c.successMuted, paddingHorizontal: 8, paddingVertical: 4 },
  section: { gap: 12 },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  sort: { height: 40 },
  sortInner: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14 },
  caption: { marginTop: 4 },
  atHome: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' },
  list: { gap: 14 },
  refreshing: { opacity: 0.6 },
  finding: { paddingVertical: 32 },
  none: { alignItems: 'center', gap: 12, paddingVertical: 24 },
  noneActions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 },
  unlocated: { paddingTop: 4 },
  collect: { borderRadius: 999, backgroundColor: c.collectBg, paddingHorizontal: 10, paddingVertical: 4 },
  outside: { gap: 12, paddingTop: 8 },
  outsideActions: { marginTop: 8, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  seePrices: { minHeight: 44, justifyContent: 'center', borderRadius: 999, borderWidth: 1, borderColor: c.stroke, paddingHorizontal: 16 },
  request: { minHeight: 44, justifyContent: 'center', borderRadius: 999, backgroundColor: c.chosenBg, paddingHorizontal: 16 },
  nextTab: { marginTop: 4, minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, borderWidth: 1, borderStyle: 'dashed', borderColor: c.stroke, paddingHorizontal: 16 },
}));
