import { serviceLinesOf } from '@repo/core/add-ons';
import { finalBillFigures, finalBillStatusLabel, formatRupees } from '@repo/core/job-records';
import type { Booking, FinalBill } from '@repo/core/types';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { useIsVendorAdmin } from '@/lib/auth';
import { raiseFinalBill } from '@/lib/job-records-api';
import { createStyles, useColors } from '@repo/native-ui/theme';

import { ScButton } from '@repo/native-ui/button';
import { IconPlus, IconReceipt, IconTrash } from '@repo/native-ui/icons';
import { ScInput, ScTextarea } from '@repo/native-ui/inputs';
import { JobSheetRow } from './job-sheet-row';
import { type StatusTone, StatusChip } from '@repo/native-ui/primitives';
import { ScSheet } from '@repo/native-ui/sheet';
import { T } from '@repo/native-ui/text';
import { toast } from '@repo/native-ui/toast';
import { errorText } from '@/lib/error-text';
import { t } from '@repo/core/i18n/translate';
import { fill, useT } from '@repo/core/i18n';

const MAX_LINES = 20;
const MAX_DESCRIPTION = 80;

type Line = { description: string; amount: string };

const STATUS_TONE: Record<FinalBill['status'], StatusTone> = {
  due: 'progress',
  paid: 'done',
  not_needed: 'closed',
  cancelled: 'closed',
};

function linesFrom(bill: FinalBill | null, booking: Booking): Line[] {
  if (bill) return bill.lines.map((line) => ({ description: line.description, amount: String(line.amount) }));
  // The final bill stays separate from add-ons (0068): paid at booking, and credited nothing,
  // so they aren't lines on it.
  const booked = serviceLinesOf(booking.items)
    .slice(0, MAX_LINES)
    // An inspection with no fee (0073) starts empty, for the garage's price, never "0".
    .map((item) => ({ description: item.name.slice(0, MAX_DESCRIPTION), amount: item.amount > 0 ? String(item.amount) : '' }));
  return booked.length > 0 ? booked : [{ description: '', amount: '' }];
}

const bookedSummary = (booking: Booking) =>
  serviceLinesOf(booking.items).map((item) => `${item.name} ${formatRupees(item.amount)}`).join(' · ');

function formProblem(lines: Line[], total: number): string | null {
  if (lines.some((line) => !line.description.trim())) return t('Describe every line.');
  if (lines.some((line) => line.description.trim().length > MAX_DESCRIPTION)) {
    return t('Keep each line under {max} characters.', { max: MAX_DESCRIPTION });
  }
  if (
    lines.some((line) => {
      const n = Number(line.amount);
      return !Number.isFinite(n) || n <= 0 || Math.abs(n * 100 - Math.round(n * 100)) > 1e-6;
    })
  ) {
    return t('Give every line an amount in rupees.');
  }
  if (total < 1) return t('The bill must come to at least ₹1.');
  return null;
}

