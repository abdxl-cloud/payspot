#!/usr/bin/env bash
set -euo pipefail

FR_BASE="${FR_BASE:-}"
FR_DEFAULT_SITE=""
FR_CLIENTS=""
FR_AUTHORIZE_FILE=""
FR_MODS_AVAILABLE=""
FR_MODS_ENABLED=""
FR_ADAPTER_BIN="/usr/local/bin/payspot-radius-adapter"
PAYSPOT_CONFIG_DIR="/etc/payspot-radius"
PAYSPOT_TENANTS_FILE="$PAYSPOT_CONFIG_DIR/tenants.json"
BACKUP_DIR="${BACKUP_DIR:-}"

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

bold() {
  printf '\033[1m%s\033[0m\n' "$1"
}

warn() {
  printf 'WARN: %s\n' "$1" >&2
}

fail() {
  printf 'ERROR: %s\n' "$1" >&2
  exit 1
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

ensure_root() {
  if [ "${EUID}" -ne 0 ]; then
    fail "Run this script as root (or via sudo)."
  fi
}

trim() {
  local value="$1"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  printf '%s' "$value"
}

prompt_required() {
  local label="$1"
  local current=""
  while :; do
    read -r -p "$label: " current
    current="$(trim "$current")"
    if [ -n "$current" ]; then
      printf '%s' "$current"
      return 0
    fi
    warn "This value is required."
  done
}

prompt_default() {
  local label="$1"
  local default_value="$2"
  local current=""
  read -r -p "$label [$default_value]: " current
  current="$(trim "$current")"
  if [ -z "$current" ]; then
    printf '%s' "$default_value"
    return 0
  fi
  printf '%s' "$current"
}

prompt_optional() {
  local label="$1"
  local current=""
  read -r -p "$label: " current
  trim "$current"
}

prompt_yes_no() {
  local label="$1"
  local default_value="${2:-y}"
  local prompt="[Y/n]"
  local answer=""
  if [ "$default_value" = "n" ]; then
    prompt="[y/N]"
  fi
  while :; do
    read -r -p "$label $prompt: " answer
    answer="$(trim "$answer")"
    if [ -z "$answer" ]; then
      answer="$default_value"
    fi
    case "${answer,,}" in
      y|yes) return 0 ;;
      n|no) return 1 ;;
      *) warn "Please answer y or n." ;;
    esac
  done
}

file_contains() {
  local file_path="$1"
  local pattern="$2"
  grep -q "$pattern" "$file_path"
}

generate_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 24
    return 0
  fi

  python3 - <<'PY'
import secrets
print(secrets.token_hex(24))
PY
}

resolve_freeradius_paths() {
  local candidates=()
  if [ -n "$FR_BASE" ]; then
    candidates+=("$FR_BASE")
  fi
  candidates+=("/etc/freeradius/3.0" "/etc/freeradius" "/etc/raddb")

  local base=""
  for candidate in "${candidates[@]}"; do
    if [ -d "$candidate" ]; then
      base="$candidate"
      break
    fi
  done

  [ -n "$base" ] || fail "Could not locate a FreeRADIUS configuration directory. Set FR_BASE explicitly."

  FR_BASE="$base"
  FR_DEFAULT_SITE="$FR_BASE/sites-enabled/default"
  FR_CLIENTS="$FR_BASE/clients.conf"
  FR_AUTHORIZE_FILE="$FR_BASE/mods-config/files/authorize"
  FR_MODS_AVAILABLE="$FR_BASE/mods-available"
  FR_MODS_ENABLED="$FR_BASE/mods-enabled"
  if [ -z "$BACKUP_DIR" ]; then
    BACKUP_DIR="$FR_BASE/payspot-backups"
  fi
}

require_freeradius_files() {
  resolve_freeradius_paths
  [ -f "$FR_DEFAULT_SITE" ] || fail "FreeRADIUS default site not found at $FR_DEFAULT_SITE"
  [ -f "$FR_CLIENTS" ] || fail "FreeRADIUS clients.conf not found at $FR_CLIENTS"
  [ -f "$FR_AUTHORIZE_FILE" ] || fail "FreeRADIUS authorize file not found at $FR_AUTHORIZE_FILE"
}

ensure_backup_dir() {
  mkdir -p "$BACKUP_DIR"
  chmod 700 "$BACKUP_DIR"
}

backup_file() {
  local path="$1"
  local base
  base="$(basename "$path")"
  ensure_backup_dir
  cp "$path" "$BACKUP_DIR/${base}.$(date +%Y%m%d%H%M%S).bak"
}

ensure_config_dir() {
  local radius_group
  radius_group="$(resolve_radius_group)"
  mkdir -p "$PAYSPOT_CONFIG_DIR"
  chown root:"$radius_group" "$PAYSPOT_CONFIG_DIR"
  chmod 750 "$PAYSPOT_CONFIG_DIR"
}

# ---------------------------------------------------------------------------
# Tenant config JSON helpers (pure Python so no jq dependency)
# ---------------------------------------------------------------------------

tenants_file_exists() {
  [ -f "$PAYSPOT_TENANTS_FILE" ]
}

read_tenants_json() {
  if ! tenants_file_exists; then
    printf '{}'
    return
  fi
  cat "$PAYSPOT_TENANTS_FILE"
}

