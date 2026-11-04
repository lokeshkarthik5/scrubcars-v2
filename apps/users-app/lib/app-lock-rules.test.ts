import { expect, test } from 'bun:test';

import { canOfferLock, lockDecision } from './app-lock-rules';

test('only asks when it is on and the phone can', () => {
  expect(lockDecision({ enabled: true, hasHardware: true, enrolled: true })).toBe('ask');
  expect(lockDecision({ enabled: false, hasHardware: true, enrolled: true })).toBe('open');
  expect(lockDecision({ enabled: true, hasHardware: false, enrolled: false })).toBe('open');
  expect(lockDecision({ enabled: true, hasHardware: true, enrolled: false })).toBe('open');
});

test('the switch is offered only where it would work', () => {
  expect(canOfferLock({ hasHardware: true, enrolled: true })).toBe(true);
  expect(canOfferLock({ hasHardware: true, enrolled: false })).toBe(false);
});
