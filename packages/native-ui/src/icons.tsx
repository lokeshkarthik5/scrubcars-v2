import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { useColors, useFinish } from './theme';
import { ICON_LINE } from './tokens';

/**
 * The web's Tabler icons, the same drawings (from @tabler/icons-react 3.46.0, MIT).
 * Only the ones the apps use, because Metro does not tree-shake: the icon package
 * would put all 5,000 in the bundle. To add one, copy its __iconNode from
 * node_modules/@tabler/icons-react/dist/esm/icons/Icon<Name>.mjs.
 */
export interface IconProps {
  size?: number;
  stroke?: number;
  /** Left out, it is the theme's main text colour. */
  color?: string;
  /**
   * Under the finish, the line in screen points whatever the size (1.6, the lit
   * tab's 1.9), as the website's non-scaling stroke; `stroke` is then ignored.
   * Given outside the finish (the garage app's floating bar, whose web twin sets
   * its own line), it is that line all the same.
   */
  line?: number;
  /** The bottom bar's brushed metal (#hub-metal): white at the top to grey below. */
  metal?: boolean;
}

type Node =
  | ['path', { d: string }]
  | ['circle', { cx: string; cy: string; r: string }]
  | ['rect', { x: string; y: string; width: string; height: string; rx?: string }];

function icon(nodes: Node[], filled = false) {
  return function Icon({ size = 24, stroke = 2, color, line, metal }: IconProps) {
    const fallback = useColors().textPrimary;
    const { on: finish } = useFinish();
    const tint = metal ? 'url(#icon-metal)' : (color ?? fallback);
    // The drawing is 24 units across, so a line of `line` points is line × 24 / size units.
    const width = finish || line !== undefined ? ((line ?? ICON_LINE) * 24) / size : stroke;
    const paint = filled
      ? { fill: tint }
      : {
          fill: 'none',
          stroke: tint,
          strokeWidth: width,
          strokeLinecap: 'round' as const,
          strokeLinejoin: 'round' as const,
        };
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" {...paint}>
        {metal ? (
          // In the icon's own 24-unit grid, not each path's box: a straight line's box has no
          // height, and a box-sized gradient would paint nothing on it.
          <Defs>
            <LinearGradient id="icon-metal" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="24">
              <Stop offset="0" stopColor="#FFFFFF" />
              <Stop offset="0.55" stopColor="#D9D9DE" />
              <Stop offset="1" stopColor="#9C9CA6" />
            </LinearGradient>
          </Defs>
        ) : null}
        {nodes.map((node, index) => {
          if (node[0] === 'path') return <Path key={index} {...node[1]} />;
          if (node[0] === 'circle') return <Circle key={index} {...node[1]} />;
          return <Rect key={index} {...node[1]} />;
        })}
      </Svg>
    );
  };
}

