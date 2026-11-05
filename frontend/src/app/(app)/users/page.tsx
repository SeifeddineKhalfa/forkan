"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { RoleGate } from "@/components/app-shell/role-gate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/api";
import { useMe } from "@/lib/auth";
import { useErrorMessage } from "@/lib/use-error-message";
import { CreateUserDialog } from "./create-user-dialog";
import { ResetPasswordDialog } from "./reset-password-dialog";
import { type ListedUser, USERS_KEY } from "./types";

export default function UsersPage() {
  return (
    <RoleGate roles={["ADMIN"]}>
      <UsersList />
    </RoleGate>
  );
}

function UsersList() {
  const t = useTranslations("users");
  const tr = useTranslations("roles");
  const tc = useTranslations("common");
  const format = useFormatter();
  const errorMessage = useErrorMessage();
  const qc = useQueryClient();
  const { data: me } = useMe();
  const [resetFor, setResetFor] = useState<ListedUser | null>(null);

  const users = useQuery({ queryKey: USERS_KEY, queryFn: () => api<ListedUser[]>("/users") });
  const toggle = useMutation({
    mutationFn: (u: ListedUser) => api(`/users/${u.id}`, { method: "PATCH", body: { isActive: !u.isActive } }),
    onSuccess: () => {
      toast.success(t("updated"));
      void qc.invalidateQueries({ queryKey: USERS_KEY });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-muted-foreground">{t("subtitle")}</p>
        </div>
        <CreateUserDialog />
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("firstName")}</TableHead>
              <TableHead>{t("email")}</TableHead>
              <TableHead>{t("role")}</TableHead>
              <TableHead>{t("status")}</TableHead>
              <TableHead>{t("lastLogin")}</TableHead>
              <TableHead className="text-end">{tc("actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.isPending && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  {tc("loading")}
                </TableCell>
              </TableRow>
            )}
            {users.isError && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-destructive">
                  {errorMessage(users.error)}
                </TableCell>
              </TableRow>
            )}
            {users.data?.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">
                  {u.firstName} {u.lastName}
                </TableCell>
                <TableCell dir="ltr" className="text-end">
                  {u.email ?? u.phone}
                </TableCell>
                <TableCell>{tr(u.role)}</TableCell>
                <TableCell>
                  <Badge variant={u.isActive ? "default" : "secondary"}>
                    {u.isActive ? t("active") : t("inactive")}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {u.lastLoginAt ? format.dateTime(new Date(u.lastLoginAt), { dateStyle: "short", timeStyle: "short" }) : t("never")}
                </TableCell>
                <TableCell>
                  {u.id !== me?.id && (
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="outline" onClick={() => setResetFor(u)}>
                        {t("resetPassword")}
                      </Button>
                      <Button size="sm" variant="ghost" disabled={toggle.isPending} onClick={() => toggle.mutate(u)}>
                        {u.isActive ? t("deactivate") : t("activate")}
                      </Button>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ResetPasswordDialog user={resetFor} onClose={() => setResetFor(null)} />
    </div>
  );
}
