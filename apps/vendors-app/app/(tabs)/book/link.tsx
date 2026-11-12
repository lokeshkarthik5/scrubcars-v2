import { useBookLink, useUpdateBookLink } from '@repo/core/api/hooks/use-garage-book';
import { istDateKey, rupees } from '@repo/core/garage-book';
import { useT } from '@repo/core/i18n';
import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { View } from 'react-native';

import { Edge, RedButton } from '@repo/native-ui/finish';
import { IconBrandWhatsapp, IconCopy, IconPrinter } from '@repo/native-ui/icons';
import { LoadError, SkeletonList } from '@repo/native-ui/primitives';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { toast } from '@repo/native-ui/toast';

import { garageScreen } from '@/components/app-shell';
import { BookScreen } from '@/components/book/book-screen';
import { BackHeader, Empty, Footnote, Overline, RaisedButton, Row, Switch, SwitchRow, Tile } from '@/components/book/parts';
import { QrCode } from '@/components/book/qr-code';
import { useAuth, useIsVendorAdmin } from '@/lib/auth';
import { sharePoster } from '@/lib/book-download';
import { linkShareText, monthShort, posterHtml, shortUrl } from '@/lib/garage-book-2';
import { openLink } from '@/lib/open-link';

/** Booking link (L1, the owner's; the web's app/book/link/page.tsx): the garage's own page, its QR and what it offers. */
function LinkScreen() {
  const t = useT();
  const styles = useStyles();
  const colors = useColors();
  const isOwner = useIsVendorAdmin();
  const link = useBookLink(isOwner);
  const update = useUpdateBookLink();
  // On the poster and in the WhatsApp, which customers read: English.
  const garage = useAuth((s) => s.vendor?.businessName) ?? 'our garage';
  const [printing, setPrinting] = useState(false);
  const data = link.data;
  const month = monthShort(istDateKey(new Date()).slice(0, 7));
  const failed = (error: unknown) => toast.error(error instanceof Error ? error.message : t("Couldn't save. Try again."));

  const copy = async () => {
    if (!data) return;
    await Clipboard.setStringAsync(data.url);
    toast.success(t('Link copied'));
  };
  const poster = async () => {
    if (!data) return;
    setPrinting(true);
    try {
      const shared = await sharePoster(posterHtml(garage, data.url), `${data.slug}-poster.html`);
      if (!shared) toast.error(t('This phone can’t share files.'));
    } catch {
      toast.error(t("Couldn't make the poster. Try again."));
    } finally {
      setPrinting(false);
    }
  };

  return (
    <BookScreen gap={14}>
      <BackHeader title={t('Booking link')} />
      {!isOwner ? (
        <Empty>{t('Only the garage’s owner can change the booking link.')}</Empty>
      ) : !data ? (
        link.isError ? <LoadError what={t('your booking link')} onRetry={() => void link.refetch()} /> : <SkeletonList count={3} height={96} />
      ) : (
        <>
          <Edge radius={22} innerStyle={styles.card}>
            <QrCode value={data.url} size={112} label={t('QR code for your booking page')} />
            <View style={styles.cardText}>
              <Overline>{t('Your page')}</Overline>
              <T size={14} weight={600} selectable>
                {shortUrl(data.url)}
              </T>
              <View style={styles.buttons}>
                <RaisedButton label={t('Copy')} height={36} radius={16} icon={<IconCopy size={16} />} onPress={() => void copy()} style={styles.flex} />
                <RaisedButton label={t('Poster')} height={36} radius={16} icon={<IconPrinter size={16} />} disabled={printing} onPress={() => void poster()} style={styles.flex} />
              </View>
            </View>
          </Edge>
          <RedButton
            onPress={() => openLink(`https://wa.me/?text=${encodeURIComponent(linkShareText(garage, data.url))}`)}
            disabled={!data.active}
            height={48}
            radius={16}
          >
            <View style={styles.redLabel}>
              <IconBrandWhatsapp size={18} color={data.active ? '#FFFFFF' : colors.textMuted} />
              <T variant="t3" weight={600} color={data.active ? '#FFFFFF' : colors.textMuted}>
                {t('Share on WhatsApp')}
              </T>
            </View>
          </RedButton>
          <View style={styles.row}>
            <Tile label={t('From your link')} value={String(data.bookingsThisMonth)} sub={t('bookings in {month}', { month })} />
            <Tile label={t('Commission')} value={rupees(data.commissionPaise) ?? '₹0'} sub={t('your own customers')} />
          </View>
          <View>
            <Overline>{t('What customers can book')}</Overline>
            {data.services.filter((service) => !service.isAddon).length === 0 ? (
              <Footnote>{t('Add services on Services & prices first.')}</Footnote>
            ) : (
              data.services
                .filter((service) => !service.isAddon)
                .map((service) => (
                  <Row key={service.id}>
                    <T size={14} weight={600} style={styles.flex}>
                      {service.name}
                    </T>
                    <T num size={13} color={colors.textSecondary}>
                      {rupees(service.pricePaise) ?? ''}
                    </T>
                    <View style={!service.shown && styles.hidden}>
                      <Switch
                        checked={service.shown}
                        label={service.shown ? t('{service}: shown', { service: service.name }) : t('{service}: hidden', { service: service.name })}
                        onChange={(shown) => update.mutate({ services: [{ serviceId: service.id, shown }] }, { onError: failed })}
                      />
                    </View>
                  </Row>
                ))
            )}
          </View>
          <SwitchRow
            title={t('Take bookings on your page')}
            sub={data.active ? t('Customers can book now') : t('Off: the page says you are not taking bookings')}
            checked={data.active}
            onChange={(active) => update.mutate({ active }, { onError: failed })}
          />
          <Footnote>{t('Someone who has booked you through Detlio before books as a Detlio booking, as today.')}</Footnote>
        </>
      )}
    </BookScreen>
  );
}

export default garageScreen(LinkScreen);

const useStyles = createStyles(() => ({
  flex: { flex: 1, minWidth: 0 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14 },
  cardText: { flex: 1, minWidth: 0, gap: 8 },
  buttons: { flexDirection: 'row', gap: 6 },
  redLabel: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  row: { flexDirection: 'row', gap: 8 },
  hidden: { opacity: 0.55 },
}));
