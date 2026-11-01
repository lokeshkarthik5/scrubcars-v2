import { ScButton } from '@repo/native-ui/button';
import { T } from '@repo/native-ui/text';
import { useColors } from '@repo/native-ui/theme';
import { type Href, router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { ComingNext } from '@/components/coming-next';
import { CustomerShell } from '@/components/screen';
import { useAuth } from '@/lib/auth';

/** Signed out, as apps/users/app/bookings/page.tsx. The list itself comes in stage 3. */
export default function BookingsScreen() {
  const colors = useColors();
  const user = useAuth((s) => s.user);
  if (user) return <ComingNext title="Bookings" stage={3} />;
  return (
    <CustomerShell>
      <T accessibilityRole="header" size={28} weight={300} lh={34} tracking={-0.025}>
        Bookings
      </T>
      <View style={styles.center}>
        <T size={15} weight={600} align="center">
          Login to view your bookings
        </T>
        <T size={13} align="center" color={colors.textSecondary}>
          Sign in to see your booking history
        </T>
        <ScButton
          variant="main"
          fullWidth={false}
          paddingX={32}
          onPress={() => router.push('/login?next=%2Fbookings' as Href)}
          style={styles.button}
        >
          Login
        </ScButton>
      </View>
    </CustomerShell>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  button: { marginTop: 8 },
});