# Upsert a tenant entry in tenants.json.
# Args: slug base_url adapter_secret radius_secret client_prefix nas_ips_comma
upsert_tenant() {
  local slug="$1"
  local base_url="$2"
  local adapter_secret="$3"
  local radius_secret="$4"
  local client_prefix="$5"
  local nas_ips_comma="$6"

  ensure_config_dir
  python3 - \
    "$PAYSPOT_TENANTS_FILE" \
    "$slug" "$base_url" "$adapter_secret" "$radius_secret" "$client_prefix" "$nas_ips_comma" <<'PY'
import json, sys
from pathlib import Path

path   = Path(sys.argv[1])
slug   = sys.argv[2]
config = json.loads(path.read_text()) if path.exists() else {}
tenants = config.setdefault("tenants", {})
existing_ips = tenants.get(slug, {}).get("nas_ips", [])
new_ips = [ip.strip() for ip in sys.argv[7].split(",") if ip.strip()]
merged_ips = list(dict.fromkeys(existing_ips + new_ips))  # deduplicate, preserve order
tenants[slug] = {
    "base_url":        sys.argv[3],
    "adapter_secret":  sys.argv[4],
    "radius_secret":   sys.argv[5],
    "client_prefix":   sys.argv[6],
    "nas_ips":         merged_ips,
}
path.write_text(json.dumps(config, indent=2) + "\n")
PY
  local radius_group
  radius_group="$(resolve_radius_group)"
  chown root:"$radius_group" "$PAYSPOT_TENANTS_FILE"
  chmod 640 "$PAYSPOT_TENANTS_FILE"
}

remove_tenant() {
  local slug="$1"
  tenants_file_exists || fail "No tenants config found at $PAYSPOT_TENANTS_FILE"
  python3 - "$PAYSPOT_TENANTS_FILE" "$slug" <<'PY'
import json, sys
from pathlib import Path

path = Path(sys.argv[1])
slug = sys.argv[2]
config = json.loads(path.read_text())
tenants = config.get("tenants", {})
if slug not in tenants:
    print(f"Tenant '{slug}' not found.", file=sys.stderr)
    sys.exit(1)
del tenants[slug]
path.write_text(json.dumps(config, indent=2) + "\n")
PY
}

list_tenants_json() {
  tenants_file_exists || return
  python3 - "$PAYSPOT_TENANTS_FILE" <<'PY'
import json, sys
from pathlib import Path

config  = json.loads(Path(sys.argv[1]).read_text())
tenants = config.get("tenants", {})
if not tenants:
    print("  (no tenants configured)")
    sys.exit(0)
for slug, t in tenants.items():
    ips = ", ".join(t.get("nas_ips", []))
    prefix = t.get("client_prefix", "omada")
    print(f"  {slug}")
    print(f"    base_url      : {t.get('base_url','')}")
    print(f"    client_prefix : {prefix}")
    print(f"    nas_ips       : {ips or '(none)'}")
PY
}

tenant_exists() {
  local slug="$1"
  tenants_file_exists || return 1
  python3 - "$PAYSPOT_TENANTS_FILE" "$slug" <<'PY'
import json, sys
from pathlib import Path
config = json.loads(Path(sys.argv[1]).read_text())
sys.exit(0 if sys.argv[2] in config.get("tenants", {}) else 1)
PY
}

get_tenant_field() {
  local slug="$1"
  local field="$2"
  python3 - "$PAYSPOT_TENANTS_FILE" "$slug" "$field" <<'PY'
import json, sys
from pathlib import Path
config = json.loads(Path(sys.argv[1]).read_text())
tenant = config.get("tenants", {}).get(sys.argv[2], {})
print(tenant.get(sys.argv[3], ""))
PY
}

# ---------------------------------------------------------------------------
# Adapter script (multi-tenant — reads tenants.json at runtime)
# ---------------------------------------------------------------------------

render_adapter_script() {
  local tenants_file="$1"
  cat <<EOF
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

TENANTS_FILE = ${tenants_file@Q}
TIMEOUT = 10
DISCONNECT_PORT = 3799
CLIENTS_CONF_CANDIDATES = (
    "/etc/freeradius/3.0/clients.conf",
    "/etc/freeradius/clients.conf",
    "/etc/raddb/clients.conf",
)


def log(message: str) -> None:
    print(f"payspot-radius-adapter: {message}", file=sys.stderr)


def radius_escape(value: object) -> str:
    text = str(value)
    return text.replace("\\\\", "\\\\\\\\").replace('"', '\\"')


def emit_reply(attr: str, value: object, *, is_string: bool = False) -> None:
    if value is None:
        return
    if is_string:
        print(f'{attr} := "{radius_escape(value)}"')
    else:
        print(f"{attr} := {value}")


def load_tenants():
    path = Path(TENANTS_FILE)
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text()).get("tenants", {})
    except Exception as exc:
        log(f"failed to load tenants config: {exc}")
        return {}


def resolve_tenant(nas_ip: str):
    """Return (slug, base_url, adapter_secret) for the given NAS IP.

    Lookup order:
      1. Exact NAS IP match across all tenants.
      2. If only one tenant is configured, use it as a fallback.
    """
    tenants = load_tenants()
    if not tenants:
        log("no tenants configured in " + TENANTS_FILE)
        return None, None, None

    for slug, t in tenants.items():
        if nas_ip and nas_ip in t.get("nas_ips", []):
            return slug, t["base_url"], t["adapter_secret"]

    if len(tenants) == 1:
        slug, t = next(iter(tenants.items()))
        if nas_ip:
            log(f"NAS IP {nas_ip} not matched; falling back to sole tenant '{slug}'")
        return slug, t["base_url"], t["adapter_secret"]

    log(f"NAS IP {nas_ip!r} did not match any tenant and multiple tenants are configured")
    return None, None, None


