"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronLeft, Phone, Plus, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { RoleGate } from "@/components/app-shell/role-gate";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/api";
import { ageFrom } from "@/lib/format";
import type { ClassItem, Page, StudentListItem, StudentStatus } from "@/lib/types";
import { useDebounced } from "@/lib/use-debounced";
import { useErrorMessage } from "@/lib/use-error-message";

const ALL = "ALL";
const PAGE_SIZE = 25;

export default function StudentsPage() {
  return (
    <RoleGate roles={["STAFF"]}>
      <StudentsList />
    </RoleGate>
  );
}

function StudentsList() {
  const t = useTranslations("students");
  const tc = useTranslations("common");
  const te = useTranslations("enums");
  const errorMessage = useErrorMessage();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<StudentStatus | typeof ALL>("ACTIVE");
  const [gender, setGender] = useState<string>(ALL);
  const [classId, setClassId] = useState<string>(ALL);
  const [page, setPage] = useState(1);
  const query = useDebounced(q);
  // Changing a filter goes back to the first page.
  const filter = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
  };

  const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE), status });
  if (query) params.set("q", query);
  if (gender !== ALL) params.set("gender", gender);
  if (classId !== ALL) params.set("classId", classId);

  const students = useQuery({
    queryKey: ["students", params.toString()],
    queryFn: () => api<Page<StudentListItem>>(`/students?${params}`),
    placeholderData: keepPreviousData,
  });
  const classes = useQuery({ queryKey: ["classes", ""], queryFn: () => api<ClassItem[]>("/classes") });
  const pages = students.data ? Math.max(1, Math.ceil(students.data.total / PAGE_SIZE)) : 1;

  return (
    <div className="grid gap-6">
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        actions={
          <Button asChild>
            <Link href="/students/new">
              <Plus /> {t("add")}
            </Link>
          </Button>
        }
      />

      <div className="flex flex-wrap gap-2">
        <div className="relative w-full sm:w-80">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input type="search" className="ps-9" placeholder={t("searchPlaceholder")} value={q} onChange={(e) => filter(setQ)(e.target.value)} />
        </div>
        <Select value={status} onValueChange={(v) => filter(setStatus)(v as StudentStatus | typeof ALL)}>
          <SelectTrigger className="flex-1 sm:w-40 sm:flex-none" aria-label={t("status")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{tc("all")}</SelectItem>
            {(["ACTIVE", "INACTIVE", "GRADUATED", "LEFT"] as const).map((s) => (
              <SelectItem key={s} value={s}>{te(`studentStatus.${s}`)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={gender} onValueChange={filter(setGender)}>
          <SelectTrigger className="flex-1 sm:w-40 sm:flex-none" aria-label={t("gender")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("gender")}: {tc("all")}</SelectItem>
            <SelectItem value="MALE">{te("gender.MALE")}</SelectItem>
            <SelectItem value="FEMALE">{te("gender.FEMALE")}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={classId} onValueChange={filter(setClassId)}>
          <SelectTrigger className="w-full sm:w-64" aria-label={t("classes")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("classes")}: {tc("all")}</SelectItem>
            {classes.data?.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Phones: one tappable card per student. */}
      <ul className="grid gap-2 md:hidden">
        {students.isPending &&
          Array.from({ length: 4 }, (_, i) => (
            <li key={i}>
              <Skeleton className="h-[4.5rem] rounded-xl" />
            </li>
          ))}
        {students.isError && <li className="text-destructive">{errorMessage(students.error)}</li>}
        {students.data?.items.length === 0 && <li className="rounded-xl border border-dashed p-6 text-center text-muted-foreground">{tc("noData")}</li>}
        {students.data?.items.map((s) => {
          const g = s.guardians[0]?.guardian;
          const phone = g?.phone ?? s.phone;
          return (
            <li key={s.id} className="flex items-center gap-3 rounded-xl border bg-card p-3">
              <Link href={`/students/${s.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-secondary font-heading text-secondary-foreground">
                  {s.firstName.slice(0, 1)}
                </span>
                <span className="grid min-w-0 gap-0.5">
                  <span className="truncate font-medium">
                    {s.firstName} {s.lastName}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {[s.dateOfBirth && t("age", { age: ageFrom(s.dateOfBirth) }), s.enrollments.map((e) => e.class.name).join("، ")].filter(Boolean).join(" · ")}
                  </span>
                </span>
              </Link>
              {phone && (
                <Button asChild size="icon" variant="outline" aria-label={phone}>
                  <a href={`tel:${phone}`}>
                    <Phone />
                  </a>
                </Button>
              )}
              <ChevronLeft className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            </li>
          );
        })}
      </ul>

      <div className="hidden overflow-x-auto rounded-xl border bg-card md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("code")}</TableHead>
              <TableHead>{t("fullName")}</TableHead>
              <TableHead>{t("dateOfBirth")}</TableHead>
              <TableHead>{t("primaryGuardian")}</TableHead>
              <TableHead>{t("classes")}</TableHead>
              <TableHead>{t("status")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {students.isError && (
              <TableRow>
                <TableCell colSpan={6} className="text-destructive">{errorMessage(students.error)}</TableCell>
              </TableRow>
            )}
            {students.data?.items.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">{tc("noData")}</TableCell>
              </TableRow>
            )}
            {students.data?.items.map((s) => {
              const g = s.guardians[0]?.guardian;
              return (
                <TableRow key={s.id} className="cursor-pointer" onClick={() => router.push(`/students/${s.id}`)}>
                  <TableCell dir="ltr" className="text-end font-mono text-xs">{s.code}</TableCell>
                  <TableCell>
                    <Link href={`/students/${s.id}`} className="font-medium hover:underline">
                      {s.firstName} {s.lastName}
                    </Link>
                  </TableCell>
                  <TableCell>{s.dateOfBirth ? t("age", { age: ageFrom(s.dateOfBirth) }) : "—"}</TableCell>
                  <TableCell>
                    {g ? (
                      <>
                        {g.fullName}{" "}
                        <a href={`tel:${g.phone}`} onClick={(e) => e.stopPropagation()} className="block text-xs text-muted-foreground hover:text-primary" dir="ltr">
                          {g.phone}
                        </a>
                      </>
                    ) : (
                      <span className="text-muted-foreground" dir="ltr">{s.phone ?? "—"}</span>
                    )}
                  </TableCell>
                  <TableCell className="max-w-64">
                    <div className="flex flex-wrap gap-1">
                      {s.enrollments.map((e) => (
                        <Badge key={e.class.id} variant="outline">{e.class.name}</Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={s.status === "ACTIVE" ? "default" : "secondary"}>{te(`studentStatus.${s.status}`)}</Badge>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {students.data && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
          <span>{tc("totalCount", { count: students.data.total })}</span>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>{tc("previous")}</Button>
            <span>{tc("pageOf", { page, pages })}</span>
            <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage(page + 1)}>{tc("next")}</Button>
          </div>
        </div>
      )}
    </div>
  );
}
