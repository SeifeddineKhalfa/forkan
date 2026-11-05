import Link from "next/link";
import { siteT } from "@/lib/site-text";

export default function PublicNotFound() {
  return (
    <div className="grid justify-items-center gap-3 py-16 text-center">
      <h1 className="text-2xl font-bold">{siteT("notFoundTitle")}</h1>
      <p className="text-muted-foreground">{siteT("notFoundBody")}</p>
      <Link href="/news" className="text-primary hover:underline">
        {siteT("backToNews")}
      </Link>
    </div>
  );
}
