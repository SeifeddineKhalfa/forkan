"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { UserPlus } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { ClassAttendanceCard } from "@/components/attendance/attendance-views";
import { ClassSchedule } from "@/components/class-schedule";
import { PageHeader } from "@/components/page-header";
import { StudentPicker } from "@/components/student-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/api";
import { useMe } from "@/lib/auth";
import { useFormat } from "@/lib/format";
import type { ClassDetail, StudentListItem } from "@/lib/types";
import { useErrorMessage } from "@/lib/use-error-message";
import { CLASSES_KEY, ClassFormDialog } from "../class-form-dialog";

export default function ClassPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations("classes");
  const tc = useTranslations("common");
  const te = useTranslations("enums");
  const ts = useTranslations("students");
  const fmt = useFormat();
  const errorMessage = useErrorMessage();
  const qc = useQueryClient();
  const { data: me } = useMe();
  const isOffice = me?.role === "ADMIN" || me?.role === "STAFF";

  const klass = useQuery({ queryKey: [...CLASSES_KEY, id], queryFn: () => api<ClassDetail>(`/classes/${id}`) });
  const refresh = () => qc.invalidateQueries({ queryKey: CLASSES_KEY });
  const [editing, setEditing] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const [student, setStudent] = useState<StudentListItem | null>(null);
  const [override, setOverride] = useState(false);

  const enroll = useMutation({
    mutationFn: () => api("/enrollments", { method: "POST", body: { studentId: student?.id, classId: id, overrideCapacity: override } }),
    onSuccess: () => {
      toast.success(t("enrolled"));
      setEnrolling(false);
      setStudent(null);
      setOverride(false);
      void refresh();
      void qc.invalidateQueries({ queryKey: ["students"] });
    },
  });
  const endEnrollment = useMutation({
    mutationFn: (enrollmentId: string) => api(`/enrollments/${enrollmentId}/end`, { method: "POST", body: {} }),
    onSuccess: refresh,
    onError: (e) => toast.error(errorMessage(e)),
  });
  const toggleActive = useMutation({
    mutationFn: (isActive: boolean) => api(`/classes/${id}`, { method: "PATCH", body: { isActive } }),
    onSuccess: refresh,
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (klass.isError) return <p className="text-destructive">{errorMessage(klass.error)}</p>;
  if (!klass.data) return <p className="text-muted-foreground">{tc("loading")}</p>;
  const c = klass.data;
  const full = c.enrollments.length >= c.capacity;

  return (
    <div className="grid gap-6">
      <PageHeader
        backHref="/classes"
        title={c.name}
        subtitle={c.quranScope ?? undefined}
        actions={
          isOffice && (
            <>
              <Button variant="outline" onClick={() => setEditing(true)}>{tc("edit")}</Button>
              <Button variant="ghost" disabled={toggleActive.isPending} onClick={() => toggleActive.mutate(!c.isActive)}>
                {c.isActive ? t("deactivate") : t("activate")}
              </Button>
            </>
          )
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>{t("schedule")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            <ClassSchedule slots={c.scheduleSlots} />
            <div className="flex flex-wrap gap-1">
              <Badge variant="secondary">{te(`audience.${c.audience}`)}</Badge>
              <Badge variant="secondary">{te(`genderPolicy.${c.genderPolicy}`)}</Badge>
              <Badge variant="outline">{fmt.fee(c.monthlyFee)}</Badge>
              {c.riwaya && <Badge variant="outline">{te(`riwaya.${c.riwaya}`)}</Badge>}
            </div>
            {c.room && (
              <p className="text-muted-foreground">
                {c.room.venue.name} — {c.room.name}
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t("teachers")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {c.teachers.map((x) => (
              <Badge key={x.teacherId} variant={x.role === "MAIN" ? "default" : "secondary"} className="py-1">
                {te(`teachingRole.${x.role}`)}: {x.teacher.title ? `${x.teacher.title} ` : ""}
                {x.teacher.firstName} {x.teacher.lastName}
              </Badge>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>
            {t("students")} <span className="text-base font-normal text-muted-foreground" dir="ltr">({t("places", { count: c.enrollments.length, capacity: c.capacity })})</span>
          </CardTitle>
          {isOffice && c.isActive && (
            <Button size="sm" onClick={() => setEnrolling(true)}>
              <UserPlus /> {t("enroll")}
            </Button>
          )}
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {c.enrollments.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noStudents")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{ts("code")}</TableHead>
                  <TableHead>{ts("fullName")}</TableHead>
                  <TableHead>{ts("joinedAt")}</TableHead>
                  {isOffice && <TableHead className="text-end">{tc("actions")}</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {c.enrollments.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell dir="ltr" className="text-end font-mono text-xs">{e.student.code}</TableCell>
                    <TableCell>
                      {isOffice ? (
                        <Link href={`/students/${e.student.id}`} className="hover:underline">
                          {e.student.firstName} {e.student.lastName}
                        </Link>
                      ) : (
                        <>
                          {e.student.firstName} {e.student.lastName}
                        </>
                      )}
                      {c.requiresMembership && <MembershipBadge memberships={e.student.memberships} />}
                    </TableCell>
                    <TableCell>{fmt.date(e.startDate)}</TableCell>
                    {isOffice && (
                      <TableCell className="text-end">
                        <Button size="sm" variant="ghost" disabled={endEnrollment.isPending} onClick={() => endEnrollment.mutate(e.id)}>
                          {t("endEnrollment")}
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <ClassAttendanceCard classId={c.id} linkStudents={isOffice} />

      {isOffice && <ClassFormDialog open={editing} onOpenChange={setEditing} klass={c} />}

      <Dialog open={enrolling} onOpenChange={setEnrolling}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("enroll")}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <StudentPicker value={student} onChange={setStudent} />
            {full && me?.role === "ADMIN" && (
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={override} onCheckedChange={(v) => setOverride(v === true)} />
                {t("overrideCapacity")}
              </label>
            )}
            {enroll.isError && <p role="alert" className="text-sm text-destructive">{errorMessage(enroll.error)}</p>}
          </div>
          <DialogFooter>
            <Button disabled={!student || enroll.isPending} onClick={() => enroll.mutate()}>
              {tc("confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Warning only: never blocks attendance (spec A5). */
function MembershipBadge({ memberships }: { memberships: ClassDetail["enrollments"][number]["student"]["memberships"] }) {
  const tm = useTranslations("memberships");
  const m = memberships[0];
  if (m?.charge.status === "PAID") return null;
  return (
    <Badge variant={m ? "outline" : "destructive"} className="ms-2">
      {m ? tm("badgeUnpaid") : tm("badgeNone")}
    </Badge>
  );
}
