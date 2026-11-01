#!/bin/bash
# E2E: Bulk Import UI flow — admin login → Portals → Bulk Import dialog → paste → preview → import
set -x
cd /home/z/my-project

# 1. server guard
if ! curl -s -o /dev/null --max-time 2 http://localhost:3000/; then
  setsid nohup bun run dev > dev.log 2>&1 < /dev/null & disown
  for i in $(seq 1 45); do curl -s -o /dev/null --max-time 2 http://localhost:3000/ && break; sleep 1; done
fi
curl -s -o /dev/null http://localhost:3000/ || { echo "SERVER DOWN"; exit 1; }
echo "=== SERVER UP ==="

B="agent-browser"
$B set viewport 1600 900
$B open "http://localhost:3000"
sleep 2

# 2. footer → Admin Panel
$B find text "Admin Panel" click || $B eval "document.querySelectorAll('button,a').forEach(e=>{if(e.textContent.trim()==='Admin Panel')e.click()})"
sleep 1
$B wait "#admin-user"
$B fill "#admin-user" "admin"
$B fill "#admin-pass" "StreamKaro@2024"
$B find text "Login karo" click
sleep 2
$B wait "text=Dashboard" 2>/dev/null || true
$B screenshot /tmp/e2e-1-dashboard.png

# 3. sidebar → Stalker Portals
$B find text "Stalker Portals" click
sleep 2
$B screenshot /tmp/e2e-2-portals.png
$B snapshot 2>/dev/null | head -60

echo "=== DONE PART 1 ==="