def api_post(base_url: str, tenant_slug: str, adapter_secret: str, path: str, payload: dict):
    body = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        f"{base_url}/api/t/{tenant_slug}{path}",
        data=body,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
            "x-radius-adapter-secret": adapter_secret,
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
            text = response.read().decode("utf-8")
            return response.getcode(), json.loads(text) if text else {}
    except urllib.error.HTTPError as exc:
        text = exc.read().decode("utf-8", errors="replace")
        try:
            return exc.code, json.loads(text) if text else {}
        except json.JSONDecodeError:
            return exc.code, text
    except Exception as exc:
        return 0, str(exc)


def parse_positive_int(raw: str):
    if not raw:
        return None
    try:
        value = int(float(raw))
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
        if text.endswith("Z"):
            text = text[:-1] + "+00:00"
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
    if not text.startswith("payspot;"):
        return {}
    fields = {}
    for part in text.split(";")[1:]:
        if "=" not in part:
            continue
        key, value = part.split("=", 1)
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
        for match in re.finditer(r"client\\s+[^\\{]+\\{(.*?)\\}", text, re.S):
            block = match.group(1)
            ip_match = re.search(r"^\\s*ipaddr\\s*=\\s*(\\S+)\\s*$", block, re.M)
            secret_match = re.search(r"^\\s*secret\\s*=\\s*(.*?)\\s*$", block, re.M)
            if not ip_match or not secret_match:
                continue
            clients.append({
                "ipaddr": ip_match.group(1).strip(),
                "secret": secret_match.group(1).strip(),
            })
    return clients


def find_radius_secret(nas_ip: str):
    clients = read_radius_clients()
    if not clients:
        return None

    for client in clients:
        if client["ipaddr"] == nas_ip:
            return client["secret"]

    unique_secrets = {client["secret"] for client in clients if client["secret"]}
    if len(unique_secrets) == 1:
        secret = unique_secrets.pop()
        log(f"using shared fallback secret for disconnect target {nas_ip}")
        return secret

    return None


def send_disconnect(*, nas_ip: str, session_id: str, username: str, calling_station_id: str):
    if not nas_ip or not session_id:
        return

    secret = find_radius_secret(nas_ip)
    if not secret:
        log(f"disconnect skipped: no shared secret found for {nas_ip}")
        return

    attrs = [
        f'Acct-Session-Id = "{radius_escape(session_id)}"',
        f"NAS-IP-Address = {nas_ip}",
        f"Event-Timestamp = {int(time.time())}",
    ]
    if username:
        attrs.append(f'User-Name = "{radius_escape(username)}"')
    if calling_station_id:
        attrs.append(f'Calling-Station-Id = "{radius_escape(calling_station_id)}"')

    request_body = "\\n".join(attrs) + "\\n"

    try:
        completed = subprocess.run(
            [
                "/usr/bin/radclient",
                "-t",
                "3",
                "-r",
                "1",
                "-x",
                f"{nas_ip}:{DISCONNECT_PORT}",
                "disconnect",
                secret,
            ],
            input=request_body,
            text=True,
            capture_output=True,
            timeout=TIMEOUT,
            check=False,
        )
    except Exception as exc:
        log(f"disconnect failed for session={session_id}: {exc}")
        return

    if completed.returncode != 0:
        details = completed.stderr.strip() or completed.stdout.strip() or "unknown radclient failure"
        log(f"disconnect rejected for session={session_id}: {details}")
        return

    log(f"disconnect request sent for session={session_id} to {nas_ip}")


def map_accounting_event(raw: str) -> str:
    value = (raw or "").strip().lower()
    mapping = {
        "start": "start",
        "stop": "stop",
        "alive": "interim",
        "interim-update": "interim",
        "interim": "interim",
        "accounting-on": "accounting-on",
        "accounting-off": "accounting-off",
    }
    return mapping.get(value, value or "interim")


def handle_auth(argv):
    # argv: auth <username> <password> <nas_ip> <calling_station_id>
    if len(argv) < 4:
        emit_reply("Reply-Message", "Missing username or password", is_string=True)
        return 1

    nas_ip = argv[4] if len(argv) > 4 else ""
    calling_station_id = argv[5] if len(argv) > 5 else ""
    slug, base_url, adapter_secret = resolve_tenant(nas_ip)
    if not slug:
        emit_reply("Reply-Message", "No tenant configured for this NAS", is_string=True)
        return 1

    payload = {"username": argv[2], "password": argv[3]}
    if calling_station_id:
        payload["callingStationId"] = calling_station_id
    status, body = api_post(
        base_url, slug, adapter_secret,
        "/radius/authorize",
        payload,
    )
    if status != 200 or not isinstance(body, dict):
        log(f"authorize backend failure status={status} body={body}")
        emit_reply("Reply-Message", "Authentication backend unavailable", is_string=True)
        return 1
    if not body.get("accept"):
        emit_reply("Reply-Message", body.get("reason") or "access_denied", is_string=True)
        return 1

    reply = body.get("reply") or {}
    session_timeout = parse_positive_int(str(reply.get("sessionTimeout") or ""))
    if session_timeout and session_timeout > 0:
        emit_reply("Session-Timeout", session_timeout)

    bandwidth_profile = str(reply.get("bandwidthProfile") or "").strip()
    if bandwidth_profile:
        emit_reply("Filter-Id", bandwidth_profile, is_string=True)

    subscriber_id = str(body.get("subscriberId") or "").strip()
    entitlement_id = str(body.get("entitlementId") or "").strip()
    if subscriber_id and entitlement_id:
        class_value = f"payspot;subscriber={subscriber_id};entitlement={entitlement_id}"
        data_limit = parse_positive_int(str(reply.get("dataLimitMb") or ""))
        if data_limit and data_limit > 0:
            class_value += f";dataLimitMb={data_limit}"
        plan_ends_at = str(reply.get("planEndsAt") or "").strip()
        if plan_ends_at:
            class_value += f";planEndsAt={plan_ends_at}"
        emit_reply("Class", class_value, is_string=True)

    emit_reply("Reply-Message", "PaySpot access granted", is_string=True)
    return 0


