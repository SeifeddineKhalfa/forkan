"use client";

import { useTranslations } from "next-intl";
import { ApiError } from "./api";

/** Maps an API error code to its Arabic message (messages/ar.json → errors.*). */
export function useErrorMessage() {
  const t = useTranslations("errors");
  return (error: unknown) => {
    if (!(error instanceof ApiError) || !t.has(error.code)) return t("UNKNOWN");
    // Only scalar params (e.g. capacity) are interpolated into messages.
    const params = Object.fromEntries(
      Object.entries(error.params ?? {}).filter(([, v]) => typeof v === "string" || typeof v === "number"),
    ) as Record<string, string | number>;
    return t(error.code, params);
  };
}
