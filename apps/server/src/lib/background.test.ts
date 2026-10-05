import { afterEach, describe, expect, test } from 'bun:test'

// The logger reads the app's env, which insists on a database URL.
process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test'
const { runInBackground } = await import('./background.js')

// Where @vercel/functions looks for the platform's request context.
const CONTEXT = Symbol.for('@vercel/request-context')
const settle = () => new Promise((resolve) => setTimeout(resolve, 20))

afterEach(() => {
  delete (globalThis as Record<symbol, unknown>)[CONTEXT]
})

describe('runInBackground', () => {
  test('returns at once and runs the task afterwards', async () => {
    let ran = false
    runInBackground('test', async () => {
      ran = true
    })
    expect(ran).toBe(false)
    await settle()
    expect(ran).toBe(true)
  })

  test('hands the work to Vercel so the function is not frozen mid-send', async () => {
    const handed: Promise<unknown>[] = []
    ;(globalThis as Record<symbol, unknown>)[CONTEXT] = {
      get: () => ({ waitUntil: (promise: Promise<unknown>) => handed.push(promise) }),
    }

    runInBackground('test', async () => {
      throw new Error('telegram down')
    })

    expect(handed).toHaveLength(1)
    // What Vercel waits on settles cleanly even when the task fails.
    await expect(handed[0]).resolves.toBeUndefined()
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
    await settle()
  })
})
