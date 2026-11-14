import { useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { createStyles } from '@repo/native-ui/theme';

import { qrMatrix, qrPath } from '@/lib/garage-book-2';

/**
 * A real QR for a link (the booking page), drawn from qrcode-generator's squares as the web
 * draws it, dark on a white card so any phone's camera reads it.
 */
export function QrCode({ value, size = 112, label }: { value: string; size?: number; label: string }) {
  const styles = useStyles();
  const { d, count } = useMemo(() => {
    const matrix = qrMatrix(value);
    return { d: qrPath(matrix), count: matrix.length };
  }, [value]);
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label} style={styles.card}>
      <Svg width={size} height={size} viewBox={`0 0 ${count} ${count}`}>
        <Path d={d} fill="#111114" />
      </Svg>
    </View>
  );
}

const useStyles = createStyles(() => ({
  card: { backgroundColor: '#FFFFFF', borderRadius: 14, padding: 8, alignSelf: 'flex-start' },
}));
