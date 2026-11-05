"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import type { SchoolSettings, TemplateKind } from "./types";

export const SETTINGS_KEY = ["settings"] as const;

export function useSettings() {
  return useQuery({ queryKey: SETTINGS_KEY, queryFn: () => api<SchoolSettings>("/settings"), staleTime: 60_000 });
}

/** "{{amount}}" → value; unknown placeholders are left visible so staff notices them. */
export function fillTemplate(template: string, values: Record<string, string>) {
  return template.replace(/\{\{(\w+)\}\}/g, (all, key: string) => values[key] ?? all);
}

/** Free click-to-send link (spec A5): WhatsApp opens with the text ready, staff presses Send. */
export function waLink(phone: string, text: string) {
  return `https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;
}

export interface PreparedMessage {
  kind: TemplateKind | "CUSTOM";
  phone: string;
  body: string;
  guardianId?: string;
  studentId?: string;
  paymentId?: string;
}

/**
 * Opens WhatsApp first (inside the click, so popup blockers allow it), then logs
 * the prepared message. Delivery cannot be confirmed.
 */
export function sendWhatsApp(message: PreparedMessage) {
  window.open(waLink(message.phone, message.body), "_blank", "noopener");
  return api("/messages", { method: "POST", body: message });
}

/** "15.500" → "15.500", "15" → "15" (WhatsApp text, no currency symbol). */
export const plainAmount = (amount: string | number) => {
  const n = Number(amount);
  return Number.isInteger(n) ? String(n) : n.toFixed(3);
};
