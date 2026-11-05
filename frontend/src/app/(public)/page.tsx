import { CalendarDays, MessageCircle } from "lucide-react";
import Link from "next/link";
import { StarMark } from "@/components/brand/star-mark";
import { NewsCard } from "@/components/site/news-card";
import { getNews, getSite, waNumber } from "@/lib/public-api";
import { siteT } from "@/lib/site-text";
import messages from "../../../messages/ar.json";

export default async function HomePage() {
  const [site, news] = await Promise.all([getSite(), getNews(1, undefined, 6)]);
  return (
    <div className="grid gap-12">
      <section className="relative grid gap-6 overflow-hidden rounded-3xl bg-sidebar px-6 py-14 text-center text-sidebar-foreground girih-overlay md:py-20">
        <StarMark className="pointer-events-none absolute -end-20 -top-20 size-80 text-sidebar-primary/10" />
        <StarMark className="pointer-events-none absolute -start-16 -bottom-24 size-72 text-sidebar-primary/10" />
        <StarMark className="relative mx-auto size-14 text-sidebar-primary" />
        <h1 className="relative text-3xl leading-tight font-bold text-sidebar-accent-foreground md:text-5xl">{site.name}</h1>
        <p className="relative mx-auto max-w-2xl text-lg text-sidebar-foreground/80">{messages.public.heroBody}</p>
        <div className="relative flex flex-wrap justify-center gap-3">
          <Link
            href="/schedule"
            className="inline-flex h-12 items-center gap-2 rounded-full bg-sidebar-primary px-6 font-semibold text-sidebar-primary-foreground shadow-sm hover:brightness-105"
          >
            <CalendarDays className="size-5" /> {siteT("heroCta")}
          </Link>
          {site.whatsappPhone && (
            <a
              href={`https://wa.me/${waNumber(site.whatsappPhone)}`}
              target="_blank"
              rel="noopener"
              className="inline-flex h-12 items-center gap-2 rounded-full border border-sidebar-border bg-sidebar-accent px-6 font-medium text-sidebar-accent-foreground hover:bg-sidebar-accent/70"
            >
              <MessageCircle className="size-5" /> {siteT("heroContact")}
            </a>
          )}
        </div>
      </section>

      <section className="grid gap-5">
        <div className="flex items-end justify-between gap-2">
          <h2 className="flex items-center gap-2 text-2xl font-bold">
            <StarMark className="size-6 text-gold" /> {siteT("latest")}
          </h2>
          <Link href="/news" className="text-sm text-primary hover:underline">
            {siteT("allNews")}
          </Link>
        </div>
        {news.items.length === 0 ? (
          <p className="text-muted-foreground">{siteT("noNews")}</p>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {news.items.map((p) => (
              <NewsCard key={p.slug} post={p} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
