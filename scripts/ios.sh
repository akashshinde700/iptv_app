#!/usr/bin/env bash
#
# StreamKaro iOS helper — builds the native iPhone/iPad app with xtool,
# from Linux or Windows (no Mac, no Xcode).
#
#   scripts/ios.sh doctor      check that everything needed is installed
#   scripts/ios.sh run         build + install + launch on a connected device
#   scripts/ios.sh build       build an unsigned .app into ios/.build/…/StreamKaro.app
#   scripts/ios.sh ipa         build a signed .ipa you can share / sideload
#   scripts/ios.sh setup       install the Darwin Swift SDK (first run only)
#   scripts/ios.sh devices     list connected devices
#   scripts/ios.sh auth        log in to Apple Developer Services
#   scripts/ios.sh version     bump the app version in Info.plist
#
# Docs: docs/IOS_APP.md
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IOS_DIR="$ROOT/ios"
INFO_PLIST="$IOS_DIR/Support/Info.plist"

c_ok=$'\033[32m'; c_warn=$'\033[33m'; c_err=$'\033[31m'; c_dim=$'\033[2m'; c_off=$'\033[0m'
say()  { printf '%s\n' "$*"; }
ok()   { printf '%s✔%s %s\n' "$c_ok" "$c_off" "$*"; }
warn() { printf '%s!%s %s\n' "$c_warn" "$c_off" "$*"; }
die()  { printf '%s✖%s %s\n' "$c_err" "$c_off" "$*" >&2; exit 1; }
dim()  { printf '%s%s%s\n' "$c_dim" "$*" "$c_off"; }

require_xtool() {
  command -v xtool >/dev/null 2>&1 || die "xtool not found. Install it: https://xtool.sh/documentation/xtool/installation-linux (or installation-macos)."
}

cmd_doctor() {
  say "StreamKaro iOS — environment check"
  say ""

  if command -v xtool >/dev/null 2>&1; then
    ok "xtool $(xtool --version 2>/dev/null | head -1 || echo '(installed)')"
  else
    warn "xtool is not installed → https://xtool.sh/documentation/xtool/installation-linux"
  fi

  if command -v swift >/dev/null 2>&1; then
    ok "swift $(swift --version 2>/dev/null | head -1)"
  else
    warn "no swift toolchain in PATH (xtool brings its own; only needed for plain SwiftPM builds)"
  fi

  if command -v ideviceinfo >/dev/null 2>&1; then
    if ip=$(ideviceinfo -k ProductType 2>/dev/null); then
      ok "device connected: $ip"
    else
      warn "libimobiledevice is installed, but no device is paired/connected (plug in the iPhone and tap Trust)"
    fi
  else
    warn "libimobiledevice-utils not installed — installing to a device needs it (xtool setup offers it)"
  fi

  case "$(uname -s)" in
    Darwin) ok "macOS host" ;;
    Linux)  ok "Linux host — xtool builds iOS apps here, no Mac needed" ;;
    *)      warn "untested host: $(uname -s) (WSL2 is fine, use the Linux instructions)" ;;
  esac

  if [ -f "$INFO_PLIST" ]; then
    url=$(python3 - "$INFO_PLIST" <<'PY' 2>/dev/null || true
import plistlib, sys
print(plistlib.load(open(sys.argv[1], 'rb')).get('StreamKaroBaseURL', ''))
PY
)
    if [ -n "$url" ]; then
      ok "app loads: $url"
      dim "  (override per device from the app's Settings screen)"
    else
      warn "StreamKaroBaseURL missing from ios/Support/Info.plist"
    fi
  else
    die "missing $INFO_PLIST"
  fi

  say ""
  dim "Next: scripts/ios.sh setup   →   scripts/ios.sh auth   →   scripts/ios.sh run"
}

cmd_setup() { require_xtool; cd "$IOS_DIR"; xtool setup; }

cmd_auth() { require_xtool; xtool auth; }

cmd_devices() { require_xtool; xtool devices; }

cmd_run() {
  require_xtool
  cd "$IOS_DIR"
  say "Building StreamKaro and installing it on the connected iPhone/iPad…"
  xtool dev
}

cmd_build() {
  require_xtool
  cd "$IOS_DIR"
  xtool dev build "$@"
  say ""
  dim "Output: ios/.build/*/StreamKaro.app"
}

cmd_ipa() {
  require_xtool
  cd "$IOS_DIR"
  # `--sign` uses the Apple ID from `xtool auth` to create a certificate + profile.
  xtool dev build --ipa --sign "$@"
  say ""
  dim "Share the .ipa, or install it with: xtool install <file>.ipa"
}

cmd_version() {
  local version="${1:-}"
  [ -n "$version" ] || die "usage: scripts/ios.sh version 0.5.1"
  python3 - "$INFO_PLIST" "$version" <<'PY'
import plistlib, sys
path, version = sys.argv[1], sys.argv[2]
with open(path, 'rb') as handle:
    data = plistlib.load(handle)
data['CFBundleShortVersionString'] = version
with open(path, 'wb') as handle:
    plistlib.dump(data, handle)
print(f'Info.plist → CFBundleShortVersionString {version}')
PY
  dim "Keep src/lib/downloads.ts APP_VERSION in sync."
}

case "${1:-help}" in
  doctor)  shift; cmd_doctor "$@" ;;
  setup)   shift; cmd_setup "$@" ;;
  auth)    shift; cmd_auth "$@" ;;
  devices) shift; cmd_devices "$@" ;;
  run)     shift; cmd_run "$@" ;;
  build)   shift; cmd_build "$@" ;;
  ipa)     shift; cmd_ipa "$@" ;;
  version) shift; cmd_version "$@" ;;
  help|-h|--help|*)
    sed -n '2,20p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
    ;;
esac
