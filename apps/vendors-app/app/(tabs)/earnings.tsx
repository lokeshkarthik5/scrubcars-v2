import { type EarningsStatement, type GarageStatementLine, getEarningsStatement } from '@repo/core/api/earnings';
import { istDateLabel, LINE_STATUS_LABEL, PAYOUT_METHOD_LABEL, rupeesLabel } from '@repo/core/payouts';
import { router, useFocusEffect } from 'expo-router';
import { type ComponentRef, useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, type ScrollView, View } from 'react-native';

import { AppShell, garageScreen } from '@/components/app-shell';
import { GarageStatus } from '@/components/garage-status';
import { BigFigure, Dim, HubList, HubPill, HubTag, HubTile, HubTitle, TileRow } from '@/components/hub/parts';
import { DateField } from '@/components/form-controls';
import { GraphiteSwitch } from '@repo/native-ui/finish';
import { IconChevronDown, IconChevronUp, IconDownload, IconReceipt, IconSparkles, IconWallet } from '@repo/native-ui/icons';
import { EmptyState, HubCard, LoadError, Skeleton, SkeletonList } from '@repo/native-ui/primitives';
import { SectionHeader } from '@/components/rows';
import { T } from '@repo/native-ui/text';
import { toast } from '@repo/native-ui/toast';
import { useAuth, useIsVendorAdmin } from '@/lib/auth';
import {
  balanceFootnote,
  balanceTiles,
  changeRangeDate,
  csvFileName,
  datesFailedLine,
  type DateRange,
  type FigureRow,
  lineBalanceNote,
  lineFigureRows,
  lineKindBadge,
  lineMeta,
  LINE_TONE,
  lineTitle,
  payoutNote,
  type Preset,
  PRESETS,
  rangeForPreset,
  type Segment,
  statementCsvText,
} from '@/lib/earnings-view';
import { shareCsv } from '@/lib/earnings-share';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { fill, useT } from '@repo/core/i18n';

/** Words with their figures in the brand's numeric face, as the web sets them. */
function Words({ segments, size }: { segments: Segment[]; size: number }) {
  const colors = useColors();
  return (
    <T size={size} color={colors.textSecondary}>
      {segments.map((segment, i) => (
        <T
          key={i}
          size={size}
          num={segment.num}
          color={segment.strong ? colors.textPrimary : colors.textSecondary}
        >
          {segment.text}
        </T>
      ))}
    </T>
  );
}

/** One figure of a booking's breakdown. */
function Figure({ row }: { row: FigureRow }) {
  const colors = useColors();
  const styles = useStyles();
  return (
    <View style={styles.figure}>
      <T
        size={12}
        weight={row.strong ? 500 : 400}
        color={row.strong ? colors.textPrimary : colors.textSecondary}
        style={styles.figureLabel}
      >
        {row.label}
      </T>
      <T
        size={12}
        num={!row.free}
        weight={row.strong ? 600 : 400}
        color={row.free ? colors.success : colors.textPrimary}
        align="right"
        style={styles.figureValue}
      >
        {row.value}
      </T>
    </View>
  );
}

const TAG_TONE: Record<string, 'green' | 'blue' | 'amber'> = { done: 'green', progress: 'blue', attention: 'amber' };

/**
 * One booking in the Bookings list card (mockup garage-hub 4): what and for whom, the
 * garage's share and how it stands. A tap opens its breakdown (price, promo, commission,
 * your share), its payouts and what is still owed, as the card showed before.
 */
