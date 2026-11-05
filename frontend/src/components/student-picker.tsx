"use client";

import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { api } from "@/lib/api";
import type { Page, StudentListItem } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Searchable student combobox (server-side search by name, code or guardian phone). */
export function StudentPicker({
  value,
  onChange,
}: {
  value: StudentListItem | null;
  onChange: (s: StudentListItem | null) => void;
}) {
  const t = useTranslations("students");
  const tc = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const results = useQuery({
    queryKey: ["students", "picker", q],
    queryFn: () => api<Page<StudentListItem>>(`/students?pageSize=15&q=${encodeURIComponent(q)}`),
    enabled: open && q.trim().length >= 2,
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between font-normal">
          {value ? `${value.firstName} ${value.lastName} · ${value.code}` : t("searchPlaceholder")}
          <ChevronsUpDown className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder={t("searchPlaceholder")} value={q} onValueChange={setQ} />
          <CommandList>
            <CommandEmpty>{results.isFetching ? tc("loading") : tc("noData")}</CommandEmpty>
            {results.data?.items.map((s) => (
              <CommandItem
                key={s.id}
                value={s.id}
                onSelect={() => {
                  onChange(s);
                  setOpen(false);
                }}
              >
                <Check className={cn("size-4", value?.id === s.id ? "opacity-100" : "opacity-0")} />
                <span className="flex-1">
                  {s.firstName} {s.lastName}
                </span>
                <span className="text-xs text-muted-foreground" dir="ltr">{s.code}</span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
