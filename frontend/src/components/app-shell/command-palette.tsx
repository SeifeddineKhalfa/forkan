"use client";

import { useQuery } from "@tanstack/react-query";
import { UserRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { api } from "@/lib/api";
import type { SessionUser } from "@/lib/auth";
import type { Page, StudentListItem } from "@/lib/types";
import { useDebounced } from "@/lib/use-debounced";
import { navFor } from "./nav";

/** Arabic-insensitive match: ignore hamza forms, ta marbuta and harakat. */
const fold = (s: string) =>
  s
    .replace(/[ً-ْـ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .toLowerCase();

/** Ctrl+K (or "/") jumps to any page, and for the office to any student. */
export function CommandPalette({ user, open, onOpenChange }: { user: SessionUser; open: boolean; onOpenChange: (v: boolean) => void }) {
  const t = useTranslations("shell");
  const tn = useTranslations("nav");
  const router = useRouter();
  const [q, setQ] = useState("");
  const debounced = useDebounced(q.trim(), 250);
  const office = user.role !== "TEACHER";

  const students = useQuery({
    queryKey: ["students", "palette", debounced],
    queryFn: () => api<Page<StudentListItem>>(`/students?pageSize=8&q=${encodeURIComponent(debounced)}`),
    enabled: open && office && debounced.length >= 2,
  });

  const pages = navFor(user.role)
    .filter((i) => !i.soon)
    .map((i) => ({ ...i, text: tn(user.role === "TEACHER" && i.teacherLabel ? i.teacherLabel : i.label) }))
    .filter((i) => !q.trim() || fold(i.text).includes(fold(q.trim())));

  const go = (href: string) => {
    onOpenChange(false);
    setQ("");
    router.push(href);
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title={t("search")} description={t("search")}>
      <Command shouldFilter={false}>
        <CommandInput placeholder={t("search")} value={q} onValueChange={setQ} />
        <CommandList>
          <CommandEmpty>{t("noResults")}</CommandEmpty>
          {pages.length > 0 && (
            <CommandGroup heading={t("pages")}>
              {pages.map((p) => (
                <CommandItem key={p.href} value={p.href} onSelect={() => go(p.href)}>
                  <p.icon /> {p.text}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {office && (students.data?.items.length ?? 0) > 0 && (
            <CommandGroup heading={t("students")}>
              {students.data!.items.map((s) => (
                <CommandItem key={s.id} value={`student-${s.id}`} onSelect={() => go(`/students/${s.id}`)}>
                  <UserRound />
                  <span className="flex-1">
                    {s.firstName} {s.lastName}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground" dir="ltr">
                    {s.code}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}

/** Opens the palette on Ctrl/⌘+K anywhere, or "/" when not typing in a field. */
export function usePaletteShortcut(setOpen: (fn: (v: boolean) => boolean) => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && (e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName));
      if ((e.key === "k" || e.key === "K") && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "/" && !typing) {
        e.preventDefault();
        setOpen(() => true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setOpen]);
}
