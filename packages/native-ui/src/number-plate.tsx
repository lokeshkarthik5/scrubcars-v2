import { T } from './text';
import { StyleSheet, View } from 'react-native';

/**
 * A car's plate drawn like an Indian number plate (moment 8; the website's
 * packages/ui/src/finish/number-plate.tsx): white, a black edge, the blue IND band.
 * `text` is the plate already laid out by core's formatIndianPlate ("TN 07 CD 9036"),
 * which each app calls (this package has no core dependency). Read as the plate
 * itself. The same in both themes, as a real plate is. `sm` sits inside a car tile or
 * a list row; `md` is a Garage Book customer's; `lg` fills Profile's car card (22 Nov 2026).
 */
export function PlateDrawing({ text, size = 'md' }: { text: string; size?: 'sm' | 'md' | 'lg' }) {
  const sm = size === 'sm';
  const lg = size === 'lg';
  return (
    <View
      accessible
      accessibilityLabel={text}
      style={[styles.plate, sm ? styles.plateSm : lg ? styles.plateLg : styles.plateMd]}
    >
      <View style={[styles.band, sm ? styles.bandSm : lg ? styles.bandLg : styles.bandMd]}>
        <T size={sm ? 4.5 : lg ? 10 : 7} weight={700} lh={sm ? 5 : lg ? 12 : 8} color="#FFFFFF">
          IND
        </T>
      </View>
      <T
        num
        size={sm ? 11 : lg ? 28 : 19}
        weight={700}
        lh={sm ? 14 : lg ? 34 : 24}
        tracking={lg ? 0.08 : 0.04}
        numberOfLines={1}
        adjustsFontSizeToFit={lg}
        color="#111111"
        style={sm ? styles.textSm : lg ? styles.textLg : styles.textMd}
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
  plateLg: { height: 60, borderRadius: 10, alignSelf: 'stretch', borderWidth: 2 },
  band: { alignItems: 'center', justifyContent: 'flex-end', backgroundColor: '#1D4FB8' },
  bandSm: { width: 12, paddingBottom: 2 },
  bandMd: { width: 20, paddingBottom: 4 },
  bandLg: { width: 32, paddingBottom: 8 },
  textSm: { alignSelf: 'center', paddingHorizontal: 6, flexShrink: 1 },
  textMd: { alignSelf: 'center', paddingHorizontal: 10, flexShrink: 1 },
  textLg: { alignSelf: 'center', flex: 1, paddingHorizontal: 12, textAlign: 'center' },
});
