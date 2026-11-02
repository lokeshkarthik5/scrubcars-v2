/// <reference types="bun" />
import { afterEach, expect, test } from 'bun:test';

const build = require('../app.config.js') as (input: { config: Record<string, any> }) => Record<string, any>;

const NAMES = ['EXPO_PUBLIC_API_URL', 'EAS_BUILD_PROFILE', 'EAS_PROJECT_ID', 'GOOGLE_SERVICES_JSON', 'GOOGLE_MAPS_ANDROID_API_KEY'];
const saved = Object.fromEntries(NAMES.map((name) => [name, process.env[name]]));
const setEnv = (values: Record<string, string>) => {
  for (const name of NAMES) delete process.env[name];
  Object.assign(process.env, values);
};
afterEach(() => {
  for (const name of NAMES) {
    if (saved[name] === undefined) delete process.env[name];
    else process.env[name] = saved[name];
  }
});

const config = { name: 'Detlio for Garages', android: { package: 'com.detlio.garages' } };

test('nothing set: app.json as it is', () => {
  setEnv({});
  const out = build({ config });
  expect(out.extra.eas).toBeUndefined();
  expect(out.android).toEqual({ package: 'com.detlio.garages' });
});

test('the build environment fills the project, Firebase file and map key', () => {
  setEnv({ EXPO_PUBLIC_API_URL: 'https://api.detlio.com/api/v1', EAS_PROJECT_ID: 'p1', GOOGLE_SERVICES_JSON: '/x/g.json', GOOGLE_MAPS_ANDROID_API_KEY: 'k1' });
  const out = build({ config });
  expect(out.extra.eas.projectId).toBe('p1');
  expect(out.android.googleServicesFile).toBe('/x/g.json');
  expect(out.android.config.googleMaps.apiKey).toBe('k1');
  expect(out.android.package).toBe('com.detlio.garages');
});

test('a build with the placeholder address, or none, is refused', () => {
  setEnv({ EXPO_PUBLIC_API_URL: 'SET_BY_LOKESH_TEST_API', EAS_BUILD_PROFILE: 'preview' });
  expect(() => build({ config })).toThrow(/EXPO_PUBLIC_API_URL/);
  setEnv({ EAS_BUILD_PROFILE: 'production' });
  expect(() => build({ config })).toThrow(/EXPO_PUBLIC_API_URL/);
  setEnv({ EXPO_PUBLIC_API_URL: 'http://localhost:8080/api/v1' });
  expect(() => build({ config })).not.toThrow();
});