export const IconAlertCircle = icon([["path", {"d": "M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0"}], ["path", {"d": "M12 8v4"}], ["path", {"d": "M12 16h.01"}]]);
export const IconAlertTriangle = icon([["path", {"d": "M12 9v4"}], ["path", {"d": "M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636 -2.87l-8.106 -13.536a1.914 1.914 0 0 0 -3.274 0"}], ["path", {"d": "M12 16h.01"}]]);
export const IconAdjustments = icon([["path", {"d": "M4 10a2 2 0 1 0 4 0a2 2 0 0 0 -4 0"}], ["path", {"d": "M6 4v4"}], ["path", {"d": "M6 12v8"}], ["path", {"d": "M10 16a2 2 0 1 0 4 0a2 2 0 0 0 -4 0"}], ["path", {"d": "M12 4v10"}], ["path", {"d": "M12 18v2"}], ["path", {"d": "M16 7a2 2 0 1 0 4 0a2 2 0 0 0 -4 0"}], ["path", {"d": "M18 4v1"}], ["path", {"d": "M18 9v11"}]]);
export const IconArrowLeft = icon([["path", {"d": "M5 12l14 0"}], ["path", {"d": "M5 12l6 6"}], ["path", {"d": "M5 12l6 -6"}]]);
export const IconArrowRight = icon([["path", {"d": "M5 12l14 0"}], ["path", {"d": "M13 18l6 -6"}], ["path", {"d": "M13 6l6 6"}]]);
export const IconArrowUpRight = icon([["path", {"d": "M17 7l-10 10"}], ["path", {"d": "M8 7l9 0l0 9"}]]);
export const IconArrowsSort = icon([["path", {"d": "M3 9l4 -4l4 4m-4 -4v14"}], ["path", {"d": "M21 15l-4 4l-4 -4m4 4v-14"}]]);
export const IconBell = icon([["path", {"d": "M10 5a2 2 0 1 1 4 0a7 7 0 0 1 4 6v3a4 4 0 0 0 2 3h-16a4 4 0 0 0 2 -3v-3a7 7 0 0 1 4 -6"}], ["path", {"d": "M9 17v1a3 3 0 0 0 6 0v-1"}]]);
export const IconBuildingStore = icon([["path", {"d": "M3 21l18 0"}], ["path", {"d": "M3 7v1a3 3 0 0 0 6 0v-1m0 1a3 3 0 0 0 6 0v-1m0 1a3 3 0 0 0 6 0v-1h-18l2 -4h14l2 4"}], ["path", {"d": "M5 21l0 -10.15"}], ["path", {"d": "M19 21l0 -10.15"}], ["path", {"d": "M9 21v-4a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v4"}]]);
export const IconBulb = icon([["path", {"d": "M3 12h1m8 -9v1m8 8h1m-15.4 -6.4l.7 .7m12.1 -.7l-.7 .7"}], ["path", {"d": "M9 16a5 5 0 1 1 6 0a3.5 3.5 0 0 0 -1 3a2 2 0 0 1 -4 0a3.5 3.5 0 0 0 -1 -3"}], ["path", {"d": "M9.7 17l4.6 0"}]]);
export const IconCalendar = icon([["path", {"d": "M4 7a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2v-12"}], ["path", {"d": "M16 3v4"}], ["path", {"d": "M8 3v4"}], ["path", {"d": "M4 11h16"}], ["path", {"d": "M11 15h1"}], ["path", {"d": "M12 15v3"}]]);
export const IconCalendarCheck = icon([["path", {"d": "M11.5 21h-5.5a2 2 0 0 1 -2 -2v-12a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v6"}], ["path", {"d": "M16 3v4"}], ["path", {"d": "M8 3v4"}], ["path", {"d": "M4 11h16"}], ["path", {"d": "M15 19l2 2l4 -4"}]]);
export const IconCalendarEvent = icon([["path", {"d": "M4 7a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2l0 -12"}], ["path", {"d": "M16 3l0 4"}], ["path", {"d": "M8 3l0 4"}], ["path", {"d": "M4 11l16 0"}], ["path", {"d": "M8 15h2v2h-2l0 -2"}]]);
export const IconCalendarOff = icon([["path", {"d": "M9 5h9a2 2 0 0 1 2 2v9m-.184 3.839a2 2 0 0 1 -1.816 1.161h-12a2 2 0 0 1 -2 -2v-12a2 2 0 0 1 1.158 -1.815"}], ["path", {"d": "M16 3v4"}], ["path", {"d": "M8 3v1"}], ["path", {"d": "M4 11h7m4 0h5"}], ["path", {"d": "M3 3l18 18"}]]);
export const IconCalendarQuestion = icon([["path", {"d": "M15 21h-9a2 2 0 0 1 -2 -2v-12a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v4"}], ["path", {"d": "M16 3v4"}], ["path", {"d": "M8 3v4"}], ["path", {"d": "M4 11h16"}], ["path", {"d": "M19 22v.01"}], ["path", {"d": "M19 19a2.003 2.003 0 0 0 .914 -3.782a1.98 1.98 0 0 0 -2.414 .483"}]]);
export const IconCalendarRepeat = icon([["path", {"d": "M12.5 21h-6.5a2 2 0 0 1 -2 -2v-12a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v3"}], ["path", {"d": "M16 3v4"}], ["path", {"d": "M8 3v4"}], ["path", {"d": "M4 11h12"}], ["path", {"d": "M20 14l2 2h-3"}], ["path", {"d": "M20 18l2 -2"}], ["path", {"d": "M19 16a3 3 0 1 0 2 5.236"}]]);
export const IconCalendarX = icon([["path", {"d": "M13 21h-7a2 2 0 0 1 -2 -2v-12a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v6.5"}], ["path", {"d": "M16 3v4"}], ["path", {"d": "M8 3v4"}], ["path", {"d": "M4 11h16"}], ["path", {"d": "M22 22l-5 -5"}], ["path", {"d": "M17 22l5 -5"}]]);
export const IconCamera = icon([["path", {"d": "M5 7h1a2 2 0 0 0 2 -2a1 1 0 0 1 1 -1h6a1 1 0 0 1 1 1a2 2 0 0 0 2 2h1a2 2 0 0 1 2 2v9a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-9a2 2 0 0 1 2 -2"}], ["path", {"d": "M9 13a3 3 0 1 0 6 0a3 3 0 0 0 -6 0"}]]);
export const IconCar = icon([["path", {"d": "M5 17a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"}], ["path", {"d": "M15 17a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"}], ["path", {"d": "M5 17h-2v-6l2 -5h9l4 5h1a2 2 0 0 1 2 2v4h-2m-4 0h-6m-6 -6h15m-6 0v-5"}]]);
export const IconCarGarage = icon([["path", {"d": "M5 20a2 2 0 1 0 4 0a2 2 0 0 0 -4 0"}], ["path", {"d": "M15 20a2 2 0 1 0 4 0a2 2 0 0 0 -4 0"}], ["path", {"d": "M5 20h-2v-6l2 -5h9l4 5h1a2 2 0 0 1 2 2v4h-2m-4 0h-6m-6 -6h15m-6 0v-5"}], ["path", {"d": "M3 6l9 -4l9 4"}]]);
export const IconCheck = icon([["path", {"d": "M5 12l5 5l10 -10"}]]);
export const IconChevronDown = icon([["path", {"d": "M6 9l6 6l6 -6"}]]);
export const IconChevronLeft = icon([["path", {"d": "M15 6l-6 6l6 6"}]]);
export const IconChevronRight = icon([["path", {"d": "M9 6l6 6l-6 6"}]]);
export const IconCircleCheck = icon([["path", {"d": "M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0"}], ["path", {"d": "M9 12l2 2l4 -4"}]]);
export const IconCircleX = icon([["path", {"d": "M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0"}], ["path", {"d": "M10 10l4 4m0 -4l-4 4"}]]);
export const IconClock = icon([["path", {"d": "M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0"}], ["path", {"d": "M12 7v5l3 3"}]]);
export const IconCurrentLocation = icon([["path", {"d": "M9 12a3 3 0 1 0 6 0a3 3 0 1 0 -6 0"}], ["path", {"d": "M4 12a8 8 0 1 0 16 0a8 8 0 1 0 -16 0"}], ["path", {"d": "M12 2l0 2"}], ["path", {"d": "M12 20l0 2"}], ["path", {"d": "M20 12l2 0"}], ["path", {"d": "M2 12l2 0"}]]);
export const IconDroplet = icon([["path", {"d": "M7.502 19.423c2.602 2.105 6.395 2.105 8.996 0c2.602 -2.105 3.262 -5.708 1.566 -8.546l-4.89 -7.26c-.42 -.625 -1.287 -.803 -1.936 -.397a1.376 1.376 0 0 0 -.41 .397l-4.893 7.26c-1.695 2.838 -1.035 6.441 1.567 8.546"}]]);
export const IconFileInvoice = icon([["path", {"d": "M14 3v4a1 1 0 0 0 1 1h4"}], ["path", {"d": "M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2"}], ["path", {"d": "M9 7l1 0"}], ["path", {"d": "M9 13l6 0"}], ["path", {"d": "M13 17l2 0"}]]);
export const IconGift = icon([["path", {"d": "M3 9a1 1 0 0 1 1 -1h16a1 1 0 0 1 1 1v2a1 1 0 0 1 -1 1h-16a1 1 0 0 1 -1 -1l0 -2"}], ["path", {"d": "M12 8l0 13"}], ["path", {"d": "M19 12v7a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-7"}], ["path", {"d": "M7.5 8a2.5 2.5 0 0 1 0 -5a4.8 8 0 0 1 4.5 5a4.8 8 0 0 1 4.5 -5a2.5 2.5 0 0 1 0 5"}]]);
export const IconHeart = icon([["path", {"d": "M19.5 12.572l-7.5 7.428l-7.5 -7.428a5 5 0 1 1 7.5 -6.566a5 5 0 1 1 7.5 6.572"}]]);
export const IconHistory = icon([["path", {"d": "M12 8l0 4l2 2"}], ["path", {"d": "M3.05 11a9 9 0 1 1 .5 4m-.5 5v-5h5"}]]);
export const IconHome = icon([["path", {"d": "M5 12l-2 0l9 -9l9 9l-2 0"}], ["path", {"d": "M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-7"}], ["path", {"d": "M9 21v-6a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v6"}]]);
export const IconInfoCircle = icon([["path", {"d": "M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0"}], ["path", {"d": "M12 9h.01"}], ["path", {"d": "M11 12h1v4h1"}]]);
export const IconKey = icon([["path", {"d": "M16.555 3.843l3.602 3.602a2.877 2.877 0 0 1 0 4.069l-2.643 2.643a2.877 2.877 0 0 1 -4.069 0l-.301 -.301l-6.558 6.558a2 2 0 0 1 -1.239 .578l-.175 .008h-1.172a1 1 0 0 1 -.993 -.883l-.007 -.117v-1.172a2 2 0 0 1 .467 -1.284l.119 -.13l.414 -.414h2v-2h2v-2l2.144 -2.144l-.301 -.301a2.877 2.877 0 0 1 0 -4.069l2.643 -2.643a2.877 2.877 0 0 1 4.069 0"}], ["path", {"d": "M15 9h.01"}]]);
export const IconLanguage = icon([["path", {"d": "M9 6.371c0 4.418 -2.239 6.629 -5 6.629"}], ["path", {"d": "M4 6.371h7"}], ["path", {"d": "M5 9c0 2.144 2.252 3.908 6 4"}], ["path", {"d": "M12 20l4 -9l4 9"}], ["path", {"d": "M19.1 18h-6.2"}], ["path", {"d": "M6.694 3l.793 .582"}]]);
export const IconList = icon([["path", {"d": "M9 6l11 0"}], ["path", {"d": "M9 12l11 0"}], ["path", {"d": "M9 18l11 0"}], ["path", {"d": "M5 6l0 .01"}], ["path", {"d": "M5 12l0 .01"}], ["path", {"d": "M5 18l0 .01"}]]);
export const IconLogout = icon([["path", {"d": "M14 8v-2a2 2 0 0 0 -2 -2h-7a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h7a2 2 0 0 0 2 -2v-2"}], ["path", {"d": "M9 12h12l-3 -3"}], ["path", {"d": "M18 15l3 -3"}]]);
export const IconMap = icon([["path", {"d": "M3 7l6 -3l6 3l6 -3v13l-6 3l-6 -3l-6 3v-13"}], ["path", {"d": "M9 4v13"}], ["path", {"d": "M15 7v13"}]]);
export const IconMap2 = icon([["path", {"d": "M12 18.5l-3 -1.5l-6 3v-13l6 -3l6 3l6 -3v7.5"}], ["path", {"d": "M9 4v13"}], ["path", {"d": "M15 7v5.5"}], ["path", {"d": "M21.121 20.121a3 3 0 1 0 -4.242 0c.418 .419 1.125 1.045 2.121 1.879c1.051 -.89 1.759 -1.516 2.121 -1.879"}], ["path", {"d": "M19 18v.01"}]]);
export const IconMapPin = icon([["path", {"d": "M9 11a3 3 0 1 0 6 0a3 3 0 0 0 -6 0"}], ["path", {"d": "M17.657 16.657l-4.243 4.243a2 2 0 0 1 -2.827 0l-4.244 -4.243a8 8 0 1 1 11.314 0"}]]);
export const IconMessageCheck = icon([["path", {"d": "M8 9h8"}], ["path", {"d": "M8 13h6"}], ["path", {"d": "M10.99 19.206l-2.99 1.794v-3h-2a3 3 0 0 1 -3 -3v-8a3 3 0 0 1 3 -3h12a3 3 0 0 1 3 3v6"}], ["path", {"d": "M15 19l2 2l4 -4"}]]);
export const IconMessageDots = icon([["path", {"d": "M12 11v.01"}], ["path", {"d": "M8 11v.01"}], ["path", {"d": "M16 11v.01"}], ["path", {"d": "M18 4a3 3 0 0 1 3 3v8a3 3 0 0 1 -3 3h-5l-5 3v-3h-2a3 3 0 0 1 -3 -3v-8a3 3 0 0 1 3 -3l12 0"}]]);
export const IconMessageX = icon([["path", {"d": "M8 9h8"}], ["path", {"d": "M8 13h6"}], ["path", {"d": "M13 18l-5 3v-3h-2a3 3 0 0 1 -3 -3v-8a3 3 0 0 1 3 -3h12a3 3 0 0 1 3 3v6"}], ["path", {"d": "M22 22l-5 -5"}], ["path", {"d": "M17 22l5 -5"}]]);
export const IconPencil = icon([["path", {"d": "M4 20h4l10.5 -10.5a2.828 2.828 0 1 0 -4 -4l-10.5 10.5v4"}], ["path", {"d": "M13.5 6.5l4 4"}]]);
export const IconPhoto = icon([["path", {"d": "M15 8h.01"}], ["path", {"d": "M3 6a3 3 0 0 1 3 -3h12a3 3 0 0 1 3 3v12a3 3 0 0 1 -3 3h-12a3 3 0 0 1 -3 -3v-12"}], ["path", {"d": "M3 16l5 -5c.928 -.893 2.072 -.893 3 0l5 5"}], ["path", {"d": "M14 14l1 -1c.928 -.893 2.072 -.893 3 0l3 3"}]]);
export const IconPlayerPause = icon([["path", {"d": "M6 6a1 1 0 0 1 1 -1h2a1 1 0 0 1 1 1v12a1 1 0 0 1 -1 1h-2a1 1 0 0 1 -1 -1l0 -12"}], ["path", {"d": "M14 6a1 1 0 0 1 1 -1h2a1 1 0 0 1 1 1v12a1 1 0 0 1 -1 1h-2a1 1 0 0 1 -1 -1l0 -12"}]]);
export const IconPlus = icon([["path", {"d": "M12 5l0 14"}], ["path", {"d": "M5 12l14 0"}]]);
export const IconMinus = icon([["path", {"d": "M5 12l14 0"}]]);
export const IconReceipt = icon([["path", {"d": "M5 21v-16a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v16l-3 -2l-2 2l-2 -2l-2 2l-2 -2l-3 2m4 -14h6m-6 4h6m-2 4h2"}]]);
export const IconReceiptRefund = icon([["path", {"d": "M5 21v-16a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v16l-3 -2l-2 2l-2 -2l-2 2l-2 -2l-3 2"}], ["path", {"d": "M15 14v-2a2 2 0 0 0 -2 -2h-4l2 -2m0 4l-2 -2"}]]);
export const IconRefresh = icon([["path", {"d": "M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4"}], ["path", {"d": "M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4"}]]);
export const IconRepeat = icon([["path", {"d": "M4 12v-3a3 3 0 0 1 3 -3h13m-3 -3l3 3l-3 3"}], ["path", {"d": "M20 12v3a3 3 0 0 1 -3 3h-13m3 3l-3 -3l3 -3"}]]);
export const IconRoute = icon([["path", {"d": "M3 19a2 2 0 1 0 4 0a2 2 0 0 0 -4 0"}], ["path", {"d": "M19 7a2 2 0 1 0 0 -4a2 2 0 0 0 0 4"}], ["path", {"d": "M11 19h5.5a3.5 3.5 0 0 0 0 -7h-8a3.5 3.5 0 0 1 0 -7h4.5"}]]);
export const IconSearch = icon([["path", {"d": "M3 10a7 7 0 1 0 14 0a7 7 0 1 0 -14 0"}], ["path", {"d": "M21 21l-6 -6"}]]);
export const IconShieldCheck = icon([["path", {"d": "M11.46 20.846a12 12 0 0 1 -7.96 -14.846a12 12 0 0 0 8.5 -3a12 12 0 0 0 8.5 3a12 12 0 0 1 -.09 7.06"}], ["path", {"d": "M15 19l2 2l4 -4"}]]);
export const IconShieldX = icon([["path", {"d": "M13.252 20.601c-.408 .155 -.826 .288 -1.252 .399a12 12 0 0 1 -8.5 -15a12 12 0 0 0 8.5 -3a12 12 0 0 0 8.5 3a12 12 0 0 1 -.19 7.357"}], ["path", {"d": "M22 22l-5 -5"}], ["path", {"d": "M17 22l5 -5"}]]);
export const IconSparkles = icon([["path", {"d": "M16 18a2 2 0 0 1 2 2a2 2 0 0 1 2 -2a2 2 0 0 1 -2 -2a2 2 0 0 1 -2 2m0 -12a2 2 0 0 1 2 2a2 2 0 0 1 2 -2a2 2 0 0 1 -2 -2a2 2 0 0 1 -2 2m-7 12a6 6 0 0 1 6 -6a6 6 0 0 1 -6 -6a6 6 0 0 1 -6 6a6 6 0 0 1 6 6"}]]);
export const IconSpeakerphone = icon([["path", {"d": "M18 8a3 3 0 0 1 0 6"}], ["path", {"d": "M10 8v11a1 1 0 0 1 -1 1h-1a1 1 0 0 1 -1 -1v-5"}], ["path", {"d": "M12 8l4.524 -3.77a.9 .9 0 0 1 1.476 .692v12.156a.9 .9 0 0 1 -1.476 .692l-4.524 -3.77h-8a1 1 0 0 1 -1 -1v-4a1 1 0 0 1 1 -1h8"}]]);
export const IconStar = icon([["path", {"d": "M12 17.75l-6.172 3.245l1.179 -6.873l-5 -4.867l6.9 -1l3.086 -6.253l3.086 6.253l6.9 1l-5 4.867l1.179 6.873l-6.158 -3.245"}]]);
export const IconTool = icon([["path", {"d": "M7 10h3v-3l-3.5 -3.5a6 6 0 0 1 8 8l6 6a2 2 0 0 1 -3 3l-6 -6a6 6 0 0 1 -8 -8l3.5 3.5"}]]);
export const IconToolsOff = icon([["path", {"d": "M16 12l4 -4a2.828 2.828 0 1 0 -4 -4l-4 4m-2 2l-7 7v4h4l7 -7"}], ["path", {"d": "M14.5 5.5l4 4"}], ["path", {"d": "M12 8l-5 -5m-2 2l-2 2l5 5"}], ["path", {"d": "M7 8l-1.5 1.5"}], ["path", {"d": "M16 12l5 5m-2 2l-2 2l-5 -5"}], ["path", {"d": "M16 17l-1.5 1.5"}], ["path", {"d": "M3 3l18 18"}]]);
export const IconTruckDelivery = icon([["path", {"d": "M5 17a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"}], ["path", {"d": "M15 17a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"}], ["path", {"d": "M5 17h-2v-4m-1 -8h11v12m-4 0h6m4 0h2v-6h-8m0 -5h5l3 5"}], ["path", {"d": "M3 9l4 0"}]]);
export const IconUser = icon([["path", {"d": "M8 7a4 4 0 1 0 8 0a4 4 0 0 0 -8 0"}], ["path", {"d": "M6 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2"}]]);
export const IconX = icon([["path", {"d": "M18 6l-12 12"}], ["path", {"d": "M6 6l12 12"}]]);
export const IconHeartFilled = icon([["path", {"d": "M6.979 3.074a6 6 0 0 1 4.988 1.425l.037 .033l.034 -.03a6 6 0 0 1 4.733 -1.44l.246 .036a6 6 0 0 1 3.364 10.008l-.18 .185l-.048 .041l-7.45 7.379a1 1 0 0 1 -1.313 .082l-.094 -.082l-7.493 -7.422a6 6 0 0 1 3.176 -10.215z"}]], true);
export const IconStarFilled = icon([["path", {"d": "M8.243 7.34l-6.38 .925l-.113 .023a1 1 0 0 0 -.44 1.684l4.622 4.499l-1.09 6.355l-.013 .11a1 1 0 0 0 1.464 .944l5.706 -3l5.693 3l.1 .046a1 1 0 0 0 1.352 -1.1l-1.091 -6.355l4.624 -4.5l.078 -.085a1 1 0 0 0 -.633 -1.62l-6.38 -.926l-2.852 -5.78a1 1 0 0 0 -1.794 0l-2.853 5.78z"}]], true);
export const IconDroplets = icon([["path", {"d": "M4.072 20.3a2.999 2.999 0 0 0 3.856 0a3.002 3.002 0 0 0 .67 -3.798l-2.095 -3.227a.6 .6 0 0 0 -1.005 0l-2.098 3.227a3.003 3.003 0 0 0 .671 3.798"}], ["path", {"d": "M16.072 20.3a2.999 2.999 0 0 0 3.856 0a3.002 3.002 0 0 0 .67 -3.798l-2.095 -3.227a.6 .6 0 0 0 -1.005 0l-2.098 3.227a3.003 3.003 0 0 0 .671 3.798"}], ["path", {"d": "M10.072 10.3a2.999 2.999 0 0 0 3.856 0a3.002 3.002 0 0 0 .67 -3.798l-2.095 -3.227a.6 .6 0 0 0 -1.005 0l-2.098 3.227a3.003 3.003 0 0 0 .671 3.798l.001 0"}]]);
export const IconBrush = icon([["path", {"d": "M3 21v-4a4 4 0 1 1 4 4h-4"}], ["path", {"d": "M21 3a16 16 0 0 0 -12.8 10.2"}], ["path", {"d": "M21 3a16 16 0 0 1 -10.2 12.8"}], ["path", {"d": "M10.6 9a9 9 0 0 1 4.4 4.4"}]]);
export const IconPackage = icon([["path", {"d": "M12 3l8 4.5l0 9l-8 4.5l-8 -4.5l0 -9l8 -4.5"}], ["path", {"d": "M12 12l8 -4.5"}], ["path", {"d": "M12 12l0 9"}], ["path", {"d": "M12 12l-8 -4.5"}], ["path", {"d": "M16 5.25l-8 4.5"}]]);
export const IconMotorbike = icon([["path", {"d": "M2 16a3 3 0 1 0 6 0a3 3 0 1 0 -6 0"}], ["path", {"d": "M16 16a3 3 0 1 0 6 0a3 3 0 1 0 -6 0"}], ["path", {"d": "M7.5 14h5l4 -4h-10.5m1.5 4l4 -4"}], ["path", {"d": "M13 6h2l1.5 3l2 4"}]]);
export const IconShare = icon([["path", {"d": "M3 12a3 3 0 1 0 6 0a3 3 0 1 0 -6 0"}], ["path", {"d": "M15 6a3 3 0 1 0 6 0a3 3 0 1 0 -6 0"}], ["path", {"d": "M15 18a3 3 0 1 0 6 0a3 3 0 1 0 -6 0"}], ["path", {"d": "M8.7 10.7l6.6 -3.4"}], ["path", {"d": "M8.7 13.3l6.6 3.4"}]]);
export const IconDownload = icon([["path", {"d": "M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2"}], ["path", {"d": "M7 11l5 5l5 -5"}], ["path", {"d": "M12 4l0 12"}]]);
export const IconFlag = icon([["path", {"d": "M5 5a5 5 0 0 1 7 0a5 5 0 0 0 7 0v9a5 5 0 0 1 -7 0a5 5 0 0 0 -7 0v-9"}], ["path", {"d": "M5 21v-7"}]]);
export const IconMessageReport = icon([["path", {"d": "M18 4a3 3 0 0 1 3 3v8a3 3 0 0 1 -3 3h-5l-5 3v-3h-2a3 3 0 0 1 -3 -3v-8a3 3 0 0 1 3 -3h12"}], ["path", {"d": "M12 8v3"}], ["path", {"d": "M12 14v.01"}]]);
export const IconPhoneOff = icon([["path", {"d": "M3 21l18 -18"}], ["path", {"d": "M5.831 14.161a15.946 15.946 0 0 1 -2.831 -8.161a2 2 0 0 1 2 -2h4l2 5l-2.5 1.5c.108 .22 .223 .435 .345 .645m1.751 2.277c.843 .84 1.822 1.544 2.904 2.078l1.5 -2.5l5 2v4a2 2 0 0 1 -2 2a15.963 15.963 0 0 1 -10.344 -4.657"}]]);
export const IconNavigation = icon([["path", {"d": "M12 18.5l7.265 2.463c.196 .077 .42 .032 .57 -.116a.548 .548 0 0 0 .134 -.572l-7.969 -17.275l-7.97 17.275c-.07 .2 -.017 .424 .135 .572c.15 .148 .374 .193 .57 .116l7.265 -2.463"}]]);
export const IconBrandWhatsapp = icon([["path", {"d": "M3 21l1.65 -3.8a9 9 0 1 1 3.4 2.9l-5.05 .9"}], ["path", {"d": "M9 10a.5 .5 0 0 0 1 0v-1a.5 .5 0 0 0 -1 0v1a5 5 0 0 0 5 5h1a.5 .5 0 0 0 0 -1h-1a.5 .5 0 0 0 0 1"}]]);
export const IconLock = icon([["path", {"d": "M5 13a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v6a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-6"}], ["path", {"d": "M11 16a1 1 0 1 0 2 0a1 1 0 0 0 -2 0"}], ["path", {"d": "M8 11v-4a4 4 0 1 1 8 0v4"}]]);
export const IconPercentage = icon([["path", {"d": "M16 17a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"}], ["path", {"d": "M6 7a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"}], ["path", {"d": "M6 18l12 -12"}]]);
export const IconSend = icon([["path", {"d": "M10 14l11 -11"}], ["path", {"d": "M21 3l-6.5 18a.55 .55 0 0 1 -1 0l-3.5 -7l-7 -3.5a.55 .55 0 0 1 0 -1l18 -6.5"}]]);
export const IconConfetti = icon([["path", {"d": "M4 5h2"}], ["path", {"d": "M5 4v2"}], ["path", {"d": "M11.5 4l-.5 2"}], ["path", {"d": "M18 5h2"}], ["path", {"d": "M19 4v2"}], ["path", {"d": "M15 9l-1 1"}], ["path", {"d": "M18 13l2 -.5"}], ["path", {"d": "M18 19h2"}], ["path", {"d": "M19 18v2"}], ["path", {"d": "M14 16.518l-6.518 -6.518l-4.39 9.58a1 1 0 0 0 1.329 1.329l9.579 -4.39"}]]);
export const IconBellOff = icon([["path", {"d": "M9.346 5.353c.21 -.129 .428 -.246 .654 -.353a2 2 0 1 1 4 0a7 7 0 0 1 4 6v3m-1 3h-13a4 4 0 0 0 2 -3v-3a6.996 6.996 0 0 1 1.273 -3.707"}], ["path", {"d": "M9 17v1a3 3 0 0 0 6 0v-1"}], ["path", {"d": "M3 3l18 18"}]]);
export const IconClockHour4 = icon([["path", {"d": "M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0"}], ["path", {"d": "M12 12l3 2"}], ["path", {"d": "M12 7v5"}]]);
export const IconPhone = icon([["path", {"d": "M5 4h4l2 5l-2.5 1.5a11 11 0 0 0 5 5l1.5 -2.5l5 2v4a2 2 0 0 1 -2 2a16 16 0 0 1 -15 -15a2 2 0 0 1 2 -2"}]]);
export const IconLoader2 = icon([["path", {"d": "M12 3a9 9 0 1 0 9 9"}]]);
export const IconTrash = icon([["path", {"d": "M4 7l16 0"}], ["path", {"d": "M10 11l0 6"}], ["path", {"d": "M14 11l0 6"}], ["path", {"d": "M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12"}], ["path", {"d": "M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3"}]]);
export const IconCameraPlus = icon([["path", {"d": "M12 20h-7a2 2 0 0 1 -2 -2v-9a2 2 0 0 1 2 -2h1a2 2 0 0 0 2 -2a1 1 0 0 1 1 -1h6a1 1 0 0 1 1 1a2 2 0 0 0 2 2h1a2 2 0 0 1 2 2v3.5"}], ["path", {"d": "M16 19h6"}], ["path", {"d": "M19 16v6"}], ["path", {"d": "M9 13a3 3 0 1 0 6 0a3 3 0 0 0 -6 0"}]]);
export const IconTicket = icon([["path", {"d": "M15 5l0 2"}],["path", {"d": "M15 11l0 2"}],["path", {"d": "M15 17l0 2"}],["path", {"d": "M5 5h14a2 2 0 0 1 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-3a2 2 0 0 0 0 -4v-3a2 2 0 0 1 2 -2"}]]);
export const IconBrandInstagram = icon([["path",{"d":"M4 8a4 4 0 0 1 4 -4h8a4 4 0 0 1 4 4v8a4 4 0 0 1 -4 4h-8a4 4 0 0 1 -4 -4l0 -8"}],["path",{"d":"M9 12a3 3 0 1 0 6 0a3 3 0 0 0 -6 0"}],["path",{"d":"M16.5 7.5v.01"}]]);
export const IconCake = icon([["path",{"d":"M3 20h18v-8a3 3 0 0 0 -3 -3h-12a3 3 0 0 0 -3 3v8"}],["path",{"d":"M3 14.803c.312 .135 .654 .204 1 .197a2.4 2.4 0 0 0 2 -1a2.4 2.4 0 0 1 2 -1a2.4 2.4 0 0 1 2 1a2.4 2.4 0 0 0 2 1a2.4 2.4 0 0 0 2 -1a2.4 2.4 0 0 1 2 -1a2.4 2.4 0 0 1 2 1a2.4 2.4 0 0 0 2 1c.35 .007 .692 -.062 1 -.197"}],["path",{"d":"M12 4l1.465 1.638a2 2 0 1 1 -3.015 .099l1.55 -1.737"}]]);
export const IconCards = icon([["path",{"d":"M3.604 7.197l7.138 -3.109a.96 .96 0 0 1 1.27 .527l4.924 11.902a1 1 0 0 1 -.514 1.304l-7.137 3.109a.96 .96 0 0 1 -1.271 -.527l-4.924 -11.903a1 1 0 0 1 .514 -1.304l0 .001"}],["path",{"d":"M15 4h1a1 1 0 0 1 1 1v3.5"}],["path",{"d":"M20 6c.264 .112 .52 .217 .768 .315a1 1 0 0 1 .53 1.311l-2.298 5.374"}]]);
export const IconCircleCheckFilled = icon([["path",{"d":"M17 3.34a10 10 0 1 1 -14.995 8.984l-.005 -.324l.005 -.324a10 10 0 0 1 14.995 -8.336zm-1.293 5.953a1 1 0 0 0 -1.32 -.083l-.094 .083l-3.293 3.292l-1.293 -1.292l-.094 -.083a1 1 0 0 0 -1.403 1.403l.083 .094l2 2l.094 .083a1 1 0 0 0 1.226 0l.094 -.083l4 -4l.083 -.094a1 1 0 0 0 -.083 -1.32z"}]], true);
export const IconCloudRain = icon([["path",{"d":"M7 18a4.6 4.4 0 0 1 0 -9a5 4.5 0 0 1 11 2h1a3.5 3.5 0 0 1 0 7"}],["path",{"d":"M11 13v2m0 3v2m4 -5v2m0 3v2"}]]);
export const IconCompass = icon([["path",{"d":"M8 16l2 -6l6 -2l-2 6l-6 2"}],["path",{"d":"M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0"}],["path",{"d":"M12 3l0 2"}],["path",{"d":"M12 19l0 2"}],["path",{"d":"M3 12l2 0"}],["path",{"d":"M19 12l2 0"}]]);
export const IconCopy = icon([["path",{"d":"M7 9.667a2.667 2.667 0 0 1 2.667 -2.667h8.666a2.667 2.667 0 0 1 2.667 2.667v8.666a2.667 2.667 0 0 1 -2.667 2.667h-8.666a2.667 2.667 0 0 1 -2.667 -2.667l0 -8.666"}],["path",{"d":"M4.012 16.737a2.005 2.005 0 0 1 -1.012 -1.737v-10c0 -1.1 .9 -2 2 -2h10c.75 0 1.158 .385 1.5 1"}]]);
export const IconFlame = icon([["path",{"d":"M12 10.941c2.333 -3.308 .167 -7.823 -1 -8.941c0 3.395 -2.235 5.299 -3.667 6.706c-1.43 1.408 -2.333 3.294 -2.333 5.588c0 3.704 3.134 6.706 7 6.706c3.866 0 7 -3.002 7 -6.706c0 -1.712 -1.232 -4.403 -2.333 -5.588c-2.084 3.353 -3.257 3.353 -4.667 2.235"}]]);
export const IconHeartHandshake = icon([["path",{"d":"M19.5 12.572l-7.5 7.428l-7.5 -7.428a5 5 0 1 1 7.5 -6.566a5 5 0 1 1 7.5 6.572"}],["path",{"d":"M12 6l-3.293 3.293a1 1 0 0 0 0 1.414l.543 .543c.69 .69 1.81 .69 2.5 0l1 -1a3.182 3.182 0 0 1 4.5 0l2.25 2.25"}],["path",{"d":"M12.5 15.5l2 2"}],["path",{"d":"M15 13l2 2"}]]);
export const IconLink = icon([["path",{"d":"M9 15l6 -6"}],["path",{"d":"M11 6l.463 -.536a5 5 0 0 1 7.071 7.072l-.534 .464"}],["path",{"d":"M13 18l-.397 .534a5.068 5.068 0 0 1 -7.127 0a4.972 4.972 0 0 1 0 -7.071l.524 -.463"}]]);
export const IconLinkOff = icon([["path",{"d":"M9 15l3 -3m2 -2l1 -1"}],["path",{"d":"M11 6l.463 -.536a5 5 0 0 1 7.071 7.072l-.534 .464"}],["path",{"d":"M3 3l18 18"}],["path",{"d":"M13 18l-.397 .534a5.068 5.068 0 0 1 -7.127 0a4.972 4.972 0 0 1 0 -7.071l.524 -.463"}]]);
export const IconMessageStar = icon([["path",{"d":"M8 9h8"}],["path",{"d":"M8 13h4.5"}],["path",{"d":"M10.325 19.605l-2.325 1.395v-3h-2a3 3 0 0 1 -3 -3v-8a3 3 0 0 1 3 -3h12a3 3 0 0 1 3 3v4.5"}],["path",{"d":"M17.8 20.817l-2.172 1.138a.392 .392 0 0 1 -.568 -.41l.415 -2.411l-1.757 -1.707a.389 .389 0 0 1 .217 -.665l2.428 -.352l1.086 -2.193a.392 .392 0 0 1 .702 0l1.086 2.193l2.428 .352a.39 .39 0 0 1 .217 .665l-1.757 1.707l.414 2.41a.39 .39 0 0 1 -.567 .411l-2.172 -1.138"}]]);
export const IconMoonStars = icon([["path",{"d":"M12 3c.132 0 .263 0 .393 0a7.5 7.5 0 0 0 7.92 12.446a9 9 0 1 1 -8.313 -12.454l0 .008"}],["path",{"d":"M17 4a2 2 0 0 0 2 2a2 2 0 0 0 -2 2a2 2 0 0 0 -2 -2a2 2 0 0 0 2 -2"}],["path",{"d":"M19 11h2m-1 -1v2"}]]);
export const IconPrinter = icon([["path",{"d":"M17 17h2a2 2 0 0 0 2 -2v-4a2 2 0 0 0 -2 -2h-14a2 2 0 0 0 -2 2v4a2 2 0 0 0 2 2h2"}],["path",{"d":"M17 9v-4a2 2 0 0 0 -2 -2h-6a2 2 0 0 0 -2 2v4"}],["path",{"d":"M7 15a2 2 0 0 1 2 -2h6a2 2 0 0 1 2 2v4a2 2 0 0 1 -2 2h-6a2 2 0 0 1 -2 -2l0 -4"}]]);
export const IconSunrise = icon([["path",{"d":"M3 17h1m16 0h1m-15.4 -6.4l.7 .7m12.1 -.7l-.7 .7m-9.7 5.7a4 4 0 0 1 8 0"}],["path",{"d":"M3 21l18 0"}],["path",{"d":"M12 9v-6l3 3m-6 0l3 -3"}]]);
export const IconTrophy = icon([["path",{"d":"M8 21l8 0"}],["path",{"d":"M12 17l0 4"}],["path",{"d":"M7 4l10 0"}],["path",{"d":"M17 4v8a5 5 0 0 1 -10 0v-8"}],["path",{"d":"M3 9a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"}],["path",{"d":"M17 9a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"}]]);
export const IconQrcode = icon([["path",{"d":"M4 5a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -4"}],["path",{"d":"M7 17l0 .01"}],["path",{"d":"M14 5a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -4"}],["path",{"d":"M7 7l0 .01"}],["path",{"d":"M4 15a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -4"}],["path",{"d":"M17 7l0 .01"}],["path",{"d":"M14 14l3 0"}],["path",{"d":"M20 14l0 .01"}],["path",{"d":"M14 14l0 3"}],["path",{"d":"M14 20l3 0"}],["path",{"d":"M17 17l3 0"}],["path",{"d":"M20 17l0 3"}]]);

