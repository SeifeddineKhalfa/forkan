"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Paperclip, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { RoleGate } from "@/components/app-shell/role-gate";
import { EnumSelect } from "@/components/form/enum-select";
import { Field } from "@/components/form/field";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api, upload } from "@/lib/api";
import { useMe } from "@/lib/auth";
import { useFormat } from "@/lib/format";
import type { Riwaya, Teacher } from "@/lib/types";
import { useErrorMessage } from "@/lib/use-error-message";
import { TEACHERS_KEY, TeacherFormDialog } from "../teacher-form-dialog";

function IjazaDocumentButton({ teacherId, ijazaId, onDone }: { teacherId: string; ijazaId: string; onDone: () => void }) {
  const t = useTranslations("teachers");
  const errorMessage = useErrorMessage();
  const input = useRef<HTMLInputElement>(null);
  const save = useMutation({
    mutationFn: (file: File) => upload(`/teachers/${teacherId}/ijazas/${ijazaId}/document`, file),
    onSuccess: onDone,
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) save.mutate(file);
          e.target.value = "";
        }}
      />
      <Button size="icon" variant="ghost" aria-label={t("attachDocument")} disabled={save.isPending} onClick={() => input.current?.click()}>
        <Paperclip />
      </Button>
    </>
  );
}

export default function TeacherPage() {
  return (
    <RoleGate roles={["STAFF"]}>
      <TeacherDetail />
    </RoleGate>
  );
}

