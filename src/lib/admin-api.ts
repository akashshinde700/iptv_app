/* Admin panel API client — typed wrappers around /api/admin/* endpoints. */

export interface AdminStats {
  channels: { total: number; active: number; adult: number; fromPortals: number };
  customers: {
    total: number;
    active: number;
    inactive: number;
    suspended: number;
    expired: number;
    withPlan: number;
  };
  plans: { total: number; active: number };
  portals: {
    total: number;
    byType: { type: string; count: number }[];
    needsAttention: number;
    lastSyncedAt: string | null;
  };
  breakdown: {
    byRegion: { key: string; count: number }[];
    byCountry: { key: string; count: number }[];
    byLanguage: { key: string; count: number }[];
    byCategory: { key: string; count: number }[];
  };
  recentActivity: { id: string; action: string; adminName: string; entityType: string | null; createdAt: string }[];
}

export interface AdminCustomer {
  id: string;
  name: string;
  username: string;
  email: string;
  mobile: string | null;
  status: string;
  planId: string | null;
  planStartedAt: string | null;
  planExpiresAt: string | null;
  notes: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  plan?: { id: string; name: string; price: number; durationDays: number; isActive: boolean } | null;
}

export interface AdminPlan {
  id: string;
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
  createdAt: string;
}

export interface AdminPortal {
  id: string;
  name: string;
  type: "STALKER" | "XTREAM" | "M3U_URL" | "M3U_FILE";
  url: string | null;
  macAddress: string | null;
  username: string | null;
  password: string | null;
  epgUrl: string | null;
  status: string;
  lastError: string | null;
  lastSyncedAt: string | null;
  expiresAt: string | null;
  notes: string | null;
  isActive: boolean;
  channelCount: number;
  createdAt: string;
}

export interface AdminChannel {
  id: string;
  sourceId: string;
  name: string;
  logo: string | null;
  country: string | null;
  countryName: string | null;
  region: string | null;
  categories: string[];
  languages: string[];
  isNsfw: boolean;
  isActive: boolean;
  isDemo: boolean;
  streamCount: number;
  portal: { id: string; name: string; type: string } | null;
}

export interface SyncLogItem {
  id: string;
  portalId: string;
  startedAt: string;
  finishedAt: string | null;
  added: number;
  removed: number;
  updated: number;
  status: string;
  message: string | null;
}

export interface AuditLogItem {
  id: string;
  adminName: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  oldValue: string | null;
  newValue: string | null;
  ip: string | null;
  createdAt: string;
}

export interface AccessPreview {
  total: number;
  state: {
    hasAccess: boolean;
    reason: string;
    planName: string | null;
    allowAdult: boolean;
    regions: string[];
    countries: string[];
    languages: string[];
    categories: string[];
  };
  breakdown: {
    byRegion: { key: string; count: number }[];
    byCountry: { key: string; count: number }[];
    byLanguage: { key: string; count: number }[];
    byCategory: { key: string; count: number }[];
  };
}

