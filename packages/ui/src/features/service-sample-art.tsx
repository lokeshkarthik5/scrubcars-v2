'use client'

import { useId } from 'react'
import type { SampleArt } from '@repo/core/service-media'

/**
 * The drawn picture a service shows before its garage has added a photo:
 * a graphite panel with white line art for what the service does (foam for
 * a wash, a polish swirl for detailing, beading water for a coating…).
 * Never a photo of a car, so nobody could take it for this garage's work —
 * and wherever it appears it is tagged "Sample" or "Sample image" by the
 * caller. Which one a service gets is sampleArtFor in @repo/core.
 *
 * Drawn at 320×180 (16:9, the details sheet). `square` crops to the middle
 * of the motif for the 64px card thumbnail.
 */
export function ServiceSampleArt({
  art,
  square = false,
  className,
}: {
  art: SampleArt
  square?: boolean
  className?: string
}) {
  // Gradient ids are document-wide, and a garage page draws several of these.
  const id = useId().replace(/:/g, '')
  const ref = (name: string) => `url(#${name}${id})`

  return (
    <svg
      viewBox={square ? '84 40 156 156' : '0 0 320 180'}
      preserveAspectRatio="xMidYMid slice"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={`bg${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#25272E" />
          <stop offset="1" stopColor="#111216" />
        </linearGradient>
        <radialGradient id={`glow${id}`} cx=".74" cy=".18" r=".62">
          <stop offset="0" stopColor="#A9BED3" stopOpacity=".24" />
          <stop offset="1" stopColor="#A9BED3" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`panel${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#383B44" />
          <stop offset=".5" stopColor="#22242A" />
          <stop offset="1" stopColor="#16171B" />
        </linearGradient>
        <linearGradient id={`sheen${id}`} x1="0" x2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset=".6" stopColor="#fff" stopOpacity=".6" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <radialGradient id={`bubble${id}`} cx=".38" cy=".32" r=".8">
          <stop offset="0" stopColor="#fff" stopOpacity=".5" />
          <stop offset=".55" stopColor="#fff" stopOpacity=".08" />
          <stop offset="1" stopColor="#fff" stopOpacity=".26" />
        </radialGradient>
        <linearGradient id={`drop${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#EAF2FA" stopOpacity=".95" />
          <stop offset="1" stopColor="#9FB5CA" stopOpacity=".75" />
        </linearGradient>
      </defs>

      {/* The studio: a dark backdrop, a cool light top right, a panel curve. */}
      <rect y="-40" width="320" height="260" fill={ref('bg')} />
      <rect width="320" height="180" fill={ref('glow')} />
      <path d="M-10 132 C 70 100, 200 86, 330 102 V230 H-10Z" fill={ref('panel')} />
      <path d="M24 120 C 100 100, 200 91, 304 100" stroke={ref('sheen')} strokeWidth="1.6" fill="none" />
      <ellipse cx="166" cy="128" rx="80" ry="8" fill="#fff" fillOpacity=".045" />

      {art === 'wash' && <Foam bubble={ref('bubble')} drop={ref('drop')} />}
      {art === 'bike' && <Bike bubble={ref('bubble')} />}
      {art === 'detailing' && <Swirl />}
      {art === 'coating' && <Beads drop={ref('drop')} />}
      {art === 'scratch' && <Scratch />}
      {art === 'others' && <Spark x={162} y={92} size={16} />}

      {art !== 'others' && (
        <>
          <Spark x={238} y={74} size={10} />
          <Spark x={252} y={92} size={5} />
        </>
      )}
    </svg>
  )
}

/** A four-point sparkle, the "clean" mark. */
function Spark({ x, y, size }: { x: number; y: number; size: number }) {
  const s = size
  const w = s * 0.18
  return (
    <path
      d={`M${x} ${y - s} Q${x + w} ${y - w} ${x + s} ${y} Q${x + w} ${y + w} ${x} ${y + s} Q${x - w} ${y + w} ${x - s} ${y} Q${x - w} ${y - w} ${x} ${y - s}Z`}
      fill="#fff"
      fillOpacity=".92"
    />
  )
}

function Bubble({ cx, cy, r, fill }: { cx: number; cy: number; r: number; fill: string }) {
  return (
    <>
      <circle cx={cx} cy={cy} r={r} fill={fill} stroke="#fff" strokeOpacity=".5" strokeWidth=".8" />
      <circle cx={cx - r * 0.38} cy={cy - r * 0.42} r={Math.max(0.9, r * 0.22)} fill="#fff" fillOpacity=".85" />
    </>
  )
}

function Drop({ x, y, size, fill }: { x: number; y: number; size: number; fill: string }) {
  const s = size
  return (
    <path
      d={`M${x} ${y - s * 1.6} C ${x + s * 0.9} ${y - s * 0.4}, ${x + s} ${y + s * 0.2}, ${x} ${y + s} C ${x - s} ${y + s * 0.2}, ${x - s * 0.9} ${y - s * 0.4}, ${x} ${y - s * 1.6}Z`}
      fill={fill}
    />
  )
}

const FOAM: Array<[number, number, number]> = [
  [104, 121, 7], [120, 111, 13], [138, 124, 8], [143, 103, 10], [161, 113, 17],
  [150, 92, 5], [182, 104, 9], [178, 126, 10], [199, 116, 13], [191, 93, 4],
  [215, 106, 6], [226, 121, 8],
]

function Foam({ bubble, drop }: { bubble: string; drop: string }) {
  return (
    <>
      {FOAM.map(([cx, cy, r]) => (
        <Bubble key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} fill={bubble} />
      ))}
      <Drop x={112} y={70} size={6} fill={drop} />
      <Drop x={132} y={56} size={4.5} fill={drop} />
      <Drop x={100} y={88} size={3.5} fill={drop} />
    </>
  )
}

function Bike({ bubble }: { bubble: string }) {
  return (
    <>
      <g fill="none" stroke="#fff" strokeOpacity=".85" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="128" cy="112" r="17" />
        <circle cx="198" cy="112" r="17" />
        <path d="M128 112 L150 86 L178 86 L198 112 M150 86 L166 112 L128 112 M166 112 L178 86 M174 78 L186 78 M146 80 L158 80" />
      </g>
      {[[112, 128, 6], [218, 127, 7], [206, 132, 4], [120, 134, 4]].map(([cx, cy, r]) => (
        <Bubble key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} fill={bubble} />
      ))}
    </>
  )
}

function Swirl() {
  return (
    <g fill="none" stroke="#fff" strokeLinecap="round">
      <path d="M164 104 m-4 0 a4 4 0 1 1 8 0 a10 10 0 1 1 -20 0 a16 16 0 1 1 32 0 a22 22 0 1 1 -44 0 a28 28 0 1 1 56 0" strokeOpacity=".75" strokeWidth="1.6" />
      <path d="M118 128 C 140 136, 192 136, 214 124" strokeOpacity=".25" strokeWidth="1.2" />
    </g>
  )
}

const BEADS: Array<[number, number, number]> = [
  [118, 116, 3], [134, 108, 4.5], [152, 120, 3.5], [176, 112, 5], [196, 122, 3],
  [210, 110, 4], [142, 128, 2.5], [188, 130, 2.5],
]

function Beads({ drop }: { drop: string }) {
  return (
    <>
      <Drop x={164} y={74} size={13} fill={drop} />
      {BEADS.map(([cx, cy, r]) => (
        <g key={`${cx}-${cy}`}>
          <ellipse cx={cx} cy={cy} rx={r * 1.3} ry={r} fill={drop} fillOpacity=".7" />
          <ellipse cx={cx - r * 0.4} cy={cy - r * 0.35} rx={r * 0.35} ry={r * 0.25} fill="#fff" fillOpacity=".9" />
        </g>
      ))}
    </>
  )
}

function Scratch() {
  return (
    <g fill="none" strokeLinecap="round">
      <path d="M104 126 C 130 116, 150 110, 166 104" stroke="#fff" strokeOpacity=".7" strokeWidth="1.6" />
      <path d="M166 104 C 182 98, 200 94, 222 92" stroke="#fff" strokeOpacity=".22" strokeWidth="1.4" strokeDasharray="2 5" />
      <path d="M112 132 C 134 124, 148 119, 160 115" stroke="#fff" strokeOpacity=".35" strokeWidth="1" />
    </g>
  )
}
