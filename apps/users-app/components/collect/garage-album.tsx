import type { GarageAlbum, GarageAlbumCar, GarageOwnedCar } from '@repo/core/api/garage';
import { useGarageAlbum } from '@repo/core/api/hooks/use-garage';
import { cardNumber, collectedLine, duplicatesLine, GARAGE_RARITIES, RARITY_LABELS, RARITY_LOOKS, type GarageRarity } from '@repo/core/garage';
import { fill, useT } from '@repo/core/i18n';
import { rewardDate, rewardRupees } from '@repo/core/rewards';
import { Chip } from '@repo/native-ui/chip';
import { IconChevronRight, IconCircleCheckFilled, IconInfoCircle } from '@repo/native-ui/icons';
import { PressRow } from '@repo/native-ui/primitives';
import { ScSheet } from '@repo/native-ui/sheet';
import { FigureLine, T } from '@repo/native-ui/text';
import { createStyles, ThemeScope, useColors } from '@repo/native-ui/theme';
import { LinearGradient } from 'expo-linear-gradient';
import { type Href, router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { GarageCard, GarageTile, IllustrationLine } from './garage-card';
import { GarageShare } from './garage-share';

type Filter = 'all' | GarageRarity;

export const firstNameOf = (name: string | null | undefined): string | null => (name ?? '').trim().split(/\s+/)[0] || null;

function Progress({ percent, height = 8, min = 2 }: { percent: number; height?: number; min?: number }) {
  return (
    <View style={{ height, borderRadius: height / 2, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.1)' }}>
      <LinearGradient start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} colors={['#8C929C', '#DCE1EC']} style={{ height: '100%', borderRadius: height / 2, width: `${Math.max(min, percent)}%` }} />
    </View>
  );
}

/** GarageEntry: the Rewards page's way in. */
export function GarageEntry() {
  const styles = useStyles();
  const album = useGarageAlbum(true);
  const data = album.data;
  if (!data) return null;
  const owned = data.cars.filter((c) => c.owned);
  const newest = [...owned].sort((a, b) => (b.firstPulledAt ?? '').localeCompare(a.firstPulledAt ?? '')).slice(0, 3);
  const shown = newest.length > 0 ? newest : data.cars.slice(0, 3);
  const percent = Math.round((data.collected / Math.max(1, data.series.total)) * 100);
  return (
    <ThemeScope scheme="dark">
      <PressRow onPress={() => router.push('/profile/rewards/garage' as Href)}>
        <EntryBody series={data.series.name} collected={data.collected} total={data.series.total} percent={percent} reward={data.rowReward} shown={shown} styles={styles} />
      </PressRow>
    </ThemeScope>
  );
}

function EntryBody({ series, collected, total, percent, reward, shown, styles }: { series: string; collected: number; total: number; percent: number; reward: string | number; shown: GarageAlbumCar[]; styles: ReturnType<typeof useStyles> }) {
  const t = useT();
  const colors = useColors();
  return (
    <LinearGradient start={{ x: 0, y: 0 }} end={{ x: 0.6, y: 1 }} colors={['#1F2026', '#15161A', '#101114']} locations={[0, 0.6, 1]} style={styles.entry}>
      <View style={styles.between}>
        <View style={styles.shrink}>
          <T size={12} lh={16} color={colors.textSecondary}>{`Detlio Garage · ${series}`}</T>
          <T size={18} weight={600} lh={24}>
            {fill(t('{count} cars collected'), {
              count: (
                <T num size={18} weight={600}>
                  {collectedLine(collected, total)}
                </T>
              ),
            })}
          </T>
        </View>
        <IconChevronRight size={18} color={colors.textSecondary} />
      </View>
      <Progress percent={percent} height={6} min={3} />
      <View style={styles.three}>
        {shown.map((car) => (
          <View key={car.number} style={styles.tileThird}>
            <GarageTile car={car} />
          </View>
        ))}
      </View>
      <FigureLine size={12} lh={16} color={colors.textSecondary} text={t('Every booking earns a card. Finish a row of five for ₹{reward} off.', { reward })} />
    </LinearGradient>
  );
}

/** GarageAlbumView (apps/users/components/garage/garage-album.tsx). */
export function GarageAlbumView({ album, firstName }: { album: GarageAlbum; firstName: string | null }) {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  const [filter, setFilter] = useState<Filter>('all');
  const [open, setOpen] = useState<GarageAlbumCar | null>(null);
  const [how, setHow] = useState(false);
  const total = album.series.total;
  const percent = Math.round((album.collected / Math.max(1, total)) * 100);
  const rowsDone = album.rows.filter((r) => r.complete).length;
  const counts = useMemo(
    () => Object.fromEntries(GARAGE_RARITIES.map((r) => [r, { owned: album.cars.filter((c) => c.rarity === r && c.owned).length, all: album.cars.filter((c) => c.rarity === r).length }])) as Record<GarageRarity, { owned: number; all: number }>,
    [album]
  );
  const byNumber = new Map(album.cars.map((c) => [c.number, c]));
  const tile = (car: GarageAlbumCar, share: object) => (
    <Pressable key={car.number} accessibilityRole="button" accessibilityLabel={car.owned ? (car.count > 1 ? t('{name}, {rarity}, number {number}, {count} copies', { name: car.name, rarity: t(car.rarityLabel), number: car.number, count: car.count }) : t('{name}, {rarity}, number {number}', { name: car.name, rarity: t(car.rarityLabel), number: car.number })) : t('Number {number}, {rarity}, not collected yet', { number: car.number, rarity: t(car.rarityLabel) })} onPress={() => setOpen(car)} style={share}>
      <GarageTile car={car} />
    </Pressable>
  );
  return (
    <>
      <ThemeScope scheme="dark">
        <Hero album={album} percent={percent} rowsDone={rowsDone} total={total} />
      </ThemeScope>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} accessibilityLabel={t('Filter by rarity')}>
        <Chip label={t('All {count}', { count: album.collected })} selected={filter === 'all'} onPress={() => setFilter('all')} />
        {GARAGE_RARITIES.map((r) => (
          <Chip key={r} label={`${t(RARITY_LABELS[r])} ${counts[r].owned}`} selected={filter === r} onPress={() => setFilter(r)} />
        ))}
      </ScrollView>

      {filter === 'all' ? (
        <View style={styles.rows}>
          {album.rows.map((row) => (
            <View key={row.row} style={styles.rowBlock}>
              <View style={styles.rowHead}>
                <T size={13} weight={600} lh={18}>
                  {`${t('Row {row}', { row: row.row })} `}
                  <T num size={13} lh={18} color={colors.textSecondary}>{`· ${t('{count} of {total}', { count: row.collected, total: row.total })}`}</T>
                </T>
                <T size={11} lh={15} color={row.complete ? (colors.scheme === 'light' ? '#A67C0F' : '#F7D06B') : colors.textMuted}>
                  {row.complete ? (row.reward?.voucher ? t('Done · {amount} off given', { amount: rewardRupees(album.rowReward) }) : t('Done · bonus stamps given')) : t('{amount} off when complete', { amount: rewardRupees(album.rowReward) })}
                </T>
              </View>
              <View style={styles.five}>{row.numbers.map((n) => tile(byNumber.get(n)!, styles.fifth))}</View>
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.rowBlock}>
          <FigureLine size={12} lh={16} color={colors.textSecondary} text={t('{count} of {total} {rarity} cards', { count: counts[filter].owned, total: counts[filter].all, rarity: t(RARITY_LABELS[filter]) })} />
          <View style={styles.four}>{album.cars.filter((c) => c.rarity === filter).map((car) => tile(car, styles.fourth))}</View>
        </View>
      )}

      <View style={styles.how}>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: how }} onPress={() => setHow((on) => !on)} style={styles.howHead}>
          <IconInfoCircle size={16} />
          <T size={13} weight={500} lh={18}>
            {t('How the Garage works')}
          </T>
        </Pressable>
        {how ? (
          <View style={styles.howList}>
            {[
              t('Every booking that earns a Shine Card stamp also earns one Garage card. Some scratch cards, challenges and badges give cards too.'),
              t('Odds for each card: Common {common}%, Rare {rare}%, Epic {epic}%, Legendary {legendary}%. A Rare or better is certain within {pityRare} cards, a Legendary within {pityLegendary}.', {
                common: album.odds.common,
                rare: album.odds.rare,
                epic: album.odds.epic,
                legendary: album.odds.legendary,
                pityRare: album.pity.rare,
                pityLegendary: album.pity.legendary,
              }),
              t('Every {count} duplicates make a bonus Shine Card stamp. Finish a row of 5 for {amount} off your next booking.', { count: album.duplicates.perStar, amount: rewardRupees(album.rowReward) }),
              t("Cars shown for illustration only. Not affiliated with any car maker. Card names are Detlio's own."),
            ].map((line) => (
              <View key={line} style={styles.bullet}>
                <T size={12} lh={16} color={colors.textSecondary}>
                  •
                </T>
                <View style={styles.shrink}>
                  <FigureLine size={12} lh={16} color={colors.textSecondary} text={line} />
                </View>
              </View>
            ))}
          </View>
        ) : null}
      </View>

      <ScSheet horizontalPadding={16} open={open !== null} onClose={() => setOpen(null)} accessibilityLabel={open?.owned ? open.name : t('A card not collected yet')}>
        {open ? open.owned ? <OwnedDetail car={open} firstName={firstName} /> : <MissingDetail car={open} /> : null}
      </ScSheet>
    </>
  );
}

