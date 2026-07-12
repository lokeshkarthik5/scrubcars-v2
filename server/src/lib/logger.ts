import pino from 'pino'
import { env } from './env.js'

export const logger = pino(
  {
    level: env.isDev ? 'debug' : 'info',
    base: { service: 'scrub-cars' },
    timestamp: pino.stdTimeFunctions.isoTime,
    serializers: { err: pino.stdSerializers.err },
  },
  // process.stdout bypasses sonic-boom's internal buffer so logs appear immediately in dev
  env.isDev ? process.stdout : pino.destination(1)
)
