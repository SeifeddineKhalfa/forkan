"use client";

import { type Editor, EditorContent, type JSONContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Bold, Heading2, Heading3, Italic, Link2, Link2Off, List, ListOrdered, Quote, Redo2, Underline, Undo2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

export type TiptapDoc = { type: "doc"; content?: unknown[] };

/**
 * RTL rich-text editor for news. Only what the API's renderer keeps is offered:
 * paragraphs, h2/h3, bold/italic/underline/strike, lists, quotes, links.
 */
export function RichEditor({ value, onChange }: { value: TiptapDoc; onChange: (doc: TiptapDoc) => void }) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        code: false,
        codeBlock: false,
        link: { openOnClick: false, autolink: true, protocols: ["http", "https", "mailto", "tel"] },
      }),
    ],
    content: value as JSONContent,
    editorProps: {
      attributes: {
        dir: "rtl",
        class: "prose-news min-h-60 rounded-b-md border border-t-0 px-4 py-3 text-base outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
      },
    },
    onUpdate: ({ editor: e }) => onChange(e.getJSON() as TiptapDoc),
  });
  if (!editor) return <div className="min-h-72 rounded-md border" />;
  return (
    <div>
      <Toolbar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const t = useTranslations("news.toolbar");
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      underline: e.isActive("underline"),
      h2: e.isActive("heading", { level: 2 }),
      h3: e.isActive("heading", { level: 3 }),
      bullet: e.isActive("bulletList"),
      ordered: e.isActive("orderedList"),
      quote: e.isActive("blockquote"),
      link: e.isActive("link"),
      undo: e.can().undo(),
      redo: e.can().redo(),
    }),
  });
  const chain = () => editor.chain().focus();
  const setLink = () => {
    const href = window.prompt(t("linkPrompt"), editor.getAttributes("link").href ?? "https://");
    if (href === null) return;
    if (!/^(https?:\/\/|mailto:|tel:)/i.test(href.trim())) return chain().unsetLink().run();
    chain().extendMarkRange("link").setLink({ href: href.trim() }).run();
  };
  const buttons: { key: string; icon: React.ElementType; active?: boolean; disabled?: boolean; run: () => unknown }[] = [
    { key: "bold", icon: Bold, active: state.bold, run: () => chain().toggleBold().run() },
    { key: "italic", icon: Italic, active: state.italic, run: () => chain().toggleItalic().run() },
    { key: "underline", icon: Underline, active: state.underline, run: () => chain().toggleUnderline().run() },
    { key: "h2", icon: Heading2, active: state.h2, run: () => chain().toggleHeading({ level: 2 }).run() },
    { key: "h3", icon: Heading3, active: state.h3, run: () => chain().toggleHeading({ level: 3 }).run() },
    { key: "bullet", icon: List, active: state.bullet, run: () => chain().toggleBulletList().run() },
    { key: "ordered", icon: ListOrdered, active: state.ordered, run: () => chain().toggleOrderedList().run() },
    { key: "quote", icon: Quote, active: state.quote, run: () => chain().toggleBlockquote().run() },
    { key: "link", icon: Link2, active: state.link, run: setLink },
    { key: "unlink", icon: Link2Off, disabled: !state.link, run: () => chain().unsetLink().run() },
    { key: "undo", icon: Undo2, disabled: !state.undo, run: () => chain().undo().run() },
    { key: "redo", icon: Redo2, disabled: !state.redo, run: () => chain().redo().run() },
  ];
  return (
    <div className="flex flex-wrap gap-0.5 rounded-t-md border bg-muted/50 p-1" role="toolbar">
      {buttons.map(({ key, icon: Icon, active, disabled, run }) => (
        <button
          key={key}
          type="button"
          title={t(key as "bold")}
          aria-label={t(key as "bold")}
          aria-pressed={active}
          disabled={disabled}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => run()}
          className={cn("rounded p-1.5 hover:bg-background disabled:opacity-40", active && "bg-background text-primary shadow-sm")}
        >
          <Icon className="size-4" />
        </button>
      ))}
    </div>
  );
}
