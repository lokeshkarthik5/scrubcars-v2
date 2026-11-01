import Svg, { Path } from 'react-native-svg';

import type { IconProps } from '@repo/native-ui/icons';

/**
 * The Tabler icons the owner screens (agreement, documents, team, photos) use that
 * components/icons.tsx does not have. Drawn here rather than appended there, since other
 * screens add to that file at the same time. Same drawings as @tabler/icons-react 3.46.0 (MIT).
 */
function draw(paths: string[], filled = false) {
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
        {paths.map((d, index) => (
          <Path key={index} d={d} />
        ))}
      </Svg>
    );
  };
}

export const IconEye = draw([
  'M10 12a2 2 0 1 0 4 0a2 2 0 0 0 -4 0',
  'M21 12c-2.4 4 -5.4 6 -9 6c-3.6 0 -6.6 -2 -9 -6c2.4 -4 5.4 -6 9 -6c3.6 0 6.6 2 9 6',
]);

export const IconUpload = draw(['M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2', 'M7 9l5 -5l5 5', 'M12 4l0 12']);

export const IconExternalLink = draw(['M12 6h-6a2 2 0 0 0 -2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-6', 'M11 13l9 -9', 'M15 4h5v5']);

export const IconBuildingStore = draw([
  'M3 21l18 0',
  'M3 7v1a3 3 0 0 0 6 0v-1m0 1a3 3 0 0 0 6 0v-1m0 1a3 3 0 0 0 6 0v-1h-18l2 -4h14l2 4',
  'M5 21l0 -10.15',
  'M19 21l0 -10.15',
  'M9 21v-4a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v4',
]);

export const IconShieldCheckFilled = draw(
  [
    'M11.998 2l.118 .007l.059 .008l.061 .013l.111 .034a.993 .993 0 0 1 .217 .112l.104 .082l.255 .218a11 11 0 0 0 7.189 2.537l.342 -.01a1 1 0 0 1 1.005 .717a13 13 0 0 1 -9.208 16.25a1 1 0 0 1 -.502 0a13 13 0 0 1 -9.209 -16.25a1 1 0 0 1 1.005 -.717a11 11 0 0 0 7.531 -2.527l.263 -.225l.096 -.075a.993 .993 0 0 1 .217 -.112l.112 -.034a.97 .97 0 0 1 .119 -.021l.115 -.007zm3.71 7.293a1 1 0 0 0 -1.415 0l-3.293 3.292l-1.293 -1.292l-.094 -.083a1 1 0 0 0 -1.32 1.497l2 2l.094 .083a1 1 0 0 0 1.32 -.083l4 -4l.083 -.094a1 1 0 0 0 -.083 -1.32z',
  ],
  true
);

export const IconFileText = draw([
  'M14 3v4a1 1 0 0 0 1 1h4',
  'M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2',
  'M9 9l1 0',
  'M9 13l6 0',
  'M9 17l6 0',
]);

export const IconPhoto = draw([
  'M15 8h.01',
  'M3 6a3 3 0 0 1 3 -3h12a3 3 0 0 1 3 3v12a3 3 0 0 1 -3 3h-12a3 3 0 0 1 -3 -3v-12',
  'M3 16l5 -5c.928 -.893 2.072 -.893 3 0l5 5',
  'M14 14l1 -1c.928 -.893 2.072 -.893 3 0l3 3',
]);
