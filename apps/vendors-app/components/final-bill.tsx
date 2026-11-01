import { finalBillFigures, finalBillStatusLabel, formatRupees } from '@repo/core/job-records';
import type { Booking, FinalBill } from '@repo/core/types';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useIsVendorAdmin } from '@/lib/auth';
import { raiseFinalBill } from '@/lib/job-records-api';
import { colors } from '@/lib/theme';

import { ScButton } from './button';
import { IconPlus, IconReceipt, IconTrash } from './icons';
import { ScInput, ScTextarea } from './inputs';
import { JobSheetRow } from './job-sheet-row';
import { type StatusTone, StatusChip } from './primitives';
import { ScSheet } from './sheet';
import { T } from './text';
import { toast } from './toast';
import { errorText } from '@/lib/error-text';
import { seedLines, serviceLinesOf } from '@/lib/final-bill-lines';

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
  const booked = seedLines(booking.items, MAX_LINES, MAX_DESCRIPTION);
  return booked.length > 0 ? booked : [{ description: '', amount: '' }];
}

const bookedSummary = (booking: Booking) =>
  serviceLinesOf(booking.items).map((item) => `${item.name} ${formatRupees(item.amount)}`).join(' · ');

function formProblem(lines: Line[], total: number): string | null {
  if (lines.some((line) => !line.description.trim())) return 'Describe every line.';
  if (lines.some((line) => line.description.trim().length > MAX_DESCRIPTION)) {
    return `Keep each line under ${MAX_DESCRIPTION} characters.`;
  }
  if (
    lines.some((line) => {
      const n = Number(line.amount);
      return !Number.isFinite(n) || n <= 0 || Math.abs(n * 100 - Math.round(n * 100)) > 1e-6;
    })
  ) {
    return 'Give every line an amount in rupees.';
  }
  if (total < 1) return 'The bill must come to at least ₹1.';
  return null;
}

/** FinalBillPanel (apps/vendors/components/final-bill.tsx). */
export function FinalBillPanel({ booking, onChanged }: { booking: Booking; onChanged: () => void }) {
  const bill = booking.finalBill;
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState<Line[]>(() => linesFrom(bill, booking));
  const [note, setNote] = useState(bill?.note ?? '');
  const [sending, setSending] = useState(false);
  const who = booking.customerName ?? 'this customer';
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
          ? `Final bill saved. ${who} can pay ${formatRupees(figures.amountDue)} from their booking in the Detlio app.`
          : 'Final bill saved. Nothing more to pay.'
      );
      onChanged();
    } catch (error) {
      toast.error(errorText(error, 'Could not send the bill'));
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
              Final bill
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
                  {bill.status === 'paid' ? 'Paid in app' : 'Customer pays'}
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
          accessibilityLabel={replaceable ? `Replace final bill for ${who}` : undefined}
          onOpen={replaceable ? openForm : undefined}
        />
      ) : (
        <JobSheetRow
          icon={<IconReceipt size={22} stroke={1.6} color={colors.textSecondary} />}
          title="Raise final bill"
          detail="Not sent yet · the job is priced on inspection"
          accessibilityLabel={`Raise final bill for ${who}`}
          onOpen={openForm}
        />
      )}

      <ScSheet
        open={open}
        onClose={() => setOpen(false)}
        dismissible={!sending}
        accessibilityLabel={`Final bill for ${who}`}
        horizontalPadding={16}
      >
        <T accessibilityRole="header" size={16} weight={600}>
          Final bill
        </T>
        <T size={12} color={colors.textSecondary} style={styles.mt1}>
          {`The bill is for the whole job: the services booked, plus the work and parts. ${
            paidBefore > 0
              ? `${who} paid ${formatRupees(paidBefore)} at booking and pays anything above that in the Detlio app.`
              : `${who} pays it in the Detlio app.`
          }`}
        </T>
        {paidBefore > 0 && booking.items.length > 0 ? (
          <T size={12} color={colors.textSecondary} style={styles.mt1}>
            {'Paid at booking for: '}
            <T num size={12} color={colors.textSecondary}>
              {bookedSummary(booking)}
            </T>
          </T>
        ) : null}

        <View style={styles.lines}>
          {lines.map((line, i) => (
            <View key={i} style={styles.line}>
              <View style={styles.flex}>
                <ScInput
                  label={`Line ${i + 1}`}
                  placeholder="e.g. Rear bumper dent repair"
                  maxLength={MAX_DESCRIPTION}
                  value={line.description}
                  onChangeText={(description) => updateLine(i, { description })}
                />
              </View>
              <View style={styles.amount}>
                <ScInput
                  label="Amount (₹)"
                  accessibilityLabel={`Line ${i + 1} amount in rupees`}
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
                  accessibilityLabel={`Remove line ${i + 1}`}
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
              Add line
            </T>
          </Pressable>
        ) : null}

        <View style={styles.mt2}>
          <ScTextarea label="Note for the customer (optional)" rows={2} maxLength={500} value={note} onChangeText={setNote} />
        </View>

        <View accessibilityLiveRegion="polite" style={styles.totals}>
          <View style={styles.totalRow}>
            <T size={13} color={colors.textSecondary}>
              Total
            </T>
            <T num size={13} weight={500}>
              {formatRupees(figures.total)}
            </T>
          </View>
          <View style={styles.totalRow}>
            <T size={13} color={colors.textSecondary}>
              Paid at booking
            </T>
            <T num size={13} weight={500}>
              {`−${formatRupees(paidBefore)}`}
            </T>
          </View>
          <View style={styles.totalRow}>
            <T size={15} weight={600}>
              {figures.amountDue > 0 ? 'Customer pays in the app' : 'Nothing more to pay'}
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
              Cancel
            </ScButton>
          </View>
          <View style={styles.half}>
            <ScButton variant="main" size="lg" disabled={Boolean(problem) || sending} onPress={() => void handleSend()}>
              {sending ? 'Sending…' : bill ? 'Send new bill' : 'Send final bill'}
            </ScButton>
          </View>
        </View>
      </ScSheet>
    </>
  );
}

const styles = StyleSheet.create({
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
});
