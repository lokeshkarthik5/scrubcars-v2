import { getPayQrUpload, type PaymentDetails, type PaymentDetailsPatch } from '@repo/core/api/garage-book';
import { usePaymentDetails, useSavePaymentDetails } from '@repo/core/api/hooks/use-garage-book';
import { PAY_APPS, payAppsText, spacedPhone, type PayApp } from '@repo/core/garage-book';
import { useT } from '@repo/core/i18n';
import { normaliseIndianMobile } from '@repo/core/phone';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Image, View } from 'react-native';

import { Edge } from '@repo/native-ui/finish';
import { IconCamera, IconCheck, IconPhone, IconQrcode } from '@repo/native-ui/icons';
import { LoadError, SkeletonList } from '@repo/native-ui/primitives';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { toast } from '@repo/native-ui/toast';

import { garageScreen } from '@/components/app-shell';
import { BookScreen } from '@/components/book/book-screen';
import { AMBER, BackHeader, BookInput, Chip, Empty, FieldLabel, Footnote, OK, Overline, RaisedButton, SwitchRow } from '@/components/book/parts';
import { useIsVendorAdmin } from '@/lib/auth';
import { prepareForUpload } from '@/lib/photo-prepare';
import { discardCached } from '@/lib/private-cache';

/** Payment details (PY1, the owner's; the web's app/book/payments/page.tsx): the garage's own UPI QR, phone and where they show. */
function PaymentsScreen() {
  const t = useT();
  const isOwner = useIsVendorAdmin();
  const details = usePaymentDetails(isOwner);
  return (
    <BookScreen gap={14}>
      <BackHeader title={t('Payment details')} sub={t('How customers pay you')} />
      {!isOwner ? (
        <Empty>{t('Only the garage’s owner sees money.')}</Empty>
      ) : !details.data ? (
        details.isError ? <LoadError what={t('payment details')} onRetry={() => void details.refetch()} /> : <SkeletonList count={3} height={96} />
      ) : (
        <PaymentForm details={details.data} />
      )}
    </BookScreen>
  );
}

const APP_WORDS: Record<PayApp, string> = { gpay: 'GPay', phonepe: 'PhonePe', paytm: 'Paytm' };

