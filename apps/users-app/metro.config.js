const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

/**
 * One copy of each of these, the app's, wherever the import comes from. The apps use
 * React 19.3.0 and packages/core's dev dependency is 19.2.4, so without this a store
 * in core renders with a second React and every hook throws. packages/native-ui's
 * native modules have to be the app's too, or a view is registered twice.
 */
const SINGLE_COPY = [
  'react',
  'react-native',
  '@tanstack/react-query',
  'zustand',
  'expo-blur',
  'expo-linear-gradient',
  'expo-status-bar',
  'react-native-safe-area-context',
  'react-native-svg',
];
const FROM_APP = path.join(__dirname, 'package.json');

/**
 * Browser-bound files in packages/core: localStorage, document, Razorpay's script, a
 * canvas. They must never reach the phone, even through another file.
 *
 * Three of them sit behind API files the app does need (api/users.ts and api/vendors.ts
 * import the image-upload and auth store; api/auth.ts and use-favourites the analytics),
 * so those are swapped for the app's own, in lib/shims. Anything else fails the bundle
 * here rather than on someone's phone.
 */
const SHIMS = {
  analytics: 'analytics.ts',
  'image-upload': 'image-upload.ts',
  'stores/auth-store': 'auth-store.ts',
};
const BROWSER_BOUND =
  /packages[\\/]core[\\/]src[\\/](analytics|push|razorpay|image-upload|booking-draft|stores[\\/]auth-store)\.ts$/;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const single = SINGLE_COPY.some((name) => moduleName === name || moduleName.startsWith(`${name}/`));
  const resolved = context.resolveRequest(
    single ? { ...context, originModulePath: FROM_APP } : context,
    moduleName,
    platform
  );
  if (resolved.type === 'sourceFile') {
    const match = resolved.filePath.match(BROWSER_BOUND);
    if (match) {
      const shim = SHIMS[match[1].replace(/\\/g, '/')];
      if (shim) return { type: 'sourceFile', filePath: path.join(__dirname, 'lib', 'shims', shim) };
      throw new Error(
        `${context.originModulePath} imports ${moduleName}, which only works in a browser. See metro.config.js.`
      );
    }
  }
  return resolved;
};

module.exports = config;
