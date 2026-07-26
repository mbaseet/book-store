import { Hono } from 'hono'
import { errorResponse } from './lib/http'
import { authRoutes } from './routes/auth'
import { adminCatalogRoutes } from './routes/admin-catalog'
import { adminContentRoutes } from './routes/admin-content'
import { adminMediaRoutes } from './routes/admin-media'
import { adminOperationsRoutes } from './routes/admin-operations'
import { adminOrderRoutes } from './routes/admin-orders'
import { adminReportRoutes } from './routes/admin-reports'
import { checkoutRoutes } from './routes/checkout'
import { orderRoutes } from './routes/orders'
import { publicStorefrontRoutes } from './routes/public-storefront'
import { uploadRoutes } from './routes/uploads'
import { createDb } from './db'
import { purgeExpiredCheckoutDrafts } from './services/checkout-drafts'
import {
  purgeDueSensitiveAssets,
  purgeDueSensitivePersonalization,
  purgeExpiredUnclaimedPrivateUploads,
} from './services/private-uploads'
import type { Bindings } from './types'

export type { Bindings } from './types'

const app = new Hono<{ Bindings: Bindings }>()

app.use('/api/*', async (context, next) => {
  await next()
  context.header('X-Content-Type-Options', 'nosniff')
  context.header('Referrer-Policy', 'same-origin')
  context.header('X-Frame-Options', 'DENY')
})

app.get('/api/healthz', (context) =>
  context.json({ status: 'healthy', service: 'personalized-storybooks-eg' }),
)

app.route('/api/storefront', publicStorefrontRoutes)
app.route('/api', uploadRoutes)
app.route('/api', checkoutRoutes)
app.route('/api', orderRoutes)
app.route('/api', authRoutes)
app.route('/api', adminCatalogRoutes)
app.route('/api', adminMediaRoutes)
app.route('/api', adminOrderRoutes)
app.route('/api', adminReportRoutes)
app.route('/api', adminContentRoutes)
app.route('/api', adminOperationsRoutes)

app.notFound((context) => {
  if (context.req.path.startsWith('/api')) {
    return errorResponse(context, 404, 'not_found', 'This API endpoint was not found.')
  }
  return context.text('Not found', 404)
})

app.onError((error, context) => {
  // Do not log request bodies or error details: API payloads can include child
  // names, addresses, and private-media claim tokens.
  console.error(`Worker request failed: ${error.name}`)
  if (context.req.path.startsWith('/api')) {
    return errorResponse(context, 500, 'internal_error', 'Something went wrong. Please try again.')
  }
  return context.text('Internal server error', 500)
})

export type AppType = typeof app

export default {
  async fetch(request: Request, env: Bindings, executionContext: ExecutionContext) {
    const url = new URL(request.url)

    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      return app.fetch(request, env, executionContext)
    }

    if (url.pathname.includes('.')) {
      return env.ASSETS.fetch(request)
    }

    return env.ASSETS.fetch(new Request(new URL('/index.html', request.url)))
  },
  async scheduled(_event: ScheduledController, env: Bindings, executionContext: ExecutionContext) {
    executionContext.waitUntil(
      (async () => {
        try {
          const db = createDb(env)
          await Promise.all([
            purgeExpiredCheckoutDrafts(db),
            purgeExpiredUnclaimedPrivateUploads(db, env),
          ])
          // Run the related retention jobs in order so an order is marked
          // fully purged only after both private media and sensitive answers
          // have had a chance to complete their work.
          await purgeDueSensitiveAssets(db, env)
          await purgeDueSensitivePersonalization(db)
        } catch {
          console.error('Scheduled private-media purge failed.')
        }
      })(),
    )
  },
}
