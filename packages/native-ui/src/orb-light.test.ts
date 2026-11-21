import { describe, expect, test } from 'bun:test';

import { lightArcs, lightAt, SPECTRUM, WHITE_LIGHT } from './orb-light';

const C = 33;
const R = 14.3;

/** The angle (clockwise from the top) of a point round (C, C). */
function angleOf(x: number, y: number) {
  return ((Math.atan2(x - C, C - y) * 180) / Math.PI + 360) % 360;
}

describe('the orb lights (NavOrb, the web .hub-orb)', () => {
  test('the red spectrum goes once round, its gaps near-black and its hot spots white', () => {
    expect(SPECTRUM[SPECTRUM.length - 1]!.at - SPECTRUM[0]!.at).toBe(360);
    expect(lightAt(SPECTRUM, 104).color).toBe('#FFFFFF');
    expect(lightAt(SPECTRUM, 190).color).toBe('#11060A');
    expect(lightAt(SPECTRUM, 360).color).toBe('#11060A');
    // Between two stops, the blend of the two.
    expect(lightAt(SPECTRUM, 58).color).toBe('#BD152B');
  });

  test('the spectrum is six arcs that meet, overlapping a little at each seam', () => {
    const arcs = lightArcs(SPECTRUM, C, R);
    expect(arcs).toHaveLength(6);
    for (let i = 0; i < arcs.length - 1; i++) {
      const end = arcs[i]!;
      const next = arcs[i + 1]!;
      const endAt = angleOf(end.x2, end.y2);
      const nextAt = angleOf(next.x1, next.y1);
      expect((endAt - nextAt + 360) % 360).toBeCloseTo(0.6, 2);
    }
    // The last closes the ring where the first began (28°).
    const last = arcs[arcs.length - 1]!;
    expect(angleOf(last.x2, last.y2)).toBeCloseTo(28, 2);
    expect(angleOf(arcs[0]!.x1, arcs[0]!.y1)).toBeCloseTo(28, 2);
  });

  test('every stop sits where its angle falls on the arc’s chord', () => {
    for (const arc of lightArcs(SPECTRUM, C, R)) {
      expect(arc.stops[0]!.offset).toBe(0);
      expect(arc.stops[arc.stops.length - 1]!.offset).toBe(1);
      const offsets = arc.stops.map((stop) => stop.offset);
      expect([...offsets].sort((a, b) => a - b)).toEqual(offsets);
    }
    // The white at 104° is in the second arc (88°–148.6°): its projection on the chord.
    const second = lightArcs(SPECTRUM, C, R)[1]!;
    const white = second.stops.find((stop) => stop.color === '#FFFFFF')!;
    const phi = 60.6;
    const expected =
      0.5 + (0.5 * Math.sin(((104 - 88 - phi / 2) * Math.PI) / 180)) / Math.sin(((phi / 2) * Math.PI) / 180);
    expect(white.offset).toBeCloseTo(expected, 3);
  });

  test('the white light is two see-through spots, brightest at 100° and 262°, with no overlap', () => {
    const arcs = WHITE_LIGHT.flatMap((spot) => lightArcs(spot, C, R, 60, 0));
    expect(arcs).toHaveLength(2);
    const peaks = arcs.map((arc) => Math.max(...arc.stops.map((stop) => stop.alpha)));
    expect(peaks).toEqual([0.95, 0.55]);
    for (const arc of arcs) {
      expect(arc.stops[0]!.alpha).toBe(0);
      expect(arc.stops[arc.stops.length - 1]!.alpha).toBe(0);
    }
  });

  test('every arc is drawn on the ring’s own radius', () => {
    for (const arc of lightArcs(SPECTRUM, C, R)) {
      expect(Math.hypot(arc.x1 - C, arc.y1 - C)).toBeCloseTo(R, 2);
      expect(Math.hypot(arc.x2 - C, arc.y2 - C)).toBeCloseTo(R, 2);
      expect(arc.d).toContain(`A${R} ${R} 0 0 1`);
    }
  });
});