/** FinalBillPanel (apps/vendors/components/final-bill.tsx). */
export function FinalBillPanel({ booking, onChanged }: { booking: Booking; onChanged: () => void }) {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  const bill = booking.finalBill;
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState<Line[]>(() => linesFrom(bill, booking));
  const [note, setNote] = useState(bill?.note ?? '');
  const [sending, setSending] = useState(false);
  const who = booking.customerName ?? t('this customer');
  const isVendorAdmin = useIsVendorAdmin();

  if (!bill && !booking.canRaiseFinalBill) return null;

  const paidBefore = bill?.paidBefore ?? booking.paidAtBooking;
  const figures = finalBillFigures(
    lines.map((line) => line.amount),
    paidBefore
  );
  const problem = formProblem(lines, figures.total);

  const openForm = () => {
    setLines(linesFrom(bill, booking));
    setNote(bill?.note ?? '');
    setOpen(true);
  };

  const updateLine = (index: number, patch: Partial<Line>) =>
    setLines((current) => current.map((line, i) => (i === index ? { ...line, ...patch } : line)));

  const handleSend = async () => {
    if (problem || sending) return;
    setSending(true);
    try {
      await raiseFinalBill(booking.id, {
        lines: lines.map((line) => ({ description: line.description.trim(), amount: Number(line.amount) })),
        note: note.trim() || undefined,
      });
      setOpen(false);
      toast.success(
        figures.amountDue > 0
          ? t('Final bill saved. {who} can pay {amount} from their booking in the Detlio app.', {
              who,
              amount: formatRupees(figures.amountDue),
            })
          : t('Final bill saved. Nothing more to pay.')
      );
      onChanged();
    } catch (error) {
      toast.error(errorText(error, t('Could not send the bill')));
      onChanged();
    } finally {
      setSending(false);
    }
  };

  const replaceable = bill !== null && bill.status !== 'paid' && booking.canRaiseFinalBill;

  return (
    <>
      {bill ? (
        <JobSheetRow
          icon={<IconReceipt size={22} stroke={1.6} color={colors.textSecondary} />}
          title={
            <>
              {t('Final bill')}
              {isVendorAdmin ? (
                <>
                  {' · '}
                  <T num size={17} weight={600}>
                    {formatRupees(bill.total)}
                  </T>
                </>
              ) : null}
            </>
          }
          detail={
            <View style={styles.billDetail}>
              <StatusChip tone={STATUS_TONE[bill.status]}>{finalBillStatusLabel(bill.status)}</StatusChip>
              {bill.amountDue > 0 ? (
                <T size={15} color={colors.textSecondary}>
                  {bill.status === 'paid' ? t('Paid in app') : t('Customer pays')}
                  {isVendorAdmin ? (
                    <>
                      {' '}
                      <T num size={15}>
                        {formatRupees(bill.amountDue)}
                      </T>
                    </>
                  ) : null}
                </T>
              ) : null}
            </View>
          }
          accessibilityLabel={replaceable ? t('Replace final bill for {who}', { who }) : undefined}
          onOpen={replaceable ? openForm : undefined}
        />
      ) : (
        <JobSheetRow
          icon={<IconReceipt size={22} stroke={1.6} color={colors.textSecondary} />}
          title={t('Raise final bill')}
          detail={t('Not sent yet · the job is priced on inspection')}
          accessibilityLabel={t('Raise final bill for {who}', { who })}
          onOpen={openForm}
        />
      )}

      <ScSheet
        open={open}
        onClose={() => setOpen(false)}
        dismissible={!sending}
        accessibilityLabel={t('Final bill for {who}', { who })}
        horizontalPadding={16}
      >
        <T accessibilityRole="header" size={16} weight={600}>
          {t('Final bill')}
        </T>
        <T size={12} color={colors.textSecondary} style={styles.mt1}>
          {`${t('The bill is for the whole job: the services booked, plus the work and parts.')} ${
            paidBefore > 0
              ? t('{who} paid {amount} at booking and pays anything above that in the Detlio app.', {
                  who,
                  amount: formatRupees(paidBefore),
                })
              : t('{who} pays it in the Detlio app.', { who })
          }`}
        </T>
        {paidBefore > 0 && booking.items.length > 0 ? (
          <T size={12} color={colors.textSecondary} style={styles.mt1}>
            {fill(t('Paid at booking for: {services}'), {
              services: (
                <T num size={12} color={colors.textSecondary}>
                  {bookedSummary(booking)}
                </T>
              ),
            })}
          </T>
        ) : null}

        <View style={styles.lines}>
          {lines.map((line, i) => (
            <View key={i} style={styles.line}>
              <View style={styles.flex}>
                <ScInput
                  label={t('Line {n}', { n: i + 1 })}
                  placeholder={t('e.g. Rear bumper dent repair')}
                  maxLength={MAX_DESCRIPTION}
                  value={line.description}
                  onChangeText={(description) => updateLine(i, { description })}
                />
              </View>
              <View style={styles.amount}>
                <ScInput
                  label={t('Amount (₹)')}
                  accessibilityLabel={t('Line {n} amount in rupees', { n: i + 1 })}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  numeric
                  value={line.amount}
                  onChangeText={(text) => updateLine(i, { amount: text.replace(/[^\d.]/g, '') })}
                />
              </View>
              {lines.length > 1 ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('Remove line {n}', { n: i + 1 })}
                  onPress={() => setLines((current) => current.filter((_, j) => j !== i))}
                  style={styles.trash}
                >
                  <IconTrash size={16} color={colors.textMuted} />
                </Pressable>
              ) : null}
            </View>
          ))}
        </View>

        {lines.length < MAX_LINES ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => setLines((current) => [...current, { description: '', amount: '' }])}
            style={styles.addLine}
          >
            <IconPlus size={15} />
            <T size={15} weight={500}>
              {t('Add line')}
            </T>
          </Pressable>
        ) : null}

        <View style={styles.mt2}>
          <ScTextarea label={t('Note for the customer (optional)')} rows={2} maxLength={500} value={note} onChangeText={setNote} />
        </View>

        <View accessibilityLiveRegion="polite" style={styles.totals}>
          <View style={styles.totalRow}>
            <T size={13} color={colors.textSecondary}>
              {t('Total')}
            </T>
            <T num size={13} weight={500}>
              {formatRupees(figures.total)}
            </T>
          </View>
          <View style={styles.totalRow}>
            <T size={13} color={colors.textSecondary}>
              {t('Paid at booking')}
            </T>
            <T num size={13} weight={500}>
              {`−${formatRupees(paidBefore)}`}
            </T>
          </View>
          <View style={styles.totalRow}>
            <T size={15} weight={600}>
              {figures.amountDue > 0 ? t('Customer pays in the app') : t('Nothing more to pay')}
            </T>
            <T num size={15} weight={600}>
              {formatRupees(figures.amountDue)}
            </T>
          </View>
        </View>

        {problem && lines.some((line) => line.description || line.amount) ? (
          <T size={12} color={colors.error} style={styles.mt2}>
            {problem}
          </T>
        ) : null}

        <View style={styles.actions}>
          <View style={styles.half}>
            <ScButton variant="outline" size="lg" disabled={sending} onPress={() => setOpen(false)}>
              {t('Cancel')}
            </ScButton>
          </View>
          <View style={styles.half}>
            <ScButton variant="main" size="lg" disabled={Boolean(problem) || sending} onPress={() => void handleSend()}>
              {sending ? t('Sending…') : bill ? t('Send new bill') : t('Send final bill')}
            </ScButton>
          </View>
        </View>
      </ScSheet>
    </>
  );
}

const useStyles = createStyles((colors) => ({
  flex: { flex: 1, minWidth: 0 },
  half: { flex: 1, minWidth: 0 },
  billDetail: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 2 },
  mt1: { marginTop: 4 },
  mt2: { marginTop: 8 },
  lines: { marginTop: 16, gap: 12 },
  line: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  amount: { width: 112 },
  trash: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  addLine: { marginTop: 8, minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 6 },
  totals: { marginTop: 16, gap: 6, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  actions: { marginTop: 20, flexDirection: 'row', gap: 8 },
}));
