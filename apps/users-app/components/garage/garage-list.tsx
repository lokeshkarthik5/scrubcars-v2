import { FreeWashPiece } from '@/components/reach/free-wash';
import { RequestSheet } from '@/components/reach/request-sheet';
import { useTierConfig } from '@repo/core/api/hooks/use-tiers';
import { useVendorSearch } from '@repo/core/api/hooks/use-vendors';
import { BOOKING_TYPE_LABELS, BOOKING_TYPES, bookingTypeParam } from '@repo/core/booking-types';
import { CATEGORY_FILTERS } from '@repo/core/categories';
import { atGarageReach, canCollectFrom, nextTabOffer, outsideLine, skipTheDriveTitle, type NextTabOffer, type SkipTheDriveRow } from '@repo/core/reach';
import { requestActionLabel } from '@repo/core/booking-requests';
import { SILVER_FILTER_LABEL } from '@repo/core/tiers';
import type { BookingType } from '@repo/core/types';
import type { JustOutsideVendor } from '@repo/core/api/vendors';
import { ScButton } from '@repo/native-ui/button';
import {
  IconArrowRight,
  IconArrowsSort,
  IconCamera,
  IconChevronDown,
  IconChevronRight,
  IconKey,
  IconMap,
  IconSearch,
  IconShieldCheck,
} from '@repo/native-ui/icons';
import { ErrorState, HubCard, PressRow, Spinner } from '@repo/native-ui/primitives';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { type Href, router } from 'expo-router';
import { Fragment, useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { coarse, isApproximate, isCitywide, shouldOfferLocationPrompt, useLocationStore } from '@/lib/location';

import { ModeSwitch } from './mode-switch';
import { canSortByRating, sortLabel, SortSheet, type SortKey } from './sort-sheet';
import { TierMedalIcon } from './tier';
import { VendorCard } from './vendor-card';

type CategoryKey = (typeof CATEGORY_FILTERS)[number]['key'];

/** A white chip, not a red one: red is kept for things to press. */
function FilterPill({ label, on, onPress, icon }: { label: string; on: boolean; onPress: () => void; icon?: React.ReactNode }) {
  const colors = useColors();
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      onPress={onPress}
      style={[styles.pill, { backgroundColor: on ? colors.chosenBg : colors.surface }]}
    >
      {icon}
      <T size={13} weight={500} lh={18} color={on ? colors.chosenText : colors.textPrimary}>
        {label}
      </T>
    </Pressable>
  );
}

