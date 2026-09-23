# License & entitlement — desktop app

_Design reconstructed from `server/.syncthing.licenseService.ts.tmp` and
`client/src/hooks/.syncthing.useLicense.ts.tmp`. The implementation sources
are not in the repo (only Syncthing temp artifacts); treat this as the
spec to re-implement and harden, not as shipped code._

## Flow

```
1. User buys on web backend  →  Stripe Checkout (test mode first)
2. Stripe webhook            →  POST /api/license/deliver → generate key, store in DB
3. Key emailed to buyer      →  via Resend/Brevo on the WEB server
4. User enters key + email   →  desktop app POST /api/license/activate
5. One-time remote validate  →  POST https://api.pdfezfill.com/v1/license/validate
6. Stored in local SQLite    →  subsequent launches work offline
```

## Key format

`PDFEZ-XXXX-XXXX-XXXX-XXXX` — 16 hex chars (64 bits entropy) from
`crypto.randomBytes(10)` formatted into 4 groups. (The design doc says
"base32" but the generator emits hex — keep hex, fix the comment.)

Validation rules: `/^PDFEZ-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}$/`
(uppercase, trimmed).

## Trial

`TRIAL_LIMIT = 3` PDFs for the local user. Client hook (`useLicense`) polls
`/api/license/status` every 60 s and derives:

- `isActive` — licensed
- `inTrial` — trial remaining > 0
- `isGated` — trial exhausted AND not licensed → show paywall

## Configuration (env vars)

| Var | Purpose | Example |
|---|---|---|
| `LICENSE_VALIDATION_URL` | Remote validation endpoint | `https://api.pdfezfill.com/v1/license/validate` |
| `LICENSE_KEY_PATH` | Local license store path | `./license.json` |
| `STRIPE_SECRET_KEY` | Webhook key delivery (web backend) | `sk_test_...` (test) / `sk_live_...` (prod) |
| `STRIPE_WEBHOOK_SECRET` | Webhook signature verification | `whsec_...` |
| `LICENSE_STUB_PORT` | Port for the local test stub | `8787` |

See `.env.example` — placeholders only, never real keys.

## Test mode (no backend, no Stripe)

Run the included stub, which implements the validation endpoint contract
(`POST /v1/license/validate` → `{ valid, plan, expiresAt?, message? }`):

```bash
node scripts/license-stub.mjs
# in another shell:
LICENSE_VALIDATION_URL=http://127.0.0.1:8787/v1/license/validate <app>
```

Stub behavior: any well-formed `PDFEZ-…` key → `{ valid: true,
plan: "lifetime" }`; malformed → `{ valid: false }`; key
`PDFEZ-FFFF-FFFF-FFFF-FFFF` → expired fixture. It binds to 127.0.0.1 only.

## Security findings (fix before launch)

From reading the existing design — all must be addressed when the sources
are restored:

1. **SQL injection (server/licenseService.ts):** the email and key are
   string-interpolated into the `INSERT OR REPLACE` statement. Use
   parameterized queries (`sqlite.prepare(...).run(key, email, ...)`).
2. **Offline-activation hole:** on any network error the code logs a warning
   and grants `{ valid: true, plan: 'lifetime' }`. Anyone offline (or
   blocking the endpoint) gets a lifetime license. Decide: fail closed, or
   grant a short offline grace (e.g. 72 h) recorded locally and re-validated
   when online.
3. **No device binding:** a key can be activated on unlimited machines
   ("already used on another machine" is only a message string). Decide the
   seat policy and enforce server-side.
4. **`expiresAt` parsing:** `new Date(string)` result isn't validated;
   malformed dates become `NaN` → `NULL`. Validate and reject.
5. **Email handling:** stored/used unsanitized; normalize (trim, lowercase)
   and validate format before sending to the endpoint.

## Open decisions for Scott

- Desktop pricing (one-time vs subscription; the web product's tiers are
  Guest $5 / Starter $7/mo / Pro+ $15/mo / Enterprise $49/mo — desktop TBD)
- Seat/device limit per key
- Offline grace policy (fail closed vs grace period)
- Key delivery email provider (Resend vs Brevo) — web side
