import pino from 'pino'
import { env } from './env.js'

// process.stdout is synchronous in Node.js serverless (Vercel/Lambda) environments.
// pino.destination(1) uses sonic-boom's async buffer which is never flushed before
// the function freezes after res.end(), causing all logs to be silently dropped.
export const logger = pino(
  {
    level: env.isDev ? 'debug' : 'info',
    base: { service: 'detlio' },
    timestamp: pino.stdTimeFunctions.isoTime,
    serializers: { err: pino.stdSerializers.err },
  },
  process.stdout
)
