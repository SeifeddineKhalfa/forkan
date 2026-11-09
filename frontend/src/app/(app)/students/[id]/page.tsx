"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { RoleGate } from "@/components/app-shell/role-gate";
import { StudentAttendanceCard } from "@/components/attendance/attendance-views";
import { StudentEvaluations } from "@/components/evaluations/student-evaluations";
import { StudentHifz } from "@/components/hifz/student-hifz";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import { ageFrom, useFormat } from "@/lib/format";
import type { ClassItem, StudentDetail, StudentStatus } from "@/lib/types";
import { useErrorMessage } from "@/lib/use-error-message";
import { type GuardianDraft, GuardianEditor, guardianPayload, newGuardianDraft } from "../guardian-editor";
import { StudentAccount } from "./student-account";
import { StudentEditDialog } from "./student-edit-dialog";
import { StudentPhoto } from "./student-photo";

const STATUSES: StudentStatus[] = ["ACTIVE", "INACTIVE", "GRADUATED", "LEFT"];

export default function StudentPage() {
  return (
    <RoleGate roles={["STAFF"]}>
      <StudentProfile />
    </RoleGate>
  );
}

function StudentProfile() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations("students");
  const tc = useTranslations("common");
  const te = useTranslations("enums");
  const tcl = useTranslations("classes");
  const fmt = useFormat();
  const errorMessage = useErrorMessage();
  const qc = useQueryClient();
  const key = ["students", id];
  const student = useQuery({ queryKey: key, queryFn: () => api<StudentDetail>(`/students/${id}`) });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["students"] });
    void qc.invalidateQueries({ queryKey: ["classes"] });
  };

  const [editing, setEditing] = useState(false);
  const [guardianDraft, setGuardianDraft] = useState<GuardianDraft | null>(null);
  const [enrollClassId, setEnrollClassId] = useState<string | null>(null);
  const [pendingStatus, setPendingStatus] = useState<StudentStatus | null>(null);
  const classes = useQuery({ queryKey: ["classes", ""], queryFn: () => api<ClassItem[]>("/classes"), enabled: enrollClassId !== null });

  const onError = (e: unknown) => toast.error(errorMessage(e));
  const setStatus = useMutation({
    mutationFn: (status: StudentStatus) => api(`/students/${id}`, { method: "PATCH", body: { status } }),
    onSuccess: () => {
      setPendingStatus(null);
      refresh();
    },
    onError,
  });
  const addGuardian = useMutation({
    mutationFn: (d: GuardianDraft) => api(`/students/${id}/guardians`, { method: "POST", body: guardianPayload(d) }),
    onSuccess: () => {
      setGuardianDraft(null);
      refresh();
    },
  });
  const removeGuardian = useMutation({
    mutationFn: (guardianId: string) => api(`/students/${id}/guardians/${guardianId}`, { method: "DELETE" }),
    onSuccess: refresh,
    onError,
  });
  const enroll = useMutation({
    mutationFn: () => api("/enrollments", { method: "POST", body: { studentId: id, classId: enrollClassId } }),
    onSuccess: () => {
      setEnrollClassId(null);
      toast.success(tcl("enrolled"));
      refresh();
    },
  });
  const endEnrollment = useMutation({
    mutationFn: (enrollmentId: string) => api(`/enrollments/${enrollmentId}/end`, { method: "POST", body: {} }),
    onSuccess: refresh,
    onError,
  });

  if (student.isError) return <p className="text-destructive">{errorMessage(student.error)}</p>;
  if (!student.data) return <p className="text-muted-foreground">{tc("loading")}</p>;
  const s = student.data;
  const active = s.enrollments.filter((e) => e.status === "ACTIVE");
  const enrolledIds = new Set(active.map((e) => e.class.id));
  const allowed = classes.data?.filter(
    (c) => c.isActive && !enrolledIds.has(c.id) && (c.genderPolicy === "MIXED" || (c.genderPolicy === "MALE_ONLY") === (s.gender === "MALE")),
  );

  const info: [string, React.ReactNode][] = [
    [t("gender"), te(`gender.${s.gender}`)],
    [t("dateOfBirth"), s.dateOfBirth ? `${fmt.date(s.dateOfBirth)} (${t("age", { age: ageFrom(s.dateOfBirth) })})` : "—"],
    [t("phone"), <span key="p" dir="ltr">{s.phone ?? "—"}</span>],
    [t("address"), s.address ?? "—"],
    [t("riwaya"), s.riwaya ? te(`riwaya.${s.riwaya}`) : tcl("riwayaDefault")],
    [t("joinedAt"), fmt.date(s.joinedAt)],
    [t("photoConsent"), s.photoConsent ? tc("yes") : tc("no")],
    ...(s.firstNameLatin || s.lastNameLatin ? [["Nom", <span key="l" dir="ltr">{`${s.firstNameLatin ?? ""} ${s.lastNameLatin ?? ""}`}</span>] as [string, React.ReactNode]] : []),
  ];

  return (
    <div className="grid gap-6">
      <PageHeader
        backHref="/students"
        title={
          <>
            {s.firstName} {s.lastName}{" "}
            <span className="font-mono text-base font-normal text-muted-foreground" dir="ltr">{s.code}</span>
          </>
        }
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Badge variant={s.status === "ACTIVE" ? "default" : "secondary"}>{te(`studentStatus.${s.status}`)}</Badge>
            {s.teacherProfile && <Badge variant="outline">{s.teacherProfile.title ?? te("teachingRole.MAIN")}</Badge>}
          </span>
        }
        actions={
          <>
            <Button variant="outline" onClick={() => setEditing(true)}>{tc("edit")}</Button>
            <Select value={s.status} onValueChange={(v) => setPendingStatus(v as StudentStatus)}>
              <SelectTrigger className="w-44" aria-label={t("statusChange")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUSES.map((st) => (
                  <SelectItem key={st} value={st}>{te(`studentStatus.${st}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        }
      />

      <Tabs defaultValue="profile">
        <TabsList className="flex-wrap">
          <TabsTrigger value="profile">{t("tabs.profile")}</TabsTrigger>
          <TabsTrigger value="classes">{t("tabs.classes")}</TabsTrigger>
          <TabsTrigger value="payments">{t("tabs.payments")}</TabsTrigger>
          <TabsTrigger value="hifz">{t("tabs.hifz")}</TabsTrigger>
          <TabsTrigger value="attendance">{t("tabs.attendance")}</TabsTrigger>
          <TabsTrigger value="evaluations">{t("tabs.evaluations")}</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>{t("identity")}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <StudentPhoto student={s} />
              <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
                {info.map(([label, value]) => (
                  <div key={label} className="contents">
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
              {s.notes && <p className="mt-4 whitespace-pre-line text-sm text-muted-foreground">{s.notes}</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>{t("guardians")}</CardTitle>
              <Button size="sm" variant="outline" onClick={() => setGuardianDraft(newGuardianDraft(s.guardians.length === 0))}>
                <Plus /> {t("addGuardian")}
              </Button>
            </CardHeader>
            <CardContent className="grid gap-2">
              {s.guardians.length === 0 && <p className="text-sm text-muted-foreground">{t("noGuardians")}</p>}
              {s.guardians.map((g) => (
                <div key={g.guardianId} className="flex items-center justify-between gap-2 rounded-md border p-3 text-sm">
                  <div>
                    <p className="font-medium">
                      {g.guardian.fullName} <span className="text-muted-foreground">· {te(`relation.${g.relation}`)}</span>
                    </p>
                    <p dir="ltr" className="text-end text-muted-foreground">{g.guardian.phone}</p>
                    <div className="mt-1 flex gap-1">
                      {g.isPrimary && <Badge>{t("primary")}</Badge>}
                      {g.isPayer && <Badge variant="secondary">{t("payer")}</Badge>}
                    </div>
                  </div>
                  <Button size="icon" variant="ghost" aria-label={tc("remove")} onClick={() => removeGuardian.mutate(g.guardianId)}>
                    <Trash2 />
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="classes">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>{t("classes")}</CardTitle>
              {s.status === "ACTIVE" && (
                <Button size="sm" onClick={() => setEnrollClassId("")}>
                  <Plus /> {t("enrollIn")}
                </Button>
              )}
            </CardHeader>
            <CardContent className="grid gap-2">
              {s.enrollments.length === 0 && <p className="text-sm text-muted-foreground">{tc("noData")}</p>}
              {s.enrollments.map((e) => (
                <div key={e.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm">
                  <div>
                    <Link href={`/classes/${e.class.id}`} className="font-medium hover:underline">{e.class.name}</Link>
                    <p className="text-muted-foreground">
                      {e.class.academicYear.name} ·{" "}
                      {e.status === "ACTIVE" ? t("since", { date: fmt.date(e.startDate) }) : t("endedOn", { date: fmt.date(e.endDate) })}
                      {" · "}
                      {fmt.fee(e.monthlyFeeOverride ?? e.class.monthlyFee)}
                    </p>
                  </div>
                  {e.status === "ACTIVE" ? (
                    <Button size="sm" variant="ghost" onClick={() => endEnrollment.mutate(e.id)}>{tcl("endEnrollment")}</Button>
                  ) : (
                    <Badge variant="secondary">{te("enrollmentStatus.ENDED")}</Badge>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payments">
          <StudentAccount student={s} />
        </TabsContent>

        <TabsContent value="attendance">
          <StudentAttendanceCard studentId={s.id} />
        </TabsContent>

        <TabsContent value="hifz">
          <StudentHifz studentId={s.id} name={`${s.firstName} ${s.lastName}`} />
        </TabsContent>

        <TabsContent value="evaluations">
          <StudentEvaluations studentId={s.id} />
        </TabsContent>
      </Tabs>

      <StudentEditDialog student={s} open={editing} onOpenChange={setEditing} />

      <Dialog open={!!guardianDraft} onOpenChange={(o) => !o && setGuardianDraft(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("addGuardian")}</DialogTitle>
          </DialogHeader>
          {guardianDraft && (
            <GuardianEditor
              draft={guardianDraft}
              onChange={(patch) => setGuardianDraft({ ...guardianDraft, ...patch })}
              onRemove={() => setGuardianDraft(null)}
            />
          )}
          {addGuardian.isError && <p role="alert" className="text-sm text-destructive">{errorMessage(addGuardian.error)}</p>}
          <DialogFooter>
            <Button disabled={addGuardian.isPending} onClick={() => guardianDraft && addGuardian.mutate(guardianDraft)}>{tc("save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={enrollClassId !== null} onOpenChange={(o) => !o && setEnrollClassId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("enrollIn")}</DialogTitle>
          </DialogHeader>
          <Select value={enrollClassId || undefined} onValueChange={setEnrollClassId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder={tcl("name")} />
            </SelectTrigger>
            <SelectContent>
              {allowed?.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name} ({c._count.enrollments}/{c.capacity})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {enroll.isError && <p role="alert" className="text-sm text-destructive">{errorMessage(enroll.error)}</p>}
          <DialogFooter>
            <Button disabled={!enrollClassId || enroll.isPending} onClick={() => enroll.mutate()}>{tc("confirm")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!pendingStatus} onOpenChange={(o) => !o && setPendingStatus(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("statusChange")}: {pendingStatus && te(`studentStatus.${pendingStatus}`)}</DialogTitle>
            {pendingStatus !== "ACTIVE" && active.length > 0 && <DialogDescription>{t("leaveWarning")}</DialogDescription>}
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingStatus(null)}>{tc("cancel")}</Button>
            <Button disabled={setStatus.isPending} onClick={() => pendingStatus && setStatus.mutate(pendingStatus)}>{tc("confirm")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
