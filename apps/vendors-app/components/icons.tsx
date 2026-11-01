import Svg, { Circle, Path, Rect } from 'react-native-svg';

/**
 * The web's Tabler icons, the same drawings (from @tabler/icons-react 3.46.0, MIT).
 * Only the ones the app uses, because Metro does not tree-shake: the icon package
 * would put all 5,000 in the bundle. To add one, copy its __iconNode from
 * node_modules/@tabler/icons-react/dist/esm/icons/Icon<Name>.mjs.
 */
export interface IconProps {
  size?: number;
  stroke?: number;
  color?: string;
}

type Node =
  | ['path', { d: string }]
  | ['circle', { cx: string; cy: string; r: string }]
  | ['rect', { x: string; y: string; width: string; height: string; rx?: string }];

function icon(nodes: Node[], filled = false) {
  return function Icon({ size = 24, stroke = 2, color = '#FAFAFA' }: IconProps) {
    const paint = filled
      ? { fill: color }
      : {
          fill: 'none',
          stroke: color,
          strokeWidth: stroke,
          strokeLinecap: 'round' as const,
          strokeLinejoin: 'round' as const,
        };
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" {...paint}>
        {nodes.map((node, index) => {
          if (node[0] === 'path') return <Path key={index} {...node[1]} />;
          if (node[0] === 'circle') return <Circle key={index} {...node[1]} />;
          return <Rect key={index} {...node[1]} />;
        })}
      </Svg>
    );
  };
}

