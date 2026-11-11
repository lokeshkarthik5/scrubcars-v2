import { Linking } from 'react-native';

import { toast } from '@repo/native-ui/toast';
import { t } from '@repo/core/i18n/translate';

/** Hands a tel:, WhatsApp or Maps link to the phone, and says so if it can't. */
export function openLink(url: string) {
  Linking.openURL(url).catch(() => toast.error(t("Couldn't open that on this phone.")));
}
