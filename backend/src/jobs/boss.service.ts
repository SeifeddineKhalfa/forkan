import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PgBoss } from 'pg-boss';
import type { Env } from '../config/env.js';

const TZ = 'Africa/Tunis';

/**
 * pg-boss, started lazily by the first `schedule()` so the queue tables live in
 * the app database (schema "pgboss"). Disabled with JOBS_ENABLED=false (e2e tests).
 */
@Injectable()
export class BossService implements OnModuleDestroy {
  private readonly logger = new Logger(BossService.name);
  private boss: PgBoss | null = null;
  private starting: Promise<PgBoss> | null = null;

  constructor(private readonly config: ConfigService<Env, true>) {}

  get enabled() {
    return this.config.get('JOBS_ENABLED', { infer: true });
  }

  /** Runs `handler` on a cron (school time zone). One job at a time per queue. */
  async schedule(name: string, cron: string, handler: () => Promise<unknown>) {
    if (!this.enabled) return;
    const boss = await this.start();
    await boss.createQueue(name, { policy: 'singleton' });
    await boss.schedule(name, cron, null, { tz: TZ });
    await boss.work(name, async () => {
      const result = await handler();
      this.logger.log({ queue: name, result }, 'job done');
      return result;
    });
  }

  async onModuleDestroy() {
    await this.boss?.stop({ graceful: true });
  }

  private start() {
    this.starting ??= (async () => {
      const boss = new PgBoss({ connectionString: this.config.get('DATABASE_URL'), schema: 'pgboss' });
      boss.on('error', (err) => this.logger.error(err));
      await boss.start();
      this.boss = boss;
      return boss;
    })();
    return this.starting;
  }
}
