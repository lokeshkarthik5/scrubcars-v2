import { useVendorSearch } from '@repo/core/api/hooks/use-vendors';
import { useDebounced } from '@repo/core/hooks/use-debounced';
import { IconAdjustments, IconSearch } from '@repo/native-ui/icons';
import { ErrorState, PressRow, Spinner } from '@repo/native-ui/primitives';
import { Rise } from '@repo/native-ui/motion';
import { font, T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';

import { canSortByRating, sortLabel, SortSheet, type SortKey } from '@/components/garage/sort-sheet';
import { VendorCard } from '@/components/garage/vendor-card';
import { CustomerShell } from '@/components/screen';
import { coarse, isCitywide, useLocationStore } from '@/lib/location';
import { track } from '@/lib/shims/analytics';

const SORT_CHIPS: { label: string; value: SortKey }[] = [
  { label: 'Nearest', value: 'distance' },
  { label: 'Rating', value: 'rating' },
  { label: 'Price', value: 'price_asc' },
];

/** apps/users/app/search/page.tsx. */
export default function SearchScreen() {
  const colors = useColors();
  const styles = useStyles();
  const { category } = useLocalSearchParams<{ category?: string }>();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('relevance');
  const [sortOpen, setSortOpen] = useState(false);
  const location = useLocationStore((s) => s.location);
  const debouncedQuery = useDebounced(query, 300);
  useEffect(() => {
    if (debouncedQuery.trim()) track('search', { queryLength: Math.min(200, debouncedQuery.trim().length) });
  }, [debouncedQuery]);
  const citywide = isCitywide(location);
  const origin = citywide || !location ? undefined : coarse(location);

  const { vendors, hasMore, isLoading, isRefreshing, isFetchingMore, isError, retry, loadMore } = useVendorSearch(
    {
      q: debouncedQuery || undefined,
      category,
      lat: origin?.lat,
      lng: origin?.lng,
      sort: origin ? sort : sort === 'distance' ? 'relevance' : sort,
    },
    { keepPrevious: true }
  );
  const more = useRef(loadMore);
  more.current = loadMore;

  const ratingAvailable = canSortByRating(vendors, sort, hasMore);
  const awaitingFirstAnswer = isLoading || (isRefreshing && vendors.length === 0);
  const sortChips = SORT_CHIPS.filter((chip) => chip.value !== 'rating' || ratingAvailable);

  return (
    <CustomerShell showBrand onEnd={() => more.current()}>
      <View style={styles.box}>
        <IconSearch size={18} color={colors.textMuted} />
        <TextInput
          accessibilityLabel="Search garages or services"
          placeholder="Search garages or services"
          placeholderTextColor={colors.textMuted}
          keyboardAppearance={colors.keyboard}
          returnKeyType="search"
          value={query}
          onChangeText={setQuery}
          style={styles.input}
        />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll} contentContainerStyle={styles.chipRow}>
        {sortChips.map((chip) => {
          const active = sort === chip.value;
          return (
            <PressRow
              key={chip.value}
              onPress={() => setSort(active ? 'relevance' : chip.value)}
              style={[styles.chip, { backgroundColor: active ? colors.chosenBg : colors.surface }]}
            >
              <T size={13} weight={500} lh={18} color={active ? colors.chosenText : colors.textPrimary}>
                {chip.label}
              </T>
            </PressRow>
          );
        })}
        <PressRow onPress={() => setSortOpen(true)} style={styles.filter}>
          <IconAdjustments size={14} stroke={2} color={colors.textSecondary} />
          <T size={13} lh={18} color={colors.textSecondary}>
            Filter
          </T>
        </PressRow>
      </ScrollView>

      <View style={[styles.results, isRefreshing && styles.refreshing]}>
        <View style={styles.counts}>
          {!awaitingFirstAnswer && !isError ? (
            <T size={11} color={colors.textSecondary}>
              {vendors.length}
              {hasMore ? '+' : ''} garage{vendors.length === 1 && !hasMore ? '' : 's'} found
            </T>
          ) : null}
          {sort !== 'relevance' ? (
            <T size={11} color={colors.textSecondary} style={styles.sorted}>
              Sorted by {sortLabel(sort)}
            </T>
          ) : null}
        </View>
        <View style={styles.list}>
          {awaitingFirstAnswer ? (
            <T size={13} color={colors.textSecondary} align="center" style={styles.pad}>
              Searching…
            </T>
          ) : isError ? (
            <ErrorState message="Couldn't load garages. Check your connection." onRetry={retry} />
          ) : vendors.length === 0 ? (
            <T size={13} color={colors.textSecondary} align="center" style={styles.pad}>
              No garages or services match your search.
            </T>
          ) : (
            // Results rise in, the words that found them underlined with the red light (moment 11).
            vendors.map((vendor, i) => (
              <Rise key={vendor.id} index={Math.min(i, 8)}>
                <VendorCard vendor={vendor} highlight={debouncedQuery.trim() || undefined} />
              </Rise>
            ))
          )}
          {isFetchingMore ? <Spinner /> : null}
        </View>
      </View>

      <SortSheet
        open={sortOpen}
        value={sort}
        onChange={setSort}
        onClose={() => setSortOpen(false)}
        locationUnavailable={citywide}
        ratingAvailable={ratingAvailable}
      />
    </CustomerShell>
  );
}

const useStyles = createStyles((c) => ({
  box: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, paddingHorizontal: 12 },
  input: { flex: 1, minWidth: 0, paddingVertical: 10, fontFamily: font(400), fontSize: 13, color: c.textPrimary },
  chipScroll: { flexGrow: 0, marginHorizontal: -16 },
  chipRow: { gap: 8, paddingHorizontal: 16 },
  chip: { minHeight: 44, justifyContent: 'center', borderRadius: 999, paddingHorizontal: 16 },
  filter: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, borderWidth: 1, borderColor: c.line, paddingHorizontal: 14 },
  results: { gap: 16 },
  refreshing: { opacity: 0.6 },
  counts: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  sorted: { marginLeft: 'auto' },
  list: { gap: 8 },
  pad: { paddingVertical: 24 },
}));
