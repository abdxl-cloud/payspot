# Vince Stack (Multi-tenant Omada Voucher Portal)

This project is a multi-tenant paid WiFi voucher portal built with Next.js and shadcn/ui.
Each tenant gets:
- A dedicated purchase link under `/t/<slug>`
- Isolated vouchers and sales
- Their own Paystack secret key for separate payouts

Voucher codes are generated in Omada, exported as CSV, imported into a SQLite voucher pool, and
assigned to customers only after successful payment verification.

## Core Flow
1. Customer visits `/t/<slug>`, selects a package and pays via Paystack.
2. We verify the transaction (webhook + server-side verification) using the tenant Paystack key.
3. We atomically assign an unused voucher from the tenant's pool.
4. We show the voucher on-screen and send it via SMS (Termii).

## Routes
- Landing page: `/`
- Login (admin + tenants): `/login`
- Forgot password: `/forgot-password`
- Reset password: `/reset-password/<token>`
- Admin dashboard: `/admin`
- Tenant purchase page: `/t/<slug>`
- Tenant setup (password + Paystack key): `/t/<slug>/setup`
- Tenant admin: `/t/<slug>/admin`
- Payment verification: `/t/<slug>/payment/verify/<reference>`

## Auth & Roles
- Single login page: `/login`
- After login:
  - Admin users go to `/admin`
  - Tenant users go to `/t/<slug>/admin` (or `/t/<slug>/setup` if setup isn't complete)
- Sessions use an HttpOnly cookie named `vs_session` stored in SQLite.

## Tenant Onboarding (Request -> Approve -> Login -> Setup)
1. Request: submit the form on `/` (or `POST /api/tenants/request`).
2. Approve/Deny: you (the owner/admin) receive an email with links:
   - `/api/admin/tenant-requests/<token>/approve`
   - `/api/admin/tenant-requests/<token>/deny`
3. Approve: the tenant receives login details by email (email + temporary password).
4. Tenant signs in at `/login` and is forced to complete setup at `/t/<slug>/setup`:
   - set a new password (required for newly-approved tenants)
   - add their Paystack secret key (required before `/t/<slug>` goes live)

## Admin Dashboard
In `/admin` you can:
- Create, edit, delete tenants
- Reset a tenant password (emails new login details)
- See whether a tenant has Paystack configured (last4 only)

## Voucher Import
Tenant admins can import Omada CSV vouchers from `/t/<slug>/admin`.

CLI importer:
```bash
node scripts/import-vouchers.mjs path/to/vouchers.csv --tenant <slug>
```

Optional: force a specific package code (e.g., `3h`):
```bash
node scripts/import-vouchers.mjs path/to/vouchers.csv --tenant <slug> --package 3h
```

The importer normalizes headers and supports `Code`, `Voucher Code`, or `csvCode` columns.

## Environment Variables
Create `.env.local` based on `.env.example`:

```env
DATABASE_URL=file:./data/dev.db
APP_URL=http://localhost:3000
ADMIN_API_KEY=change-this
TERMII_API_KEY=termii_xxx
TERMII_SENDER_ID=WiFi
RESUME_TTL_MINUTES=60
TENANT_SECRETS_KEY=base64-32-bytes-here
OWNER_EMAIL=owner@example.com
SMTP_HOST=mail.abdxl.cloud
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=postmaster@your-domain.com
SMTP_PASS=change-this
SMTP_FROM="Vince Stack <no-reply@your-domain.com>"
```

Notes:
- `TENANT_SECRETS_KEY` must be 32 bytes (base64). Example:
  `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
- `ADMIN_API_KEY` is optional (used for programmatic access to `GET /api/admin/stats`).
- SMTP settings should match your Mailcow server (host: `mail.abdxl.cloud`).

## Seed Accounts
Created on first database init:
- Admin: `seeduser@example.com` / `Passw0rdA1`
- Tenant: `walstreet@example.com` / `Pathfinder07!` (slug: `walstreet`)

## Local Development
```bash
npm install
npm run dev
```

## Resume Payments (Safe)
If a user closes the tab before completing payment, they can resume the transaction using their
reference and email. We only allow resume when:
- The transaction is still `pending`
- The email matches
- The transaction has not expired (default: 60 minutes)
- Rate limits allow the request

Tenant-scoped endpoint:
```
POST /api/t/<slug>/payments/resume
Body: { "reference": "WIFI-ABC123", "email": "user@example.com" }
```

## Admin Stats API
`GET /api/admin/stats` works for:
- Logged-in admins (session cookie), OR
- API key auth (if `ADMIN_API_KEY` is set):

```
GET /api/admin/stats
Header: x-admin-key: <ADMIN_API_KEY>
```

Tenant stats are available in the tenant dashboard (`/t/<slug>/admin`) after login.

## Notes
- Voucher assignment is atomic and idempotent to avoid duplicate delivery.
- Tenants must set their Paystack webhook URL to:
  `https://your-domain.com/api/t/<slug>/payments/webhook`

## Deployment Notes (Quick)
- Set `APP_URL` to your public HTTPS domain.
- Configure each tenant's Paystack webhook URL: `https://your-domain.com/api/t/<slug>/payments/webhook`
- Ensure the SQLite database path is writable (`DATABASE_URL=file:./data/dev.db`).
- For production, consider moving to Postgres and a managed process manager.
