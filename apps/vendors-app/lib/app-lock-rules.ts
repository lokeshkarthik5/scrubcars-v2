/** The optional app lock's rules, pure so they are tested. A phone that can't lock never blocks. */
export type LockDecision = 'open' | 'ask';

export function lockDecision(state: { enabled: boolean; hasHardware: boolean; enrolled: boolean }): LockDecision {
  return state.enabled && state.hasHardware && state.enrolled ? 'ask' : 'open';
}

/** Whether the Profile switch can be offered: a phone with a face or finger set up. */
export const canOfferLock = (state: { hasHardware: boolean; enrolled: boolean }) => state.hasHardware && state.enrolled;
