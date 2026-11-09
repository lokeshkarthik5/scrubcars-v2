import { Tabs } from 'expo-router';

import { BottomNav } from '@/components/bottom-nav';
import { useSendWaitingWalkIns } from '@/lib/book-offline';
import { useGarageBookOn } from '@/lib/garage-book';
import { useColors } from '@repo/native-ui/theme';

/** Every seat's tabs; BottomNav draws the ones the seat has. */
export default function TabsLayout() {
  const colors = useColors();
  const book = useGarageBookOn();
  // Walk-ins saved with no signal go as soon as there is one (Garage Book, 0069).
  useSendWaitingWalkIns(book);
  return (
    <Tabs
      tabBar={() => <BottomNav />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.canvas } }}
    >
      <Tabs.Screen name="home" />
      <Tabs.Screen name="bookings" />
      <Tabs.Screen name="services" />
      <Tabs.Screen name="earnings" />
      <Tabs.Screen name="settings/index" />
      <Tabs.Screen name="settings/notifications" />
      <Tabs.Screen name="account" />
      <Tabs.Screen name="reviews" />
      <Tabs.Screen name="requests" />
      <Tabs.Screen name="guarantee" />
      <Tabs.Screen name="agreement" />
      <Tabs.Screen name="photos" />
      <Tabs.Screen name="settings/documents" />
      <Tabs.Screen name="settings/members" />
    </Tabs>
  );
}
