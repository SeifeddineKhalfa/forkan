import type { MetadataRoute } from "next";
import { getNews, postUrl, SITE_URL } from "@/lib/public-api";

/** Public pages + every published post (refreshed with the "public" cache). */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const news = await getNews(1, undefined, 1000);
  const pages = ["", "/news", "/schedule", "/venues", "/membership", "/about"].map((path) => ({
    url: `${SITE_URL}${path}`,
    changeFrequency: "weekly" as const,
    priority: path ? 0.7 : 1,
  }));
  return [
    ...pages,
    ...news.items.map((p) => ({ url: postUrl(p.slug), lastModified: p.publishedAt, changeFrequency: "monthly" as const, priority: 0.6 })),
  ];
}
