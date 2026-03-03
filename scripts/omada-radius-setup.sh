#!/usr/bin/env bash
set -euo pipefail

FR_BASE="${FR_BASE:-}"
FR_DEFAULT_SITE=""
FR_CLIENTS=""
FR_AUTHORIZE_FILE=""
FR_MODS_AVAILABLE=""
FR_MODS_ENABLED=""
FR_ADAPTER_BIN="/usr/local/bin/payspot-radius-adapter"
BACKUP_DIR="${BACKUP_DIR:-}"

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

read_adapter_value() {
  local key="$1"
  python3 - "$FR_ADAPTER_BIN" "$key" <<'PY'
from pathlib import Path
import re
import sys

path = Path(sys.argv[1])
key = sys.argv[2]
if not path.exists():
    sys.exit(0)

pattern = re.compile(rf'^{re.escape(key)} = ["\'](.+?)["\']$', re.M)
text = path.read_text()
match = pattern.search(text)
if match:
    print(match.group(1))
PY
}

render_adapter_script() {
  local base_url="$1"
  local tenant_slug="$2"
  local adapter_secret="$3"
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

BASE_URL = ${base_url@Q}
TENANT_SLUG = ${tenant_slug@Q}
ADAPTER_SECRET = ${adapter_secret@Q}
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


def api_post(path: str, payload: dict):
    body = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        f"{BASE_URL}/api/t/{TENANT_SLUG}{path}",
        data=body,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
            "x-radius-adapter-secret": ADAPTER_SECRET,
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
    if len(argv) < 4:
        emit_reply("Reply-Message", "Missing username or password", is_string=True)
        return 1
    status, body = api_post(
        "/radius/authorize",
        {
            "username": argv[2],
            "password": argv[3],
        },
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
    if len(argv) < 13:
        log("accounting called without expected arguments")
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
    nas_ip_address = argv[12]

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
    if subscriber_id:
        payload["subscriberId"] = subscriber_id
    if entitlement_id:
        payload["entitlementId"] = entitlement_id

    should_disconnect = False
    total_bytes = combine_octets(acct_input, acct_input_gigawords) + combine_octets(acct_output, acct_output_gigawords)
    if data_limit_mb and total_bytes >= data_limit_mb * 1024 * 1024:
        should_disconnect = True
    if plan_ends_at and datetime.datetime.now(datetime.timezone.utc) >= plan_ends_at:
        should_disconnect = True

    status, body = api_post("/radius/accounting", payload)
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
  cat > "$FR_MODS_AVAILABLE/payspot_auth" <<'EOF'
exec payspot_auth {
    wait = yes
    input_pairs = request
    output_pairs = reply
    shell_escape = yes
    program = "/usr/local/bin/payspot-radius-adapter auth \"%{User-Name}\" \"%{User-Password}\""
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

set_managed_clients_block() {
  local shared_secret="$1"
  local ip_list="$2"
  local prefix="$3"
  python3 - "$FR_CLIENTS" "$shared_secret" "$ip_list" "$prefix" <<'PY'
from pathlib import Path
import re
import sys

path = Path(sys.argv[1])
shared_secret = sys.argv[2]
ip_list = [part.strip() for part in sys.argv[3].split(",") if part.strip()]
prefix = sys.argv[4]
if not ip_list:
    raise SystemExit("At least one RADIUS client IP is required.")

text = path.read_text()
text = re.sub(
    r'\nclient omada-controller \{\n\tipaddr = 0\.0\.0\.0/0\n\tsecret = ChangeMe-Strong-Secret-123!\n\tshortname = omada-temp\n\}\n?',
    '\n',
    text,
    flags=re.M,
)

begin = '# BEGIN PAYSPOT MANAGED CLIENTS'
end = '# END PAYSPOT MANAGED CLIENTS'
block_lines = [begin]
for idx, ip in enumerate(ip_list, start=1):
    block_lines.extend(
        [
            f'client {prefix}-{idx} {{',
            f'  ipaddr = {ip}',
            f'  secret = {shared_secret}',
            f'  shortname = {prefix}{idx}',
            '  nastype = other',
            '}',
            '',
        ]
    )
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

path.write_text(text)
PY
}

configure_mode() {
  ensure_root
  need_cmd python3
  need_cmd freeradius
  require_freeradius_files

  bold "PaySpot FreeRADIUS Setup"
  local base_url tenant_slug adapter_secret client_ips client_prefix shared_secret restart_service
  base_url="$(prompt_default "PaySpot base URL" "https://payspot.abdxl.cloud")"
  tenant_slug="$(prompt_default "Tenant slug" "walstreet")"
  adapter_secret="$(prompt_required "PaySpot tenant adapter secret (from PaySpot tenant settings)")"
  client_ips="$(prompt_required "RADIUS client IPs (comma-separated Omada controller/AP IPs)")"
  client_prefix="$(prompt_default "Client shortname prefix" "omada")"
  shared_secret="$(prompt_optional "RADIUS shared secret (leave blank to auto-generate)")"
  if [ -z "$shared_secret" ]; then
    shared_secret="$(generate_secret)"
  fi

  backup_file "$FR_DEFAULT_SITE"
  backup_file "$FR_CLIENTS"
  backup_file "$FR_AUTHORIZE_FILE"

  render_adapter_script "$base_url" "$tenant_slug" "$adapter_secret" > "$FR_ADAPTER_BIN"
  chmod 750 "$FR_ADAPTER_BIN"
  write_mod_files
  patch_default_site
  patch_authorize_file
  set_managed_clients_block "$shared_secret" "$client_ips" "$client_prefix"

  if ! freeradius -CX >/dev/null 2>&1; then
    fail "FreeRADIUS config test failed. Backups are in $BACKUP_DIR"
  fi

  restart_service="n"
  if prompt_yes_no "Restart FreeRADIUS now" "y"; then
    systemctl restart freeradius
    restart_service="y"
  fi

  printf '\n'
  bold "Setup Complete"
  printf 'Generated/active RADIUS shared secret: %s\n' "$shared_secret"
  printf 'Update the same shared secret in Omada for this RADIUS profile:\n'
  printf '  Authentication secret\n'
  printf '  Accounting secret\n'
  printf 'The client entries were written to %s\n' "$FR_CLIENTS"
  printf 'The PaySpot adapter was written to %s\n' "$FR_ADAPTER_BIN"
  printf 'Backups were saved in %s\n' "$BACKUP_DIR"
  if [ "$restart_service" = "y" ]; then
    printf 'FreeRADIUS was restarted successfully.\n'
  else
    printf 'Restart FreeRADIUS after reviewing the changes.\n'
  fi
  printf '\n'
  printf 'Omada checklist:\n'
  printf '  1. Point the auth server to this host on UDP 1812.\n'
  printf '  2. Point the accounting server to this host on UDP 1813.\n'
  printf '  3. Use the shared secret shown above for both auth and accounting.\n'
  printf '  4. Keep the external portal URL pointed at your PaySpot tenant page.\n'
}

upgrade_mode() {
  ensure_root
  need_cmd python3
  need_cmd freeradius
  require_freeradius_files

  bold "PaySpot FreeRADIUS In-Place Upgrade"

  local detected_base_url detected_tenant_slug detected_adapter_secret
  detected_base_url="$(read_adapter_value "BASE_URL")"
  detected_tenant_slug="$(read_adapter_value "TENANT_SLUG")"
  detected_adapter_secret="$(read_adapter_value "ADAPTER_SECRET")"

  local base_url tenant_slug adapter_secret
  base_url="$(prompt_default "PaySpot base URL" "${detected_base_url:-https://payspot.abdxl.cloud}")"
  tenant_slug="$(prompt_default "Tenant slug" "${detected_tenant_slug:-walstreet}")"
  if [ -n "$detected_adapter_secret" ]; then
    adapter_secret="$(prompt_default "PaySpot tenant adapter secret" "$detected_adapter_secret")"
  else
    adapter_secret="$(prompt_required "PaySpot tenant adapter secret (from PaySpot tenant settings)")"
  fi

  if [ -f "$FR_ADAPTER_BIN" ]; then
    backup_file "$FR_ADAPTER_BIN"
  fi
  backup_file "$FR_DEFAULT_SITE"
  backup_file "$FR_AUTHORIZE_FILE"

  render_adapter_script "$base_url" "$tenant_slug" "$adapter_secret" > "$FR_ADAPTER_BIN"
  chmod 750 "$FR_ADAPTER_BIN"
  write_mod_files
  patch_default_site
  patch_authorize_file

  if ! freeradius -CX >/dev/null 2>&1; then
    fail "FreeRADIUS config test failed. Backups are in $BACKUP_DIR"
  fi

  if prompt_yes_no "Restart FreeRADIUS now" "y"; then
    systemctl restart freeradius
  fi

  printf '\n'
  bold "Upgrade Complete"
  printf 'Adapter updated in place at %s\n' "$FR_ADAPTER_BIN"
  printf 'No RADIUS shared secret was changed.\n'
  printf 'Backups were saved in %s\n' "$BACKUP_DIR"
  printf 'If Omada user limits or usage were drifting, this update ensures the adapter forwards gigaword counters and the current PaySpot hooks.\n'
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
  [ -x "$FR_ADAPTER_BIN" ] && printf '[ok] Adapter script exists: %s\n' "$FR_ADAPTER_BIN" || printf '[fail] Adapter script missing: %s\n' "$FR_ADAPTER_BIN"
  [ -f "$FR_MODS_AVAILABLE/payspot_auth" ] && printf '[ok] payspot_auth module exists\n' || printf '[fail] payspot_auth module missing\n'
  [ -f "$FR_MODS_AVAILABLE/payspot_accounting" ] && printf '[ok] payspot_accounting module exists\n' || printf '[fail] payspot_accounting module missing\n'
  check_file_contains "default site assigns Auth-Type payspot_portal" "Auth-Type := payspot_portal" "$FR_DEFAULT_SITE"
  check_file_contains "default site contains payspot_auth auth block" "Auth-Type payspot_portal" "$FR_DEFAULT_SITE"
  check_file_contains "default site contains payspot_accounting" "payspot_accounting" "$FR_DEFAULT_SITE"

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
    local smoke_output
    smoke_output="$("$FR_ADAPTER_BIN" auth invalid@example.com wrong-password 2>&1 || true)"
    if printf '%s' "$smoke_output" | grep -q 'invalid_credentials'; then
      printf '[ok] Adapter reached PaySpot authorize endpoint\n'
    elif printf '%s' "$smoke_output" | grep -q 'Authentication backend unavailable'; then
      printf '[fail] Adapter could not reach PaySpot authorize endpoint\n'
    else
      printf '[warn] Adapter smoke output was inconclusive\n'
    fi
  fi

  printf '[note] maxDevices and usage tracking only stay accurate if Omada sends start/interim/stop accounting packets to this host\n'
  printf '[note] first accounting packets also rely on the NAS echoing the Class attribute returned in Access-Accept\n'
}

main() {
  local mode="${1:-}"
  if [ -z "$mode" ]; then
    printf 'Choose mode:\n'
    printf '  1. Configure a fresh or existing FreeRADIUS host for PaySpot\n'
    printf '  2. Check an existing FreeRADIUS host for PaySpot compatibility\n'
    printf '  3. Patch an existing PaySpot FreeRADIUS adapter in place\n'
    read -r -p 'Enter 1, 2, or 3: ' mode
    case "$mode" in
      1) mode="configure" ;;
      2) mode="check" ;;
      3) mode="upgrade" ;;
      *) fail "Invalid selection." ;;
    esac
  fi

  case "$mode" in
    configure) configure_mode ;;
    check) check_mode ;;
    upgrade) upgrade_mode ;;
    *) fail "Usage: $0 [configure|check|upgrade]" ;;
  esac
}

main "$@"
