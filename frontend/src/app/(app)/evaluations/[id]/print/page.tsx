"use client";

import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { useTranslations } from "next-intl";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { StarMark } from "@/components/brand/star-mark";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/api";
import { useQuranMeta } from "@/lib/quran";
import type { EvaluationBranch, EvaluationCards, EvaluationQuestion, QuranMeta } from "@/lib/types";
import { useErrorMessage } from "@/lib/use-error-message";
import { mark } from "../score";

/**
 * The school's «بطاقة تقييم», two per A4 landscape page: blank for the jury to fill by hand
 * (candidate, branch and any passage already chosen are printed), or filled from the saved cards.
 */
export default function PrintCardsPage() {
  return (
    <Suspense>
      <PrintCards />
    </Suspense>
  );
}

function PrintCards() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations("evaluations");
  const tc = useTranslations("common");
  const errorMessage = useErrorMessage();
  const router = useRouter();
  const params = useSearchParams();
  const filled = params.get("filled") === "1";
  const branchId = params.get("branch") ?? "ALL";
  const data = useQuery({ queryKey: ["evaluation", id, "cards"], queryFn: () => api<EvaluationCards>(`/evaluations/${id}/cards`) });
  const meta = useQuranMeta();
  if (data.isError) return <p className="text-destructive">{errorMessage(data.error)}</p>;
  if (!data.data || !meta.data) return <p className="text-muted-foreground">{tc("loading")}</p>;

  const { evaluation, branches, jurors, cards } = data.data;
  const branchOf = new Map(branches.map((b) => [b.id, b]));
  const shown = cards.filter((c) => branchId === "ALL" || c.candidate.branchId === branchId);
  const setParam = (k: string, v: string | null) => {
    const next = new URLSearchParams(params);
    if (v === null) next.delete(k);
    else next.set(k, v);
    router.replace(`?${next}`);
  };

  return (
    <div className="grid gap-4">
      <style>{"@page { size: A4 landscape; margin: 8mm; }"}</style>
      <div className="print:hidden">
        <PageHeader
          backHref={`/evaluations/${id}`}
          title={t("printCards")}
          subtitle={evaluation.title}
          actions={
            <>
              <Select value={filled ? "filled" : "blank"} onValueChange={(v) => setParam("filled", v === "filled" ? "1" : null)}>
                <SelectTrigger className="w-48" aria-label={t("printCards")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="blank">{t("printBlank")}</SelectItem>
                  <SelectItem value="filled">{t("printFilled")}</SelectItem>
                </SelectContent>
              </Select>
              {branches.length > 1 && (
                <Select value={branchId} onValueChange={(v) => setParam("branch", v === "ALL" ? null : v)}>
                  <SelectTrigger className="w-40" aria-label={t("branch")}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">{t("branch")}: {tc("all")}</SelectItem>
                    {branches.map((b) => (
                      <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Button onClick={() => window.print()} disabled={shown.length === 0}>
                <Printer /> {t("print")}
              </Button>
            </>
          }
        />
      </div>
      {shown.length === 0 && <p className="text-muted-foreground print:hidden">{t("noCandidates")}</p>}
      <div className="grid gap-6 print:block">
        {shown.map(({ candidate, questions }, i) => (
          <PaperCard
            key={candidate.id}
            pageBreak={i % 2 === 1 && i < shown.length - 1}
            date={evaluation.date}
            name={candidate.fullName}
            number={candidate.number}
            branch={branchOf.get(candidate.branchId)!}
            questions={questions}
            meta={meta.data}
            jurors={jurors.map((j) => j.name)}
            scores={
              filled
                ? { absent: candidate.absent, hifz: candidate.hifzScore, tajwid: candidate.tajwidScore, total: candidate.total, notes: candidate.notes }
                : null
            }
          />
        ))}
      </div>
    </div>
  );
}

function PaperCard({
  date,
  name,
  number,
  branch,
  questions,
  meta,
  jurors,
  scores,
  pageBreak,
}: {
  date: string;
  name: string;
  number: number;
  branch: EvaluationBranch;
  questions: EvaluationQuestion[];
  meta: QuranMeta;
  jurors: string[];
  scores: { absent: boolean; hifz: string | null; tajwid: string | null; total: string | null; notes: string | null } | null;
  pageBreak: boolean;
}) {
  const t = useTranslations("evaluations");
  const tApp = useTranslations("app");
  const rows = Array.from({ length: branch.questionCount }, (_, i) => questions.find((q) => q.number === i + 1));
  const passage = (q?: EvaluationQuestion) =>
    q?.surahId ? `${meta.surahs[q.surahId - 1]?.nameAr ?? ""}${q.ayah ? ` – ${q.ayah}` : ""}` : "";
  const cell = "border border-foreground/70 px-2 py-1";

  return (
    <section
      className="mx-auto w-full max-w-5xl break-inside-avoid bg-background p-4 text-[13px] text-foreground print:max-w-none print:p-0 print:pb-[6mm]"
      style={pageBreak ? { breakAfter: "page" } : undefined}
    >
      <header className="mb-2 grid grid-cols-3 items-center">
        <div className="flex items-center gap-2">
          <StarMark className="size-10 text-gold" />
          <span className="text-xs font-bold">{tApp("name")}</span>
        </div>
        <h2 className="text-center font-heading text-2xl tracking-[0.3em]">{t("cardTitle")}</h2>
        <p className="text-end text-xs">
          {t("date")}: <span dir="ltr">{date.slice(0, 10).split("-").reverse().join("-")}</span>
        </p>
      </header>
      <table className="w-full table-fixed border-collapse">
        <colgroup>
          <col className="w-[7%]" />
          <col className="w-[18%]" />
          <col className="w-[37%]" />
          <col className="w-[8%]" />
          <col className="w-[8%]" />
          <col className="w-[22%]" />
        </colgroup>
        <tbody>
          <tr>
            <td colSpan={2} className={`${cell} align-top`}>
              <span className="font-bold">{t("contestant")}:</span>
            </td>
            <td className={`${cell} text-base font-bold`}>
              <span className="font-mono text-xs text-muted-foreground" dir="ltr">{String(number).padStart(2, "0")}</span> {name}
            </td>
            <td colSpan={3} className={cell}>
              <span className="font-bold">{t("branch")}:</span> {branch.name}
            </td>
          </tr>
          <tr>
            <td colSpan={3} className={cell}>
              {branch.quranScope}
            </td>
            <td colSpan={3} className={`${cell} text-base`}>
              <span className="font-bold">{t("outOf", { max: mark(branch.maxTotal) })}:</span>{" "}
              <span dir="ltr" className="font-mono font-bold">{scores ? (scores.absent ? t("absent") : mark(scores.total)) : ""}</span>
            </td>
          </tr>
          <tr className="text-center text-xs font-bold">
            <td rowSpan={2} className={cell}>{t("questionNumber")}</td>
            <td rowSpan={2} className={cell}>{t("question")}</td>
            <td rowSpan={2} className={cell}>{t("mistakes")}</td>
            <td className={cell}>{t("hifz")}</td>
            <td className={cell}>{t("tajwid")}</td>
            <td rowSpan={2} className={cell}>{t("notes")}</td>
          </tr>
          <tr className="text-center text-xs">
            <td className={cell} dir="ltr">/{mark(branch.hifzMax)}</td>
            <td className={cell} dir="ltr">/{mark(branch.tajwidMax)}</td>
          </tr>
          {rows.map((q, i) => (
            <tr key={i} className="h-9">
              <td className={`${cell} text-center font-bold`} dir="ltr">{String(i + 1).padStart(2, "0")}</td>
              <td className={cell}>{passage(q)}</td>
              <td className={`${cell} text-xs`}>
                {scores && q && (q.tanbihCount > 0 || q.tashihCount > 0) && (
                  <span className="block font-bold">
                    {t("tanbih")}: {q.tanbihCount} · {t("tashih")}: {q.tashihCount}
                  </span>
                )}
                {scores ? q?.mistakes : ""}
              </td>
              {/* One mark for the whole card: the column spans every question. */}
              {i === 0 && (
                <>
                  <td rowSpan={rows.length} className={`${cell} text-center font-mono text-base`} dir="ltr">
                    {scores && !scores.absent ? mark(scores.hifz) : ""}
                  </td>
                  <td rowSpan={rows.length} className={`${cell} text-center font-mono text-base`} dir="ltr">
                    {scores && !scores.absent ? mark(scores.tajwid) : ""}
                  </td>
                  <td rowSpan={rows.length} className={`${cell} align-top text-xs`}>{scores?.notes}</td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      <footer className="mt-3 flex flex-wrap gap-x-8 gap-y-1 text-xs">
        <span className="font-bold">{t("jurySignature")}:</span>
        {jurors.map((j) => (
          <span key={j} className="min-w-40 border-b border-dotted border-foreground/60 pb-4">{j}</span>
        ))}
      </footer>
    </section>
  );
}
