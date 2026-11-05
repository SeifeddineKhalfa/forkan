import { MapPin } from "lucide-react";
import type { Metadata } from "next";
import { getSite, safeMapUrl } from "@/lib/public-api";
import { siteT } from "@/lib/site-text";

export const metadata: Metadata = { title: siteT("venuesTitle") };

export default async function VenuesPage() {
  const site = await getSite();
  return (
    <div className="grid gap-6">
      <h1 className="text-3xl font-bold">{siteT("venuesTitle")}</h1>
      {site.venues.length === 0 && <p className="text-muted-foreground">{siteT("noVenues")}</p>}
      <div className="grid gap-6 md:grid-cols-2">
        {site.venues.map((v) => {
          const map = safeMapUrl(v.mapEmbedUrl);
          return (
            <section key={v.id} className="grid content-start gap-3 overflow-hidden rounded-xl border">
              {map && (
                <iframe
                  src={map}
                  title={v.name}
                  className="aspect-video w-full border-0"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  sandbox="allow-scripts allow-same-origin allow-popups"
                />
              )}
              <div className="grid gap-1 p-4">
                <h2 className="text-lg font-semibold">{v.name}</h2>
                {v.address && (
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <MapPin className="size-4" /> {v.address}
                  </p>
                )}
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${v.name} ${v.address ?? ""}`)}`}
                  target="_blank"
                  rel="noopener"
                  className="text-sm text-primary hover:underline"
                >
                  {siteT("openMap")}
                </a>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
