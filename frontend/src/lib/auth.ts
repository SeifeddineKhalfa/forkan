"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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

export function useMe() {
  return useQuery({
    queryKey: ME,
    queryFn: () => api<{ user: SessionUser }>("/auth/me").then((r) => r.user),
    retry: false,
    staleTime: 5 * 60_000,
  });
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
