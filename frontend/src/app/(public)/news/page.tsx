import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { NewsCard } from "@/components/site/news-card";
import { getNews, NEWS_CATEGORIES, type NewsCategory } from "@/lib/public-api";
import { enumT, siteT } from "@/lib/site-text";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 12;

export const metadata: Metadata = { title: siteT("nav.news") };

export default function NewsPage({ searchParams }: PageProps<"/news">) {
  return (
    <div className="grid gap-6">
      <h1 className="text-3xl font-bold">{siteT("nav.news")}</h1>
      <Suspense fallback={<p className="text-muted-foreground">…</p>}>
        <NewsList searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function NewsList({ searchParams }: { searchParams: PageProps<"/news">["searchParams"] }) {
  const sp = await searchParams;
  const category = NEWS_CATEGORIES.find((c) => c === sp.category);
  const page = Math.max(1, Number(sp.page) || 1);
  const news = await getNews(page, category, PAGE_SIZE);
  const pages = Math.max(1, Math.ceil(news.total / PAGE_SIZE));
  const href = (c?: NewsCategory, p = 1) => {
    const q = new URLSearchParams();
    if (c) q.set("category", c);
    if (p > 1) q.set("page", String(p));
    return `/news${q.size ? `?${q}` : ""}`;
  };
  const chip = (active: boolean) =>
    cn("rounded-full border px-3 py-1 text-sm", active ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted");

  return (
    <>
      <nav className="flex flex-wrap gap-2">
        <Link href={href()} className={chip(!category)}>
          {siteT("allCategories")}
        </Link>
        {NEWS_CATEGORIES.map((c) => (
          <Link key={c} href={href(c)} className={chip(category === c)}>
            {enumT(`newsCategory.${c}`)}
          </Link>
        ))}
      </nav>
      {news.items.length === 0 ? (
        <p className="text-muted-foreground">{siteT("noNews")}</p>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {news.items.map((p) => (
            <NewsCard key={p.slug} post={p} />
          ))}
        </div>
      )}
      {pages > 1 && (
        <div className="flex justify-between">
          {page > 1 ? (
            <Link href={href(category, page - 1)} className="text-primary hover:underline">
              {siteT("previous")}
            </Link>
          ) : (
            <span />
          )}
          {page < pages && (
            <Link href={href(category, page + 1)} className="text-primary hover:underline">
              {siteT("next")}
            </Link>
          )}
        </div>
      )}
    </>
  );
}
