import { describe, expect, test } from 'bun:test'
import {
  APP_NAMES,
  APP_PLATFORMS,
  compareVersions,
  isValidVersion,
  parseVersion,
  readAppConfigEnv,
  resolveAppConfig,
} from './app-config.js'

describe('versions', () => {
  test('compare numerically, not as text', () => {
    expect(compareVersions('1.10.0', '1.9.0')).toBeGreaterThan(0)
    expect(compareVersions('1.9.0', '1.10.0')).toBeLessThan(0)
    expect(compareVersions('2.0.0', '1.99.99')).toBeGreaterThan(0)
    expect(compareVersions('1.2.10', '1.2.9')).toBeGreaterThan(0)
    expect(compareVersions('0.0.1', '0.0.2')).toBeLessThan(0)
  })

  test('equal versions compare as 0, and a missing part counts as 0', () => {
    expect(compareVersions('1.2.3', '1.2.3')).toBe(0)
    expect(compareVersions('1.2', '1.2.0')).toBe(0)
    expect(compareVersions('3', '3.0.0')).toBe(0)
    expect(compareVersions('01.02.03', '1.2.3')).toBe(0)
    expect(compareVersions('1.2', '1.2.1')).toBeLessThan(0)
  })

  test('only one to three dotted numbers are versions', () => {
    for (const good of ['1', '1.2', '1.2.3', '0.0.0', '10.20.30', '999999.0.0']) {
      expect(isValidVersion(good)).toBe(true)
    }
    for (const bad of [
      '',
      ' ',
      'abc',
      'v1.2.3',
      '1.2.3.4',
      '1..3',
      '.1',
      '1.',
      '1.2.x',
      '1.2.3-beta',
      '1.2.3+4',
      '-1.2.3',
      '1,2,3',
      '1.2.3 ',
      '1234567.0.0',
      '١.٢.٣',
    ]) {
      expect(isValidVersion(bad)).toBe(false)
      expect(parseVersion(bad)).toBeNull()
    }
  })

  test('comparing a malformed version throws instead of guessing', () => {
    expect(() => compareVersions('nope', '1.0.0')).toThrow()
    expect(() => compareVersions('1.0.0', 'nope')).toThrow()
  })
})

describe('reading the environment', () => {
  test('nothing set: every app and platform is empty', () => {
    const config = readAppConfigEnv({})
    for (const app of APP_NAMES) {
      for (const platform of APP_PLATFORMS) {
        expect(config[app][platform]).toEqual({ minVersion: null, latestVersion: null, storeUrl: null })
      }
    }
  })

  test('one variable per app, platform and kind, all independent', () => {
    const source: Record<string, string> = {}
    for (const app of APP_NAMES) {
      for (const platform of APP_PLATFORMS) {
        const suffix = `${app.toUpperCase()}_${platform.toUpperCase()}`
        source[`APP_MIN_VERSION_${suffix}`] = `${app.length}.${platform.length}.0`
        source[`APP_LATEST_VERSION_${suffix}`] = `${app.length}.${platform.length}.9`
        source[`APP_STORE_URL_${suffix}`] = `https://store.example.com/${app}/${platform}`
      }
    }
    const config = readAppConfigEnv(source)
    expect(config.customer.ios).toEqual({
      minVersion: '8.3.0',
      latestVersion: '8.3.9',
      storeUrl: 'https://store.example.com/customer/ios',
    })
    expect(config.garage.android).toEqual({
      minVersion: '6.7.0',
      latestVersion: '6.7.9',
      storeUrl: 'https://store.example.com/garage/android',
    })
    expect(config.customer.android.storeUrl).toBe('https://store.example.com/customer/android')
    expect(config.garage.ios.storeUrl).toBe('https://store.example.com/garage/ios')
  })

  test('setting one app does not touch another', () => {
    const config = readAppConfigEnv({ APP_MIN_VERSION_CUSTOMER_IOS: '2.0.0' })
    expect(config.customer.ios.minVersion).toBe('2.0.0')
    expect(config.customer.android.minVersion).toBeNull()
    expect(config.garage.ios.minVersion).toBeNull()
    expect(config.garage.android.minVersion).toBeNull()
  })

  test('values are trimmed, and junk counts as unset', () => {
    const config = readAppConfigEnv({
      APP_MIN_VERSION_CUSTOMER_IOS: ' 1.4.0 ',
      APP_MIN_VERSION_CUSTOMER_ANDROID: 'one.two',
      APP_MIN_VERSION_GARAGE_IOS: '',
      APP_MIN_VERSION_GARAGE_ANDROID: '   ',
      APP_STORE_URL_CUSTOMER_IOS: 'http://insecure.example.com',
      APP_STORE_URL_CUSTOMER_ANDROID: 'javascript:alert(1)',
      APP_STORE_URL_GARAGE_IOS: 'not a url',
      APP_STORE_URL_GARAGE_ANDROID: ' https://play.google.com/store/apps/details?id=com.detlio ',
    })
    expect(config.customer.ios.minVersion).toBe('1.4.0')
    expect(config.customer.android.minVersion).toBeNull()
    expect(config.garage.ios.minVersion).toBeNull()
    expect(config.garage.android.minVersion).toBeNull()
    expect(config.customer.ios.storeUrl).toBeNull()
    expect(config.customer.android.storeUrl).toBeNull()
    expect(config.garage.ios.storeUrl).toBeNull()
    expect(config.garage.android.storeUrl).toBe('https://play.google.com/store/apps/details?id=com.detlio')
  })
})

