import { RECEIPT_CONVENIENCE_LABEL, receiptTripLabel } from '@repo/core/pickup-fee-customer';
import { getBookingReceipt } from '@repo/core/api/bookings';
import { ApiError } from '@repo/core/api/client';
import { BOOKING_TYPE_LABELS } from '@repo/core/booking-types';
import { useT } from '@repo/core/i18n';
import { formatReceiptAmount, RECEIPT_NOT_TAX_INVOICE, receiptFileTitle, receiptItemValue } from '@repo/core/receipts';
import type { BookingReceipt } from '@repo/core/types';
import { Label, ScButton } from '@repo/native-ui/button';
import { IconDownload, IconShare } from '@repo/native-ui/icons';
import { Edge, RedLight } from '@repo/native-ui/finish';
import { BrandMark } from '@repo/native-ui/primitives';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors, useFinish } from '@repo/native-ui/theme';
import { toast } from '@repo/native-ui/toast';
import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import { type Href, router, useLocalSearchParams } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { type ReactNode, useEffect, useState } from 'react';
import { ScrollView, type StyleProp, StyleSheet, type TextStyle, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PageHeader } from '@/components/page-header';
import { receiptHtml } from '@/lib/receipt-html';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; receipt: BookingReceipt }
  | { kind: 'unavailable'; message: string }
  | { kind: 'pending'; message: string }
  | { kind: 'error' };

/**
 * The receipt on screen, in the finish (docs/ui-round-2026-11.md §1), as the website
 * draws it: a card with the lit edge, overline section titles, figures in Space Grotesk
 * 600, hairlines, the net amount a size up with the screen's one red light under it.
 * Still: nothing on this screen moves. Dark is the web's; Light takes the light finish
 * (a white card). The PDF that is shared is lib/receipt-html.ts, white paper, untouched.
 */
function useInk() {
  const colors = useColors();
  const { fx } = useFinish();
  return {
    primary: colors.textPrimary,
    label: fx.soft,
    quiet: fx.quiet,
    quietBright: fx.quietBright,
    refund: colors.success,
    hairline: fx.hairline,
  };
}

function Row({
  label,
  value,
  strong = false,
  numeric = true,
  refund = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
  numeric?: boolean;
  /** Money going back to the customer reads green, as elsewhere in the app. */
  refund?: boolean;
}) {
  const ink = useInk();
  return (
    <View style={paper.row}>
      <T size={strong ? 15 : 13} weight={strong ? 600 : 500} lh={20} color={strong ? ink.primary : ink.label} style={paper.rowLabel}>
        {label}
      </T>
      <T num={numeric} size={strong ? 15 : 13} weight={numeric || strong ? 600 : 500} lh={20} color={refund ? ink.refund : ink.primary} align="right">
        {value}
      </T>
    </View>
  );
}

function Detail({ children }: { children: string }) {
  const ink = useInk();
  return (
    <T variant="t5" lh={16} color={ink.quiet}>
      {children}
    </T>
  );
}

function Overline({ children, style }: { children: string; style?: StyleProp<TextStyle> }) {
  const ink = useInk();
  return (
    <T variant="over" color={ink.quiet} style={style}>
      {children}
    </T>
  );
}

function Rule({ dashed = false }: { dashed?: boolean }) {
  const ink = useInk();
  return <View style={[dashed ? paper.dash : paper.rule, { borderTopColor: ink.hairline }]} />;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View>
      <Rule />
      <View style={paper.sectionBody}>
        <Overline style={paper.sectionTitle}>{title}</Overline>
        {children}
      </View>
    </View>
  );
}

