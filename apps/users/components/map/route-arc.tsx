'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useMap } from '@repo/ui/sc/map'
import { usePrefersReducedMotion } from '@repo/ui/finish/motion'
import { arcLift, groundCurve, pathThrough } from '@/lib/map-3d'
import type { LatLng } from '@/lib/map-view'

/** How long the route takes to draw when a garage is chosen. */
const DRAW_MS = 560

/**
 * The route from the customer to the chosen garage (customer UI round, Nov
 * 2026, §4): an arc lifting off the map in 3D, its blurred red shadow left on
 * the ground under it. MapLibre has no 3D line, so this is a screen overlay
 * worked out from map coordinates (lib/map-3d.ts) and projected again on
 * every move of the map, which keeps it on its streets through a pan, a zoom
 * or a glide.
 *
 * Choosing a garage plays Route draw once: the line runs out from the
 * customer with a light at its tip, and the garage's dot pops as it lands
 * (GaragePins). Under reduced motion the route is simply there.
 *
 * Drawn under the pins and above the streets (in a layer placed right after
 * the map's canvas, so every marker paints over it); it takes no taps.
 */
export function RouteArc({ from, to }: { from?: LatLng; to?: LatLng | null }) {
  const { map } = useMap()
  const reduce = usePrefersReducedMotion()
  const shadeRef = useRef<SVGPathElement>(null)
  const glowRef = useRef<SVGPathElement>(null)
  const lineRef = useRef<SVGPathElement>(null)
  const tipRef = useRef<HTMLSpanElement>(null)
  // The layer between the streets and the markers: made once, and put in
  // place right after the map's canvas once there is a map.
  const [host] = useState<HTMLDivElement | null>(() => {
    if (typeof document === 'undefined') return null
    const layer = document.createElement('div')
    layer.className = 'pointer-events-none absolute inset-0'
    return layer
  })
  const [placed, setPlaced] = useState(false)
  useEffect(() => {
    if (!map || !host) return
    map.getCanvas().after(host)
    // Drawn into from the next frame, once the layer is in the page.
    const frame = requestAnimationFrame(() => setPlaced(true))
    return () => {
      cancelAnimationFrame(frame)
      host.remove()
    }
  }, [map, host])

  const fromLat = from?.lat
  const fromLng = from?.lng
  const toLat = to?.lat
  const toLng = to?.lng

  // Projected again on every move, straight onto the paths: a React render
  // per frame of a pan would be wasted work for three attributes.
  useEffect(() => {
    if (!map || !placed || fromLat === undefined || fromLng === undefined || toLat === undefined || toLng === undefined) {
      return
    }
    const curve = groundCurve({ lat: fromLat, lng: fromLng }, { lat: toLat, lng: toLng })
    const draw = () => {
      const ground = curve.map((point) => map.project([point.lng, point.lat]))
      const lift = arcLift(ground, map.getPitch())
      const air = pathThrough(ground.map((point, i) => ({ x: point.x, y: point.y - lift[i] })))
      shadeRef.current?.setAttribute('d', pathThrough(ground))
      glowRef.current?.setAttribute('d', air)
      lineRef.current?.setAttribute('d', air)
      if (tipRef.current) tipRef.current.style.offsetPath = `path('${air}')`
    }
    draw()
    map.on('move', draw)
    map.on('resize', draw)
    return () => {
      map.off('move', draw)
      map.off('resize', draw)
    }
  }, [map, placed, fromLat, fromLng, toLat, toLng])

  // Route draw, once per garage chosen.
  useEffect(() => {
    if (!placed || toLat === undefined || fromLat === undefined) return
    const paths = [shadeRef.current, glowRef.current, lineRef.current].filter(
      (path): path is SVGPathElement => path !== null
    )
    if (reduce) {
      for (const path of paths) {
        path.style.transition = 'none'
        path.style.strokeDashoffset = '0'
      }
      return
    }
    for (const path of paths) {
      path.style.transition = 'none'
      path.style.strokeDasharray = '1'
      path.style.strokeDashoffset = '1'
    }
    const frame = requestAnimationFrame(() => {
      for (const path of paths) {
        void path.getBoundingClientRect()
        path.style.transition = `stroke-dashoffset ${DRAW_MS}ms cubic-bezier(.22,1,.36,1)`
        path.style.strokeDashoffset = '0'
      }
      const tip = tipRef.current
      tip?.getAnimations().forEach((animation) => animation.cancel())
      tip?.animate(
        [
          { offsetDistance: '0%', opacity: 1 },
          { offsetDistance: '85%', opacity: 1, offset: 0.85 },
          { offsetDistance: '100%', opacity: 0 },
        ],
        { duration: DRAW_MS, easing: 'cubic-bezier(.22,1,.36,1)' }
      )
    })
    return () => cancelAnimationFrame(frame)
  }, [placed, fromLat, fromLng, toLat, toLng, reduce])

  if (!host || !placed || fromLat === undefined || toLat === undefined) return null

  return createPortal(
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <svg className="absolute inset-0 size-full overflow-visible">
        <defs>
          <filter id="route-shadow" x="-10%" y="-10%" width="120%" height="120%">
            <feGaussianBlur stdDeviation="1.8" />
          </filter>
        </defs>
        <path
          ref={shadeRef}
          pathLength={1}
          fill="none"
          stroke="rgb(228 0 43 / 0.62)"
          strokeWidth={3.4}
          strokeLinecap="round"
          filter="url(#route-shadow)"
        />
        <path
          ref={glowRef}
          pathLength={1}
          fill="none"
          stroke="rgb(228 0 43 / 0.5)"
          strokeWidth={6}
          strokeLinecap="round"
          className="blur-[6px]"
        />
        <path
          ref={lineRef}
          pathLength={1}
          fill="none"
          stroke="rgb(255 255 255 / 0.55)"
          strokeWidth={2.2}
          strokeLinecap="round"
        />
      </svg>
      {/* The light at the tip while it draws. */}
      <span
        ref={tipRef}
        className="absolute left-0 top-0 size-[9px] rounded-full bg-white opacity-0 shadow-[0_0_8px_2px_rgb(255_140_160/0.95),0_0_22px_8px_rgb(228_0_43/0.65)] [offset-rotate:0deg]"
      />
    </div>,
    host
  )
}
