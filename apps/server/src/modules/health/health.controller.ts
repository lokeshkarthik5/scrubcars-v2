import type { Context } from 'hono'
import { healthService } from './health.service.js'

export async function health(c: Context) {
  const data = await healthService.check()

  // A cached "ok" from a proxy would hide the very outage this exists to see.
  c.header('Cache-Control', 'no-store')

  if (data.db !== 'ok') {
    // 503 is what the monitor alerts on. The body is kept free of the word
    // "ok" too, since the monitor also looks for it as a keyword.
    return c.json(
      {
        success: false,
        message: 'The database is not responding',
        code: 'DB_DOWN',
        data,
      },
      503
    )
  }

  return c.json({ success: true, data })
}
