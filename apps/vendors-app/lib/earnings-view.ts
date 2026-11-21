import type { GarageStatementLine, EarningsStatement } from '@repo/core/api/earnings';
import type { PayoutLine } from '@repo/core/api/admin';
import { toCsv } from '@repo/core/csv';
import {
  commissionLabel,
  earningsRange,
  istDateLabel,
  lineKindLabel,
  rupeesLabel,
  statementCsvRows,
  type EarningsRangePreset,
} from '@repo/core/payouts';
import { msg, t } from '@repo/core/i18n/translate';
import { earningsFeeLabel } from '@repo/core/pickup-fee-garage';

/**
 * The words and rules of the Earnings screen, from apps/vendors/app/earnings/page.tsx.
 * Pure, so they can be tested; the screen only lays them out. The period names stay English
 * (msg) for the screen's t(); the lines built here come out in the language in use.
 */
export type Preset = EarningsRangePreset | 'custom';
export interface DateRange {
  from: string;
  to: string;
}

export const PRESETS: Array<{ value: Preset; label: string }> = [
  { value: 'last30', label: msg('30 days') },
  { value: 'thisMonth', label: msg('This month') },
  { value: 'lastMonth', label: msg('Last month') },
  { value: 'custom', label: msg('Dates') },
];

/** The range a quick period stands for; "Dates" keeps the one on screen. */
export function rangeForPreset(preset: Preset, current: DateRange, now: Date): DateRange {
  return preset === 'custom' ? current : earningsRange(preset, now);
}

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * One end of the custom range changed: the new range, or null when it is not a date or
 * would put From after To (the web ignores it), or changes nothing.
 */
export function changeRangeDate(range: DateRange, key: 'from' | 'to', value: string): DateRange | null {
  if (!DATE_KEY.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) return null;
  if (range[key] === value) return null;
  const next = { ...range, [key]: value };
  if (next.from > next.to) return null;
  return next;
}

/** "Couldn't load those dates. Showing 1 Oct 2026 to 30 Oct 2026." */
export function datesFailedLine(shown: DateRange): string {
  return t("Couldn't load those dates. Showing {from} to {to}.", {
    from: istDateLabel(`${shown.from}T12:00:00+05:30`),
    to: istDateLabel(`${shown.to}T12:00:00+05:30`),
  });
}

/** The two balance tiles' words. */
export function balanceTiles(statement: Pick<EarningsStatement, 'summary' | 'cycleHours'>) {
  const { summary, cycleHours } = statement;
  const owesDetlio = summary.balanceDue < 0;
  return {
    owesDetlio,
    due: {
      label: owesDetlio ? t('You owe Detlio') : t('Due now'),
      value: rupeesLabel(Math.abs(summary.balanceDue)),
      hint: owesDetlio
        ? t('Comes off your next payout')
        : summary.oldestUnpaidAt
          ? t('Oldest from {date}', { date: istDateLabel(summary.oldestUnpaidAt) })
          : t('Paid within {hours} hours', { hours: cycleHours }),
    },
    paid: { label: t('Paid this month'), value: rupeesLabel(summary.paidThisMonth) },
  };
}

/** The footnote under the tiles: the payout cycle, the commission and the free bookings. */
export function balanceFootnote(statement: Pick<EarningsStatement, 'summary' | 'cycleHours'>): string {
  const { cycleHours, summary } = statement;
  const free =
    summary.freeBookings.used < summary.freeBookings.of
      ? ` ${t('Your first {count} bookings are free: {used} used so far.', {
          count: summary.freeBookings.of,
          used: summary.freeBookings.used,
        })}`
      : '';
  return (
    `${t('Detlio pays your share within {hours} hours of each job, by bank transfer or UPI.', { hours: cycleHours })} ` +
    t('Commission is 8% on washes, packages and others, 5% on detailing, coating and scratch removal.') +
    free
  );
}

/** A run of words, with the figures in the numeric face as the web sets them. */
export interface Segment {
  text: string;
  /** The brand's figure face. */
  num?: boolean;
  /** Primary text colour rather than secondary. */
  strong?: boolean;
}

/**
 * A translated sentence as segments: its `{name}`s become the given figures, the words
 * between them plain, so Tamil can put each figure where Tamil puts it.
 */
function segmentsOf(text: string, parts: Readonly<Record<string, Segment>>): Segment[] {
  return text
    .split(/\{(\w+)\}/)
    .map((piece, index) => (index % 2 === 1 ? (parts[piece] ?? { text: `{${piece}}` }) : { text: piece }))
    .filter((segment) => segment.text !== '');
}

