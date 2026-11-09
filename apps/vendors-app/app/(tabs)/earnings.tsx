import { type EarningsStatement, type GarageStatementLine, getEarningsStatement } from '@repo/core/api/earnings';
import { istDateLabel, LINE_STATUS_LABEL, PAYOUT_METHOD_LABEL, rupeesLabel } from '@repo/core/payouts';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { AppShell, garageScreen } from '@/components/app-shell';
import { ScButton } from '@repo/native-ui/button';
import { ScBadge, DateField } from '@/components/form-controls';
import { IconDownload, IconReceipt } from '@repo/native-ui/icons';
import {
  EmptyState,
  LoadError,
  ScCard,
  ScSegmented,
  Skeleton,
  SkeletonList,
  StatusChip,
} from '@repo/native-ui/primitives';
import { SectionHeader, TopBar } from '@/components/rows';
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

function LineCard({ line }: { line: GarageStatementLine }) {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  const kind = lineKindBadge(line);
  const balanceNote = lineBalanceNote(line);
  return (
    <ScCard style={styles.lineCard}>
      <View style={styles.lineHead}>
        <View style={styles.flex}>
          <T size={13} weight={500} numberOfLines={1}>
            {lineTitle(line)}
          </T>
          <Words segments={lineMeta(line)} size={11} />
          {kind ? (
            <View style={styles.kind}>
              <ScBadge variant="muted">{t(kind)}</ScBadge>
            </View>
          ) : null}
        </View>
        <View style={styles.lineAmount}>
          <T num size={14} weight={700}>
            {rupeesLabel(line.share)}
          </T>
          <StatusChip tone={LINE_TONE[line.status] ?? 'closed'}>{t(LINE_STATUS_LABEL[line.status])}</StatusChip>
        </View>
      </View>

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
              {payoutNote(payout).map((segment, j) => (
                <T
                  key={j}
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
    </ScCard>
  );
}

/** apps/vendors/app/earnings/page.tsx: what Detlio owes the garage, each booking and each payout. */
function EarningsScreen() {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  const vendor = useAuth((s) => s.vendor);
  const vendorCount = useAuth((s) => s.vendors.length);
  const isVendorAdmin = useIsVendorAdmin();
  const [preset, setPreset] = useState<Preset>('last30');
  const [range, setRange] = useState<DateRange>(() => rangeForPreset('last30', { from: '', to: '' }, new Date()));
  const [statement, setStatement] = useState<EarningsStatement | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [sharing, setSharing] = useState(false);
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

  return (
    <AppShell
      showBrand
      brandRight={
        vendorCount > 1 ? undefined : (
          <T size={13} weight={500} color={colors.textSecondary} numberOfLines={1}>
            {vendor?.businessName}
          </T>
        )
      }
    >
      <TopBar title={t('Earnings')} />

      {!statement && loading ? (
        <View style={styles.tiles}>
          <View style={styles.flex}>
            <Skeleton height={76} />
          </View>
          <View style={styles.flex}>
            <Skeleton height={76} />
          </View>
        </View>
      ) : !statement && error ? (
        <LoadError what={t('your earnings')} onRetry={() => {
          setLoading(true);
          setAttempt((n) => n + 1);
        }} />
      ) : statement && tiles ? (
        <View accessibilityLabel={t('Your balance')} style={styles.balance}>
          <View style={styles.tiles}>
            <View style={styles.tile}>
              <T size={11} weight={500} color={colors.textSecondary}>
                {tiles.due.label}
              </T>
              <T num size={22} weight={700} lh={28} tracking={-0.025} style={styles.tileValue}>
                {tiles.due.value}
              </T>
              <T size={11} color={colors.textSecondary} style={styles.tileHint}>
                {tiles.due.hint}
              </T>
            </View>
            <View style={styles.tile}>
              <T size={11} weight={500} color={colors.textSecondary}>
                {tiles.paid.label}
              </T>
              <T num size={22} weight={700} lh={28} tracking={-0.025} color={colors.success} style={styles.tileValue}>
                {tiles.paid.value}
              </T>
            </View>
          </View>
          <T size={11} color={colors.textSecondary}>
            {balanceFootnote(statement)}
          </T>
        </View>
      ) : null}

      <View style={styles.section}>
        <View style={styles.sectionHead}>
          <SectionHeader title={t('Bookings')} />
          <ScButton
            variant="outline"
            fullWidth={false}
            disabled={!statement || statement.lines.length === 0 || sharing}
            onPress={() => void download()}
            accessibilityLabel={t('Download as CSV')}
          >
            <IconDownload size={15} color={!statement || statement.lines.length === 0 ? colors.textMuted : colors.textPrimary} />
            <T size={15} weight={600} lh={20} color={!statement || statement.lines.length === 0 ? colors.textMuted : colors.textPrimary}>
              CSV
            </T>
          </ScButton>
        </View>
        <ScSegmented
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
        {!statement && loading ? (
          <SkeletonList count={3} height={140} />
        ) : statement && statement.lines.length === 0 ? (
          <EmptyState
            icon={<IconReceipt size={28} stroke={1.5} color={colors.textSecondary} />}
            title={t('Nothing in these dates')}
            subtitle={t("Each job you complete shows up here with Detlio's commission, your share and its payout.")}
          />
        ) : statement ? (
          <View
            accessibilityState={{ busy: loading }}
            style={[styles.lines, loading && styles.dimmed]}
          >
            {statement.lines.map((line) => (
              <LineCard key={line.bookingId} line={line} />
            ))}
          </View>
        ) : null}
      </View>

      {statement && statement.payouts.length > 0 ? (
        <View style={styles.section}>
          <SectionHeader title={t('Payouts')} />
          <View style={styles.lines}>
            {statement.payouts.map((payout) => (
              <ScCard key={payout.id} style={styles.payout}>
                <View style={styles.flex}>
                  <T size={13} weight={500}>
                    {`${t(PAYOUT_METHOD_LABEL[payout.method])} · `}
                    <T num size={13} weight={500}>
                      {istDateLabel(payout.paidAt)}
                    </T>
                  </T>
                  <T size={11} color={colors.textSecondary} numberOfLines={1}>
                    {fill(t('Ref {ref}'), {
                      ref: (
                        <T num size={11}>
                          {payout.reference}
                        </T>
                      ),
                    })}
                  </T>
                </View>
                <T num size={14} weight={700} color={colors.success}>
                  {rupeesLabel(payout.amount)}
                </T>
              </ScCard>
            ))}
          </View>
        </View>
      ) : null}
    </AppShell>
  );
}

export default garageScreen(EarningsScreen);

const useStyles = createStyles((colors) => ({
  flex: { flex: 1, minWidth: 0 },
  tiles: { flexDirection: 'row', gap: 8 },
  balance: { gap: 8 },
  tile: {
    flex: 1,
    minWidth: 0,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  tileValue: { marginTop: 2 },
  tileHint: { marginTop: 2 },
  section: { gap: 12 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  dates: { flexDirection: 'row', gap: 8 },
  lines: { gap: 8 },
  dimmed: { opacity: 0.6 },
  lineCard: { gap: 10 },
  lineHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  kind: { marginTop: 4, alignSelf: 'flex-start' },
  lineAmount: { alignItems: 'flex-end', gap: 4, flexShrink: 0 },
  figures: { gap: 4, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8 },
  figure: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  figureLabel: { flexShrink: 1 },
  figureValue: { flexShrink: 1 },
  payout: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
}));