def handle_accounting(argv):
    # argv: accounting <event> <session_id> <in_oct> <out_oct> <in_giga> <out_giga>
    #                  <username> <class> <calling_station> <called_station> <nas_ip>
    if len(argv) < 13:
        log("accounting called without expected arguments")
        return 0

    nas_ip_address = argv[12]
    slug, base_url, adapter_secret = resolve_tenant(nas_ip_address)
    if not slug:
        log(f"no tenant found for NAS IP {nas_ip_address!r}; dropping accounting packet")
        return 0

    payload = {
        "event": map_accounting_event(argv[2]),
        "sessionId": argv[3] or "unknown-session",
    }
    acct_input = parse_positive_int(argv[4])
    acct_output = parse_positive_int(argv[5])
    acct_input_gigawords = parse_positive_int(argv[6])
    acct_output_gigawords = parse_positive_int(argv[7])
    username = argv[8]
    class_fields = parse_class(argv[9])
    subscriber_id = class_fields.get("subscriber")
    entitlement_id = class_fields.get("entitlement")
    data_limit_mb = parse_positive_int(class_fields.get("dataLimitMb", ""))
    plan_ends_at = parse_iso8601(class_fields.get("planEndsAt", ""))
    calling_station_id = argv[10]
    called_station_id = argv[11]

    if acct_input is not None:
        payload["acctInputOctets"] = acct_input
    if acct_output is not None:
        payload["acctOutputOctets"] = acct_output
    if acct_input_gigawords is not None:
        payload["acctInputGigawords"] = acct_input_gigawords
    if acct_output_gigawords is not None:
        payload["acctOutputGigawords"] = acct_output_gigawords
    if calling_station_id:
        payload["callingStationId"] = calling_station_id
    if called_station_id:
        payload["calledStationId"] = called_station_id
    if nas_ip_address:
        payload["nasIpAddress"] = nas_ip_address
    if username:
        payload["username"] = username
    if subscriber_id:
        payload["subscriberId"] = subscriber_id
    if entitlement_id:
        payload["entitlementId"] = entitlement_id

    if payload["event"] in {"start", "interim"} and not class_fields:
        log(
            "accounting packet missing Class attribute; "
            "attribution relies on username/session fallback"
        )

    should_disconnect = False
    total_bytes = combine_octets(acct_input, acct_input_gigawords) + combine_octets(acct_output, acct_output_gigawords)
    if data_limit_mb and total_bytes >= data_limit_mb * 1024 * 1024:
        should_disconnect = True
    if plan_ends_at and datetime.datetime.now(datetime.timezone.utc) >= plan_ends_at:
        should_disconnect = True

    status, body = api_post(base_url, slug, adapter_secret, "/radius/accounting", payload)
    if not (200 <= status < 300):
        log(f"accounting backend status={status} body={body}")
        return 0

    if should_disconnect and payload["event"] not in {"stop", "accounting-on", "accounting-off"}:
        send_disconnect(
            nas_ip=nas_ip_address,
            session_id=payload["sessionId"],
            username=username,
            calling_station_id=calling_station_id,
        )
    return 0


def main():
    if len(sys.argv) < 2:
        log("missing mode")
        return 1
    mode = sys.argv[1].strip().lower()
    if mode == "auth":
        return handle_auth(sys.argv)
    if mode == "accounting":
        return handle_accounting(sys.argv)
    log(f"unsupported mode={mode}")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
EOF
}

write_mod_files() {
  # NAS-IP-Address + Calling-Station-Id are passed to auth so the adapter can
  # resolve tenant and apply per-device max-device checks before accounting.
  cat > "$FR_MODS_AVAILABLE/payspot_auth" <<'EOF'
exec payspot_auth {
    wait = yes
    input_pairs = request
    output_pairs = reply
    shell_escape = yes
    program = "/usr/local/bin/payspot-radius-adapter auth \"%{User-Name}\" \"%{User-Password}\" \"%{NAS-IP-Address}\" \"%{Calling-Station-Id}\""
}
EOF

  cat > "$FR_MODS_AVAILABLE/payspot_accounting" <<'EOF'
exec payspot_accounting {
    wait = yes
    input_pairs = request
    output_pairs = reply
    shell_escape = yes
    program = "/usr/local/bin/payspot-radius-adapter accounting \"%{Acct-Status-Type}\" \"%{Acct-Session-Id}\" \"%{Acct-Input-Octets}\" \"%{Acct-Output-Octets}\" \"%{Acct-Input-Gigawords}\" \"%{Acct-Output-Gigawords}\" \"%{User-Name}\" \"%{Class}\" \"%{Calling-Station-Id}\" \"%{Called-Station-Id}\" \"%{NAS-IP-Address}\""
}
EOF

  chmod 640 "$FR_MODS_AVAILABLE/payspot_auth" "$FR_MODS_AVAILABLE/payspot_accounting"
  ln -sfn ../mods-available/payspot_auth "$FR_MODS_ENABLED/payspot_auth"
  ln -sfn ../mods-available/payspot_accounting "$FR_MODS_ENABLED/payspot_accounting"
}

