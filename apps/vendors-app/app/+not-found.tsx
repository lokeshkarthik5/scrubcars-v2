import { Link } from 'expo-router';
import { Text, View } from 'react-native';

import { createStyles } from '@repo/native-ui/theme';

export default function NotFoundScreen() {
  const styles = useStyles();
  return (
    <View style={styles.page}>
      <Text style={styles.title}>This screen doesn't exist.</Text>
      <Link href="/" style={styles.link}>
        Go to the start
      </Link>
    </View>
  );
}

const useStyles = createStyles((colors) => ({
  page: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: colors.canvas },
  title: { color: colors.textPrimary, fontSize: 18, fontWeight: '600' },
  link: { color: colors.red, fontSize: 15, marginTop: 16 },
}));
