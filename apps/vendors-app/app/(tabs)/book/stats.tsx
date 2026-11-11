import { useBookStats } from '@repo/core/api/hooks/use-garage-book';
import { WEEK_LETTERS, busiestIndex, monthName, recentMonths, rupees, type BookFilter } from '@repo/core/garage-book';
import { msg, useT, useTn } from '@repo/core/i18n';
import { useState } from 'react';
import { View } from 'react-native';

import { Edge } from '@repo/native-ui/finish';
import { IconChevronDown } from '@repo/native-ui/icons';
import { LoadError, SkeletonList } from '@repo/native-ui/primitives';
import { ScSheet } from '@repo/native-ui/sheet';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';

import { garageScreen } from '@/components/app-shell';
import { BookScreen } from '@/components/book/book-screen';
import { BackHeader, Empty, Footnote, Overline, RaisedButton, Seg, Tile } from '@/components/book/parts';
import { useIsVendorAdmin } from '@/lib/auth';

/** Stats (B4, the owner's; the web's app/book/stats/page.tsx). Profit waits for Expenses (stage 2). */
function StatsScreen() {
  const t = useT();
  const tn = useTn();
  const styles = useStyles();
  const colors = useColors();
  const isOwner = useIsVendorAdmin();
  const now = new Date();
  const months = recentMonths(now);
  const [month, setMonth] = useState(months[0]!);
  const [picking, setPicking] = useState(false);
  const [filter, setFilter] = useState<BookFilter>('all');
  const stats = useBookStats(month === months[0] ? undefined : month, filter, isOwner);
  const data = stats.data;
  const lit = data ? busiestIndex(data.busiestDays) : null;
  const max = data ? Math.max(1, ...data.busiestDays) : 1;
  const total = data ? data.split.ownPaise + data.split.detlioPaise : 0;
  const detlioShare = data && total > 0 ? data.split.detlioPaise / total : 0;
  return (
    <BookScreen>
      <BackHeader
        title={t('Stats')}
        right={<RaisedButton label={monthName(month, now)} height={40} radius={12} icon={<IconChevronDown size={16} />} onPress={() => setPicking(true)} />}
      />
      <Seg<BookFilter>
        label={msg('Show money from')}
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'all', label: msg('All') },
          { value: 'detlio', label: 'Detlio' },
          { value: 'own', label: msg('My own') },
        ]}
      />
      {!isOwner ? (
        <Empty>{t('Only the garage’s owner sees Stats.')}</Empty>
      ) : !data ? (
        stats.isError ? <LoadError what={t('Stats')} onRetry={() => void stats.refetch()} /> : <SkeletonList count={3} height={112} />
      ) : (
        <>
          <Edge radius={22} innerStyle={styles.big}>
            <View>
              <Overline>{month === months[0] ? t('This month so far') : monthName(month, now)}</Overline>
              <T num size={34} weight={600} lh={42} tracking={-0.02}>
                {rupees(data.takenPaise) ?? '₹0'}
              </T>
              {data.changePercent !== null ? (
                <T size={12} color={data.changePercent >= 0 ? '#4ADE80' : '#FF8A95'}>
                  {t('{arrow} {percent}% on last month, same days', {
                    arrow: data.changePercent >= 0 ? '↑' : '↓',
                    percent: Math.abs(data.changePercent),
                  })}
                </T>
              ) : null}
            </View>
            {filter === 'all' && total > 0 ? (
              <>
                <View accessible accessibilityLabel={t('Detlio {detlio}, your own {own}', { detlio: rupees(data.split.detlioPaise) ?? '', own: rupees(data.split.ownPaise) ?? '' })} style={styles.split}>
                  {detlioShare > 0 ? <View style={[styles.splitRed, { flex: detlioShare }]} /> : null}
                  {detlioShare < 1 ? <View style={[styles.splitSilver, { flex: 1 - detlioShare }]} /> : null}
                </View>
                <View style={styles.legend}>
                  <T size={12} color="#C8C8D0">
                    {'Detlio '}
                    <T num size={12} weight={600}>
                      {rupees(data.split.detlioPaise) ?? ''}
                    </T>
                  </T>
                  <T size={12} color="#C8C8D0">
                    {`${t('Your own')} `}
                    <T num size={12} weight={600}>
                      {rupees(data.split.ownPaise) ?? ''}
                    </T>
                  </T>
                </View>
              </>
            ) : null}
          </Edge>
          <View style={styles.tiles}>
            <Tile
              label={t('Came back')}
              value={data.cameBackPercent === null ? '–' : `${data.cameBackPercent}%`}
              sub={t("of last month's customers")}
              style={styles.tile}
            />
            <Tile
              label={t('New customers')}
              value={data.newCustomers}
              sub={data.newFromDetlio > 0 ? t('{count} found you on Detlio', { count: data.newFromDetlio }) : t('this month')}
              style={styles.tile}
            />
            {data.profitPaise !== null ? <Tile label={t('Profit')} value={rupees(data.profitPaise) ?? ''} style={styles.tile} /> : null}
            <Tile
              label={t('Owed to you')}
              value={rupees(data.owedPaise) ?? '₹0'}
              sub={tn(data.owedCustomers, '{count} customer', '{count} customers')}
              style={styles.tile}
            />
          </View>
          <Edge radius={22} innerStyle={styles.busy}>
            <View style={styles.busyHead}>
              <Overline>{t('Busiest days')}</Overline>
              <T size={11} color={colors.textSecondary}>
                {t('last 4 weeks')}
              </T>
            </View>
            <View style={styles.bars}>
              {data.busiestDays.map((n, i) => (
                <View key={i} style={styles.barCol}>
                  <View style={styles.barBox}>
                    <View style={[styles.bar, i === lit ? styles.barLit : styles.barQuiet, { height: `${Math.max(4, (n / max) * 100)}%` }]} />
                  </View>
                  <T size={11} color={colors.textSecondary}>
                    {WEEK_LETTERS[i]}
                  </T>
                </View>
              ))}
            </View>
          </Edge>
          <Footnote>{t('Detlio figures are what customers paid for jobs done; your payout is on Payouts.')}</Footnote>
        </>
      )}
      <ScSheet open={picking} onClose={() => setPicking(false)} accessibilityLabel={t('Month')} horizontalPadding={16}>
        <View style={{ gap: 8, paddingBottom: 8 }}>
          {months.map((m) => (
            <RaisedButton
              key={m}
              label={`${monthName(m, now)}${m === month ? ' ✓' : ''}`}
              onPress={() => {
                setMonth(m);
                setPicking(false);
              }}
            />
          ))}
        </View>
      </ScSheet>
    </BookScreen>
  );
}

export default garageScreen(StatsScreen);

const useStyles = createStyles(() => ({
  big: { padding: 16, gap: 12 },
  split: { flexDirection: 'row', height: 8, gap: 3 },
  splitRed: { borderRadius: 4, backgroundColor: '#FF2D4A' },
  splitSilver: { borderRadius: 4, backgroundColor: '#C9CBD2' },
  legend: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: { width: '48.8%', flexGrow: 1, flexBasis: '45%' },
  busy: { paddingHorizontal: 16, paddingVertical: 14 },
  busyHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  bars: { flexDirection: 'row', gap: 8, marginTop: 10 },
  barCol: { flex: 1, alignItems: 'center', gap: 6 },
  barBox: { height: 70, width: '100%', justifyContent: 'flex-end' },
  bar: { width: '100%', borderTopLeftRadius: 6, borderTopRightRadius: 6, borderBottomLeftRadius: 3, borderBottomRightRadius: 3 },
  barLit: { backgroundColor: '#FF2D4A', shadowColor: '#E4002B', shadowOpacity: 0.5, shadowRadius: 7, shadowOffset: { width: 0, height: 0 } },
  barQuiet: { backgroundColor: '#C9CBD2', opacity: 0.75 },
}));
