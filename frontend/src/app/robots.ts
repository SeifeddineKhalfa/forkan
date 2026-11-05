import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/public-api";

/** Only the public site is indexed; the management app and the API are not. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/r/", "/login", "/dashboard", "/students", "/classes", "/teachers", "/attendance", "/hifz", "/fees", "/payments", "/memberships", "/news-admin", "/imports", "/users", "/settings", "/change-password"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
