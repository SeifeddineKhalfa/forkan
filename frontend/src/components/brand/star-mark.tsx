import { cn } from "@/lib/utils";

/**
 * The association's mark: a rub el hizb (۞), the star that opens every thumn in
 * the mushaf — the unit the hifz tracker counts in.
 */
export function StarMark({ className, ...props }: React.ComponentProps<"svg">) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden className={cn("size-8", className)} {...props}>
      <g fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round">
        <rect x="11" y="11" width="26" height="26" rx="1.5" />
        <rect x="11" y="11" width="26" height="26" rx="1.5" transform="rotate(45 24 24)" />
        <circle cx="24" cy="24" r="6.5" />
      </g>
      <circle cx="24" cy="24" r="2.2" fill="currentColor" />
    </svg>
  );
}

/** Mark + name, as used in the sidebar, login and public header. */
export function BrandLockup({ name, sub, className }: { name: string; sub?: string; className?: string }) {
  return (
    <span className={cn("flex items-center gap-3", className)}>
      <StarMark className="size-10 shrink-0 text-gold" />
      <span className="grid min-w-0 leading-tight">
        <span className="truncate font-heading text-base font-semibold">{name}</span>
        {sub && <span className="truncate text-xs opacity-70">{sub}</span>}
      </span>
    </span>
  );
}