export interface AdminMeta {
  regions: string[];
  countries: { code: string; name: string }[];
  languages: string[];
  categories: string[];
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: init?.body instanceof FormData ? init?.headers : { "Content-Type": "application/json", ...init?.headers },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Request failed (${res.status})`)
  return data as T
}

/* --------------------------------- auth ---------------------------------- */

export async function adminLogin(username: string, password: string) {
  return request<{ ok: boolean; admin: { username: string; role: string } }>("/api/admin/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  })
}

export async function adminLogout() {
  return request<{ ok: boolean }>("/api/admin/auth/logout", { method: "POST" })
}

export interface AdminOrg {
  id: string
  slug: string
  name: string
  status: string
  appName: string | null
  platformPlan: string
  platformTrialEndsAt: string | null
  platformValidUntil: string | null
}

export async function adminMe() {
  return request<{
    admin: { id: string; username: string; email: string; role: string; isPlatformStaff: boolean } | null
    organization: AdminOrg | null
  }>("/api/admin/auth/me")
}

/* --------------------------------- stats --------------------------------- */

export function fetchAdminStats() {
  return request<AdminStats>("/api/admin/stats")
}

/* -------------------------------- customers ------------------------------- */

export function fetchAdminCustomers(params: { search?: string; status?: string; page?: number; pageSize?: number }) {
  const qs = new URLSearchParams()
  if (params.search) qs.set("search", params.search)
  if (params.status && params.status !== "ALL") qs.set("status", params.status)
  qs.set("page", String(params.page ?? 1))
  qs.set("pageSize", String(params.pageSize ?? 20))
  return request<{ items: AdminCustomer[]; total: number; page: number; totalPages: number }>(
    `/api/admin/customers?${qs}`,
  )
}

export function createAdminCustomer(body: Record<string, unknown>) {
  return request<AdminCustomer>("/api/admin/customers", { method: "POST", body: JSON.stringify(body) })
}

export function updateAdminCustomer(id: string, body: Record<string, unknown>) {
  return request<AdminCustomer>(`/api/admin/customers/${id}`, { method: "PATCH", body: JSON.stringify(body) })
}

export function deleteAdminCustomer(id: string) {
  return request<{ ok: boolean }>(`/api/admin/customers/${id}`, { method: "DELETE" })
}

export function fetchCustomerPreview(id: string) {
  return request<AccessPreview>(`/api/admin/customers/${id}/preview`)
}

export function setCustomerOverride(customerId: string, channelId: string, allow: boolean) {
  return request<{ ok: boolean }>(`/api/admin/customers/${customerId}/overrides`, {
    method: "POST",
    body: JSON.stringify({ channelId, allow }),
  })
}

/* ---------------------------------- plans --------------------------------- */

export function fetchAdminPlans() {
  return request<{ items: AdminPlan[] }>("/api/admin/plans")
}

export function createAdminPlan(body: Record<string, unknown>) {
  return request<AdminPlan>("/api/admin/plans", { method: "POST", body: JSON.stringify(body) })
}

export function updateAdminPlan(id: string, body: Record<string, unknown>) {
  return request<AdminPlan>(`/api/admin/plans/${id}`, { method: "PATCH", body: JSON.stringify(body) })
}

export function deleteAdminPlan(id: string) {
  return request<{ ok: boolean }>(`/api/admin/plans/${id}`, { method: "DELETE" })
}

/* --------------------------------- portals -------------------------------- */

export function fetchAdminPortals() {
  return request<{ items: AdminPortal[] }>("/api/admin/portals")
}

export function createAdminPortal(body: Record<string, unknown>) {
  return request<AdminPortal>("/api/admin/portals", { method: "POST", body: JSON.stringify(body) })
}

export function updateAdminPortal(id: string, body: Record<string, unknown>) {
  return request<{ ok: boolean }>(`/api/admin/portals/${id}`, { method: "PATCH", body: JSON.stringify(body) })
}

export function deleteAdminPortal(id: string) {
  return request<{ ok: boolean }>(`/api/admin/portals/${id}`, { method: "DELETE" })
}

export function syncAdminPortal(id: string) {
  return request<{ ok: boolean; added: number; updated: number; removed: number; total: number; durationMs: number }>(
    `/api/admin/portals/${id}/sync`,
    { method: "POST" },
  )
}

export function fetchPortalLogs(id: string) {
  return request<{ items: SyncLogItem[] }>(`/api/admin/portals/${id}/logs`)
}

export function uploadM3UFile(file: File, name: string) {
  const form = new FormData()
  form.append("file", file)
  form.append("name", name)
  return request<AdminPortal>("/api/admin/portals/upload", { method: "POST", body: form })
}

/* ------------------------------ bulk import ------------------------------- */

export interface BulkEntryPreview {
  type: string;
  name: string;
  url: string | null;
  macAddress: string | null;
  username: string | null;
  hasPassword: boolean;
  expiresAt: string | null;
  expiryText: string | null;
  sourceLine: number;
  duplicate: boolean;
}

export interface BulkPreview {
  mode: "preview";
  entries: BulkEntryPreview[];
  stats: { stalker: number; xtream: number; m3u: number; total: number; duplicates: number };
  skippedLines: number;
}

export interface BulkImportResult {
  mode: "import";
  created: number;
  duplicatesSkipped: number;
  byType: { stalker: number; xtream: number; m3u: number };
  skippedLines: number;
}

export function bulkPreviewPortals(text: string) {
  return request<BulkPreview>("/api/admin/portals/bulk", {
    method: "POST",
    body: JSON.stringify({ text, mode: "preview" }),
  })
}

export function bulkImportPortals(text: string) {
  return request<BulkImportResult>("/api/admin/portals/bulk", {
    method: "POST",
    body: JSON.stringify({ text, mode: "import" }),
  })
}

/* --------------------------------- channels ------------------------------- */

export interface AdminChannelFilters {
  search?: string
  region?: string
  country?: string
  language?: string
  category?: string
  portalId?: string
  adult?: string
  status?: string
  page?: number
  pageSize?: number
}

export function fetchAdminChannels(params: AdminChannelFilters) {
  const qs = new URLSearchParams()
  if (params.search) qs.set("search", params.search)
  if (params.region) qs.set("region", params.region)
  if (params.country) qs.set("country", params.country)
  if (params.language) qs.set("language", params.language)
  if (params.category) qs.set("category", params.category)
  if (params.portalId) qs.set("portalId", params.portalId)
  if (params.adult && params.adult !== "all") qs.set("adult", params.adult)
  if (params.status && params.status !== "all") qs.set("status", params.status)
  qs.set("page", String(params.page ?? 1))
  qs.set("pageSize", String(params.pageSize ?? 25))
  return request<{ items: AdminChannel[]; total: number; page: number; totalPages: number }>(
    `/api/admin/channels?${qs}`,
  )
}

export function updateAdminChannel(id: string, body: Record<string, unknown>) {
  return request<{ ok: boolean }>(`/api/admin/channels/${id}`, { method: "PATCH", body: JSON.stringify(body) })
}

export function bulkAdminChannels(ids: string[], action: "activate" | "deactivate" | "delete") {
  return request<{ ok: boolean; affected: number }>("/api/admin/channels/bulk", {
    method: "POST",
    body: JSON.stringify({ ids, action }),
  })
}

/* --------------------------------- meta/audit ------------------------------ */

export function fetchAdminMeta() {
  return request<AdminMeta>("/api/admin/meta")
}

export function fetchAuditLogs(params: { page?: number; pageSize?: number }) {
  const qs = new URLSearchParams()
  qs.set("page", String(params.page ?? 1))
  qs.set("pageSize", String(params.pageSize ?? 30))
  return request<{ items: AuditLogItem[]; total: number; page: number; totalPages: number }>(
    `/api/admin/audit-logs?${qs}`,
  )
}

/* ------------------------------ failover / sources ------------------------- */

export interface FailoverChannel {
  id: string
  identityKey: string
  name: string
  logo: string | null
  totalSources: number
  workingSources: number
  health: "working" | "degraded" | "nobackup" | "failed"
}

export interface FailoverStats {
  total: number
  working: number
  nobackup: number
  failed: number
}

export interface ChannelSource {
  streamId: string
  channelId: string
  channelName: string
  provider: string
  providerType: string | null
  manual: boolean
  quality: string | null
  title: string | null
  priority: number
  status: string
  failureCount: number
  lastError: string | null
  lastFailureAt: string | null
  lastOkAt: string | null
  previewUrl: string
}

export function fetchFailoverChannels(params: { search?: string; filter?: string; page?: number }) {
  const qs = new URLSearchParams()
  if (params.search) qs.set("search", params.search)
  if (params.filter && params.filter !== "all") qs.set("filter", params.filter)
  qs.set("page", String(params.page ?? 1))
  return request<{
    items: FailoverChannel[]
    stats: FailoverStats
    page: number
    pageSize: number
    total: number
    totalPages: number
  }>(`/api/admin/channels/failover?${qs}`)
}

export function fetchChannelSources(channelId: string) {
  return request<{ channel: { id: string; name: string; identityKey: string }; sources: ChannelSource[]; total: number; working: number }>(
    `/api/admin/channels/${channelId}/sources`,
  )
}

export function checkSource(channelId: string, streamId: string) {
  return request<{ ok: boolean; detail: string; status: string; failureCount: number }>(
    `/api/admin/channels/${channelId}/streams/${streamId}/check`,
    { method: "POST" },
  )
}

export function updateSource(channelId: string, streamId: string, body: Record<string, unknown>) {
  return request<{ ok: boolean }>(`/api/admin/channels/${channelId}/streams/${streamId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  })
}

