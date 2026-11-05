import { cacheLife, cacheTag } from "next/cache";
import type { Audience, Day, GenderPolicy, SlotKind } from "./types";

/**
 * Server-side reads for the public website. Cached for a minute and tagged "public":
 * the API expires the tag (POST /revalidate) as soon as news or settings change.
 */

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:3001";
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");

export type NewsCategory = "ANNOUNCEMENT" | "ACTIVITY" | "THANKS" | "CONDOLENCE" | "ASSOCIATION";
export const NEWS_CATEGORIES: NewsCategory[] = ["ANNOUNCEMENT", "ACTIVITY", "THANKS", "CONDOLENCE", "ASSOCIATION"];

export interface PublicSite {
  name: string;
  address: string | null;
  about: string | null;
  contactPhone: string | null;
  whatsappPhone: string | null;
  mapEmbedUrl: string | null;
  socialLinks: { facebook?: string; instagram?: string; youtube?: string };
  membership: { name: string; membershipFee: string | null; membershipWindowStart: string | null; membershipWindowEnd: string | null } | null;
  venues: { id: string; name: string; address: string | null; mapEmbedUrl: string | null }[];
}

export interface PublicNewsItem {
  slug: string;
  title: string;
  excerpt: string | null;
  category: NewsCategory;
  publishedAt: string;
  hasCover: boolean;
  coverVersion: number | null;
  class: { name: string } | null;
}

export interface PublicPost extends PublicNewsItem {
  bodyHtml: string;
  text: string;
  updatedAt: string;
}

export interface PublicClass {
  id: string;
  name: string;
  quranScope: string | null;
  audience: Audience;
  genderPolicy: GenderPolicy;
  scheduleSlots: { day: Day; kind: SlotKind; startTime: string; endTime: string; timeLabel: string | null }[];
  venue: { id: string; name: string; room: string } | null;
  teachers: { role: "MAIN" | "SUPERVISOR"; teacher: { title: string | null; firstName: string; lastName: string } }[];
}

/** Cached GET; null on 404. When the API is down (or absent at build time) the fallback is used. */
async function get<T>(path: string, fallback: T): Promise<T | null> {
  "use cache";
  cacheLife("minutes");
  cacheTag("public");
  try {
    const res = await fetch(`${BACKEND_URL}/api/public${path}`);
    if (res.status === 404) return null;
    if (!res.ok) return fallback;
    return (await res.json()) as T;
  } catch {
    return fallback;
  }
}

const EMPTY_SITE: PublicSite = {
  name: "الجمعية القرآنية بسليمان الفرقان",
  address: null,
  about: null,
  contactPhone: null,
  whatsappPhone: null,
  mapEmbedUrl: null,
  socialLinks: {},
  membership: null,
  venues: [],
};

export const getSite = async () => (await get<PublicSite>("/site", EMPTY_SITE)) ?? EMPTY_SITE;
export const getSchedule = async () => (await get<PublicClass[]>("/schedule", [])) ?? [];
export const getNews = async (page = 1, category?: NewsCategory, pageSize = 12) => {
  const q = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (category) q.set("category", category);
  return (await get<{ items: PublicNewsItem[]; total: number }>(`/news?${q}`, { items: [], total: 0 })) ?? { items: [], total: 0 };
};
export const getPost = (slug: string) => get<PublicPost | null>(`/news/${encodeURIComponent(slug)}`, null);

export const coverSrc = (p: { slug: string; coverVersion: number | null }) =>
  `/api/public/news/${encodeURIComponent(p.slug)}/cover?v=${p.coverVersion}`;
export const postUrl = (slug: string) => `${SITE_URL}/news/${encodeURIComponent(slug)}`;

/** Only Google Maps embeds are framed on the public site. */
export const safeMapUrl = (url: string | null) => (url && /^https:\/\/(www\.)?google\.[a-z.]+\/maps\/embed/.test(url) ? url : null);

export const waNumber = (phone: string) => phone.replace(/\D/g, "");
