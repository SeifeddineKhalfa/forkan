"use client";

import { useQuery } from "@tanstack/react-query";
import { KeyRound, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";
import { RoleGate } from "@/components/app-shell/role-gate";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/api";
import type { Teacher } from "@/lib/types";
import { useErrorMessage } from "@/lib/use-error-message";
import { TEACHERS_KEY, TeacherFormDialog } from "./teacher-form-dialog";

export default function TeachersPage() {
  return (
    <RoleGate roles={["STAFF"]}>
      <TeachersList />
    </RoleGate>
  );
}

function TeachersList() {
  const t = useTranslations("teachers");
  const tc = useTranslations("common");
  const errorMessage = useErrorMessage();
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const teachers = useQuery({
    queryKey: [...TEACHERS_KEY, q],
    queryFn: () => api<Teacher[]>(`/teachers?active=all${q ? `&q=${encodeURIComponent(q)}` : ""}`),
  });

  return (
    <div className="grid gap-6">
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus /> {t("add")}
          </Button>
        }
      />
      <Input className="max-w-sm" placeholder={tc("search")} value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("firstName")}</TableHead>
              <TableHead>{t("phone")}</TableHead>
              <TableHead>{t("classes")}</TableHead>
              <TableHead>{t("ijazas")}</TableHead>
              <TableHead>{t("login")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {teachers.isError && (
              <TableRow>
                <TableCell colSpan={5} className="text-destructive">{errorMessage(teachers.error)}</TableCell>
              </TableRow>
            )}
            {teachers.data?.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">{tc("noData")}</TableCell>
              </TableRow>
            )}
            {teachers.data?.map((teacher) => (
              <TableRow key={teacher.id} className={teacher.isActive ? undefined : "opacity-60"}>
                <TableCell>
                  <Link href={`/teachers/${teacher.id}`} className="font-medium hover:underline">
                    {teacher.title && <span className="text-muted-foreground">{teacher.title} </span>}
                    {teacher.firstName} {teacher.lastName}
                  </Link>
                  {!teacher.isActive && <Badge variant="secondary" className="ms-2">{tc("inactive")}</Badge>}
                </TableCell>
                <TableCell dir="ltr" className="text-end">{teacher.phone ?? "—"}</TableCell>
                <TableCell>{teacher._count?.classes ?? 0}</TableCell>
                <TableCell>{teacher._count?.ijazas ?? 0}</TableCell>
                <TableCell>
                  {teacher.user ? <KeyRound className="size-4 text-primary" aria-label={t("login")} /> : <span className="text-muted-foreground">—</span>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <TeacherFormDialog open={creating} onOpenChange={setCreating} />
    </div>
  );
}
