import { useColors } from '@repo/native-ui/theme';
import { Tabs } from 'expo-router';

import { HubNav } from '@/components/hub-nav';

/** The nav's places, and the two steps off them that keep the nav: the list and search. */
export default function TabsLayout() {
  const colors = useColors();
  return (
    <Tabs
      tabBar={() => <HubNav />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.canvas } }}
    >
      <Tabs.Screen name="home" />
      <Tabs.Screen name="map" />
      <Tabs.Screen name="garages" />
      <Tabs.Screen name="search" />
      <Tabs.Screen name="bookings" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}