function Hero({ album, percent, rowsDone, total }: { album: GarageAlbum; percent: number; rowsDone: number; total: number }) {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  return (
    <LinearGradient start={{ x: 0, y: 0 }} end={{ x: 0.6, y: 1 }} colors={['#1F2026', '#15161A', '#101114']} locations={[0, 0.6, 1]} style={styles.entry}>
      <View style={styles.heroTop}>
        <View>
          <T size={12} lh={16} color={colors.textSecondary}>{t('{series} · supercar cards', { series: album.series.name })}</T>
          <T num size={30} weight={600} lh={36} tracking={-0.03}>
            {collectedLine(album.collected, total)}
          </T>
          <T size={13} lh={18} color={colors.textSecondary}>
            {t('cars collected')}
          </T>
        </View>
        <View style={styles.heroRight}>
          <T num size={20} weight={600} lh={24}>{`${rowsDone}/${album.rows.length}`}</T>
          <T size={11} lh={15} color={colors.textSecondary}>
            {t('rows complete')}
          </T>
        </View>
      </View>
      <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: total, now: album.collected }} accessibilityLabel={t('Cars collected')}>
        <Progress percent={percent} />
      </View>
      <View style={styles.heroFacts}>
        <FigureLine size={12} lh={16} color={colors.textSecondary} text={t('Each row of 5: {amount} off', { amount: rewardRupees(album.rowReward) })} />
        <FigureLine size={12} lh={16} color={colors.textSecondary} text={duplicatesLine(album.duplicates.waiting, album.duplicates.perStar)} />
      </View>
      {album.completedAt ? (
        <View style={styles.complete}>
          <IconCircleCheckFilled size={16} color="#F7D06B" />
          <T size={13} lh={18} style={styles.shrink}>
            {t('Series complete on {day}. You are a Garage Legend.', { day: rewardDate(album.completedAt) })}
          </T>
        </View>
      ) : null}
    </LinearGradient>
  );
}