patch_default_site() {
  python3 - "$FR_DEFAULT_SITE" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
text = path.read_text()

authorize_snippet = (
    '\tif (&User-Password && !&EAP-Message) {\n'
    '\t\tupdate control {\n'
    '\t\t\t&Auth-Type := payspot_portal\n'
    '\t\t}\n'
    '\t}\n\n'
)
if '&Auth-Type := payspot_portal' not in text:
    marker = (
        '\t#  This module should be listed last, so that the other modules\n'
        '\t#  get a chance to set Auth-Type for themselves.\n'
        '\t#\n'
        '\tpap\n'
    )
    if marker not in text:
        raise SystemExit('Could not locate the PAP marker in the default site.')
    text = text.replace(marker, authorize_snippet + marker, 1)

auth_block = (
    '\tAuth-Type payspot_portal {\n'
    '\t\tpayspot_auth\n'
    '\t}\n\n'
)
if 'Auth-Type payspot_portal' not in text:
    marker = '\tAuth-Type CHAP {'
    idx = text.find(marker)
    if idx == -1:
        raise SystemExit('Could not locate the CHAP auth block in the default site.')
    text = text[:idx] + auth_block + text[idx:]

if '\tpayspot_accounting\n' not in text:
    accounting_idx = text.find('accounting {')
    if accounting_idx == -1:
        raise SystemExit('Could not locate the accounting block in the default site.')
    detail_idx = text.find('\tdetail\n', accounting_idx)
    if detail_idx == -1:
        raise SystemExit('Could not locate the detail line in the accounting block.')
    insert_at = detail_idx + len('\tdetail\n')
    text = text[:insert_at] + '\tpayspot_accounting\n' + text[insert_at:]

path.write_text(text)
PY
}

patch_authorize_file() {
  python3 - "$FR_AUTHORIZE_FILE" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
text = path.read_text()
needle = '\n\ntestuser Cleartext-Password := "testpass123"\n'
if needle in text:
    text = text.replace(needle, '\n')
path.write_text(text)
PY
}

# Rebuild the entire PAYSPOT MANAGED CLIENTS block from tenants.json.
# Each tenant gets its own labelled sub-block with its own radius_secret.
sync_clients_from_config() {
  tenants_file_exists || return
  python3 - "$FR_CLIENTS" "$PAYSPOT_TENANTS_FILE" <<'PY'
from pathlib import Path
import json, re, sys

clients_path  = Path(sys.argv[1])
tenants_path  = Path(sys.argv[2])
text          = clients_path.read_text()
config        = json.loads(tenants_path.read_text())
tenants       = config.get("tenants", {})

# Remove legacy placeholder
text = re.sub(
    r'\nclient omada-controller \{\n\tipaddr = 0\.0\.0\.0/0\n\tsecret = ChangeMe-Strong-Secret-123!\n\tshortname = omada-temp\n\}\n?',
    '\n',
    text,
    flags=re.M,
)

begin = '# BEGIN PAYSPOT MANAGED CLIENTS'
end   = '# END PAYSPOT MANAGED CLIENTS'
block_lines = [begin]

for slug, t in tenants.items():
    ips    = t.get("nas_ips", [])
    secret = t.get("radius_secret", "")
    prefix = t.get("client_prefix", "omada")
    if not ips:
        continue
    block_lines.append(f'# tenant: {slug}')
    for idx, ip in enumerate(ips, start=1):
        block_lines.extend([
            f'client {prefix}-{slug}-{idx} {{',
            f'  ipaddr = {ip}',
            f'  secret = {secret}',
            f'  shortname = {prefix}{slug}{idx}',
            '  nastype = other',
            '  require_message_authenticator = yes',
            '}',
            '',
        ])

block_lines.append(end)
block = '\n'.join(block_lines).rstrip() + '\n'

pattern = re.compile(
    r'\n# BEGIN PAYSPOT MANAGED CLIENTS\n.*?\n# END PAYSPOT MANAGED CLIENTS\n?',
    re.S,
)
if pattern.search(text):
    text = pattern.sub('\n' + block, text)
else:
    if not text.endswith('\n'):
        text += '\n'
    text += '\n' + block

clients_path.write_text(text)
PY
}

# ---------------------------------------------------------------------------
# Modes
# ---------------------------------------------------------------------------

configure_mode() {
  ensure_root
  need_cmd python3
  need_cmd freeradius
  require_freeradius_files

  bold "PaySpot FreeRADIUS Setup"

  local base_url tenant_slug adapter_secret client_ips client_prefix radius_secret

  base_url="$(prompt_default "PaySpot base URL" "https://payspot.abdxl.cloud")"
  tenant_slug="$(prompt_required "Tenant slug")"
  adapter_secret="$(prompt_required "PaySpot tenant adapter secret (from PaySpot tenant settings)")"
  client_ips="$(prompt_required "RADIUS client IPs for this tenant (comma-separated AP/controller IPs)")"
  client_prefix="$(prompt_default "Client shortname prefix" "omada")"
  radius_secret="$(prompt_optional "RADIUS shared secret (leave blank to auto-generate)")"
  if [ -z "$radius_secret" ]; then
    radius_secret="$(generate_secret)"
  fi

  backup_file "$FR_DEFAULT_SITE"
  backup_file "$FR_CLIENTS"
  backup_file "$FR_AUTHORIZE_FILE"

  upsert_tenant "$tenant_slug" "$base_url" "$adapter_secret" "$radius_secret" "$client_prefix" "$client_ips"
  render_adapter_script "$PAYSPOT_TENANTS_FILE" > "$FR_ADAPTER_BIN"
  chmod 750 "$FR_ADAPTER_BIN"
  write_mod_files
  patch_default_site
  patch_authorize_file
  sync_clients_from_config

  if ! freeradius -CX >/dev/null 2>&1; then
    fail "FreeRADIUS config test failed. Backups are in $BACKUP_DIR"
  fi

  if prompt_yes_no "Restart FreeRADIUS now" "y"; then
    systemctl restart freeradius
  fi

  printf '\n'
  bold "Setup Complete"
  printf 'Tenant "%s" configured.\n' "$tenant_slug"
  printf 'RADIUS shared secret for Omada profile: %s\n' "$radius_secret"
  printf 'Tenants config: %s\n' "$PAYSPOT_TENANTS_FILE"
  printf 'Adapter: %s\n' "$FR_ADAPTER_BIN"
  printf 'Backups: %s\n' "$BACKUP_DIR"
  printf '\nTo add another tenant later: %s add-tenant\n' "$0"
}

