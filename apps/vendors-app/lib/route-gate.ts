/**
 * Where a person may be, the rules of the web's AppProvider
 * (apps/vendors/components/providers/app-provider.tsx) and its operator redirects.
 * Pure, so it can be tested.
 */
const GUEST_ROUTES = ['/', '/login', '/verify-otp'];
const ONBOARDING_CREATE_ROUTES = ['/onboarding/step-1', '/onboarding/step-2'];
/** An operator's nav is Home and Bookings; the server refuses the rest anyway. */
const OPERATOR_HIDDEN = ['/earnings', '/services', '/settings', '/agreement', '/guarantee'];

const matches = (pathname: string, routes: string[]) =>
  routes.some((route) => pathname === route || pathname.startsWith(`${route}/`));

export interface GateState {
  signedIn: boolean;
  hasGarage: boolean;
  isAdmin: boolean;
}

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
    return state.hasGarage && matches(pathname, ONBOARDING_CREATE_ROUTES) ? '/home' : null;
  }
  if (!state.hasGarage) return '/onboarding/step-1';
  // Notifications is every seat's: the banner and "Alerts: Off" are an operator's way in.
  if (!state.isAdmin && pathname !== '/settings/notifications' && matches(pathname, OPERATOR_HIDDEN)) return '/home';
  return null;
}
