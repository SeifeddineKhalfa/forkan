import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { ApiError } from '../common/api-error.js';
import type { Env } from '../config/env.js';

const FAMILY = 'IBM Plex Sans Arabic';
const SUBSETS = ['arabic', 'latin'];

/**
 * @font-face rules with the fonts inlined as data URIs, so Chromium in Gotenberg
 * shapes Arabic without any network access.
 */
function inlineFonts(): string {
  const require = createRequire(import.meta.url);
  const dir = dirname(require.resolve('@fontsource/ibm-plex-sans-arabic/400.css'));
  return [400, 700]
    .flatMap((weight) =>
      readFileSync(join(dir, `${weight}.css`), 'utf8')
        .split('/* ')
        .filter((block) => SUBSETS.some((s) => block.startsWith(`ibm-plex-sans-arabic-${s}-${weight}-normal`)))
        .map((block) =>
          block
            .slice(block.indexOf('@font-face'))
            .replace(/src: [^;]+;/, () => {
              const file = join(dir, 'files', `${block.slice(0, block.indexOf(' */'))}.woff2`);
              return `src: url(data:font/woff2;base64,${readFileSync(file).toString('base64')}) format('woff2');`;
            }),
        ),
    )
    .join('\n');
}

/** HTML → PDF through Gotenberg's Chromium (correct Arabic shaping and RTL). */
@Injectable()
export class PdfService {
  private readonly logger = new Logger(PdfService.name);
  private fonts: string | null = null;

  constructor(private readonly config: ConfigService<Env, true>) {}

  /** Base CSS every template starts with. */
  get fontCss() {
    this.fonts ??= `${inlineFonts()}\n* { font-family: '${FAMILY}', sans-serif; }`;
    return this.fonts;
  }

  async render(html: string, page: { width: number; height: number } = A5): Promise<Buffer> {
    const form = new FormData();
    form.append('files', new Blob([html], { type: 'text/html' }), 'index.html');
    form.append('paperWidth', String(page.width));
    form.append('paperHeight', String(page.height));
    for (const side of ['marginTop', 'marginBottom', 'marginLeft', 'marginRight']) form.append(side, '0.4');
    form.append('printBackground', 'true');
    let res: Response;
    try {
      res = await fetch(`${this.config.get('GOTENBERG_URL')}/forms/chromium/convert/html`, {
        method: 'POST',
        body: form,
        signal: AbortSignal.timeout(20_000),
      });
    } catch (err) {
      this.logger.error({ err }, 'Gotenberg unreachable');
      throw new ApiError(HttpStatus.SERVICE_UNAVAILABLE, 'PDF_UNAVAILABLE');
    }
    if (!res.ok) {
      this.logger.error({ status: res.status, body: await res.text() }, 'Gotenberg error');
      throw new ApiError(HttpStatus.SERVICE_UNAVAILABLE, 'PDF_UNAVAILABLE');
    }
    return Buffer.from(await res.arrayBuffer());
  }
}

/** Inches, as Gotenberg expects. */
export const A5 = { width: 5.83, height: 8.27 };

export const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
