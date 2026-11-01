import { useSavedGarages, useToggleSavedGarage } from '@repo/core/api/hooks/use-favourites';
import { useVendorClosures, useVendorWorkingHours } from '@repo/core/api/hooks/use-slots';
import { toMinutes, useTravelTime } from '@repo/core/api/hooks/use-travel-time';
import { useGarage, useVendorReviews } from '@repo/core/api/hooks/use-vendors';
import { bookingTypeParam, offeredBookingTypes, parseBookingType, resolveBookingType } from '@repo/core/booking-types';
import { distanceAndDrive, distanceLabel } from '@repo/core/drive-time';
import { straightLineKm } from '@repo/core/map';
import { resolveServiceAmount } from '@repo/core/pricing';
import { hasStarScore, NEW_GARAGE_LABEL } from '@repo/core/ratings';
import { knownDurationTotal } from '@repo/core/service-duration';
import { outsideCityLine } from '@repo/core/service-city';
import { useUserStore } from '@repo/core/stores/user-store';
import type { BookingType, Service, ServicePackage } from '@repo/core/types';
import { formatDuration } from '@repo/core/utils';
import { ScButton } from '@repo/native-ui/button';
import { IconArrowLeft, IconArrowUpRight, IconMapPin, IconSearch, IconStarFilled } from '@repo/native-ui/icons';
import { ErrorState, Notice, PressRow } from '@repo/native-ui/primitives';
import { Figures, font, T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { useQuery } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { type Href, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GarageCover, GarageMonogram } from '@/components/garage/cover';
import { ModeSwitch } from '@/components/garage/mode-switch';
import { OpenStatus } from '@/components/garage/open-status';
import { ReviewsTab } from '@/components/garage/reviews-tab';
import { GarageSlotAlerts } from '@/components/slot-alerts/garage-slot-alerts';
import { SaveGarageButton } from '@/components/garage/save-button';
import { GarageAddOns, PackageCard, ServiceCard, ServiceSheet } from '@/components/garage/service-cards';
import { OutsideCityLine, TierSeal } from '@/components/garage/tier';
import { getVendorAddOns } from '@/lib/add-ons';
import { useAuth } from '@/lib/auth';
import { track } from '@/lib/shims/analytics';
import { useBookingCar } from '@/lib/booking-car';
import { coarse, isApproximate, isCitywide, useLocationStore } from '@/lib/location';
import { money, pricedForCar, servicePriceText } from '@/lib/price';

type Tab = 'services' | 'photos' | 'reviews';
const TABS: readonly { key: Tab; label: string }[] = [
  { key: 'services', label: 'Services' },
  { key: 'photos', label: 'Photos' },
  { key: 'reviews', label: 'Reviews' },
];
const NO_SERVICES: Service[] = [];
const NO_PACKAGES: ServicePackage[] = [];

/** apps/users/app/garage/[id]/page.tsx. */
export default function GarageScreen() {
  const colors = useColors();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const params = useLocalSearchParams<{ id: string; mode?: string; withdrawn?: string; code?: string; save?: string }>();
  const id = params.id;
  const offerCode = params.code?.trim() || null;
  const user = useAuth((s) => s.user);
  const activeLocation = useLocationStore((s) => s.location);

  useEffect(() => {
    if (user) void useUserStore.getState().fetchVehicles().catch(() => undefined);
  }, [user]);
  const { car: myCar } = useBookingCar();
  const carType = myCar?.vehicleType ?? null;

  const garage = useGarage(id);
  const vendor = garage.data?.vendor ?? null;
  const services = garage.data?.services ?? NO_SERVICES;
  const packages = garage.data?.packages ?? NO_PACKAGES;
  const reviewsList = useVendorReviews(id).data ?? [];
  const addOns = useQuery({ queryKey: ['vendors', 'add-ons', id], queryFn: () => getVendorAddOns(id), staleTime: 60_000 }).data ?? [];
  const workingHours = useVendorWorkingHours(id);
  const closures = useVendorClosures(id);
  const travel = useTravelTime(
    activeLocation?.source === 'gps' ? coarse(activeLocation) : null,
    vendor ? { lat: vendor.lat, lng: vendor.lng } : null
  );

  const [tab, setTab] = useState<Tab>('services');
  const [chosenMode, setChosenMode] = useState<BookingType | null>(() => parseBookingType(params.mode));
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [details, setDetails] = useState<Service | ServicePackage | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  // Back from signing in to save this garage: save it, once, and take the flag out.
  const savedGarages = useSavedGarages({ enabled: !!user });
  const toggleSaved = useToggleSavedGarage();
  const saveHandled = useRef(false);
  useEffect(() => {
    if (params.save !== '1' || saveHandled.current || !user || !vendor || !savedGarages.data) return;
    saveHandled.current = true;
    if (!savedGarages.data.vendors.some((v) => v.id === vendor.id)) toggleSaved.mutate({ vendor, save: true });
    router.setParams({ save: undefined });
  }, [params.save, user, vendor, savedGarages.data, toggleSaved]);

  const matches = (s: { name: string; description?: string | null }, q: string) =>
    s.name.toLowerCase().includes(q) || (s.description ?? '').toLowerCase().includes(q);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? services.filter((s) => matches(s, q)) : services;
  }, [services, query]);
  const filteredPackages = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? packages.filter((p) => matches(p, q) || p.items.some((i) => i.name.toLowerCase().includes(q))) : packages;
  }, [packages, query]);
  const selectedServices = useMemo(() => {
    const catalogue = [...services, ...packages];
    return selected.map((sid) => catalogue.find((s) => s.id === sid)).filter((s): s is Service | ServicePackage => s != null);
  }, [selected, services, packages]);

  const seenGarage = useRef(false);
  useEffect(() => {
    if (!vendor || seenGarage.current) return;
    seenGarage.current = true;
    track('garage_view', { vendorId: vendor.id, mode: parseBookingType(params.mode ?? null) ?? 'dropin' });
  }, [vendor, params.mode]);
  const toggle = (sid: string) => setSelected((list) => (list.includes(sid) ? list.filter((x) => x !== sid) : [...list, sid]));
  const open = (item: Service | ServicePackage) => {
    setDetails(item);
    setDetailsOpen(true);
  };

  const mode = resolveBookingType(chosenMode, vendor);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/garages' as Href));

  if (!vendor) {
    return (
      <View style={[styles.state, { paddingTop: insets.top }]}>
        {garage.isError && !garage.isFetching ? (
          <ErrorState message="Couldn't load this garage. Check your connection." onRetry={() => void garage.refetch()} />
        ) : garage.data === null ? (
          <>
            <T size={13} color={colors.textSecondary} align="center">
              This garage isn&apos;t taking bookings on Detlio.
            </T>
            <Pressable accessibilityRole="link" onPress={() => router.replace('/garages' as Href)} style={styles.findAnother}>
              <T size={13} weight={600} style={styles.underline}>
                Find another garage
              </T>
            </Pressable>
          </>
        ) : (
          <T size={13} color={colors.textSecondary}>
            Loading…
          </T>
        )}
      </View>
    );
  }

  const selectedTotal = selectedServices.reduce((total, s) => total + (resolveServiceAmount(s, carType ?? undefined) ?? s.price), 0);
  const selectedDuration = knownDurationTotal(selectedServices);
  const hasPerVehiclePricing = selectedServices.some((s) => s.pricingType === 'per_vehicle' && !pricedForCar(s, carType));
  const reviewCount = vendor.reviewCount || reviewsList.length;
  const showStars = hasStarScore({ reviewCount, isNew: vendor.isNew });
  const visibleTabs = TABS.filter((t) => t.key !== 'reviews' || reviewCount > 0);
  const hero = vendor.photos[0] ?? null;
  const fromHere =
    activeLocation && !isCitywide(activeLocation) && vendor.lat != null && vendor.lng != null
      ? straightLineKm(coarse(activeLocation), { lat: vendor.lat, lng: vendor.lng })
      : null;
  const approximate = isApproximate(activeLocation);
  const modes = offeredBookingTypes(vendor);
  const paused = vendor.bookingsPaused;
  const showBar = paused || selectedServices.length > 0;

  const book = () => {
    if (selected.length === 0) return;
    track('booking_start', { vendorId: id, mode, serviceCount: Math.min(20, selected.length) });
    const modeQuery = bookingTypeParam(mode);
    router.push(
      `/book/${id}?service=${selected.join(',')}${modeQuery ? `&mode=${modeQuery}` : ''}${offerCode ? `&code=${encodeURIComponent(offerCode)}` : ''}` as Href
    );
  };

  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      <ScrollView keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets contentContainerStyle={{ paddingBottom: showBar ? 112 : insets.bottom + 24 }}>
        <View style={styles.hero}>
          {hero ? (
            <Image source={{ uri: hero }} accessibilityLabel={vendor.name} resizeMode="cover" style={StyleSheet.absoluteFill} />
          ) : (
            <GarageCover vendor={vendor} size="hero" metaTop={64} />
          )}
          <LinearGradient pointerEvents="none" colors={['rgba(0,0,0,0.6)', 'rgba(0,0,0,0)']} style={styles.heroShade} />
          <PressRow accessibilityLabel="Go back" onPress={back} style={styles.heroBack}>
            <IconArrowLeft size={20} stroke={2} color="#FAFAFA" />
          </PressRow>
          <View style={styles.heroSave}>
            <SaveGarageButton vendor={vendor} />
          </View>
          {vendor.logoUrl ? (
            <View style={styles.heroLogo}>
              <Image source={{ uri: vendor.logoUrl }} accessibilityLabel={`${vendor.name} logo`} resizeMode="cover" style={styles.fill} />
            </View>
          ) : (
            <GarageMonogram vendor={vendor} size={56} radius={14} fontSize={20} style={styles.heroMonogram} />
          )}
        </View>

        <View style={styles.head}>
          <View style={styles.titleBlock}>
            <T accessibilityRole="header" size={28} weight={300} lh={31} tracking={-0.025}>
              {vendor.name}
            </T>
            <OpenStatus hours={workingHours.data} closures={closures.data} />
          </View>
          <View style={styles.facts}>
            {showStars ? (
              <>
                <IconStarFilled size={13} />
                <T num size={13}>
                  {vendor.rating.toFixed(1)}
                </T>
                <T size={13} color={colors.textSecondary}>
                  ({reviewCount} {reviewCount === 1 ? 'review' : 'reviews'})
                </T>
              </>
            ) : (
              <T size={13} weight={500}>
                {NEW_GARAGE_LABEL}
              </T>
            )}
            {fromHere !== null ? (
              <>
                <T size={13} color={colors.textSecondary}>
                  ·
                </T>
                <T num size={13} weight={500} color={colors.textSecondary}>
                  {travel.data ? distanceLabel(fromHere, approximate) : distanceAndDrive(fromHere, approximate)}
                </T>
              </>
            ) : null}
            {fromHere !== null && travel.data ? (
              <>
                <T size={13} color={colors.textSecondary}>
                  ·
                </T>
                <T size={13} color={colors.textSecondary}>
                  <T num size={13} weight={500} color={colors.textSecondary}>
                    {formatDuration(toMinutes(travel.data.durationS))}
                  </T>{' '}
                  drive
                </T>
              </>
            ) : null}
          </View>
          {vendor.area ? (
            <View style={styles.areaChip}>
              <IconMapPin size={13} stroke={2} color={colors.textSecondary} />
              <T size={12} lh={16} color={colors.textSecondary}>
                {vendor.area}
              </T>
            </View>
          ) : null}
          {vendor.tier ? <TierSeal tier={vendor.tier} /> : null}
          {vendor.outsideServiceCity ? <OutsideCityLine text={outsideCityLine(vendor.outsideServiceCity)} /> : null}
          {modes.length > 1 ? (
            <View style={styles.modes}>
              <ModeSwitch modes={modes} value={mode} onChange={setChosenMode} />
            </View>
          ) : null}
          {mode === 'pickup' ? (
            <T size={12} lh={20} color={colors.textSecondary}>
              Free pickup &amp; drop: {vendor.name} collects your car from your address, works on it at the garage and brings it
              back.
            </T>
          ) : null}
          {params.withdrawn === '1' ? (
            <Notice tone="neutral" title="The services you picked are no longer offered here.">
              Choose from what this garage offers now.
            </Notice>
          ) : null}
        </View>

        <View style={styles.alerts}>
          <GarageSlotAlerts vendorId={vendor.id} />
        </View>

        <View accessibilityRole="tablist" accessibilityLabel="Garage sections" style={styles.tabs}>
          {visibleTabs.map((t) => (
            <Pressable
              key={t.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === t.key }}
              onPress={() => setTab(t.key)}
              style={[styles.tab, { borderBottomColor: tab === t.key ? colors.textPrimary : 'transparent' }]}
            >
              <T size={15} color={tab === t.key ? colors.textPrimary : colors.textSecondary}>
                {t.label}
              </T>
            </Pressable>
          ))}
        </View>

        <View style={styles.panel}>
          {tab === 'services' ? (
            <>
              <View style={styles.search}>
                <IconSearch size={17} stroke={2} color={colors.textSecondary} />
                <TextInput
                  accessibilityLabel="Search services"
                  placeholder="Search services..."
                  placeholderTextColor={colors.textMuted}
                  keyboardAppearance={colors.keyboard}
                  value={query}
                  onChangeText={setQuery}
                  style={styles.searchInput}
                />
              </View>
              {filteredPackages.length > 0 ? (
                <>
                  <View style={styles.sectionHead}>
                    <T size={17} weight={500}>
                      Packages
                    </T>
                    <T size={12} color={colors.textSecondary}>
                      {filteredPackages.length} {filteredPackages.length === 1 ? 'package' : 'packages'}
                    </T>
                  </View>
                  {filteredPackages.map((pkg) => (
                    <PackageCard
                      key={pkg.id}
                      pkg={pkg}
                      added={selected.includes(pkg.id)}
                      paused={paused}
                      carType={carType}
                      onOpen={() => open(pkg)}
                      onToggle={() => toggle(pkg.id)}
                    />
                  ))}
                </>
              ) : null}
              <View style={styles.sectionHead}>
                <T size={17} weight={500}>
                  Services
                </T>
                <T size={12} color={colors.textSecondary}>
                  {filtered.length} {filtered.length === 1 ? 'service' : 'services'}
                </T>
              </View>
              {filtered.length === 0 ? (
                <T size={13} color={colors.textSecondary} align="center" style={styles.none}>
                  {services.length === 0 ? 'No services available yet.' : 'No services match that search.'}
                </T>
              ) : (
                filtered.map((svc) => (
                  <ServiceCard
                    key={svc.id}
                    service={svc}
                    added={selected.includes(svc.id)}
                    paused={paused}
                    carType={carType}
                    carModel={myCar?.model ?? null}
                    onOpen={() => open(svc)}
                    onToggle={() => toggle(svc.id)}
                  />
                ))
              )}
              {addOns.length > 0 ? <GarageAddOns addOns={addOns} carType={carType} /> : null}
            </>
          ) : null}

          {tab === 'photos' ? (
            vendor.photos.length > 0 ? (
              <View style={styles.grid}>
                {vendor.photos.map((url, i) => (
                  <Image
                    key={url}
                    source={{ uri: url }}
                    accessibilityLabel={`${vendor.name} ${i + 1}`}
                    resizeMode="cover"
                    style={[styles.gridPhoto, { width: (width - 40) / 2, height: (width - 40) / 2 }]}
                  />
                ))}
              </View>
            ) : (
              <T size={13} color={colors.textSecondary} align="center" style={styles.none}>
                No photos yet.
              </T>
            )
          ) : null}

          {tab === 'reviews' ? <ReviewsTab vendor={vendor} reviewCount={reviewCount} /> : null}
        </View>
      </ScrollView>

      {paused ? (
        <View accessibilityLiveRegion="polite" style={[styles.bar, styles.barColumn, { paddingBottom: insets.bottom + 12 }]}>
          <T size={15} weight={600}>
            Not taking bookings right now
          </T>
          <T size={13} color={colors.textSecondary} style={styles.pausedLine}>
            {vendor.bookingsPausedReason || 'This garage has paused new bookings. Check back later, or pick another garage.'}
          </T>
        </View>
      ) : selectedServices.length > 0 ? (
        <View style={[styles.bar, { paddingBottom: insets.bottom + 12 }]}>
          <View style={styles.flex}>
            <T size={13} numberOfLines={1} color={colors.textSecondary}>
              {selectedServices.length === 1
                ? selectedServices[0].name
                : `${selectedServices.length} services${selectedDuration !== null ? ` · ${formatDuration(selectedDuration)}` : ''}`}
            </T>
            <T size={17} lh={22} numberOfLines={1}>
              <Figures
                size={17}
                lh={22}
                text={
                  selectedServices.length === 1
                    ? servicePriceText(selectedServices[0], carType)
                    : `${hasPerVehiclePricing ? 'from ' : ''}${money(selectedTotal)}`
                }
              />
            </T>
          </View>
          <ScButton variant="hero" fullWidth={false} onPress={book}>
            <T size={15} weight={500} lh={20} color={colors.white}>
              Book Now
            </T>
            <IconArrowUpRight size={17} stroke={1.5} color={colors.white} />
          </ScButton>
        </View>
      ) : null}

      <ServiceSheet
        details={details}
        open={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        added={details ? selected.includes(details.id) : false}
        paused={paused}
        onToggle={() => {
          if (details) toggle(details.id);
          setDetailsOpen(false);
        }}
      />
    </View>
  );
}