function LineRow({ line, first }: { line: GarageStatementLine; first: boolean }) {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  const [open, setOpen] = useState(false);
  const kind = lineKindBadge(line);
  const balanceNote = lineBalanceNote(line);
  const tone = TAG_TONE[LINE_TONE[line.status] ?? ''];
  return (
    <View style={[styles.lineRow, !first && styles.rowLine]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((v) => !v)}
        style={styles.lineHead}
      >
        <View style={styles.flex}>
          <T size={15} lh={20} numberOfLines={1}>
            {lineTitle(line)}
          </T>
          <Words segments={lineMeta(line)} size={12} />
          {kind ? (
            <View style={styles.kind}>
              <HubTag small>{t(kind)}</HubTag>
            </View>
          ) : null}
        </View>
        <View style={styles.lineAmount}>
          <T num size={17} weight={300} lh={22}>
            {rupeesLabel(line.share)}
          </T>
          <HubTag small tone={tone ?? 'quiet'}>
            {t(LINE_STATUS_LABEL[line.status])}
          </HubTag>
        </View>
        <View style={styles.lineChevron}>
          {open ? (
            <IconChevronUp size={16} color={colors.textMuted} />
          ) : (
            <IconChevronDown size={16} color={colors.textMuted} />
          )}
        </View>
      </Pressable>

      {open ? (
        <View style={styles.breakdown}>
          <View style={styles.figures}>
            {lineFigureRows(line).map((row) => (
              <Figure key={row.key} row={row} />
            ))}
          </View>

          {line.payouts.length > 0 ? (
            <T size={11} color={colors.textSecondary}>
              {line.payouts.map((payout, i) => (
                <T key={payout.payoutId} size={11} color={colors.textSecondary}>
                  {i > 0 ? ' · ' : ''}
                  {payoutNote(payout).map((segment, k) => (
                    <T
                      key={k}
                      size={11}
                      num={segment.num}
                      color={segment.strong ? colors.textPrimary : colors.textSecondary}
                    >
                      {segment.text}
                    </T>
                  ))}
                </T>
              ))}
            </T>
          ) : null}
          {balanceNote ? <Words segments={balanceNote} size={11} /> : null}
        </View>
      ) : null}
    </View>
  );
}

/** The hero's figure: "₹" small and high, the amount large and light. */
function Money({ value }: { value: string }) {
  const styles = useStyles();
  const rupee = value.startsWith('₹');
  return (
    <View style={styles.money}>
      {rupee ? (
        <T num size={30} weight={300} lh={36} style={styles.rupee}>
          ₹
        </T>
      ) : null}
      <BigFigure size={56}>{rupee ? value.slice(1) : value}</BigFigure>
    </View>
  );
}

