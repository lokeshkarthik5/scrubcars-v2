/** The web's tokens (packages/ui/styles/globals.css), one to one. */
export const colors = {
  brandRed: '#EF3240',
  brandRedFill: '#E4002B',
  brandBlack: '#0A0A0B',
  brandWhite: '#FAFAFA',
  surface: '#141416',
  surfaceElevated: '#272730',
  textPrimary: '#FAFAFA',
  textSecondary: '#B0B0B0',
  textMuted: '#9A9AA3',
  border: '#2E2E38',
  line: 'rgba(255,255,255,0.08)',
  success: '#22C55E',
  warning: '#F5A524',
  warningMuted: 'rgba(245,165,36,0.12)',
  error: '#F5A524',
  errorMuted: 'rgba(245,165,36,0.12)',
  info: '#3B82F6',
  white: '#FFFFFF',
} as const;

/** --gradient-cta: 100deg across a pill, so very nearly left to right. */
export const ctaGradient = {
  colors: ['#E4002B', '#DA0029', '#CA0026', '#B80022'] as const,
  locations: [0, 0.3, 0.66, 1] as const,
  start: { x: 0, y: 0.41 },
  end: { x: 1, y: 0.59 },
};

/** The six status tones (--color-tone-*). */
export const tones = {
  new: { tint: 'rgba(228,0,43,0.14)', text: '#F45A66', dot: '#EF3240' },
  progress: { tint: 'rgba(59,130,246,0.16)', text: '#6EA8FF', dot: '#3B82F6' },
  done: { tint: 'rgba(34,197,94,0.12)', text: '#22C55E', dot: '#22C55E' },
  attention: { tint: 'rgba(245,165,36,0.12)', text: '#F5A524', dot: '#F5A524' },
  late: { tint: 'rgba(255,107,87,0.13)', text: '#FF6B57', dot: '#FF6B57' },
  closed: { tint: 'rgba(255,255,255,0.07)', text: '#B0B0B0', dot: '#8A8A93' },
} as const;

/** `press`: the dip on tap, as in globals.css. */
export const PRESSED_SCALE = 0.97;
