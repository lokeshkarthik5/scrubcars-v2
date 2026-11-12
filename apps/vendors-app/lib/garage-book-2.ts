import type { BookExpense, ImportRow, StockItem, SupplySuggestions } from '@repo/core/api/garage-book';
import {
  expenseCategoryWord,
  GARAGE_BOOK_2_LIMITS,
  rupees,
  shortDate,
  spacedPhone,
  stockAmountText,
  type StockUnit,
} from '@repo/core/garage-book';
import { t, tn } from '@repo/core/i18n/translate';
import qrcode from 'qrcode-generator';

/**
 * The phone's rules for Garage Book Stages 2 and 3 (0073): what the Team, Expenses, Stock,
 * Order and Import screens say and work out, kept out of the screens so they can be tested.
 * Pure. The rules both apps share (bill numbers, pay lines, stock shares) live in core's
 * garage-book.ts; these are the phone's own.
 */

// ─── Money typed by the owner ────────────────────────────────────────────────

/** "1,200" or "1200.50" (rupees, as typed) to paise; null when it isn't a sum the book takes. */
export function rupeesToPaise(text: string, maxRupees: number = GARAGE_BOOK_2_LIMITS.expenseMaxRupees): number | null {
  const clean = text.replace(/[,\s₹]/g, '');
  if (!/^\d+(\.\d{0,2})?$/.test(clean)) return null;
  const paise = Math.round(Number(clean) * 100);
  if (!Number.isFinite(paise) || paise < 100 || paise > maxRupees * 100) return null;
  return paise;
}

/** Only what a rupee figure can hold: digits and one point with two places. */
export function moneyTyping(text: string): string {
  const [whole = '', ...rest] = text.replace(/[^\d.]/g, '').split('.');
  return rest.length ? `${whole.slice(0, 9)}.${rest.join('').slice(0, 2)}` : whole.slice(0, 9);
}

// ─── Expenses ────────────────────────────────────────────────────────────────

/** "Advance · Arun", "Foam shampoo 5 L × 2", "Shop rent": an expense's first line. */
export function expenseTitle(expense: Pick<BookExpense, 'category' | 'note' | 'member'>): string {
  const word = expenseCategoryWord(expense.category);
  if ((expense.category === 'advance' || expense.category === 'salary') && expense.member) {
    return expense.note ? `${expense.note} · ${expense.member.name}` : `${word} · ${expense.member.name}`;
  }
  return expense.note?.trim() || word;
}

function methodWord(method: NonNullable<BookExpense['method']>): string {
  return method === 'upi' ? 'UPI' : method === 'bank' ? t('Bank') : t('Cash');
}

/** "Cash · in Team too", "Sri Balaji Supplies · UPI · from an order": an expense's quiet line. */
export function expenseSub(expense: Pick<BookExpense, 'category' | 'method' | 'member' | 'fromOrder'>): string {
  const method = expense.method ? methodWord(expense.method) : null;
  if (expense.fromOrder) return [expense.fromOrder.supplier, method, t('from an order')].filter(Boolean).join(' · ');
  const team = expense.member && (expense.category === 'advance' || expense.category === 'salary') ? t('in Team too') : null;
  return [method, team].filter(Boolean).join(' · ');
}

/** The Expenses bar: how much of what came in was spent (red) and kept (silver), in whole percents. */
export function spentShare(takenPaise: number, spentPaise: number): { kept: number; spent: number } {
  const whole = Math.max(takenPaise, spentPaise, 0);
  if (whole <= 0) return { kept: 0, spent: 0 };
  const spent = Math.round((Math.max(0, spentPaise) / whole) * 100);
  return { kept: 100 - spent, spent };
}

/** The category chips under the total: only the ones with money, biggest first. */
export function categoryChips<C extends string>(totals: Record<C, number>): Array<{ category: C; paise: number }> {
  return (Object.entries(totals) as Array<[C, number]>)
    .filter(([, paise]) => paise > 0)
    .map(([category, paise]) => ({ category, paise }))
    .sort((a, b) => b.paise - a.paise);
}

// ─── Team ────────────────────────────────────────────────────────────────────

/** "Who did it?": one tap puts a person on the job, a second takes them off. */
export function toggleWorker(ids: readonly string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
}

/** "On now · Creta · Interior clean". */
export function onNowLine(onNow: { plate: string | null; car: string | null; service: string | null }): string {
  return [t('On now'), onNow.car ?? onNow.plate, onNow.service].filter(Boolean).join(' · ');
}

// ─── Stock ───────────────────────────────────────────────────────────────────

/** "5 L can" style: the pack an item comes in, or nothing. */
export function packLine(item: Pick<StockItem, 'packSize' | 'unit'>): string {
  return item.packSize ? stockAmountText(item.packSize, item.unit) : '';
}

/** "About 6 jobs" (left), or the level itself when no service uses it yet. */
export function stockLeftLine(item: Pick<StockItem, 'jobsLeft' | 'level' | 'unit'>): string {
  if (item.jobsLeft === null) return t('{amount} left', { amount: stockAmountText(item.level, item.unit) });
  return tn(item.jobsLeft, 'About {count} job', 'About {count} jobs');
}

