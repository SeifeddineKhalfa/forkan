"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { StudentHifz } from "@/components/hifz/student-hifz";
import { PageHeader } from "@/components/page-header";
import { api } from "@/lib/api";
import type { StudentHifz as Data } from "@/lib/types";

/** Hifz detail reachable by teachers (the full student profile is office-only). */
export default function StudentHifzPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations("hifz");
  // Same query as StudentHifz: one request, shared through the cache.
  const data = useQuery({ queryKey: ["hifz", "student", id], queryFn: () => api<Data>(`/students/${id}/hifz`) }).data;
  const name = data ? `${data.student.firstName} ${data.student.lastName}` : "";
  return (
    <div className="grid max-w-5xl gap-6">
      <PageHeader backHref="/hifz" title={name || t("title")} subtitle={data && <span dir="ltr">{data.student.code}</span>} />
      <StudentHifz studentId={id} name={name} />
    </div>
  );
}