export function removeSource(channelId: string, streamId: string) {
  return request<{ ok: boolean }>(`/api/admin/channels/${channelId}/streams/${streamId}`, { method: "DELETE" })
}

export function addSource(channelId: string, body: { url: string; title?: string; quality?: string; priority?: number }) {
  return request<{ ok: boolean; streamId: string }>(`/api/admin/channels/${channelId}/streams`, {
    method: "POST",
    body: JSON.stringify(body),
  })
}

/* --------------------------------- health --------------------------------- */

export interface HealthSnapshot {
  channels: { total: number; ok: number; degraded: number; dead: number; hidden: number; unknown: number }
  streams: { total: number; active: number; disabled: number; unchecked: number; checkedLastHour: number }
  lastCheckedAt: string | null
  fullyChecked: boolean
}

export interface HealthSweepSummary {
  probed: number
  ok: number
  failed: number
  disabled: number
  recovered: number
  channelsChecked: number
  channelsHidden: number
  channelsRestored: number
  remaining: number
  durationMs: number
}

export interface HealthSweepResult {
  ok: boolean
  summary: HealthSweepSummary
}

export function fetchHealth() {
  return request<HealthSnapshot>("/api/admin/health")
}

/** Probe the next batch of streams, auto-disable dead ones, hide dead channels. */
export function runHealthSweep(body: { batch?: number; budgetMs?: number } = {}) {
  return request<HealthSweepResult>("/api/admin/health/sweep", {
    method: "POST",
    body: JSON.stringify(body),
  })
}

export interface HiddenChannel {
  id: string
  name: string
  logo: string | null
  healthStatus: string
  autoHiddenAt: string | null
}

/** Auto-hidden channels, so the operator can restore one by hand if the doctor hid it wrongly. */
export function fetchHiddenChannels() {
  return request<{ items: HiddenChannel[] }>("/api/admin/health/hidden")
}

export function restoreChannel(id: string) {
  return request<{ ok: boolean }>(`/api/admin/health/hidden/${id}`, { method: "POST" })
}
