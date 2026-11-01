import { getBookingReceipt } from '@repo/core/api/bookings';
import { ApiError } from '@repo/core/api/client';
import { BOOKING_TYPE_LABELS } from '@repo/core/booking-types';
import { formatReceiptAmount, RECEIPT_NOT_TAX_INVOICE, receiptFileTitle } from '@repo/core/receipts';
import type { BookingReceipt } from '@repo/core/types';
import { Label, ScButton } from '@repo/native-ui/button';
import { IconDownload, IconShare } from '@repo/native-ui/icons';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { toast } from '@repo/native-ui/toast';
import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import { type Href, router, useLocalSearchParams } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { type ReactNode, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PageHeader } from '@/components/page-header';
import { receiptHtml } from '@/lib/receipt-html';

// The paper is the same in both themes: it's a document.
const INK = '#0A0A0B';
const GREY = '#525252';
const RULE = '#E5E5E5';
const RED = '#E11D2E';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; receipt: BookingReceipt }
  | { kind: 'unavailable'; message: string }
  | { kind: 'pending'; message: string }
  | { kind: 'error' };

function Row({ label, value, strong = false, numeric = true }: { label: string; value: string; strong?: boolean; numeric?: boolean }) {
  return (
    <View style={paper.row}>
      <T size={strong ? 15 : 13} weight={strong ? 700 : 400} lh={20} color={INK} style={paper.rowLabel}>
        {label}
      </T>
      <T num={numeric} size={strong ? 15 : 13} weight={strong ? 700 : 400} lh={20} color={INK} align="right">
        {value}
      </T>
    </View>
  );
}

const Detail = ({ children }: { children: string }) => (
  <T size={12} lh={16} color={GREY}>
    {children}
  </T>
);

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={paper.section}>
      <T size={11} weight={600} lh={15} uppercase tracking={0.04} color={GREY} style={paper.sectionTitle}>
        {title}
      </T>
      {children}
    </View>
  );
}

