'use client'

import { Component, type ReactNode } from 'react'
import dynamic from 'next/dynamic'
import type { CoverageMapProps } from './coverage-map-inner'

export type {
  CoverageMapProps,
  MapDot,
  MapRing,
  DotTone,
} from './coverage-map-inner'

/**
 * The Coverage map, in the browser only (MapLibre needs a window), with the
 * same shimmer as every other placeholder while it loads.
 */
const MapView = dynamic<CoverageMapProps>(
  () => import('./coverage-map-inner'),
  {
    ssr: false,
    loading: () => <div className="h-full w-full rounded-[14px] shimmer" />,
  }
)

/**
 * A browser that can't draw the map (no WebGL) gets a line instead of a
 * page that fails: the zone list does everything the map does.
 */
class MapBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="flex h-full w-full items-center justify-center rounded-[14px] border border-border px-4 text-center text-[12.5px] text-text-secondary">
          The map can’t be drawn in this browser. The zone list has everything
          on it.
        </div>
      )
    }
    return this.props.children
  }
}

export function CoverageMap(props: CoverageMapProps) {
  return (
    <MapBoundary>
      <MapView {...props} />
    </MapBoundary>
  )
}

/** The map's key: the zones' colours and the dots. */
export function MapLegend({ finder = false }: { finder?: boolean }) {
  const swatch = 'inline-block size-2.5 rounded-[3px]'
  const dot = 'inline-block size-2.5 rounded-full'
  return (
    <ul
      aria-label="Map key"
      className="flex flex-wrap gap-x-3 gap-y-1 text-[11.5px] text-text-secondary"
    >
      {!finder && (
        <>
          <li className="flex items-center gap-1.5">
            <span className={`${swatch} bg-tone-done-dot/70`} aria-hidden />{' '}
            Target met
          </li>
          <li className="flex items-center gap-1.5">
            <span
              className={`${swatch} bg-tone-attention-dot/70`}
              aria-hidden
            />{' '}
            In progress
          </li>
          <li className="flex items-center gap-1.5">
            <span className={`${swatch} bg-tone-late-dot/70`} aria-hidden />{' '}
            Priority, nothing live
          </li>
        </>
      )}
      {finder && (
        <li className="flex items-center gap-1.5">
          <span
            className={`${dot} border-2 border-tone-progress-dot`}
            aria-hidden
          />{' '}
          Found, new to you
        </li>
      )}
      <li className="flex items-center gap-1.5">
        <span className={`${dot} bg-tone-done-dot`} aria-hidden /> Onboarded
      </li>
      <li className="flex items-center gap-1.5">
        <span className={`${dot} bg-tone-attention-dot`} aria-hidden /> To
        target
      </li>
      <li className="flex items-center gap-1.5">
        <span className={`${dot} bg-tone-late-dot`} aria-hidden /> Not
        interested
      </li>
    </ul>
  )
}
