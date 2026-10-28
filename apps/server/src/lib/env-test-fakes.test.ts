import { describe, expect, test } from 'bun:test'

/**
 * Test-only switches refuse to boot in production (lib/env.ts
 * readTestFake). Loaded in a separate process, so this file's own env is
 * untouched.
 */
const envModule = new URL('./env.ts', import.meta.url).pathname

function boot(extra: Record<string, string>) {
  return Bun.spawnSync({
    cmd: [process.execPath, '-e', `await import(${JSON.stringify(envModule)})`],
    env: {
      PATH: process.env.PATH ?? '',
      DATABASE_URL: 'postgres://test:test@localhost:5432/test',
      JWT_SECRET: 'x'.repeat(40),
      ADMIN_PASSWORD: 'not-the-default',
      ...extra,
    },
    stdout: 'pipe',
    stderr: 'pipe',
  })
}

describe('PLACES_FAKE', () => {
  test('refused in production', () => {
    const result = boot({ NODE_ENV: 'production', PLACES_FAKE: '1' })
    expect(result.exitCode).not.toBe(0)
    expect(result.stderr.toString()).toContain(
      'PLACES_FAKE is set in production'
    )
  })

  test('allowed outside production', () => {
    const result = boot({ NODE_ENV: 'development', PLACES_FAKE: '1' })
    expect(result.stderr.toString()).not.toContain(
      'PLACES_FAKE is set in production'
    )
    expect(result.exitCode).toBe(0)
  })
})