/** "0.6 L · used 7.2 L on 48 jobs this month". */
export function stockUseLine(item: Pick<StockItem, 'level' | 'unit' | 'usedThisMonth' | 'jobsThisMonth'>): string {
  const level = stockAmountText(item.level, item.unit);
  if (item.jobsThisMonth <= 0) return level;
  return `${level} · ${tn(item.jobsThisMonth, 'used {amount} on {count} job this month', 'used {amount} on {count} jobs this month', {
    amount: stockAmountText(item.usedThisMonth, item.unit),
  })}`;
}

/** "ml", "L", "pcs": a unit as the screens print it. */
export function unitWord(unit: StockUnit): string {
  return unit === 'l' ? 'L' : unit;
}

/** What one tap on − or + moves a per-job amount by. */
export function usageStep(unit: StockUnit): number {
  return unit === 'ml' || unit === 'g' ? 10 : unit === 'pcs' ? 1 : 0.1;
}

/** One − or + on a per-job amount: never below 0, never above the book's limit, no float dust. */
export function stepAmount(amount: number, unit: StockUnit, dir: 1 | -1): number {
  const next = Math.round((amount + dir * usageStep(unit)) * 100) / 100;
  return Math.max(0, Math.min(GARAGE_BOOK_2_LIMITS.stockAmountMax, next));
}

/** A count typed in ("4.1", "600") as a level; null when it isn't one. */
export function countTyping(text: string): number | null {
  const clean = text.replace(/[,\s]/g, '');
  if (!/^\d+(\.\d{0,2})?$/.test(clean)) return null;
  const value = Number(clean);
  return value >= 0 && value <= GARAGE_BOOK_2_LIMITS.stockAmountMax ? value : null;
}

// ─── Order supplies ──────────────────────────────────────────────────────────

export interface OrderLine {
  itemId: string;
  name: string;
  unit: StockUnit;
  packSize: number | null;
  packPricePaise: number | null;
  packs: number;
}

/** The suggestion for one supplier, as lines the owner can change. */
export function orderLines(group: SupplySuggestions['groups'][number]): OrderLine[] {
  return group.lines.map((line) => ({
    itemId: line.itemId,
    name: line.name,
    unit: line.unit,
    packSize: line.packSize,
    packPricePaise: line.packPricePaise,
    packs: Math.max(1, line.packs),
  }));
}

/** "Foam shampoo 5 L": an order line's name with its pack. */
export function orderLineName(line: Pick<OrderLine, 'name' | 'packSize' | 'unit'>): string {
  return line.packSize ? `${line.name} ${stockAmountText(line.packSize, line.unit)}` : line.name;
}

/** − and + on an order line: 0 takes it out of the order; at most 99 packs. */
export function changePacks(lines: OrderLine[], itemId: string, dir: 1 | -1): OrderLine[] {
  return lines.map((line) => (line.itemId === itemId ? { ...line, packs: Math.max(0, Math.min(99, line.packs + dir)) } : line));
}

export function orderTotal(lines: readonly OrderLine[]): number {
  return lines.reduce((sum, line) => sum + line.packs * (line.packPricePaise ?? 0), 0);
}

/** What goes to the server: lines with packs, and the price only when one is known. */
export function orderPayload(supplierId: string, lines: readonly OrderLine[]) {
  return {
    supplierId,
    lines: lines
      .filter((line) => line.packs > 0)
      .map((line) => ({ itemId: line.itemId, packs: line.packs, ...(line.packPricePaise !== null ? { packPricePaise: line.packPricePaise } : {}) })),
  };
}

