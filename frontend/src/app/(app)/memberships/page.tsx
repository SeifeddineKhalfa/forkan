"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { IdCard, Printer } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { RoleGate } from "@/components/app-shell/role-gate";
import { ChargeStateBadge } from "@/components/fees/charge-state-badge";
import { type MembershipCandidate, RegisterMembershipDialog } from "@/components/fees/register-membership-dialog";
import { PageHeader } from "@/components/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import { useFormat } from "@/lib/format";
import type { AcademicYear, MembershipList, MissingMember } from "@/lib/types";
import { useDebounced } from "@/lib/use-debounced";
import { useErrorMessage } from "@/lib/use-error-message";
import { YEARS_KEY } from "../settings/years-card";

export default function MembershipsPage() {
  return (
    <RoleGate roles={["STAFF"]}>
      <Memberships />
    </RoleGate>
  );
}

function Memberships() {
  const t = useTranslations("memberships");
  const ts = useTranslations("students");
  const tc = useTranslations("common");
  const fmt = useFormat();
  const errorMessage = useErrorMessage();
  const qc = useQueryClient();
  const [yearId, setYearId] = useState<string>("");
  const [state, setState] = useState("ALL");
  const [type, setType] = useState("ALL");
  const [q, setQ] = useState("");
  const [registering, setRegistering] = useState<MembershipCandidate | "pick" | null>(null);
  const query = useDebounced(q);

  const years = useQuery({ queryKey: YEARS_KEY, queryFn: () => api<AcademicYear[]>("/academic-years") });
  const params = new URLSearchParams({ state, type });
  if (yearId) params.set("academicYearId", yearId);
  if (query) params.set("q", query);
  const list = useQuery({
    queryKey: ["memberships", params.toString()],
    queryFn: () => api<MembershipList>(`/memberships?${params}`),
  });
  const year = list.data?.year;
  const missing = useQuery({
    queryKey: ["memberships", "missing", year?.id],
    queryFn: () => api<MissingMember[]>(`/memberships/missing?academicYearId=${year!.id}`),
    enabled: !!year,
  });
  const toggleForm = useMutation({
    mutationFn: (m: { id: string; formReceived: boolean }) =>
      api(`/memberships/${m.id}`, { method: "PATCH", body: { formReceived: m.formReceived } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["memberships"] }),
    onError: (e) => toast.error(errorMessage(e)),
  });

  const s = list.data?.summary;
  const hasFee = !!year?.membershipFee && Number(year.membershipFee) > 0;

  return (
    <div className="grid gap-6">
      <PageHeader
        title={t("title")}
        subtitle={
          year && (
            <>
              {t("subtitle", { year: year.name })}
              {year.windowStart && year.windowEnd && (
                <span className="block text-sm">{t("window", { start: fmt.date(year.windowStart), end: fmt.date(year.windowEnd) })}</span>
              )}
            </>
          )
        }
        actions={
          <>
            <Select value={yearId || year?.id || ""} onValueChange={setYearId}>
              <SelectTrigger className="w-36" aria-label={t("subtitle", { year: "" })}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {years.data?.map((y) => (
                  <SelectItem key={y.id} value={y.id}>{y.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {year && (
              <Button variant="outline" asChild>
                <Link href={`/memberships/print?year=${year.id}`}>
                  <Printer /> {t("print")}
                </Link>
              </Button>
            )}
            <Button disabled={!hasFee} onClick={() => setRegistering("pick")}>
              <IdCard /> {t("register")}
            </Button>
          </>
        }
      />

      {list.isError && <p className="text-destructive">{errorMessage(list.error)}</p>}
      {year && !hasFee && (
        <Alert>
          <AlertDescription>{t("noFee")}</AlertDescription>
        </Alert>
      )}

      {s && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
          <Stat label={t("summaryTotal")} value={s.total} />
          <Stat label={t("summaryPaid")} value={`${s.paid} / ${s.total}`} />
          <Stat label={t("summaryNew")} value={s.isNew} />
          <Stat label={t("summaryCollected")} value={`${fmt.money(s.collected)} / ${fmt.money(s.expected)}`} />
          <Stat label={t("summaryMissing")} value={s.missing} warn={s.missing > 0} />
        </div>
      )}

      <Tabs defaultValue="members">
        <TabsList>
          <TabsTrigger value="members">{t("title")}</TabsTrigger>
          <TabsTrigger value="missing">
            {t("missingTitle")} {s && s.missing > 0 && <Badge variant="destructive" className="ms-1">{s.missing}</Badge>}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="members" className="grid gap-4">
          <div className="flex flex-wrap gap-2">
            <Input className="w-full sm:w-72" placeholder={tc("search")} value={q} onChange={(e) => setQ(e.target.value)} />
            <Select value={state} onValueChange={setState}>
              <SelectTrigger className="w-36" aria-label={tc("all")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">{tc("all")}</SelectItem>
                <SelectItem value="PAID">{t("summaryPaid")}</SelectItem>
                <SelectItem value="UNPAID">{t("badgeUnpaid")}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="w-32" aria-label={t("type")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">{t("type")}: {tc("all")}</SelectItem>
                <SelectItem value="NEW">{t("isNew")}</SelectItem>
                <SelectItem value="RENEWAL">{t("renewal")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("memberNumber")}</TableHead>
                  <TableHead>{ts("fullName")}</TableHead>
                  <TableHead>{t("guardianPhone")}</TableHead>
                  <TableHead>{t("type")}</TableHead>
                  <TableHead>{t("formReceived")}</TableHead>
                  <TableHead>{t("fee")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.data?.items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">{t("noMembers")}</TableCell>
                  </TableRow>
                )}
                {list.data?.items.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell dir="ltr" className="text-end font-mono">{m.memberNumber}</TableCell>
                    <TableCell>
                      <Link href={`/students/${m.student.id}`} className="font-medium hover:underline">
                        {m.student.firstName} {m.student.lastName}
                      </Link>
                      <span className="block font-mono text-xs text-muted-foreground" dir="ltr">{m.student.code}</span>
                    </TableCell>
                    <TableCell dir="ltr" className="text-end text-sm">
                      {m.student.guardians[0]?.guardian.phone ?? m.student.phone ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{m.isNew ? t("isNew") : t("renewal")}</Badge>
                    </TableCell>
                    <TableCell>
                      <Checkbox
                        checked={m.formReceived}
                        aria-label={t("formReceivedLabel")}
                        onCheckedChange={(v) => toggleForm.mutate({ id: m.id, formReceived: v === true })}
                      />
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {fmt.money(m.charge.amount)} <ChargeStateBadge state={m.state} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="missing" className="grid gap-4">
          <p className="text-sm text-muted-foreground">{t("missingHint")}</p>
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableBody>
                {missing.data?.length === 0 && (
                  <TableRow>
                    <TableCell className="text-center text-muted-foreground">{t("noneMissing")}</TableCell>
                  </TableRow>
                )}
                {missing.data?.map((st) => (
                  <TableRow key={st.id}>
                    <TableCell>
                      <Link href={`/students/${st.id}`} className="font-medium hover:underline">
                        {st.firstName} {st.lastName}
                      </Link>
                      <span className="block font-mono text-xs text-muted-foreground" dir="ltr">{st.code}</span>
                    </TableCell>
                    <TableCell className="max-w-72">
                      <div className="flex flex-wrap gap-1">
                        {st.enrollments.map((e) => (
                          <Badge key={e.class.id} variant="outline">{e.class.name}</Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell dir="ltr" className="text-end text-sm">
                      {st.guardians[0]?.guardian.phone ?? st.phone ?? "—"}
                    </TableCell>
                    <TableCell className="text-end">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!hasFee}
                        onClick={() =>
                          setRegistering({ id: st.id, name: `${st.firstName} ${st.lastName}`, isNew: st.memberships.length === 0 })
                        }
                      >
                        {t("register")}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      {year && (
        <RegisterMembershipDialog
          open={registering !== null}
          onOpenChange={(o) => !o && setRegistering(null)}
          student={registering === "pick" || registering === null ? undefined : registering}
          year={year}
        />
      )}
    </div>
  );
}

function Stat({ label, value, warn }: { label: string; value: React.ReactNode; warn?: boolean }) {
  return (
    <Card className="py-4">
      <CardContent className="grid gap-1">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className={`text-xl font-bold ${warn ? "text-destructive" : ""}`}>{value}</span>
      </CardContent>
    </Card>
  );
}
