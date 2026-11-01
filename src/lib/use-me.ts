"use client";

import { useQuery } from "@tanstack/react-query";

export interface CustomerInfo {
  id: string;
  username: string;
  name: string;
  email: string;
  status: string;
  plan: {
    id: string;
    name: string;
    price: number;
    allowAdult: boolean;
    maxDevices: number;
  } | null;
  planStartedAt: string | null;
  planExpiresAt: string | null;
  expired: boolean;
}

export interface MeResponse {
  customer: CustomerInfo | null;
  access: { hasAccess: boolean; reason: string };
}

/**
 * Single source of truth for "is this browser a paying customer?" —
 * the server computes the verdict; the UI only renders it.
 * AccountView login/logout invalidate the ["customer-me"] key.
 */
export function useMe() {
  return useQuery<MeResponse>({
    queryKey: ["customer-me"],
    queryFn: async () => {
      const res = await fetch("/api/auth/customer/me");
      if (!res.ok) throw new Error("Session check fail");
      return res.json();
    },
    staleTime: 2 * 60 * 1000,
    retry: false,
  });
}

/**
 * Cache-key segment for every query whose answer depends on who is logged in
 * (plan-scoped facets, catalog, saved channels). Keeps a guest's cached answers from
 * being shown to the customer after login — and the other way round after logout.
 * `null` while the session is still resolving: keep those queries disabled.
 */
export function useSessionKey(): string | null {
  const me = useMe();
  if (me.isLoading) return null;
  return me.data?.customer?.id ?? "guest";
}
