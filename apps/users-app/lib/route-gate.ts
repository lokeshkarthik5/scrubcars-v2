/**
 * Where a person may be: the rules of the web's AppProvider
 * (apps/users/components/providers/app-provider.tsx). Everything is open to a guest
 * except their own feed; checkout signs in at its own last step. Pure, so it is tested.
 */
const SIGN_IN_ROUTES = ['/login', '/verify-otp'];
const CUSTOMER_ROUTES = ['/profile-setup', '/updates', '/requests'];

const under = (pathname: string, routes: string[]) =>
  routes.some((route) => pathname === route || pathname.startsWith(`${route}/`));

export interface GateState {
  signedIn: boolean;
  /** The placeholder name 'User': sign-up isn't finished. */
  incomplete: boolean;
}

/** Where a signed-in customer lands. */
export const landing = (state: GateState) => (state.incomplete ? '/profile-setup' : '/home');

/** The path to go to instead, or null to stay. */
export function gateRedirect(pathname: string, state: GateState): string | null {
  if (pathname === '/') return state.signedIn ? landing(state) : '/garages';
  if (under(pathname, SIGN_IN_ROUTES)) return state.signedIn ? landing(state) : null;
  // The hub is a signed-in customer's own page: a guest's Home is the list.
  if (pathname === '/home' && !state.signedIn) return '/garages';
  if (under(pathname, CUSTOMER_ROUTES)) {
    if (!state.signedIn) return '/login';
    if (state.incomplete && pathname !== '/profile-setup') return '/profile-setup';
  }
  return null;
}
