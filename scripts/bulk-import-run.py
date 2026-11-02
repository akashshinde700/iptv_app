#!/usr/bin/env python3
"""Bulk import driver: preview + import both credential dumps, then sample-sync."""
import json
import os
import subprocess
import sys
import time
import urllib.request

BASE = "http://localhost:3000"
COOKIE = "/tmp/sk_cookies.txt"


def req(path, data=None, method="GET"):
    url = BASE + path
    body = json.dumps(data).encode() if data is not None else None
    r = urllib.request.Request(url, data=body, method=method)
    r.add_header("Content-Type", "application/json")
    # load cookies
    try:
        with open(COOKIE) as f:
            for line in f:
                parts = line.strip().split("\t")
                if len(parts) >= 8 and "sk_admin_session" in parts[6]:
                    r.add_header("Cookie", f"sk_admin_session={parts[7]}")
    except FileNotFoundError:
        pass
    with urllib.request.urlopen(r, timeout=120) as resp:
        set_cookie = resp.headers.get("Set-Cookie", "")
        raw = resp.read().decode()
    return set_cookie, raw


def login():
    # Credentials come from the environment — never hardcode the owner password in a script.
    username = os.environ.get("ADMIN_USERNAME", "admin")
    password = os.environ.get("ADMIN_PASSWORD")
    if not password:
        raise SystemExit("Set ADMIN_PASSWORD (and optionally ADMIN_USERNAME) before running this script")
    body = json.dumps({"username": username, "password": password}).encode()
    r = urllib.request.Request(BASE + "/api/admin/auth/login", data=body, method="POST")
    r.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(r, timeout=30) as resp:
        sc = resp.headers.get("Set-Cookie", "")
        token = sc.split("sk_admin_session=")[1].split(";")[0]
    with open(COOKIE, "w") as f:
        f.write(f"http\tlocalhost\tFALSE\t/\tFALSE\t0\tsk_admin_session\t{token}\n")
    print("login OK")


def post(path, data):
    try:
        _, raw = req(path, data, "POST")
        return json.loads(raw)
    except urllib.error.HTTPError as e:
        return json.loads(e.read().decode())


def main():
    login()

    for label, path in [("bulk-paste-1", "/home/z/my-project/upload/bulk-paste-1.txt"),
                        ("m3u.txt", "/home/z/my-project/upload/m3u.txt")]:
        text = open(path).read()
        p = post("/api/admin/portals/bulk", {"text": text, "mode": "preview"})
        if "stats" in p:
            print(f"[{label}] preview: {p['stats']} skipped={p['skippedLines']}")
        else:
            print(f"[{label}] preview FAILED: {p}")
            continue
        imp = post("/api/admin/portals/bulk", {"text": text, "mode": "import"})
        print(f"[{label}] import: {imp}")

    # current portal summary
    _, raw = req("/api/admin/portals")
    items = json.loads(raw)["items"]
    print(f"\ntotal portals now: {len(items)}")
    from collections import Counter
    print("by status:", dict(Counter(p["status"] for p in items)))
    print("by type:", dict(Counter(p["type"] for p in items)))


if __name__ == "__main__":
    main()
