"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";
import { api } from "./api";

export type Role = "ADMIN" | "STAFF" | "TEACHER";

export interface SessionUser {
  id: string;
  email: string | null;
  phone: string | null;
  role: Role;
  firstName: string;
  lastName: string;
  mustChangePassword: boolean;
}

const ME = ["auth", "me"] as const;

const subscribeNothing = () => () => {};

/** false on the server and during hydration, true afterwards. */
export function useHydrated() {
  return useSyncExternalStore(
    subscribeNothing,
    () => true,
    () => false,
  );
}

/**
 * The logged-in user. The session is only known in the browser, so until hydration is over
 * `data` stays undefined, exactly as on the server: branching on the role (RoleGate, office-only
 * buttons) then renders the same markup on both sides and React reports no hydration mismatch.
 */
export function useMe() {
  const hydrated = useHydrated();
  const query = useQuery({
    queryKey: ME,
    queryFn: () => api<{ user: SessionUser }>("/auth/me").then((r) => r.user),
    retry: false,
    staleTime: 5 * 60_000,
  });
  return hydrated ? query : ({ ...query, data: undefined, error: null, isError: false } as unknown as typeof query);
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { login: string; password: string }) =>
      api<{ user: SessionUser }>("/auth/login", { method: "POST", body }).then((r) => r.user),
    onSuccess: (user) => qc.setQueryData(ME, user),
  });
}

export function useChangePassword() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { currentPassword: string; newPassword: string }) =>
      api<{ user: SessionUser }>("/auth/change-password", { method: "POST", body }).then((r) => r.user),
    onSuccess: (user) => qc.setQueryData(ME, user),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<void>("/auth/logout", { method: "POST" }),
    onSettled: () => qc.clear(),
  });
}
