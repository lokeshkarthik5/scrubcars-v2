import type { StockItemDetail } from '@repo/core/api/garage-book';
import { useSetStockUsage, useStockItem } from '@repo/core/api/hooks/use-garage-book';
import { istDateKey, rupees, stockAmountText, stockDeltaText, stockMoveWord } from '@repo/core/garage-book';
import { useT } from '@repo/core/i18n';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { Edge, Raised, RedButton } from '@repo/native-ui/finish';
import { IconPencil } from '@repo/native-ui/icons';
import { PressScale } from '@repo/native-ui/motion';
import { LoadError, SkeletonList } from '@repo/native-ui/primitives';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { toast } from '@repo/native-ui/toast';

import { garageScreen } from '@/components/app-shell';
import { BookScreen } from '@/components/book/book-screen';
import { AMBER, BackHeader, Footnote, go, OK, Overline, RaisedButton, Row, Stepper } from '@/components/book/parts';
import { StockGauge } from '@/components/book/stock-gauge';
import { CountSheet, StockItemSheet } from '@/components/book/stock-sheets';
import { useIsVendorAdmin } from '@/lib/auth';
import { dayMonth, packLine, stepAmount, stockLeftLine, stockUseLine, unitWord } from '@/lib/garage-book-2';

/** One stock item (K2; the web's app/book/stock/[id]/page.tsx): the dial, Count it, what each job uses, its history. */
function StockItemScreen() {
  const t = useT();
  const styles = useStyles();
  const colors = useColors();
  const isOwner = useIsVendorAdmin();
  const { id } = useLocalSearchParams<{ id: string }>();
  const detail = useStockItem(id ?? null);
  const [counting, setCounting] = useState(false);
  const [editing, setEditing] = useState(false);
  const data = detail.data;
  const item = data?.item;
  const sub = item
    ? [packLine(item), isOwner ? item.supplier?.name : null, isOwner && item.packPricePaise ? rupees(item.packPricePaise) : null].filter(Boolean).join(' · ')
    : undefined;
  return (
    <BookScreen gap={14}>
      <BackHeader
        title={item?.name ?? t('Stock')}
        sub={sub || undefined}
        right={
          isOwner && item ? (
            <PressScale accessibilityRole="button" accessibilityLabel={t('Change {name}', { name: item.name })} onPress={() => setEditing(true)}>
              <Raised radius={12} style={styles.square}>
                <IconPencil size={18} />
              </Raised>
            </PressScale>
          ) : null
        }
      />
      {!data || !item ? (
        detail.isError ? <LoadError what={t('this item')} onRetry={() => void detail.refetch()} /> : <SkeletonList count={2} height={160} />
      ) : (
        <>
          <Edge radius={22} innerStyle={styles.dial}>
            <StockGauge share={item.share} low={item.low} width={168} label={t('{name} left: {amount}', { name: item.name, amount: stockAmountText(item.level, item.unit) })} />
            <T size={16} weight={600} color={item.low ? AMBER : colors.textPrimary} align="center">
              {item.jobsLeft === null ? stockLeftLine(item) : t('{left} left', { left: stockLeftLine(item) })}
            </T>
            <T size={12} color={colors.textSecondary} align="center">
              {stockUseLine(item)}
            </T>
            <View style={styles.buttons}>
              <RaisedButton label={t('Count it')} height={44} radius={16} onPress={() => setCounting(true)} style={styles.flex} />
              {isOwner ? (
                <RedButton onPress={() => go('/book/stock/order')} height={44} radius={16} style={styles.flex}>
                  {/* Half the width: a long Tamil label is set smaller rather than spilling. */}
                  <T variant="t3" weight={600} color={colors.white} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} style={styles.shrink}>
                    {t('Order again')}
                  </T>
                </RedButton>
              ) : null}
            </View>
          </Edge>
          <Usage detail={data} canChange={isOwner} />
          <View>
            <Overline>{t('History')}</Overline>
            {data.moves.length === 0 ? (
              <Footnote>{t('Nothing yet. Jobs, counts and orders show here.')}</Footnote>
            ) : (
              data.moves.map((move) => (
                <Row key={move.id}>
                  <T size={12} color={colors.textSecondary} style={styles.date}>
                    {dayMonth(istDateKey(new Date(move.at)))}
                  </T>
                  <T size={14} style={styles.flex} numberOfLines={1}>
                    {move.kind === 'counted' && move.by?.name ? t('Counted by {name}', { name: move.by.name }) : stockMoveWord(move.kind)}
                  </T>
                  <T num size={14} color={move.kind === 'counted' ? colors.textSecondary : move.delta > 0 ? OK : colors.textPrimary}>
                    {move.kind === 'counted' ? stockAmountText(move.levelAfter, item.unit) : stockDeltaText(move.delta, item.unit)}
                  </T>
                </Row>
              ))
            )}
          </View>
        </>
      )}
      {counting && item ? <CountSheet item={item} onClose={() => setCounting(false)} /> : null}
      {editing && item ? (
        <StockItemSheet item={item} onClose={() => setEditing(false)} onRemoved={() => (router.canGoBack() ? router.back() : router.replace('/book/stock' as Href))} />
      ) : null}
    </BookScreen>
  );
}

