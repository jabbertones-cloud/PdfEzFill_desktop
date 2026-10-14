/**
 * Desktop server entry point — stripped of all cloud/SaaS infrastructure.
 *
 * Removed vs server/index.ts:
 *   ✗ stripe-replit-sync (runMigrations, findOrCreateManagedWebhook)
 *   ✗ emailAutomation (startQueueProcessor)
 *   ✗ emailTriggers (startBehaviorTriggerChecks, seedDefaultEmailTemplates)
 *   ✗ retentionCleanup
 *   ✗ Replit domain webhook setup
 *   ✗ rate limiting (single-user local app, no abuse risk)
 *
 * Added:
 *   ✓ runDesktopMigrations (SQLite schema setup)
 *   ✓ License API routes
 *   ✓ CORS restricted to localhost only
 */

import express, { type Request, Response, NextFunction } from 'express';
import { createServer } from 'http';
import { runDesktopMigrations } from './db-desktop.js';
import { registerRoutes } from './routes.js';
import { registerLicenseRoutes } from './licenseRoutes.js';

const app = express();
const httpServer = createServer(app);

export function log(message: string, source = 'express') {
  const t = new Date().toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true,
  });
  console.log(`${t} [${source}] ${message}`);
}

// Allow only localhost origins (Electron loads from 127.0.0.1)
app.use((_req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', 'http://localhost:*');
  next();
});

// Parse Stripe webhooks as raw buffer BEFORE json()
app.post(
  '/api/stripe/webhook',
  express.raw({ type: 'application/json' }),
  async (req: Request & { rawBody?: Buffer }, res) => {
    req.rawBody = req.body as Buffer;
    const signature = req.headers['stripe-signature'];
    if (!signature) return res.status(400).json({ error: 'Missing stripe-signature' });

    try {
      const { WebhookHandlers } = await import('./webhookHandlers.js');
      await WebhookHandlers.processWebhook(req.body as Buffer, signature as string, 'desktop');
      res.status(200).json({ received: true });
    } catch (err: any) {
      log(`Webhook error: ${err.message}`, 'stripe');
      res.status(400).json({ error: 'Webhook processing error' });
    }
  }
);

app.use(express.json({
  verify: (req: any, _res, buf) => { req.rawBody = buf; },
}));
app.use(express.urlencoded({ extended: false }));

// Request logger
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    if (req.path.startsWith('/api')) {
      log(`${req.method} ${req.path} ${res.statusCode} in ${Date.now() - start}ms`);
    }
  });
  next();
});

// ─── Bootstrap ────────────────────────────────────────────────────────────
(async () => {
  // 1. SQLite schema
  await runDesktopMigrations();
  log('SQLite ready', 'db');

  // 2. Register all routes (same as SaaS, but auth is bypassed via desktopAuth.ts)
  await registerRoutes(httpServer, app);

  // 3. License routes (activate, deactivate, status, purchase-url)
  registerLicenseRoutes(app);

  // 3. Serve static React build in production
  if (process.env.NODE_ENV === 'production') {
    const { serveStatic } = await import('./static.js');
    serveStatic(app);
  } else {
    const { setupVite } = await import('./vite.js');
    await setupVite(httpServer, app);
  }

  // Error handler
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    log(`Error: ${err.message}`, 'error');
    res.status(status).json({ message: err.message || 'Internal Server Error' });
  });

  const port = parseInt(process.env.PORT || '5000', 10);
  httpServer.listen({ port, host: '127.0.0.1' }, () => {
    log(`serving on port ${port}`);
  });
})();
