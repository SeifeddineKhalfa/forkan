import { MessageCircle } from "lucide-react";
import type { Metadata } from "next";
import { getSite, waNumber } from "@/lib/public-api";
import { longDate, money, siteT } from "@/lib/site-text";

export const metadata: Metadata = { title: siteT("membershipTitle"), description: siteT("membershipIntro") };

export default async function MembershipPage() {
  const site = await getSite();
  const m = site.membership;
  return (
    <div className="mx-auto grid max-w-3xl gap-6">
      <h1 className="text-3xl font-bold">{siteT("membershipTitle")}</h1>
      <p className="text-lg leading-loose">{siteT("membershipIntro")}</p>
      {m?.membershipFee ? (
        <div className="grid gap-2 rounded-xl border border-primary/30 bg-primary/5 p-5">
          <p className="text-xl font-semibold">{siteT("membershipFee", { year: m.name, amount: money(m.membershipFee) })}</p>
          {m.membershipWindowStart && m.membershipWindowEnd && (
            <p className="text-muted-foreground">
              {siteT("membershipWindow", { start: longDate(m.membershipWindowStart), end: longDate(m.membershipWindowEnd) })}
            </p>
          )}
        </div>
      ) : (
        <p className="text-muted-foreground">{siteT("noMembership")}</p>
      )}
      <p className="leading-loose">{siteT("membershipHow")}</p>
      {site.whatsappPhone && (
        <a
          href={`https://wa.me/${waNumber(site.whatsappPhone)}`}
          target="_blank"
          rel="noopener"
          className="inline-flex w-fit items-center gap-2 rounded-lg bg-primary px-5 py-2.5 font-medium text-primary-foreground hover:bg-primary/90"
        >
          <MessageCircle className="size-5" /> {siteT("heroContact")}
        </a>
      )}
    </div>
  );
}
