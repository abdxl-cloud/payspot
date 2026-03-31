#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  sudo ./scripts/payspot-radius-reset.sh \
    --slug <tenant-slug> \
    --base-url <https://payspot.example.com> \
    [--adapter-base-url <http://127.0.0.1:3000>] \
    --adapter-secret <tenant-adapter-secret> \
    --nas-ips <ip1,ip2,...> \
    [--radius-secret <shared-secret>] \
    [--client-prefix <prefix>] \
    [--fr-base </etc/freeradius/3.0>] \
    [--config-dir </etc/payspot-radius>]

This performs a clean FreeRADIUS reset for a single PaySpot tenant:
- writes a fresh tenants.json
- writes the PaySpot adapter
- writes dedicated payspot auth/accounting modules
- writes a dedicated server site on 1812/1813
- writes a managed clients.conf block
- enables the payspot site, disables default, validates config, restarts FreeRADIUS
EOF
}

fail() {
  printf 'ERROR: %s\n' "$1" >&2
  exit 1
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

ensure_root() {
  [ "${EUID}" -eq 0 ] || fail "Run as root."
}

resolve_radius_group() {
  if getent group freerad >/dev/null 2>&1; then
    printf 'freerad'
    return 0
  fi
  if getent group radiusd >/dev/null 2>&1; then
    printf 'radiusd'
    return 0
  fi
  printf 'root'
}

generate_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 24
  else
    python3 - <<'PY'
import secrets
print(secrets.token_hex(24))
PY
  fi
}

SLUG=""
BASE_URL=""
ADAPTER_BASE_URL=""
ADAPTER_SECRET=""
RADIUS_SECRET=""
NAS_IPS=""
CLIENT_PREFIX="payspot"
FR_BASE="/etc/freeradius/3.0"
CONFIG_DIR="/etc/payspot-radius"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --slug)
      SLUG="${2:-}"
      shift 2
      ;;
    --base-url)
      BASE_URL="${2:-}"
      shift 2
      ;;
    --adapter-base-url)
      ADAPTER_BASE_URL="${2:-}"
      shift 2
      ;;
    --adapter-secret)
      ADAPTER_SECRET="${2:-}"
      shift 2
      ;;
    --radius-secret)
      RADIUS_SECRET="${2:-}"
      shift 2
      ;;
    --nas-ips)
      NAS_IPS="${2:-}"
      shift 2
      ;;
    --client-prefix)
      CLIENT_PREFIX="${2:-}"
      shift 2
      ;;
    --fr-base)
      FR_BASE="${2:-}"
      shift 2
      ;;
    --config-dir)
      CONFIG_DIR="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      fail "Unknown argument: $1"
      ;;
  esac
done

ensure_root
need_cmd python3
need_cmd freeradius
need_cmd systemctl

[ -n "$SLUG" ] || fail "--slug is required"
[ -n "$BASE_URL" ] || fail "--base-url is required"
[ -n "$ADAPTER_SECRET" ] || fail "--adapter-secret is required"
[ -n "$NAS_IPS" ] || fail "--nas-ips is required"
[ -d "$FR_BASE" ] || fail "FreeRADIUS base directory not found: $FR_BASE"

if [ -z "$ADAPTER_BASE_URL" ]; then
  ADAPTER_BASE_URL="$BASE_URL"
fi

if [ -z "$RADIUS_SECRET" ]; then
  RADIUS_SECRET="$(generate_secret)"
fi

TENANTS_FILE="$CONFIG_DIR/tenants.json"
ADAPTER_BIN="/usr/local/bin/payspot-radius-adapter"
SITES_AVAILABLE="$FR_BASE/sites-available"
SITES_ENABLED="$FR_BASE/sites-enabled"
MODS_AVAILABLE="$FR_BASE/mods-available"
MODS_ENABLED="$FR_BASE/mods-enabled"
CLIENTS_CONF="$FR_BASE/clients.conf"
PAYSPOT_SITE="$SITES_AVAILABLE/payspot"
PAYSPOT_AUTH="$MODS_AVAILABLE/payspot_auth"
PAYSPOT_ACCOUNTING="$MODS_AVAILABLE/payspot_accounting"

TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="/root/payspot-radius-backups/$TIMESTAMP"
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

