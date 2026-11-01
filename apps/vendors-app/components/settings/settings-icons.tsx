import Svg, { Path } from 'react-native-svg';

import type { IconProps } from '@/components/icons';

/**
 * The three Tabler icons Settings' link rows use, drawn here rather than appended to
 * components/icons.tsx (other screens add to it at the same time). Same drawings as
 * @tabler/icons-react 3.46.0 (MIT).
 */
function draw(paths: string[]) {
  return function Icon({ size = 24, stroke = 2, color = '#FAFAFA' }: IconProps) {
    return (
      <Svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {paths.map((d, index) => (
          <Path key={index} d={d} />
        ))}
      </Svg>
    );
  };
}

export const IconPhoto = draw([
  'M15 8h.01',
  'M3 6a3 3 0 0 1 3 -3h12a3 3 0 0 1 3 3v12a3 3 0 0 1 -3 3h-12a3 3 0 0 1 -3 -3v-12',
  'M3 16l5 -5c.928 -.893 2.072 -.893 3 0l5 5',
  'M14 14l1 -1c.928 -.893 2.072 -.893 3 0l3 3',
]);

export const IconFileCertificate = draw([
  'M14 3v4a1 1 0 0 0 1 1h4',
  'M5 8v-3a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2h-5',
  'M3 14a3 3 0 1 0 6 0a3 3 0 1 0 -6 0',
  'M4.5 17l-1.5 5l3 -1.5l3 1.5l-1.5 -5',
]);

export const IconFileText = draw([
  'M14 3v4a1 1 0 0 0 1 1h4',
  'M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2',
  'M9 9l1 0',
  'M9 13l6 0',
  'M9 17l6 0',
]);
