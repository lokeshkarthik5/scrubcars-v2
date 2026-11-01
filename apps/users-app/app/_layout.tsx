import { Stack } from 'expo-router';
import 'react-native-reanimated';

export { ErrorBoundary } from 'expo-router';

export default function RootLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
