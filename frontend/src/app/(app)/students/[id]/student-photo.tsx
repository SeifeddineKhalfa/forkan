"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Camera, ImageOff, Trash2, UserRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api, upload } from "@/lib/api";
import type { StudentDetail } from "@/lib/types";
import { useErrorMessage } from "@/lib/use-error-message";

/** Student photo: shown and changeable only when the guardian consented. */
export function StudentPhoto({ student }: { student: StudentDetail }) {
  const t = useTranslations("students");
  const tc = useTranslations("common");
  const errorMessage = useErrorMessage();
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["students", student.id] });

  const save = useMutation({
    mutationFn: (file: File) => upload(`/students/${student.id}/photo`, file),
    onSuccess: refresh,
    onError: (e) => toast.error(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: () => api(`/students/${student.id}/photo`, { method: "DELETE" }),
    onSuccess: refresh,
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <div className="flex items-center gap-4">
      <div className="flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted">
        {student.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- private, cookie-authenticated image
          <img src={`/api/students/${student.id}/photo?v=${encodeURIComponent(student.photoUrl)}`} alt={`${student.firstName} ${student.lastName}`} className="size-full object-cover" />
        ) : student.photoConsent ? (
          <UserRound className="size-10 text-muted-foreground" aria-hidden />
        ) : (
          <ImageOff className="size-8 text-muted-foreground" aria-hidden />
        )}
      </div>
      {student.photoConsent ? (
        <div className="flex flex-wrap gap-2">
          <input
            ref={input}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) save.mutate(file);
              e.target.value = "";
            }}
          />
          <Button size="sm" variant="outline" disabled={save.isPending} onClick={() => input.current?.click()}>
            <Camera /> {save.isPending ? tc("saving") : t("photo")}
          </Button>
          {student.photoUrl && (
            <Button size="sm" variant="ghost" aria-label={tc("remove")} onClick={() => remove.mutate()}>
              <Trash2 />
            </Button>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{t("noPhotoConsent")}</p>
      )}
    </div>
  );
}
