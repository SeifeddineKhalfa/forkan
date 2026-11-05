import { type TiptapNode, tiptapToHtml, tiptapToText } from './tiptap-html.js';

const doc = (...content: TiptapNode[]): TiptapNode => ({ type: 'doc', content });
const p = (...content: TiptapNode[]): TiptapNode => ({ type: 'paragraph', content });
const text = (t: string, marks?: TiptapNode['marks']): TiptapNode => ({ type: 'text', text: t, marks });

describe('tiptapToHtml', () => {
  it('renders the supported structure', () => {
    const html = tiptapToHtml(
      doc(
        { type: 'heading', attrs: { level: 1 }, content: [text('موعد الإملاء')] },
        p(text('يوم '), text('السبت', [{ type: 'bold' }]), { type: 'hardBreak' }, text('بعد العصر', [{ type: 'italic' }])),
        { type: 'bulletList', content: [{ type: 'listItem', content: [p(text('الأطفال'))] }] },
        { type: 'horizontalRule' },
      ),
    );
    expect(html).toBe(
      '<h2>موعد الإملاء</h2><p>يوم <strong>السبت</strong><br><em>بعد العصر</em></p><ul><li><p>الأطفال</p></li></ul><hr>',
    );
  });

  it('escapes text and drops anything outside the whitelist', () => {
    const html = tiptapToHtml(
      doc(
        p(text('<script>alert(1)</script>')),
        { type: 'iframe', attrs: { src: 'https://evil' }, content: [text('x')] },
        p(text('a', [{ type: 'textStyle', attrs: { style: 'color:red' } }])),
      ),
    );
    expect(html).toBe('<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>x<p>a</p>');
  });

  it('keeps only safe links', () => {
    const link = (href: string) => tiptapToHtml(p(text('هنا', [{ type: 'link', attrs: { href } }])));
    expect(link('https://facebook.com/forckane')).toBe(
      '<p><a href="https://facebook.com/forckane" rel="noopener nofollow" target="_blank">هنا</a></p>',
    );
    expect(link('javascript:alert(1)')).toBe('<p>هنا</p>');
    expect(link(' JaVaScRiPt:alert(1)')).toBe('<p>هنا</p>');
    expect(link('https://x" onmouseover="y')).toContain('href="https://x&quot; onmouseover=&quot;y"');
  });
});

describe('tiptapToText', () => {
  it('keeps one line per block', () => {
    expect(tiptapToText(doc(p(text('السلام عليكم')), p(text('موعدنا السبت'))))).toBe('السلام عليكم\nموعدنا السبت\n');
  });
});
