import { useBookStock } from '@repo/core/api/hooks/use-garage-book';
import { useT, useTn } from '@repo/core/i18n';
import { useState } from 'react';
import { View } from 'react-native';

import { Edge } from '@repo/native-ui/finish';
import { PressScale } from '@repo/native-ui/motion';
import { LoadError, SkeletonList } from '@repo/native-ui/primitives';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';

import { garageScreen } from '@/components/app-shell';
import { BookScreen } from '@/components/book/book-screen';
import { AddButton, AMBER, BackHeader, Empty, Footnote, go, RaisedButton } from '@/components/book/parts';
import { StockGauge } from '@/components/book/stock-gauge';
import { StockItemSheet } from '@/components/book/stock-sheets';
import { useIsVendorAdmin } from '@/lib/auth';
import { packLine, stockLeftLine } from '@/lib/garage-book-2';

/** Stock (K1; the web's app/book/stock/page.tsx). Staff see the levels, never a price. */
function StockScreen() {
  const t = useT();
  const tn = useTn();
  const styles = useStyles();
  const colors = useColors();
  const isOwner = useIsVendorAdmin();
  const stock = useBookStock();
  const [adding, setAdding] = useState(false);
  const data = stock.data;
  return (
    <BookScreen gap={14}>
      <BackHeader title={t('Stock')} right={isOwner ? <AddButton label={t('Add')} accessibilityLabel={t('Add to stock')} onPress={() => setAdding(true)} /> : null} />
      {!data ? (
        stock.isError ? <LoadError what={t('stock')} onRetry={() => void stock.refetch()} /> : <SkeletonList count={2} height={160} />
      ) : (
        <>
          {data.lowCount > 0 ? (
            <Edge radius={20} innerStyle={styles.low}>
              <View style={styles.flex}>
                <T size={15} weight={600} color={AMBER}>
                  {tn(data.lowCount, '{count} running low', '{count} running low')}
                </T>
                <T size={12} color={colors.textSecondary} numberOfLines={2} style={styles.subLine}>
                  {data.lowNames.join(' · ')}
                </T>
              </View>
              {isOwner ? <RaisedButton label={t('Order again')} height={40} radius={12} onPress={() => go('/book/stock/order')} /> : null}
            </Edge>
          ) : null}
          {data.items.length === 0 ? (
            <Empty>{isOwner ? t('Add what you use, like foam shampoo or wax, and how much each service uses. It goes down by itself as you finish jobs.') : t('No stock written down yet')}</Empty>
          ) : (
            <View style={styles.grid}>
              {data.items.map((item) => (
                <PressScale key={item.id} accessibilityRole="link" accessibilityLabel={`${item.name}, ${stockLeftLine(item)}`} onPress={() => go(`/book/stock/${item.id}`)} style={styles.cell}>
                  <Edge radius={20} innerStyle={styles.item}>
                    <StockGauge share={item.share} low={item.low} width={96} label={t('{name} left', { name: item.name })} />
                    <T size={14} weight={600} align="center" numberOfLines={2} style={styles.name}>
                      {item.name}
                    </T>
                    {packLine(item) ? (
                      <T size={11} color={colors.textSecondary} align="center">
                        {packLine(item)}
                      </T>
                    ) : null}
                    <T size={12} weight={item.low ? 600 : 400} color={item.low ? AMBER : colors.textSecondary} align="center">
                      {stockLeftLine(item)}
                    </T>
                  </Edge>
                </PressScale>
              ))}
            </View>
          )}
        </>
      )}
      <Footnote>{t('Stock goes down by itself when you finish a job, by what each service uses.')}</Footnote>
      {adding ? <StockItemSheet item={null} onClose={() => setAdding(false)} /> : null}
    </BookScreen>
  );
}

export default garageScreen(StockScreen);

const useStyles = createStyles(() => ({
  flex: { flex: 1, minWidth: 0 },
  low: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  subLine: { marginTop: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cell: { width: '48.8%', flexGrow: 1, flexBasis: '45%' },
  item: { padding: 12, alignItems: 'center', gap: 4 },
  name: { marginTop: 2 },
}));
