/**
 * License API routes — added to desktop app's Express server
 *
 * GET  /api/license/status       → current license state
 * POST /api/license/activate     → activate with key + email
 * POST /api/license/deactivate   → reset (for moving to new machine)
 * GET  /api/license/purchase     → redirect to Stripe checkout URL
 * POST /api/license/deliver      → Stripe webhook: generate + store key on purchase
 */

import type { Express, Request, Response } from 'express';
import { getLicenseInfo, activateLicense, generateLicenseKey, getTrialUsageCount, TRIAL_LIMIT } from './licenseService.js';
import { sqlite } from './db-desktop.js';
import Stripe from 'stripe';

const PURCHASE_URL = process.env.STRIPE_CHECKOUT_URL
  || 'https://pdfezfill.com/purchase';

const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET_DESKTOP || '';
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';

export function registerLicenseRoutes(app: Express): void {

  // ─── GET /api/license/status ────────────────────────────────────────────
  app.get('/api/license/status', (_req: Request, res: Response) => {
    const info = getLicenseInfo();
    const trialCount = getTrialUsageCount();
    res.json({
      ...info,
      trialUsed: trialCount,
      trialLimit: TRIAL_LIMIT,
      trialRemaining: Math.max(0, TRIAL_LIMIT - trialCount),
    });
  });

  // ─── POST /api/license/activate ─────────────────────────────────────────
  app.post('/api/license/activate', async (req: Request, res: Response) => {
    const { licenseKey, email } = req.body;

    if (!licenseKey || !email) {
      return res.status(400).json({ message: 'licenseKey and email are required' });
    }

    const result = await activateLicense(licenseKey, email);

    if (!result.success) {
      return res.status(400).json({ message: result.message });
    }

    res.json({ message: result.message, license: result.info });
  });

  // ─── POST /api/license/deactivate ───────────────────────────────────────
  app.post('/api/license/deactivate', (_req: Request, res: Response) => {
    try {
      sqlite.exec(`
        UPDATE license SET
          validation_status = 'deactivated',
          license_key = NULL,
          activated_email = NULL
        WHERE id = 1
      `);
      res.json({ message: 'License deactivated. You can reactivate on a new machine.' });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ─── GET /api/license/purchase ──────────────────────────────────────────
  // Renderer calls window.electronAPI.openExternal(purchaseUrl) directly,
  // but this endpoint provides the URL for the React app
  app.get('/api/license/purchase-url', (_req: Request, res: Response) => {
    res.json({ url: PURCHASE_URL });
  });

  // ─── POST /api/license/deliver ──────────────────────────────────────────
  // Called by Stripe webhook (from pdfezfill.com web server → desktop webhook receiver)
  // In production this webhook is handled by the web server, not the desktop app.
  // Kept here for local dev / testing.
  app.post('/api/license/deliver', express.raw({ type: 'application/json' }), async (req: Request, res: Response) => {
    if (!STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET) {
      return res.status(503).json({ message: 'Stripe not configured in desktop dev mode' });
    }

    try {
      const stripe = new Stripe(STRIPE_SECRET_KEY);
      const sig = req.headers['stripe-signature'] as string;
      const event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);

      if (event.type === 'checkout.session.completed') {
        const session = event.data.object as Stripe.Checkout.Session;
        const email = session.customer_email || (session.customer_details?.email ?? '');
        const key = generateLicenseKey();

        // Store generated key (web server would email this to user)
        console.log(`[license] Generated key for ${email}: ${key}`);
        // In production: web server handles this and emails the key
        // Here we just log it for dev/testing

        res.json({ received: true, key }); // Only for dev
      } else {
        res.json({ received: true });
      }
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });
}

// Fix: import express for the deliver route
import express from 'express';
