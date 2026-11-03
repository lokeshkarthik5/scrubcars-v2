import { type Href, Redirect } from 'expo-router';

/** An address this app has no screen for goes home; the gate sends a guest on to the list. */
export default function UnknownScreen() {
  return <Redirect href={'/home' as Href} />;
}
