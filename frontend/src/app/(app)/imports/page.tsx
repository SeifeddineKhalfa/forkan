"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Download, FileUp } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRef, useState } from "react";
import { RoleGate } from "@/components/app-shell/role-gate";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { api } from "@/lib/api";
import { useFormat } from "@/lib/format";
import { useErrorMessage } from "@/lib/use-error-message";
import { cn } from "@/lib/utils";
import { MappingTable } from "./mapping-step";
import { ResultsTable, SummaryCards } from "./results-step";
import {
  type CommitResult,
  type ImportJobSummary,
  type ImportPlan,
  type Mapping,
  REQUIRED,
  STUDENT_FIELDS,
  TEACHER_FIELDS,
  type UploadResult,
} from "./types";

type Step = "upload" | "mapping" | "check" | "done";
const STEPS: Step[] = ["upload", "mapping", "check", "done"];
const JOBS_KEY = ["imports"] as const;

export default function ImportsPage() {
  return (
    <RoleGate roles={["STAFF"]}>
      <ImportWizard />
    </RoleGate>
  );
}

function ImportWizard() {
  const t = useTranslations("imports");
  const tc = useTranslations("common");
  const errorMessage = useErrorMessage();
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("upload");
  const [upload, setUpload] = useState<UploadResult | null>(null);
  const [studentMapping, setStudentMapping] = useState<Mapping>({});
  const [teacherMapping, setTeacherMapping] = useState<Mapping>({});
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [decisions, setDecisions] = useState<Record<string, string>>({});
  const [skipErrors, setSkipErrors] = useState(false);
  const [result, setResult] = useState<CommitResult | null>(null);

  const reset = () => {
    setStep("upload");
    setUpload(null);
    setPlan(null);
    setDecisions({});
    setSkipErrors(false);
    setResult(null);
  };

  const send = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append("file", file);
      return api<UploadResult>("/imports", { method: "POST", body: form });
    },
    onSuccess: (u) => {
      setUpload(u);
      setStudentMapping(u.students?.mapping ?? {});
      setTeacherMapping(u.teachers?.mapping ?? {});
      setStep("mapping");
      void qc.invalidateQueries({ queryKey: JOBS_KEY });
    },
  });

  const body = (extra: object = {}) => ({ studentMapping, teacherMapping, decisions, ...extra });
  const validate = useMutation({
    mutationFn: (d: Record<string, string>) =>
      api<ImportPlan>(`/imports/${upload!.jobId}/validate`, { method: "POST", body: { ...body(), decisions: d } }),
    onSuccess: (p) => {
      setPlan(p);
      setStep("check");
    },
  });
  const commit = useMutation({
    mutationFn: () => api<CommitResult>(`/imports/${upload!.jobId}/commit`, { method: "POST", body: body({ skipErrors }) }),
    onSuccess: (r) => {
      setResult(r);
      setStep("done");
      void qc.invalidateQueries();
    },
  });

  const missingRequired = [...REQUIRED].some((f) => studentMapping[f] === null || studentMapping[f] === undefined);
  const errors = plan ? plan.counts.students.error + plan.counts.teachers.error : 0;

  return (
    <div className="grid max-w-5xl gap-6">
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        actions={
          <Button asChild variant="outline">
            <a href="/api/imports/template" download>
              <Download /> {t("template")}
            </a>
          </Button>
        }
      />

      <ol className="flex flex-wrap gap-2 text-sm">
        {STEPS.map((s, i) => (
          <li
            key={s}
            className={cn(
              "flex items-center gap-2 rounded-full border px-3 py-1",
              s === step ? "border-primary bg-primary text-primary-foreground" : STEPS.indexOf(step) > i ? "text-primary" : "text-muted-foreground",
            )}
          >
            <span className="font-mono">{i + 1}</span> {t(`steps.${s}`)}
          </li>
        ))}
      </ol>

      {step === "upload" && (
        <Card>
          <CardHeader>
            <CardTitle>{t("upload")}</CardTitle>
            <CardDescription>
              {t("templateHint")} {t("googleHint")}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <input
              ref={input}
              type="file"
              accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) send.mutate(file);
                e.target.value = "";
              }}
            />
            <Button size="lg" className="w-fit" disabled={send.isPending} onClick={() => input.current?.click()}>
              <FileUp /> {send.isPending ? t("uploading") : t("upload")}
            </Button>
            {send.isError && <p role="alert" className="text-sm text-destructive">{errorMessage(send.error)}</p>}
          </CardContent>
        </Card>
      )}

      {step === "mapping" && upload?.students && (
        <Card>
          <CardHeader>
            <CardTitle>{t("mappingTitle")} — {upload.fileName}</CardTitle>
            <CardDescription>{t("mappingHint")}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6">
            <div className="grid gap-2">
              <h3 className="font-semibold">{t("sheetStudents", { name: upload.students.name, count: upload.students.rowCount })}</h3>
              <MappingTable sheet={upload.students} fields={STUDENT_FIELDS} mapping={studentMapping} onChange={setStudentMapping} />
            </div>
            {upload.teachers && (
              <div className="grid gap-2">
                <h3 className="font-semibold">{t("sheetTeachers", { name: upload.teachers.name, count: upload.teachers.rowCount })}</h3>
                <MappingTable sheet={upload.teachers} fields={TEACHER_FIELDS} mapping={teacherMapping} onChange={setTeacherMapping} />
              </div>
            )}
            {validate.isError && <p role="alert" className="text-sm text-destructive">{errorMessage(validate.error)}</p>}
            <div className="flex gap-2">
              <Button disabled={missingRequired || validate.isPending} onClick={() => validate.mutate(decisions)}>
                {validate.isPending ? t("checking") : t("check")}
              </Button>
              <Button variant="ghost" onClick={reset}>{tc("cancel")}</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === "check" && plan && (
        <div className="grid gap-4">
          <SummaryCards plan={plan} />
          <ResultsTable
            plan={plan}
            decisions={decisions}
            onDecision={(key, value) => {
              const next = { ...decisions, [key]: value };
              setDecisions(next);
              validate.mutate(next);
            }}
          />
          {errors > 0 && (
            <div className="grid gap-2 rounded-lg border border-destructive/30 p-3 text-sm">
              <p className="text-muted-foreground">{t("fixHint")}</p>
              <label className="flex items-center gap-2">
                <Checkbox checked={skipErrors} onCheckedChange={(v) => setSkipErrors(v === true)} />
                {t("skipErrors")}
              </label>
            </div>
          )}
          {commit.isError && <p role="alert" className="text-sm text-destructive">{errorMessage(commit.error)}</p>}
          <div className="flex flex-wrap gap-2">
            <Button
              size="lg"
              disabled={commit.isPending || validate.isPending || (errors > 0 && !skipErrors) || plan.counts.students.create + plan.counts.teachers.create === 0}
              onClick={() => commit.mutate()}
            >
              {commit.isPending ? t("committing") : t("commit")}
            </Button>
            <Button size="lg" variant="outline" onClick={() => setStep("mapping")}>{tc("back")}</Button>
          </div>
        </div>
      )}

      {step === "done" && result && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="text-primary" /> {t("doneTitle")}
            </CardTitle>
            <CardDescription>{t("created", result.created)}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button asChild>
              <Link href="/students">{t("goStudents")}</Link>
            </Button>
            <Button variant="outline" onClick={reset}>{t("another")}</Button>
          </CardContent>
        </Card>
      )}

      <ImportHistory />
    </div>
  );
}

function ImportHistory() {
  const t = useTranslations("imports");
  const fmt = useFormat();
  const jobs = useQuery({ queryKey: JOBS_KEY, queryFn: () => api<ImportJobSummary[]>("/imports") });
  if (!jobs.data?.length) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("history")}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2 text-sm">
        {jobs.data.map((j) => (
          <div key={j.id} className="flex flex-wrap items-center justify-between gap-2 border-b pb-2 last:border-0">
            <span>
              <span className="font-medium">{j.fileName}</span>
              <span className="text-muted-foreground"> · {fmt.date(j.createdAt)} · {j.createdBy.firstName} {j.createdBy.lastName}</span>
            </span>
            <span className="flex items-center gap-2">
              {j.report?.created && <span className="text-muted-foreground">{t("created", j.report.created)}</span>}
              <Badge variant={j.status === "COMMITTED" ? "default" : "secondary"}>{t(`jobStatus.${j.status}`)}</Badge>
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
