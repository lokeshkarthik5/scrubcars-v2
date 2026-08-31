import { serve } from '@hono/node-server'
import { app } from './app.js'
import { logger } from './lib/logger.js'
import { APP_VERSION } from './lib/version.js'

serve(
  { fetch: app.fetch, port: Number(process.env.PORT ?? 8080) },
  (info) => {
    console.log(`Detlio API v${APP_VERSION} running on http://localhost:${info.port}`)
    logger.info({ port: info.port, version: APP_VERSION }, 'server:start')
  }
)
