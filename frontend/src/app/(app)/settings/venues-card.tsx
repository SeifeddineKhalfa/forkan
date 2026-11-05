"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MapPin, Plus } from "lucide-react";
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
import { api } from "@/lib/api";
import type { Venue } from "@/lib/types";
import { useErrorMessage } from "@/lib/use-error-message";

export const VENUES_KEY = ["venues"] as const;

function AddRoom({ venueId }: { venueId: string }) {
  const t = useTranslations("settings");
  const errorMessage = useErrorMessage();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [capacity, setCapacity] = useState("");
  const add = useMutation({
    mutationFn: () =>
      api(`/venues/${venueId}/rooms`, { method: "POST", body: { name, capacity: capacity ? Number(capacity) : undefined } }),
    onSuccess: () => {
      setName("");
      setCapacity("");
      void qc.invalidateQueries({ queryKey: VENUES_KEY });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) add.mutate();
      }}
    >
      <Input className="w-40" placeholder={t("roomName")} value={name} onChange={(e) => setName(e.target.value)} />
      <Input className="w-28" type="number" min={1} placeholder={t("capacity")} value={capacity} onChange={(e) => setCapacity(e.target.value)} />
      <Button size="sm" variant="outline" type="submit" disabled={add.isPending}>
        <Plus /> {t("addRoom")}
      </Button>
    </form>
  );
}

export function VenuesCard() {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const errorMessage = useErrorMessage();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", address: "", mapEmbedUrl: "", isPublic: true });

  const venues = useQuery({ queryKey: VENUES_KEY, queryFn: () => api<Venue[]>("/venues") });
  const create = useMutation({
    mutationFn: () => api("/venues", { method: "POST", body: form }),
    onSuccess: () => {
      toast.success(tc("saved"));
      void qc.invalidateQueries({ queryKey: VENUES_KEY });
      setOpen(false);
      setForm({ name: "", address: "", mapEmbedUrl: "", isPublic: true });
    },
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle>{t("venues")}</CardTitle>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus /> {t("addVenue")}
        </Button>
      </CardHeader>
      <CardContent className="grid gap-4">
        {venues.data?.map((v) => (
          <div key={v.id} className="grid gap-3 rounded-lg border p-4">
            <div className="flex flex-wrap items-center gap-2">
              <MapPin className="size-4 text-muted-foreground" aria-hidden />
              <span className="font-semibold">{v.name}</span>
              {v.isPublic && <Badge variant="secondary">{t("publicVenue")}</Badge>}
              {v.address && <span className="text-sm text-muted-foreground">— {v.address}</span>}
            </div>
            <div className="flex flex-wrap gap-2">
              {v.rooms.length === 0 && <span className="text-sm text-muted-foreground">{t("noRooms")}</span>}
              {v.rooms.map((r) => (
                <Badge key={r.id} variant="outline">
                  {r.name}
                  {r.capacity ? ` (${r.capacity})` : ""}
                </Badge>
              ))}
            </div>
            <AddRoom venueId={v.id} />
          </div>
        ))}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("addVenue")}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <Field label={t("venueName")} htmlFor="v-name">
              <Input id="v-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label={t("address")} htmlFor="v-address" hint={tc("optional")}>
              <Input id="v-address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </Field>
            <Field label={t("mapUrl")} htmlFor="v-map" hint={tc("optional")}>
              <Input id="v-map" dir="ltr" value={form.mapEmbedUrl} onChange={(e) => setForm({ ...form, mapEmbedUrl: e.target.value })} />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={form.isPublic} onCheckedChange={(v) => setForm({ ...form, isPublic: v === true })} />
              {t("publicVenue")}
            </label>
            {create.isError && <p className="text-sm text-destructive">{errorMessage(create.error)}</p>}
          </div>
          <DialogFooter>
            <Button disabled={create.isPending || !form.name.trim()} onClick={() => create.mutate()}>
              {tc("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