export const IconAlarm = icon([["path", {"d": "M5 13a7 7 0 1 0 14 0a7 7 0 1 0 -14 0"}], ["path", {"d": "M12 10l0 3l2 0"}], ["path", {"d": "M7 4l-2.75 2"}], ["path", {"d": "M17 4l2.75 2"}]]);
export const IconChartBar = icon([["path", {"d": "M3 13a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v6a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -6"}], ["path", {"d": "M15 9a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v10a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -10"}], ["path", {"d": "M9 5a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v14a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -14"}], ["path", {"d": "M4 20h14"}]]);
export const IconCircleDashed = icon([["path", {"d": "M8.56 3.69a9 9 0 0 0 -2.92 1.95"}], ["path", {"d": "M3.69 8.56a9 9 0 0 0 -.69 3.44"}], ["path", {"d": "M3.69 15.44a9 9 0 0 0 1.95 2.92"}], ["path", {"d": "M8.56 20.31a9 9 0 0 0 3.44 .69"}], ["path", {"d": "M15.44 20.31a9 9 0 0 0 2.92 -1.95"}], ["path", {"d": "M20.31 15.44a9 9 0 0 0 .69 -3.44"}], ["path", {"d": "M20.31 8.56a9 9 0 0 0 -1.95 -2.92"}], ["path", {"d": "M15.44 3.69a9 9 0 0 0 -3.44 -.69"}]]);
export const IconInbox = icon([["path", {"d": "M4 6a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2l0 -12"}], ["path", {"d": "M4 13h3l3 3h4l3 -3h3"}]]);
export const IconSettings = icon([["path", {"d": "M10.325 4.317c.426 -1.756 2.924 -1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543 -.94 3.31 .826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756 .426 1.756 2.924 0 3.35a1.724 1.724 0 0 0 -1.066 2.573c.94 1.543 -.826 3.31 -2.37 2.37a1.724 1.724 0 0 0 -2.572 1.065c-.426 1.756 -2.924 1.756 -3.35 0a1.724 1.724 0 0 0 -2.573 -1.066c-1.543 .94 -3.31 -.826 -2.37 -2.37a1.724 1.724 0 0 0 -1.065 -2.572c-1.756 -.426 -1.756 -2.924 0 -3.35a1.724 1.724 0 0 0 1.066 -2.573c-.94 -1.543 .826 -3.31 2.37 -2.37c1 .608 2.296 .07 2.572 -1.065"}], ["path", {"d": "M9 12a3 3 0 1 0 6 0a3 3 0 0 0 -6 0"}]]);
export const IconShieldLock = icon([["path", {"d": "M12 3a12 12 0 0 0 8.5 3a12 12 0 0 1 -8.5 15a12 12 0 0 1 -8.5 -15a12 12 0 0 0 8.5 -3"}], ["path", {"d": "M11 11a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"}], ["path", {"d": "M12 12l0 2.5"}]]);
export const IconCircle = icon([["path", {"d": "M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0"}]]);
export const IconDeviceMobile = icon([["path", {"d": "M6 5a2 2 0 0 1 2 -2h8a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-8a2 2 0 0 1 -2 -2v-14"}], ["path", {"d": "M11 4h2"}], ["path", {"d": "M12 17v.01"}]]);
export const IconUsers = icon([["path", {"d": "M5 7a4 4 0 1 0 8 0a4 4 0 1 0 -8 0"}], ["path", {"d": "M3 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2"}], ["path", {"d": "M16 3.13a4 4 0 0 1 0 7.75"}], ["path", {"d": "M21 21v-2a4 4 0 0 0 -3 -3.85"}]]);
export const IconBolt = icon([["path", {"d": "M13 3l0 7l6 0l-8 11l0 -7l-6 0l8 -11"}]]);
export const IconPhotoPlus = icon([["path", {"d": "M15 8h.01"}], ["path", {"d": "M12.5 21h-6.5a3 3 0 0 1 -3 -3v-12a3 3 0 0 1 3 -3h12a3 3 0 0 1 3 3v6.5"}], ["path", {"d": "M3 16l5 -5c.928 -.893 2.072 -.893 3 0l4 4"}], ["path", {"d": "M14 14l1 -1c.67 -.644 1.45 -.824 2.182 -.54"}], ["path", {"d": "M16 19h6"}], ["path", {"d": "M19 16v6"}]]);
export const IconVideo = icon([["path", {"d": "M15 10l4.553 -2.276a1 1 0 0 1 1.447 .894v6.764a1 1 0 0 1 -1.447 .894l-4.553 -2.276v-4"}], ["path", {"d": "M3 8a2 2 0 0 1 2 -2h8a2 2 0 0 1 2 2v8a2 2 0 0 1 -2 2h-8a2 2 0 0 1 -2 -2l0 -8"}]]);
export const IconVideoPlus = icon([["path", {"d": "M15 10l4.553 -2.276a1 1 0 0 1 1.447 .894v6.764a1 1 0 0 1 -1.447 .894l-4.553 -2.276v-4"}], ["path", {"d": "M3 8a2 2 0 0 1 2 -2h8a2 2 0 0 1 2 2v8a2 2 0 0 1 -2 2h-8a2 2 0 0 1 -2 -2l0 -8"}], ["path", {"d": "M7 12l4 0"}], ["path", {"d": "M9 10l0 4"}]]);
export const IconPlayerPlayFilled = icon([["path", {"d": "M6 4v16a1 1 0 0 0 1.524 .852l13 -8a1 1 0 0 0 0 -1.704l-13 -8a1 1 0 0 0 -1.524 .852z"}]], true);
export const IconBellRinging = icon([["path", {"d": "M10 5a2 2 0 1 1 4 0a7 7 0 0 1 4 6v3a4 4 0 0 0 2 3h-16a4 4 0 0 0 2 -3v-3a7 7 0 0 1 4 -6"}], ["path", {"d": "M9 17v1a3 3 0 0 0 6 0v-1"}], ["path", {"d": "M21 6.727a11.05 11.05 0 0 0 -2.794 -3.727"}], ["path", {"d": "M3 6.727a11.05 11.05 0 0 1 2.792 -3.727"}]]);
export const IconLayoutGrid = icon([["path", {"d": "M4 5a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -4"}], ["path", {"d": "M14 5a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -4"}], ["path", {"d": "M4 15a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -4"}], ["path", {"d": "M14 15a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -4"}]]);
export const IconWand = icon([["path", {"d": "M6 21l15 -15l-3 -3l-15 15l3 3"}], ["path", {"d": "M15 6l3 3"}], ["path", {"d": "M9 3a2 2 0 0 0 2 2a2 2 0 0 0 -2 2a2 2 0 0 0 -2 -2a2 2 0 0 0 2 -2"}], ["path", {"d": "M19 13a2 2 0 0 0 2 2a2 2 0 0 0 -2 2a2 2 0 0 0 -2 -2a2 2 0 0 0 2 -2"}]]);
export const IconDots = icon([["path", {"d": "M4 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"}], ["path", {"d": "M11 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"}], ["path", {"d": "M18 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"}]]);
export const IconChevronUp = icon([["path", {"d": "M6 15l6 -6l6 6"}]]);
export const IconEye = icon([["path", {"d": "M10 12a2 2 0 1 0 4 0a2 2 0 0 0 -4 0"}], ["path", {"d": "M21 12c-2.4 4 -5.4 6 -9 6c-3.6 0 -6.6 -2 -9 -6c2.4 -4 5.4 -6 9 -6c3.6 0 6.6 2 9 6"}]]);
