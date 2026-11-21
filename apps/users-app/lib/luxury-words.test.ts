import { describe, expect, test } from 'bun:test';

import { luxuryCaption, luxuryPeekWords } from '@repo/core/luxury';

// The same words as the website (apps/users/components/garages/luxury-list.test.tsx).
describe('the list with "Luxury specialists" on (0083)', () => {
  test('the map peek counts specialists, near the customer or in their city', () => {
    expect(luxuryPeekWords(3, false, true, 'Chennai')).toBe('specialists near you');
    expect(luxuryPeekWords(1, false, true, 'Chennai')).toBe('specialist near you');
    expect(luxuryPeekWords(1, true, true, 'Chennai')).toBe('specialists near you');
    expect(luxuryPeekWords(2, false, false, 'Madurai')).toBe('specialists in Madurai');
    expect(luxuryPeekWords(1, false, false, 'Madurai')).toBe('specialist in Madurai');
  });

  test('the heading line says who approved them, and the order when nearest first', () => {
    expect(luxuryCaption(true)).toBe('Approved by Detlio for luxury cars · nearest first');
    expect(luxuryCaption(false)).toBe('Approved by Detlio for luxury cars');
  });
});
