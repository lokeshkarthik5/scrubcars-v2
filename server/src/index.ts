import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { HTTPException } from 'hono/http-exception'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { env } from './lib/env.js'
import { AppError } from './lib/errors.js'
import { authRoutes } from './modules/auth/auth.routes.js'
import { usersRoutes } from './modules/users/users.routes.js'
import { bookingsRoutes } from './modules/bookings/bookings.routes.js'
import { reviewsRoutes } from './modules/reviews/reviews.routes.js'
import { vendorsRoutes } from './modules/vendors/vendors.routes.js'

const app = new Hono()

app.use(
  '/api/*',
  cors({
    origin: env.corsOrigin,
    credentials: true,
  })
)

app.onError((err, c) => {
  if (err instanceof AppError) {
    return c.json(
      {
        success: false,
        message: err.message,
        code: err.code,
      },
      err.statusCode as ContentfulStatusCode
    )
  }

  if (err instanceof HTTPException) {
    return err.getResponse()
  }

  console.error(err)
  return c.json(
    {
      success: false,
      message: 'Internal server error',
    },
    500
  )
})

app.get('/', (c) => c.text('Scrub Cars API'))

app.route('/api/v1/auth', authRoutes)
app.route('/api/v1/users', usersRoutes)
app.route('/api/v1/vendors', vendorsRoutes)
app.route('/api/v1/bookings', bookingsRoutes)
app.route('/api/v1/reviews', reviewsRoutes)

serve(
  {
    fetch: app.fetch,
    port: Number(process.env.PORT ?? 8080),
  },
  (info) => {
    console.log(`Server is running on http://localhost:${info.port}`)
  }
)
