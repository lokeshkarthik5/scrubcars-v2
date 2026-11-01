import { Tabs } from 'expo-router';

import { BottomNav } from '@/components/bottom-nav';
import { colors } from '@/lib/theme';

/** Every seat's tabs; BottomNav draws the ones the seat has. */
export default function TabsLayout() {
  return (
    <Tabs
      tabBar={() => <BottomNav />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.brandBlack } }}
    >
      <Tabs.Screen name="home" />
      <Tabs.Screen name="bookings" />
      <Tabs.Screen name="services" />
      <Tabs.Screen name="earnings" />
      <Tabs.Screen name="settings" />
    </Tabs>
  );
}
