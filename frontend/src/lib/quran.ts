"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import type { QuranMeta, Riwaya } from "./types";

/** Reference data per riwaya: changes only when the school reloads it. */
export function useQuranMeta(riwaya: Riwaya = "QALUN") {
  return useQuery({
    queryKey: ["quran", riwaya],
    queryFn: () => api<QuranMeta>(`/quran/meta?riwaya=${riwaya}`),
    staleTime: Infinity,
  });
}

/** Thumn number (1..480) ⇄ hizb + thumn of hizb. */
export const toThumn = (hizb: number, thumn: number) => (hizb - 1) * 8 + thumn;
export const ofThumn = (n: number) => ({ hizb: Math.ceil(n / 8), thumn: ((n - 1) % 8) + 1 });