function TeacherDetail() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations("teachers");
  const tc = useTranslations("common");
  const te = useTranslations("enums");
  const tu = useTranslations("users");
  const fmt = useFormat();
  const errorMessage = useErrorMessage();
  const qc = useQueryClient();
  const { data: me } = useMe();
  const key = [...TEACHERS_KEY, id];
  const teacher = useQuery({ queryKey: key, queryFn: () => api<Teacher>(`/teachers/${id}`) });
  const refresh = () => qc.invalidateQueries({ queryKey: TEACHERS_KEY });

  const [editing, setEditing] = useState(false);
  const [ijaza, setIjaza] = useState<{ title: string; riwaya: Riwaya | null; grantedBy: string; year: string } | null>(null);
  const [login, setLogin] = useState<{ email: string; phone: string; temporaryPassword: string } | null>(null);

  const toggleActive = useMutation({
    mutationFn: (isActive: boolean) => api(`/teachers/${id}`, { method: "PATCH", body: { isActive } }),
    onSuccess: refresh,
    onError: (e) => toast.error(errorMessage(e)),
  });
  const addIjaza = useMutation({
    mutationFn: () =>
      api(`/teachers/${id}/ijazas`, {
        method: "POST",
        body: { ...ijaza, riwaya: ijaza?.riwaya ?? undefined, year: ijaza?.year ? Number(ijaza.year) : undefined },
      }),
    onSuccess: () => {
      setIjaza(null);
      void refresh();
    },
  });
  const removeIjaza = useMutation({
    mutationFn: (ijazaId: string) => api(`/teachers/${id}/ijazas/${ijazaId}`, { method: "DELETE" }),
    onSuccess: refresh,
    onError: (e) => toast.error(errorMessage(e)),
  });
  const addLogin = useMutation({
    mutationFn: () => api(`/teachers/${id}/login`, { method: "POST", body: login }),
    onSuccess: () => {
      setLogin(null);
      toast.success(tc("saved"));
      void refresh();
    },
  });

  if (teacher.isError) return <p className="text-destructive">{errorMessage(teacher.error)}</p>;
  if (!teacher.data) return <p className="text-muted-foreground">{tc("loading")}</p>;
  const d = teacher.data;

  return (
    <div className="grid gap-6">
      <PageHeader
        backHref="/teachers"
        title={`${d.title ? `${d.title} ` : ""}${d.firstName} ${d.lastName}`}
        subtitle={d.specialization ?? undefined}
        actions={
          <>
            <Button variant="outline" onClick={() => setEditing(true)}>{tc("edit")}</Button>
            <Button variant="ghost" disabled={toggleActive.isPending} onClick={() => toggleActive.mutate(!d.isActive)}>
              {d.isActive ? t("deactivate") : t("activate")}
            </Button>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("info")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            <p>
              {t("gender")}: {te(`gender.${d.gender}`)} · {t("phone")}: <span dir="ltr">{d.phone ?? "—"}</span>
            </p>
            {d.hireDate && <p>{t("hireDate")}: {fmt.date(d.hireDate)}</p>}
            {d.contractType && (
              <p>
                {t("contract")}: {te(`contractType.${d.contractType}`)}
                {d.monthlySalary && ` · ${fmt.money(d.monthlySalary)}`}
              </p>
            )}
            {d.student && (
              <p>
                {t("isStudent")}: <Link className="underline" href={`/students/${d.student.id}`}>{d.student.code}</Link>
              </p>
            )}
            {d.user ? (
              <p>
                <Badge>{t("login")}</Badge> <span dir="ltr">{d.user.email ?? d.user.phone}</span>
              </p>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-muted-foreground">{t("noLogin")}</span>
                {me?.role === "ADMIN" && (
                  <Button size="sm" variant="outline" onClick={() => setLogin({ email: "", phone: "", temporaryPassword: "" })}>
                    {t("createLogin")}
                  </Button>
                )}
              </div>
            )}
            {d.notes && <p className="whitespace-pre-line text-muted-foreground">{d.notes}</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("classes")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2">
            {d.classes?.length === 0 && <p className="text-sm text-muted-foreground">{tc("noData")}</p>}
            {d.classes?.map((c) => (
              <Link key={c.class.id} href={`/classes/${c.class.id}`} className="flex items-center justify-between rounded-md border p-2 text-sm hover:bg-muted">
                <span>{c.class.name}</span>
                <Badge variant="secondary">{te(`teachingRole.${c.role}`)}</Badge>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{t("ijazas")}</CardTitle>
          <Button size="sm" variant="outline" onClick={() => setIjaza({ title: "", riwaya: null, grantedBy: "", year: "" })}>
            <Plus /> {t("addIjaza")}
          </Button>
        </CardHeader>
        <CardContent className="grid gap-2">
          {d.ijazas?.length === 0 && <p className="text-sm text-muted-foreground">{t("noIjazas")}</p>}
          {d.ijazas?.map((i) => (
            <div key={i.id} className="flex items-center justify-between gap-2 rounded-md border p-3 text-sm">
              <div>
                <p className="font-medium">{i.title}</p>
                <p className="text-muted-foreground">
                  {[i.riwaya && te(`riwaya.${i.riwaya}`), i.grantedBy, i.year].filter(Boolean).join(" · ")}
                </p>
              </div>
              <div className="flex items-center gap-1">
                {i.documentUrl && (
                  <Button asChild size="sm" variant="link">
                    <a href={`/api/teachers/${id}/ijazas/${i.id}/document`} target="_blank" rel="noreferrer">
                      {t("viewDocument")}
                    </a>
                  </Button>
                )}
                <IjazaDocumentButton teacherId={id} ijazaId={i.id} onDone={refresh} />
                <Button size="icon" variant="ghost" aria-label={tc("remove")} onClick={() => removeIjaza.mutate(i.id)}>
                  <Trash2 />
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <TeacherFormDialog open={editing} onOpenChange={setEditing} teacher={d} />

      <Dialog open={!!ijaza} onOpenChange={(o) => !o && setIjaza(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("addIjaza")}</DialogTitle>
          </DialogHeader>
          {ijaza && (
            <div className="grid gap-4">
              <Field label={t("ijazaTitle")} htmlFor="ij-title">
                <Input id="ij-title" value={ijaza.title} onChange={(e) => setIjaza({ ...ijaza, title: e.target.value })} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label={t("riwaya")}>
                  <EnumSelect ns="riwaya" values={["QALUN", "WARSH", "HAFS"] as const} value={ijaza.riwaya} noneLabel="—" onChange={(v) => setIjaza({ ...ijaza, riwaya: v })} />
                </Field>
                <Field label={t("year")} htmlFor="ij-year">
                  <Input id="ij-year" type="number" dir="ltr" value={ijaza.year} onChange={(e) => setIjaza({ ...ijaza, year: e.target.value })} />
                </Field>
              </div>
              <Field label={t("grantedBy")} htmlFor="ij-by">
                <Input id="ij-by" value={ijaza.grantedBy} onChange={(e) => setIjaza({ ...ijaza, grantedBy: e.target.value })} />
              </Field>
              {addIjaza.isError && <p className="text-sm text-destructive">{errorMessage(addIjaza.error)}</p>}
            </div>
          )}
          <DialogFooter>
            <Button disabled={addIjaza.isPending || !ijaza?.title.trim()} onClick={() => addIjaza.mutate()}>{tc("save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!login} onOpenChange={(o) => !o && setLogin(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("createLogin")}</DialogTitle>
          </DialogHeader>
          {login && (
            <div className="grid gap-4">
              <Field label={tu("email")} htmlFor="tl-email">
                <Input id="tl-email" type="email" dir="ltr" value={login.email} onChange={(e) => setLogin({ ...login, email: e.target.value })} />
              </Field>
              <Field label={tu("phone")} htmlFor="tl-phone">
                <Input id="tl-phone" type="tel" dir="ltr" value={login.phone} onChange={(e) => setLogin({ ...login, phone: e.target.value })} />
              </Field>
              <Field label={tu("temporaryPassword")} htmlFor="tl-pass" hint={tu("temporaryPasswordHint")}>
                <Input id="tl-pass" dir="ltr" autoComplete="off" value={login.temporaryPassword} onChange={(e) => setLogin({ ...login, temporaryPassword: e.target.value })} />
              </Field>
              {addLogin.isError && <p className="text-sm text-destructive">{errorMessage(addLogin.error)}</p>}
            </div>
          )}
          <DialogFooter>
            <Button disabled={addLogin.isPending} onClick={() => addLogin.mutate()}>{tc("save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
