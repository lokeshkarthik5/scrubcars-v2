import { toast } from '@repo/native-ui/toast';
import { Linking } from 'react-native';

/** Hands a store or web link to the phone, and says so if it can't. */
export function openLink(url: string) {
  Linking.openURL(url).catch(() => toast.error("Couldn't open that on this phone."));
}
