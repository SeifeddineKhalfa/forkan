import type { Metadata } from "next";
import { getSite, safeMapUrl, waNumber } from "@/lib/public-api";
import { siteT } from "@/lib/site-text";

export const metadata: Metadata = { title: siteT("aboutTitle") };

export default async function AboutPage() {
  const site = await getSite();
  const map = safeMapUrl(site.mapEmbedUrl);
  const social = Object.entries(site.socialLinks).filter(([, url]) => url);
  return (
    <div className="mx-auto grid max-w-3xl gap-8">
      <section className="grid gap-4">
        <h1 className="text-3xl font-bold">{siteT("aboutTitle")}</h1>
        {/* Plain text from settings: one paragraph per line. */}
        {(site.about ?? "").split(/\n+/).filter(Boolean).map((p, i) => (
          <p key={i} className="text-lg leading-loose">
            {p}
          </p>
        ))}
      </section>

      <section className="grid gap-3 rounded-xl border p-5">
        <h2 className="text-xl font-semibold">{siteT("contactTitle")}</h2>
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2">
          {site.address && (
            <>
              <dt className="text-muted-foreground">{siteT("address")}</dt>
              <dd>{site.address}</dd>
            </>
          )}
          {site.contactPhone && (
            <>
              <dt className="text-muted-foreground">{siteT("phone")}</dt>
              <dd>
                <a href={`tel:${site.contactPhone}`} dir="ltr" className="hover:underline">
                  {site.contactPhone}
                </a>
              </dd>
            </>
          )}
          {site.whatsappPhone && (
            <>
              <dt className="text-muted-foreground">{siteT("whatsapp")}</dt>
              <dd>
                <a href={`https://wa.me/${waNumber(site.whatsappPhone)}`} target="_blank" rel="noopener" dir="ltr" className="text-primary hover:underline">
                  {site.whatsappPhone}
                </a>
              </dd>
            </>
          )}
          {social.length > 0 && (
            <>
              <dt className="text-muted-foreground">{siteT("followUs")}</dt>
              <dd className="flex flex-wrap gap-3">
                {social.map(([key, url]) => (
                  <a key={key} href={url} target="_blank" rel="noopener" className="capitalize text-primary hover:underline" dir="ltr">
                    {key}
                  </a>
                ))}
              </dd>
            </>
          )}
        </dl>
        {map && (
          <iframe
            src={map}
            title={site.name}
            className="mt-2 aspect-video w-full rounded-lg border-0"
            loading="lazy"
            sandbox="allow-scripts allow-same-origin allow-popups"
          />
        )}
      </section>
    </div>
  );
}