add_tenant_mode() {
  ensure_root
  need_cmd python3
  need_cmd freeradius
  require_freeradius_files

  [ -x "$FR_ADAPTER_BIN" ] || fail "PaySpot adapter not found at $FR_ADAPTER_BIN. Run 'configure' first."
  tenants_file_exists || fail "Tenants config not found at $PAYSPOT_TENANTS_FILE. Run 'configure' first."

  bold "PaySpot — Add Tenant"
  printf 'Existing tenants:\n'
  list_tenants_json

  local base_url tenant_slug adapter_secret client_ips client_prefix radius_secret
  printf '\n'
  base_url="$(prompt_default "PaySpot base URL" "https://payspot.abdxl.cloud")"
  tenant_slug="$(prompt_required "New tenant slug")"

  if tenant_exists "$tenant_slug"; then
    warn "Tenant '$tenant_slug' already exists — its settings will be updated."
  fi

  adapter_secret="$(prompt_optional "PaySpot tenant adapter secret (leave blank to keep current)")"
  if [ -z "$adapter_secret" ]; then
    adapter_secret="$(get_tenant_field "$tenant_slug" "adapter_secret")"
    [ -n "$adapter_secret" ] || fail "Existing adapter_secret is missing for tenant '$tenant_slug'. Enter a new one."
  fi
  client_ips="$(prompt_required "RADIUS client IPs for this tenant (comma-separated)")"
  client_prefix="$(prompt_default "Client shortname prefix" "omada")"
  radius_secret="$(prompt_optional "RADIUS shared secret (leave blank to auto-generate)")"
  if [ -z "$radius_secret" ]; then
    radius_secret="$(generate_secret)"
  fi

  backup_file "$FR_CLIENTS"

  upsert_tenant "$tenant_slug" "$base_url" "$adapter_secret" "$radius_secret" "$client_prefix" "$client_ips"
  # Rewrite the adapter so it picks up the latest tenants.json path (no-op if path unchanged).
  render_adapter_script "$PAYSPOT_TENANTS_FILE" > "$FR_ADAPTER_BIN"
  chmod 750 "$FR_ADAPTER_BIN"
  sync_clients_from_config

  if ! freeradius -CX >/dev/null 2>&1; then
    fail "FreeRADIUS config test failed. Backups are in $BACKUP_DIR"
  fi

  if prompt_yes_no "Restart FreeRADIUS now" "y"; then
    systemctl restart freeradius
  fi

  printf '\n'
  bold "Tenant Added"
  printf 'Tenant "%s" is now active.\n' "$tenant_slug"
  printf 'RADIUS shared secret for Omada profile: %s\n' "$radius_secret"
  printf '\nAll configured tenants:\n'
  list_tenants_json
}

update_tenant_mode() {
  ensure_root
  need_cmd python3
  need_cmd freeradius
  require_freeradius_files

  [ -x "$FR_ADAPTER_BIN" ] || fail "PaySpot adapter not found at $FR_ADAPTER_BIN. Run 'configure' first."
  tenants_file_exists || fail "Tenants config not found at $PAYSPOT_TENANTS_FILE. Run 'configure' first."

  bold "PaySpot - Update Tenant"
  printf 'Existing tenants:\n'
  list_tenants_json

  local base_url tenant_slug adapter_secret client_ips client_prefix radius_secret
  printf '\n'
  base_url="$(prompt_default "PaySpot base URL" "https://payspot.abdxl.cloud")"
  tenant_slug="$(prompt_required "Tenant slug to update")"
  tenant_exists "$tenant_slug" || fail "Tenant '$tenant_slug' not found."

  adapter_secret="$(prompt_required "PaySpot tenant adapter secret")"
  client_ips="$(prompt_required "RADIUS client IPs for this tenant (comma-separated)")"
  client_prefix="$(prompt_default "Client shortname prefix" "omada")"
  radius_secret="$(prompt_optional "RADIUS shared secret (leave blank to keep current)")"
  if [ -z "$radius_secret" ]; then
    radius_secret="$(get_tenant_field "$tenant_slug" "radius_secret")"
    [ -n "$radius_secret" ] || fail "Existing radius_secret is missing for tenant '$tenant_slug'. Enter a new one."
  fi

  backup_file "$FR_CLIENTS"

  upsert_tenant "$tenant_slug" "$base_url" "$adapter_secret" "$radius_secret" "$client_prefix" "$client_ips"
  render_adapter_script "$PAYSPOT_TENANTS_FILE" > "$FR_ADAPTER_BIN"
  chmod 750 "$FR_ADAPTER_BIN"
  sync_clients_from_config

  if ! freeradius -CX >/dev/null 2>&1; then
    fail "FreeRADIUS config test failed. Backups are in $BACKUP_DIR"
  fi

  if prompt_yes_no "Restart FreeRADIUS now" "y"; then
    systemctl restart freeradius
  fi

  printf '\n'
  bold "Tenant Updated"
  printf 'Tenant "%s" settings were updated.\n' "$tenant_slug"
  printf 'RADIUS shared secret for Omada profile: %s\n' "$radius_secret"
  printf '\nAll configured tenants:\n'
  list_tenants_json
}

