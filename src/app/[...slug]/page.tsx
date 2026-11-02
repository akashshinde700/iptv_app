import { notFound } from "next/navigation";
import { AppShell } from "@/components/tv/AppShell";
import { viewFromPath } from "@/lib/deep-link";

/**
 * Deep links.
 *
 * The product is a single-page app (`/` renders `AppShell`, which keeps its own view stack), so
 * without this catch-all every screen other than Home was a 404: refreshes, bookmarks, shared
 * links, the `/admin` link on the signup success screen, the iOS shell's `streamkaro://` deep
 * links and universal links.
 *
 * `viewFromPath()` decides whether the path names a real screen. If it does, the shell renders
 * and boots on that screen; if it does not, this is a genuine 404 and Next renders
 * `not-found.tsx`.
 */
export default async function DeepLinkPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const pathname = "/" + (slug ?? []).join("/");
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (typeof value === "string") search.set(key, value);
    else if (Array.isArray(value) && value[0]) search.set(key, value[0]);
  }

  if (!viewFromPath(pathname, search.toString())) notFound();

  return <AppShell />;
}
