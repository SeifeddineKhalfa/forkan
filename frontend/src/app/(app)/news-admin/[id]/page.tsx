"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, ImagePlus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useParams, useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { RoleGate } from "@/components/app-shell/role-gate";
import { Field } from "@/components/form/field";
import { RichEditor, type TiptapDoc } from "@/components/news/rich-editor";
import { PageHeader } from "@/components/page-header";
import { ShareButtons } from "@/components/site/share-buttons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api, upload } from "@/lib/api";
import type { ClassItem, NewsCategory, NewsPostDetail } from "@/lib/types";
import { useErrorMessage } from "@/lib/use-error-message";
import { NEWS_CATEGORIES } from "../categories";

const NONE = "NONE";

export default function NewsEditorPage() {
  const { id } = useParams<{ id: string }>();
  const tc = useTranslations("common");
  const errorMessage = useErrorMessage();
  const isNew = id === "new";
  const post = useQuery({ queryKey: ["news", id], queryFn: () => api<NewsPostDetail>(`/news/${id}`), enabled: !isNew });
  return (
    <RoleGate roles={["STAFF"]}>
      {post.isError ? (
        <p className="text-destructive">{errorMessage(post.error)}</p>
      ) : isNew || post.data ? (
        // Re-mounts when another post is opened, so the form starts from that post.
        <Editor key={id} post={post.data ?? null} />
      ) : (
        <p className="text-muted-foreground">{tc("loading")}</p>
      )}
    </RoleGate>
  );
}

