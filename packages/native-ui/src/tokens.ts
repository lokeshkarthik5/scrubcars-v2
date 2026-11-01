/**
 * The apps' colours, with no hard-coded colour anywhere else in a screen.
 *
 * Dark is the web's (packages/ui/styles/globals.css), one to one. Light is the
 * owner's approved white theme (reference/mockups/white-theme): the ratios it was
 * approved on are checked in tokens.test.ts. Fills stay bright; only text darkens.
 */
export type Scheme = 'dark' | 'light';

export interface Tone {
  tint: string;
  text: string;
  dot: string;
}

export interface Tokens {
  scheme: Scheme;
  canvas: string;
  surface: string;
  surfaceElevated: string;
  cardTop: string;
  cardBottom: string;
  /** Hairline on a card (--color-line). */
  line: string;
  border: string;
  /** Outline buttons (--color-stroke). */
  stroke: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  /** --color-dim: labels on Home's cards. */
  dim: string;
  /** The web's #A1A1AA body on a hub card. */
  textSoft: string;
  /** The web's #E4E4E7: a read update's title. */
  textRead: string;
  red: string;
  redFill: string;
  redText: string;
  white: string;
  success: string;
  successMuted: string;
  successFill: string;
  warning: string;
  warningMuted: string;
  warningFill: string;
  error: string;
  errorMuted: string;
  info: string;
  /** Selected things are never red: a solid chip in the text's colour. */
  chosenBg: string;
  chosenText: string;
  navBg: string;
  navBorder: string;
  navShadowOpacity: number;
  plusBg: string;
  plusText: string;
  scrim: string;
  scrimClear: string;
  /** A soft disc behind an icon on a card. */
  disc: string;
  discStrong: string;
  outlineStrong: string;
  avatarFrom: string;
  avatarTo: string;
  /** The car's stage on Home. */
  stage: readonly [string, string, string];
  stageGlow: string;
  stageContact: string;
  meterOn: string;
  meterOff: string;
  /** The map. */
  pinBg: string;
  pinText: string;
  meDot: string;
  meHalo: string;
  /** Over the blurred copy of the photo on the map card. */
  photoWash: string;
  skipBg: string;
  skipBorder: string;
  skipKicker: string;
  collectBg: string;
  collectText: string;
  bars: string;
  /** The "Skeleton" pulse. */
  skeleton: string;
  sheetBackdrop: string;
  keyboard: 'dark' | 'light';
  statusBar: 'light' | 'dark';
  tones: Record<'new' | 'progress' | 'done' | 'attention' | 'late' | 'closed', Tone>;
}

export const darkTokens: Tokens = {
  scheme: 'dark',
  canvas: '#0A0A0B',
  surface: '#141416',
  surfaceElevated: '#272730',
  cardTop: '#1A1A1E',
  cardBottom: '#141417',
  line: 'rgba(255,255,255,0.08)',
  border: '#2E2E38',
  stroke: '#2A2A2E',
  textPrimary: '#FAFAFA',
  textSecondary: '#B0B0B0',
  textMuted: '#9A9AA3',
  dim: '#8A8A93',
  textSoft: '#A1A1AA',
  textRead: '#E4E4E7',
  red: '#EF3240',
  redFill: '#E4002B',
  redText: '#F45A66',
  white: '#FFFFFF',
  success: '#22C55E',
  successMuted: 'rgba(34,197,94,0.12)',
  successFill: '#22C55E',
  warning: '#F5A524',
  warningMuted: 'rgba(245,165,36,0.12)',
  warningFill: '#F5A524',
  error: '#F5A524',
  errorMuted: 'rgba(245,165,36,0.12)',
  info: '#3B82F6',
  chosenBg: '#FAFAFA',
  chosenText: '#0A0A0B',
  navBg: '#18181B',
  navBorder: 'rgba(255,255,255,0.08)',
  navShadowOpacity: 0.7,
  plusBg: '#F5F5F6',
  plusText: '#0A0A0B',
  scrim: 'rgba(10,10,11,1)',
  scrimClear: 'rgba(10,10,11,0)',
  disc: 'rgba(255,255,255,0.06)',
  discStrong: 'rgba(255,255,255,0.08)',
  outlineStrong: 'rgba(250,250,250,0.4)',
  avatarFrom: '#2E2E34',
  avatarTo: '#1C1C20',
  stage: ['#1E1F24', '#131418', '#0C0D10'],
  stageGlow: 'rgb(200,210,235)',
  stageContact: '#000000',
  meterOn: '#F5F5F6',
  meterOff: 'rgba(255,255,255,0.14)',
  pinBg: '#FAFAFA',
  pinText: '#0A0A0B',
  meDot: '#FAFAFA',
  meHalo: 'rgba(250,250,250,0.18)',
  photoWash: 'rgba(0,0,0,0.35)',
  skipBg: '#0E1A2E',
  skipBorder: '#2B4A7A',
  skipKicker: '#8FB4F0',
  collectBg: '#13233D',
  collectText: '#8FB4F0',
  bars: '#1C1C20',
  skeleton: '#272730',
  sheetBackdrop: 'rgba(0,0,0,0.5)',
  keyboard: 'dark',
  statusBar: 'light',
  tones: {
    new: { tint: 'rgba(228,0,43,0.14)', text: '#F45A66', dot: '#EF3240' },
    progress: { tint: 'rgba(59,130,246,0.16)', text: '#6EA8FF', dot: '#3B82F6' },
    done: { tint: 'rgba(34,197,94,0.12)', text: '#22C55E', dot: '#22C55E' },
    attention: { tint: 'rgba(245,165,36,0.12)', text: '#F5A524', dot: '#F5A524' },
    late: { tint: 'rgba(255,107,87,0.13)', text: '#FF6B57', dot: '#FF6B57' },
    closed: { tint: 'rgba(255,255,255,0.07)', text: '#B0B0B0', dot: '#8A8A93' },
  },
};

