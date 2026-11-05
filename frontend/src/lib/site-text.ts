import { createTranslator } from "next-intl";
import messages from "../../messages/ar.json";

/** Translators for server-rendered public pages (no request needed, so pages stay prerenderable). */
export const siteT = createTranslator({ locale: "ar", messages, namespace: "site" });
export const enumT = createTranslator({ locale: "ar", messages, namespace: "enums" });

const dateFormat = new Intl.DateTimeFormat("ar-TN", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC", numberingSystem: "latn" });
export const longDate = (iso: string | null | undefined) => (iso ? dateFormat.format(new Date(iso)) : "");

export const money = (amount: string | null) => {
  const n = Number(amount);
  return Number.isInteger(n) ? String(n) : n.toFixed(3);
};
