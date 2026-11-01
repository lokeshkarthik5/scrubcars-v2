/**
 * app.json, plus what must come from the build's environment. Each is left out when not set,
 * and the app says so plainly where it matters:
 * - EAS_PROJECT_ID: the EAS project, which push tokens need ("not available" on the alerts row).
 * - GOOGLE_SERVICES_JSON: the path of Firebase's file (an EAS file variable), for Android push.
 * - GOOGLE_MAPS_ANDROID_API_KEY: Android's map (iOS uses Apple Maps). With none, Android lists
 *   garages without a map.
 * A build whose API address isn't a real one is refused: every request would throw on launch.
 */
const usable = (url) => {
  try {
    return /^https?:$/.test(new URL(url).protocol);
  } catch {
    return false;
  }
};

module.exports = ({ config }) => {
  const { EXPO_PUBLIC_API_URL: apiUrl, EAS_BUILD_PROFILE: profile, EAS_PROJECT_ID: projectId, GOOGLE_SERVICES_JSON: googleServicesFile, GOOGLE_MAPS_ANDROID_API_KEY: mapsKey } = process.env;
  if (apiUrl !== undefined ? !usable(apiUrl) : Boolean(profile)) {
    throw new Error(`EXPO_PUBLIC_API_URL must be the API's full address, like https://api.example.com/api/v1. Got "${apiUrl ?? ''}". Set it in eas.json${profile ? ` under the ${profile} profile` : ''}.`);
  }
  return {
    ...config,
    extra: { ...config.extra, ...(projectId ? { eas: { ...config.extra?.eas, projectId } } : {}) },
    android: {
      ...config.android,
      ...(googleServicesFile ? { googleServicesFile } : {}),
      ...(mapsKey ? { config: { ...config.android?.config, googleMaps: { apiKey: mapsKey } } } : {}),
    },
  };
};
