import { Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { useT } from './lang';
import { GOOGLE_MAPS_ATTRIBUTION, GOOGLE_RATING_LABEL, SHOW_GOOGLE_G, ratingFigure } from './rating-words';
import { font } from './text';
import { useColors } from './theme';

/**
 * The two rating marks for the apps, twins of the website's
 * packages/ui/src/sc/rating-marks.tsx (Google rating for new garages,
 * 21 Nov 2026).
 *
 * - **d.** is Detlio's own rating, in place of the amber star wherever a
 *   garage's overall rating shows: a lowercase d in the wordmark's bold
 *   letters with the logo's round red dot (the theme's brand red). Each
 *   customer's own 1–5 stars stay stars.
 * - **G** is Google's rating: Google's multicolour G, always with the words
 *   "Google Maps" in the same card (GoogleMapsText).
 */

/**
 * Detlio's mark. `rating` names it for screen readers ("Detlio rating 4.8");
 * the figure beside it can then be hidden from them. `size` is the d's font
 * size; the colour is the theme's main text (white on dark, near-black on
 * light).
 */
export function DetlioMark({
  size = 15,
  rating,
  color,
  style,
}: {
  size?: number;
  rating?: number | null;
  color?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const colors = useColors();
  const t = useT();
  const label =
    rating === undefined || rating === null
      ? t('Detlio rating')
      : t('Detlio rating {rating}', { rating: ratingFigure(rating) });
  const dot = Math.round(size * 0.27 * 100) / 100;
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      style={[{ flexDirection: 'row', alignItems: 'flex-end' }, style]}
    >
      <Text
        allowFontScaling={false}
        style={{
          fontFamily: font(700),
          fontSize: size,
          lineHeight: size * 1.15,
          letterSpacing: -0.03 * size,
          color: color ?? colors.textPrimary,
          includeFontPadding: false,
        }}
      >
        d
      </Text>
      <View
        style={{
          width: dot,
          height: dot,
          borderRadius: dot / 2,
          backgroundColor: colors.red,
          marginLeft: Math.round(size * 0.07 * 100) / 100,
          // Sits on the d's baseline, as the logo's dot does.
          marginBottom: size * 0.2,
        }}
      />
    </View>
  );
}

/**
 * Google's multicolour G. Google's brand rules may need Google's permission
 * for the G; the words "Google Maps" (GoogleMapsText) are what meets
 * Google's attribution rule. SHOW_GOOGLE_G (rating-words.ts, twin of core's)
 * turns the G off in the apps; the spoken name stays.
 */
export function GoogleMark({ size = 14 }: { size?: number }) {
  const t = useT();
  if (!SHOW_GOOGLE_G) {
    return <View accessible accessibilityLabel={t(GOOGLE_RATING_LABEL)} />;
  }
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={t(GOOGLE_RATING_LABEL)}>
      <Svg width={size} height={size} viewBox="0 0 48 48">
        <Path
          fill="#FFC107"
          d="M43.6 20.1H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z"
        />
        <Path
          fill="#FF3D00"
          d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
        />
        <Path
          fill="#4CAF50"
          d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2c-2 1.5-4.5 2.4-7.2 2.4-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"
        />
        <Path
          fill="#1976D2"
          d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z"
        />
      </Svg>
    </View>
  );
}

/**
 * Google's attribution, with every Google rating in the same card: the
 * words "Google Maps", exactly, never translated, shortened or wrapped, in
 * the phone's own plain sans (Roboto on Android), 12pt; the theme's main
 * text colour (white on dark, as Google asks, near-black on light).
 */
export function GoogleMapsText({ size = 12, color }: { size?: number; color?: string }) {
  const colors = useColors();
  return (
    <Text
      maxFontSizeMultiplier={1.4}
      style={{ fontSize: Math.max(12, size), fontWeight: '400', color: color ?? colors.textPrimary, flexShrink: 0 }}
    >
      {GOOGLE_MAPS_ATTRIBUTION}
    </Text>
  );
}