remove_tenant_mode() {
  ensure_root
  need_cmd python3
  need_cmd freeradius
  require_freeradius_files

  tenants_file_exists || fail "Tenants config not found at $PAYSPOT_TENANTS_FILE."

  bold "PaySpot — Remove Tenant"
  printf 'Existing tenants:\n'
  list_tenants_json
  printf '\n'

  local tenant_slug
  tenant_slug="$(prompt_required "Tenant slug to remove")"
  tenant_exists "$tenant_slug" || fail "Tenant '$tenant_slug' not found."

  if ! prompt_yes_no "Remove tenant '$tenant_slug' and its AP client entries" "n"; then
    printf 'Aborted.\n'
    return
  fi

  backup_file "$FR_CLIENTS"

  remove_tenant "$tenant_slug"
  render_adapter_script "$PAYSPOT_TENANTS_FILE" > "$FR_ADAPTER_BIN"
  chmod 750 "$FR_ADAPTER_BIN"
  sync_clients_from_config

  if ! freeradius -CX >/dev/null 2>&1; then
    fail "FreeRADIUS config test failed. Backups are in $BACKUP_DIR"
  fi

  if prompt_yes_no "Restart FreeRADIUS now" "y"; then
    systemctl restart freeradius
  fi

  printf '\n'
  bold "Tenant Removed"
  printf 'Remaining tenants:\n'
  list_tenants_json
}

list_tenants_mode() {
  need_cmd python3
  bold "PaySpot — Configured Tenants"
  if ! tenants_file_exists; then
    printf 'No tenants config found at %s.\n' "$PAYSPOT_TENANTS_FILE"
    return
  fi
  list_tenants_json
}

upgrade_mode() {
  ensure_root
  need_cmd python3
  need_cmd freeradius
  require_freeradius_files

  bold "PaySpot FreeRADIUS In-Place Upgrade"
  tenants_file_exists || fail "Tenants config not found at $PAYSPOT_TENANTS_FILE. Run 'configure' first."

  if [ -f "$FR_ADAPTER_BIN" ]; then
    backup_file "$FR_ADAPTER_BIN"
  fi
  backup_file "$FR_DEFAULT_SITE"
  backup_file "$FR_CLIENTS"
  backup_file "$FR_AUTHORIZE_FILE"

  render_adapter_script "$PAYSPOT_TENANTS_FILE" > "$FR_ADAPTER_BIN"
  chmod 750 "$FR_ADAPTER_BIN"
  write_mod_files
  patch_default_site
  patch_authorize_file
  sync_clients_from_config

  if ! freeradius -CX >/dev/null 2>&1; then
    fail "FreeRADIUS config test failed. Backups are in $BACKUP_DIR"
  fi

  if prompt_yes_no "Restart FreeRADIUS now" "y"; then
    systemctl restart freeradius
  fi

  printf '\n'
  bold "Upgrade Complete"
  printf 'Adapter updated at %s\n' "$FR_ADAPTER_BIN"
  printf 'Tenant config unchanged at %s\n' "$PAYSPOT_TENANTS_FILE"
  printf 'Backups: %s\n' "$BACKUP_DIR"
}

check_file_contains() {
  local label="$1"
  local pattern="$2"
  local file_path="$3"
  if file_contains "$file_path" "$pattern"; then
    printf '[ok] %s\n' "$label"
  else
    printf '[fail] %s\n' "$label"
  fi
}