backup_if_exists() {
  local path="$1"
  if [ -e "$path" ]; then
    cp -a "$path" "$BACKUP_DIR/$(basename "$path")"
  fi
}

backup_if_exists "$TENANTS_FILE"
backup_if_exists "$ADAPTER_BIN"
backup_if_exists "$PAYSPOT_SITE"
backup_if_exists "$PAYSPOT_AUTH"
backup_if_exists "$PAYSPOT_ACCOUNTING"
backup_if_exists "$CLIENTS_CONF"

RADIUS_GROUP="$(resolve_radius_group)"
mkdir -p "$CONFIG_DIR"
chown root:"$RADIUS_GROUP" "$CONFIG_DIR"
chmod 750 "$CONFIG_DIR"

python3 - "$TENANTS_FILE" "$SLUG" "$BASE_URL" "$ADAPTER_BASE_URL" "$ADAPTER_SECRET" "$RADIUS_SECRET" "$CLIENT_PREFIX" "$NAS_IPS" <<'PY'
import json
import sys
from pathlib import Path

path = Path(sys.argv[1])
slug = sys.argv[2]
base_url = sys.argv[3]
adapter_base_url = sys.argv[4]
adapter_secret = sys.argv[5]
radius_secret = sys.argv[6]
client_prefix = sys.argv[7]
nas_ips = [item.strip() for item in sys.argv[8].split(",") if item.strip()]

payload = {
    "tenants": {
        slug: {
            "base_url": base_url,
            "adapter_base_url": adapter_base_url,
            "adapter_secret": adapter_secret,
            "radius_secret": radius_secret,
            "client_prefix": client_prefix,
            "nas_ips": nas_ips,
        }
    }
}
path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
PY
chown root:"$RADIUS_GROUP" "$TENANTS_FILE"
chmod 640 "$TENANTS_FILE"

cat > "$ADAPTER_BIN" <<'PY'
#!/usr/bin/env python3
import datetime
import json
from pathlib import Path
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request

TENANTS_FILE = '/etc/payspot-radius/tenants.json'
TIMEOUT = 10
DISCONNECT_PORT = 3799
DEFAULT_INTERIM_INTERVAL = 300
CLIENTS_CONF_CANDIDATES = (
    '/etc/freeradius/3.0/clients.conf',
    '/etc/freeradius/clients.conf',
    '/etc/raddb/clients.conf',
)


def log(message: str) -> None:
    print(f'payspot-radius-adapter: {message}', file=sys.stderr)


def radius_escape(value: object) -> str:
    text = str(value)
    return text.replace('\\', '\\\\').replace('"', '\\"')


def emit_reply(attr: str, value: object, *, is_string: bool = False) -> None:
    if value is None:
        return
    if is_string:
        print(f'{attr} := "{radius_escape(value)}"')
    else:
        print(f'{attr} := {value}')


def load_tenants():
    path = Path(TENANTS_FILE)
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text()).get('tenants', {})
    except Exception as exc:
        log(f'failed to load tenants config: {exc}')
        return {}


def resolve_tenant(nas_ip: str, packet_src_ip: str = ''):
    tenants = load_tenants()
    if not tenants:
        log('no tenants configured in ' + TENANTS_FILE)
        return None, None, None

    for slug, tenant in tenants.items():
        if nas_ip and nas_ip in tenant.get('nas_ips', []):
            return slug, tenant.get('adapter_base_url') or tenant['base_url'], tenant['adapter_secret']

    for slug, tenant in tenants.items():
        if packet_src_ip and packet_src_ip in tenant.get('nas_ips', []):
            return slug, tenant.get('adapter_base_url') or tenant['base_url'], tenant['adapter_secret']

    if len(tenants) == 1:
        slug, tenant = next(iter(tenants.items()))
        if nas_ip or packet_src_ip:
            log(
                f"NAS/controller IPs ({nas_ip or '-'}, {packet_src_ip or '-'}) not matched; "
                f"falling back to sole tenant '{slug}'"
            )
        return slug, tenant.get('adapter_base_url') or tenant['base_url'], tenant['adapter_secret']

    log(
        f'NAS/controller IPs ({nas_ip!r}, {packet_src_ip!r}) did not match any tenant and multiple tenants are configured'
    )
    return None, None, None


