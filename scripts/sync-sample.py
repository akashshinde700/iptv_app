#!/usr/bin/env python3
"""Sync a sample of newly imported portals and report results."""
import json
import urllib.request
import urllib.error

BASE = "http://localhost:3000"
COOKIE = "/tmp/sk_cookies.txt"


def req(path, data=None, method="GET", timeout=240):
    body = json.dumps(data).encode() if data is not None else None
    r = urllib.request.Request(BASE + path, data=body, method=method)
    r.add_header("Content-Type", "application/json")
    with open(COOKIE) as f:
        for line in f:
            parts = line.strip().split("\t")
            if len(parts) >= 8:
                r.add_header("Cookie", f"{parts[6]}={parts[7]}")
    with urllib.request.urlopen(r, timeout=timeout) as resp:
        return json.loads(resp.read().decode())


items = req("/api/admin/portals")["items"]
# sample: first portal per interesting host, prefer future expiry
seen_hosts = set()
sample = []
for host in ["look4k.net", "mag.x-iptv.live", "apksmart.dino.ws", "wtc05.mi20.cc", "sepetplay.xyz", "111.1234vb.com"]:
    for p in items:
        if p["url"] and host in p["url"] and p["status"] == "PENDING" and p["id"] not in seen_hosts:
            sample.append(p)
            seen_hosts.add(p["id"])
            break

print(f"syncing {len(sample)} sample portals sequentially…")
for p in sample:
    exp = (p.get("expiresAt") or "")[:10] or "—"
    print(f"\n→ {p['name']} [{p['type']}] mac={p['macAddress']} user={p['username']} exp={exp}")
    try:
        r = req(f"/api/admin/portals/{p['id']}/sync", {}, "POST")
        print(f"  ✓ {r['added']} added, {r['updated']} updated, {r['removed']} removed ({r['durationMs']/1000:.1f}s)")
    except urllib.error.HTTPError as e:
        try:
            err = json.loads(e.read().decode())
            print(f"  ✗ {e.code}: {err.get('error', err)[:160]}")
        except Exception:
            print(f"  ✗ HTTP {e.code}")
    except Exception as e:
        print(f"  ✗ {str(e)[:160]}")

# final status tally
items = req("/api/admin/portals")["items"]
from collections import Counter
print("\nfinal:", len(items), "portals |", dict(Counter(p["status"] for p in items)))
