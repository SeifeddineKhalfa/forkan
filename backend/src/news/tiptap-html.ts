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

/** Own keys only: a node type like "constructor" must not hit Object.prototype. */
const tagOf = (table: Record<string, string>, type: unknown) =>
  typeof type === 'string' && Object.hasOwn(table, type) ? table[type] : undefined;
const childrenOf = (node: TiptapNode) => (Array.isArray(node.content) ? node.content : []);
/** Deeper documents are cut off instead of overflowing the stack. */
const MAX_DEPTH = 40;

export function safeHref(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const href = raw.trim();
  return /^(https?:\/\/|mailto:|tel:)/i.test(href) ? href : null;
}

function renderText(node: TiptapNode): string {
  let html = e(typeof node.text === 'string' ? node.text : '');
  for (const mark of Array.isArray(node.marks) ? node.marks : []) {
    const tag = tagOf(MARKS, mark?.type);
    if (tag) html = `<${tag}>${html}</${tag}>`;
    else if (mark?.type === 'link') {
      const href = safeHref(mark.attrs?.href);
      if (href) html = `<a href="${e(href)}" rel="noopener nofollow" target="_blank">${html}</a>`;
    }
  }
  return html;
}

function render(node: TiptapNode, depth = 0): string {
  if (!node || typeof node !== 'object' || depth > MAX_DEPTH) return '';
  const inner = () =>
    childrenOf(node)
      .map((child) => render(child, depth + 1))
      .join('');
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
      const tag = tagOf(BLOCKS, node.type);
      return tag ? `<${tag}>${inner()}</${tag}>` : inner();
  }
}

export const tiptapToHtml = (doc: TiptapNode) => render(doc);

/** Plain text (excerpts, WhatsApp copy, search). */
export function tiptapToText(node: TiptapNode, depth = 0): string {
  if (!node || typeof node !== 'object' || depth > MAX_DEPTH) return '';
  if (node.type === 'text') return typeof node.text === 'string' ? node.text : '';
  if (node.type === 'hardBreak') return '\n';
  const parts = childrenOf(node).map((child) => tiptapToText(child, depth + 1));
  return ['paragraph', 'heading', 'listItem', 'blockquote'].includes(node.type) ? `${parts.join('')}\n` : parts.join('');
}
