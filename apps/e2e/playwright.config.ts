import { defineConfig, devices } from '@playwright/test'
import { config as loadEnv } from 'dotenv'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const dir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(dir, '../..')

loadEnv({ path: path.join(dir, '.env.e2e') })

const USERS = 'http://localhost:3000'
const VENDORS = 'http://localhost:3001'
const ADMIN = 'http://localhost:3002'
const API = 'http://localhost:8080'

const CI = Boolean(process.env.CI)

/**
 * In CI the frontends are built and served, not run through `next dev`.
 * Dev-mode compile-on-first-hit is the single largest source of timeout flake
 * here: the first test to touch a route pays a multi-second compile that no
 * amount of waiting distinguishes from a hang.
 */
const frontend = (name: string, port: number) => ({
  command: CI
    ? `bun run --filter ${name} start`
    : `bun run --filter ${name} dev`,
  url: `http://localhost:${port}`,
  cwd: repoRoot,
  reuseExistingServer: !CI,
  timeout: 180_000,
  stdout: 'pipe' as const,
  stderr: 'pipe' as const,
  env: {
    ...(process.env as Record<string, string>),
    // .env.e2e sets NODE_ENV=development because the API needs it: cookies are
    // `secure: !isDev`, and secure cookies are dropped over plain http, which
    // would log every test out. The frontends have the opposite need — in CI
    // they serve a production build — so the value is corrected here rather
    // than split across two env files.
    ...(CI ? { NODE_ENV: 'production' } : {}),
  },
})

export default defineConfig({
  testDir: './specs',
  outputDir: './test-results',
  globalSetup: './global-setup.ts',

  // Files run in parallel; tests inside a file do not.
  //
  // The isolation unit is the file: each one owns a fixture customer (see
  // e2e-ids.ts) and nothing else touches that customer's rows. Tests within a
  // file share that customer by design — they cancel the booking the previous
  // test made, count what it wrote — so running them concurrently makes them
  // race each other over one row. `fullyParallel: true` does exactly that, and
  // cost roughly one flaky test per run before this was turned off.
  fullyParallel: false,
  workers: CI ? 2 : 4,
  forbidOnly: CI,
  retries: CI ? 1 : 0,

  // Generous but finite. A test that needs more than 60s is wedged, not slow.
  timeout: 60_000,
  expect: { timeout: 10_000 },

  reporter: CI
    ? [['github'], ['html', { open: 'never' }], ['list']]
    : [['html', { open: 'never' }], ['list']],

  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: CI ? 'retain-on-failure' : 'off',
    actionTimeout: 15_000,
    // Chennai — the seeded vendors sit here, and distance sorting is asserted
    // against it. Permission is granted per-context in the fixtures.
    geolocation: { latitude: 13.0827, longitude: 80.2707 },
    locale: 'en-IN',
    timezoneId: 'Asia/Kolkata',
  },

  projects: [
    {
      name: 'users',
      testDir: './specs/users',
      // The customer app is built for a phone (max-w-[428px]); running it at a
      // desktop viewport would test a layout no user sees.
      use: { ...devices['Pixel 7'], baseURL: USERS },
    },
    {
      name: 'vendors',
      testDir: './specs/vendors',
      use: { ...devices['Pixel 7'], baseURL: VENDORS },
    },
    {
      name: 'admin',
      testDir: './specs/admin',
      // Admin is the one desktop surface — it renders PanelShell, not the
      // mobile shell.
      use: { ...devices['Desktop Chrome'], baseURL: ADMIN },
    },
    {
      // Cross-app specs drive three origins at once and share booking rows
      // between them, so they cannot run alongside themselves.
      name: 'journeys',
      testDir: './specs/journeys',
      fullyParallel: false,
      workers: 1,
      use: { ...devices['Pixel 7'], baseURL: USERS },
    },
    {
      // Session expiry, forced 429s and last-slot races all mutate global or
      // per-IP state, so they get the machine to themselves.
      name: 'platform',
      testDir: './specs/platform',
      fullyParallel: false,
      workers: 1,
      use: { ...devices['Pixel 7'], baseURL: USERS },
    },
  ],

  webServer: [
    {
      // Matches the frontends: CI serves the compiled build, local runs the
      // watcher. The dev script also pipes through pino-pretty, which is noise
      // in a CI log and one more process between here and a readiness check.
      command: CI ? 'bun run --filter server start' : 'bun run --filter server dev',
      url: `${API}/`, // app.ts:95 — `Detlio API v<version>`
      cwd: repoRoot,
      reuseExistingServer: !CI,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
      env: process.env as Record<string, string>,
    },
    frontend('users', 3000),
    frontend('vendors', 3001),
    frontend('admin', 3002),
  ],
})
