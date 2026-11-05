import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';

/**
 * Tells the Next.js public site to drop its cached news (POST /revalidate), so a
 * published post shows at once and an unpublished one disappears at once. Without
 * a secret the site still refreshes on its own within a minute.
 */
@Injectable()
export class SiteRevalidator {
  private readonly logger = new Logger(SiteRevalidator.name);

  constructor(private readonly config: ConfigService<Env, true>) {}

  async refresh() {
    const secret = this.config.get('REVALIDATE_SECRET', { infer: true });
    if (!secret || process.env.NODE_ENV === 'test') return;
    try {
      await fetch(`${this.config.get('FRONTEND_URL')}/revalidate`, {
        method: 'POST',
        headers: { 'x-revalidate-secret': secret, 'content-type': 'application/json' },
        body: JSON.stringify({ tag: 'public' }),
        signal: AbortSignal.timeout(5_000),
      });
    } catch (err) {
      this.logger.warn({ err }, 'public site revalidation failed (it refreshes within a minute anyway)');
    }
  }
}