function Editor({ post }: { post: NewsPostDetail | null }) {
  const t = useTranslations("news");
  const tc = useTranslations("common");
  const te = useTranslations("enums");
  const errorMessage = useErrorMessage();
  const router = useRouter();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState(post?.title ?? "");
  const [category, setCategory] = useState<NewsCategory>(post?.category ?? "ANNOUNCEMENT");
  const [classId, setClassId] = useState(post?.classId ?? NONE);
  const [excerpt, setExcerpt] = useState(post?.excerpt ?? "");
  const [body, setBody] = useState<TiptapDoc>(post?.bodyJson ?? { type: "doc", content: [{ type: "paragraph" }] });
  const [current, setCurrent] = useState(post);
  const classes = useQuery({ queryKey: ["classes", ""], queryFn: () => api<ClassItem[]>("/classes") });

  const refresh = (p: NewsPostDetail) => {
    setCurrent(p);
    qc.setQueryData(["news", p.id], p);
    void qc.invalidateQueries({ queryKey: ["news"], exact: false });
  };
  const payload = () => ({
    title,
    category,
    classId: classId === NONE ? null : classId,
    excerpt: excerpt.trim() || null,
    bodyJson: body,
  });
  const save = useMutation({
    mutationFn: () =>
      current
        ? api<NewsPostDetail>(`/news/${current.id}`, { method: "PATCH", body: payload() })
        : api<NewsPostDetail>("/news", { method: "POST", body: { ...payload(), classId: classId === NONE ? undefined : classId, excerpt: excerpt.trim() || undefined } }),
    onSuccess: (p) => {
      toast.success(t("saved"));
      refresh(p);
      if (!current) router.replace(`/news-admin/${p.id}`);
    },
  });
  const setStatus = useMutation({
    mutationFn: async (publish: boolean) => {
      // Save pending edits first so what is published is what is on screen.
      await api(`/news/${current!.id}`, { method: "PATCH", body: payload() });
      return api<NewsPostDetail>(`/news/${current!.id}/${publish ? "publish" : "unpublish"}`, { method: "POST" });
    },
    onSuccess: (p) => {
      toast.success(p.status === "PUBLISHED" ? t("published") : t("unpublished"));
      refresh(p);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const cover = useMutation({
    mutationFn: (file: File | null) =>
      file ? upload<NewsPostDetail>(`/news/${current!.id}/cover`, file) : api<NewsPostDetail>(`/news/${current!.id}/cover`, { method: "DELETE" }),
    onSuccess: refresh,
    onError: (e) => toast.error(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: () => api(`/news/${current!.id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success(t("deleted"));
      void qc.invalidateQueries({ queryKey: ["news"] });
      router.push("/news-admin");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const published = current?.status === "PUBLISHED";
  const siteUrl = current ? `${window.location.origin}/news/${encodeURIComponent(current.slug)}` : "";

  return (
    <div className="grid max-w-4xl gap-6">
      <PageHeader
        backHref="/news-admin"
        title={current ? current.title || t("newTitle") : t("newTitle")}
        subtitle={current && <Badge variant={published ? "default" : "secondary"}>{te(`newsStatus.${current.status}`)}</Badge>}
        actions={
          current && (
            <>
              {published && (
                <Button variant="outline" asChild>
                  <a href={siteUrl} target="_blank" rel="noopener">
                    <ExternalLink /> {t("view")}
                  </a>
                </Button>
              )}
              <Button variant={published ? "outline" : "default"} disabled={setStatus.isPending || !title.trim()} onClick={() => setStatus.mutate(!published)}>
                {published ? t("unpublish") : t("publish")}
              </Button>
            </>
          )
        }
      />

      <Card>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label={t("postTitle")} htmlFor="n-title" className="sm:col-span-2">
            <Input id="n-title" className="text-lg" value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label={t("category")}>
            <Select value={category} onValueChange={(v) => setCategory(v as NewsCategory)}>
              <SelectTrigger className="w-full" aria-label={t("category")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {NEWS_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>{te(`newsCategory.${c}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label={t("class")}>
            <Select value={classId} onValueChange={setClassId}>
              <SelectTrigger className="w-full" aria-label={t("class")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{t("noClass")}</SelectItem>
                {classes.data?.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label={t("body")} className="sm:col-span-2">
            <RichEditor value={body} onChange={setBody} />
          </Field>
          <Field label={t("excerpt")} htmlFor="n-excerpt" hint={t("excerptHint")} className="sm:col-span-2">
            <Textarea id="n-excerpt" rows={2} value={excerpt} onChange={(e) => setExcerpt(e.target.value)} />
          </Field>
          {save.isError && <p role="alert" className="text-sm text-destructive sm:col-span-2">{errorMessage(save.error)}</p>}
          <div className="flex gap-2 sm:col-span-2">
            <Button disabled={save.isPending || title.trim().length < 2} onClick={() => save.mutate()}>
              {save.isPending ? tc("saving") : t("save")}
            </Button>
            {current && (
              <Button
                variant="ghost"
                className="ms-auto text-destructive"
                disabled={remove.isPending}
                onClick={() => window.confirm(t("deleteConfirm")) && remove.mutate()}
              >
                <Trash2 /> {t("delete")}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("cover")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          {!current ? (
            <p className="text-sm text-muted-foreground">{t("draftFirst")}</p>
          ) : (
            <>
              {current.hasCover && (
                // Office preview of a possibly unpublished post: the private endpoint.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/api/news/${current.id}/cover?v=${current.coverVersion}`} alt="" className="max-h-72 w-full rounded-lg object-cover" />
              )}
              <p className="text-sm text-muted-foreground">{t("coverHint")}</p>
              <div className="flex gap-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) cover.mutate(f);
                    e.target.value = "";
                  }}
                />
                <Button variant="outline" disabled={cover.isPending} onClick={() => fileRef.current?.click()}>
                  <ImagePlus /> {t("chooseCover")}
                </Button>
                {current.hasCover && (
                  <Button variant="ghost" disabled={cover.isPending} onClick={() => cover.mutate(null)}>
                    {t("removeCover")}
                  </Button>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {published && current && (
        <Card>
          <CardContent>
            <ShareButtons url={siteUrl} title={current.title} text={current.excerpt ?? ""} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
