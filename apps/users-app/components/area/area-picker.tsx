import { createGeoSessionToken } from '@repo/core/api/geo';
import { useAreaPlaces } from '@repo/core/api/hooks/use-area-places';
import { useZones } from '@repo/core/api/hooks/use-zones';
import type { AreaPlace } from '@repo/core/area-place';
import { msg, useT } from '@repo/core/i18n';
import { CITY_SWITCH_MAX, cityGaragesLine, zoneInCity, type CustomerCity } from '@repo/core/customer-city';
import { searchZones, type Zone } from '@repo/core/zones';

import { GraphiteSwitch } from '@repo/native-ui/finish';
import { IconCheck, IconCurrentLocation, IconMapPin, IconSearch } from '@repo/native-ui/icons';
import { PressRow } from '@repo/native-ui/primitives';
import { ScSheet } from '@repo/native-ui/sheet';
import { font, T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { useCustomerPlace } from '@/lib/customer-place';
import { useLocationStore } from '@/lib/location';
import { track } from '@/lib/shims/analytics';

import { LocationPrompt } from './location-prompt';

/** The line said when "Near me" can't work: the phone has location blocked. */
export const NEAR_ME_BLOCKED_LINE = msg('Location is off for Detlio. Pick your area instead — distances work the same.');

/**
 * Which city's areas the sheet lists, as the web's CityChoice: the graphite switch for two or
 * three cities, each with a quiet "42 garages" (none for a small city), rows from four. A
 * radiogroup named "City" either way.
 */
function CityChoice({
  cities,
  value,
  onChange,
}: {
  cities: readonly CustomerCity[];
  value: CustomerCity;
  onChange: (city: CustomerCity) => void;
}) {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  if (cities.length <= CITY_SWITCH_MAX) {
    return (
      <GraphiteSwitch
        accessibilityLabel={t('City')}
        value={value.id}
        onChange={(id) => {
          const next = cities.find((c) => c.id === id);
          if (next) onChange(next);
        }}
        options={cities.map((c) => ({ value: c.id, label: c.name, quiet: cityGaragesLine(c) ?? undefined }))}
      />
    );
  }
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={t('City')}>
      {cities.map((c) => {
        const on = c.id === value.id;
        const quiet = cityGaragesLine(c);
        return (
          <Pressable
            key={c.id}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            onPress={() => onChange(c)}
            style={styles.areaRow}
          >
            <T size={15} weight={on ? 500 : 400} style={styles.flex}>
              {c.name}
            </T>
            {quiet ? (
              <T num size={12} color={colors.textMuted}>
                {quiet}
              </T>
            ) : null}
            {on ? <IconCheck size={16} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * The city's zones, filtered by the search, and under them any place in the city that matches
 * (useAreaPlaces, 22 Nov 2026): "Other places in Chennai". The web's AreaList.
 */
function AreaList({
  query,
  city,
  cities,
  chosen,
  onChoose,
  onChoosePlace,
}: {
  query: string;
  city: CustomerCity;
  cities: readonly CustomerCity[];
  chosen?: string;
  onChoose: (zone: Zone) => void;
  onChoosePlace: (place: AreaPlace) => void;
}) {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  const [sessionToken] = useState(createGeoSessionToken);
  const inCity = useZones().filter((zone) => zoneInCity(zone, city, cities));
  const found = searchZones(inCity, query);
  const { places, searching } = useAreaPlaces({
    query,
    city,
    cities,
    zoneNames: found.map((zone) => zone.name),
    sessionToken,
  });
  const typed = query.trim();
  const nothing = typed.length > 0 && found.length === 0 && places.length === 0 && !searching;
  // A city with no areas drawn yet lists none: its places still come up when typed, and
  // "All of <City>" right below is the choice.
  return (
    <View>
      {found.length > 0 ? (
        <View accessibilityLabel={t('Areas')}>
          {found.map((zone) => {
            const on = chosen === zone.slug;
            return (
              <Pressable
                key={zone.slug}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                onPress={() => {
                  track('area_pick', { area: zone.slug });
                  onChoose(zone);
                }}
                style={styles.areaRow}
              >
                <IconMapPin size={16} color={colors.textSecondary} />
                <T size={15} weight={on ? 500 : 400} style={styles.flex}>
                  {zone.name}
                </T>
                {on ? <IconCheck size={16} /> : null}
              </Pressable>
            );
          })}
        </View>
      ) : null}
      {places.length > 0 ? (
        <View accessibilityLabel={t('Other places in {city}', { city: city.name })}>
          <T size={12} color={colors.textSecondary} style={styles.placesHead}>
            {t('Other places in {city}', { city: city.name })}
          </T>
          {places.map((place) => (
            <Pressable
              key={place.id}
              accessibilityRole="button"
              onPress={() => {
                track('area_pick', { area: 'place' });
                onChoosePlace(place);
              }}
              style={[styles.areaRow, styles.placeRow]}
            >
              <IconSearch size={16} color={colors.textSecondary} />
              <View style={styles.flex}>
                <T size={15} numberOfLines={1}>
                  {place.name}
                </T>
                {place.detail ? (
                  <T size={12} color={colors.textSecondary} numberOfLines={1}>
                    {place.detail}
                  </T>
                ) : null}
              </View>
            </Pressable>
          ))}
        </View>
      ) : null}
      {searching && found.length === 0 && places.length === 0 ? (
        <T accessibilityLiveRegion="polite" size={13} color={colors.textSecondary} style={styles.none}>
          {t('Searching {city}…', { city: city.name })}
        </T>
      ) : null}
      {nothing ? (
        <T size={13} color={colors.textSecondary} style={styles.none}>
          {t('Nothing called “{query}” in {city}. Try a nearby area, or All of {city}.', { query: typed, city: city.name })}
        </T>
      ) : null}
    </View>
  );
}

/**
 * AreaPicker (mockup B, customer cities 0070): the city (with two or more on), "Near me", then
 * the city's zones with a search box, then "All of <City>". Picking a city only changes the
 * list; an area or the whole city is the choice and closes the sheet. The web's AreaPicker.
 */
export function AreaPicker({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  const location = useLocationStore((s) => s.location);
  const selectCity = useLocationStore((s) => s.selectCity);
  const setArea = useLocationStore((s) => s.setArea);
  const setPlace = useLocationStore((s) => s.setPlace);
  const { city: customerCity, cities } = useCustomerPlace();
  // The city whose areas are listed: the customer's own until another is picked in the row.
  const [viewedId, setViewedId] = useState<string | null>(null);
  const viewed = cities.find((c) => c.id === viewedId) ?? customerCity;
  const manyCities = cities.length > 1;
  const [query, setQuery] = useState('');
  const [blocked, setBlocked] = useState(false);
  const [explaining, setExplaining] = useState(false);

  const close = () => {
    setQuery('');
    setViewedId(null);
    setExplaining(false);
    setBlocked(false);
    // Closed without a place: not offered again by itself for a week.
    if (!useLocationStore.getState().location) useLocationStore.getState().dismissPrompt();
    onClose();
  };

  const askNearMe = () => {
    if (useLocationStore.getState().permission === 'denied') {
      setBlocked(true);
      return;
    }
    setExplaining(true);
  };

  return (
    <ScSheet open={open} onClose={close} accessibilityLabel={t("Where's your car?")} horizontalPadding={explaining ? 0 : 16}>
      {explaining ? (
        <LocationPrompt
          onClose={() => {
            const { permission, location: now } = useLocationStore.getState();
            // Refused at the phone's prompt: back on the areas, with the line.
            if (permission === 'denied' && now?.source !== 'gps') {
              setExplaining(false);
              setBlocked(true);
            } else close();
          }}
        />
      ) : (
        <View style={styles.body}>
          <View>
            <T size={20} lh={28} tracking={-0.015}>
              {t("Where's your car?")}
            </T>
            <T size={13} color={colors.textSecondary} style={styles.sub}>
              {manyCities
                ? t('Pick your city and area to see distances and drive times. No location permission needed.')
                : t('Pick your area to see distances and drive times. No location permission needed.')}
            </T>
          </View>
          {manyCities ? (
            <CityChoice
              cities={cities}
              value={viewed}
              onChange={(next) => {
                setViewedId(next.id);
                setQuery('');
              }}
            />
          ) : null}
          {blocked ? (
            <T accessibilityLiveRegion="polite" size={13} lh={18} color={colors.textSecondary}>
              {t(NEAR_ME_BLOCKED_LINE)}
            </T>
          ) : null}
          <PressRow onPress={askNearMe} style={styles.nearMe}>
            <IconCurrentLocation size={18} />
            <T size={15} style={styles.flex}>
              {t('Near me')}
            </T>
            {location?.source === 'gps' ? <IconCheck size={16} /> : null}
          </PressRow>
          <View style={styles.search}>
            <IconSearch size={16} color={colors.textSecondary} />
            <TextInput
              accessibilityLabel={t('Search areas in {city}', { city: viewed.name })}
              placeholder={t('Search areas in {city}', { city: viewed.name })}
              placeholderTextColor={colors.textMuted}
              keyboardAppearance={colors.keyboard}
              value={query}
              onChangeText={setQuery}
              style={styles.searchInput}
            />
          </View>
          <AreaList
            query={query}
            city={viewed}
            cities={cities}
            chosen={location?.source === 'area' ? location.zone : undefined}
            onChoose={(zone) => {
              setArea(zone);
              close();
            }}
            onChoosePlace={(place) => {
              setPlace(place);
              close();
            }}
          />
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              selectCity(viewed);
              close();
            }}
            style={styles.city}
          >
            <T size={15} style={styles.underline}>
              {t('All of {city}', { city: viewed.name })}
            </T>
          </Pressable>
        </View>
      )}
    </ScSheet>
  );
}

const useStyles = createStyles((c) => ({
  flex: { flex: 1, minWidth: 0 },
  body: { gap: 16, paddingTop: 4 },
  sub: { marginTop: 4 },
  nearMe: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: c.line,
    backgroundColor: c.disc,
    paddingHorizontal: 16,
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: c.line,
    backgroundColor: c.disc,
    paddingHorizontal: 14,
  },
  searchInput: { flex: 1, minWidth: 0, paddingVertical: 12, fontFamily: font(400), fontSize: 16, color: c.textPrimary },
  areaRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: c.line, paddingHorizontal: 4 },
  none: { paddingVertical: 16 },
  placesHead: { paddingHorizontal: 4, paddingTop: 12, paddingBottom: 4 },
  placeRow: { paddingVertical: 8 },
  city: { minHeight: 44, alignSelf: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  underline: { textDecorationLine: 'underline' },
}));