function ReceiptDocument({ receipt }: { receipt: BookingReceipt }) {
  const { issuer, booking, bookingPayment, finalBill } = receipt;
  return (
    <View accessibilityLabel={`Payment receipt ${receipt.receiptNumber}`} style={paper.doc}>
      <View style={paper.head}>
        <T size={26} weight={700} lh={28} tracking={-0.02} color={INK}>
          {issuer.name}
          <T size={26} weight={700} lh={28} color={RED}>
            .
          </T>
        </T>
        {issuer.tradeName ? (
          <T size={12} lh={16} color={INK} style={paper.mt8}>
            {`Operated by ${issuer.tradeName}`}
          </T>
        ) : null}
        {issuer.address ? <Detail>{issuer.address}</Detail> : null}
        <Detail>{issuer.website}</Detail>
        <T size={15} weight={600} lh={20} color={INK} style={paper.mt16}>
          Payment receipt
        </T>
        <T num size={13} weight={500} lh={18} color={INK}>
          {receipt.receiptNumber}
        </T>
        <Detail>{`Issued ${receipt.issuedOn}`}</Detail>
      </View>
      <View style={paper.section}>
        <T size={11} weight={600} lh={15} uppercase tracking={0.04} color={GREY}>
          Customer
        </T>
        <T size={13} weight={500} lh={18} color={INK}>
          {receipt.customer.name}
        </T>
        <T num size={13} lh={18} color={INK}>
          {receipt.customer.phone}
        </T>
        <T size={11} weight={600} lh={15} uppercase tracking={0.04} color={GREY} style={paper.mt16}>
          Garage
        </T>
        <T size={13} weight={500} lh={18} color={INK}>
          {receipt.garage.name}
        </T>
        <T size={13} lh={18} color={GREY}>
          {receipt.garage.address}
        </T>
      </View>
      <Section title="Booking">
        <Row label="Booking" value={`#${booking.reference}`} />
        {booking.originalReference ? <Row label="First booked as" value={`#${booking.originalReference}`} /> : null}
        <Row label="Service date" value={booking.scheduledAtLabel} />
        <Row label="Type" value={BOOKING_TYPE_LABELS[booking.bookingType]} numeric={false} />
        <Row label="Status" value={booking.statusLabel} numeric={false} />
      </Section>
      <Section title="Services">
        {receipt.items.map((item, index) => (
          <Row key={`${item.name}-${index}`} label={item.name} value={formatReceiptAmount(item.amount)} />
        ))}
        {receipt.travelFee ? <Row label="Travel fee" value={formatReceiptAmount(receipt.travelFee)} /> : null}
        {receipt.discount ? (
          <>
            <View style={paper.dash} />
            <Row label="Subtotal" value={formatReceiptAmount(receipt.subtotal)} />
            <Row label={`${receipt.discount.label ?? 'Discount'}${receipt.discount.code ? ` (${receipt.discount.code})` : ''}`} value={formatReceiptAmount(receipt.discount.amount, true)} />
          </>
        ) : null}
        <View style={paper.dash} />
        <Row label="Paid at booking" value={formatReceiptAmount(bookingPayment.amount)} strong />
        <Detail>{bookingPayment.method}</Detail>
        {bookingPayment.credit ? <Detail>{`Detlio credit ${formatReceiptAmount(bookingPayment.credit.amount)}`}</Detail> : null}
        {bookingPayment.credit && Number(bookingPayment.credit.razorpayAmount) > 0 ? <Detail>{`Online (Razorpay) ${formatReceiptAmount(bookingPayment.credit.razorpayAmount)}`}</Detail> : null}
        {bookingPayment.paymentId ? <Detail>{`Payment ID ${bookingPayment.paymentId}`}</Detail> : null}
        {bookingPayment.paidAtLabel ? <Detail>{`Paid ${bookingPayment.paidAtLabel}`}</Detail> : null}
      </Section>
      {finalBill ? (
        <Section title="Final bill">
          {finalBill.lines.map((line, index) => (
            <Row key={`${line.description}-${index}`} label={line.description} value={formatReceiptAmount(line.amount)} />
          ))}
          <View style={paper.dash} />
          <Row label="Bill total" value={formatReceiptAmount(finalBill.total)} />
          <Row label="Paid at booking" value={formatReceiptAmount(finalBill.creditedFromBooking, true)} />
          {finalBill.discount ? <Row label={`Discount${finalBill.discount.code ? ` (${finalBill.discount.code})` : ''}`} value={formatReceiptAmount(finalBill.discount.amount, true)} /> : null}
          <Row label="Balance paid" value={formatReceiptAmount(finalBill.balancePaid)} strong />
          <Detail>Online (Razorpay)</Detail>
          {finalBill.paymentId ? <Detail>{`Payment ID ${finalBill.paymentId}`}</Detail> : null}
          {finalBill.paidAtLabel ? <Detail>{`Paid ${finalBill.paidAtLabel}`}</Detail> : null}
        </Section>
      ) : null}
      {(receipt.extraWork?.length ?? 0) > 0 ? (
        <Section title="Extra work">
          {receipt.extraWork!.map((work, index) => (
            <View key={`${work.paymentId ?? 'work'}-${index}`} style={paper.py4}>
              <Row label={work.description} value={formatReceiptAmount(work.amount)} strong />
              <Detail>Online (Razorpay)</Detail>
              {work.paymentId ? <Detail>{`Payment ID ${work.paymentId}`}</Detail> : null}
              {work.paidAtLabel ? <Detail>{`Paid ${work.paidAtLabel}`}</Detail> : null}
            </View>
          ))}
        </Section>
      ) : null}
      {receipt.refunds.length > 0 ? (
        <Section title="Refunds">
          {receipt.refunds.map((refund, index) => (
            <View key={`${refund.refundedAt ?? 'refund'}-${index}`} style={paper.py4}>
              <Row
                label={refund.against === 'final_bill' ? 'Refund of final bill' : refund.against === 'extra_work' ? 'Refund of extra work' : 'Refund'}
                value={formatReceiptAmount(refund.amount, true)}
              />
              <Detail>{`${refund.method}${refund.refundedAtLabel ? ` on ${refund.refundedAtLabel}` : ''}`}</Detail>
              {refund.reference ? <Detail>{`Refund ID ${refund.reference}`}</Detail> : null}
            </View>
          ))}
        </Section>
      ) : null}
      <Section title="Total">
        <Row label="Total paid" value={formatReceiptAmount(receipt.totalPaid)} />
        {receipt.refunds.length > 0 ? <Row label="Refunded" value={formatReceiptAmount(receipt.totalRefunded, true)} /> : null}
        <Row label="Net amount paid" value={formatReceiptAmount(receipt.netPaid)} strong />
      </Section>
      <View style={paper.section}>
        <T size={12} weight={500} lh={16} color={INK}>
          {RECEIPT_NOT_TAX_INVOICE}
        </T>
        <T size={12} lh={16} color={GREY} style={paper.mt4}>
          {`Questions about this receipt? Call Detlio support on ${issuer.supportPhone}${issuer.supportEmail ? ` or write to ${issuer.supportEmail}` : ''}, quoting ${receipt.receiptNumber}.`}
        </T>
      </View>
    </View>
  );
}

