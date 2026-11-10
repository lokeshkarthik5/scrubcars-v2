import { useReduceMotion } from '@repo/native-ui/motion';
import { useEffect, useMemo, useState } from 'react';
import { Polyline } from 'react-native-maps';

import { groundCurve, liftedCurve } from '@/lib/map-3d';
import type { LatLng } from '@/lib/map-view';

/** How long the route takes to draw when a garage is chosen. */
const DRAW_MS = 560;
/**
 * How many steps it draws in. Polylines can't be driven on the UI thread, so each step
 * is a re-render on the JS thread; a few coarse steps keep that to a handful of renders
 * instead of one a frame while the card strip and the chosen pin are busy too.
 */
const DRAW_STEPS = 4;

const toCoord = (point: LatLng) => ({ latitude: point.lat, longitude: point.lng });
/** cubic-bezier(.22,1,.36,1), near enough: quick out, settling in. */
const settle = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * The route from the customer to the chosen garage (§4; apps/users/components/map/
 * route-arc.tsx): an arc lifting off the map, its red shadow left on the ground under
 * it. The web projects a screen overlay on every move; react-native-maps draws lines
 * natively, under the pins and fixed to the streets, so the arc is worked out once in
 * map coordinates (lib/map-3d liftedCurve) and the map keeps it in place.
 *
 * Choosing a garage plays Route draw once: the line runs out from the customer to the
 * garage, whose dot pops as it lands (the chosen pin), in a few coarse steps since this
 * is JS-thread work (DRAW_STEPS). Under Reduce Motion the route is simply there. It takes
 * no taps.
 */
export function RouteArc({ from, to, pxPerLng }: { from?: LatLng; to?: LatLng | null; pxPerLng: number }) {
  const reduce = useReduceMotion();
  const [drawn, setDrawn] = useState(1);
  const fromLat = from?.lat;
  const fromLng = from?.lng;
  const toLat = to?.lat;
  const toLng = to?.lng;

  const route = useMemo(() => {
    if (fromLat === undefined || fromLng === undefined || toLat === undefined || toLng === undefined) return null;
    const ground = groundCurve({ lat: fromLat, lng: fromLng }, { lat: toLat, lng: toLng });
    return { ground, air: liftedCurve(ground, pxPerLng) };
    // The scale is read when the garage is chosen, not on every zoom.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromLat, fromLng, toLat, toLng]);

  // Route draw, once per garage chosen.
  useEffect(() => {
    if (!route) return;
    if (reduce) {
      setDrawn(1);
      return;
    }
    setDrawn(settle(1 / DRAW_STEPS));
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 2; i <= DRAW_STEPS; i++) {
      timers.push(setTimeout(() => setDrawn(settle(i / DRAW_STEPS)), ((i - 1) * DRAW_MS) / DRAW_STEPS));
    }
    return () => timers.forEach(clearTimeout);
  }, [route, reduce]);

  if (!route) return null;
  const count = Math.max(2, Math.round(drawn * (route.ground.length - 1)) + 1);
  const ground = route.ground.slice(0, count).map(toCoord);
  const air = route.air.slice(0, count).map(toCoord);
  return (
    <>
      {/* The shadow on the ground: a soft wide red, then its core. */}
      <Polyline coordinates={ground} strokeColor="rgba(228,0,43,0.2)" strokeWidth={8} lineCap="round" zIndex={1} />
      <Polyline coordinates={ground} strokeColor="rgba(228,0,43,0.62)" strokeWidth={3.4} lineCap="round" zIndex={2} />
      {/* The arc: a red glow under a pale line. */}
      <Polyline coordinates={air} strokeColor="rgba(228,0,43,0.5)" strokeWidth={6} lineCap="round" zIndex={3} />
      <Polyline coordinates={air} strokeColor="rgba(255,255,255,0.55)" strokeWidth={2.2} lineCap="round" zIndex={4} />
    </>
  );
}
