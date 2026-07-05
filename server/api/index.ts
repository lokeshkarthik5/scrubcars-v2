import { handle } from 'hono/vercel'
import { app } from '../src/app.js'

console.log('[BOOT] api/index.ts loaded')

export default handle(app)
