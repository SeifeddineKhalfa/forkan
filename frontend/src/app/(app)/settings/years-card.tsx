"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Field } from "@/components/form/field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/api";
import { toDateInput, useFormat } from "@/lib/format";
import type { AcademicYear } from "@/lib/types";
import { useErrorMessage } from "@/lib/use-error-message";

export const YEARS_KEY = ["academic-years"] as const;

/** In school-year order, September first. */
const SCHOOL_MONTHS = [9, 10, 11, 12, 1, 2, 3, 4, 5, 6, 7, 8];

interface YearForm {
  name: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  billableMonths: number[];
  membershipFee: string;
  membershipWindowStart: string;
  membershipWindowEnd: string;
}

const emptyForm = (): YearForm => {
  const y = new Date().getFullYear() + 1;
  return {
    name: `${y}-${y + 1}`,
    startDate: `${y}-09-01`,
    endDate: `${y + 1}-06-30`,
    isCurrent: false,
    billableMonths: [9, 10, 11, 12, 1, 2, 3, 4, 5, 6],
    membershipFee: "",
    membershipWindowStart: "",
    membershipWindowEnd: "",
  };
};

export function YearsCard() {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const te = useTranslations("enums");
  const fmt = useFormat();
  const errorMessage = useErrorMessage();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<AcademicYear | "new" | null>(null);
  const [form, setForm] = useState<YearForm>(emptyForm);

  const years = useQuery({ queryKey: YEARS_KEY, queryFn: () => api<AcademicYear[]>("/academic-years") });

  const save = useMutation({
    mutationFn: () => {
      const membership = {
        membershipFee: form.membershipFee || null,
        membershipWindowStart: form.membershipWindowStart || null,
        membershipWindowEnd: form.membershipWindowEnd || null,
      };
      return editing === "new"
        ? api("/academic-years", { method: "POST", body: { ...form, ...membership } })
        : api(`/academic-years/${(editing as AcademicYear).id}`, {
            method: "PATCH",
            body: { ...membership, billableMonths: form.billableMonths, isCurrent: form.isCurrent || undefined },
          });
    },
    onSuccess: () => {
      toast.success(tc("saved"));
      void qc.invalidateQueries({ queryKey: YEARS_KEY });
      setEditing(null);
    },
  });

  const open = (y: AcademicYear | "new") => {
    save.reset();
    setForm(
      y === "new"
        ? emptyForm()
        : {
            name: y.name,
            startDate: toDateInput(y.startDate),
            endDate: toDateInput(y.endDate),
            isCurrent: y.isCurrent,
            billableMonths: y.billableMonths,
            membershipFee: y.membershipFee ?? "",
            membershipWindowStart: toDateInput(y.membershipWindowStart),
            membershipWindowEnd: toDateInput(y.membershipWindowEnd),
          },
    );
    setEditing(y);
  };
  const set = <K extends keyof YearForm>(k: K, v: YearForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle>{t("years")}</CardTitle>
        <Button size="sm" onClick={() => open("new")}>
          <Plus /> {t("addYear")}
        </Button>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("yearName")}</TableHead>
              <TableHead>{t("startDate")}</TableHead>
              <TableHead>{t("endDate")}</TableHead>
              <TableHead>{t("membership")}</TableHead>
              <TableHead className="text-end">{tc("actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {years.data?.map((y) => (
              <TableRow key={y.id}>
                <TableCell className="font-medium">
                  {y.name} {y.isCurrent && <Badge className="ms-2">{t("current")}</Badge>}
                </TableCell>
                <TableCell>{fmt.date(y.startDate)}</TableCell>
                <TableCell>{fmt.date(y.endDate)}</TableCell>
                <TableCell>
                  {y.membershipFee ? (
                    <>
                      {fmt.money(y.membershipFee)}
                      {y.membershipWindowStart && (
                        <span className="block text-xs text-muted-foreground">
                          {fmt.date(y.membershipWindowStart)} ← {fmt.date(y.membershipWindowEnd)}
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-muted-foreground">{t("noMembership")}</span>
                  )}
                </TableCell>
                <TableCell className="text-end">
                  <Button size="sm" variant="outline" onClick={() => open(y)}>
                    {tc("edit")}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing === "new" ? t("addYear") : form.name}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            {editing === "new" && (
              <>
                <Field label={t("yearName")} htmlFor="y-name">
                  <Input id="y-name" dir="ltr" value={form.name} onChange={(e) => set("name", e.target.value)} />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label={t("startDate")} htmlFor="y-start">
                    <Input id="y-start" type="date" value={form.startDate} onChange={(e) => set("startDate", e.target.value)} />
                  </Field>
                  <Field label={t("endDate")} htmlFor="y-end">
                    <Input id="y-end" type="date" value={form.endDate} onChange={(e) => set("endDate", e.target.value)} />
                  </Field>
                </div>
              </>
            )}
            <Field label={t("billableMonths")} hint={t("billableMonthsHint")}>
              <div className="flex flex-wrap gap-1.5">
                {SCHOOL_MONTHS.map((m) => {
                  const on = form.billableMonths.includes(m);
                  return (
                    <Button
                      key={m}
                      type="button"
                      size="sm"
                      variant={on ? "default" : "outline"}
                      aria-pressed={on}
                      onClick={() =>
                        set("billableMonths", on ? form.billableMonths.filter((x) => x !== m) : [...form.billableMonths, m])
                      }
                    >
                      {te(`month.${m}` as "month.1")}
                    </Button>
                  );
                })}
              </div>
            </Field>
            <Field label={t("membershipFee")} htmlFor="y-fee" hint={tc("optional")}>
              <Input id="y-fee" dir="ltr" inputMode="decimal" value={form.membershipFee} onChange={(e) => set("membershipFee", e.target.value)} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={`${t("membershipWindow")} — ${t("startDate")}`} htmlFor="y-ws">
                <Input id="y-ws" type="date" value={form.membershipWindowStart} onChange={(e) => set("membershipWindowStart", e.target.value)} />
              </Field>
              <Field label={t("endDate")} htmlFor="y-we">
                <Input id="y-we" type="date" value={form.membershipWindowEnd} onChange={(e) => set("membershipWindowEnd", e.target.value)} />
              </Field>
            </div>
            {!(editing !== "new" && editing?.isCurrent) && (
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={form.isCurrent} onCheckedChange={(v) => set("isCurrent", v === true)} />
                {t("makeCurrent")}
              </label>
            )}
            {save.isError && <p className="text-sm text-destructive">{errorMessage(save.error)}</p>}
          </div>
          <DialogFooter>
            <Button disabled={save.isPending} onClick={() => save.mutate()}>
              {save.isPending ? tc("saving") : tc("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
