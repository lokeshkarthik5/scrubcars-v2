import { Linking } from 'react-native';

import { toast } from '@/components/toast';

/** Hands a tel:, WhatsApp or Maps link to the phone, and says so if it can't. */
export function openLink(url: string) {
  Linking.openURL(url).catch(() => toast.error("Couldn't open that on this phone."));
}
