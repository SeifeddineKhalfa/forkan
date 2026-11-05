"use client";

import { Ban } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useMe } from "@/lib/auth";
import { useFormat } from "@/lib/format";
import type { Charge } from "@/lib/types";
import { ChargeStateBadge } from "./charge-state-badge";

/** Charges with their derived state; ADMIN gets a cancel button on cancellable rows. */
export function ChargesTable({
  charges,
  showStudent = false,
  onCancel,
  empty,
}: {
  charges: Charge[] | undefined;
  showStudent?: boolean;
  onCancel: (c: Charge) => void;
  empty?: React.ReactNode;
}) {
  const t = useTranslations("fees");
  const tc = useTranslations("common");
  const fmt = useFormat();
  const { data: me } = useMe();
  const isAdmin = me?.role === "ADMIN";
  const cols = 6 + (showStudent ? 1 : 0) + (isAdmin ? 1 : 0);

  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            {showStudent && <TableHead>{t("student")}</TableHead>}
            <TableHead>{t("label")}</TableHead>
            <TableHead>{t("amount")}</TableHead>
            <TableHead>{t("paid")}</TableHead>
            <TableHead>{t("remaining")}</TableHead>
            <TableHead>{t("dueDate")}</TableHead>
            <TableHead>{t("state")}</TableHead>
            {isAdmin && <TableHead className="w-10"><span className="sr-only">{tc("actions")}</span></TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {charges?.length === 0 && (
            <TableRow>
              <TableCell colSpan={cols} className="text-center text-muted-foreground">{empty ?? t("noCharges")}</TableCell>
            </TableRow>
          )}
          {charges?.map((c) => {
            const remaining = c.status === "CANCELLED" ? 0 : Number(c.amount) - Number(c.paidAmount);
            return (
              <TableRow key={c.id} className={c.status === "CANCELLED" ? "text-muted-foreground" : undefined}>
                {showStudent && (
                  <TableCell>
                    <Link href={`/students/${c.student.id}`} className="font-medium hover:underline">
                      {c.student.firstName} {c.student.lastName}
                    </Link>
                    <span className="block font-mono text-xs text-muted-foreground" dir="ltr">{c.student.code}</span>
                  </TableCell>
                )}
                <TableCell className="max-w-80">
                  {c.label}
                  {c.cancelReason && <span className="block text-xs">{t("cancelled", { reason: c.cancelReason })}</span>}
                </TableCell>
                <TableCell className="whitespace-nowrap">{fmt.money(c.amount)}</TableCell>
                <TableCell className="whitespace-nowrap">{fmt.money(c.paidAmount)}</TableCell>
                <TableCell className="whitespace-nowrap font-medium">{fmt.money(remaining)}</TableCell>
                <TableCell className="whitespace-nowrap">{fmt.date(c.dueDate)}</TableCell>
                <TableCell>
                  <ChargeStateBadge state={c.state} />
                </TableCell>
                {isAdmin && (
                  <TableCell>
                    {c.status === "OPEN" && Number(c.paidAmount) === 0 && (
                      <Button size="icon" variant="ghost" aria-label={t("cancel")} title={t("cancel")} onClick={() => onCancel(c)}>
                        <Ban />
                      </Button>
                    )}
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
