import { Text, type TextProps, type TextStyle } from 'react-native';

import { colors } from '@/lib/theme';

export type Weight = 400 | 500 | 600 | 700;

const INTER: Record<Weight, string> = {
  400: 'Inter_400Regular',
  500: 'Inter_500Medium',
  600: 'Inter_600SemiBold',
  700: 'Inter_700Bold',
};
const NUMERIC: Record<Weight, string> = {
  400: 'SpaceGrotesk_400Regular',
  500: 'SpaceGrotesk_500Medium',
  600: 'SpaceGrotesk_600SemiBold',
  700: 'SpaceGrotesk_700Bold',
};

export function font(weight: Weight = 400, numeric = false): string {
  return (numeric ? NUMERIC : INTER)[weight];
}

interface TProps extends TextProps {
  size?: number;
  weight?: Weight;
  color?: string;
  /** The web's `font-numeric`: Space Grotesk, the brand's face for figures. */
  num?: boolean;
  /** Line height in px. Default 1.5 × size, the web's body line height. */
  lh?: number;
  /** Letter spacing in em, as Tailwind's tracking: tight is -0.025, wide is 0.025. */
  tracking?: number;
  align?: TextStyle['textAlign'];
  uppercase?: boolean;
}

/** All text in the app. Sizes and weights are read off the web component it copies. */
export function T({
  size = 15,
  weight = 400,
  color = colors.textPrimary,
  num,
  lh,
  tracking,
  align,
  uppercase,
  style,
  ...props
}: TProps) {
  return (
    <Text
      style={[
        {
          fontFamily: font(weight, num),
          fontSize: size,
          lineHeight: lh ?? Math.round(size * 1.5),
          color,
          ...(tracking !== undefined ? { letterSpacing: tracking * size } : {}),
          ...(align ? { textAlign: align } : {}),
          ...(uppercase ? { textTransform: 'uppercase' as const } : {}),
        },
        style,
      ]}
      {...props}
    />
  );
}