check_mode() {
  need_cmd python3
  need_cmd freeradius
  require_freeradius_files

  bold "PaySpot FreeRADIUS Check"

  [ -x "$FR_ADAPTER_BIN" ] \
    && printf '[ok] Adapter script exists: %s\n' "$FR_ADAPTER_BIN" \
    || printf '[fail] Adapter script missing: %s\n' "$FR_ADAPTER_BIN"

  if tenants_file_exists; then
    printf '[ok] Tenants config exists: %s\n' "$PAYSPOT_TENANTS_FILE"
    printf 'Configured tenants:\n'
    list_tenants_json
  else
    printf '[fail] Tenants config missing: %s\n' "$PAYSPOT_TENANTS_FILE"
  fi

  [ -f "$FR_MODS_AVAILABLE/payspot_auth" ] \
    && printf '[ok] payspot_auth module exists\n' \
    || printf '[fail] payspot_auth module missing\n'
  [ -f "$FR_MODS_AVAILABLE/payspot_accounting" ] \
    && printf '[ok] payspot_accounting module exists\n' \
    || printf '[fail] payspot_accounting module missing\n'

  check_file_contains "default site assigns Auth-Type payspot_portal" "Auth-Type := payspot_portal" "$FR_DEFAULT_SITE"
  check_file_contains "default site contains payspot_auth auth block" "Auth-Type payspot_portal" "$FR_DEFAULT_SITE"
  check_file_contains "default site contains payspot_accounting" "payspot_accounting" "$FR_DEFAULT_SITE"
  check_file_contains "auth module passes NAS-IP-Address" "NAS-IP-Address" "$FR_MODS_AVAILABLE/payspot_auth"
  if python3 - "$FR_CLIENTS" <<'PY'
import re, sys
text = open(sys.argv[1], encoding="utf-8").read()
managed = re.search(r'# BEGIN PAYSPOT MANAGED CLIENTS(.*?)# END PAYSPOT MANAGED CLIENTS', text, re.S)
if not managed:
    sys.exit(2)
blocks = re.findall(r'client\s+[^\{]+\{(.*?)\n\}', managed.group(1), re.S)
if not blocks:
    sys.exit(3)
missing = [b for b in blocks if 'require_message_authenticator = yes' not in b]
sys.exit(1 if missing else 0)
PY
  then
    printf '[ok] Managed clients enforce Message-Authenticator (BlastRADIUS hardening)\n'
  else
    printf '[warn] Managed clients do not all enforce Message-Authenticator\n'
  fi

  if grep -q "0.0.0.0/0" "$FR_CLIENTS"; then
    printf '[fail] Insecure wildcard RADIUS client still present\n'
  else
    printf '[ok] No insecure wildcard RADIUS client block found\n'
  fi

  if grep -q 'ChangeMe-Strong-Secret-123!' "$FR_CLIENTS"; then
    printf '[warn] Placeholder RADIUS shared secret is still present\n'
  else
    printf '[ok] No placeholder RADIUS shared secret found\n'
  fi

  if grep -q 'testuser Cleartext-Password := "testpass123"' "$FR_AUTHORIZE_FILE"; then
    printf '[fail] Stock testuser credential is still present\n'
  else
    printf '[ok] Stock testuser credential is not present\n'
  fi

  if freeradius -CX >/dev/null 2>&1; then
    printf '[ok] freeradius -CX passes\n'
  else
    printf '[fail] freeradius -CX failed\n'
  fi

  if command -v systemctl >/dev/null 2>&1; then
    if systemctl is-active --quiet freeradius; then
      printf '[ok] freeradius service is active\n'
    else
      printf '[warn] freeradius service is not active\n'
    fi
  fi

  if [ -x "$FR_ADAPTER_BIN" ]; then
    # Pick the first NAS IP from tenants.json so the adapter can resolve a tenant.
    # Without a valid NAS IP, multi-tenant setups always fail tenant lookup.
    local smoke_nas_ip=""
    if tenants_file_exists; then
      smoke_nas_ip="$(python3 - "$PAYSPOT_TENANTS_FILE" <<'PY'
import json, sys
from pathlib import Path
config = json.loads(Path(sys.argv[1]).read_text())
for t in config.get("tenants", {}).values():
    ips = t.get("nas_ips", [])
    if ips:
        print(ips[0])
        break
PY
)"
    fi

    local smoke_output
    smoke_output="$("$FR_ADAPTER_BIN" auth invalid@example.com wrong-password "$smoke_nas_ip" 2>&1 || true)"
    if printf '%s' "$smoke_output" | grep -q 'invalid_credentials'; then
      printf '[ok] Adapter reached PaySpot authorize endpoint\n'
    elif printf '%s' "$smoke_output" | grep -q 'No tenant configured for this NAS'; then
      printf '[warn] Adapter smoke skipped: no NAS IP configured in tenants.json yet\n'
    elif printf '%s' "$smoke_output" | grep -q 'Authentication backend unavailable'; then
      printf '[fail] Adapter could not reach PaySpot authorize endpoint\n'
    else
      printf '[warn] Adapter smoke output was inconclusive\n'
    fi
  fi

  printf '[note] maxDevices and usage tracking only stay accurate if Omada sends start/interim/stop accounting packets to this host\n'
  printf '[note] first accounting packets also rely on the NAS echoing the Class attribute returned in Access-Accept\n'
}

# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

main() {
  local mode="${1:-}"
  if [ -z "$mode" ]; then
    printf 'Choose mode:\n'
    printf '  1. configure      - Set up FreeRADIUS with the first PaySpot tenant\n'
    printf '  2. add-tenant     - Add a new tenant (and its APs) to an existing setup\n'
    printf '  3. update-tenant  - Update an existing tenant (IPs/secrets/base URL)\n'
    printf '  4. remove-tenant  - Remove a tenant from an existing setup\n'
    printf '  5. list-tenants   - Show all configured tenants\n'
    printf '  6. check          - Validate current FreeRADIUS + PaySpot configuration\n'
    printf '  7. upgrade        - Patch the adapter script in place (keep tenant config)\n'
    read -r -p 'Enter 1-7: ' mode
    case "$mode" in
      1) mode="configure" ;;
      2) mode="add-tenant" ;;
      3) mode="update-tenant" ;;
      4) mode="remove-tenant" ;;
      5) mode="list-tenants" ;;
      6) mode="check" ;;
      7) mode="upgrade" ;;
      *) fail "Invalid selection." ;;
    esac
  fi

  case "$mode" in
    configure)     configure_mode ;;
    add-tenant)    add_tenant_mode ;;
    update-tenant) update_tenant_mode ;;
    remove-tenant) remove_tenant_mode ;;
    list-tenants)  list_tenants_mode ;;
    check)         check_mode ;;
    upgrade)       upgrade_mode ;;
    *) fail "Usage: $0 [configure|add-tenant|update-tenant|remove-tenant|list-tenants|check|upgrade]" ;;
  esac
}

main "$@"
