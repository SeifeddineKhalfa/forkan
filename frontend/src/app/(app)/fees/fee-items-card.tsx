"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { FEE_ITEMS_KEY } from "@/components/fees/charge-dialog";
import { Field } from "@/components/form/field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/api";
import { useFormat } from "@/lib/format";
import type { FeeItem } from "@/lib/types";
import { useErrorMessage } from "@/lib/use-error-message";

/** The catalog of one-off fees (registration, books, trip…). */
export function FeeItemsCard() {
  const t = useTranslations("fees");
  const tc = useTranslations("common");
  const fmt = useFormat();
  const errorMessage = useErrorMessage();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<FeeItem | "new" | null>(null);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const items = useQuery({ queryKey: FEE_ITEMS_KEY, queryFn: () => api<FeeItem[]>("/fee-items") });
  const refresh = () => void qc.invalidateQueries({ queryKey: FEE_ITEMS_KEY });

  const save = useMutation({
    mutationFn: () =>
      editing === "new"
        ? api("/fee-items", { method: "POST", body: { name, defaultAmount: amount } })
        : api(`/fee-items/${(editing as FeeItem).id}`, { method: "PATCH", body: { name, defaultAmount: amount } }),
    onSuccess: () => {
      toast.success(tc("saved"));
      refresh();
      setEditing(null);
    },
  });
  const toggle = useMutation({
    mutationFn: (i: FeeItem) => api(`/fee-items/${i.id}`, { method: "PATCH", body: { isActive: !i.isActive } }),
    onSuccess: refresh,
    onError: (e) => toast.error(errorMessage(e)),
  });

  const open = (i: FeeItem | "new") => {
    save.reset();
    setName(i === "new" ? "" : i.name);
    setAmount(i === "new" ? "" : i.defaultAmount);
    setEditing(i);
  };

  return (
    <Card className="max-w-3xl">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle>{t("items")}</CardTitle>
        <Button size="sm" onClick={() => open("new")}>
          <Plus /> {t("addItem")}
        </Button>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("itemName")}</TableHead>
              <TableHead>{t("amount")}</TableHead>
              <TableHead>{tc("active")}</TableHead>
              <TableHead className="text-end">{tc("actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.data?.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">{t("noItems")}</TableCell>
              </TableRow>
            )}
            {items.data?.map((i) => (
              <TableRow key={i.id} className={i.isActive ? undefined : "text-muted-foreground"}>
                <TableCell className="font-medium">{i.name}</TableCell>
                <TableCell>{fmt.money(i.defaultAmount)}</TableCell>
                <TableCell>
                  <Switch checked={i.isActive} aria-label={tc("active")} onCheckedChange={() => toggle.mutate(i)} />
                </TableCell>
                <TableCell className="text-end">
                  <Button size="sm" variant="outline" onClick={() => open(i)}>{tc("edit")}</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing === "new" ? t("addItem") : name}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <Field label={t("itemName")} htmlFor="fi-name">
              <Input id="fi-name" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label={t("defaultAmount")} htmlFor="fi-amount">
              <Input id="fi-amount" dir="ltr" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </Field>
            {save.isError && <p role="alert" className="text-sm text-destructive">{errorMessage(save.error)}</p>}
          </div>
          <DialogFooter>
            <Button disabled={!name || !amount || save.isPending} onClick={() => save.mutate()}>
              {save.isPending ? tc("saving") : tc("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
