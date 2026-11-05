import Image from "next/image";
import Link from "next/link";
import { StarMark } from "@/components/brand/star-mark";
import { coverSrc, type PublicNewsItem } from "@/lib/public-api";
import { enumT, longDate } from "@/lib/site-text";

export function NewsCard({ post }: { post: PublicNewsItem }) {
  return (
    <Link href={`/news/${encodeURIComponent(post.slug)}`} className="group grid content-start overflow-hidden rounded-2xl border bg-card transition hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg">
      {post.hasCover ? (
        <Image src={coverSrc(post)} alt="" width={640} height={360} unoptimized className="aspect-video w-full object-cover" />
      ) : (
        <div className="flex aspect-video w-full items-center justify-center bg-sidebar text-sidebar-primary girih-overlay">
          <StarMark className="size-16 opacity-80" />
        </div>
      )}
      <div className="grid gap-2 p-4">
        <p className="text-xs font-medium text-accent-foreground">
          {enumT(`newsCategory.${post.category}`)} · {longDate(post.publishedAt)}
        </p>
        <h3 className="font-heading text-lg font-semibold leading-snug group-hover:text-primary">{post.title}</h3>
        {post.excerpt && <p className="line-clamp-3 text-sm text-muted-foreground">{post.excerpt}</p>}
      </div>
    </Link>
  );
}