def api_post(base_url: str, tenant_slug: str, adapter_secret: str, path: str, payload: dict):
    body = json.dumps(payload).encode('utf-8')
    request = urllib.request.Request(
        f'{base_url}/api/t/{tenant_slug}{path}',
        data=body,
        method='POST',
        headers={
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'x-radius-adapter-secret': adapter_secret,
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
            text = response.read().decode('utf-8')
            return response.getcode(), json.loads(text) if text else {}
    except urllib.error.HTTPError as exc:
        text = exc.read().decode('utf-8', errors='replace')
        try:
            return exc.code, json.loads(text) if text else {}
        except json.JSONDecodeError:
            return exc.code, text
    except Exception as exc:
        return 0, str(exc)


def parse_positive_int(raw: str):
    if raw is None:
        return None
    text = str(raw).strip()
    if not text:
        return None
    try:
        value = int(float(text))
    except ValueError:
        return None
    return max(0, value)


def combine_octets(low_word, high_word):
    low = low_word or 0
    high = high_word or 0
    return max(0, int(high) * 4294967296 + int(low))


def parse_iso8601(raw: str):
    if not raw:
        return None
    text = raw.strip()
    if not text:
        return None
    try:
        if text.endswith('Z'):
            text = text[:-1] + '+00:00'
        parsed = datetime.datetime.fromisoformat(text)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=datetime.timezone.utc)
        return parsed.astimezone(datetime.timezone.utc)
    except ValueError:
        return None


def parse_class(raw: str):
    if not raw:
        return {}
    text = raw.strip().strip('"')
    if not text.startswith('payspot;'):
        return {}
    fields = {}
    for part in text.split(';')[1:]:
        if '=' not in part:
            continue
        key, value = part.split('=', 1)
        fields[key] = value
    return fields


def read_radius_clients():
    clients = []
    for candidate in CLIENTS_CONF_CANDIDATES:
        path = Path(candidate)
        if not path.exists():
            continue
        try:
            text = path.read_text()
        except OSError:
            continue
        for match in re.finditer(r'client\s+[^\{]+\{(.*?)\}', text, re.S):
            block = match.group(1)
            ip_match = re.search(r'^\s*ipaddr\s*=\s*(\S+)\s*$', block, re.M)
            secret_match = re.search(r'^\s*secret\s*=\s*(.*?)\s*$', block, re.M)
            if not ip_match or not secret_match:
                continue
            clients.append({
                'ipaddr': ip_match.group(1).strip(),
                'secret': secret_match.group(1).strip(),
            })
    return clients


def find_radius_secret(nas_ip: str):
    clients = read_radius_clients()
    if not clients:
        return None

    for client in clients:
        if client['ipaddr'] == nas_ip:
            return client['secret']

    unique_secrets = {client['secret'] for client in clients if client['secret'] and client['ipaddr'] != '127.0.0.1'}
    if len(unique_secrets) == 1:
        secret = unique_secrets.pop()
        log(f'using shared fallback secret for disconnect target {nas_ip}')
        return secret

    return None


def send_disconnect(*, target_ip: str, session_id: str, username: str, calling_station_id: str, nas_ip_address: str = ''):
    if not target_ip or not session_id:
        return

    def _attempt_disconnect(send_to_ip: str, nas_attr_ip: str):
        secret = find_radius_secret(send_to_ip)
        if not secret and nas_attr_ip and nas_attr_ip != send_to_ip:
            secret = find_radius_secret(nas_attr_ip)
        if not secret:
            return False, f'disconnect skipped: no shared secret found for target={send_to_ip} nas={nas_attr_ip or "-"}'

        attrs = [
            f'Acct-Session-Id = "{radius_escape(session_id)}"',
            f'NAS-IP-Address = {nas_attr_ip}',
            f'Event-Timestamp = {int(time.time())}',
        ]
        if username:
            attrs.append(f'User-Name = "{radius_escape(username)}"')
        if calling_station_id:
            attrs.append(f'Calling-Station-Id = "{radius_escape(calling_station_id)}"')
        request_body = '\n'.join(attrs) + '\n'

        try:
            completed = subprocess.run(
                [
                    '/usr/bin/radclient',
                    '-t', '3',
                    '-r', '1',
                    '-x',
                    f'{send_to_ip}:{DISCONNECT_PORT}',
                    'disconnect',
                    secret,
                ],
                input=request_body,
                text=True,
                capture_output=True,
                timeout=TIMEOUT,
                check=False,
            )
        except Exception as exc:
            return False, f'disconnect failed for session={session_id}: {exc}'

        if completed.returncode != 0:
            details = completed.stderr.strip() or completed.stdout.strip() or 'unknown radclient failure'
            return False, f'disconnect rejected for session={session_id} target={send_to_ip}: {details}'

        return True, f'disconnect request sent for session={session_id} to target={send_to_ip} nas={nas_attr_ip}'

    nas_attr_ip = nas_ip_address or target_ip
    ok, message = _attempt_disconnect(target_ip, nas_attr_ip)
    log(message)
    if ok:
        return

    if nas_ip_address and nas_ip_address != target_ip:
        ok2, message2 = _attempt_disconnect(nas_ip_address, nas_attr_ip)
        log(message2)


def map_accounting_event(raw: str) -> str:
    value = (raw or '').strip().lower()
    mapping = {
        'start': 'start',
        'stop': 'stop',
        'alive': 'interim',
        'interim-update': 'interim',
        'interim': 'interim',
        'accounting-on': 'accounting-on',
        'accounting-off': 'accounting-off',
    }
    return mapping.get(value, value or 'interim')


def handle_auth(argv):
    if len(argv) < 4:
        emit_reply('Reply-Message', 'Missing username or password', is_string=True)
        return 1

    username = argv[2]
    password = argv[3]
    nas_ip = argv[4] if len(argv) > 4 else ''
    calling_station_id = argv[5] if len(argv) > 5 else ''

    slug, base_url, adapter_secret = resolve_tenant(nas_ip)
    if not slug:
        emit_reply('Reply-Message', 'No tenant configured for this NAS', is_string=True)
        return 1

    payload = {'username': username, 'password': password}
    if calling_station_id:
        payload['callingStationId'] = calling_station_id

    status, body = api_post(base_url, slug, adapter_secret, '/radius/authorize', payload)
    if status != 200 or not isinstance(body, dict):
        log(f'authorize backend failure status={status} body={body}')
        emit_reply('Reply-Message', 'Authentication backend unavailable', is_string=True)
        return 1

    if not body.get('accept'):
        emit_reply('Reply-Message', body.get('reason') or 'access_denied', is_string=True)
        return 1

    reply = body.get('reply') or {}

    session_timeout = parse_positive_int(reply.get('sessionTimeout'))
    if session_timeout and session_timeout > 0:
        emit_reply('Session-Timeout', session_timeout)

    interim_interval = parse_positive_int(reply.get('acctInterimInterval')) or DEFAULT_INTERIM_INTERVAL
    if interim_interval > 0:
        emit_reply('Acct-Interim-Interval', interim_interval)

    bandwidth_profile = str(reply.get('bandwidthProfile') or '').strip()
    if bandwidth_profile:
        emit_reply('Filter-Id', bandwidth_profile, is_string=True)
        emit_reply('Mikrotik-Rate-Limit', bandwidth_profile, is_string=True)

    data_limit_mb = parse_positive_int(reply.get('dataLimitMb'))
    if data_limit_mb and data_limit_mb > 0:
        emit_reply('Mikrotik-Total-Limit', data_limit_mb * 1024 * 1024)

    plan_ends_at = str(reply.get('planEndsAt') or '').strip()
    transaction_reference = str(body.get('transactionReference') or '').strip()
    subscriber_id = str(body.get('subscriberId') or '').strip()
    entitlement_id = str(body.get('entitlementId') or '').strip()

    class_parts = ['payspot']
    if transaction_reference:
        class_parts.append(f'transaction={transaction_reference}')
    if subscriber_id:
        class_parts.append(f'subscriber={subscriber_id}')
    if entitlement_id:
        class_parts.append(f'entitlement={entitlement_id}')
    if data_limit_mb and data_limit_mb > 0:
        class_parts.append(f'dataLimitMb={data_limit_mb}')
    if plan_ends_at:
        class_parts.append(f'planEndsAt={plan_ends_at}')
    if len(class_parts) > 1:
        emit_reply('Class', ';'.join(class_parts), is_string=True)

    emit_reply('Reply-Message', 'PaySpot access granted', is_string=True)
    return 0


def handle_accounting(argv):
    if len(argv) < 13:
        log('accounting called without expected arguments')
        return 0

    event = map_accounting_event(argv[2])
    session_id = argv[3] or 'unknown-session'
    acct_input = parse_positive_int(argv[4])
    acct_output = parse_positive_int(argv[5])
    acct_input_gigawords = parse_positive_int(argv[6])
    acct_output_gigawords = parse_positive_int(argv[7])
    username = argv[8]
    class_fields = parse_class(argv[9])
    calling_station_id = argv[10]
    called_station_id = argv[11]
    nas_ip_address = argv[12]
    packet_src_ip = argv[13] if len(argv) > 13 else ''

    slug, base_url, adapter_secret = resolve_tenant(nas_ip_address, packet_src_ip)
    if not slug:
        log(f'no tenant found for NAS/controller IPs {nas_ip_address!r}/{packet_src_ip!r}; dropping accounting packet')
        return 0

    payload = {
        'event': event,
        'sessionId': session_id,
    }
    if acct_input is not None:
        payload['acctInputOctets'] = acct_input
    if acct_output is not None:
        payload['acctOutputOctets'] = acct_output
    if acct_input_gigawords is not None:
        payload['acctInputGigawords'] = acct_input_gigawords
    if acct_output_gigawords is not None:
        payload['acctOutputGigawords'] = acct_output_gigawords
    if username:
        payload['username'] = username
    if calling_station_id:
        payload['callingStationId'] = calling_station_id
    if called_station_id:
        payload['calledStationId'] = called_station_id
    if nas_ip_address:
        payload['nasIpAddress'] = nas_ip_address

    subscriber_id = class_fields.get('subscriber')
    entitlement_id = class_fields.get('entitlement')
    transaction_reference = class_fields.get('transaction') or class_fields.get('transactionReference')
    data_limit_mb = parse_positive_int(class_fields.get('dataLimitMb', ''))
    plan_ends_at = parse_iso8601(class_fields.get('planEndsAt', ''))

    if subscriber_id:
        payload['subscriberId'] = subscriber_id
    if entitlement_id:
        payload['entitlementId'] = entitlement_id
    if transaction_reference:
        payload['transactionReference'] = transaction_reference

    if event in {'start', 'interim'} and not class_fields:
        log('accounting packet missing Class attribute; attribution relies on username/session fallback')

    should_disconnect = False
    total_bytes = combine_octets(acct_input, acct_input_gigawords) + combine_octets(acct_output, acct_output_gigawords)
    if data_limit_mb and total_bytes >= data_limit_mb * 1024 * 1024:
        should_disconnect = True
    if plan_ends_at and datetime.datetime.now(datetime.timezone.utc) >= plan_ends_at:
        should_disconnect = True

    status, body = api_post(base_url, slug, adapter_secret, '/radius/accounting', payload)
    if not (200 <= status < 300):
        log(f'accounting backend status={status} body={body}')
        return 0

    backend_disconnect = False
    backend_reason = ''
    if isinstance(body, dict):
        backend_disconnect = bool(body.get('disconnect'))
        backend_reason = str(body.get('reason') or '')
    if backend_disconnect:
        should_disconnect = True
        if backend_reason:
            log(f'backend requested disconnect reason={backend_reason} session={session_id}')

    if should_disconnect and event not in {'stop', 'accounting-on', 'accounting-off'}:
        disconnect_target = packet_src_ip or nas_ip_address
        send_disconnect(
            target_ip=disconnect_target,
            session_id=session_id,
            username=username,
            calling_station_id=calling_station_id,
            nas_ip_address=nas_ip_address,
        )
    return 0


def main():
    if len(sys.argv) < 2:
        log('missing mode')
        return 1
    mode = sys.argv[1].strip().lower()
    if mode == 'auth':
        return handle_auth(sys.argv)
    if mode == 'accounting':
        return handle_accounting(sys.argv)
    log(f'unsupported mode={mode}')
    return 1


if __name__ == '__main__':
    raise SystemExit(main())
PY
chown root:root "$ADAPTER_BIN"
chmod 750 "$ADAPTER_BIN"

cat > "$PAYSPOT_AUTH" <<'EOF'
exec payspot_auth {
    wait = yes
    input_pairs = request
    output_pairs = reply
    shell_escape = yes
    program = "/usr/local/bin/payspot-radius-adapter auth \"%{User-Name}\" \"%{User-Password}\" \"%{NAS-IP-Address}\" \"%{Calling-Station-Id}\""
}
EOF
chown root:"$RADIUS_GROUP" "$PAYSPOT_AUTH"
chmod 640 "$PAYSPOT_AUTH"

cat > "$PAYSPOT_ACCOUNTING" <<'EOF'
exec payspot_accounting {
    wait = yes
    input_pairs = request
    output_pairs = reply
    shell_escape = yes
    program = "/usr/local/bin/payspot-radius-adapter accounting \"%{Acct-Status-Type}\" \"%{Acct-Session-Id}\" \"%{Acct-Input-Octets}\" \"%{Acct-Output-Octets}\" \"%{Acct-Input-Gigawords}\" \"%{Acct-Output-Gigawords}\" \"%{User-Name}\" \"%{Class}\" \"%{Calling-Station-Id}\" \"%{Called-Station-Id}\" \"%{NAS-IP-Address}\" \"%{%{Packet-Src-IP-Address}:-%{Packet-Src-IPv6-Address}}\""
}
EOF
chown root:"$RADIUS_GROUP" "$PAYSPOT_ACCOUNTING"
chmod 640 "$PAYSPOT_ACCOUNTING"

cat > "$PAYSPOT_SITE" <<'EOF'
server payspot {
    listen {
        type = auth
        ipaddr = *
        port = 1812
    }

    listen {
        type = acct
        ipaddr = *
        port = 1813
    }

    authorize {
        preprocess

        if (&User-Password && !&EAP-Message) {
            update control {
                &Auth-Type := payspot_portal
            }
        }
        else {
            reject
        }
    }

    authenticate {
        Auth-Type payspot_portal {
            payspot_auth
        }
    }

    preacct {
        preprocess
        acct_unique
    }

    accounting {
        detail
        payspot_accounting
    }
}
EOF
chown root:"$RADIUS_GROUP" "$PAYSPOT_SITE"
chmod 640 "$PAYSPOT_SITE"

python3 - "$CLIENTS_CONF" "$TENANTS_FILE" <<'PY'
import json
import sys
from pathlib import Path

clients_conf = Path(sys.argv[1])
tenants = json.loads(Path(sys.argv[2]).read_text())["tenants"]

lines = [
    "# PaySpot-managed FreeRADIUS clients.conf",
    "",
    "client localhost {",
    "  ipaddr = 127.0.0.1",
    "  proto = *",
    "  secret = testing123",
    "  require_message_authenticator = no",
    "  nas_type = other",
    "}",
    "",
    "client localhost_ipv6 {",
    "  ipv6addr = ::1",
    "  proto = *",
    "  secret = testing123",
    "}",
    "",
    "# BEGIN PAYSPOT MANAGED CLIENTS",
]

for slug, tenant in tenants.items():
    prefix = tenant.get("client_prefix", "payspot")
    secret = tenant["radius_secret"]
    for index, ip in enumerate(tenant.get("nas_ips", []), start=1):
        lines.extend([
            f"# tenant: {slug}",
            f"client {prefix}-{slug}-{index} {{",
            f"  ipaddr = {ip}",
            f"  secret = {secret}",
            f"  shortname = {prefix}{slug}{index}",
            "  nastype = other",
            "  require_message_authenticator = yes",
            "}",
            "",
        ])

lines.append("# END PAYSPOT MANAGED CLIENTS")
clients_conf.write_text("\n".join(lines) + "\n", encoding="utf-8")
PY
chown root:"$RADIUS_GROUP" "$CLIENTS_CONF"
chmod 640 "$CLIENTS_CONF"

ln -sfn ../mods-available/payspot_auth "$MODS_ENABLED/payspot_auth"
ln -sfn ../mods-available/payspot_accounting "$MODS_ENABLED/payspot_accounting"
ln -sfn ../sites-available/payspot "$SITES_ENABLED/payspot"
rm -f "$SITES_ENABLED/default"

freeradius -XC >/dev/null
systemctl restart freeradius
systemctl --no-pager --full status freeradius | sed -n '1,10p'

printf '\nFresh PaySpot RADIUS config applied.\n'
printf 'Tenant slug: %s\n' "$SLUG"
printf 'Base URL: %s\n' "$BASE_URL"
printf 'RADIUS shared secret: %s\n' "$RADIUS_SECRET"
printf 'Backups: %s\n' "$BACKUP_DIR"
