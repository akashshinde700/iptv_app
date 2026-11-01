/* Shared frontend types — mirror the backend API responses exactly. */

export interface BestStream {
  id: string;
  url: string;
  quality: string | null;
  title: string | null;
  referrer: string | null;
  userAgent: string | null;
}

export interface ChannelItem {
  id: string;
  sourceId: string;
  name: string;
  network: string | null;
  logo: string | null;
  country: string | null;
  countryName: string | null;
  countryFlag: string | null;
  categories: string[];
  languages: string[];
  website: string | null;
  isNsfw: boolean;
  streamCount: number;
  bestStream: BestStream | null;
}

export interface StreamInfo {
  id: string;
  title: string | null;
  url: string;
  quality: string | null;
  referrer: string | null;
  userAgent: string | null;
}

export interface ChannelDetail extends ChannelItem {
  streams: StreamInfo[];
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ChannelListParams {
  search?: string;
  country?: string;
  category?: string;
  language?: string;
  nsfw?: boolean;
  page?: number;
  pageSize?: number;
  sort?: "name" | "nameDesc";
}

export interface MetaResponse {
  totalChannels: number;
  totalStreams: number;
  categories: { slug: string; name: string; count: number }[];
  countries: { code: string; name: string; flag: string; count: number }[];
  languages: { name: string; count: number }[];
  /** true when facets are scoped to the logged-in customer's plan */
  scoped: boolean;
}

export interface FeaturedRow {
  id: string;
  title: string;
  params: Record<string, string>;
  total: number;
  items: ChannelItem[];
}

/** A purchasable plan as shown to viewers (GET /api/plans). */
export interface PublicPlan {
  id: string;
  name: string;
  description: string | null;
  price: number;
  durationDays: number;
  maxDevices: number;
  allowAdult: boolean;
  channelCount: number;
}

export interface FeaturedResponse {
  rows: FeaturedRow[];
  /** 'plan' = customer catalog; 'demo' = guest showcase */
  mode: "plan" | "demo";
}
