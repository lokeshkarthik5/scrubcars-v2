const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

/**
 * One copy of each of these, the app's, wherever the import comes from. The
 * apps use React 19.3.0 and packages/core's dev dependency is 19.2.4, so without
 * this a store in core renders with a second React and every hook throws.
 */
const SINGLE_COPY = ['react', 'react-native', '@tanstack/react-query', 'zustand'];
const FROM_APP = path.join(__dirname, 'package.json');

/**
 * Browser-bound files in packages/core: localStorage, document, Razorpay's
 * script, a canvas. They must never reach the phone, even through another file
 * (api/auth.ts imports analytics, api/vendors.ts the auth store), so the bundle
 * fails here rather than on someone's phone. The app's own versions are in lib/.
 */
const BROWSER_ONLY =
  /packages[\\/]core[\\/]src[\\/](analytics|push|razorpay|image-upload|booking-draft|stores[\\/]auth-store)\.ts$/;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const single = SINGLE_COPY.some((name) => moduleName === name || moduleName.startsWith(`${name}/`));
  const resolved = context.resolveRequest(
    single ? { ...context, originModulePath: FROM_APP } : context,
    moduleName,
    platform
  );
  if (resolved.type === 'sourceFile' && BROWSER_ONLY.test(resolved.filePath)) {
    throw new Error(
      `${context.originModulePath} imports ${moduleName}, which only works in a browser. See metro.config.js.`
    );
  }
  return resolved;
};

module.exports = config;
