"use client";

import { ExternalLink, KeyRound, LogOut, MoreHorizontal, PanelRightClose, PanelRightOpen, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { StarMark } from "@/components/brand/star-mark";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api";
import { type SessionUser, useLogout, useMe } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { CommandPalette, usePaletteShortcut } from "./command-palette";
import { isActive, type NavItem, navSections, tabBarFor } from "./nav";
import { ThemeToggle } from "./theme-toggle";

/* The desktop rail's collapsed state, remembered per browser (best effort). */
const RAIL_KEY = "forkan.rail";
const railListeners = new Set<() => void>();
const readRail = () => {
  try {
    return localStorage.getItem(RAIL_KEY) === "1";
  } catch {
    return false;
  }
};
function useRail() {
  const collapsed = useSyncExternalStore(
    (cb) => {
      railListeners.add(cb);
      return () => railListeners.delete(cb);
    },
    readRail,
    () => false,
  );
  const toggle = () => {
    try {
      localStorage.setItem(RAIL_KEY, collapsed ? "0" : "1");
    } catch {}
    railListeners.forEach((l) => l());
  };
  return [collapsed, toggle] as const;
}

function useLabel(user: SessionUser) {
  const t = useTranslations("nav");
  return (item: NavItem) => t(user.role === "TEACHER" && item.teacherLabel ? item.teacherLabel : item.label);
}

function NavLinks({ user, collapsed = false, onNavigate }: { user: SessionUser; collapsed?: boolean; onNavigate?: () => void }) {
  const t = useTranslations("nav");
  const tc = useTranslations("common");
  const label = useLabel(user);
  const pathname = usePathname();

  return (
    <nav className="grid gap-5">
      {navSections(user.role).map(({ group, items }) => (
        <div key={group ?? "main"} className="grid gap-0.5">
          {group &&
            (collapsed ? (
              <span className="mx-auto mb-1 h-px w-6 bg-sidebar-border" aria-hidden />
            ) : (
              <p className="mb-1 px-3 text-[0.7rem] font-semibold tracking-wide text-sidebar-foreground/50">{t(`groups.${group}`)}</p>
            ))}
          {items.map((item) => {
            const text = label(item);
            const active = isActive(pathname, item.href);
            const cls = cn(
              "relative flex h-10 items-center gap-3 rounded-lg px-3 text-sm transition-colors",
              collapsed && "justify-center px-0",
            );
            const content = (
              <>
                <item.icon className={cn("size-[1.15rem] shrink-0", active && "text-sidebar-primary")} aria-hidden />
                {!collapsed && <span className="flex-1 truncate">{text}</span>}
                {!collapsed && item.soon && <Badge variant="secondary">{tc("soon")}</Badge>}
              </>
            );
            return item.soon ? (
              <span key={item.href} aria-disabled title={text} className={cn(cls, "cursor-default opacity-45")}>
                {content}
              </span>
            ) : (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                title={collapsed ? text : undefined}
                aria-label={collapsed ? text : undefined}
                aria-current={active ? "page" : undefined}
                className={cn(
                  cls,
                  active
                    ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground before:absolute before:inset-y-2 before:start-0 before:w-1 before:rounded-full before:bg-sidebar-primary"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                )}
              >
                {content}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

function UserMenu({ user }: { user: SessionUser }) {
  const t = useTranslations("nav");
  const tr = useTranslations("roles");
  const ts = useTranslations("shell");
  const router = useRouter();
  const logout = useLogout();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-10 gap-2 px-1.5 sm:px-2">
          <span className="flex size-8 items-center justify-center rounded-full bg-gold/25 font-heading text-sm font-semibold text-accent-foreground ring-1 ring-gold/50">
            {user.firstName.slice(0, 1)}
          </span>
          <span className="hidden text-start sm:block">
            <span className="block text-sm leading-tight">
              {user.firstName} {user.lastName}
            </span>
            <span className="block text-xs text-muted-foreground">{tr(user.role)}</span>
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">{user.email ?? user.phone}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <a href="/" target="_blank" rel="noopener">
            <ExternalLink /> {ts("viewSite")}
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => router.push("/change-password")}>
          <KeyRound /> {t("changePassword")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onSelect={() => logout.mutate(undefined, { onSettled: () => router.replace("/login") })}
        >
          <LogOut /> {t("logout")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Phone tab bar: the four destinations a role uses most, plus the full menu. */
function TabBar({ user, onMore }: { user: SessionUser; onMore: () => void }) {
  const t = useTranslations("nav");
  const label = useLabel(user);
  const pathname = usePathname();
  const tabs = tabBarFor(user.role);
  const inTabs = tabs.some((i) => isActive(pathname, i.href));
  const cell = "flex h-full flex-col items-center justify-center gap-1 text-[0.7rem] font-medium";
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 grid h-16 grid-cols-5 border-t bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden print:hidden">
      {tabs.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(cell, active ? "text-primary" : "text-muted-foreground")}
          >
            <span className={cn("flex h-7 w-12 items-center justify-center rounded-full transition-colors", active && "bg-secondary")}>
              <item.icon className="size-5" aria-hidden />
            </span>
            <span className="max-w-full truncate px-1">{label(item)}</span>
          </Link>
        );
      })}
      <button type="button" onClick={onMore} className={cn(cell, inTabs ? "text-muted-foreground" : "text-primary")}>
        <span className={cn("flex h-7 w-12 items-center justify-center rounded-full", !inTabs && "bg-secondary")}>
          <MoreHorizontal className="size-5" aria-hidden />
        </span>
        {t("more")}
      </button>
    </nav>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const tApp = useTranslations("app");
  const tc = useTranslations("common");
  const ts = useTranslations("shell");
  const router = useRouter();
  const pathname = usePathname();
  const me = useMe();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [collapsed, toggleRail] = useRail();
  usePaletteShortcut(useCallback((fn: (v: boolean) => boolean) => setPaletteOpen(fn), []));

  const unauthenticated = me.error instanceof ApiError && me.error.status === 401;
  const mustChange = me.data?.mustChangePassword;

  useEffect(() => {
    if (unauthenticated) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    else if (mustChange) router.replace("/change-password");
  }, [unauthenticated, mustChange, pathname, router]);

  // The page always renders (pages read the session themselves); only the chrome
  // waits for it. Data is protected by the API, and the proxy keeps out visitors
  // without a session.
  const user = me.data && !mustChange ? me.data : null;
  const navPlaceholder = (
    <div className="grid gap-2" aria-busy>
      <Skeleton className="h-9 bg-sidebar-accent" />
      <Skeleton className="h-9 bg-sidebar-accent" />
      <Skeleton className="h-9 bg-sidebar-accent" />
      <span className="sr-only">{tc("loading")}</span>
    </div>
  );

  return (
    <div className="flex min-h-svh">
      <aside
        className={cn(
          "sticky top-0 hidden h-svh shrink-0 flex-col bg-sidebar text-sidebar-foreground transition-[width] duration-200 girih-overlay lg:flex print:hidden",
          collapsed ? "w-[4.5rem]" : "w-64",
        )}
      >
        <Link href="/dashboard" className={cn("flex items-center gap-3 px-4 pt-5 pb-6", collapsed && "justify-center px-0")}>
          <StarMark className="size-10 shrink-0 text-sidebar-primary" />
          {!collapsed && (
            <span className="grid leading-tight">
              <span className="font-heading text-xl font-semibold text-sidebar-accent-foreground">{tApp("shortName")}</span>
              <span className="text-[0.7rem] text-sidebar-foreground/60">{tApp("tagline")}</span>
            </span>
          )}
        </Link>
        <div className={cn("flex-1 overflow-y-auto pb-4", collapsed ? "px-2" : "px-3")}>
          {user ? <NavLinks user={user} collapsed={collapsed} /> : navPlaceholder}
        </div>
        <button
          type="button"
          onClick={toggleRail}
          className={cn(
            "m-3 flex h-9 items-center gap-2 rounded-lg px-3 text-xs text-sidebar-foreground/60 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
            collapsed && "justify-center px-0",
          )}
          aria-label={collapsed ? ts("expand") : ts("collapse")}
          title={collapsed ? ts("expand") : ts("collapse")}
        >
          {/* In RTL the rail sits on the right, so "close" points right. */}
          {collapsed ? <PanelRightOpen className="size-4" /> : <PanelRightClose className="size-4" />}
          {!collapsed && ts("collapse")}
        </button>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-2 border-b bg-background/85 px-3 backdrop-blur md:px-6 print:hidden">
          <Link href="/dashboard" className="flex items-center gap-2 lg:hidden">
            <StarMark className="size-8 text-primary" />
            <span className="font-heading text-lg font-semibold">{tApp("shortName")}</span>
          </Link>
          {user && (
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className="ms-auto flex h-10 items-center gap-2 rounded-lg border bg-card px-3 text-sm text-muted-foreground shadow-xs transition-colors hover:border-primary/40 hover:text-foreground lg:ms-0 lg:w-80"
              aria-label={ts("search")}
            >
              <Search className="size-4" />
              <span className="hidden flex-1 text-start sm:inline">{ts("search")}</span>
              <kbd className="hidden rounded border bg-muted px-1.5 font-sans text-[0.7rem] lg:inline" dir="ltr">
                Ctrl K
              </kbd>
            </button>
          )}
          <div className={cn("flex items-center gap-1", user ? "lg:ms-auto" : "ms-auto")}>
            <ThemeToggle />
            {user ? <UserMenu user={user} /> : <Skeleton className="size-8 rounded-full" />}
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 p-4 pb-24 md:p-6 md:pb-24 lg:pb-8 print:p-0">{children}</main>
      </div>

      {user && (
        <>
          <TabBar user={user} onMore={() => setMobileOpen(true)} />
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetContent side="right" className="w-72 overflow-y-auto border-0 bg-sidebar p-4 text-sidebar-foreground">
              <SheetTitle className="mb-4 flex items-center gap-3 text-sidebar-accent-foreground">
                <StarMark className="size-9 text-sidebar-primary" />
                <span className="font-heading">{tApp("shortName")}</span>
              </SheetTitle>
              <NavLinks user={user} onNavigate={() => setMobileOpen(false)} />
            </SheetContent>
          </Sheet>
          <CommandPalette user={user} open={paletteOpen} onOpenChange={setPaletteOpen} />
        </>
      )}
    </div>
  );
}
