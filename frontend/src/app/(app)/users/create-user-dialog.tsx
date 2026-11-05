"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/api";
import type { Role } from "@/lib/auth";
import { useErrorMessage } from "@/lib/use-error-message";
import { USERS_KEY } from "./types";

const ROLES: Role[] = ["TEACHER", "STAFF", "ADMIN"];
const optional = (s: z.ZodString) => z.union([s, z.literal("")]).transform((v) => v || undefined);

const schema = z
  .object({
    firstName: z.string().trim().min(1),
    lastName: z.string().trim().min(1),
    email: optional(z.string().trim().email()),
    phone: optional(z.string().regex(/^\+[1-9]\d{7,14}$/)),
    role: z.enum(["ADMIN", "STAFF", "TEACHER"]),
    temporaryPassword: z.string().min(10),
  })
  .refine((v) => v.email || v.phone, { path: ["email"], message: "emailOrPhone" });

type FormIn = z.input<typeof schema>;
type FormOut = z.output<typeof schema>;

export function CreateUserDialog() {
  const t = useTranslations("users");
  const tr = useTranslations("roles");
  const tc = useTranslations("common");
  const errorMessage = useErrorMessage();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const form = useForm<FormIn, unknown, FormOut>({
    resolver: zodResolver(schema),
    defaultValues: { firstName: "", lastName: "", email: "", phone: "", role: "TEACHER", temporaryPassword: "" },
  });
  const { errors } = form.formState;

  const create = useMutation({
    mutationFn: (body: FormOut) => api("/users", { method: "POST", body }),
    onSuccess: () => {
      toast.success(t("created"));
      void qc.invalidateQueries({ queryKey: USERS_KEY });
      form.reset();
      setOpen(false);
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus /> {t("add")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("add")}</DialogTitle>
          <DialogDescription>{t("temporaryPasswordHint")}</DialogDescription>
        </DialogHeader>
        <form id="create-user" onSubmit={form.handleSubmit((v) => create.mutate(v))} className="grid gap-4" noValidate>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="firstName">{t("firstName")}</Label>
              <Input id="firstName" aria-invalid={!!errors.firstName} {...form.register("firstName")} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="lastName">{t("lastName")}</Label>
              <Input id="lastName" aria-invalid={!!errors.lastName} {...form.register("lastName")} />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="email">{t("email")}</Label>
            <Input id="email" type="email" dir="ltr" aria-invalid={!!errors.email} {...form.register("email")} />
            {errors.email?.message === "emailOrPhone" && <p className="text-sm text-destructive">{t("emailOrPhone")}</p>}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="phone">{t("phone")}</Label>
            <Input id="phone" type="tel" dir="ltr" placeholder="+21612345678" aria-invalid={!!errors.phone} {...form.register("phone")} />
          </div>
          <div className="grid gap-2">
            <Label>{t("role")}</Label>
            <Controller
              control={form.control}
              name="role"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {tr(r)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="temporaryPassword">{t("temporaryPassword")}</Label>
            <Input id="temporaryPassword" dir="ltr" autoComplete="off" aria-invalid={!!errors.temporaryPassword} {...form.register("temporaryPassword")} />
          </div>
          {create.isError && <p role="alert" className="text-sm text-destructive">{errorMessage(create.error)}</p>}
        </form>
        <DialogFooter>
          <Button type="submit" form="create-user" disabled={create.isPending}>
            {create.isPending ? tc("saving") : tc("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
