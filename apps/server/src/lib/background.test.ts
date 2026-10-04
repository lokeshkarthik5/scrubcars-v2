import { describe, expect, test } from 'bun:test'

// The logger reads the app's env, which insists on a database URL.
process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test'
const { runInBackground } = await import('./background.js')

describe('runInBackground', () => {
  test('returns at once and runs the task afterwards', async () => {
    let ran = false
    runInBackground('test', async () => {
      ran = true
    })
    expect(ran).toBe(false)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(ran).toBe(true)
  })

  test('never lets a failing task reach the caller', async () => {
    expect(() =>
      runInBackground('test', async () => {
        throw new Error('telegram down')
      })
    ).not.toThrow()
    expect(() =>
      runInBackground('test', () => {
        throw new Error('thrown before any await')
      })
    ).not.toThrow()
    // An unhandled rejection would fail the run here.
    await new Promise((resolve) => setTimeout(resolve, 10))
  })
})
