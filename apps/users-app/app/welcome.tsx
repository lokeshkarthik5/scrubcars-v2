import { BrandMark } from '@repo/native-ui/primitives';
import { ScButton } from '@repo/native-ui/button';
import { T } from '@repo/native-ui/text';
import { createStyles, ThemeScope, useColors } from '@repo/native-ui/theme';
import { LinearGradient } from 'expo-linear-gradient';
import { type Href, router } from 'expo-router';
import { useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { devicePrefs } from '@/lib/device-prefs';

const SLIDES = [
  { title: 'Pristine Care for\nYour Machine', body: "Access the region's top rated auto spas. On-demand reservations, real-time queues, and premium detailing." },
  { title: 'Book a Slot in\nSeconds', body: 'Pick a garage, choose your services, and lock a time that fits your day. No calls, no waiting.' },
  { title: 'At the Garage or\nAt Your Door', body: 'Drop in to a detailing bay or have a detailer come to you. Track every booking end to end.' },
];

function Slides() {
  const colors = useColors();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const [slide, setSlide] = useState(0);
  const active = SLIDES[slide];
  const isLast = slide === SLIDES.length - 1;
  const next = () => {
    if (!isLast) {
      setSlide((s) => s + 1);
      return;
    }
    // Once on this phone (the web has no seen-flag; a phone opens the same way every time).
    devicePrefs.setItem('detlio.welcomeSeen', '1');
    router.replace('/garages' as Href);
  };
  return (
    <View style={styles.page}>
      <Image source={require('@/assets/images/onboarding-car.jpg')} accessibilityIgnoresInvertColors resizeMode="cover" style={StyleSheet.absoluteFill} />
      <LinearGradient colors={['rgba(10,10,11,0.2)', 'rgba(10,10,11,0.55)', '#0A0A0B']} locations={[0, 0.5, 0.82]} style={StyleSheet.absoluteFill} />
      <View style={[styles.top, { paddingTop: insets.top + 16 }]}>
        <BrandMark height={44} />
      </View>
      <View style={[styles.bottom, { paddingBottom: insets.bottom + 24 }]}>
        <T size={32} weight={600} lh={38} tracking={-0.02}>
          {active.title}
        </T>
        <T size={15} lh={22} color={colors.textSecondary}>
          {active.body}
        </T>
        <View style={styles.dots}>
          {SLIDES.map((s, i) => (
            <Pressable key={s.title} accessibilityRole="button" accessibilityLabel={`Go to slide ${i + 1}`} hitSlop={14} onPress={() => setSlide(i)}>
              <View style={[styles.dot, i === slide ? styles.dotOn : styles.dotOff]} />
            </Pressable>
          ))}
        </View>
        <ScButton variant="main" onPress={next}>
          {isLast ? 'Get Started' : 'Next'}
        </ScButton>
      </View>
    </View>
  );
}

/** apps/users/app/welcome/page.tsx: always dark, like sign-in. */
export default function WelcomeScreen() {
  return (
    <ThemeScope scheme="dark">
      <Slides />
    </ThemeScope>
  );
}

const useStyles = createStyles((c) => ({
  page: { flex: 1, backgroundColor: c.canvas },
  top: { alignItems: 'center' },
  bottom: { marginTop: 'auto', gap: 14, paddingHorizontal: 24 },
  dots: { flexDirection: 'row', gap: 6, marginVertical: 8 },
  dot: { height: 4, borderRadius: 2 },
  dotOn: { width: 24, backgroundColor: c.textPrimary },
  dotOff: { width: 6, backgroundColor: c.textMuted },
}));
