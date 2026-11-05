import { Suspense } from "react";
import { AppShell } from "@/components/app-shell/app-shell";
import { Skeleton } from "@/components/ui/skeleton";

function ShellFallback() {
  return (
    <div className="flex min-h-svh">
      <div className="hidden w-64 shrink-0 bg-sidebar lg:block" />
      <div className="flex-1 p-6">
        <Skeleton className="h-8 w-56" />
      </div>
    </div>
  );
}

// The shell reads the URL (active menu item, login redirect), which is only known at
// request time; the Suspense boundary lets Next prerender the fallback instead of blocking.
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <Suspense fallback={<ShellFallback />}>
      <AppShell>{children}</AppShell>
    </Suspense>
  );
}
