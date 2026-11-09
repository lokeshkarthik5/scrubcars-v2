import { t, useT } from '@repo/core/i18n';
import { type PaymentHelpSituation, paymentHelpMessage } from '@repo/core/payment-confirmation';
import { supportWhatsAppHref } from '@repo/core/support';
import { IconAlertCircle, IconBrandWhatsapp } from '@repo/native-ui/icons';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { type Href, router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { openLink } from '@/lib/open-link';

type WaitingOn = Exclude<PaymentHelpSituation, 'refund' | 'bill_refund'>;

function helpSituation(refundMessage: string | undefined, waitingOn: WaitingOn): PaymentHelpSituation {
  if (!refundMessage) return waitingOn;
  return waitingOn === 'bill_not_marked_paid' ? 'bill_refund' : 'refund';
}

export function paymentReceivedText(paymentId: string, refundMessage?: string, waitingOn: WaitingOn = 'missing_booking'): string {
  if (refundMessage) return `${refundMessage} ${t('Payment ID {id}.', { id: paymentId })}`;
  return waitingOn === 'bill_not_marked_paid'
    ? t("We've received your payment (ID {id}). We're confirming it against your bill — it shows here as paid in a minute, or WhatsApp us with this payment ID.", { id: paymentId })
    : t("We've received your payment (ID {id}). We're confirming your booking — check My bookings in a minute, or WhatsApp us with this payment ID.", { id: paymentId });
}

/** PaymentReceivedPanel (apps/users/components/payment-received-panel.tsx). */
export function PaymentReceivedPanel({
  paymentId,
  refundMessage,
  waitingOn = 'missing_booking',
}: {
  paymentId: string;
  refundMessage?: string;
  waitingOn?: WaitingOn;
}) {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  const text = paymentReceivedText(paymentId, refundMessage, waitingOn);
  return (
    <View style={styles.panel} accessibilityLiveRegion="polite">
      <View style={styles.line}>
        {refundMessage ? <IconAlertCircle size={16} color={colors.error} /> : null}
        <T size={13} lh={20} style={styles.grow}>
          {text}
        </T>
      </View>
      <View style={styles.row}>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={t('WhatsApp Detlio support with this payment ID')}
          onPress={() => openLink(supportWhatsAppHref(paymentHelpMessage(paymentId, helpSituation(refundMessage, waitingOn))))}
          style={styles.button}
        >
          <IconBrandWhatsapp size={16} color="#25D366" />
          <T size={13} weight={500} lh={18}>
            {t('WhatsApp us')}
          </T>
        </Pressable>
        <Pressable accessibilityRole="link" onPress={() => router.push('/bookings' as Href)} style={styles.button}>
          <T size={13} weight={500} lh={18}>
            {t('My bookings')}
          </T>
        </Pressable>
      </View>
    </View>
  );
}

const useStyles = createStyles((c) => ({
  panel: { gap: 12 },
  line: { flexDirection: 'row', gap: 6 },
  grow: { flex: 1 },
  row: { flexDirection: 'row', gap: 8 },
  button: {
    flex: 1,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surface,
    paddingHorizontal: 12,
  },
}));
