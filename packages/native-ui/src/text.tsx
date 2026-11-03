import { Text, type TextProps, type TextStyle } from 'react-native';

import { useColors } from './theme';

export type Weight = 300 | 400 | 500 | 600 | 700;

const INTER: Record<Weight, string> = {
  300: 'Inter_300Light',
  400: 'Inter_400Regular',
  500: 'Inter_500Medium',
  600: 'Inter_600SemiBold',
  700: 'Inter_700Bold',
};
const NUMERIC: Record<Weight, string> = {
  300: 'SpaceGrotesk_300Light',
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
  color,
  num,
  lh,
  tracking,
  align,
  uppercase,
  style,
  ...props
}: TProps) {
  const colors = useColors();
  return (
    <Text
      style={[
        {
          fontFamily: font(weight, num),
          fontSize: size,
          lineHeight: lh ?? Math.round(size * 1.5),
          color: color ?? colors.textPrimary,
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

const FIGURES = /(₹?\d[\d,.]*(?:\s?[–-]\s?₹?\d[\d,.]*)?)/;

/**
 * Figures (packages/ui/src/sc/figures.tsx): a label whose figures set in the brand's
 * numeric face while its words stay in Inter. Inside a T, it inherits the rest.
 */
export function Figures({ text, weight, size, color, lh }: { text: string; weight?: Weight; size: number; color?: string; lh?: number }) {
  return (
    <>
      {text.split(FIGURES).map((part, index) =>
        index % 2 === 1 ? (
          <T key={index} num size={size} weight={weight ?? 400} color={color} lh={lh}>
            {part}
          </T>
        ) : (
          part
        )
      )}
    </>
  );
}

/** Figures on a line of its own: its own T, so it can stand anywhere. */
export function FigureLine({ text, weight, size, color, lh }: { text: string; weight?: Weight; size: number; color?: string; lh?: number }) {
  return (
    <T size={size} weight={weight} color={color} lh={lh}>
      <Figures text={text} size={size} weight={weight} color={color} lh={lh} />
    </T>
  );
}
