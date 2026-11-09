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
  /** A faint amber wash: the support-session banner's fill. */
  warningWash: string;
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
  /** A pending badge's outline (the web's border-white/20). */
  outlineSoft: string;
  /** A chosen option's outline (the web's border-text-primary/60). */
  outlineChosen: string;
  /** The "starts in 40 min" pill on a job row (border-white/25). */
  outlineChip: string;
  /** A garage's amber outline, a red strip, a blue outline, a green outline: borders of a status card. */
  warningBorder: string;
  redBorder: string;
  redWash: string;
  progressBorder: string;
  successBorder: string;
  /** The answer-deadline banner when time is short. */
  warningSoft: string;
  /** The empty part of a progress bar. */
  track: string;
  /** Surface at 90%: a caption laid over a map. */
  surfaceVeil: string;
  avatarFrom: string;
  avatarTo: string;
  /** The car's stage on Home. */
  stage: readonly [string, string, string];
  stageGlow: string;
  stageContact: string;
  meterOn: string;
  meterOff: string;
  /** bg-white/[0.02], [0.03], [0.04]: a choice's resting and chosen fill. */
  fillFaint: string;
  fillSoft: string;
  fillChosen: string;
  /** A garage's yes: the accepted request's card. */
  acceptedBg: string;
  acceptedBorder: string;
  /** A request waiting for the garage's answer: the card's amber edge. */
  waitingBorder: string;
  /** The reach sketch on a request: the cover circle's edge, the line to the customer, its labels. */
  reachStroke: string;
  reachLine: string;
  reachLabel: string;
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
  fillFaint: 'rgba(255,255,255,0.02)',
  fillSoft: 'rgba(255,255,255,0.03)',
  fillChosen: 'rgba(255,255,255,0.04)',
  acceptedBg: '#0E2418',
  acceptedBorder: '#1F5A3A',
  waitingBorder: 'rgba(245,165,36,0.4)',
  reachStroke: 'rgba(34,197,94,0.6)',
  reachLine: 'rgba(255,255,255,0.45)',
  reachLabel: '#9CA3AF',
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
  warningWash: 'rgba(245,165,36,0.036)',
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
  outlineSoft: 'rgba(255,255,255,0.2)',
  outlineChosen: 'rgba(250,250,250,0.6)',
  outlineChip: 'rgba(255,255,255,0.25)',
  warningBorder: 'rgba(245,165,36,0.4)',
  redBorder: 'rgba(239,50,64,0.4)',
  redWash: 'rgba(239,50,64,0.1)',
  progressBorder: 'rgba(59,130,246,0.6)',
  successBorder: 'rgba(34,197,94,0.4)',
  warningSoft: 'rgba(245,165,36,0.15)',
  track: '#141416',
  surfaceVeil: 'rgba(20,20,22,0.9)',
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
  fillFaint: 'rgba(0,0,0,0.015)',
  fillSoft: 'rgba(0,0,0,0.02)',
  fillChosen: 'rgba(0,0,0,0.04)',
  acceptedBg: '#EFF9F2',
  acceptedBorder: '#A7DDB9',
  waitingBorder: 'rgba(217,138,0,0.45)',
  reachStroke: 'rgba(22,163,74,0.6)',
  reachLine: 'rgba(10,10,11,0.4)',
  reachLabel: '#62626A',
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
  warningWash: 'rgba(217,138,0,0.08)',
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
  outlineSoft: 'rgba(10,10,11,0.2)',
  outlineChosen: 'rgba(11,11,13,0.6)',
  outlineChip: 'rgba(10,10,11,0.2)',
  warningBorder: 'rgba(217,138,0,0.5)',
  redBorder: 'rgba(228,0,43,0.3)',
  redWash: 'rgba(228,0,43,0.06)',
  progressBorder: 'rgba(37,99,235,0.5)',
  successBorder: 'rgba(34,197,94,0.4)',
  warningSoft: 'rgba(245,165,36,0.18)',
  track: '#E6E6EA',
  surfaceVeil: 'rgba(255,255,255,0.9)',
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

// ─── The finish (customer UI round, Nov 2026) ────────────────────────────────

/**
 * The finish's materials (docs/ui-round-2026-11.md §1), as the customer website
 * draws them in packages/ui/styles/finish.css. Dark is that file, value for value.
 * Light keeps the same structure from the light table above, never a new look:
 * fills are its surfaces, edges its hairlines, the pearl its chosen fill. The
 * garage app never reads these (the finish is switched on per app, ThemeProvider).
 */