export const lightTokens: Tokens = {
  scheme: 'light',
  canvas: '#F7F7F8',
  surface: '#FFFFFF',
  surfaceElevated: '#EDEDF0',
  cardTop: '#FFFFFF',
  cardBottom: '#FFFFFF',
  line: 'rgba(10,10,11,0.09)',
  border: '#E2E2E7',
  stroke: '#D2D2D9',
  textPrimary: '#0B0B0D',
  textSecondary: '#4A4A52',
  textMuted: '#62626A',
  dim: '#62626A',
  textSoft: '#4A4A52',
  textRead: '#0B0B0D',
  red: '#E4002B',
  redFill: '#E4002B',
  redText: '#C4002A',
  white: '#FFFFFF',
  success: '#11703A',
  successMuted: 'rgba(34,197,94,0.14)',
  successFill: '#16A34A',
  warning: '#7F4C00',
  warningMuted: 'rgba(217,138,0,0.18)',
  warningFill: '#D98A00',
  error: '#7F4C00',
  errorMuted: 'rgba(217,138,0,0.18)',
  info: '#1D4FD7',
  chosenBg: '#0B0B0D',
  chosenText: '#F7F7F8',
  navBg: '#FFFFFF',
  navBorder: '#D2D2D9',
  navShadowOpacity: 0.22,
  plusBg: '#0B0B0D',
  plusText: '#FFFFFF',
  scrim: 'rgba(247,247,248,1)',
  scrimClear: 'rgba(247,247,248,0)',
  disc: 'rgba(10,10,11,0.05)',
  discStrong: 'rgba(10,10,11,0.07)',
  outlineStrong: 'rgba(11,11,13,0.4)',
  avatarFrom: '#EDEDF0',
  avatarTo: '#E0E0E5',
  stage: ['#FFFFFF', '#F4F4F6', '#E6E6EA'],
  stageGlow: 'rgb(10,10,11)',
  stageContact: '#0A0A0B',
  meterOn: '#0B0B0D',
  meterOff: 'rgba(10,10,11,0.1)',
  pinBg: '#FFFFFF',
  pinText: '#0B0B0D',
  meDot: '#2563EB',
  meHalo: 'rgba(37,99,235,0.14)',
  photoWash: 'rgba(255,255,255,0.35)',
  skipBg: '#EEF4FF',
  skipBorder: '#BBD0F5',
  skipKicker: '#1D4FD7',
  collectBg: 'rgba(59,130,246,0.12)',
  collectText: '#1D4FD7',
  bars: '#E6E6EA',
  skeleton: '#E6E6EA',
  sheetBackdrop: 'rgba(10,10,11,0.35)',
  keyboard: 'light',
  statusBar: 'dark',
  tones: {
    new: { tint: 'rgba(228,0,43,0.10)', text: '#C4002A', dot: '#E4002B' },
    progress: { tint: 'rgba(37,99,235,0.12)', text: '#1D4FD7', dot: '#2563EB' },
    done: { tint: 'rgba(22,163,74,0.14)', text: '#11703A', dot: '#16A34A' },
    attention: { tint: 'rgba(217,138,0,0.18)', text: '#7F4C00', dot: '#D98A00' },
    late: { tint: 'rgba(229,83,61,0.16)', text: '#A8341B', dot: '#E5533D' },
    closed: { tint: 'rgba(122,122,131,0.06)', text: '#4A4A52', dot: '#7A7A83' },
  },
};

/** --gradient-cta: 100deg across a pill, so very nearly left to right. Both themes. */
export const ctaGradient = {
  colors: ['#E4002B', '#DA0029', '#CA0026', '#B80022'] as const,
  locations: [0, 0.3, 0.66, 1] as const,
  start: { x: 0, y: 0.41 },
  end: { x: 1, y: 0.59 },
};

/** `press`: the dip on tap, as in globals.css. */
export const PRESSED_SCALE = 0.97;

export type Appearance = 'system' | 'light' | 'dark';

export const APPEARANCES: readonly Appearance[] = ['system', 'light', 'dark'];

/** The owner's decision: everyone starts on Dark. */
export const DEFAULT_APPEARANCE: Appearance = 'dark';

/** A stored value, read back: anything odd is the default. */
export function parseAppearance(stored: string | null | undefined): Appearance {
  return stored === 'system' || stored === 'light' || stored === 'dark' ? stored : DEFAULT_APPEARANCE;
}

/** Which theme to draw. A phone that can't say what it's set to gets Dark. */
export function resolveScheme(appearance: Appearance, phone: string | null | undefined): Scheme {
  if (appearance !== 'system') return appearance;
  return phone === 'light' ? 'light' : 'dark';
}

export const tokensFor = (scheme: Scheme): Tokens => (scheme === 'light' ? lightTokens : darkTokens);
