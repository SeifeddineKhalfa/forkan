"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";
import { RoleGate } from "@/components/app-shell/role-gate";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/api";
import { useFormat } from "@/lib/format";
import type { NewsAdminItem, Page } from "@/lib/types";
import { useDebounced } from "@/lib/use-debounced";
import { useErrorMessage } from "@/lib/use-error-message";
import { NEWS_CATEGORIES } from "./categories";

export default function NewsAdminPage() {
  return (
    <RoleGate roles={["STAFF"]}>
      <NewsAdmin />
    </RoleGate>
  );
}

function NewsAdmin() {
  const t = useTranslations("news");
  const tc = useTranslations("common");
  const te = useTranslations("enums");
  const fmt = useFormat();
  const errorMessage = useErrorMessage();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("ALL");
  const [category, setCategory] = useState("ALL");
  const query = useDebounced(q);
  const params = new URLSearchParams({ status, pageSize: "50" });
  if (category !== "ALL") params.set("category", category);
  if (query) params.set("q", query);
  const news = useQuery({
    queryKey: ["news", params.toString()],
    queryFn: () => api<Page<NewsAdminItem>>(`/news?${params}`),
    placeholderData: keepPreviousData,
  });

  return (
    <div className="grid gap-6">
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        actions={
          <Button asChild>
            <Link href="/news-admin/new">
              <Plus /> {t("add")}
            </Link>
          </Button>
        }
      />
      <div className="flex flex-wrap gap-2">
        <Input className="w-full sm:w-72" placeholder={t("searchPlaceholder")} value={q} onChange={(e) => setQ(e.target.value)} />
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-36" aria-label={t("status")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{tc("all")}</SelectItem>
            <SelectItem value="DRAFT">{te("newsStatus.DRAFT")}</SelectItem>
            <SelectItem value="PUBLISHED">{te("newsStatus.PUBLISHED")}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-40" aria-label={t("category")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t("category")}: {tc("all")}</SelectItem>
            {NEWS_CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>{te(`newsCategory.${c}`)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("postTitle")}</TableHead>
              <TableHead>{t("category")}</TableHead>
              <TableHead>{t("status")}</TableHead>
              <TableHead>{t("publishedAt")}</TableHead>
              <TableHead>{t("updated")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {news.isError && (
              <TableRow>
                <TableCell colSpan={5} className="text-destructive">{errorMessage(news.error)}</TableCell>
              </TableRow>
            )}
            {news.data?.items.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">{t("noNews")}</TableCell>
              </TableRow>
            )}
            {news.data?.items.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="max-w-96">
                  <Link href={`/news-admin/${p.id}`} className="font-medium hover:underline">{p.title}</Link>
                  {p.class && <span className="block text-xs text-muted-foreground">{p.class.name}</span>}
                </TableCell>
                <TableCell>{te(`newsCategory.${p.category}`)}</TableCell>
                <TableCell>
                  <Badge variant={p.status === "PUBLISHED" ? "default" : "secondary"}>{te(`newsStatus.${p.status}`)}</Badge>
                </TableCell>
                <TableCell className="whitespace-nowrap">{fmt.date(p.publishedAt)}</TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {fmt.date(p.updatedAt)} · {p.author.firstName}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