export interface FinishTokens {
  /** A big surface (cards, the map card): its fill top to bottom, and its edge, lit from above. */
  edgeFill: readonly [string, string];
  edgeRim: readonly [string, string, string];
  /** Something you press: lighter, with a soft shadow. */
  raisedFill: readonly [string, string];
  raisedRim: readonly [string, string];
  /** Something you type into, and a switch's track: pressed into the screen. */
  recessedFill: readonly [string, string];
  recessedRim: readonly [string, string];
  /** How dark the shadow under a raised or edged thing is. */
  shadowOpacity: number;
  /** Glass: the blur's tint, its wash over the blur, the panel's own colour under it, its edge. */
  glassTint: 'dark' | 'light';
  glassWash: readonly [string, string];
  glassBase: string;
  /** The heavier glass of a sheet, so its text reads over a busy list. */
  glassSheet: string;
  glassEdge: string;
  /** The bar pinned over a scrolling list. */
  glassPinned: string;
  /** Pearl white (the chosen tile, the ↗ on a card, the + in the bar): its radial stops and its ink. */
  pearl: readonly [string, string, string];
  pearlInk: string;
  /** The brushed graphite key of the mode switch, and the words on it. */
  graphite: readonly [string, string, string];
  graphiteInk: string;
  /** Brushed silver: the Silver+ key when on. */
  silver: readonly [string, string, string, string, string, string];
  silverInk: string;
  silverQuiet: string;
  /** The quiet second line of a control and a card's captions (#8E8E98). */
  quiet: string;
  /** Captions a step brighter (#A8A8B2), and the lines under a figure (#D8D8DE). */
  quietBright: string;
  soft: string;
  /** A hairline between rows inside a card (white/7). */
  hairline: string;
  /** The faint red glow at the top of a screen; none in light, where the web's screen blend adds nothing. */
  topGlow: string | null;
  /** A photo's shade, under the words laid on it. Photos keep dark shades in both themes. */
  photoShade: readonly [string, string, string];
}

export const darkFinish: FinishTokens = {
  edgeFill: ['#17171B', '#111114'],
  edgeRim: ['rgba(255,255,255,0.2)', 'rgba(255,255,255,0.04)', 'rgba(255,255,255,0.08)'],
  raisedFill: ['#1C1C21', '#121216'],
  raisedRim: ['rgba(255,255,255,0.16)', 'rgba(255,255,255,0.03)'],
  recessedFill: ['#0B0B0E', '#121216'],
  recessedRim: ['rgba(0,0,0,0.7)', 'rgba(255,255,255,0.11)'],
  shadowOpacity: 0.9,
  glassTint: 'dark',
  glassWash: ['rgba(255,255,255,0.12)', 'rgba(255,255,255,0.03)'],
  glassBase: 'rgba(18,18,22,0.55)',
  glassSheet: 'rgba(16,16,20,0.88)',
  glassEdge: 'rgba(255,255,255,0.14)',
  glassPinned: 'rgba(12,12,14,0.72)',
  pearl: ['#FFFFFF', '#F1F1F3', '#D3D3D9'],
  pearlInk: '#0A0A0B',
  graphite: ['#383840', '#26262D', '#1D1D23'],
  graphiteInk: '#FAFAFA',
  silver: ['#F6F7FA', '#C4C8D1', '#EEF0F4', '#A9AEBB', '#E2E4EA', '#9AA0AD'],
  silverInk: '#0A0A0B',
  silverQuiet: '#4A4E58',
  quiet: '#8E8E98',
  quietBright: '#A8A8B2',
  soft: '#D8D8DE',
  hairline: 'rgba(255,255,255,0.07)',
  topGlow: 'rgba(228,0,43,0.09)',
  photoShade: ['rgba(0,0,0,0.28)', 'rgba(10,10,12,0)', 'rgba(10,10,12,0.94)'],
};

export const lightFinish: FinishTokens = {
  edgeFill: [lightTokens.surface, lightTokens.surface],
  edgeRim: [lightTokens.border, lightTokens.line, lightTokens.border],
  raisedFill: [lightTokens.stage[0], lightTokens.stage[1]],
  raisedRim: [lightTokens.border, lightTokens.stroke],
  recessedFill: [lightTokens.track, lightTokens.surfaceElevated],
  recessedRim: [lightTokens.stroke, lightTokens.surface],
  shadowOpacity: 0.12,
  glassTint: 'light',
  glassWash: ['rgba(255,255,255,0.5)', 'rgba(255,255,255,0.2)'],
  glassBase: 'rgba(255,255,255,0.62)',
  glassSheet: 'rgba(247,247,248,0.9)',
  glassEdge: lightTokens.navBorder,
  glassPinned: 'rgba(247,247,248,0.82)',
  // The light theme's chosen fill is its dark one (chosenBg), so the pearl is too.
  pearl: [lightTokens.chosenBg, lightTokens.chosenBg, '#26262D'],
  pearlInk: lightTokens.chosenText,
  graphite: [lightTokens.surface, lightTokens.surface, lightTokens.stage[1]],
  graphiteInk: lightTokens.textPrimary,
  silver: darkFinish.silver,
  silverInk: darkFinish.silverInk,
  silverQuiet: darkFinish.silverQuiet,
  quiet: lightTokens.textMuted,
  quietBright: lightTokens.textSecondary,
  soft: lightTokens.textSecondary,
  hairline: lightTokens.line,
  topGlow: null,
  photoShade: darkFinish.photoShade,
};

export const finishFor = (scheme: Scheme): FinishTokens => (scheme === 'light' ? lightFinish : darkFinish);

/** The red light: a small glowing bar under the chosen thing. The same in both themes. */
export const RED_LIGHT = '#FF2D4A';

/**
 * The solid red button, the booking or payment action's only: top to bottom,
 * as the web's .finish --gradient-cta (180deg, #ff3550 → #e4002b at 55% → #c10025).
 */
export const redButtonGradient = {
  colors: ['#FF3550', '#E4002B', '#C10025'] as const,
  locations: [0, 0.55, 1] as const,
  start: { x: 0.5, y: 0 },
  end: { x: 0.5, y: 1 },
};

/** The finish's one line weight for icons, in screen points, whatever the icon's size. The lit tab draws 1.9. */
export const ICON_LINE = 1.6;

/** The press: a springy dip to 0.96 and back. */
export const FINISH_PRESSED_SCALE = 0.96;
