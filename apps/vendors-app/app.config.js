/**
 * app.json, plus the one thing that must come from the build's environment: the Google Maps key
 * Android needs to draw the map (iOS uses Apple Maps and needs none). Set
 * GOOGLE_MAPS_ANDROID_API_KEY where the build runs (an EAS secret). With none, nothing changes
 * and the app leaves the map out on Android (components/location-picker.tsx).
 */
module.exports = ({ config }) => {
  const key = process.env.GOOGLE_MAPS_ANDROID_API_KEY;
  if (!key) return config;
  return {
    ...config,
    android: { ...config.android, config: { ...config.android?.config, googleMaps: { apiKey: key } } },
  };
};
