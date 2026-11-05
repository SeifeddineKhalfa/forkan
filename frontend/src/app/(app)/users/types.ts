import type { SessionUser } from "@/lib/auth";

export interface ListedUser extends SessionUser {
  isActive: boolean;
  lastLoginAt: string | null;
}

export const USERS_KEY = ["users"] as const;