/**
 * "Each job uses": per service, what one job takes. The owner's − and + save on their own
 * a moment after the last tap; staff see the amounts only.
 */
function Usage({ detail, canChange }: { detail: StockItemDetail; canChange: boolean }) {
  const t = useT();
  const styles = useStyles();
  const colors = useColors();
  const save = useSetStockUsage();
  const unit = detail.item.unit;
  const [amounts, setAmounts] = useState<Record<string, number>>(() => Object.fromEntries(detail.usage.map((row) => [row.serviceId, row.amount])));
  const dirty = useRef(false);
  useEffect(() => {
    if (!dirty.current) return;
    const timer = setTimeout(() => {
      dirty.current = false;
      save.mutate(
        { id: detail.item.id, rows: Object.entries(amounts).map(([serviceId, amount]) => ({ serviceId, amount })) },
        { onError: (error) => toast.error(error instanceof Error ? error.message : t("Couldn't save. Try again.")) }
      );
    }, 700);
    return () => clearTimeout(timer);
    // `save` is a new object each render; the amounts are what matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amounts]);
  const rows = detail.usage.filter((row) => !row.isAddon || (amounts[row.serviceId] ?? 0) > 0);
  if (rows.length === 0) return null;
  return (
    <View>
      <Overline>{t('Each job uses')}</Overline>
      {rows.map((row) => {
        const amount = amounts[row.serviceId] ?? 0;
        const step = (dir: 1 | -1) => {
          dirty.current = true;
          setAmounts((current) => ({ ...current, [row.serviceId]: stepAmount(current[row.serviceId] ?? 0, unit, dir) }));
        };
        return (
          <Row key={row.serviceId}>
            <T size={14} weight={600} style={styles.flex}>
              {row.name}
            </T>
            {canChange ? (
              <Stepper
                value={String(amount)}
                onLess={() => step(-1)}
                onMore={() => step(1)}
                lessLabel={t('Less for {service}', { service: row.name })}
                moreLabel={t('More for {service}', { service: row.name })}
              />
            ) : (
              <T num size={14} weight={600}>
                {String(amount)}
              </T>
            )}
            <T size={12} color={colors.textSecondary} style={styles.unit}>
              {unitWord(unit)}
            </T>
          </Row>
        );
      })}
    </View>
  );
}

export default garageScreen(StockItemScreen);

const useStyles = createStyles(() => ({
  flex: { flex: 1, minWidth: 0 },
  shrink: { flexShrink: 1 },
  square: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  dial: { padding: 16, alignItems: 'center', gap: 6 },
  buttons: { flexDirection: 'row', gap: 8, alignSelf: 'stretch', marginTop: 8 },
  date: { width: 44 },
  unit: { width: 26 },
}));
