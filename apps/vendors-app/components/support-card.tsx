import { SUPPORT_PHONE_DISPLAY, SUPPORT_TEL_HREF, SUPPORT_WHATSAPP_HREF } from '@repo/core/support';
import { View } from 'react-native';

import { createStyles, useColors } from '@repo/native-ui/theme';

import { ScCard } from '@repo/native-ui/primitives';
import { ContactButtons } from './rows';
import { T } from '@repo/native-ui/text';

/** SupportCard. */
export function SupportCard() {
  const colors = useColors();
  const styles = useStyles();
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

const useStyles = createStyles(() => ({ card: { gap: 12 } }));