/** "Your supplier · WhatsApp · last order 8 Nov". */
export function supplierLine(supplier: { phone: string | null; lastOrderAt: string | null }): string {
  return [
    t('Your supplier'),
    supplier.phone ? 'WhatsApp' : t('No mobile'),
    supplier.lastOrderAt ? t('last order {date}', { date: shortDate(supplier.lastOrderAt) }) : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

// ─── Bring in your book ──────────────────────────────────────────────────────

/** Why a row read from the book needs a look, or null when it reads clearly. */
export function importFlag(row: Pick<ImportRow, 'unsure' | 'match' | 'phone' | 'plate' | 'name'>): string | null {
  if (row.match) return row.match.by === 'phone' ? t('Same phone as a customer you have') : t('Same number plate as a customer you have');
  const unsure = row.unsure[0];
  if (unsure === 'phone') return t('Phone not clear: {phone}', { phone: row.phone ?? '?' });
  if (unsure === 'plate') return t('Number plate not clear: {plate}', { plate: row.plate ?? '?' });
  if (unsure === 'name') return t('Name not clear');
  if (unsure) return t('Not clear: {what}', { what: unsure });
  if (!row.name && !row.phone && !row.plate) return t('Nothing to add');
  return null;
}

/** "98400 12345 · TN 09 AB 4521 · Creta · owes ₹6,400". */
export function importLine(row: Pick<ImportRow, 'phone' | 'plate' | 'car' | 'owesPaise'>): string {
  return [
    row.phone ? spacedPhone(row.phone) : null,
    row.plate,
    row.car,
    row.owesPaise ? t('owes {amount}', { amount: rupees(row.owesPaise) ?? '' }) : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** The rows "Add to my book" sends: the ones kept, without the screen's own fields. */
export function importPayload(rows: readonly ImportRow[], dropped: ReadonlySet<number>) {
  return rows
    .map((row, index) => ({ row, index }))
    .filter(({ row, index }) => !dropped.has(index) && Boolean(row.name || row.phone || row.plate))
    .map(({ row }) => ({ name: row.name, phone: row.phone, plate: row.plate, car: row.car, lastVisit: row.lastVisit, owesPaise: row.owesPaise }));
}

/** What a picked file is to the import: a photo, a PDF of the book, or a sheet. */
export function importKind(name: string, mimeType: string | null | undefined): 'photo' | 'pdf' | 'sheet' | null {
  const lower = name.toLowerCase();
  if (mimeType?.startsWith('image/') || /\.(jpe?g|png|webp|heic)$/.test(lower)) return 'photo';
  if (mimeType === 'application/pdf' || lower.endsWith('.pdf')) return 'pdf';
  if (/\.(xlsx|xls|csv)$/.test(lower)) return 'sheet';
  return null;
}

// ─── The booking link's QR ───────────────────────────────────────────────────

/** The dark squares of a QR for `text`, row by row (qrcode-generator, as the web draws it). */
export function qrMatrix(text: string): boolean[][] {
  const code = qrcode(0, 'M');
  code.addData(text);
  code.make();
  const size = code.getModuleCount();
  return Array.from({ length: size }, (_, row) => Array.from({ length: size }, (_, col) => code.isDark(row, col)));
}

/** One SVG path drawing every dark square: far lighter to render than a rect per square. */
export function qrPath(matrix: boolean[][]): string {
  let d = '';
  matrix.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      if (!row[x]) {
        x += 1;
        continue;
      }
      const start = x;
      while (x < row.length && row[x]) x += 1;
      d += `M${start} ${y}h${x - start}v1h-${x - start}z`;
    }
  });
  return d;
}

/** "detlio.com/g/sample-car-care": the link without its https://. */
export function shortUrl(url: string): string {
  return url.replace(/^https?:\/\//, '').replace(/\/$/, '');
}

/** The WhatsApp share text for the booking link (sent to customers, so English). */
export function linkShareText(garage: string, url: string): string {
  return `Book your car wash at ${garage}: ${url}`;
}

// ─── Dates on a bill and in lists ────────────────────────────────────────────

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "12 Nov" for "2026-11-12" (a day already in Asia/Kolkata). */
export function dayMonth(dateKey: string): string {
  const [, m, d] = dateKey.split('-').map(Number);
  return m && d ? `${d} ${MONTHS[m - 1]}` : dateKey;
}

/** "Nov" for "2026-11". */
export function monthShort(month: string): string {
  return MONTHS[Number(month.slice(5, 7)) - 1] ?? month;
}

/** "12 Nov 2026" for "2026-11-12": the date a bill prints. */
export function billDate(dateKey: string): string {
  const year = dateKey.slice(0, 4);
  return /^\d{4}$/.test(year) ? `${dayMonth(dateKey)} ${year}` : dateKey;
}

// ─── The booking link's poster ───────────────────────────────────────────────

const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);

/**
 * The poster for the counter: the garage's name, the QR and the link, as one printable A4
 * page (the phone has no PDF printer of its own, so it is shared as a page to print or
 * save). For customers, so English.
 */
export function posterHtml(garage: string, url: string): string {
  const matrix = qrMatrix(url);
  const n = matrix.length;
  const name = escapeHtml(garage);
  const link = escapeHtml(shortUrl(url));
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${name}: book online</title>
<style>@page{size:A4;margin:0}body{margin:0;font-family:-apple-system,Inter,Roboto,sans-serif;color:#16161a;background:#fff}
.p{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:24px;padding:48px;box-sizing:border-box;text-align:center}
h1{margin:0;font-size:40px;letter-spacing:-.02em}.s{font-size:22px;color:#5b5b66;margin:0}.q{width:60vmin;max-width:340px;padding:16px;border:2px solid #16161a;border-radius:24px}
.l{font-size:20px;font-weight:600}.m{font-size:13px;color:#8a8a94}</style></head>
<body><div class="p"><h1>${name}</h1><p class="s">Scan to book your car wash</p>
<div class="q"><svg viewBox="0 0 ${n} ${n}" width="100%" role="img" aria-label="QR code for ${link}"><path d="${qrPath(matrix)}" fill="#111114"/></svg></div>
<div class="l">${link}</div><div class="m">Pay at the garage · booked with Detlio for Garages</div></div></body></html>`;
}
