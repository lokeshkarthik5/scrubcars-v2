import { ScButton } from '@repo/native-ui/button';
import { T } from '@repo/native-ui/text';
import { createStyles } from '@repo/native-ui/theme';
import { type Href, router } from 'expo-router';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MyComplaints } from '@/components/complaints/my-complaints';
import { PageHeader } from '@/components/page-header';
import { useAuth } from '@/lib/auth';

/** "See our answer": the same complaints list the Profile page shows, on its own. */
export default function ComplaintsScreen() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const user = useAuth((s) => s.user);
  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      <PageHeader title="Your complaints" backTo="/profile" />
      {user ? (
        <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 24 }]}>
          <MyComplaints />
        </ScrollView>
      ) : (
        <View style={styles.center}>
          <T size={15} weight={600} align="center">
            Sign in to see your complaints
          </T>
          <ScButton variant="main" fullWidth={false} paddingX={32} onPress={() => router.push(`/login?next=${encodeURIComponent('/profile/complaints')}` as Href)}>
            Sign in
          </ScButton>
        </View>
      )}
    </View>
  );
}

const useStyles = createStyles((c) => ({
  page: { flex: 1, backgroundColor: c.canvas },
  body: { paddingHorizontal: 16, paddingTop: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, paddingHorizontal: 16 },
}));