export interface FigureRow {
  key: string;
  label: string;
  value: string;
  /** The label and the value in primary text, the value in semibold. */
  strong?: boolean;
  /** The commission read "Free — booking 3 of your first 25", in green and not in figures. */
  free?: boolean;
}

/** A booking's breakdown, in the web's order, leaving out what is nothing. */
export function lineFigureRows(line: GarageStatementLine): FigureRow[] {
  const rows: FigureRow[] = [{ key: 'price', label: t('Price'), value: rupeesLabel(line.price) }];
  if ((line.travelFee ?? 0) > 0) {
    // An accepted request's travel fee: part of the price, the garage's whole, no commission.
    // On a pickup booking it is the pickup fee (0079): "Pickup & drop · 6.2 km".
    rows.push({
      key: 'travel',
      label: earningsFeeLabel(line),
      value: rupeesLabel(line.travelFee ?? 0),
    });
  }
  if (line.detlioPromo > 0) {
    // Detlio pays for its own promos: shown so the garage sees why the customer paid less.
    rows.push({ key: 'detlio-promo', label: t('Detlio promo (paid by Detlio)'), value: rupeesLabel(line.detlioPromo) });
  }
  if (line.garagePromo > 0) {
    rows.push({ key: 'garage-promo', label: t('Your promo'), value: `−${rupeesLabel(line.garagePromo)}` });
  }
  if (line.refunds > 0) {
    rows.push({ key: 'refunds', label: t('Refunded'), value: `−${rupeesLabel(line.refunds)}` });
  }
  const free = line.commission.freePosition !== null;
  rows.push({
    key: 'commission',
    label: t('Detlio commission'),
    value: free ? commissionLabel(line) : `−${commissionLabel(line)}`,
    free,
  });
  rows.push({ key: 'share', label: t('Your share'), value: rupeesLabel(line.share), strong: true });
  if (line.heldByGarage > 0) {
    rows.push({ key: 'cash', label: t('Cash you collected'), value: `−${rupeesLabel(line.heldByGarage)}` });
  }
  return rows;
}

/** "Customer no-show", "Refunded after payout", or none. */
export const lineKindBadge = (line: Pick<PayoutLine, 'kind'>) => lineKindLabel(line.kind);

/** The card's heading: "Foam wash + Interior clean", or "Booking". */
export const lineTitle = (line: Pick<PayoutLine, 'services'>) => line.services.join(' + ') || t('Booking');

/** "Priya · 17 Oct 2026 · #AB12". */
export function lineMeta(line: Pick<PayoutLine, 'customerFirstName' | 'payableFrom' | 'reference'>): Segment[] {
  return [
    { text: `${line.customerFirstName} · ` },
    { text: istDateLabel(line.payableFrom), num: true },
    { text: ' · ' },
    { text: `#${line.reference}`, num: true },
  ];
}

/** One payout against a booking: "Paid ₹300 on 17 Oct 2026, ref UTR1" or "Taken back …". */
export function payoutNote(payout: PayoutLine['payouts'][number]): Segment[] {
  const parts = {
    amount: { text: rupeesLabel(Math.abs(payout.amount)) },
    date: { text: istDateLabel(payout.paidAt), num: true },
    ref: { text: payout.reference, num: true, strong: true },
  };
  return segmentsOf(
    payout.amount < 0 ? t('Taken back {amount} on {date}, ref {ref}') : t('Paid {amount} on {date}, ref {ref}'),
    parts
  );
}

/** "₹100 more to come" on a part-paid line, "₹40 comes off your next payout" on an owed-back one. */
export function lineBalanceNote(line: Pick<PayoutLine, 'status' | 'paid' | 'balance'>): Segment[] | null {
  if (line.status === 'due' && line.paid !== 0) {
    return segmentsOf(t('{amount} more to come'), { amount: { text: rupeesLabel(line.balance), num: true, strong: true } });
  }
  if (line.status === 'owed_back') {
    return segmentsOf(t('{amount} comes off your next payout'), {
      amount: { text: rupeesLabel(-line.balance), num: true, strong: true },
    });
  }
  return null;
}

/**
 * A line's state, one colour per meaning: green once paid, blue while due to the garage
 * (money owed to it is never amber), amber only for money the garage owes back.
 */
export const LINE_TONE: Partial<Record<PayoutLine['status'], 'done' | 'progress' | 'attention'>> = {
  paid: 'done',
  due: 'progress',
  owed_back: 'attention',
};

/** The file the CSV button saves, and its text: a byte-order mark so Excel reads UTF-8. */
export const csvFileName = (range: DateRange) => `detlio-earnings-${range.from}-to-${range.to}.csv`;

export function statementCsvText(lines: PayoutLine[]): string {
  const { header, rows } = statementCsvRows(lines);
  return `﻿${toCsv(header, rows)}`;
}
