"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Crown, FileText, Lock, LockOpen, Pencil, Plus, Printer, Trash2, Trophy, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import { useMe } from "@/lib/auth";
import { useFormat } from "@/lib/format";
import type { EvaluationBranch, EvaluationCandidate, EvaluationDetail } from "@/lib/types";
import { useErrorMessage } from "@/lib/use-error-message";
import { type JurorDraft, JuryEditor, jurorDrafts, juryPayload } from "../jury-editor";
import { AddCandidateDialog, AddFromClassDialog, BranchDialog, ConfirmDialog } from "./dialogs";
import { CandidateStateBadge, Score } from "./score";

export default function EvaluationPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations("evaluations");
  const tc = useTranslations("common");
  const fmt = useFormat();
  const errorMessage = useErrorMessage();
  const router = useRouter();
  const qc = useQueryClient();
  const { data: me } = useMe();
  const e = useQuery({ queryKey: ["evaluation", id], queryFn: () => api<EvaluationDetail>(`/evaluations/${id}`) });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["evaluations"] });
    void qc.invalidateQueries({ queryKey: ["evaluation", id] });
  };

  const [confirm, setConfirm] = useState<"close" | "delete" | null>(null);
  const status = useMutation({
    mutationFn: (action: "close" | "reopen") => api(`/evaluations/${id}/${action}`, { method: "POST" }),
    onSuccess: (_, action) => {
      refresh();
      setConfirm(null);
      toast.success(action === "close" ? t("closed") : t("reopened"));
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const remove = useMutation({
    mutationFn: () => api(`/evaluations/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["evaluations"] });
      router.push("/evaluations");
    },
  });

  if (e.isError) return <p className="text-destructive">{errorMessage(e.error)}</p>;
  if (!e.data) return <p className="text-muted-foreground">{tc("loading")}</p>;
  const ev = e.data;
  const open = ev.status === "OPEN";
  const manage = ev.canManage && open;
  const isAdmin = me?.role === "ADMIN";

  return (
    <div className="grid gap-6">
      <PageHeader
        backHref="/evaluations"
        title={ev.title}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Badge variant={ev.kind === "COMPETITION" ? "default" : "secondary"}>{t(`kind.${ev.kind}`)}</Badge>
            <Badge variant="outline">{t(`status.${ev.status}`)}</Badge>
            <span>{fmt.date(ev.date)}</span>
            {ev.location && <span>· {ev.location}</span>}
            {ev.class && (
              <Link href={`/classes/${ev.class.id}`} className="hover:underline">
                · {ev.class.name}
              </Link>
            )}
          </span>
        }
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href={`/evaluations/${id}/results`}>
                <Trophy /> {t("results")}
              </Link>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">
                  <Printer /> {t("print")}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <Link href={`/evaluations/${id}/print`}>{t("printBlank")}</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href={`/evaluations/${id}/print?filled=1`}>{t("printFilled")}</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href={`/evaluations/${id}/results?print=1`}>{t("printResults")}</Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {ev.canManage && open && (
              <Button onClick={() => setConfirm("close")}>
                <Lock /> {t("close")}
              </Button>
            )}
            {isAdmin && !open && (
              <Button variant="outline" disabled={status.isPending} onClick={() => status.mutate("reopen")}>
                <LockOpen /> {t("reopen")}
              </Button>
            )}
            {isAdmin && (
              <Button variant="ghost" size="icon" aria-label={t("delete")} onClick={() => setConfirm("delete")}>
                <Trash2 />
              </Button>
            )}
          </>
        }
      />

      {!open && (
        <Alert>
          <Lock className="size-4" />
          <AlertDescription>{t("closedNotice")}</AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="candidates">
        <TabsList>
          <TabsTrigger value="candidates">
            {t("candidates")} <Badge variant="secondary" className="ms-1">{ev.candidates.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="branches">{t("branches")}</TabsTrigger>
          <TabsTrigger value="jury">{t("jury")}</TabsTrigger>
        </TabsList>
        <TabsContent value="candidates">
          <CandidatesTab ev={ev} manage={manage} />
        </TabsContent>
        <TabsContent value="branches">
          <BranchesTab ev={ev} manage={manage} />
        </TabsContent>
        <TabsContent value="jury">
          <JuryTab ev={ev} manage={manage} />
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={confirm === "close"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={t("close")}
        description={t("closeConfirm")}
        confirmLabel={t("close")}
        pending={status.isPending}
        onConfirm={() => status.mutate("close")}
      />
      <ConfirmDialog
        open={confirm === "delete"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={t("delete")}
        description={t("deleteConfirm", { title: ev.title })}
        confirmLabel={t("delete")}
        destructive
        pending={remove.isPending}
        error={remove.isError ? errorMessage(remove.error) : null}
        onConfirm={() => remove.mutate()}
      />
    </div>
  );
}

function CandidatesTab({ ev, manage }: { ev: EvaluationDetail; manage: boolean }) {
  const t = useTranslations("evaluations");
  const tc = useTranslations("common");
  const errorMessage = useErrorMessage();
  const qc = useQueryClient();
  const [branchFilter, setBranchFilter] = useState("ALL");
  const [adding, setAdding] = useState(false);
  const [fromClass, setFromClass] = useState(false);
  const [removing, setRemoving] = useState<EvaluationCandidate | null>(null);
  const branchName = new Map(ev.branches.map((b) => [b.id, b]));
  const rows = ev.candidates.filter((c) => branchFilter === "ALL" || c.branchId === branchFilter);
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["evaluations"] });
    void qc.invalidateQueries({ queryKey: ["evaluation", ev.id] });
  };
  const move = useMutation({
    mutationFn: (p: { candidateId: string; branchId: string }) =>
      api(`/evaluations/${ev.id}/candidates/${p.candidateId}`, { method: "PATCH", body: { branchId: p.branchId } }),
    onSuccess: refresh,
    onError: (err) => toast.error(errorMessage(err)),
  });
  const remove = useMutation({
    mutationFn: (candidateId: string) => api(`/evaluations/${ev.id}/candidates/${candidateId}`, { method: "DELETE" }),
    onSuccess: () => {
      refresh();
      setRemoving(null);
    },
  });

  return (
    <div className="grid gap-4 pt-2">
      <div className="flex flex-wrap items-center gap-2">
        {ev.branches.length > 1 && (
          <Select value={branchFilter} onValueChange={setBranchFilter}>
            <SelectTrigger className="w-44" aria-label={t("branch")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">{t("branch")}: {tc("all")}</SelectItem>
              {ev.branches.map((b) => (
                <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {manage && (
          <div className="ms-auto flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setFromClass(true)}>
              <Users /> {t("addFromClass")}
            </Button>
            <Button onClick={() => setAdding(true)}>
              <Plus /> {t("addCandidate")}
            </Button>
          </div>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-14">{t("number")}</TableHead>
              <TableHead>{t("fullName")}</TableHead>
              <TableHead>{t("branch")}</TableHead>
              <TableHead>{t("hifz")}</TableHead>
              <TableHead>{t("tajwid")}</TableHead>
              <TableHead>{t("total")}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">{t("noCandidates")}</TableCell>
              </TableRow>
            )}
            {rows.map((c) => {
              const b = branchName.get(c.branchId)!;
              return (
                <TableRow key={c.id}>
                  <TableCell className="font-mono" dir="ltr">{String(c.number).padStart(2, "0")}</TableCell>
                  <TableCell>
                    {c.studentId ? (
                      <Link href={`/students/${c.studentId}`} className="font-medium hover:underline">{c.fullName}</Link>
                    ) : (
                      <span className="font-medium">{c.fullName}</span>
                    )}
                    <span className="block text-xs text-muted-foreground" dir={c.studentCode ? "ltr" : undefined}>
                      {c.studentCode ?? t("external")}
                    </span>
                  </TableCell>
                  <TableCell>
                    {manage && ev.branches.length > 1 ? (
                      <Select value={c.branchId} onValueChange={(v) => move.mutate({ candidateId: c.id, branchId: v })}>
                        <SelectTrigger size="sm" className="w-36" aria-label={t("changeBranch")}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ev.branches.map((x) => (
                            <SelectItem key={x.id} value={x.id}>{x.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      b.name
                    )}
                  </TableCell>
                  <TableCell><Score value={c.hifzScore} max={b.hifzMax} /></TableCell>
                  <TableCell><Score value={c.tajwidScore} max={b.tajwidMax} /></TableCell>
                  <TableCell>
                    {c.state === "SCORED" ? (
                      <span className="flex items-center gap-2">
                        <Score value={c.total} max={b.maxTotal} strong />
                        {c.passed !== null && (
                          <Badge variant={c.passed ? "default" : "destructive"} className="font-normal">
                            {c.passed ? t("passed") : t("failed")}
                          </Badge>
                        )}
                      </span>
                    ) : (
                      <CandidateStateBadge state={c.state} />
                    )}
                  </TableCell>
                  <TableCell className="text-end whitespace-nowrap">
                    <Button size="sm" variant={c.state === "PENDING" && ev.canScore ? "default" : "outline"} asChild>
                      <Link href={`/evaluations/${ev.id}/candidates/${c.id}`}>
                        <FileText /> {t("openCard")}
                      </Link>
                    </Button>
                    {manage && (
                      <Button size="icon" variant="ghost" aria-label={t("removeCandidate")} onClick={() => setRemoving(c)}>
                        <Trash2 />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <AddCandidateDialog evaluationId={ev.id} branches={ev.branches} open={adding} onOpenChange={setAdding} />
      <AddFromClassDialog evaluationId={ev.id} branches={ev.branches} defaultClassId={ev.class?.id} open={fromClass} onOpenChange={setFromClass} />
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={t("removeCandidate")}
        description={removing ? t("removeCandidateConfirm", { name: removing.fullName }) : undefined}
        confirmLabel={tc("remove")}
        destructive
        pending={remove.isPending}
        error={remove.isError ? errorMessage(remove.error) : null}
        onConfirm={() => removing && remove.mutate(removing.id)}
      />
    </div>
  );
}

function BranchesTab({ ev, manage }: { ev: EvaluationDetail; manage: boolean }) {
  const t = useTranslations("evaluations");
  const tc = useTranslations("common");
  const errorMessage = useErrorMessage();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<EvaluationBranch | "new" | null>(null);
  const remove = useMutation({
    mutationFn: (branchId: string) => api(`/evaluations/${ev.id}/branches/${branchId}`, { method: "DELETE" }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["evaluation", ev.id] }),
    onError: (err) => toast.error(errorMessage(err)),
  });

  return (
    <div className="grid gap-4 pt-2">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {ev.branches.map((b) => (
          <Card key={b.id}>
            <CardHeader className="flex flex-row items-start justify-between gap-2">
              <div className="grid gap-1">
                <CardTitle className="font-heading text-lg">{b.name}</CardTitle>
                {b.quranScope && <p className="text-sm text-muted-foreground">{b.quranScope}</p>}
              </div>
              {manage && (
                <div className="flex">
                  <Button size="icon" variant="ghost" aria-label={tc("edit")} onClick={() => setEditing(b)}>
                    <Pencil />
                  </Button>
                  <Button size="icon" variant="ghost" aria-label={t("removeBranch")} disabled={remove.isPending} onClick={() => remove.mutate(b.id)}>
                    <Trash2 />
                  </Button>
                </div>
              )}
            </CardHeader>
            <CardContent className="grid gap-1 text-sm">
              <span>{t("scale", { hifz: Number(b.hifzMax), tajwid: Number(b.tajwidMax), total: Number(b.maxTotal) })}</span>
              <span className="text-muted-foreground">
                {t("questionCount")}: {b.questionCount}
                {b.passScore !== null && <> · {t("passMark", { score: Number(b.passScore) })}</>}
              </span>
              <span className="text-muted-foreground">{t("candidatesCount", { count: b.candidates ?? 0 })}</span>
            </CardContent>
          </Card>
        ))}
      </div>
      {manage && (
        <Button variant="outline" className="justify-self-start" onClick={() => setEditing("new")}>
          <Plus /> {t("addBranch")}
        </Button>
      )}
      <BranchDialog
        evaluationId={ev.id}
        branch={editing === "new" || editing === null ? undefined : editing}
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
      />
    </div>
  );
}

function JuryTab({ ev, manage }: { ev: EvaluationDetail; manage: boolean }) {
  const t = useTranslations("evaluations");
  const tc = useTranslations("common");
  const errorMessage = useErrorMessage();
  const qc = useQueryClient();
  const [draft, setDraft] = useState<JurorDraft[]>(() => jurorDrafts(ev.jurors));
  const save = useMutation({
    mutationFn: () => api(`/evaluations/${ev.id}/jurors`, { method: "PUT", body: { jurors: juryPayload(draft) } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["evaluation", ev.id] });
      toast.success(tc("saved"));
    },
  });

  if (!manage) {
    return (
      <Card className="mt-2">
        <CardContent className="grid gap-2">
          {ev.jurors.length === 0 && <p className="text-muted-foreground">{t("noJury")}</p>}
          {ev.jurors.map((j) => (
            <span key={j.id} className="flex items-center gap-2">
              {j.isPresident && <Crown className="size-4 text-gold" aria-label={t("president")} />}
              {j.name}
              {j.isPresident && <span className="text-xs text-muted-foreground">({t("president")})</span>}
            </span>
          ))}
        </CardContent>
      </Card>
    );
  }
  return (
    <Card className="mt-2">
      <CardContent className="grid gap-4">
        <JuryEditor value={draft} onChange={setDraft} />
        {save.isError && <p role="alert" className="text-sm text-destructive">{errorMessage(save.error)}</p>}
        <Button className="justify-self-start" disabled={save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? tc("saving") : t("saveJury")}
        </Button>
      </CardContent>
    </Card>
  );
}
