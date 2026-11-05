"use client";

import { Copy, Share2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/** Lets whoever runs the Facebook page and the WhatsApp groups reuse each post (spec A5). */
export function ShareButtons({ url, title, text }: { url: string; title: string; text: string }) {
  const t = useTranslations("site");
  const copy = async () => {
    await navigator.clipboard.writeText(`*${title}*\n\n${text}\n\n${url}`);
    toast.success(t("copied"));
  };
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" asChild>
        <a href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`} target="_blank" rel="noopener">
          <Share2 /> {t("shareFacebook")}
        </a>
      </Button>
      <Button variant="outline" onClick={() => void copy()}>
        <Copy /> {t("copyWhatsapp")}
      </Button>
    </div>
  );
}
