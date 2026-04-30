# Omada OpenAPI Remote Access Setup (Detailed Operator Runbook)

Date: 2026-03-05

## Verification status (official vs implementation)
Officially verified from TP-Link/OpenSSH sources:
- Omada OpenAPI regional domain list (`aps1`, `euw1`, `use1`) and the instruction to use `Settings -> Platform Integration -> Open API -> View -> Interface Access Address` are present in official Omada OpenAPI docs (`/v3/api-docs`).
- Token endpoint path `/openapi/authorize/token` and `POST` method requirement are present in official Omada OpenAPI docs.
- Northbound OpenAPI docs endpoints are reachable and current:
  - `https://euw1-omada-northbound.tplinkcloud.com/v3/api-docs`
  - `https://use1-omada-northbound.tplinkcloud.com/v3/api-docs`
- OpenSSH tunnel flags (`-L`, `-R`) are from official OpenSSH manual.

Implementation guidance in this runbook (not TP-Link step text):
- Linux host commands (`apt`, `wireguard`, `systemd`)
- Nginx reverse-proxy examples
- Operational rollout/rollback sequence and health-check workflow

## What this document solves
You have:
- PaySpot running on a VPS
- Omada controller in another location/network
- Tenant admin failing with `Controller ID not exist` or site discovery failure

This runbook gives exact, executable steps for 3 production options.

## The 3 production options
1. Option 1: Use Omada public/northbound endpoint (if your app exposes a public Interface Access Address)
2. Option 2: Keep Omada private and connect VPS to LAN via VPN
3. Option 3: Publish a hardened reverse proxy domain to Omada OpenAPI

`SSH tunnel` is trial-only and is included at the end as temporary fallback.

## Preflight (do this first)

### Client starting screen
Most client controllers may first open to the Omada `Global View` dashboard, with:
- left menu: `Dashboard`, `Devices`, `Logs`, `Firmware`, `Network Tools`, `Accounts`, `Settings`
- top status: `Cloud Access - Connected`
- center tab: `Site List`
- one or more sites, for example `WALLSTREET WIFI`

This screen is a valid starting point for PaySpot documentation, but it does not confirm OpenAPI support by itself.

From this exact screen, the client should:
1. Stay in `Global View`.
2. Click `Settings` in the left menu.
3. Open `Platform Integration`.
4. Look for `Open API`.

If `Open API` is present, continue with the OpenAPI setup below.

If `Open API` is missing, use one of the fallback paths:
- `CSV import`: safest for older Omada deployments.
- `RADIUS voucher` or `RADIUS account access`: best automation path when OpenAPI is unavailable or unreliable.
- `MikroTik REST`: only when the hotspot is handled by MikroTik instead of Omada vouchers.

Ask the client to also capture the controller version from the controller `About` or controller settings screen. The Global View screenshot alone does not show the exact version.

### A) Confirm exact values in Omada UI
Navigation:
1. Omada -> `Global View`
2. `Settings`
3. `Platform Integration`
4. `Open API`
5. On your app row (`PAYSPOT`), click `View` (eye icon)

Record these exactly:
- `Interface Access Address` -> this will become PaySpot `API Base URL`
- `Omada ID` -> this is PaySpot `Omada ID` (`omadacId`)
- `Client ID` -> from app row
- `Client Secret` -> from app row (reveal/copy)

If `Interface Access Address` is private like `https://192.168.1.21:443`, Option 1 will not work from a public VPS unless you add VPN/proxy.

### B) Confirm PaySpot field mapping
Tenant admin path:
1. Open `/t/<slug>/admin`
2. `Quick actions` -> `Configure architecture`
3. Set:
   - `Access mode` = `Voucher access`
   - `Voucher source` = `Omada OpenAPI sync`

Fill fields:
- `API Base URL` = Omada `Interface Access Address`
- `Omada ID` = Omada `Omada ID`
- `Client ID` = Omada app `Client ID`
- `Client Secret` = Omada app `Client Secret`
- `Site ID` = selected from `Fetch sites`

