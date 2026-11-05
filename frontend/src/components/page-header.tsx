import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { StarMark } from "@/components/brand/star-mark";
import { Button } from "@/components/ui/button";

export function PageHeader({
  title,
  subtitle,
  backHref,
  actions,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  backHref?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 border-b pb-5">
      <div className="flex items-start gap-3">
        {backHref ? (
          <Button asChild variant="outline" size="icon" className="mt-1">
            <Link href={backHref}>
              {/* In RTL "back" points right. */}
              <ArrowRight />
            </Link>
          </Button>
        ) : (
          <StarMark className="mt-1.5 hidden size-7 shrink-0 text-gold sm:block" />
        )}
        <div className="grid gap-1">
          <h1 className="text-2xl leading-tight font-bold md:text-3xl">{title}</h1>
          {subtitle && <div className="text-muted-foreground">{subtitle}</div>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
