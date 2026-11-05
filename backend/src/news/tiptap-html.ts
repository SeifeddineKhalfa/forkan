import { escapeHtml as e } from '../pdf/pdf.service.js';

/**
 * Tiptap JSON → HTML for the public site. Whitelist renderer: unknown nodes keep
 * only their text, unknown marks are dropped, links must be http(s)/mailto/tel,
 * so stored posts can never inject markup or scripts.
 */

export interface TiptapNode {
  type: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  content?: TiptapNode[];
}

const BLOCKS: Record<string, string> = {
  paragraph: 'p',
  blockquote: 'blockquote',
  bulletList: 'ul',
  orderedList: 'ol',
  listItem: 'li',
};
const MARKS: Record<string, string> = { bold: 'strong', italic: 'em', underline: 'u', strike: 's' };

export function safeHref(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const href = raw.trim();
  return /^(https?:\/\/|mailto:|tel:)/i.test(href) ? href : null;
}

function renderText(node: TiptapNode): string {
  let html = e(node.text ?? '');
  for (const mark of node.marks ?? []) {
    if (MARKS[mark.type]) html = `<${MARKS[mark.type]}>${html}</${MARKS[mark.type]}>`;
    else if (mark.type === 'link') {
      const href = safeHref(mark.attrs?.href);
      if (href) html = `<a href="${e(href)}" rel="noopener nofollow" target="_blank">${html}</a>`;
    }
  }
  return html;
}

function render(node: TiptapNode): string {
  const inner = () => (node.content ?? []).map(render).join('');
  switch (node.type) {
    case 'doc':
      return inner();
    case 'text':
      return renderText(node);
    case 'hardBreak':
      return '<br>';
    case 'horizontalRule':
      return '<hr>';
    case 'heading': {
      // h1 is the post title: body headings are h2–h3.
      const level = Math.min(Math.max(Number(node.attrs?.level) || 2, 2), 3);
      return `<h${level}>${inner()}</h${level}>`;
    }
    default:
      return BLOCKS[node.type] ? `<${BLOCKS[node.type]}>${inner()}</${BLOCKS[node.type]}>` : inner();
  }
}

export const tiptapToHtml = (doc: TiptapNode) => render(doc);

/** Plain text (excerpts, WhatsApp copy, search). */
export function tiptapToText(node: TiptapNode): string {
  if (node.type === 'text') return node.text ?? '';
  if (node.type === 'hardBreak') return '\n';
  const parts = (node.content ?? []).map(tiptapToText);
  return ['paragraph', 'heading', 'listItem', 'blockquote'].includes(node.type) ? `${parts.join('')}\n` : parts.join('');
}