Code references for required fields:
- [src/lib/omada.ts](/Users/serveradmin/Abdul's/payspot/src/lib/omada.ts)
- [src/app/api/t/[slug]/admin/architecture/discover-sites/route.ts](/Users/serveradmin/Abdul's/payspot/src/app/api/t/[slug]/admin/architecture/discover-sites/route.ts)
- [src/app/api/t/[slug]/admin/architecture/test-omada/route.ts](/Users/serveradmin/Abdul's/payspot/src/app/api/t/[slug]/admin/architecture/test-omada/route.ts)

### C) Rotate leaked credentials now
Because secrets/tokens were previously shared:
1. Regenerate OpenAPI `Client Secret`
2. Log out of Omada cloud session
3. Use only the new secret in PaySpot

## Option 1: Public/Northbound endpoint (simplest when available)
Use this only if your Omada app `Interface Access Address` is public, not a LAN IP.

### Step 1: Get the correct base URL from Omada
In `Open API -> View` modal copy `Interface Access Address` exactly.

Do not use:
- controller web UI `index.html?...` links
- random regional host without verifying against your app

### Step 2: Validate endpoint from VPS
On the VPS where PaySpot runs:
```bash
curl -i "<API_BASE_URL>/openapi/authorize/token?grant_type=client_credentials"
```
Expected:
- HTTP `405`
- header includes `Allow: POST`

Then run a real token request:
```bash
curl -sS -X POST "<API_BASE_URL>/openapi/authorize/token?grant_type=client_credentials" \
  -H 'Content-Type: application/json' \
  -d '{"omadacId":"<OMADA_ID>","client_id":"<CLIENT_ID>","client_secret":"<CLIENT_SECRET>"}'
```
Expected:
- success: `{"errorCode":0, ... "accessToken": ...}`
- if `Controller ID not exist`: your `API Base URL` and `Omada ID` are not matched to same controller context

### Step 3: Configure PaySpot
In tenant admin, paste all 4 credentials and click:
1. `Fetch sites`
2. select site
3. `Test Omada connection`
4. `Save architecture`

### Step 4: Verify end-to-end
1. Create a tiny voucher batch/test transaction
2. ensure voucher generation succeeds
3. verify logs for errors in app server

## Option 2: VPN (recommended for your current private Interface Access Address)
Use this when Omada shows private `Interface Access Address` like `https://192.168.1.21:443`.

## Target outcome
VPS can route to Omada LAN IP securely, without exposing controller publicly.

### Step 1: Create VPN server on Omada gateway
In Omada controller (gateway adopted and managed):
1. Go to `Global View`
2. Open target site
3. Go to `Settings`
4. Go to `VPN`
5. Choose one:
   - `WireGuard Server` (recommended)
   - `OpenVPN Server`
   - `L2TP/IPSec Server`

For WireGuard typically set:
- Tunnel subnet (example `10.14.0.0/24`)
- Listen port (example `51820/UDP`)
- Allowed client subnet/routes

Create client profile and export config (`.conf` for WireGuard).

### Step 2: Configure VPN client on VPS (WireGuard example)
On Ubuntu VPS:
```bash
sudo apt-get update
sudo apt-get install -y wireguard
```
Place exported client file:
```bash
sudo install -m 600 client.conf /etc/wireguard/wg0.conf
```
Bring tunnel up:
```bash
sudo wg-quick up wg0
sudo systemctl enable wg-quick@wg0
```
Check status:
```bash
sudo wg show
ip route
```

### Step 3: Verify LAN reachability from VPS
```bash
nc -vz 192.168.1.21 443
curl -vk "https://192.168.1.21:443/openapi/authorize/token?grant_type=client_credentials"
```
Expected:
- TCP connect succeeds
- HTTPS responds (may show cert warning if private cert)

### Step 4: Handle TLS trust
If cert is self-signed/private, Node server-side fetch may fail.
You need one of:
1. install trusted cert chain for that endpoint path, or
2. place an internal TLS terminator with trusted cert

Do not disable TLS validation globally in production.

### Step 5: Configure PaySpot with private API base URL
Use in tenant admin:
- `API Base URL` = `https://192.168.1.21:443`
- `Omada ID`, `Client ID`, `Client Secret` from same app

Then:
1. `Fetch sites`
2. pick site
3. `Test Omada connection`
4. save

### Step 6: Keep it stable
- Enable tunnel auto-start
- Add monitoring on tunnel health
- Re-test after Omada firmware updates

Official refs:
- WireGuard: https://www.tp-link.com/en/support/faq/3817/
- OpenVPN: https://www.tp-link.com/en/support/faq/3617/
- L2TP/IPSec: https://www.tp-link.com/en/support/faq/3381/

## Option 3: Reverse proxy with public domain (no VPN client on VPS)
Use when you want PaySpot VPS to call a public HTTPS domain you control.

## Target outcome
`https://omada-api.example.com/openapi/...` forwards to Omada `https://192.168.1.21:443/openapi/...`

### Step 1: Prepare DNS + server
1. Create DNS A/AAAA for `omada-api.example.com` to your proxy host public IP
2. Deploy proxy host (can be dedicated VM or edge router with reverse proxy capability)
3. Ensure proxy host can reach Omada LAN IP (same LAN, site-to-site, or routed path)

### Step 2: Issue public TLS cert
Use Let’s Encrypt via certbot/caddy.

Nginx + certbot example (Ubuntu):
```bash
sudo apt-get update
sudo apt-get install -y nginx certbot python3-certbot-nginx
```

### Step 3: Configure proxy
Nginx server block:
```nginx
server {
  listen 443 ssl;
  server_name omada-api.example.com;

  ssl_certificate /etc/letsencrypt/live/omada-api.example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/omada-api.example.com/privkey.pem;

  location /openapi/ {
    proxy_pass https://192.168.1.21:443;
    proxy_ssl_server_name on;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  }
}
```

Enable + reload:
```bash
sudo nginx -t
sudo systemctl reload nginx
```

### Step 4: Harden exposure
- Expose only `443`
- IP allowlist VPS egress IP if possible
- Rate-limit `/openapi/authorize/token`
- Keep Omada admin UI path off public internet (proxy only `/openapi/`)

### Step 5: Validate from VPS
```bash
curl -i "https://omada-api.example.com/openapi/authorize/token?grant_type=client_credentials"
curl -sS -X POST "https://omada-api.example.com/openapi/authorize/token?grant_type=client_credentials" \
  -H 'Content-Type: application/json' \
  -d '{"omadacId":"<OMADA_ID>","client_id":"<CLIENT_ID>","client_secret":"<CLIENT_SECRET>"}'
```

### Step 6: Configure PaySpot
- `API Base URL` = `https://omada-api.example.com`
- other fields unchanged
- fetch sites -> test -> save

## How to move after setup (migration paths)

### Move A: SSH trial -> VPN (recommended)
1. Confirm credentials via temporary tunnel
2. build permanent VPN
3. change PaySpot `API Base URL` to private Omada URL over VPN
4. remove SSH tunnel

### Move B: VPN -> reverse proxy
1. Keep VPN as rollback
2. deploy proxy + public cert
3. switch `API Base URL` to public domain
4. run fetch/test again
5. if failure, rollback to VPN URL immediately

### Move C: private/local app -> public/northbound app
1. create/verify app context that exposes public Interface Access Address
2. copy new `API Base URL` and `Omada ID` together
3. update PaySpot fields as one set
4. fetch sites + test + save

## Error-led troubleshooting (exact actions)

### Error: `Controller ID not exist`
Do exactly:
1. In Omada `Open API -> View`, copy fresh `Interface Access Address`
2. copy fresh `Omada ID` from same modal
3. copy app `Client ID` + regenerate/copy `Client Secret`
4. paste all into PaySpot in one shot
5. click `Fetch sites`

If still failing:
- if base URL is private IP and PaySpot is on VPS, choose Option 2 or 3

### Error: TLS/unsafe certificate
Do exactly:
1. test with `curl -vk` from VPS to see cert chain/hostname
2. ensure URL host matches cert CN/SAN
3. use public CA cert (reverse proxy) or trusted internal PKI

### Error: fetch sites fails but token works
Likely permission/scope issue.
Do exactly:
1. edit Open API app permissions
2. include site-level privileges for target site
3. retry fetch sites

## Trial-only fallback: SSH tunnel (not production)
Use this only to prove connectivity before implementing Option 2 (VPN) or Option 3 (reverse proxy).

## Goal
Forward Omada LAN endpoint `192.168.1.21:443` through an SSH tunnel so your VPS can call it temporarily.

## Before you start: what `controller_ssh_user` means
`controller_ssh_user` is not always an Omada UI user.

There are two SSH contexts:
1. Managed device SSH (gateway/switch/AP): credentials come from Omada `Device Account`.
2. Controller host SSH (machine running Omada Software Controller): credentials are OS users created on that host outside Omada UI.

Implication:
- Software Controller on Linux: `controller_ssh_user` is a Linux account on that server.
- OC200/OC300 hardware controller: shell access can be limited; this method may be unavailable depending on firmware/build.

## Prerequisites
You need:
1. A LAN host that can reach Omada controller IP on port 443
2. SSH access from that LAN host to your VPS
3. Ability to bind a port on VPS (example `9443`)

On LAN host, verify local reachability first:
```bash
nc -vz 192.168.1.21 443
curl -vk "https://192.168.1.21:443/openapi/authorize/token?grant_type=client_credentials"
```
If this fails, fix LAN/controller access first.

## How to enable SSH in Omada (managed device context)
Menu wording varies by version, usually:
1. Go to `Site` view.
2. Open `Settings`.
3. Open `Services`.
4. Open `SSH`.
5. Enable `SSH Login`.
6. Set SSH port (default `22` unless you changed it).
7. Click `Apply`/`Save`.

## Where SSH username/password comes from
For managed devices, configure credentials in:
1. `Settings -> Site` (or `Settings -> Site Settings`)
2. `Device Account`
3. Set/update `Username` and `Password`
4. Save

Note:
- This controls SSH login to managed devices that expose SSH.
- It does not create OS users on a separate Linux server running Software Controller.

## How to create `controller_ssh_user` on Software Controller host (Linux)
If your controller is Software Controller on Linux:
```bash
sudo adduser omada-tunnel
sudo -u omada-tunnel mkdir -p /home/omada-tunnel/.ssh
sudo -u omada-tunnel chmod 700 /home/omada-tunnel/.ssh
sudo -u omada-tunnel tee /home/omada-tunnel/.ssh/authorized_keys >/dev/null <<'KEY'
<YOUR_PUBLIC_KEY>
KEY
sudo -u omada-tunnel chmod 600 /home/omada-tunnel/.ssh/authorized_keys
```
Then use `omada-tunnel` as `controller_ssh_user`.

If you cannot get shell access on controller hardware (OC200/OC300), use a separate LAN Linux box as the tunnel node instead.

## If you insist on tunneling from the controller shell itself (experimental)
This works only if the controller exposes interactive shell + SSH client binary.

1. From LAN, test controller SSH login:
```bash
ssh <controller_ssh_user>@192.168.1.21
```
2. On that shell, verify outbound SSH client exists:
```bash
which ssh
```
3. If it exists, open reverse tunnel from controller to VPS:
```bash
ssh -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 -o ServerAliveCountMax=3 -NT \
  -R 127.0.0.1:18843:127.0.0.1:8843 \
  <vps_user>@<vps_public_ip>
```

If `which ssh` returns nothing or shell is restricted, do not use this path; use a LAN Linux tunnel node.

## Setup path A (recommended for trial): reverse tunnel LAN -> VPS
Run this on LAN host:
```bash
ssh -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 -o ServerAliveCountMax=3 -N \
  -R 127.0.0.1:9443:192.168.1.21:443 <vps_user>@<vps_public_ip>
```

What this does:
- Opens `127.0.0.1:9443` on VPS
- Forwards traffic over SSH to `192.168.1.21:443` on LAN

Test on VPS:
```bash
curl -vk "https://127.0.0.1:9443/openapi/authorize/token?grant_type=client_credentials"
```
Expected: HTTPS response from Omada endpoint.

## Setup path B: publish tunnel port behind local VPS proxy (for PaySpot app process)
If your app cannot use loopback-only port directly, map to local proxy.

Nginx on VPS example:
```nginx
server {
  listen 443 ssl;
  server_name omada-trial.example.com;

  ssl_certificate /etc/letsencrypt/live/omada-trial.example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/omada-trial.example.com/privkey.pem;

  location /openapi/ {
    proxy_pass https://127.0.0.1:9443;
    proxy_ssl_server_name on;
  }
}
```
Then set PaySpot `API Base URL` to `https://omada-trial.example.com`.

## Run tunnel in background (systemd user service on LAN host)
Create `~/.config/systemd/user/omada-reverse-tunnel.service`:
```ini
[Unit]
Description=Omada reverse SSH tunnel to VPS
After=network-online.target

[Service]
ExecStart=/usr/bin/ssh -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 -o ServerAliveCountMax=3 -N -R 127.0.0.1:9443:192.168.1.21:443 user@your-vps
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
```
Enable/start:
```bash
systemctl --user daemon-reload
systemctl --user enable --now omada-reverse-tunnel.service
systemctl --user status omada-reverse-tunnel.service
```

## PaySpot values during SSH trial
In `/t/<slug>/admin -> Configure architecture` use:
- `API Base URL`:
  - `https://127.0.0.1:9443` if app process on VPS can reach it, or
  - your temporary proxy domain (recommended)
- `Omada ID`: from Omada Open API `View` modal
- `Client ID`: from app row
- `Client Secret`: from app row
- `Site ID`: via `Fetch sites`

Then click:
1. `Fetch sites`
2. select site
3. `Test Omada connection`
4. `Save architecture`

## Known tunnel limitations
- Not HA; disconnect breaks API
- Certificate/hostname mismatch likely on raw `127.0.0.1`
- Operationally fragile for production

## Teardown after migration
On LAN host:
```bash
systemctl --user disable --now omada-reverse-tunnel.service || true
pkill -f "-R 127.0.0.1:9443:192.168.1.21:443" || true
```
On VPS:
- Remove temporary proxy/port rules
- Switch PaySpot `API Base URL` to final VPN/proxy/public option

OpenSSH reference:
- https://man.openbsd.org/ssh

## Final acceptance checklist (must pass)
1. `Fetch sites` succeeds in tenant admin
2. `Test Omada connection` succeeds
3. Save architecture succeeds
4. One real voucher flow succeeds
5. Secrets rotated and stored safely

## Official references
- Omada OpenAPI (EU): https://euw1-omada-northbound.tplinkcloud.com/v3/api-docs
- Omada OpenAPI (US): https://use1-omada-northbound.tplinkcloud.com/v3/api-docs
- TP-Link Open API FAQ: https://www.tp-link.com/en/support/faq/3980/
- TP-Link cloud access FAQ: https://www.tp-link.com/en/support/faq/3172/
- TP-Link certificate warning FAQ: https://www.tp-link.com/en/support/faq/3662/
- Omada controller user guide: https://www.tp-link.com/en/user-guides/omada-software-controller/chapter-5-configure-omada-sdn-controller
