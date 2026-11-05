"use client";

import { useFormatter, useTranslations } from "next-intl";

/** "2026-11-03T00:00:00.000Z" → "2026-11-03" (value for <input type="date">). */
export const toDateInput = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : "");

export function ageFrom(iso: string, now = new Date()) {
  const b = new Date(iso);
  let age = now.getFullYear() - b.getUTCFullYear();
  if (now.getMonth() < b.getUTCMonth() || (now.getMonth() === b.getUTCMonth() && now.getDate() < b.getUTCDate())) age--;
  return age;
}

/** Shared display helpers bound to the current locale. */
export function useFormat() {
  const format = useFormatter();
  const tc = useTranslations("common");
  return {
    date: (iso: string | null | undefined) =>
      iso ? format.dateTime(new Date(iso), { dateStyle: "medium", timeZone: "UTC" }) : "—",
    /** TND with 3 decimals only when needed: "15 د.ت", "12.500 د.ت". */
    money: (amount: string | number | null | undefined) => {
      if (amount === null || amount === undefined) return tc("free");
      const n = Number(amount);
      const text = Number.isInteger(n) ? String(n) : n.toFixed(3);
      return `${text} ${tc("currency")}`;
    },
    fee: (amount: string | null | undefined) =>
      amount === null || amount === undefined || Number(amount) === 0
        ? tc("free")
        : tc("perMonth", { amount: Number.isInteger(Number(amount)) ? Number(amount) : Number(amount).toFixed(3) }),
  };
}
