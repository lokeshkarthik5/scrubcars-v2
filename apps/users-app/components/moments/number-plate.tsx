import { formatIndianPlate } from '@repo/core/moments';
import { T } from '@repo/native-ui/text';
import { StyleSheet, View } from 'react-native';

/**
 * A car's plate drawn like an Indian number plate (moment 8; the website's
 * components/moments/number-plate.tsx): white, a black edge, the blue IND band, the
 * characters in their usual groups ("TN 07 CD 9036", core's formatIndianPlate). Read as
 * the plate itself. The same in both themes, as a real plate is. `sm` sits inside a
 * booking's car tile; `md` is Profile's.
 */
export function NumberPlate({ plate, size = 'md' }: { plate: string; size?: 'sm' | 'md' }) {
  const text = formatIndianPlate(plate);
  const sm = size === 'sm';
  return (
    <View accessible accessibilityLabel={text} style={[styles.plate, sm ? styles.plateSm : styles.plateMd]}>
      <View style={[styles.band, sm ? styles.bandSm : styles.bandMd]}>
        <T size={sm ? 4.5 : 7} weight={700} lh={sm ? 5 : 8} color="#FFFFFF">
          IND
        </T>
      </View>
      <T
        num
        size={sm ? 11 : 19}
        weight={700}
        lh={sm ? 14 : 24}
        tracking={0.04}
        numberOfLines={1}
        color="#111111"
        style={sm ? styles.textSm : styles.textMd}
      >
        {text}
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  plate: {
    flexDirection: 'row',
    alignItems: 'stretch',
    alignSelf: 'flex-start',
    maxWidth: '100%',
    overflow: 'hidden',
    backgroundColor: '#F4F4F2',
    borderWidth: 1.5,
    borderColor: '#111111',
  },
  plateSm: { height: 20, borderRadius: 4 },
  plateMd: { height: 34, borderRadius: 6 },
  band: { alignItems: 'center', justifyContent: 'flex-end', backgroundColor: '#1D4FB8' },
  bandSm: { width: 12, paddingBottom: 2 },
  bandMd: { width: 20, paddingBottom: 4 },
  textSm: { alignSelf: 'center', paddingHorizontal: 6, flexShrink: 1 },
  textMd: { alignSelf: 'center', paddingHorizontal: 10, flexShrink: 1 },
});
