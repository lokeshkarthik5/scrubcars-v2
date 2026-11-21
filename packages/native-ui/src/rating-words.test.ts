import { describe, expect, test } from 'bun:test';

import * as native from './rating-words';

// Core's twin, loaded by path: this package has no dependency on @repo/core.
const coreUrl = new URL('../../core/src/ratings.ts', import.meta.url).href;

describe('rating marks: the apps’ words match core’s', () => {
  test('Google Maps, the G switch and the spoken names', async () => {
    const core = (await import(coreUrl)) as typeof native & { detlioRatingLabel: (rating: number) => string };
    expect(native.GOOGLE_MAPS_ATTRIBUTION).toBe(core.GOOGLE_MAPS_ATTRIBUTION);
    expect(native.GOOGLE_MAPS_ATTRIBUTION).toBe('Google Maps');
    expect(native.SHOW_GOOGLE_G).toBe(core.SHOW_GOOGLE_G);
    expect(native.GOOGLE_RATING_LABEL).toBe(core.GOOGLE_RATING_LABEL);
    for (const rating of [4, 4.25, 4.8, 5]) expect(native.ratingFigure(rating)).toBe(core.ratingFigure(rating));
    expect(core.detlioRatingLabel(4.8)).toBe('Detlio rating 4.8');
  });
});
