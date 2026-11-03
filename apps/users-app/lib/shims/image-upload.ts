/**
 * In place of packages/core/src/image-upload.ts (metro.config.js). Its
 * stripImageMetadata draws on a canvas, and with no canvas it hands the photo back
 * with its GPS still in. So on the phone it refuses, loudly: photos go through the
 * app's own expo-image-manipulator step before any upload.
 */
const refused = () => {
  throw new Error('Use the app\'s own photo step: core\'s image-upload only works in a browser.');
};
export const stripImageMetadata = refused;
export const decodeImage = refused;
export const encodeImage = refused;
export const UPLOAD_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
