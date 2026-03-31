#!/usr/bin/env python3
import argparse
import collections
import ipaddress
import os
import re
import shutil
import stat
import subprocess
import sys
import tempfile
import time
from pathlib import Path


LINE_RE = re.compile(r"IP6?\s+([0-9a-fA-F:\.]+)\.\d+\s+>\s+[0-9a-fA-F:\.]+\.(1812|1813):")
CLIENT_BLOCK_RE = re.compile(r"client\s+([^\s{]+)\s*\{(.*?)\}", re.S)
IP_RE = re.compile(r"^\s*ipaddr\s*=\s*(\S+)\s*$", re.M)
SECRET_RE = re.compile(r"^\s*secret\s*=\s*(.*?)\s*$", re.M)
SHORTNAME_RE = re.compile(r"^\s*shortname\s*=\s*(.*?)\s*$", re.M)


def log(message: str) -> None:
    print(f"[payspot-radius-auto-allow] {message}", flush=True)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Temporary watcher that auto-allows new RADIUS source IPs.",
    )
    parser.add_argument(
        "--clients-conf",
        default="/etc/freeradius/3.0/clients.conf",
        help="Path to clients.conf",
    )
    parser.add_argument(
        "--threshold",
        type=int,
        default=3,
        help="Packets required before a new source IP is allowed",
    )
    parser.add_argument(
        "--window-seconds",
        type=int,
        default=20,
        help="Time window for packet threshold",
    )
    parser.add_argument(
        "--interface",
        default="any",
        help="tcpdump interface",
    )
    parser.add_argument(
        "--client-name-prefix",
        default="payspot-auto",
        help="Prefix for generated client names",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Log actions without writing clients.conf",
    )
    return parser.parse_args()


def parse_clients(clients_conf: Path) -> list[dict[str, str]]:
    text = clients_conf.read_text(encoding="utf-8")
    clients: list[dict[str, str]] = []
    for match in CLIENT_BLOCK_RE.finditer(text):
        name = match.group(1).strip()
        body = match.group(2)
        ip_match = IP_RE.search(body)
        secret_match = SECRET_RE.search(body)
        shortname_match = SHORTNAME_RE.search(body)
        if not ip_match or not secret_match:
            continue
        clients.append(
            {
                "name": name,
                "ipaddr": ip_match.group(1).strip(),
                "secret": secret_match.group(1).strip(),
                "shortname": shortname_match.group(1).strip() if shortname_match else "",
            },
        )
    return clients


def choose_secret(clients: list[dict[str, str]]) -> str:
    secrets = {
        client["secret"]
        for client in clients
        if client["ipaddr"] not in {"127.0.0.1", "::1"} and client["secret"]
    }
    if len(secrets) != 1:
        raise RuntimeError(
            f"unable to choose a shared secret automatically; found {len(secrets)} unique secrets",
        )
    return next(iter(secrets))


def valid_ip(value: str) -> bool:
    try:
        ipaddress.ip_address(value)
        return True
    except ValueError:
        return False


def append_client_block(
    clients_conf: Path,
    *,
    ipaddr: str,
    secret: str,
    client_name_prefix: str,
    dry_run: bool,
) -> None:
    timestamp = int(time.time())
    block = (
        f"\nclient {client_name_prefix}-{timestamp} {{\n"
        f"  ipaddr = {ipaddr}\n"
        f"  secret = {secret}\n"
        f"  shortname = {client_name_prefix}-{timestamp}\n"
        f"  nastype = other\n"
        f"  require_message_authenticator = yes\n"
        f"}}\n"
    )
    if dry_run:
        log(f"[dry-run] would append client block for {ipaddr}")
        return

    original = clients_conf.read_text(encoding="utf-8")
    original_stat = clients_conf.stat()
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", delete=False) as handle:
        handle.write(original)
        handle.write(block)
        temp_path = Path(handle.name)

    shutil.copyfile(temp_path, clients_conf)
    os.chown(clients_conf, original_stat.st_uid, original_stat.st_gid)
    os.chmod(clients_conf, stat.S_IMODE(original_stat.st_mode))
    try:
        subprocess.run(["freeradius", "-XC"], check=True, capture_output=True, text=True)
        subprocess.run(["systemctl", "restart", "freeradius"], check=True, capture_output=True, text=True)
        log(f"added and activated new RADIUS client {ipaddr}")
    except subprocess.CalledProcessError as error:
        clients_conf.write_text(original, encoding="utf-8")
        stderr = (error.stderr or "").strip()
        stdout = (error.stdout or "").strip()
        detail = stderr or stdout or str(error)
        raise RuntimeError(f"failed to validate/restart FreeRADIUS after adding {ipaddr}: {detail}") from error
    finally:
        temp_path.unlink(missing_ok=True)


def source_ips_from_tcpdump(interface: str):
    command = [
        "tcpdump",
        "-l",
        "-n",
        "-i",
        interface,
        "udp port 1812 or udp port 1813",
    ]
    log(f"starting watcher on interface={interface}")
    with subprocess.Popen(
        command,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    ) as process:
        assert process.stdout is not None
        for line in process.stdout:
            match = LINE_RE.search(line)
            if not match:
                continue
            source_ip = match.group(1)
            if valid_ip(source_ip):
                yield source_ip


def main() -> int:
    args = parse_args()
    clients_conf = Path(args.clients_conf)
    if not clients_conf.exists():
        raise SystemExit(f"clients.conf not found: {clients_conf}")

    packet_times: dict[str, collections.deque[float]] = collections.defaultdict(collections.deque)
    clients = parse_clients(clients_conf)
    allowed_ips = {client["ipaddr"] for client in clients}
    secret = choose_secret(clients)
    log(f"loaded {len(allowed_ips)} existing client IPs")

    for source_ip in source_ips_from_tcpdump(args.interface):
        if source_ip in allowed_ips:
            continue

        now = time.time()
        queue = packet_times[source_ip]
        queue.append(now)
        while queue and now - queue[0] > args.window_seconds:
            queue.popleft()

        if len(queue) < args.threshold:
            continue

        log(f"detected stable new RADIUS source IP {source_ip}")
        append_client_block(
            clients_conf,
            ipaddr=source_ip,
            secret=secret,
            client_name_prefix=args.client_name_prefix,
            dry_run=args.dry_run,
        )
        allowed_ips.add(source_ip)
        packet_times.pop(source_ip, None)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
