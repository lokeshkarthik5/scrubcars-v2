import { Link } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

export default function NotFoundScreen() {
  return (
    <View style={styles.page}>
      <Text style={styles.title}>This screen doesn't exist.</Text>
      <Link href="/" style={styles.link}>
        Go to the start
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#0A0A0B' },
  title: { color: '#FAFAFA', fontSize: 18, fontWeight: '600' },
  link: { color: '#EF3240', fontSize: 15, marginTop: 16 },
});
