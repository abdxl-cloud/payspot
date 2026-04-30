# PaySpot Tenant Onboarding Documentation Map

Use this page as the onboarding checklist for a new tenant. Pick the guide based on how the tenant's hotspot currently authenticates users.

## Start here

1. Confirm the tenant's network platform:
   - Omada controller
   - MikroTik RouterOS
   - External RADIUS
   - Manual voucher export/import
2. Confirm whether users must be able to buy while still unauthenticated on the captive network.
3. Configure the portal access list before testing captive-portal purchase flows.
4. Run one small real payment or test payment before going live.

## Documentation List

### CSV Import

Use CSV import when:
- the tenant already creates vouchers inside Omada
- the controller does not expose OpenAPI
- OpenAPI voucher creation is unreliable on that controller version
- the tenant wants the safest first launch
- the hotspot will continue to authenticate with Omada's normal voucher page

Docs:
- In app: `/help/csv-import`
- Markdown: `docs/omada-remote-openapi-setup.md` fallback notes

Important:
- Create vouchers in Omada first.
- Export voucher codes as CSV.
- Import each CSV into the matching PaySpot plan.
- If customers buy from inside the captive network, also configure the Omada pre-authentication access list.

### Omada Portal Access List

Use this guide when:
- the PaySpot store must open before the user is authenticated
- Paystack checkout must load inside the captive portal browser
- the tenant is using a custom Omada portal page with a "Buy Voucher" button
- the tenant is using External Web Portal with RADIUS/account access

Docs:
- In app: `/help/omada-access-list`
- Markdown: `docs/omada-portal-access-list.md`

### Custom Captive Portal Page

Use this guide when:
- the tenant wants Omada's captive portal to show a custom page
- the page should link to PaySpot for buying vouchers
- the tenant wants External Web Portal with PaySpot account access

Docs:
- In app: `/help/custom-portal`
- Markdown: `docs/custom-captive-portal-page.md`

### Omada OpenAPI

Use Omada OpenAPI when:
- `Global View -> Settings -> Platform Integration -> Open API` exists
- the tenant can create a Client mode app
- the app has hotspot/voucher permissions for the correct site
- `Fetch sites` and `Test Omada connection` pass in PaySpot

Docs:
- In app: `/help/omada-openapi`
- Markdown: `docs/omada-remote-openapi-setup.md`

### External RADIUS Account Access

Use this when:
- customers should have accounts instead of one-time Omada vouchers
- RADIUS should enforce active plans, device limits, data limits, and accounting
- there is a RADIUS adapter/service that can call PaySpot APIs

Docs:
- In app: `/help/external-radius`

### RADIUS Voucher

Use this when:
- PaySpot should generate paid voucher credentials
- RADIUS should enforce usage and accounting
- the hotspot accepts RADIUS username/password authentication

Docs:
- In app: `/help/radius-voucher`

### MikroTik REST

Use this when:
- the tenant uses MikroTik HotSpot
- PaySpot should create RouterOS hotspot users directly after payment
- the router REST API is reachable from PaySpot

Docs:
- In app: `/help/mikrotik-rest`

## Recommended Onboarding Sequence For Omada Tenants

1. Check whether `Open API` exists.
2. If OpenAPI exists, try `/help/omada-openapi`.
3. If OpenAPI is missing or fails, choose `/help/csv-import`.
4. If users must buy while captive, configure `/help/omada-access-list`.
5. If the tenant wants a branded captive entry page, configure `/help/custom-portal`.
6. If the tenant wants account login or data accounting, move to `/help/external-radius` or `/help/radius-voucher`.