describe('what an app is told', () => {
  const unset = readAppConfigEnv({})

  test('no minimum set: never required, whatever the version', () => {
    for (const app of APP_NAMES) {
      for (const platform of APP_PLATFORMS) {
        for (const version of ['0.0.0', '1.0.0', '99.99.99']) {
          expect(resolveAppConfig(unset, { app, platform, version })).toEqual({
            minVersion: null,
            latestVersion: null,
            updateRequired: false,
            storeUrl: null,
          })
        }
      }
    }
  })

  test('a typo in the minimum is the same as unset', () => {
    const config = readAppConfigEnv({ APP_MIN_VERSION_CUSTOMER_IOS: '1.2.x' })
    const answer = resolveAppConfig(config, { app: 'customer', platform: 'ios', version: '0.0.1' })
    expect(answer.updateRequired).toBe(false)
    expect(answer.minVersion).toBeNull()
  })

  // Every app on every platform, below, at and above the minimum.
  for (const app of APP_NAMES) {
    for (const platform of APP_PLATFORMS) {
      describe(`${app} on ${platform}`, () => {
        const suffix = `${app.toUpperCase()}_${platform.toUpperCase()}`
        const config = readAppConfigEnv({
          [`APP_MIN_VERSION_${suffix}`]: '1.4.0',
          [`APP_LATEST_VERSION_${suffix}`]: '1.6.2',
          [`APP_STORE_URL_${suffix}`]: 'https://store.example.com/detlio',
        })
        const ask = (version: string) => resolveAppConfig(config, { app, platform, version })

        test('below the minimum must update', () => {
          for (const version of ['0.9.9', '1.3.99', '1.3', '1']) {
            expect(ask(version)).toEqual({
              minVersion: '1.4.0',
              latestVersion: '1.6.2',
              updateRequired: true,
              storeUrl: 'https://store.example.com/detlio',
            })
          }
        })

        test('at the minimum is allowed', () => {
          expect(ask('1.4.0').updateRequired).toBe(false)
          expect(ask('1.4').updateRequired).toBe(false)
        })

        test('above the minimum is allowed', () => {
          for (const version of ['1.4.1', '1.10.0', '2.0.0']) {
            expect(ask(version).updateRequired).toBe(false)
          }
        })

        test('the other three targets are untouched', () => {
          for (const otherApp of APP_NAMES) {
            for (const otherPlatform of APP_PLATFORMS) {
              if (otherApp === app && otherPlatform === platform) continue
              expect(
                resolveAppConfig(config, { app: otherApp, platform: otherPlatform, version: '0.0.1' })
              ).toEqual({ minVersion: null, latestVersion: null, updateRequired: false, storeUrl: null })
            }
          }
        })
      })
    }
  }

  test('the newest release is the minimum when not set, and never below it', () => {
    const noLatest = readAppConfigEnv({ APP_MIN_VERSION_GARAGE_IOS: '2.1.0' })
    expect(resolveAppConfig(noLatest, { app: 'garage', platform: 'ios', version: '2.1.0' }).latestVersion).toBe(
      '2.1.0'
    )

    const stale = readAppConfigEnv({
      APP_MIN_VERSION_GARAGE_IOS: '2.1.0',
      APP_LATEST_VERSION_GARAGE_IOS: '2.0.0',
    })
    expect(resolveAppConfig(stale, { app: 'garage', platform: 'ios', version: '2.1.0' }).latestVersion).toBe('2.1.0')
  })

  test('a store address alone, with no minimum, never forces anything', () => {
    const config = readAppConfigEnv({ APP_STORE_URL_CUSTOMER_ANDROID: 'https://play.google.com/store/apps/x' })
    const answer = resolveAppConfig(config, { app: 'customer', platform: 'android', version: '0.1.0' })
    expect(answer.updateRequired).toBe(false)
    expect(answer.storeUrl).toBe('https://play.google.com/store/apps/x')
  })
})
