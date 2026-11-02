/**
 * Where a person may be, the rules of the web's AppProvider
 * (apps/vendors/components/providers/app-provider.tsx) and its operator redirects.
 * Pure, so it can be tested.
 */
const GUEST_ROUTES = ['/', '/login', '/verify-otp'];
const ONBOARDING_CREATE_ROUTES = ['/onboarding/step-1', '/onboarding/step-2'];
/** An operator's nav is Home and Bookings; the server refuses the rest anyway. */
const OPERATOR_HIDDEN = ['/earnings', '/services', '/settings', '/agreement', '/guarantee', '/photos'];

const matches = (pathname: string, routes: string[]) =>
  routes.some((route) => pathname === route || pathname.startsWith(`${route}/`));

export interface GateState {
  signedIn: boolean;
  hasGarage: boolean;
  isAdmin: boolean;
  /** Overrides the hold below; the session gate leaves it out. */
  onboardingHold?: boolean;
}

/**
 * Step 2 of the wizard makes the garage, and from that moment the steps that make one are
 * "already done" and would send its owner home. The wizard holds the gate from just before the
 * garage exists until step 3 is on screen, so it can walk on to step 3 on its own terms.
 */
let held = false;
export const onboardingHold = {
  set: (on: boolean) => {
    held = on;
  },
  get: () => held,
};

/** The path to go to instead, or null to stay. */
export function gateRedirect(pathname: string, state: GateState): string | null {
  const landing = state.hasGarage ? '/home' : '/onboarding/step-1';
  const guest = pathname === '/' || matches(pathname, GUEST_ROUTES.slice(1));
  if (guest) {
    if (state.signedIn) return landing;
    return pathname === '/' ? '/login' : null;
  }
  if (!state.signedIn) return '/login';
  if (pathname.startsWith('/onboarding')) {
    const hold = state.onboardingHold ?? held;
    return state.hasGarage && !hold && matches(pathname, ONBOARDING_CREATE_ROUTES) ? '/home' : null;
  }
  if (!state.hasGarage) return '/onboarding/step-1';
  // Notifications is every seat's: the banner and "Alerts: Off" are an operator's way in.
  if (!state.isAdmin && pathname !== '/settings/notifications' && matches(pathname, OPERATOR_HIDDEN)) return '/home';
  return null;
}
