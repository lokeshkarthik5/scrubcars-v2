import { useId } from 'react'
import {
  CAR_BODY,
  CAR_GLASS,
  CAR_HEADLIGHT,
  CAR_PILLAR,
  CAR_ROOFLINE,
  CAR_SHOULDER,
  CAR_TAILLIGHT,
  CAR_VIEWBOX,
  CAR_WHEELS,
} from '@/lib/car-silhouette'

/**
 * The coupé silhouette (lib/car-silhouette.ts) as an SVG, coloured by its
 * container's CSS custom properties, so each gift design or prize tier
 * lights it its own way:
 *
 *   --car-top / --car-bottom  the body's gradient
 *   --car-rim                 the light along the roof and shoulder
 *   --car-glass               the side glass
 *   --car-tyre / --car-wheel  tyres and rims
 *
 * Decorative: always hidden from screen readers.
 */
export function CarSilhouette({ className, floor = true }: { className?: string; floor?: boolean }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const { width, height } = CAR_VIEWBOX
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className={className} aria-hidden focusable="false">
      <defs>
        <linearGradient id={`${id}-body`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--car-top, #3A3B44)' }} />
          <stop offset="1" style={{ stopColor: 'var(--car-bottom, #0D0D10)' }} />
        </linearGradient>
        <linearGradient id={`${id}-glass`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" style={{ stopColor: 'var(--car-glass, #0B0C10)' }} />
          <stop offset="0.55" style={{ stopColor: 'var(--car-glass, #0B0C10)' }} stopOpacity="0.85" />
          <stop offset="1" style={{ stopColor: 'var(--car-glass, #0B0C10)' }} />
        </linearGradient>
        <radialGradient id={`${id}-floor`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" style={{ stopColor: 'var(--car-floor, rgba(255,255,255,0.22))' }} />
          <stop offset="1" style={{ stopColor: 'var(--car-floor, rgba(255,255,255,0.22))' }} stopOpacity="0" />
        </radialGradient>
      </defs>
      {floor && <ellipse cx="305" cy="174" rx="290" ry="9" fill={`url(#${id}-floor)`} />}
      <path d={CAR_BODY} fill={`url(#${id}-body)`} />
      <path d={CAR_GLASS} fill={`url(#${id}-glass)`} />
      <path d={CAR_PILLAR} style={{ stroke: 'var(--car-bottom, #0D0D10)' }} strokeWidth="5" />
      <path d={CAR_ROOFLINE} fill="none" style={{ stroke: 'var(--car-rim, rgba(255,255,255,0.55))' }} strokeWidth="2.2" strokeLinecap="round" />
      <path d={CAR_SHOULDER} fill="none" style={{ stroke: 'var(--car-rim, rgba(255,255,255,0.55))' }} strokeOpacity="0.55" strokeWidth="1.4" strokeLinecap="round" />
      <path d={CAR_HEADLIGHT} style={{ fill: 'var(--car-light, rgba(255,255,255,0.85))' }} />
      <path d={CAR_TAILLIGHT} fill="#E4002B" />
      {CAR_WHEELS.map((w) => (
        <g key={w.cx}>
          <circle cx={w.cx} cy={w.cy} r={w.r} style={{ fill: 'var(--car-tyre, #070708)' }} />
          <circle cx={w.cx} cy={w.cy} r={w.r * 0.66} fill="none" style={{ stroke: 'var(--car-wheel, rgba(220,225,236,0.7))' }} strokeWidth="3" />
          <circle cx={w.cx} cy={w.cy} r={w.r * 0.42} fill="none" style={{ stroke: 'var(--car-wheel, rgba(220,225,236,0.7))' }} strokeOpacity="0.45" strokeWidth="6" strokeDasharray="4 6" />
          <circle cx={w.cx} cy={w.cy} r={w.r * 0.14} style={{ fill: 'var(--car-wheel, rgba(220,225,236,0.7))' }} />
        </g>
      ))}
    </svg>
  )
}
