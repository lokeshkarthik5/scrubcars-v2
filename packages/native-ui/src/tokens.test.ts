import { describe, expect, test } from 'bun:test';

import { darkTokens, lightTokens, parseAppearance, resolveScheme, tokensFor } from './tokens';

function luminance(hex: string) {
  const parts = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = parts.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe('appearance', () => {
  test('starts on Dark, and an odd stored value is Dark', () => {
    expect(parseAppearance(null)).toBe('dark');
    expect(parseAppearance('blue')).toBe('dark');
    expect(parseAppearance('light')).toBe('light');
  });
  test('System follows the phone; a phone with no answer gets Dark', () => {
    expect(resolveScheme('system', 'light')).toBe('light');
    expect(resolveScheme('system', 'dark')).toBe('dark');
    expect(resolveScheme('system', null)).toBe('dark');
    expect(resolveScheme('dark', 'light')).toBe('dark');
    expect(resolveScheme('light', 'dark')).toBe('light');
  });
  test('tokensFor', () => {
    expect(tokensFor('light')).toBe(lightTokens);
    expect(tokensFor('dark')).toBe(darkTokens);
  });
});

describe('the light table the owner approved', () => {
  const t = lightTokens;
  test.each([
    ['text 1 on canvas', t.textPrimary, t.canvas, 18.37],
    ['text 1 on card', t.textPrimary, t.surface, 19.66],
    ['text 2 on card', t.textSecondary, t.surface, 8.78],
    ['text 3 on canvas', t.textMuted, t.canvas, 5.65],
    ['red text on card', t.redText, t.surface, 6.21],
    ['white on red fill', t.white, t.redFill, 4.85],
  ])('%s', (_name, fg, bg, ratio) => {
    expect(contrast(fg as string, bg as string)).toBeCloseTo(ratio as number, 1);
  });
  test('the dark app\'s red and amber text are not used on white', () => {
    expect(t.redText).not.toBe(darkTokens.redText);
    expect(t.warning).not.toBe(darkTokens.warning);
    expect(contrast(t.warning, t.surface)).toBeGreaterThan(4.5);
  });
});

test('both themes have the same names', () => {
  expect(Object.keys(lightTokens).sort()).toEqual(Object.keys(darkTokens).sort());
});
