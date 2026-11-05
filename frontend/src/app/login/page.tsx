import { Suspense } from "react";
import { StarMark } from "@/components/brand/star-mark";
import messages from "../../../messages/ar.json";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  const t = (k: "name" | "tagline") => messages.app[k];
  return (
    <main className="grid min-h-svh lg:grid-cols-[1.1fr_1fr]">
      {/* Brand panel: first in RTL, so it sits on the right. */}
      <section className="relative hidden flex-col justify-between overflow-hidden bg-sidebar p-12 text-sidebar-foreground girih-overlay lg:flex">
        <StarMark className="pointer-events-none absolute -bottom-24 -start-24 size-[28rem] text-sidebar-primary/10" />
        <StarMark className="size-14 text-sidebar-primary" />
        <div className="relative grid max-w-md gap-4">
          <h1 className="text-4xl leading-snug font-bold text-sidebar-accent-foreground">{t("name")}</h1>
          <p className="text-lg text-sidebar-foreground/75">{t("tagline")}</p>
        </div>
        <p className="relative font-heading text-2xl text-sidebar-primary">﴿ وَلَقَدْ يَسَّرْنَا الْقُرْآنَ لِلذِّكْرِ ﴾</p>
      </section>
      <div className="flex items-center justify-center bg-background p-4">
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
