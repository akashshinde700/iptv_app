/**
 * Media provider registry.
 *
 * `MEDIA_PROVIDER` picks the default. The nxsha adapter additionally requires
 * `NXSHA_ENABLED=true`; without both, the app silently falls back to the catalog so a
 * misconfigured deploy degrades to "your own titles" instead of an empty media hub.
 *
 * Providers are imported lazily: the catalog provider pulls in Prisma, and the fixture
 * provider must be usable with no database at all (see MEDIA_FIXTURES).
 */
import { fixturesEnabled } from "./fixtures";
import type { MediaProvider, MediaProviderName } from "./types";

export * from "./types";

export function isNxshaEnabled(): boolean {
  return process.env.NXSHA_ENABLED === "true";
}

/** The provider to use for a request (a `?provider=` hint is honoured only when enabled). */
export async function resolveProvider(requested?: string | null): Promise<MediaProvider> {
  // No database needed: bundled sample catalog for UI evaluation / screenshots.
  if (fixturesEnabled()) {
    const { fixturesProvider } = await import("./fixtures");
    return fixturesProvider;
  }
  const wanted = (requested ?? process.env.MEDIA_PROVIDER ?? "catalog").toLowerCase();
  if (wanted === "nxsha" && isNxshaEnabled()) {
    const { nxshaProvider } = await import("./nxsha");
    return nxshaProvider;
  }
  const { catalogProvider } = await import("./catalog");
  return catalogProvider;
}

/** What the app should advertise in Settings / admin (no secrets, no provider imports). */
export function providerStatus() {
  const wanted = (process.env.MEDIA_PROVIDER ?? "catalog").toLowerCase();
  const active = fixturesEnabled() ? "catalog" : wanted === "nxsha" && isNxshaEnabled() ? "nxsha" : "catalog";
  return {
    default: active,
    nxshaEnabled: isNxshaEnabled(),
    fixtures: fixturesEnabled(),
    providers: [
      {
        name: "catalog" as MediaProviderName,
        description: "Your own sources (Xtream portal Movies & TV Shows)",
        available: true,
        default: active === "catalog",
      },
      {
        name: "nxsha" as MediaProviderName,
        description: "Third-party aggregator (nxsha/MovieBox) — unlicensed, demo use only",
        available: isNxshaEnabled(),
        default: active === "nxsha",
      },
    ],
  };
}
