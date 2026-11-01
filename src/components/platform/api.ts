/* Platform console API client — typed wrappers around /api/platform/*. */

export class ApiFailure extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T>(url: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: init.method ?? "GET",
      headers: init.body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new ApiFailure(0, "Can't reach the server — check your connection and try again.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message =
      res.status >= 500
        ? "Something went wrong on the server. Please try again."
        : ((data as { error?: string }).error ?? "Request failed");
    throw new ApiFailure(res.status, message);
  }
  return data as T;
}

export function withQuery(path: string, params: Record<string, string | number | null | undefined>): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "" && value !== "ALL") qs.set(key, String(value));
  }
  const s = qs.toString();
  return s ? `${path}?${s}` : path;
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface OrgRow {
  id: string;
  slug: string;
  name: string;
  status: string;
  platformPlan: string;
  platformTrialEndsAt: string | null;
  platformValidUntil: string | null;
  customDomain: string | null;
  createdAt: string;
  counts: { customers: number; channels: number; portals: number; plans: number; admins: number };
}

export interface PlatformStats {
  orgs: { total: number; active: number; trial: number; suspended: number };
  customers: { total: number; active: number };
  subscribers: { active: number; expiring7: number; expiring3: number; expired: number; suspended: number; pending: number; none: number };
  payments: { pending: number; revenue30d: number; revenueTotal: number };
  channels: number;
  portals: number;
}

export type CustomerState = "ACTIVE" | "EXPIRED" | "PENDING" | "SUSPENDED" | "NO_SUBSCRIPTION" | "ARCHIVED";
export type SubscriptionState = "ACTIVE" | "PENDING" | "SUSPENDED" | "CANCELLED" | "EXPIRED";

export interface CustomerRow {
  id: string;
  name: string;
  username: string;
  email: string;
  mobile: string | null;
  status: string;
  accountStatus: string;
  planId: string | null;
  planStartedAt: string | null;
  planExpiresAt: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  organization: { id: string; name: string; slug: string };
  plan: { id: string; name: string; maxDevices: number } | null;
  state: CustomerState;
  daysLeft: number | null;
  devices: number;
}

export interface PaymentRow {
  id: string;
  organizationId: string;
  customerId: string;
  subscriptionId: string | null;
  amount: number;
  currency: string;
  method: string;
  reference: string | null;
  status: string;
  paidAt: string | null;
  notes: string | null;
  recordedBy: string | null;
  createdAt: string;
  planName?: string;
  customer?: { id: string; name: string; username: string };
  organization?: { id: string; name: string };
  subscription?: { id: string; planName: string } | null;
}

export interface SubscriptionRow {
  id: string;
  organizationId: string;
  customerId: string;
  planId: string | null;
  planName: string;
  status: string;
  startsAt: string;
  endsAt: string;
  price: number;
  discount: number;
  amount: number;
  paymentStatus: string;
  autoRenew: boolean;
  notes: string | null;
  createdBy: string | null;
  suspendedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  state: SubscriptionState;
  daysLeft: number;
  customer?: { id: string; name: string; username: string };
  organization?: { id: string; name: string };
  payments?: PaymentRow[];
}

export interface SessionRow {
  id: string;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  expiresAt: string;
}

export interface CustomerDetail {
  customer: Omit<CustomerRow, "devices" | "plan"> & {
    notes: string | null;
    plan: { id: string; name: string; price: number; durationDays: number; maxDevices: number; allowAdult: boolean } | null;
  };
  currentSubscriptionId: string | null;
  subscriptions: SubscriptionRow[];
  payments: PaymentRow[];
  sessions: SessionRow[];
}

export interface FacetOption {
  value: string;
  label: string;
  count: number;
}
export interface Facets {
  totalChannels: number;
  categories: FacetOption[];
  languages: FacetOption[];
  countries: FacetOption[];
  regions: FacetOption[];
}
export interface ChannelPick {
  id: string;
  name: string;
  logo: string | null;
  categories: string[];
  languages: string[];
  countryName: string | null;
  isNsfw: boolean;
  fromSource: boolean;
}

export interface PlanRow {
  id: string;
  organizationId: string;
  organization: { id: string; name: string };
  name: string;
  description: string | null;
  price: number;
  durationDays: number;
  isActive: boolean;
  allowAdult: boolean;
  maxDevices: number;
  regions: string[];
  countries: string[];
  languages: string[];
  categories: string[];
  customerCount: number;
  activeSubscriptions: number;
  channelCount: number;
  createdAt: string;
}

export interface PlanDetail extends Omit<PlanRow, "organization"> {
  organization: { id: string; name: string };
  channels: { id: string; name: string; logo: string | null }[];
}

export type SourceType = "STALKER" | "XTREAM" | "M3U_URL" | "M3U_FILE";

export interface SourceRow {
  id: string;
  organizationId: string;
  organization: { id: string; name: string } | null;
  name: string;
  type: SourceType;
  url: string | null;
  displayUrl: string | null;
  playlistUrl: string | null;
  macAddress: string | null;
  username: string | null;
  epgUrl: string | null;
  status: string;
  lastError: string | null;
  lastSyncedAt: string | null;
  expiresAt: string | null;
  notes: string | null;
  isActive: boolean;
  hasPassword: boolean;
  hasFileData: boolean;
  channelCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface SourceSummary {
  total: number;
  active: number;
  failed: number;
  disabled: number;
  totalChannels: number;
  lastSyncedAt: string | null;
}

export interface SyncLogRow {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  added: number;
  removed: number;
  updated: number;
  status: string;
  message: string | null;
}

export interface TestResult {
  ok: boolean;
  message: string;
  channelEstimate: number | null;
  expiresAt: string | null;
  accountStatus: string | null;
  maxConnections: number | null;
}

export interface SourceChannelRow {
  id: string;
  name: string;
  logo: string | null;
  categories: string[];
  countryName: string | null;
  isActive: boolean;
  isNsfw: boolean;
}

export interface AuditRow {
  id: string;
  organizationId: string | null;
  organization: { id: string; name: string } | null;
  adminName: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  oldValue: string | null;
  newValue: string | null;
  ip: string | null;
  createdAt: string;
}

export interface AccessSummary {
  total: number;
  hasAccess: boolean;
  reason: string;
  planName: string | null;
  allowAdult: boolean;
  rules: { regions: string[]; countries: string[]; languages: string[]; categories: string[] };
  byCategory: { key: string; count: number }[];
  byLanguage: { key: string; count: number }[];
  byCountry: { key: string; count: number }[];
}
