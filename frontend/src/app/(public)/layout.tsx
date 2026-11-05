import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { getSite } from "@/lib/public-api";

export default async function PublicLayout({ children }: LayoutProps<"/">) {
  const site = await getSite();
  return (
    <div className="flex min-h-svh flex-col">
      <SiteHeader name={site.name} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
      <SiteFooter site={site} />
    </div>
  );
}
