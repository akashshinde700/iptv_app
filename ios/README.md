# StreamKaro iOS

Native iPhone/iPad app — a SwiftUI + WKWebView shell around the StreamKaro website,
built with [xtool](https://github.com/xtool-org/xtool) so it compiles on **Linux or
Windows without a Mac**.

```bash
bash scripts/ios.sh doctor     # check xtool, device, target URL
bash scripts/ios.sh setup      # first run: Darwin Swift SDK
bash scripts/ios.sh auth       # Apple ID for signing
bash scripts/ios.sh run        # build + install + launch
```

Full guide, including universal links, App Store reality and troubleshooting:
**[../docs/IOS_APP.md](../docs/IOS_APP.md)**.
