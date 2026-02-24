# PaySpot (Multi-tenant Omada Voucher Portal)

This project is a multi-tenant paid WiFi voucher portal built with Next.js and shadcn/ui.
Each tenant gets:
- A dedicated purchase link under `/t/<slug>`
- Isolated vouchers and sales
- Their own Paystack secret key for separate payouts

Voucher codes are generated in Omada, exported as CSV, imported into a PostgreSQL voucher pool, and
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
- Sessions use an HttpOnly cookie named `vs_session` stored in PostgreSQL.

## Tenant Onboarding (Request -> Approve -> Login -> Setup)
1. Request: submit the form on `/` (or `POST /api/tenants/request`).
2. Approve/Deny: you (the owner/admin) receive an email with links:
   - `/api/admin/tenant-requests/<token>/approve`
   - `/api/admin/tenant-requests/<token>/deny`
3. Approve: the tenant receives login details by email (email + temporary password).
4. Tenant signs in at `/login` and is forced to complete setup at `/t/<slug>/setup`:
   - set a new password (required for newly-approved tenants)
  - add their Paystack secret key (`sk_test_...` for testing or `sk_live_...` for production)

## Admin Dashboard
In `/admin` you can:
- Create, edit, delete tenants
- Reset a tenant password (emails new login details)
- See whether a tenant has Paystack configured (last4 only)

## Voucher Import
Tenant admins can import Omada CSV vouchers from `/t/<slug>/admin`.

You can also auto-generate vouchers in `/t/<slug>/admin`:
- Add one code manually, or
- Generate a batch with optional prefix and code length.

Important for Omada deployments: locally generated codes only work if the same codes also exist in Omada. For true Omada-backed access, keep importing Omada-generated vouchers (or add an Omada API sync flow).

## Architecture Modes
Tenant admins can set architecture options in `/t/<slug>/admin`:
- `Voucher source`:
  - `import_csv` (default, safest)
  - `omada_openapi` (generate in Omada via OpenAPI and mirror into local pool)
- `Portal auth architecture`:
  - `omada_builtin`
  - `external_portal_api`
  - `external_radius_portal`

When `omada_openapi` is enabled, voucher generation in admin uses Omada OpenAPI:
- `POST /openapi/authorize/token?grant_type=client_credentials`
- `POST /openapi/v1/{omadacId}/sites/{siteId}/hotspot/voucher-groups`
- `GET /openapi/v1/{omadacId}/sites/{siteId}/hotspot/voucher-groups/{groupId}`

Those routes are from Omada’s official OpenAPI document (`/v3/api-docs`) and access guide.

The admin Architecture section also includes a `Test Omada connection` action, which validates:
- access token retrieval
- tenant site API reachability (`GET /openapi/v1/{omadacId}/sites/{siteId}/hotspot/voucher-groups?page=1&pageSize=1`)

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
Create `.env` based on `.env.example`:

```env
DATABASE_URL=postgresql://postgres:change-this-strong-password@postgres:5432/payspot
POSTGRES_DB=payspot
POSTGRES_USER=postgres
POSTGRES_PASSWORD=change-this-strong-password
POSTGRES_HOST_PORT=5433
APP_URL=http://localhost:3000
SESSION_COOKIE_SECURE=false
FORCE_HTTPS=false
ADMIN_API_KEY=change-this-strong-key
TERMII_API_KEY=termii_xxx
TERMII_SENDER_ID=WiFi
RESUME_TTL_MINUTES=60
TENANT_SECRETS_KEY=base64-32-bytes-here
OWNER_EMAIL=owner@example.com
SMTP_HOST=mail.abdxl.cloud
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=postmaster@your-domain.com
SMTP_PASS=change-this-strong-password
SMTP_FROM="PaySpot <no-reply@your-domain.com>"
```

Notes:
- When running the app inside Docker Compose, use `postgres` as the DB host in `DATABASE_URL`.
- Docker publishes Postgres on `POSTGRES_HOST_PORT` (default `5433`) to avoid conflicts with other stacks.
- When running the app directly on your host machine, switch DB host to `localhost` and port to `POSTGRES_HOST_PORT`.
- `SESSION_COOKIE_SECURE` controls the auth cookie `Secure` flag.
- Use `false` for plain HTTP deployments, `true` for HTTPS. If unset, app infers from `APP_URL`.
- `FORCE_HTTPS=true` enables app-level redirects from HTTP to HTTPS (recommended in production).
- If `FORCE_HTTPS` is unset, app also enforces HTTPS automatically when `APP_URL` starts with `https://`.
- `TENANT_SECRETS_KEY` must be 32 bytes (base64). Example:
  `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
- `ADMIN_API_KEY` is optional (used for programmatic access to `GET /api/admin/stats`).
- SMTP settings should match your Mailcow server (host: `mail.abdxl.cloud`).

## Seed Accounts
Created on first database init:
- Admin: `seeduser@example.com` / `Passw0rdA1`
- Tenant: `walstreet@example.com` / `Pathfinder07!` (slug: `walstreet`)

If seeded admin login fails on an existing DB, you can reset it:
```bash
make seed-admin-reset SEED_ADMIN_PASSWORD='Use-A-Strong-Password-Here'
```

## Local Development
Start Postgres and app with Docker (recommended):
```bash
make bootstrap
```

Run app directly on host (requires Postgres running separately):
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
- Ensure PostgreSQL is reachable from the app (`DATABASE_URL=postgresql://...`).
- Use a managed PostgreSQL instance and a production process manager/orchestrator.

## SSL Setup (Nginx Proxy Manager)
If your domain is `payspot.abdxl.cloud` on server `109.205.181.4`:
1. Ensure DNS `A` record points `payspot.abdxl.cloud` -> `109.205.181.4`.
2. Configure app env for HTTPS:
   ```bash
   make ssl-env DOMAIN=payspot.abdxl.cloud
   make up
   ```
3. In Nginx Proxy Manager:
   - Proxy Host: `payspot.abdxl.cloud`
   - Forward Host/IP: `109.205.181.4`
   - Forward Port: `3000`
   - Scheme: `http`
4. In NPM SSL tab:
   - Request a Let's Encrypt certificate
   - Enable `Force SSL`
   - Enable `HTTP/2`
   - Enable `HSTS`