function OwnedDetail({ car, firstName }: { car: GarageOwnedCar; firstName: string | null }) {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  const look = RARITY_LOOKS[car.rarity];
  return (
    <ScrollView style={styles.sheet} contentContainerStyle={styles.detail}>
      <View style={{ width: 290 }}>
        <GarageCard car={car} />
      </View>
      <T size={12} lh={16} uppercase tracking={0.14} color={colors.scheme === 'light' ? colors.textSecondary : look.pill}>
        {`${t(car.rarityLabel)} · ${cardNumber(car.number, car.total)}`}
      </T>
      <T size={20} weight={600} lh={26} align="center">
        {car.name}
      </T>
      <IllustrationLine />
      <FigureLine size={12} lh={16} color={colors.textSecondary} text={`${car.count > 1 ? t('You have {count} of these', { count: car.count }) : t('You have 1 of these')}${car.firstPulledAt ? ` · ${t('first on {day}', { day: rewardDate(car.firstPulledAt) })}` : ''}`} />
      <View style={styles.stretch}>
        <GarageShare car={car} firstName={firstName} />
      </View>
    </ScrollView>
  );
}

function MissingDetail({ car }: { car: Exclude<GarageAlbumCar, GarageOwnedCar> }) {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  return (
    <View style={styles.detail}>
      <View style={{ width: 150 }}>
        <GarageTile car={car} />
      </View>
      <T size={12} lh={16} uppercase tracking={0.14} color={colors.scheme === 'light' ? colors.textSecondary : RARITY_LOOKS[car.rarity].pill}>
        {`${t(car.rarityLabel)} · ${cardNumber(car.number, car.total)}`}
      </T>
      <T size={18} weight={600} lh={24} align="center">
        {t('Not in your Garage yet')}
      </T>
      <T size={13} lh={18} align="center" color={colors.textSecondary}>
        {t('Every booking paid through Detlio earns a card. This one could be next.')}
      </T>
    </View>
  );
}

const useStyles = createStyles((c) => ({
  entry: { gap: 12, borderRadius: 18, borderWidth: 1, borderColor: '#2A2A2E', paddingHorizontal: 16, paddingVertical: 16 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  shrink: { flexShrink: 1, minWidth: 0 },
  three: { flexDirection: 'row', gap: 8 },
  tileThird: { width: '31.5%' },
  heroTop: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 },
  heroRight: { alignItems: 'flex-end' },
  heroFacts: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 16, rowGap: 4 },
  complete: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(247,208,107,0.4)', backgroundColor: 'rgba(247,208,107,0.1)', paddingHorizontal: 12, paddingVertical: 8 },
  chips: { gap: 8, paddingBottom: 2 },
  rows: { gap: 16 },
  rowBlock: { gap: 8 },
  rowHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  five: { flexDirection: 'row', gap: 6 },
  fifth: { flex: 1 },
  four: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  fourth: { width: '23%' },
  how: { borderRadius: 14, borderWidth: 1, borderColor: c.border, paddingHorizontal: 16, paddingVertical: 12 },
  howHead: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 },
  howList: { gap: 6, marginTop: 4 },
  bullet: { flexDirection: 'row', gap: 8 },
  sheet: { maxHeight: 720 },
  detail: { alignItems: 'center', gap: 8, paddingHorizontal: 4, paddingBottom: 12, paddingTop: 4 },
  stretch: { alignSelf: 'stretch', marginTop: 4 },
}));
