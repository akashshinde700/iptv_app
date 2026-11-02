/**
 * One plan gate for every media route, mirroring the channels catalog:
 * guests get 403 `reason: "guest"` (the UI turns that into the plan upsell), a lapsed
 * plan gets 403 `reason: "expired"`, and only active members reach a provider.
 */
import type { MediaContext } from "./types";

export type GateResult = { ok: true; ctx: MediaContext } | { ok: false; response: Response };

export async function mediaGate(request: Request): Promise<GateResult> {
  // Fixture mode exists precisely because there may be no database to authenticate
  // against — it only ever serves the bundled sample catalog. It is a *development* mode and
  // would expose that catalog to anonymous visitors, so it is refused in production even if the
  // flag is left set in the environment.
  if (process.env.MEDIA_FIXTURES === "1" && process.env.NODE_ENV === "production") {
    return {
      ok: false,
      response: Response.json(
        { error: "MEDIA_FIXTURES is a development-only mode and is disabled in production" },
        { status: 503 },
      ),
    };
  }
  if (process.env.MEDIA_FIXTURES === "1") {
    return { ok: true, ctx: { organizationId: "fixtures", country: "IN" } };
  }

  // Imported lazily: in fixture mode we must not touch the Prisma client at all
  // (`src/lib/db.ts` instantiates it at module load), so a DB-less demo can still run.
  const { getCustomer } = await import("@/lib/server/auth");
  const { buildCustomerChannelWhere } = await import("@/lib/server/access");

  const identity = await getCustomer(request);
  if (!identity) {
    return {
      ok: false,
      response: Response.json({ error: "Plan required", accessDenied: true, reason: "guest" }, { status: 403 }),
    };
  }
  const { state } = await buildCustomerChannelWhere(identity.id);
  if (!state.hasAccess) {
    return {
      ok: false,
      response: Response.json({ error: state.reason, accessDenied: true, reason: state.reason }, { status: 403 }),
    };
  }
  // Geo comes from the CDN edge, when there is one — providers that care use it to pick
  // a regional feed; providers that don't simply ignore it.
  const country =
    request.headers.get("cf-ipcountry") ?? request.headers.get("x-vercel-ip-country") ?? undefined;

  return {
    ok: true,
    ctx: {
      organizationId: state.organizationId ?? identity.organizationId,
      country: country && country !== "XX" ? country.toUpperCase() : undefined,
    },
  };
}

/** Uniform error → JSON mapping for the media routes (same behaviour as `toErrorResponse`). */
export async function mediaError(error: unknown): Promise<Response> {
  const { toErrorResponse } = await import("@/lib/server/auth");
  return toErrorResponse(error);
}

/** Small helper so each route stays a one-liner. */
export function jsonCached(body: unknown, seconds: number, extra?: Record<string, string>): Response {
  return Response.json(body, {
    headers: { "cache-control": `private, max-age=${seconds}`, ...extra },
  });
}
