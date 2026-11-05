"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Copy, MessageCircle, Newspaper } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Field } from "@/components/form/field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { useMe } from "@/lib/auth";
import type { SessionDetail } from "@/lib/types";
import { useErrorMessage } from "@/lib/use-error-message";
import { fillTemplate, useSettings } from "@/lib/whatsapp";

export interface CancelTarget {
  classId: string;
  className: string;
  date: string;
  startTime: string;
  endTime?: string | null;
}

/** Cancel with a reason, then share the prepared announcement (WhatsApp group, copy, news). */
export function CancelSessionDialog({ target, onClose }: { target: CancelTarget | null; onClose: () => void }) {
  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">{target && <Body target={target} onClose={onClose} />}</DialogContent>
    </Dialog>
  );
}

function Body({ target, onClose }: { target: CancelTarget; onClose: () => void }) {
  const t = useTranslations("attendance");
  const tc = useTranslations("common");
  const errorMessage = useErrorMessage();
  const qc = useQueryClient();
  const { data: me } = useMe();
  const settings = useSettings();
  const [reason, setReason] = useState("");
  const [resumeDate, setResumeDate] = useState("");
  const [text, setText] = useState<string | null>(null);
  const [title, setTitle] = useState(t("newsTitleDefault", { className: target.className }));
  const [sessionId, setSessionId] = useState<string | null>(null);

  const cancel = useMutation({
    mutationFn: () =>
      api<{ session: SessionDetail; announcement: string }>("/sessions/cancel", {
        method: "POST",
        body: { ...target, className: undefined, endTime: target.endTime ?? undefined, reason, resumeDate: resumeDate || undefined },
      }),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ["attendance"] });
      setSessionId(res.session.id);
      const template = settings.data?.whatsappTemplates.CLASS_ANNOUNCEMENT ?? "{{text}}";
      setText(fillTemplate(template, { text: res.announcement }));
    },
  });
  const publish = useMutation({
    mutationFn: () => api(`/sessions/${sessionId}/publish`, { method: "POST", body: { title, text } }),
    onSuccess: () => toast.success(t("published")),
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (text !== null) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>{t("announcement")}</DialogTitle>
          <DialogDescription>{t("announcementHint")}</DialogDescription>
        </DialogHeader>
        <Textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} />
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => void navigator.clipboard.writeText(text).then(() => toast.success(t("copied")))}
          >
            <Copy /> {t("copy")}
          </Button>
          {/* No number: WhatsApp asks which chat or group to send it to. */}
          <Button variant="outline" asChild>
            <a href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener">
              <MessageCircle /> {t("shareGroup")}
            </a>
          </Button>
        </div>
        {me && me.role !== "TEACHER" && (
          <div className="grid gap-2 rounded-md border p-3">
            <Field label={t("newsTitle")} htmlFor="news-title">
              <Input id="news-title" value={title} onChange={(e) => setTitle(e.target.value)} />
            </Field>
            <div>
              <Button disabled={publish.isPending || publish.isSuccess || title.trim().length < 2} onClick={() => publish.mutate()}>
                <Newspaper /> {t("publish")}
              </Button>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button onClick={onClose}>{tc("close")}</Button>
        </DialogFooter>
      </>
    );
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("cancelTitle", { className: target.className })}</DialogTitle>
        <DialogDescription>
          <span dir="ltr">{target.date}</span> · <span dir="ltr">{target.startTime}</span>
        </DialogDescription>
      </DialogHeader>
      <Field label={t("reason")} htmlFor="cancel-reason">
        <Input id="cancel-reason" placeholder={t("reasonPlaceholder")} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      <Field label={t("resumeDate")} htmlFor="resume-date" hint={t("optional")}>
        <Input id="resume-date" type="date" value={resumeDate} onChange={(e) => setResumeDate(e.target.value)} />
      </Field>
      {cancel.isError && <p role="alert" className="text-sm text-destructive">{errorMessage(cancel.error)}</p>}
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>{tc("close")}</Button>
        <Button variant="destructive" disabled={reason.trim().length < 2 || cancel.isPending} onClick={() => cancel.mutate()}>
          {t("confirmCancel")}
        </Button>
      </DialogFooter>
    </>
  );
}
