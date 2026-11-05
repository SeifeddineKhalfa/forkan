import { Injectable } from '@nestjs/common';
import type { AuthUser } from '../common/decorators.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

type Json = Prisma.InputJsonValue;

/** Dates, Decimals and nested objects → plain JSON for the audit columns. */
const toJson = (v: unknown): Json | undefined =>
  v === undefined ? undefined : (JSON.parse(JSON.stringify(v)) as Json);

/**
 * Explicit audit trail, called by services after a successful change
 * (more reliable than an interceptor guessing old/new values).
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  log(
    actor: AuthUser,
    action: string,
    entityType: string,
    entityId: string | null,
    oldValues?: unknown,
    newValues?: unknown,
  ) {
    return this.prisma.forSchool(actor.schoolId).auditLog.create({
      data: {
        schoolId: actor.schoolId,
        userId: actor.id,
        action,
        entityType,
        entityId,
        oldValues: toJson(oldValues),
        newValues: toJson(newValues),
      },
    });
  }
}