const useStyles = createStyles((c) => ({
  page: { flex: 1, backgroundColor: c.canvas },
  flex: { flex: 1, minWidth: 0 },
  fill: { width: '100%', height: '100%' },
  state: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: c.canvas, padding: 16 },
  findAnother: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12 },
  underline: { textDecorationLine: 'underline' },
  hero: { height: 210, backgroundColor: c.surfaceElevated },
  heroShade: { position: 'absolute', left: 0, right: 0, top: 0, height: 96 },
  heroBack: { position: 'absolute', top: 12, left: 12, width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.45)' },
  heroSave: { position: 'absolute', top: 12, right: 12 },
  heroLogo: { position: 'absolute', left: 16, bottom: 12, width: 56, height: 56, overflow: 'hidden', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.7)', backgroundColor: c.surface },
  heroMonogram: { position: 'absolute', left: 16, bottom: 12 },
  head: { gap: 12, paddingHorizontal: 16, paddingTop: 16 },
  titleBlock: { gap: 4 },
  facts: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  areaChip: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, backgroundColor: c.surface, paddingHorizontal: 12, paddingVertical: 6 },
  modes: { marginTop: 4 },
  alerts: { paddingHorizontal: 16, marginTop: 12 },
  tabs: { marginTop: 16, flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: c.border, paddingHorizontal: 16 },
  tab: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 2, marginBottom: -1, paddingVertical: 10 },
  panel: { gap: 12, paddingHorizontal: 16, paddingVertical: 16 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, paddingHorizontal: 14 },
  searchInput: { flex: 1, minWidth: 0, paddingVertical: 12, fontFamily: font(400), fontSize: 13, color: c.textPrimary },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  none: { paddingVertical: 24 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  gridPhoto: { borderRadius: 10, backgroundColor: c.surface },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: 1, borderTopColor: c.border, backgroundColor: c.canvas, paddingHorizontal: 16, paddingTop: 12 },
  barColumn: { flexDirection: 'column', alignItems: 'stretch', gap: 0 },
  pausedLine: { marginTop: 2 },
}));
