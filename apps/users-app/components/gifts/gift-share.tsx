import type { GiftLink, SentGift } from '@repo/core/api/gifts';
import { useGiftsConfig } from '@repo/core/api/hooks/use-gifts';
import { Label, ScButton } from '@repo/native-ui/button';
import { IconBrandWhatsapp, IconCopy, IconPrinter, IconShare } from '@repo/native-ui/icons';
import { Notice, ScCard } from '@repo/native-ui/primitives';
import { FigureLine, T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { toast } from '@repo/native-ui/toast';
import * as Clipboard from 'expo-clipboard';
import * as Print from 'expo-print';
import { useState } from 'react';
import { Linking, Share, View } from 'react-native';

import { PremiumCard } from '@/components/premium-card/premium-card';
import { ShareCardImage } from '@/components/premium-card/share-card-image';
import { formatGiftCode, formatGiftDate, giftRupees, giftShareText, whatsAppShareUrl } from '@/lib/gifts';
import { CARS_ILLUSTRATION_LINE, firstName, giftCardSpec } from '@/lib/premium-card';
import { escapeHtml } from '@/lib/receipt-html';

const WEB = 'https://detlio.com';

type ShareGift = Pick<SentGift, 'number' | 'amount' | 'recipientName' | 'message' | 'design' | 'expiresAt'>;

/** The printed card, on white. The code is in it and nowhere else on this phone. */
export function giftPrintHtml(gift: ShareGift, code: string, url: string): string {
  return `<html><body style="font-family:-apple-system,Helvetica,sans-serif;color:#111;padding:32px">
<p style="font-size:17px;font-weight:600">Detlio<span style="color:#E4002B">.</span> gift</p>
<p style="font-size:28px;font-weight:700;margin:12px 0 0">${escapeHtml(giftRupees(gift.amount))}</p>
<p style="font-size:15px;margin:0 0 12px">for ${escapeHtml(gift.recipientName)}</p>
${gift.message ? `<p style="font-size:13px;font-style:italic">“${escapeHtml(gift.message)}”</p>` : ''}
<p style="font-size:11px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:#555;margin:16px 0 0">Gift code</p>
<p style="font-size:22px;font-weight:700;letter-spacing:.06em;margin:4px 0 16px">${escapeHtml(formatGiftCode(code))}</p>
<p style="font-size:12px;color:#444">To use it, open ${escapeHtml(url)}, or sign in to Detlio and type the code under Profile, Detlio credit.${gift.expiresAt ? ` Use by ${escapeHtml(formatGiftDate(gift.expiresAt))}.` : ''}</p>
<p style="font-size:11px;color:#666">${escapeHtml(gift.number)}</p>
</body></html>`;
}

/** GiftShare: shown once a link is made. The code is nowhere the buyer can see again. */
export function GiftShare({ gift, link }: { gift: ShareGift; link: GiftLink }) {
  const colors = useColors();
  const styles = useStyles();
  const [showPrint, setShowPrint] = useState(false);
  const validMonths = useGiftsConfig().data?.validMonths ?? null;
  const cardSpec = (showName: boolean) => giftCardSpec({ design: gift.design, amount: gift.amount, recipientName: gift.recipientName, expiresAt: gift.expiresAt, validMonths, showName });
  const url = `${WEB}${link.path}`;
  const text = giftShareText({ amount: gift.amount, recipientName: gift.recipientName, url });
  const copy = async () => {
    try {
      await Clipboard.setStringAsync(url);
      toast.success('Link copied');
    } catch {
      toast.info("Couldn't copy the link. Press and hold it to copy it instead.");
    }
  };
  return (
    <View style={styles.column}>
      <View style={styles.gap6}>
        <PremiumCard spec={cardSpec(true)} />
        <T size={11} lh={15} align="center" color={colors.textMuted}>
          {CARS_ILLUSTRATION_LINE}
        </T>
      </View>
      <View>
        <FigureLine size={17} weight={600} lh={24} text={`Your ${giftRupees(gift.amount)} gift for ${gift.recipientName} is ready`} />
        <T size={13} lh={18} color={colors.textSecondary} style={styles.mt4}>
          {`Send them this link. Whoever opens it can add the gift to their Detlio credit, so send it only to ${gift.recipientName}.`}
        </T>
      </View>
      <ScCard style={styles.gap4}>
        <T size={11} weight={500} lh={15} color={colors.textSecondary}>
          Gift link
        </T>
        <T num selectable size={13} lh={18}>
          {url}
        </T>
      </ScCard>
      <View style={styles.gap8}>
        <ScButton variant="main" onPress={() => Share.share({ title: 'A Detlio gift', message: text }).catch(() => undefined)}>
          <IconShare size={18} color={colors.canvas} />
          <Label color={colors.canvas}>Share</Label>
        </ScButton>
        <View style={styles.pair}>
          <View style={styles.half}>
            <ScButton variant="outline" onPress={() => void copy()}>
              <IconCopy size={16} color={colors.textPrimary} />
              <Label>Copy link</Label>
            </ScButton>
          </View>
          <View style={styles.half}>
            <ScButton variant="outline" onPress={() => void Linking.openURL(whatsAppShareUrl(text))}>
              <IconBrandWhatsapp size={16} color={colors.textPrimary} />
              <Label>WhatsApp</Label>
            </ScButton>
          </View>
        </View>
        <ScButton variant="outline" onPress={() => setShowPrint((on) => !on)}>
          <IconPrinter size={16} color={colors.textPrimary} />
          <Label>{showPrint ? 'Hide the printable card' : 'Print a card instead'}</Label>
        </ScButton>
        <ShareCardImage spec={cardSpec} firstName={firstName(gift.recipientName) || null} />
      </View>
      {showPrint ? (
        <View style={styles.gap8}>
          <View accessibilityLabel="Printable gift card" style={styles.paper}>
            <T size={17} weight={600} lh={24} color="#171717">
              Detlio<T size={17} weight={600} color="#E4002B">.</T>{' gift'}
            </T>
            <T num size={28} weight={700} lh={34} color="#171717">
              {giftRupees(gift.amount)}
            </T>
            <T size={15} lh={20} color="#171717">{`for ${gift.recipientName}`}</T>
            {gift.message ? (
              <T size={13} lh={18} color="#171717" style={styles.italic}>{`“${gift.message}”`}</T>
            ) : null}
            <T size={11} weight={600} lh={15} uppercase tracking={0.025} color="#525252">
              Gift code
            </T>
            <T num selectable size={22} weight={700} lh={28} tracking={0.06} color="#171717">
              {formatGiftCode(link.code)}
            </T>
            <T size={12} lh={16} color="#404040">
              {`To use it, open ${url}, or sign in to Detlio and type the code under Profile, Detlio credit.${gift.expiresAt ? ` Use by ${formatGiftDate(gift.expiresAt)}.` : ''}`}
            </T>
            <T num size={11} lh={15} color="#525252">
              {gift.number}
            </T>
          </View>
          <ScButton variant="outline" onPress={() => void Print.printAsync({ html: giftPrintHtml(gift, link.code, url) }).catch(() => undefined)}>
            <IconPrinter size={16} color={colors.textPrimary} />
            <Label>Print</Label>
          </ScButton>
        </View>
      ) : null}
      <Notice title="This link is shown only now">{`If it is lost, use Get a new link in Gifts you sent: the new link replaces this one, and this one stops working.${gift.expiresAt ? ` The gift can be used until ${formatGiftDate(gift.expiresAt)}.` : ''}`}</Notice>
    </View>
  );
}

const useStyles = createStyles(() => ({
  column: { gap: 16 },
  gap4: { gap: 4 },
  gap6: { gap: 6 },
  gap8: { gap: 8 },
  mt4: { marginTop: 4 },
  pair: { flexDirection: 'row', gap: 8 },
  half: { flex: 1 },
  paper: { gap: 8, borderRadius: 12, borderWidth: 1, borderColor: '#E5E5E5', backgroundColor: '#FFFFFF', padding: 20 },
  italic: { fontStyle: 'italic' },
}));