function ReceiptDocument({ receipt }: { receipt: BookingReceipt }) {
  const { issuer, booking, bookingPayment, finalBill } = receipt;
  const ink = useInk();
  return (
    <Edge accessibilityLabel={`Payment receipt ${receipt.receiptNumber}`} style={paper.card} innerStyle={paper.doc}>
      <View>
        {/* The real wordmark, its dot red. issuer.name is always "Detlio" (RECEIPT_ISSUER), so it says the same. */}
        <BrandMark height={26} />
        {issuer.tradeName ? (
          <T variant="t5" lh={16} color={ink.label} style={paper.mt12}>
            {`Operated by ${issuer.tradeName}`}
          </T>
        ) : null}
        {issuer.address ? <Detail>{issuer.address}</Detail> : null}
        <Detail>{issuer.website}</Detail>
        <T size={15} weight={600} lh={20} color={ink.primary} style={paper.mt16}>
          Payment receipt
        </T>
        <T num size={13} weight={600} lh={18} color={ink.primary}>
          {receipt.receiptNumber}
        </T>
        <Detail>{`Issued ${receipt.issuedOn}`}</Detail>
      </View>
      <View>
        <Rule />
        <View style={paper.sectionBody}>
          <Overline style={paper.mb4}>Customer</Overline>
          <T size={13} weight={500} lh={18} color={ink.primary}>
            {receipt.customer.name}
          </T>
          <T num size={13} lh={18} color={ink.primary}>
            {receipt.customer.phone}
          </T>
          <Overline style={[paper.mt16, paper.mb4]}>Garage</Overline>
          <T size={13} weight={500} lh={18} color={ink.primary}>
            {receipt.garage.name}
          </T>
          <T size={13} lh={18} color={ink.quietBright}>
            {receipt.garage.address}
          </T>
        </View>
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
          <Row key={`${item.name}-${index}`} label={item.name} value={receiptItemValue(item)} numeric={!item.priceOnInspection} />
        ))}
        {/* An accepted request's travel fee (0062), or the pickup fee with its road km (0079). */}
        {receipt.travelFee ? <Row label={receiptTripLabel(booking.bookingType, receipt.roadKm)} value={formatReceiptAmount(receipt.travelFee)} /> : null}
        {receipt.convenienceFee ? <Row label={RECEIPT_CONVENIENCE_LABEL} value={formatReceiptAmount(receipt.convenienceFee)} /> : null}
        {receipt.discount ? (
          <>
            <Rule dashed />
            <Row label="Subtotal" value={formatReceiptAmount(receipt.subtotal)} />
            <Row label={`${receipt.discount.label ?? 'Discount'}${receipt.discount.code ? ` (${receipt.discount.code})` : ''}`} value={formatReceiptAmount(receipt.discount.amount, true)} />
          </>
        ) : null}
        <Rule dashed />
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
          <Rule dashed />
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
                refund
              />
              <Detail>{`${refund.method}${refund.refundedAtLabel ? ` on ${refund.refundedAtLabel}` : ''}`}</Detail>
              {refund.reference ? <Detail>{`Refund ID ${refund.reference}`}</Detail> : null}
            </View>
          ))}
        </Section>
      ) : null}
      <Section title="Total">
        <Row label="Total paid" value={formatReceiptAmount(receipt.totalPaid)} />
        {receipt.refunds.length > 0 ? <Row label="Refunded" value={formatReceiptAmount(receipt.totalRefunded, true)} refund /> : null}
        {/* The figure the receipt is for: a size up, with the screen's one red light under it. */}
        <View style={[paper.total, { borderTopColor: ink.hairline }]}>
          <T variant="t3" weight={600} color={ink.primary} style={paper.rowLabel}>
            Net amount paid
          </T>
          <View style={paper.totalValue}>
            <T num variant="t2" weight={600} color={ink.primary} align="right">
              {formatReceiptAmount(receipt.netPaid)}
            </T>
            <RedLight style={paper.mt6} />
          </View>
        </View>
      </Section>
      <View>
        <Rule />
        <View style={paper.sectionBody}>
          <T variant="t5" lh={16} color={ink.primary}>
            {RECEIPT_NOT_TAX_INVOICE}
          </T>
          <T variant="t5" weight={400} lh={16} color={ink.quiet} style={paper.mt4}>
            {`Questions about this receipt? Call Detlio support on ${issuer.supportPhone}${issuer.supportEmail ? ` or write to ${issuer.supportEmail}` : ''}, quoting ${receipt.receiptNumber}.`}
          </T>
        </View>
      </View>
    </Edge>
  );
}

/** apps/users/app/bookings/[id]/receipt/page.tsx, with the PDF going through the phone's share sheet. */
export default function ReceiptScreen() {
  const t = useT();
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
        toast.info(t("Sharing isn't available on this phone."));
        return;
      }
      await Sharing.shareAsync(named.uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: `Detlio receipt ${state.receipt.receiptNumber}` });
    } catch {
      toast.error(t("Couldn't make the PDF. Try again."));
    } finally {
      setSharing(false);
    }
  };

  if (state.kind !== 'ready') {
    return (
      <View style={[styles.page, { paddingTop: insets.top }]}>
        <PageHeader title={t('Receipt')} backTo={`/bookings/${id}`} />
        {state.kind === 'loading' ? (
          <T size={13} lh={18} color={colors.textSecondary} style={styles.message}>
            {t('Loading your receipt…')}
          </T>
        ) : (
          <View style={styles.problem}>
            <T size={13} lh={18} color={colors.textSecondary}>
              {state.kind === 'unavailable' || state.kind === 'pending' ? state.message : t('Could not load this receipt. It may have been removed or you may not have access.')}
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
                {t('Try again')}
              </ScButton>
            ) : null}
            <ScButton variant="outline" height={44} onPress={() => (router.canGoBack() ? router.back() : router.replace(`/bookings/${id}` as Href))}>
              {t('Back to booking')}
            </ScButton>
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      <PageHeader title={t('Receipt')} backTo={`/bookings/${state.receipt.booking.id}`} />
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 40 }]}>
        <View style={styles.actions}>
          <View style={styles.grow}>
            <ScButton variant="main" height={44} disabled={sharing} onPress={() => void sharePdf()}>
              <IconDownload size={18} color={colors.white} />
              <Label color={colors.white}>{sharing ? t('Making it…') : t('Download PDF')}</Label>
            </ScButton>
          </View>
          <View style={styles.grow}>
            <ScButton variant="outline" height={44} disabled={sharing} onPress={() => void sharePdf()}>
              <IconShare size={18} color={colors.textPrimary} />
              <Label>{t('Share')}</Label>
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
  card: { marginTop: 16 },
  doc: { gap: 20, paddingHorizontal: 20, paddingVertical: 24 },
  mt4: { marginTop: 4 },
  mt6: { marginTop: 6 },
  mt12: { marginTop: 12 },
  mt16: { marginTop: 16 },
  mb4: { marginBottom: 4 },
  py4: { paddingVertical: 4 },
  rule: { borderTopWidth: 1 },
  sectionBody: { paddingTop: 16 },
  sectionTitle: { marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 16, paddingVertical: 4 },
  rowLabel: { flex: 1, minWidth: 0 },
  dash: { marginTop: 4, borderTopWidth: 1, borderStyle: 'dashed' },
  total: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 16, marginTop: 8, paddingTop: 12, borderTopWidth: 1 },
  totalValue: { alignItems: 'flex-end' },
});
