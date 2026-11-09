import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import { IconArrowLeft } from './icons';
import { BrandMark } from './primitives';
import { T } from './text';
import { ThemeScope, useColors } from './theme';
import { useT } from './lang';

/** A round glow: bg-[radial-gradient(closest-side,rgb(239 50 64/x),transparent)]. */
function Glow({ size, opacity, id, style }: { size: number; opacity: number; id: string; style: object }) {
  return (
    <View style={[styles.layer, { width: size, height: size }, style]} pointerEvents="none">
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id={id} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor="#EF3240" stopOpacity={opacity} />
            <Stop offset="1" stopColor="#EF3240" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width={size} height={size} fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

/**
 * AuthStage (packages/ui/src/auth/auth-stage.tsx): the spotlit car full-width at
 * the bottom, a dark wash, a low red glow, and the frosted-glass card. The photo is
 * dark by nature, so the stage is dark in both themes (the owner's Option 1): it
 * scopes itself, and everything inside draws dark. The app's one status bar (its root
 * layout) goes light on these screens.
 */
export function AuthStage({
  onBack,
  children,
  footer,
}: {
  onBack?: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <ThemeScope scheme="dark">
      <Stage onBack={onBack} footer={footer}>
        {children}
      </Stage>
    </ThemeScope>
  );
}

function Stage({
  onBack,
  children,
  footer,
}: {
  onBack?: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const t = useT();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const carWidth = width * 1.3;

  return (
    <View style={styles.page}>
      <Image
        source={require('../assets/onboarding-car.jpg')}
        resizeMode="cover"
        style={[
          styles.layer,
          { bottom: 0, left: (width - carWidth) / 2, width: carWidth, height: (carWidth * 910) / 1170 },
        ]}
      />
      <LinearGradient
        pointerEvents="none"
        colors={['#0a0a0b', 'rgba(10,10,11,0.55)', 'rgba(10,10,11,0.15)', 'rgba(10,10,11,0.7)']}
        locations={[0, 0.45, 0.75, 1]}
        style={StyleSheet.absoluteFill}
      />
      <Glow id="glowTop" size={440} opacity={0.28} style={{ right: -128, top: 40 }} />
      <Glow id="glowLow" size={380} opacity={0.14} style={{ left: -160, bottom: 192 }} />

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.fill}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[styles.column, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}
        >
          <View style={styles.topBar}>
            {onBack ? (
              <Pressable accessibilityRole="button" accessibilityLabel={t('Go back')} onPress={onBack} style={styles.back}>
                <IconArrowLeft size={22} stroke={1.5} />
              </Pressable>
            ) : null}
          </View>
          <View style={styles.middle}>
            <View style={styles.cardShadow}>
              <View style={styles.card}>
                <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
                <View style={[StyleSheet.absoluteFill, styles.cardTint]} />
                <LinearGradient
                  pointerEvents="none"
                  colors={['transparent', 'rgba(255,255,255,0.4)', 'transparent']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.cardEdge}
                />
                {children}
              </View>
            </View>
          </View>
          {footer}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

/** AuthHeading. */
export function AuthHeading({ title, subtitle }: { title: string; subtitle: string }) {
  const colors = useColors();
  return (
    <View style={styles.heading}>
      <BrandMark height={36} />
      <T accessibilityRole="header" size={28} weight={700} lh={36} tracking={-0.02} align="center" style={styles.title}>
        {title}
      </T>
      <T size={16} lh={24} color={colors.textSecondary} align="center" style={styles.subtitle}>
        {subtitle}
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#0A0A0B', overflow: 'hidden' },
  fill: { flex: 1 },
  layer: { position: 'absolute' },
  column: { flexGrow: 1, paddingHorizontal: 16 },
  topBar: { minHeight: 46, justifyContent: 'center' },
  back: { width: 44, height: 44, marginLeft: -11, alignItems: 'center', justifyContent: 'center' },
  middle: { flex: 1, justifyContent: 'center', paddingVertical: 24 },
  cardShadow: {
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 30 },
    shadowOpacity: 0.9,
    shadowRadius: 40,
  },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden',
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 28,
  },
  cardTint: { backgroundColor: 'rgba(20,20,22,0.55)' },
  cardEdge: { position: 'absolute', left: 32, right: 32, top: 0, height: 1 },
  heading: { alignItems: 'center' },
  title: { marginTop: 24 },
  // The web's text-balance: two even lines.
  subtitle: { marginTop: 8, maxWidth: 240 },
});