/** apps/vendors/app/earnings/page.tsx: what Detlio owes the garage, each booking and each payout. */
function EarningsScreen() {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  const vendor = useAuth((s) => s.vendor);
  const isVendorAdmin = useIsVendorAdmin();
  const [preset, setPreset] = useState<Preset>('last30');
  const [range, setRange] = useState<DateRange>(() => rangeForPreset('last30', { from: '', to: '' }, new Date()));
  const [statement, setStatement] = useState<EarningsStatement | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [sharing, setSharing] = useState(false);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const payoutsTop = useRef(0);
  const quiet = useRef(false);
  const seen = useRef(false);

  // The server refuses an operator, and the route gate sends one home; as the web does,
  // the screen does too rather than show money that is not theirs to see.
  useEffect(() => {
    if (!isVendorAdmin) router.replace('/home');
  }, [isVendorAdmin]);

  useEffect(() => {
    if (!vendor?.id || !isVendorAdmin) return;
    let active = true;
    // A re-read on coming back to the tab: a failure there is not about the dates.
    const silent = quiet.current;
    quiet.current = false;
    getEarningsStatement(range)
      .then((next) => {
        if (!active) return;
        setStatement(next);
        setError(false);
      })
      .catch(() => {
        if (active && !silent) setError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [range, vendor?.id, isVendorAdmin, attempt]);

  // The tab stays mounted: read again when it is opened, from Home's tile or the nav.
  useFocusEffect(
    useCallback(() => {
      if (seen.current) {
        quiet.current = true;
        setAttempt((n) => n + 1);
      }
      seen.current = true;
    }, [])
  );

  if (!isVendorAdmin) return null;

  const pick = (next: Preset) => {
    setPreset(next);
    if (next !== 'custom') {
      setLoading(true);
      setRange(rangeForPreset(next, range, new Date()));
    }
  };

  const setDate = (key: 'from' | 'to', value: string) => {
    const next = changeRangeDate(range, key, value);
    if (!next) return;
    setLoading(true);
    setRange(next);
  };

  const download = async () => {
    if (!statement || sharing) return;
    setSharing(true);
    try {
      const shared = await shareCsv(statementCsvText(statement.lines), csvFileName(statement.range));
      if (!shared) toast.error(t("This phone can't share files"));
    } catch {
      toast.error(t("Couldn't make the file. Try again."));
    } finally {
      setSharing(false);
    }
  };

  const tiles = statement ? balanceTiles(statement) : null;
  const summary = statement?.summary;
  const free = summary && summary.freeBookings.used < summary.freeBookings.of ? summary.freeBookings : null;
  const noLines = !statement || statement.lines.length === 0;
  // "Oldest from 14 Oct · Paid within 24 hours", or what happens to a balance owed to Detlio.
  const heroLine =
    statement && tiles
      ? tiles.owesDetlio
        ? tiles.due.hint
        : [
            statement.summary.oldestUnpaidAt
              ? t('Oldest from {date}', { date: istDateLabel(statement.summary.oldestUnpaidAt) })
              : null,
            t('Paid within {hours} hours', { hours: statement.cycleHours }),
          ]
            .filter(Boolean)
            .join(' · ')
      : '';

  return (
    <AppShell showBrand brandRight={<GarageStatus />} gap={12} scrollRef={scroll}>
      <HubTitle>{t('Earnings')}</HubTitle>

      {!statement && loading ? (
        <>
          <Skeleton height={190} radius={28} />
          <View style={styles.tiles}>
            <View style={styles.flex}>
              <Skeleton height={150} radius={28} />
            </View>
            <View style={styles.flex}>
              <Skeleton height={150} radius={28} />
            </View>
          </View>
        </>
      ) : !statement && error ? (
        <LoadError what={t('your earnings')} onRetry={() => {
          setLoading(true);
          setAttempt((n) => n + 1);
        }} />
      ) : statement && tiles ? (
        <View accessibilityLabel={t('Your balance')} style={styles.balance}>
          <HubCard style={styles.hero}>
            <Dim>{tiles.due.label}</Dim>
            <Money value={tiles.due.value} />
            <T size={13} lh={18} color={colors.textSecondary} style={styles.heroLine}>
              {heroLine}
            </T>
            <HubPill
              disabled={noLines || sharing}
              onPress={() => void download()}
              accessibilityLabel={t('Download as CSV')}
              style={styles.csv}
            >
              <IconDownload size={16} stroke={1.6} color={noLines ? colors.textMuted : colors.textPrimary} />
              <T size={15} lh={20} color={noLines ? colors.textMuted : colors.textPrimary}>
                {t('Download CSV')}
              </T>
            </HubPill>
          </HubCard>

          <TileRow>
            <HubTile
              label={tiles.paid.label}
              icon={IconWallet}
              value={tiles.paid.value}
              line={statement.payouts.length > 0 ? `${t('Payouts')} ›` : undefined}
              onPress={statement.payouts.length > 0 ? () => scroll.current?.scrollTo({ y: payoutsTop.current, animated: true }) : undefined}
            />
            {free ? (
              <HubTile
                label={t('Free bookings')}
                icon={IconSparkles}
                value={`${free.used} / ${free.of}`}
                line={t('No commission on these')}
              />
            ) : null}
          </TileRow>
          <Dim size={11} style={styles.footnote}>
            {balanceFootnote(statement)}
          </Dim>
        </View>
      ) : null}

      <View style={styles.section}>
        <GraphiteSwitch
          accessibilityLabel={t('Period')}
          value={preset}
          onChange={pick}
          options={PRESETS.map((option) => ({ ...option, label: t(option.label) }))}
        />
        {preset === 'custom' ? (
          <View style={styles.dates}>
            <View style={styles.flex}>
              <DateField label={t('From')} value={range.from} max={range.to} onChange={(v) => setDate('from', v)} />
            </View>
            <View style={styles.flex}>
              <DateField label={t('To')} value={range.to} min={range.from} onChange={(v) => setDate('to', v)} />
            </View>
          </View>
        ) : null}

        {statement && error ? (
          <T accessibilityRole="alert" size={12} color={colors.error}>
            {datesFailedLine(statement.range)}
          </T>
        ) : null}
        <SectionHeader title={t('Bookings')} />
        {!statement && loading ? (
          <SkeletonList count={3} height={72} />
        ) : statement && statement.lines.length === 0 ? (
          <EmptyState
            icon={<IconReceipt size={28} stroke={1.5} color={colors.textSecondary} />}
            title={t('Nothing in these dates')}
            subtitle={t("Each job you complete shows up here with Detlio's commission, your share and its payout.")}
          />
        ) : statement ? (
          <View accessibilityState={{ busy: loading }} style={loading && styles.dimmed}>
            <HubList>
              {statement.lines.map((line, i) => (
                <LineRow key={line.bookingId} line={line} first={i === 0} />
              ))}
            </HubList>
          </View>
        ) : null}
      </View>

      {statement && statement.payouts.length > 0 ? (
        <View
          style={styles.section}
          onLayout={(event) => {
            payoutsTop.current = event.nativeEvent.layout.y;
          }}
        >
          <SectionHeader title={t('Payouts')} />
          <HubList>
            {statement.payouts.map((payout, i) => (
              <View key={payout.id} style={[styles.payout, i > 0 && styles.rowLine]}>
                <View style={styles.flex}>
                  <T size={15} lh={20}>
                    {`${t(PAYOUT_METHOD_LABEL[payout.method])} · `}
                    <T num size={15} lh={20}>
                      {istDateLabel(payout.paidAt)}
                    </T>
                  </T>
                  <T size={12} color={colors.dim} numberOfLines={1}>
                    {fill(t('Ref {ref}'), {
                      ref: (
                        <T num size={12} color={colors.dim}>
                          {payout.reference}
                        </T>
                      ),
                    })}
                  </T>
                </View>
                <T num size={17} weight={300} color={colors.success}>
                  {rupeesLabel(payout.amount)}
                </T>
              </View>
            ))}
          </HubList>
        </View>
      ) : null}
    </AppShell>
  );
}

export default garageScreen(EarningsScreen);

const useStyles = createStyles((colors) => ({
  flex: { flex: 1, minWidth: 0 },
  tiles: { flexDirection: 'row', gap: 12 },
  balance: { gap: 12 },
  hero: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 20 },
  money: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 4 },
  rupee: { marginRight: 2, marginTop: 2 },
  heroLine: { marginTop: 8 },
  csv: { marginTop: 16 },
  footnote: { paddingHorizontal: 4 },
  section: { gap: 12, marginTop: 4 },
  dates: { flexDirection: 'row', gap: 8 },
  dimmed: { opacity: 0.6 },
  rowLine: { borderTopWidth: 1, borderTopColor: colors.line },
  lineRow: { paddingHorizontal: 18, paddingVertical: 12 },
  lineHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  lineChevron: { alignSelf: 'center' },
  kind: { marginTop: 4, alignSelf: 'flex-start' },
  lineAmount: { alignItems: 'flex-end', gap: 4, flexShrink: 0 },
  breakdown: { gap: 8, marginTop: 10 },
  figures: { gap: 4, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 8 },
  figure: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  figureLabel: { flexShrink: 1 },
  figureValue: { flexShrink: 1 },
  payout: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 18, paddingVertical: 12 },
}));
