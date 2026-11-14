import type { BookBill } from '@repo/core/api/garage-book';
import { useMakeBill } from '@repo/core/api/hooks/use-garage-book';
import { billNumberText, jobTime, rupees, shortDate, spacedPhone } from '@repo/core/garage-book';
import { useT } from '@repo/core/i18n';
import { useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { Image, Share, View } from 'react-native';

import { RedButton } from '@repo/native-ui/finish';
import { IconBrandWhatsapp, IconPrinter, IconShare } from '@repo/native-ui/icons';
import { ErrorState, SkeletonList } from '@repo/native-ui/primitives';
import { T } from '@repo/native-ui/text';
import { createStyles } from '@repo/native-ui/theme';
import { toast } from '@repo/native-ui/toast';

import { garageScreen } from '@/components/app-shell';
import { BookScreen } from '@/components/book/book-screen';
import { BackHeader, Empty, Footnote, RaisedButton } from '@/components/book/parts';
import { useIsVendorAdmin } from '@/lib/auth';
import { billDate, dayMonth } from '@/lib/garage-book-2';
import { openLink } from '@/lib/open-link';

/**
 * A job's bill (BL1, the owner's; the web's app/book/bill/[ref]/page.tsx). Opening it makes the
 * bill the first time (its number is the garage's own, from 0001) and the same bill after.
 * The paper is the customer's bill as /b/<token> shows it, so its words stay English, as
 * Stage 1 keeps every message the customer reads.
 */
function BillScreen() {
  const t = useT();
  const styles = useStyles();
  const isOwner = useIsVendorAdmin();
  const { ref } = useLocalSearchParams<{ ref: string }>();
  const make = useMakeBill();
  const [bill, setBill] = useState<BookBill | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const load = () => {
    if (!ref || !isOwner) return;
    setFailed(null);
    make.mutate(ref, {
      onSuccess: setBill,
      onError: (error) => setFailed(error instanceof Error ? error.message : t("Couldn't make the bill. Try again.")),
    });
  };
  // Once per job: the server gives the same bill on a second ask anyway.
  useEffect(load, [ref, isOwner]);

  const share = async () => {
    if (!bill) return;
    try {
      await Share.share({ message: bill.message, url: bill.shareUrl });
    } catch {
      toast.error(t("Couldn't open that on this phone."));
    }
  };

  const snap = bill?.snapshot;
  return (
    <BookScreen hasNav={false}>
      <BackHeader title={t('Bill')} sub={bill && snap ? `${snap.customer.firstName} · ${shortDate(bill.createdAt)}, ${jobTime(bill.createdAt)}` : undefined} />
      {!isOwner ? (
        <Empty>{t('Only the garage’s owner sees money.')}</Empty>
      ) : failed ? (
        <ErrorState message={failed} onRetry={load} retrying={make.isPending} />
      ) : !bill || !snap ? (
        <SkeletonList count={1} height={420} />
      ) : (
        <>
          <View style={styles.paper} accessibilityLabel={t('Bill {number}', { number: billNumberText(snap.number) })}>
            <View style={styles.head}>
              <View style={styles.flex}>
                <T size={16} weight={700} color={INK}>
                  {snap.garage.name}
                </T>
                <T size={11} lh={15} color={MUTED}>
                  {[snap.garage.address, snap.garage.phone, snap.garage.gstin ? `GSTIN ${snap.garage.gstin}` : null].filter(Boolean).join('\n')}
                </T>
              </View>
              <T size={11} lh={15} color={MUTED} align="right">
                {'Bill '}
                <T size={11} weight={700} color={INK}>
                  {billNumberText(snap.number)}
                </T>
                {`\n${billDate(snap.date)}`}
              </T>
            </View>
            <Dash />
            <View style={styles.line}>
              <T size={13} color={INK} style={styles.flex} numberOfLines={1}>
                {snap.customer.firstName}
              </T>
              <T size={13} color={MUTED} numberOfLines={1} style={styles.shrink}>
                {[snap.customer.plate, snap.customer.car].filter(Boolean).join(' · ')}
              </T>
            </View>
            <Dash />
            {snap.lines.map((line, index) => (
              <View key={index} style={styles.line}>
                <T size={13} color={INK} style={styles.flex}>
                  {line.qty > 1 ? `${line.label} ×${line.qty}` : line.label}
                </T>
                <T num size={13} color={INK}>
                  {rupees(line.pricePaise * line.qty) ?? ''}
                </T>
              </View>
            ))}
            <Dash />
            <View style={styles.line}>
              <T size={16} weight={700} color={INK}>
                Total
              </T>
              <T num size={16} weight={700} color={INK}>
                {rupees(snap.totalPaise) ?? '₹0'}
              </T>
            </View>
            <Dash />
            {snap.paid ? (
              <T size={13} weight={700} color="#15803D" align="center">
                {snap.method === 'upi' ? 'Paid by UPI ✓' : snap.method === 'cash' ? 'Paid in cash ✓' : 'Paid ✓'}
              </T>
            ) : bill.pay ? (
              <View style={styles.pay}>
                {bill.pay.qrUrl ? (
                  <View style={styles.qr}>
                    <Image source={{ uri: bill.pay.qrUrl }} style={styles.qrImage} accessibilityLabel={t('Your UPI QR')} />
                  </View>
                ) : null}
                <View style={styles.flex}>
                  <T size={13} weight={700} color={INK}>
                    Pay by UPI
                  </T>
                  <T size={12} lh={17} color={MUTED}>
                    {`Scan with ${bill.pay.appsText || 'GPay, PhonePe or Paytm'}`}
                  </T>
                  {bill.pay.phone ? (
                    <T size={12} lh={17} color={INK}>
                      {`${bill.pay.appsText || 'UPI'}: `}
                      <T size={12} weight={700} color={INK}>
                        {spacedPhone(bill.pay.phone)}
                      </T>
                    </T>
                  ) : null}
                  {bill.pay.upiId ? (
                    <T size={11} color={MUTED}>
                      {bill.pay.upiId}
                    </T>
                  ) : null}
                </View>
              </View>
            ) : (
              <T size={13} color={INK} align="center">
                Not paid yet
              </T>
            )}
            <Dash />
            <T size={12} color={INK} align="center">
              {snap.nextWashDue ? `Thank you! Next wash due ${dayMonth(snap.nextWashDue)}.` : 'Thank you!'}
            </T>
            <T size={10} color={MUTED} align="center" style={styles.madeWith}>
              {bill.madeWith}
            </T>
          </View>
          {bill.whatsappUrl ? (
            <RedButton onPress={() => openLink(bill.whatsappUrl!)} height={52} radius={16}>
              <View style={styles.redLabel}>
                <IconBrandWhatsapp size={18} color="#FFFFFF" />
                <T variant="t3" weight={600} color="#FFFFFF">
                  {t('Send on WhatsApp')}
                </T>
              </View>
            </RedButton>
          ) : null}
          <View style={styles.row}>
            <RaisedButton label={t('Share the bill')} height={44} radius={16} icon={<IconShare size={18} />} onPress={() => void share()} style={styles.flex} />
            <RaisedButton
              label={t('Print')}
              height={44}
              radius={16}
              icon={<IconPrinter size={18} />}
              onPress={() => void WebBrowser.openBrowserAsync(bill.shareUrl).catch(() => toast.error(t("Couldn't open that on this phone.")))}
              style={styles.flex}
            />
          </View>
          <Footnote>
            {snap.paid
              ? t('Paid, so the bill says so. Bill numbers are your garage’s own, from 0001.')
              : bill.pay
                ? t('Not paid yet, so the bill carries your own UPI QR and number. Once paid it says so instead. Bill numbers are your garage’s own, from 0001.')
                : t('Not paid yet. Add your payment details and unpaid bills carry your own UPI QR and number. Bill numbers are your garage’s own, from 0001.')}
          </Footnote>
          {!bill.whatsappUrl ? (
            <Footnote>
              {snap.source === 'detlio'
                ? t('A Detlio customer’s number stays private, so their bill goes as a link, not on WhatsApp.')
                : t('No mobile for this customer, so share the bill’s link instead.')}
            </Footnote>
          ) : null}
        </>
      )}
    </BookScreen>
  );
}

const INK = '#16161A';
const MUTED = '#5B5B66';

function Dash() {
  const styles = useStyles();
  return <View style={styles.dash} />;
}

export default garageScreen(BillScreen);

const useStyles = createStyles(() => ({
  flex: { flex: 1, minWidth: 0 },
  shrink: { flexShrink: 1 },
  paper: {
    borderRadius: 18,
    backgroundColor: '#F4F4F6',
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 24 },
    shadowRadius: 20,
    shadowOpacity: 0.6,
  },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  line: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingVertical: 5 },
  dash: { borderTopWidth: 1, borderStyle: 'dashed', borderColor: '#B9B9C2', marginVertical: 8 },
  pay: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  qr: { backgroundColor: '#FFFFFF', borderRadius: 10, padding: 4, borderWidth: 1, borderColor: '#DCDCE2' },
  qrImage: { width: 76, height: 76 },
  madeWith: { marginTop: 6 },
  redLabel: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  row: { flexDirection: 'row', gap: 8 },
}));
