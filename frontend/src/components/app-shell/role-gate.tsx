"use client";

import { useTranslations } from "next-intl";
import { type Role, useMe } from "@/lib/auth";

/**
 * Hides a page from roles that cannot use it. Cosmetic only: the API enforces roles.
 * ADMIN always passes, like on the backend.
 */
export function RoleGate({ roles, children }: { roles: Role[]; children: React.ReactNode }) {
  const t = useTranslations("errors");
  const { data: user } = useMe();
  if (!user) return null;
  if (user.role !== "ADMIN" && !roles.includes(user.role)) {
    return <p className="text-muted-foreground">{t("FORBIDDEN")}</p>;
  }
  return children;
}
