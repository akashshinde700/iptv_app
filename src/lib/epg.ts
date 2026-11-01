/* Client-side EPG types + fetcher (server: src/lib/server/epg.ts). */

export interface GuideProgramme {
  title: string;
  description: string | null;
  start: number;
  stop: number;
  category: string | null;
}

export interface ChannelGuide {
  channelId: string;
  matched: boolean;
  now: (GuideProgramme & { progress: number }) | null;
  next: GuideProgramme | null;
}

/** Now/next for up to 30 channels. Returns [] when the operator has no EPG URLs set. */
export async function fetchGuide(channelIds: string[]): Promise<ChannelGuide[]> {
  if (channelIds.length === 0) return [];
  const res = await fetch(`/api/epg?ids=${channelIds.slice(0, 30).join(",")}`, { cache: "no-store" });
  if (!res.ok) return [];
  const data = (await res.json().catch(() => null)) as { items?: ChannelGuide[] } | null;
  return data?.items ?? [];
}
