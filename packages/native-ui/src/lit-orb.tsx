import type { ReactElement } from 'react';
import { StyleSheet } from 'react-native';
import Svg, { Circle, Defs, LinearGradient as SvgGradient, RadialGradient, Stop } from 'react-native-svg';

import { Pop } from './motion';

const ORB = 30;

/**
 * The lit tab's orb (the red-glow mockup's F, held still): a graphite well with a thin
 * ring of light, crimson with two hot spots. It pops in once when the tab is reached and
 * never turns: the finish allows no loops. Shared by the customer app's HubNav and the
 * garage app's Garage Book bar.
 */
export function LitOrb({ children }: { children: ReactElement }) {
  const r = ORB / 2;
  return (
    <Pop style={styles.orb}>
      <Svg width={ORB + 8} height={ORB + 8} viewBox={`-4 -4 ${ORB + 8} ${ORB + 8}`} style={{ position: 'absolute', left: -4, top: -4 }}>
        <Defs>
          <RadialGradient id="orb-well" cx="50%" cy="30%" rx="60%" ry="60%" fx="50%" fy="30%">
            <Stop offset="0" stopColor="#2C2C31" />
            <Stop offset="0.55" stopColor="#19191C" />
            <Stop offset="1" stopColor="#0E0E10" />
          </RadialGradient>
          <SvgGradient id="orb-ring" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#7A0018" />
            <Stop offset="0.2" stopColor="#FF2A3D" />
            <Stop offset="0.3" stopColor="#FFF1EA" />
            <Stop offset="0.38" stopColor="#FF5C8A" />
            <Stop offset="0.5" stopColor="#7A0019" />
            <Stop offset="0.66" stopColor="#FF4A3A" />
            <Stop offset="0.76" stopColor="#FFF4EF" />
            <Stop offset="0.86" stopColor="#FF2D6F" />
            <Stop offset="1" stopColor="#7A0019" />
          </SvgGradient>
        </Defs>
        {/* The bloom: the same light, wider and soft. */}
        <Circle cx={r} cy={r} r={r - 1.4} fill="none" stroke="url(#orb-ring)" strokeWidth={4.5} strokeOpacity={0.35} />
        <Circle cx={r} cy={r} r={r} fill="url(#orb-well)" />
        <Circle cx={r} cy={r} r={r - 0.7} fill="none" stroke="url(#orb-ring)" strokeWidth={1.4} />
      </Svg>
      {children}
    </Pop>
  );
}


const styles = StyleSheet.create({
  orb: { width: ORB, height: ORB, alignItems: 'center', justifyContent: 'center' },
});