export const IconAlarm = icon([["path", {"d": "M5 13a7 7 0 1 0 14 0a7 7 0 1 0 -14 0"}], ["path", {"d": "M12 10l0 3l2 0"}], ["path", {"d": "M7 4l-2.75 2"}], ["path", {"d": "M17 4l2.75 2"}]]);
export const IconAlertCircle = icon([["path", {"d": "M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0"}], ["path", {"d": "M12 8v4"}], ["path", {"d": "M12 16h.01"}]]);
export const IconAlertTriangle = icon([["path", {"d": "M12 9v4"}], ["path", {"d": "M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636 -2.87l-8.106 -13.536a1.914 1.914 0 0 0 -3.274 0"}], ["path", {"d": "M12 16h.01"}]]);
export const IconArrowLeft = icon([["path", {"d": "M5 12l14 0"}], ["path", {"d": "M5 12l6 6"}], ["path", {"d": "M5 12l6 -6"}]]);
export const IconBell = icon([["path", {"d": "M10 5a2 2 0 1 1 4 0a7 7 0 0 1 4 6v3a4 4 0 0 0 2 3h-16a4 4 0 0 0 2 -3v-3a7 7 0 0 1 4 -6"}], ["path", {"d": "M9 17v1a3 3 0 0 0 6 0v-1"}]]);
export const IconBellOff = icon([["path", {"d": "M9.346 5.353c.21 -.129 .428 -.246 .654 -.353a2 2 0 1 1 4 0a7 7 0 0 1 4 6v3m-1 3h-13a4 4 0 0 0 2 -3v-3a6.996 6.996 0 0 1 1.273 -3.707"}], ["path", {"d": "M9 17v1a3 3 0 0 0 6 0v-1"}], ["path", {"d": "M3 3l18 18"}]]);
export const IconCalendar = icon([["path", {"d": "M4 7a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2v-12"}], ["path", {"d": "M16 3v4"}], ["path", {"d": "M8 3v4"}], ["path", {"d": "M4 11h16"}], ["path", {"d": "M11 15h1"}], ["path", {"d": "M12 15v3"}]]);
export const IconCalendarCheck = icon([["path", {"d": "M11.5 21h-5.5a2 2 0 0 1 -2 -2v-12a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v6"}], ["path", {"d": "M16 3v4"}], ["path", {"d": "M8 3v4"}], ["path", {"d": "M4 11h16"}], ["path", {"d": "M15 19l2 2l4 -4"}]]);
export const IconCalendarEvent = icon([["path", {"d": "M4 7a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2l0 -12"}], ["path", {"d": "M16 3l0 4"}], ["path", {"d": "M8 3l0 4"}], ["path", {"d": "M4 11l16 0"}], ["path", {"d": "M8 15h2v2h-2l0 -2"}]]);
export const IconCalendarQuestion = icon([["path", {"d": "M15 21h-9a2 2 0 0 1 -2 -2v-12a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v4"}], ["path", {"d": "M16 3v4"}], ["path", {"d": "M8 3v4"}], ["path", {"d": "M4 11h16"}], ["path", {"d": "M19 22v.01"}], ["path", {"d": "M19 19a2.003 2.003 0 0 0 .914 -3.782a1.98 1.98 0 0 0 -2.414 .483"}]]);
export const IconCamera = icon([["path", {"d": "M5 7h1a2 2 0 0 0 2 -2a1 1 0 0 1 1 -1h6a1 1 0 0 1 1 1a2 2 0 0 0 2 2h1a2 2 0 0 1 2 2v9a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-9a2 2 0 0 1 2 -2"}], ["path", {"d": "M9 13a3 3 0 1 0 6 0a3 3 0 0 0 -6 0"}]]);
export const IconCar = icon([["path", {"d": "M5 17a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"}], ["path", {"d": "M15 17a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"}], ["path", {"d": "M5 17h-2v-6l2 -5h9l4 5h1a2 2 0 0 1 2 2v4h-2m-4 0h-6m-6 -6h15m-6 0v-5"}]]);
export const IconChartBar = icon([["path", {"d": "M3 13a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v6a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -6"}], ["path", {"d": "M15 9a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v10a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -10"}], ["path", {"d": "M9 5a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v14a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -14"}], ["path", {"d": "M4 20h14"}]]);
export const IconCheck = icon([["path", {"d": "M5 12l5 5l10 -10"}]]);
export const IconChevronDown = icon([["path", {"d": "M6 9l6 6l6 -6"}]]);
export const IconChevronRight = icon([["path", {"d": "M9 6l6 6l-6 6"}]]);
export const IconCircleCheck = icon([["path", {"d": "M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0"}], ["path", {"d": "M9 12l2 2l4 -4"}]]);
export const IconCircleDashed = icon([["path", {"d": "M8.56 3.69a9 9 0 0 0 -2.92 1.95"}], ["path", {"d": "M3.69 8.56a9 9 0 0 0 -.69 3.44"}], ["path", {"d": "M3.69 15.44a9 9 0 0 0 1.95 2.92"}], ["path", {"d": "M8.56 20.31a9 9 0 0 0 3.44 .69"}], ["path", {"d": "M15.44 20.31a9 9 0 0 0 2.92 -1.95"}], ["path", {"d": "M20.31 15.44a9 9 0 0 0 .69 -3.44"}], ["path", {"d": "M20.31 8.56a9 9 0 0 0 -1.95 -2.92"}], ["path", {"d": "M15.44 3.69a9 9 0 0 0 -3.44 -.69"}]]);
export const IconHome = icon([["path", {"d": "M5 12l-2 0l9 -9l9 9l-2 0"}], ["path", {"d": "M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-7"}], ["path", {"d": "M9 21v-6a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v6"}]]);
export const IconInfoCircle = icon([["path", {"d": "M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0"}], ["path", {"d": "M12 9h.01"}], ["path", {"d": "M11 12h1v4h1"}]]);
export const IconInbox = icon([["path", {"d": "M4 6a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2l0 -12"}], ["path", {"d": "M4 13h3l3 3h4l3 -3h3"}]]);
export const IconLoader2 = icon([["path", {"d": "M12 3a9 9 0 1 0 9 9"}]]);
export const IconLogout = icon([["path", {"d": "M14 8v-2a2 2 0 0 0 -2 -2h-7a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h7a2 2 0 0 0 2 -2v-2"}], ["path", {"d": "M9 12h12l-3 -3"}], ["path", {"d": "M18 15l3 -3"}]]);
export const IconMapPin = icon([["path", {"d": "M9 11a3 3 0 1 0 6 0a3 3 0 0 0 -6 0"}], ["path", {"d": "M17.657 16.657l-4.243 4.243a2 2 0 0 1 -2.827 0l-4.244 -4.243a8 8 0 1 1 11.314 0"}]]);
export const IconPhoneOff = icon([["path", {"d": "M3 21l18 -18"}], ["path", {"d": "M5.831 14.161a15.946 15.946 0 0 1 -2.831 -8.161a2 2 0 0 1 2 -2h4l2 5l-2.5 1.5c.108 .22 .223 .435 .345 .645m1.751 2.277c.843 .84 1.822 1.544 2.904 2.078l1.5 -2.5l5 2v4a2 2 0 0 1 -2 2a15.963 15.963 0 0 1 -10.344 -4.657"}]]);
export const IconRefresh = icon([["path", {"d": "M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4"}], ["path", {"d": "M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4"}]]);
export const IconSettings = icon([["path", {"d": "M10.325 4.317c.426 -1.756 2.924 -1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543 -.94 3.31 .826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756 .426 1.756 2.924 0 3.35a1.724 1.724 0 0 0 -1.066 2.573c.94 1.543 -.826 3.31 -2.37 2.37a1.724 1.724 0 0 0 -2.572 1.065c-.426 1.756 -2.924 1.756 -3.35 0a1.724 1.724 0 0 0 -2.573 -1.066c-1.543 .94 -3.31 -.826 -2.37 -2.37a1.724 1.724 0 0 0 -1.065 -2.572c-1.756 -.426 -1.756 -2.924 0 -3.35a1.724 1.724 0 0 0 1.066 -2.573c-.94 -1.543 .826 -3.31 2.37 -2.37c1 .608 2.296 .07 2.572 -1.065"}], ["path", {"d": "M9 12a3 3 0 1 0 6 0a3 3 0 0 0 -6 0"}]]);
export const IconShieldCheck = icon([["path", {"d": "M11.46 20.846a12 12 0 0 1 -7.96 -14.846a12 12 0 0 0 8.5 -3a12 12 0 0 0 8.5 3a12 12 0 0 1 -.09 7.06"}], ["path", {"d": "M15 19l2 2l4 -4"}]]);
export const IconShieldLock = icon([["path", {"d": "M12 3a12 12 0 0 0 8.5 3a12 12 0 0 1 -8.5 15a12 12 0 0 1 -8.5 -15a12 12 0 0 0 8.5 -3"}], ["path", {"d": "M11 11a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"}], ["path", {"d": "M12 12l0 2.5"}]]);
export const IconStar = icon([["path", {"d": "M12 17.75l-6.172 3.245l1.179 -6.873l-5 -4.867l6.9 -1l3.086 -6.253l3.086 6.253l6.9 1l-5 4.867l1.179 6.873l-6.158 -3.245"}]]);
export const IconStarFilled = icon([["path", {"d": "M8.243 7.34l-6.38 .925l-.113 .023a1 1 0 0 0 -.44 1.684l4.622 4.499l-1.09 6.355l-.013 .11a1 1 0 0 0 1.464 .944l5.706 -3l5.693 3l.1 .046a1 1 0 0 0 1.352 -1.1l-1.091 -6.355l4.624 -4.5l.078 -.085a1 1 0 0 0 -.633 -1.62l-6.38 -.926l-2.852 -5.78a1 1 0 0 0 -1.794 0l-2.853 5.78z"}]], true);
export const IconTool = icon([["path", {"d": "M7 10h3v-3l-3.5 -3.5a6 6 0 0 1 8 8l6 6a2 2 0 0 1 -3 3l-6 -6a6 6 0 0 1 -8 -8l3.5 3.5"}]]);
export const IconX = icon([["path", {"d": "M18 6l-12 12"}], ["path", {"d": "M6 6l12 12"}]]);
