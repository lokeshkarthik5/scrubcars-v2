import { Link } from 'expo-router';
import { Text, View } from 'react-native';

import { createStyles } from '@repo/native-ui/theme';
import { useT } from '@repo/core/i18n';

export default function NotFoundScreen() {
  const t = useT();
  const styles = useStyles();
  return (
    <View style={styles.page}>
      <Text style={styles.title}>{t("This screen doesn't exist.")}</Text>
      <Link href="/" style={styles.link}>
        {t('Go to the start')}
      </Link>
    </View>
  );
}

const useStyles = createStyles((colors) => ({
  page: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: colors.canvas },
  title: { color: colors.textPrimary, fontSize: 18, fontWeight: '600' },
  link: { color: colors.red, fontSize: 15, marginTop: 16 },
}));
