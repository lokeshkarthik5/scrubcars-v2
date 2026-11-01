import { type Href, Redirect, useLocalSearchParams } from 'expo-router';

import { garageScreen } from '@/components/app-shell';
import { ComingScreen } from '@/components/coming-screen';

/** The web's other screens, which Home and the alerts link to, by their web paths. */
const LATER: Record<string, string> = {
  reviews: 'Reviews',
  requests: 'Requests',
  guarantee: 'Free redo claims',
  agreement: 'Garage agreement',
  photos: 'Garage photos',
  'settings/documents': 'Documents',
  'settings/members': 'Team',
};

/** Anything else, an address this app has no screen for, goes home. */
export default garageScreen(function LaterScreen() {
  const { rest } = useLocalSearchParams<{ rest: string[] }>();
  const title = LATER[(rest ?? []).join('/')];
  if (!title) return <Redirect href={'/home' as Href} />;
  return <ComingScreen title={title} back />;
});