function PaymentForm({ details }: { details: PaymentDetails }) {
  const t = useT();
  const styles = useStyles();
  const colors = useColors();
  const save = useSavePaymentDetails();
  const [phone, setPhone] = useState(details.phone ? spacedPhone(details.phone) : '');
  const [uploading, setUploading] = useState(false);
  const digits = normaliseIndianMobile(phone);
  const phoneOk = /^[6-9]\d{9}$/.test(digits);
  const failed = (error: unknown) => toast.error(error instanceof Error ? error.message : t("Couldn't save. Try again."));
  const change = (patch: PaymentDetailsPatch, after?: (next: PaymentDetails) => void) => save.mutate(patch, { onSuccess: after, onError: failed });

  const savePhone = () => {
    if (phone.trim() === '' && details.phone) return change({ phone: null });
    if (phoneOk && digits !== details.phone) change({ phone: digits }, () => toast.success(t('Saved')));
  };

  const pickQr = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', exif: false });
    if (result.canceled || !result.assets[0]) return;
    setUploading(true);
    let local: string | null = null;
    try {
      // Re-encoded as a JPEG on the phone: the server takes PNG or JPEG, and a phone's HEIC is neither.
      const photo = await prepareForUpload(result.assets[0].uri, t('This picture'));
      local = photo.uri;
      const { uploadUrl, key } = await getPayQrUpload('image/jpeg');
      const put = await fetch(uploadUrl, { method: 'PUT', body: photo.bytes as unknown as BodyInit, headers: { 'Content-Type': 'image/jpeg' } });
      if (!put.ok) throw new Error(t('Upload failed. Please try again.'));
      const next = await save.mutateAsync({ qrKey: key });
      if (next.qrRead === 'read' && next.upiId) {
        toast.success(t('We read: {upi}', { upi: [next.upiId, next.upiName].filter(Boolean).join(' · ') }));
      } else {
        toast.info(t('We couldn’t read a QR in that picture. Check it is your payment QR, or try a clearer screenshot.'));
      }
    } catch (error) {
      failed(error);
    } finally {
      discardCached([local]);
      setUploading(false);
    }
  };

  return (
    <>
      <Edge radius={22} innerStyle={styles.card}>
        {details.qrUrl ? (
          <View style={styles.qr}>
            <Image source={{ uri: details.qrUrl }} style={styles.qrImage} accessibilityLabel={t('Your UPI QR')} />
          </View>
        ) : (
          <View style={[styles.qr, styles.qrEmpty]}>
            <IconQrcode size={40} color="#8A8A94" />
          </View>
        )}
        <View style={styles.cardText}>
          <Overline>{t('Your UPI QR')}</Overline>
          {details.qrRead === 'read' && details.upiId ? (
            <>
              <T size={13} lh={18}>
                {`${t('We read it:')} `}
                <T size={13} lh={18} weight={700}>
                  {details.upiId}
                </T>
              </T>
              {details.upiName ? (
                <View style={styles.okLine}>
                  <IconCheck size={14} color={OK} />
                  <T size={12} color={OK} numberOfLines={1} style={styles.shrink}>
                    {details.upiName}
                  </T>
                </View>
              ) : null}
            </>
          ) : details.qrRead === 'unreadable' ? (
            <T size={12} lh={17} color={AMBER}>
              {t('We couldn’t read this QR. Check it is your UPI QR, or upload a clearer screenshot.')}
            </T>
          ) : (
            <T size={12} lh={17} color={colors.textSecondary}>
              {t('No QR yet')}
            </T>
          )}
          <RaisedButton
            label={uploading ? t('Uploading…') : details.qrUrl ? t('Change QR') : t('Upload QR')}
            height={36}
            radius={16}
            icon={<IconCamera size={16} />}
            disabled={uploading}
            onPress={() => void pickQr()}
            style={styles.start}
          />
        </View>
      </Edge>
      <Footnote>{t('Upload a screenshot or photo of your GPay, PhonePe or Paytm QR. Check the name we read is yours.')}</Footnote>
      <FieldLabel>{t('Phone for payments')}</FieldLabel>
      <BookInput
        value={phone}
        onChangeText={setPhone}
        onEndEditing={savePhone}
        onSubmitEditing={savePhone}
        keyboardType="phone-pad"
        maxLength={16}
        placeholder="98400 00000"
        accessibilityLabel={t('Phone for payments')}
        leading={<IconPhone size={18} color="#8A8A94" />}
      />
      {phone.trim() !== '' && !phoneOk ? (
        <T size={12} weight={600} color="#FF8A95">
          {t('Enter a 10-digit mobile number')}
        </T>
      ) : null}
      <View style={styles.chips} accessibilityLabel={t('Apps this phone takes: {apps}', { apps: payAppsText(details.apps) || '–' })}>
        {PAY_APPS.map((app) => {
          const on = details.apps.includes(app);
          return (
            <Chip
              key={app}
              label={APP_WORDS[app]}
              on={on}
              onPress={() => change({ apps: on ? details.apps.filter((a) => a !== app) : [...details.apps, app] })}
            />
          );
        })}
      </View>
      <View>
        <Overline>{t('Show it on')}</Overline>
        <SwitchRow title={t('Bills')} sub={t('Unpaid bills carry the QR and number')} checked={details.showOnBills} onChange={(on) => change({ showOnBills: on })} />
        <SwitchRow
          title={t('Money owed reminders')}
          sub={t('"Pay on GPay {phone}" in the WhatsApp', { phone: details.phone ? spacedPhone(details.phone) : '98400 00000' })}
          checked={details.showOnReminders}
          onChange={(on) => change({ showOnReminders: on })}
        />
        <SwitchRow title={t('Your booking page')} sub={t('Under “Pay at the garage”')} checked={details.showOnBookingPage} onChange={(on) => change({ showOnBookingPage: on })} />
      </View>
      <Footnote>{t('Money goes straight to your bank. Detlio never touches it and takes nothing.')}</Footnote>
    </>
  );
}

export default garageScreen(PaymentsScreen);

const useStyles = createStyles(() => ({
  shrink: { flexShrink: 1 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14 },
  qr: { backgroundColor: '#FFFFFF', borderRadius: 14, padding: 8 },
  qrEmpty: { width: 120, height: 120, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1B1B1F' },
  qrImage: { width: 104, height: 104 },
  cardText: { flex: 1, minWidth: 0, gap: 6 },
  okLine: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  start: { alignSelf: 'flex-start' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
}));
