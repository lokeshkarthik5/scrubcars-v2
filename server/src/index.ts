import { serve } from '@hono/node-server'
import { app } from './app.js'
import { logger } from './lib/logger.js'

serve(
  { fetch: app.fetch, port: Number(process.env.PORT ?? 8080) },
  (info) => {
    console.log(`Server is running on http://localhost:${info.port}`)
    logger.info({ port: info.port }, 'server:start')
  }
)
