/**
 * In place of packages/core/src/stores/auth-store.ts (metro.config.js), which needs
 * localStorage. Only garage sign-up in api/vendors.ts reads it, and this app never
 * calls that. The app's session store is lib/auth.ts.
 */
export const useAuthStore = {
  getState(): never {
    throw new Error('The customer app\'s session is lib/auth.ts.');
  },
};
