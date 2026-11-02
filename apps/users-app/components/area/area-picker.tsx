import { useZones } from '@repo/core/api/hooks/use-zones';
import { searchZones, type Zone } from '@repo/core/zones';

import { IconCheck, IconCurrentLocation, IconMapPin, IconSearch } from '@repo/native-ui/icons';
import { PressRow } from '@repo/native-ui/primitives';
import { ScSheet } from '@repo/native-ui/sheet';
import { font, T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { useLocationStore } from '@/lib/location';
import { track } from '@/lib/shims/analytics';

import { LocationPrompt } from './location-prompt';

/** The line said when "Near me" can't work: the phone has location blocked. */
export const NEAR_ME_BLOCKED_LINE = 'Location is off for Detlio. Pick your area instead — distances work the same.';

function AreaList({ query, chosen, onChoose }: { query: string; chosen?: string; onChoose: (zone: Zone) => void }) {
  const colors = useColors();
  const styles = useStyles();
  const found = searchZones(useZones(), query);
  return (
    <View accessibilityLabel="Areas">
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
      {found.length === 0 ? (
        <T size={13} color={colors.textSecondary} style={styles.none}>
          No area called “{query.trim()}” yet. Try a nearby one, or All of Chennai.
        </T>
      ) : null}
    </View>
  );
}

/** AreaPicker: "Near me", then every zone with a search box, then "All of Chennai". */
export function AreaPicker({ open, onClose }: { open: boolean; onClose: () => void }) {
  const colors = useColors();
  const styles = useStyles();
  const location = useLocationStore((s) => s.location);
  const selectChennai = useLocationStore((s) => s.selectChennai);
  const setArea = useLocationStore((s) => s.setArea);
  const [query, setQuery] = useState('');
  const [blocked, setBlocked] = useState(false);
  const [explaining, setExplaining] = useState(false);

  const close = () => {
    setQuery('');
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
    <ScSheet open={open} onClose={close} accessibilityLabel="Where's your car?" horizontalPadding={explaining ? 0 : 16}>
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
              Where&apos;s your car?
            </T>
            <T size={13} color={colors.textSecondary} style={styles.sub}>
              Pick your area to see distances and drive times. No location permission needed.
            </T>
          </View>
          {blocked ? (
            <T accessibilityLiveRegion="polite" size={13} lh={18} color={colors.textSecondary}>
              {NEAR_ME_BLOCKED_LINE}
            </T>
          ) : null}
          <PressRow onPress={askNearMe} style={styles.nearMe}>
            <IconCurrentLocation size={18} />
            <T size={15} style={styles.flex}>
              Near me
            </T>
            {location?.source === 'gps' ? <IconCheck size={16} /> : null}
          </PressRow>
          <View style={styles.search}>
            <IconSearch size={16} color={colors.textSecondary} />
            <TextInput
              accessibilityLabel="Search areas"
              placeholder="Search areas"
              placeholderTextColor={colors.textMuted}
              keyboardAppearance={colors.keyboard}
              value={query}
              onChangeText={setQuery}
              style={styles.searchInput}
            />
          </View>
          <AreaList
            query={query}
            chosen={location?.source === 'area' ? location.zone : undefined}
            onChoose={(zone) => {
              setArea(zone);
              close();
            }}
          />
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              selectChennai();
              close();
            }}
            style={styles.city}
          >
            <T size={15} style={styles.underline}>
              All of Chennai
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
  city: { minHeight: 44, alignSelf: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  underline: { textDecorationLine: 'underline' },
}));