function SkipTheDriveCard({
  rows,
  nearestKm,
  onSwitch,
}: {
  rows: SkipTheDriveRow[];
  nearestKm: number | null;
  onSwitch: (mode: BookingType) => void;
}) {
  const colors = useColors();
  const styles = useStyles();
  return (
    <View style={styles.skip}>
      <View>
        <T size={11} weight={500} tracking={0.12} uppercase color={colors.skipKicker}>
          Skip the drive
        </T>
        <T size={17} weight={500} style={styles.skipTitle}>
          {skipTheDriveTitle(nearestKm)}
        </T>
        <T size={13} color={colors.textSecondary}>
          Get it done without driving:
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
  const colors = useColors();
  const styles = useStyles();
  const steps = [
    'Collected from your address. You hand it over with a code from the app.',
    'Worked on at the garage. Follow each step on your booking, from picked up to on its way back.',
    'Brought back to the same address, handed over with a second code.',
  ];
  const safe = [
    { Icon: IconShieldCheck, words: 'Garage responsible for your car' },
    { Icon: IconKey, words: 'Handover codes both ways' },
    { Icon: IconCamera, words: 'Add your own photos before pickup' },
  ];
  return (
    <HubCard style={styles.explainer}>
      <T size={17} weight={500}>
        They collect, you relax
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

function JustOutsideSection({ items, mode }: { items: JustOutsideVendor[]; mode: 'doorstep' | 'pickup' }) {
  const colors = useColors();
  const styles = useStyles();
  const [requesting, setRequesting] = useState<JustOutsideVendor | null>(null);
  const modeParam = bookingTypeParam(mode);
  return (
    <View style={styles.outside}>
      <View style={styles.headRow}>
        <T size={17} weight={500}>
          Just outside their area
        </T>
        <T size={12} color={colors.textMuted}>
          by distance
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
                accessibilityLabel={`See prices at ${item.vendor.name}`}
                onPress={() => router.push(`/garage/${item.vendor.id}${modeParam ? `?mode=${modeParam}` : ''}` as Href)}
                style={styles.seePrices}
              >
                <T size={14}>See prices</T>
              </PressRow>
              <PressRow
                accessibilityLabel={`${requestActionLabel(mode)} from ${item.vendor.name}`}
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
  const colors = useColors();
  const styles = useStyles();
  if (!offer) return null;
  return (
    <PressRow onPress={() => onSwitch(offer.mode)} style={styles.nextTab}>
      <View style={styles.flex}>
        <T size={12} color={colors.textMuted}>
          Nothing here suits you?
        </T>
        <T size={15}>{offer.label}</T>
      </View>
      <IconArrowRight size={18} color={colors.textSecondary} />
    </PressRow>
  );
}

/**
 * GarageList (apps/users/components/garages/garage-list.tsx): mode switch, search, chips,
 * sort, the garages and the "never empty" pieces around them. `useList` hands the screen
 * what it needs for infinite scroll, since the screen owns the ScrollView.
 */
export function GarageList({
  mode,
  onModeChange,
  onAskArea,
  bindLoadMore,
  scrollToTop,
}: {
  mode: BookingType;
  onModeChange: (mode: BookingType) => void;
  onAskArea: () => void;
  bindLoadMore: (loadMore: () => void) => void;
  scrollToTop: () => void;
}) {
  const colors = useColors();
  const styles = useStyles();
  const [category, setCategory] = useState<CategoryKey>('all');
  const silverFilterOffered = useTierConfig().data?.silverFilter === true;
  const [silverChosen, setSilverChosen] = useState(false);
  const silverOnly = silverChosen && silverFilterOffered;
  const [chosenSort, setChosenSort] = useState<SortKey | null>(null);
  const [sortOpen, setSortOpen] = useState(false);

  const location = useLocationStore((s) => s.location);
  const permission = useLocationStore((s) => s.permission);
  const promptDismissedAt = useLocationStore((s) => s.promptDismissedAt);
  const refreshPermission = useLocationStore((s) => s.refreshPermission);
  const selectChennai = useLocationStore((s) => s.selectChennai);

  const citywide = isCitywide(location);
  const origin = citywide || !location ? undefined : coarse(location);
  const approximate = isApproximate(location);
  const sort: SortKey = chosenSort ?? (origin ? 'distance' : 'relevance');
  const effectiveSort = origin ? sort : sort === 'distance' ? 'relevance' : sort;
  const categoryParam = category === 'all' ? undefined : category;

  const { vendors, reach, outside, hasMore, isLoading, isRefreshing, isFetchingMore, isError, retry, loadMore } = useVendorSearch(
    {
      bookingType: mode,
      category: categoryParam,
      silverAndAbove: silverOnly || undefined,
      lat: origin?.lat,
      lng: origin?.lng,
      sort: effectiveSort,
    },
    { keepPrevious: true }
  );
  bindLoadMore(loadMore);

  const firstUnlocatedIndex = origin ? vendors.findIndex((v) => v.distanceKm === null) : -1;
  const atGarage =
    mode === 'dropin' && !isRefreshing
      ? atGarageReach(reach, !!origin)
      : { skipTheDrive: null, atHomeLine: false, nearestKm: null };
  const listEnded = !isLoading && !isError && !hasMore && !isRefreshing;
  const justOutside = (mode === 'doorstep' || mode === 'pickup') && listEnded ? (outside ?? []) : [];
  const nextOffer = nextTabOffer(mode, reach);

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

  const switchTo = (next: BookingType) => {
    onModeChange(next);
    scrollToTop();
  };

  return (
    <>
      <ModeSwitch modes={BOOKING_TYPES} value={mode} onChange={onModeChange} />

      <PressRow onPress={() => router.navigate('/search' as Href)} style={styles.searchBar}>
        <IconSearch size={17} color={colors.textSecondary} />
        <T size={13} color={colors.textMuted}>
          Search garages or services
        </T>
      </PressRow>

      {mode !== 'pickup' ? <FreeWashPiece placement="top" /> : null}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipScroll}
        contentContainerStyle={styles.chipRow}
      >
        {silverFilterOffered ? (
          <>
            <FilterPill
              label={SILVER_FILTER_LABEL}
              on={silverOnly}
              onPress={() => setSilverChosen((on) => !on)}
              icon={<TierMedalIcon tier="silver" size={15} />}
            />
            <View style={styles.chipDivider} />
          </>
        ) : null}
        {CATEGORY_FILTERS.map((c) => (
          <FilterPill key={c.key} label={c.label} on={category === c.key} onPress={() => setCategory(c.key)} />
        ))}
      </ScrollView>

      {mode === 'pickup' ? <PickupExplainer /> : null}
      {atGarage.skipTheDrive ? (
        <SkipTheDriveCard rows={atGarage.skipTheDrive} nearestKm={atGarage.nearestKm} onSwitch={switchTo} />
      ) : null}

      <View style={styles.section}>
        <View style={styles.headRow}>
          <T size={17} weight={500} style={styles.flex}>
            {mode === 'dropin' && atGarage.skipTheDrive ? 'Or drive to' : 'Nearby garages'}
          </T>
          <View style={styles.headActions}>
            <PressRow
              onPress={() =>
                router.navigate(
                  `/map?bookingType=${mode}${category === 'all' ? '' : `&category=${category}`}` as Href
                )
              }
              style={styles.headPill}
            >
              <IconMap size={14} stroke={2} color={colors.textSecondary} />
              <T size={13} lh={18} color={colors.textSecondary}>
                Map
              </T>
            </PressRow>
            <PressRow onPress={() => setSortOpen(true)} style={styles.headPill}>
              <IconArrowsSort size={14} stroke={2} color={colors.textSecondary} />
              <T size={13} lh={18} numberOfLines={1} color={colors.textSecondary}>
                {sortLabel(sort)}
              </T>
              <IconChevronDown size={14} stroke={2} color={colors.textSecondary} />
            </PressRow>
          </View>
        </View>

        {mode === 'pickup' && !origin && vendors.length > 0 ? (
          <T size={11} color={colors.textMuted}>
            Set your location to see only garages that collect from your area. Checkout checks your address either way.
          </T>
        ) : null}
        {origin && location && vendors.length > 0 && sort === 'distance' ? (
          <T size={11} color={colors.textMuted}>
            Nearest first from {location.label}
            {approximate ? ' (distances from the area’s centre)' : ''}
          </T>
        ) : null}
        {atGarage.atHomeLine ? (
          <Pressable accessibilityRole="button" onPress={() => switchTo('doorstep')} style={styles.atHome}>
            <T size={13} color={colors.textSecondary}>
              or have it done at home
            </T>
            <IconArrowRight size={14} color={colors.textSecondary} />
          </Pressable>
        ) : null}

        <View style={[styles.list, isRefreshing && styles.refreshing]}>
          {isLoading || (isRefreshing && vendors.length === 0) ? (
            <T size={13} color={colors.textSecondary} align="center" style={styles.finding}>
              Finding garages…
            </T>
          ) : isError ? (
            <ErrorState message="Couldn't load garages. Check your connection." onRetry={retry} />
          ) : vendors.length === 0 ? (
            <View style={styles.none}>
              <T size={15} color={colors.textSecondary} align="center">
                {silverOnly
                  ? 'No Silver or Gold garages here yet. Turn off “Silver & above” to see every garage.'
                  : mode === 'pickup'
                    ? 'No garage collects from your area yet.'
                    : mode === 'doorstep' && !citywide
                      ? 'No garage travels to your area yet.'
                      : 'No garages match these filters.'}
              </T>
              <View style={styles.noneActions}>
                {silverOnly ? (
                  <ScButton variant="outline" fullWidth={false} onPress={() => setSilverChosen(false)}>
                    Show every garage
                  </ScButton>
                ) : null}
                {!silverOnly && category !== 'all' ? (
                  <ScButton variant="outline" fullWidth={false} onPress={() => setCategory('all')}>
                    Show all services
                  </ScButton>
                ) : null}
                {!silverOnly && origin && mode !== 'dropin' ? (
                  <ScButton variant="outline" fullWidth={false} onPress={selectChennai}>
                    Show all of Chennai
                  </ScButton>
                ) : null}
                {!silverOnly && mode !== 'dropin' ? (
                  <ScButton variant="outline" fullWidth={false} onPress={() => switchTo('dropin')}>
                    {`Try ${BOOKING_TYPE_LABELS.dropin}`}
                  </ScButton>
                ) : null}
              </View>
            </View>
          ) : (
            vendors.map((vendor, i) => (
              <Fragment key={vendor.id}>
                {i === firstUnlocatedIndex ? (
                  <T size={11} color={colors.textMuted} style={styles.unlocated}>
                    Other garages — location not set yet
                  </T>
                ) : null}
                <VendorCard
                  vendor={vendor}
                  mode={mode}
                  chips={
                    mode === 'dropin' && canCollectFrom(vendor, origin) ? (
                      <View style={styles.collect}>
                        <T size={12} weight={500} lh={16} color={colors.collectText}>
                          Can collect your car
                        </T>
                      </View>
                    ) : undefined
                  }
                />
              </Fragment>
            ))
          )}
          {isFetchingMore ? <Spinner /> : null}
          {listEnded && justOutside.length > 0 ? (
            <JustOutsideSection items={justOutside} mode={mode as 'doorstep' | 'pickup'} />
          ) : null}
          {listEnded && mode !== 'pickup' ? <NextTabFooter offer={nextOffer} onSwitch={switchTo} /> : null}
          {listEnded && mode === 'pickup' ? <FreeWashPiece placement="bottom" /> : null}
        </View>
      </View>

      <SortSheet
        open={sortOpen}
        value={sort}
        onChange={setChosenSort}
        onClose={() => setSortOpen(false)}
        locationUnavailable={citywide}
        ratingAvailable={canSortByRating(vendors, sort, hasMore)}
      />
    </>
  );
}

const useStyles = createStyles((c) => ({
  flex: { flex: 1, minWidth: 0 },
  pill: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingHorizontal: 16 },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surface,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  chipScroll: { marginHorizontal: -16, flexGrow: 0 },
  chipRow: { gap: 8, paddingHorizontal: 16 },
  chipDivider: { width: 1, marginVertical: 6, backgroundColor: c.border },
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
  headActions: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 },
  headPill: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, borderWidth: 1, borderColor: c.line, paddingHorizontal: 14 },
  atHome: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' },
  list: { gap: 12 },
  refreshing: { opacity: 0.6 },
  finding: { paddingVertical: 32 },
  none: { alignItems: 'center', gap: 12, paddingVertical: 24 },
  noneActions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 },
  unlocated: { paddingTop: 4 },
  collect: { borderRadius: 6, backgroundColor: c.collectBg, paddingHorizontal: 8, paddingVertical: 2 },
  outside: { gap: 12, paddingTop: 8 },
  outsideActions: { marginTop: 8, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  seePrices: { minHeight: 44, justifyContent: 'center', borderRadius: 999, borderWidth: 1, borderColor: c.stroke, paddingHorizontal: 16 },
  request: { minHeight: 44, justifyContent: 'center', borderRadius: 999, backgroundColor: c.chosenBg, paddingHorizontal: 16 },
  nextTab: { marginTop: 4, minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, borderWidth: 1, borderStyle: 'dashed', borderColor: c.stroke, paddingHorizontal: 16 },
}));
