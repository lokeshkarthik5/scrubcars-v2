import { SUPPORT_PHONE_DISPLAY, SUPPORT_TEL_HREF, SUPPORT_WHATSAPP_HREF } from '@repo/core/support';
import { StyleSheet, View } from 'react-native';

import { colors } from '@/lib/theme';

import { ScCard } from './primitives';
import { ContactButtons } from './rows';
import { T } from './text';

/** SupportCard. */
export function SupportCard() {
  return (
    <ScCard style={styles.card}>
      <View>
        <T size={13} weight={600}>
          Need help?
        </T>
        <T size={11} color={colors.textSecondary}>
          {`Reach our team at ${SUPPORT_PHONE_DISPLAY}`}
        </T>
      </View>
      <ContactButtons who="Detlio support" callHref={SUPPORT_TEL_HREF} whatsAppHref={SUPPORT_WHATSAPP_HREF} />
    </ScCard>
  );
}

const styles = StyleSheet.create({ card: { gap: 12 } });
