import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import type { Env } from '../config/env.js';
import { scopeArgs } from './tenant-scope.js';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(config: ConfigService<Env, true>) {
    super({
      adapter: new PrismaPg({ connectionString: config.get('DATABASE_URL') }),
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  /** A client whose every query on tenant models is restricted to `schoolId`. */
  forSchool(schoolId: string) {
    return this.$extends({
      query: {
        $allModels: {
          $allOperations({ model, operation, args, query }) {
            return query(scopeArgs(model, operation, args, schoolId) as never);
          },
        },
      },
    });
  }
}

export type SchoolDb = ReturnType<PrismaService['forSchool']>;
/** The client inside `forSchool(...).$transaction(async (tx) => …)`. */
export type SchoolTx = Parameters<Parameters<SchoolDb['$transaction']>[0]>[0];
