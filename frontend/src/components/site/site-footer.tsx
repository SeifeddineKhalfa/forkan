import Link from "next/link";
import { StarMark } from "@/components/brand/star-mark";
import type { PublicSite } from "@/lib/public-api";
import { waNumber } from "@/lib/public-api";
import { siteT } from "@/lib/site-text";

export function SiteFooter({ site }: { site: PublicSite }) {
  const social = Object.entries(site.socialLinks).filter(([, url]) => url);
  return (
    <footer className="mt-20 bg-sidebar text-sidebar-foreground girih-overlay">
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 text-sm sm:grid-cols-3">
        <div className="grid content-start gap-1">
          <StarMark className="mb-2 size-10 text-sidebar-primary" />
          <p className="font-heading text-base font-semibold text-sidebar-accent-foreground">{site.name}</p>
          {site.address && <p className="text-sidebar-foreground/70">{site.address}</p>}
        </div>
        <div className="grid content-start gap-1">
          <p className="font-semibold text-sidebar-primary">{siteT("contactTitle")}</p>
          {site.contactPhone && (
            <a href={`tel:${site.contactPhone}`} className="text-sidebar-foreground/70 hover:underline" dir="ltr">
              {site.contactPhone}
            </a>
          )}
          {site.whatsappPhone && (
            <a href={`https://wa.me/${waNumber(site.whatsappPhone)}`} className="text-sidebar-foreground/70 hover:underline" target="_blank" rel="noopener">
              {siteT("whatsapp")}
            </a>
          )}
        </div>
        <div className="grid content-start gap-1">
          {social.length > 0 && <p className="font-semibold text-sidebar-primary">{siteT("followUs")}</p>}
          {social.map(([key, url]) => (
            <a key={key} href={url} className="text-sidebar-foreground/70 capitalize hover:underline" target="_blank" rel="noopener" dir="ltr">
              {key}
            </a>
          ))}
          <Link href="/login" className="mt-2 text-sidebar-foreground/70 hover:underline">
            {siteT("staff")}
          </Link>
        </div>
      </div>
      <p className="border-t border-sidebar-border py-5 text-center text-xs text-sidebar-foreground/60">
        {siteT("rights", { name: site.name })}
      </p>
    </footer>
  );
}
