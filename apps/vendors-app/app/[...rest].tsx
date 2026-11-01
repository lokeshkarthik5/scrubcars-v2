import { type Href, Redirect } from 'expo-router';

/** An address this app has no screen for goes home. */
export default function UnknownScreen() {
  return <Redirect href={'/home' as Href} />;
}
