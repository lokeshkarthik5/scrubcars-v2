import { describe, expect, test } from 'bun:test';

import { briefSource, carShortName, keptBox, stepOneProblem, videoTypeOf } from './repair-quote-view';

describe('repair quotes (app)', () => {
  test('the video type from the picker, else from the file', () => {
    expect(videoTypeOf('video/quicktime', 'file:///a.mov')).toBe('video/quicktime');
    expect(videoTypeOf(null, 'file:///a.MOV')).toBe('video/quicktime');
    expect(videoTypeOf(undefined, 'file:///a.webm')).toBe('video/webm');
    expect(videoTypeOf('video/3gpp', 'file:///a.3gp')).toBe('video/mp4');
  });

  test('the car’s short name', () => {
    expect(carShortName('Maruti Swift')).toBe('Swift');
    expect(carShortName('Creta')).toBe('Creta');
  });

  test('Next waits for a car, the damage, a line and a place, in that order', () => {
    const ready = { hasCar: true, hasMedia: true, note: 'Scraped', hasPlace: true };
    expect(stepOneProblem(ready)).toBeNull();
    expect(stepOneProblem({ ...ready, hasCar: false, hasMedia: false })).toBe('Add your car first');
    expect(stepOneProblem({ ...ready, hasMedia: false })).toBe('Add a video or a photo of the damage');
    expect(stepOneProblem({ ...ready, note: '  ' })).toBe('Say what happened in a line');
    expect(stepOneProblem({ ...ready, hasPlace: false })).toBe('Choose where the car is');
  });

  test('the brief’s source and the box on a picture that was sent', () => {
    expect(briefSource(null, 'mine')).toBe('customer');
    expect(briefSource('AI words', ' AI words ')).toBe('ai');
    expect(briefSource('AI words', 'Edited')).toBe('ai_edited');
    expect(keptBox({ image: 1 }, 2)).toEqual({ image: 1 });
    expect(keptBox({ image: 2 }, 2)).toBeNull();
    expect(keptBox(null, 2)).toBeNull();
  });
});
