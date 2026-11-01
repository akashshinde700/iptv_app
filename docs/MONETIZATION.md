# How to Earn Money from StreamKaro 💰

> **Honest intro, read first:** StreamKaro plays ~10,000 channels aggregated from the **public [iptv-org](https://github.com/iptv-org/iptv) project**. The app **hosts no video content** — it indexes publicly available streams. Revenue depends entirely on **traffic** (views → ad impressions → money), and legality/availability of specific streams varies by country. See the [Legal disclaimer](#-legal-disclaimer-read-this-carefully) at the bottom before going live. Build honestly, add value (discovery, filters, player UX), never promote piracy.

Streams of revenue (pun intended) — four, start with A, layer B once you have users:

| Stream | Effort | Time to first ₹ | Ceiling |
|---|---|---|---|
| **A. Display ads** | Low | Days after AdSense approval | Medium |
| **B. Subscriptions** | Medium | After ~1k MAU | High |
| **C. Affiliates** | Low | Weeks | Medium |
| **D. Sponsorships / donations** | Low | Weeks | Low–Medium |

---

## Stream A — Display Ads (start here)

### Step 1: Get AdSense approval

Google AdSense needs a **real site**, not a half-baked landing page:

- ✅ Deployed production site with a decent amount of original content (your channel pages/descriptions count, but add some written content: FAQ, about page, blog posts like "Top 10 Hindi news channels").
- ✅ **Privacy policy page** (mentions cookies & ads) — mandatory for AdSense.
- ✅ **About** and **Contact** pages.
- ✅ Custom domain (`streamkaro.in` looks far more trustworthy than a `.vercel.app` subdomain).
- ✅ Some traffic before applying helps (share on WhatsApp/Telegram, Reddit r/IndianUsername-tier communities, SEO below). 50–100 visitors/day for 2–4 weeks is a realistic runway.
- ⚠️ Do **not** run other aggressive ad networks at the same time during review.

Apply at <https://adsense.google.com>, verify site ownership, wait for review (days–weeks).

### Step 2: Flip the built-in switch (it's already wired)

The app ships with **`AdSlot` components** that are AdSense-ready. Once approved, set one env var:

```bash
# .env
NEXT_PUBLIC_ADSENSE_CLIENT=ca-pub-XXXXXXXXXXXXXXXX
```

That's it. AdSlots **automatically switch** from the default house promo cards (the fallback UI you see before approval) to **live AdSense ad units**. No code changes.

### Step 3: Where the slots already are

| Placement | View | Format that fits |
|---|---|---|
| In-feed | Home, between channel rows | In-feed native (blends with cards) |
| In-grid | Browse grid, every ~12–16 cards | Display responsive / in-article |
| Sidebar | Watch page (next to the player) | 300×600 half-page — highest RPM slot on the watch view |

Follow Google's policy: max ~3 ad units per view on content-light pages; **never** place ads over the video player.

### What to expect in India (RPM reality check)

- Indian traffic is **low-RPM**: expect roughly **₹30–₹150 (~$0.4–$1.8) RPM** (revenue per 1,000 page views) for general entertainment/news audiences; entertainment sub-pages can dip lower, tech/finance-adjacent pages higher.
- Translation: **1,000 daily pageviews ≈ ₹1,000–₹4,000/month. 10,000 daily pageviews ≈ ₹10k–₹40k/month.** Traffic is the whole game — that's what the 90-day roadmap below is for.

### Android app variant: AdMob

AdSense units don't render reliably in Android WebViews. For the Capacitor app, use **AdMob** instead (same Google account, separate product):

- Plugin: `@capacitor-community/admob` — full setup in [`ANDROID_TV_APP.md` §11](./ANDROID_TV_APP.md#11-optional-android-native-niceties).
- Start with test ad IDs, declare the **Advertising ID** in the Play Console Data safety form.
- AdMob banner + interstitial (between channel switches, *never* mid-playback) + native ads.

---

## Stream B — Subscriptions (Premium)

### Tiers (already present on the Premium page)

| Plan | Price | Includes |
|---|---|---|
| **Free** | ₹0 | Everything, with ads |
| **Pro** | **₹49/month** | Ad-free + favorites sync (across devices once auth lands) |
| **Super** | **₹99/month** | Everything in Pro + future exclusive features (watch history, EPG, PiP, early features) |

The Premium page already renders these plans with a **mock checkout** and hook points for Razorpay/Stripe. Your job: replace the mock with real Razorpay.

### Razorpay integration for India (recommended over Stripe)

Razorpay supports UPI, cards, netbanking, wallets — the Indian reality. Stripe India is card-heavy and weaker for small recurring amounts.

#### 1. Setup

- Sign up at <https://razorpay.com> → complete KYC (PAN + bank + business; individuals can use "proprietorship").
- Grab **Key Id / Key Secret** from Dashboard → Settings → API Keys.
- Enable **UPI Autopay** on your account for subscriptions (see below).

#### 2. Data model (Prisma)

Suggest adding a `User` + `Premium` table to `prisma/schema.prisma`:

```prisma
model User {
  id          String   @id @default(cuid())
  email       String?  @unique
  phone       String?  @unique
  name        String?
  createdAt   DateTime @default(now())
  premium     Premium?
}

model Premium {
  id            String   @id @default(cuid())
  userId        String   @unique
  user          User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  plan          String   @default("free") // free | pro | super
  isPremium     Boolean  @default(false)
  validUntil    DateTime?
  razorpaySubId String?  // for recurring (UPI Autopay / subscription links)
  updatedAt     DateTime @updatedAt
}
```

Then `bun run db:push`. (SQLite today; the same schema ports to Postgres/Turso when you migrate.)

#### 3. Backend flow (Next.js App Router API routes)

```
Browser                    API route                     Razorpay
  │  POST /api/premium/order  │
  ├──────────────────────────►│ create order/subscription ──►
  │◄──── order_id, key_id ────┤◄──────────────────────────────
  │  open Razorpay Checkout JS│
  ├──────────────────────────►│
  │                           │  (payment completes)
  │                           │◄──── webhook: payment.captured / subscription.charged
  │                           │ verify signature (HMAC) ── flip isPremium + validUntil
  │◄── UI polls /api/premium/status
```

#### 4. Sample webhook verification snippet (TypeScript)

```ts
// src/app/api/razorpay/webhook/route.ts
import { NextResponse } from "next/server";
import crypto from "crypto";
import { db } from "@/lib/db"; // your Prisma client

const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET!;

export async function POST(req: Request) {
  const rawBody = await req.text(); // MUST verify against the RAW body, not parsed JSON
  const signature = req.headers.get("x-razorpay-signature") ?? "";

  // 1. Verify HMAC SHA256 signature
  const expected = crypto
    .createHmac("sha256", WEBHOOK_SECRET)
    .update(rawBody)
    .digest("hex");

  if (signature !== expected) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const event = JSON.parse(rawBody);

  // 2. Handle the events you care about
  if (event.event === "payment.captured" || event.event === "order.paid") {
    const payment = event.payload.payment.entity;
    // your order notes should carry the userId you set at order creation
    const userId = payment.notes?.userId;
    const plan = payment.notes?.plan ?? "pro"; // pro | super

    await db.premium.upsert({
      where: { userId },
      create: {
        userId,
        plan,
        isPremium: true,
        validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      },
      update: {
        plan,
        isPremium: true,
        validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });
  }

  if (event.event === "subscription.charged") {
    // recurring UPI Autopay / subscriptions
    const sub = event.payload.subscription.entity;
    await db.premium.updateMany({
      where: { razorpaySubId: sub.id },
      data: {
        isPremium: true,
        validUntil: new Date(sub.current_end * 1000),
      },
    });
  }

  if (event.event === "subscription.cancelled" || event.event === "payment.failed") {
    // downgrade logic here
  }

  return NextResponse.json({ ok: true });
}
```

> ⚠️ Never trust the client. **Only** the verified webhook (or server-side `payments/fetch`) flips the premium flag. Also register the webhook URL in the Razorpay Dashboard and set `RAZORPAY_WEBHOOK_SECRET` in your env.

**UPI Autopay** note: for ₹49/₹99 monthly recurring without card mandates, create Razorpay **Subscriptions** with UPI as a mandate method — the user approves once in their UPI app, then it auto-debits monthly (with pre-debit notifications). This is THE retention unlock in India where card adoption for recurring payments is low.

---

## Stream C — Affiliate Marketing

Low effort, stacks with everything else:

1. **VPN partners** — viewers often need VPNs for geo-blocked channels; VPN affiliate payouts are the highest in the niche (NordVPN, Surfshark, PIA — check their affiliate terms; disclose clearly). "Watch international channels — get a VPN" banner next to foreign-country filters.
2. **DTH / OTT affiliate programs (India)**:
   - **Amazon Associates** — link to Fire TV Stick, smart TVs, headphones: "Watch StreamKaro on the big screen → buy Fire TV Stick". Adds work great on the TV-setup-guide pages.
   - **EarnKaro / Cuelinks** — Indian affiliate aggregators; one signup gives you offers for Tata Play, Jio Cinema, SonyLIV, Hotstar subscriptions, etc. Perfect contextual fit: "StreamKaro for free live TV; get premium OTT here."
3. **"Sponsored row" concept** — a home-page carousel row ("Sponsored picks") linking to partner content or affiliate landing pages. Cap it at one row, label it "Sponsored" (FTC/ASCI disclosure), and sell it directly to local businesses once you have traffic (see Stream D).

All affiliate content must be clearly labeled — it also keeps AdSense happy.

---

## Stream D — Sponsorships & Donations

- **UPI QR donation block on the Premium page** — for the Indian audience, a simple "Support karo" UPI QR (GPay/PhonePe/Paytm) converts surprisingly well for loyal users. Add a "Powered by supporters" thank-you strip.
- **GitHub Sponsors** — for the developer/FOSS crowd; link the repo.
- **Direct banner sponsorship** — once you can show a traffic screenshot (e.g. 20k monthly views), sell the sidebar/horizontal banner to local shops, tech stores, ISPs at fixed monthly rates (₹500–₹5,000/mo to start). Direct deals pay 5–10× AdSense RPM.
- **Channel/creator sponsorship** — small content creators pay for a featured row of their channels. Make it transparent and non-intrusive.

---

## 90-Day Realistic Roadmap

**Phase 1 — Ship & baseline (Days 1–15)**
- [ ] Deploy to production with a custom domain; fix the SQLite-on-Vercel issue (VPS/Docker or Turso/Postgres).
- [ ] Privacy policy, About, Contact pages live (needed for AdSense AND Play Store).
- [ ] Search Console + sitemap submitted; check all channel pages are crawlable (SEO for channel-name searches is your #1 organic channel — people google "Aaj Tak live", "Sony TV live" and you want those results).
- [ ] Apply for AdSense.

**Phase 2 — Traffic engine (Days 15–45)**
- [ ] SEO: title/description per channel view, `robots.txt` + sitemap automation, FAQ content ("How to watch X live on laptop").
- [ ] Social clips: 15–30s screen recordings of the UI ("10,000 FREE channels on this app 😱") for YouTube Shorts / Instagram Reels — Indian audiences convert extremely well on Shorts; put the site link in bio/comments.
- [ ] Communities: Telegram channel + WhatsApp channel for "new channels & features" posts; Reddit (r/IndiaTech-style subs, follow self-promo rules).
- [ ] AdSense approved → flip `NEXT_PUBLIC_ADSENSE_CLIENT`; tune placements against policy.

**Phase 3 — Products (Days 45–90)**
- [ ] Capacitor Android app → **Play Store** (internal → closed → production track). Play presence is a massive trust + traffic multiplier in India.
- [ ] Razorpay live → Premium Pro/Super plans; test the full webhook flow with ₹1 test payments.
- [ ] Add the channel-report / takedown-request feature (legal hygiene + Google likes it too).
- [ ] Desktop wrappers (see DESKTOP_APP.md) + `/download` page.
- [ ] First affiliate partners live (Amazon Associates + Cuelinks).
- [ ] Review numbers: RPM, signups, Play Store impressions. Double down on what moves.

**KPI targets to stay honest:** Day 30: ~500 daily views. Day 60: AdSense live + 1.5k daily. Day 90: Play Store app live + first ₹ from subscriptions/affiliates.

---

## ⚖️ Legal Disclaimer (read this carefully)

> **You, the operator of the deployed StreamKaro instance, are responsible for compliance.** This project is a *player/indexer* for streams aggregated by the public **iptv-org** project from publicly available sources across the internet.

- **iptv-org aggregates publicly available streams.** Some streams may be unlicensed in specific countries; availability and legality **vary by country and channel** and can change without notice. StreamKaro does not host, upload, or own any channel content.
- **Copyright respect:** If you are a rights-holder and find a channel in the index that infringes your rights, you can request removal. **You should support takedown / DMCA-style requests on your instance**: add a visible "Report channel" action (suggested feature: a `ChannelReport` model + `/api/report` route storing `channelId`, `reason`, `contactEmail`; review weekly and remove the channel + stream rows from your DB).
- **Your obligations as operator:** respond to valid takedown notices promptly, never promote or market the app as "free paid channels / piracy", avoid bundling or linking to known piracy sources, comply with local IT rules (in India: the IT Act and intermediary guidelines if you operate at scale), and keep the Privacy Policy accurate (AdSense/AdMob collect advertising identifiers).
- **No encouragement of piracy:** StreamKaro's value proposition is *discovery, filtering and a great player* for **publicly available** streams — never "get paid content free". Keep all marketing copy on this side of the line. Your Play Store listing will be reviewed by humans; wording matters.
- **Ad/monetization compliance:** Google AdSense/AdMob have strict content policies — copyrighted-stream-heavy placements can get the ad account limited. This is another reason to add the report/takedown flow and keep the catalog clean.
- This document is **not legal advice**. If StreamKaro becomes a meaningful business, spend one hour with a lawyer to review your privacy policy, terms of use, and takedown process. That's the cheapest insurance you'll ever buy.

---

*Related docs: [ANDROID_TV_APP.md](./ANDROID_TV_APP.md) · [DESKTOP_APP.md](./DESKTOP_APP.md) · [README.md](../README.md)*
