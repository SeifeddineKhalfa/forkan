import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ShareButtons } from "@/components/site/share-buttons";
import { coverSrc, getPost, postUrl, SITE_URL } from "@/lib/public-api";
import { enumT, longDate, siteT } from "@/lib/site-text";

export async function generateMetadata({ params }: PageProps<"/news/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPost(decodeURIComponent(slug));
  if (!post) return { title: siteT("notFoundTitle"), robots: { index: false } };
  const image = post.hasCover ? `${SITE_URL}${coverSrc(post)}` : undefined;
  return {
    title: post.title,
    description: post.excerpt ?? undefined,
    alternates: { canonical: postUrl(post.slug) },
    openGraph: {
      type: "article",
      title: post.title,
      description: post.excerpt ?? undefined,
      url: postUrl(post.slug),
      publishedTime: post.publishedAt,
      locale: "ar_TN",
      images: image ? [{ url: image }] : undefined,
    },
  };
}

export default function PostPage({ params }: PageProps<"/news/[slug]">) {
  return (
    <Suspense fallback={<p className="text-muted-foreground">…</p>}>
      <Post params={params} />
    </Suspense>
  );
}

async function Post({ params }: { params: PageProps<"/news/[slug]">["params"] }) {
  const { slug } = await params;
  // Drafts and unpublished posts answer 404 from the API (spec B, Slice 7).
  const post = await getPost(decodeURIComponent(slug));
  if (!post) notFound();
  return (
    <article className="mx-auto grid max-w-3xl gap-6">
      <Link href="/news" className="text-sm text-primary hover:underline">
        {siteT("backToNews")}
      </Link>
      <header className="grid gap-2">
        <p className="text-sm text-muted-foreground">
          {enumT(`newsCategory.${post.category}`)} · {longDate(post.publishedAt)}
          {post.class && ` · ${post.class.name}`}
        </p>
        <h1 className="text-3xl font-bold leading-tight">{post.title}</h1>
      </header>
      {post.hasCover && (
        <Image src={coverSrc(post)} alt="" width={1200} height={675} unoptimized priority className="w-full rounded-xl object-cover" />
      )}
      {/* bodyHtml comes from the API's whitelist renderer, never raw user HTML. */}
      <div className="prose-news" dangerouslySetInnerHTML={{ __html: post.bodyHtml }} />
      <div className="border-t pt-4">
        <p className="mb-2 text-sm font-medium">{siteT("share")}</p>
        <ShareButtons url={postUrl(post.slug)} title={post.title} text={post.text} />
      </div>
    </article>
  );
}
