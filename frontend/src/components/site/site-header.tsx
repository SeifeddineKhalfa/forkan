import { Menu } from "lucide-react";
import Link from "next/link";
import { StarMark } from "@/components/brand/star-mark";
import { siteT } from "@/lib/site-text";

const LINKS = [
  ["/", "home"],
  ["/news", "news"],
  ["/schedule", "schedule"],
  ["/venues", "venues"],
  ["/membership", "membership"],
  ["/about", "about"],
] as const;

/** Works without JavaScript: the phone menu is a <details> element. */
export function SiteHeader({ name }: { name: string }) {
  const nav = (className: string) =>
    LINKS.map(([href, key]) => (
      <Link key={href} href={href} className={className}>
        {siteT(`nav.${key}`)}
      </Link>
    ));
  return (
    <header className="sticky top-0 z-20 border-b bg-background/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="flex items-center gap-2.5">
          <StarMark className="size-9 shrink-0 text-gold" />
          <span className="font-heading text-base leading-tight font-semibold text-primary md:text-lg">{name}</span>
        </Link>
        <nav className="hidden items-center gap-1 lg:flex">{nav("rounded-full px-3.5 py-2 text-sm font-medium text-foreground/80 hover:bg-secondary hover:text-secondary-foreground")}</nav>
        <div className="flex items-center gap-2">
          <Link href="/login" className="hidden rounded-full border border-primary/30 px-4 py-1.5 text-sm font-medium text-primary hover:bg-primary hover:text-primary-foreground sm:inline-block">
            {siteT("staff")}
          </Link>
          <details className="group relative lg:hidden">
            <summary className="flex size-10 cursor-pointer list-none items-center justify-center rounded-lg border bg-card" aria-label={siteT("menu")}>
              <Menu className="size-5" />
            </summary>
            <nav className="absolute end-0 top-12 grid w-60 gap-1 rounded-xl border bg-popover p-2 shadow-lg">
              {nav("rounded-lg px-3 py-2.5 text-sm hover:bg-secondary")}
              <Link href="/login" className="rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted">
                {siteT("staff")}
              </Link>
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}