/** apps/users/app/bookings/[id]/receipt/page.tsx, with the PDF going through the phone's share sheet. */
export default function ReceiptScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    let live = true;
    getBookingReceipt(String(id))
      .then((receipt) => live && setState({ kind: 'ready', receipt }))
      .catch((error: unknown) => {
        if (!live) return;
        if (error instanceof ApiError && error.code === 'RECEIPT_NOT_AVAILABLE') setState({ kind: 'unavailable', message: error.message });
        else if (error instanceof ApiError && error.code === 'RECEIPT_NUMBER_PENDING') setState({ kind: 'pending', message: error.message });
        else setState({ kind: 'error' });
      });
    return () => {
      live = false;
    };
  }, [id, attempt]);

  const sharePdf = async () => {
    if (state.kind !== 'ready' || sharing) return;
    setSharing(true);
    try {
      const { uri } = await Print.printToFileAsync({ html: receiptHtml(state.receipt) });
      // Named for the person it's sent to, not the print cache's random one.
      const named = new File(Paths.cache, `${receiptFileTitle(state.receipt.receiptNumber)}.pdf`);
      if (named.exists) named.delete();
      new File(uri).copy(named);
      if (!(await Sharing.isAvailableAsync())) {
        toast.info("Sharing isn't available on this phone.");
        return;
      }
      await Sharing.shareAsync(named.uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: `Detlio receipt ${state.receipt.receiptNumber}` });
    } catch {
      toast.error("Couldn't make the PDF. Try again.");
    } finally {
      setSharing(false);
    }
  };

  if (state.kind !== 'ready') {
    return (
      <View style={[styles.page, { paddingTop: insets.top }]}>
        <PageHeader title="Receipt" backTo={`/bookings/${id}`} />
        {state.kind === 'loading' ? (
          <T size={13} lh={18} color={colors.textSecondary} style={styles.message}>
            Loading your receipt…
          </T>
        ) : (
          <View style={styles.problem}>
            <T size={13} lh={18} color={colors.textSecondary}>
              {state.kind === 'unavailable' || state.kind === 'pending' ? state.message : 'Could not load this receipt. It may have been removed or you may not have access.'}
            </T>
            {state.kind === 'pending' ? (
              <ScButton
                variant="outline"
                height={44}
                onPress={() => {
                  setState({ kind: 'loading' });
                  setAttempt((n) => n + 1);
                }}
              >
                Try again
              </ScButton>
            ) : null}
            <ScButton variant="outline" height={44} onPress={() => (router.canGoBack() ? router.back() : router.replace(`/bookings/${id}` as Href))}>
              Back to booking
            </ScButton>
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      <PageHeader title="Receipt" backTo={`/bookings/${state.receipt.booking.id}`} />
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 40 }]}>
        <View style={styles.actions}>
          <View style={styles.grow}>
            <ScButton variant="main" height={44} disabled={sharing} onPress={() => void sharePdf()}>
              <IconDownload size={18} color={colors.white} />
              <Label color={colors.white}>{sharing ? 'Making it…' : 'Download PDF'}</Label>
            </ScButton>
          </View>
          <View style={styles.grow}>
            <ScButton variant="outline" height={44} disabled={sharing} onPress={() => void sharePdf()}>
              <IconShare size={18} color={colors.textPrimary} />
              <Label>Share</Label>
            </ScButton>
          </View>
        </View>
        <ReceiptDocument receipt={state.receipt} />
      </ScrollView>
    </View>
  );
}


const useStyles = createStyles((c) => ({
  page: { flex: 1, backgroundColor: c.canvas },
  message: { paddingHorizontal: 16, paddingTop: 16 },
  problem: { gap: 16, paddingHorizontal: 16, paddingTop: 16 },
  body: { paddingHorizontal: 16, paddingTop: 8 },
  actions: { flexDirection: 'row', gap: 8 },
  grow: { flex: 1 },
}));

const paper = StyleSheet.create({
  doc: {
    marginTop: 16,
    gap: 20,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingVertical: 24,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  head: {},
  mt4: { marginTop: 4 },
  mt8: { marginTop: 8 },
  mt16: { marginTop: 16 },
  py4: { paddingVertical: 4 },
  section: { borderTopWidth: 1, borderTopColor: RULE, paddingTop: 16 },
  sectionTitle: { marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 16, paddingVertical: 4 },
  rowLabel: { flex: 1, minWidth: 0 },
  dash: { marginTop: 4, borderTopWidth: 1, borderTopColor: RULE, borderStyle: 'dashed' },
});
