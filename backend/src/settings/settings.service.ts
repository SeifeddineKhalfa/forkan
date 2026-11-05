import { Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../common/decorators.js';
import type { Prisma } from '../generated/prisma/client.js';
import { SiteRevalidator } from '../news/site-revalidator.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { UpdateSettingsDto } from './settings.schemas.js';

/** School settings: billing, receipts and WhatsApp message templates. */
@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly site: SiteRevalidator,
  ) {}

  async get(actor: AuthUser) {
    const school = await this.prisma.school.findUniqueOrThrow({
      where: { id: actor.schoolId },
      select: { name: true, address: true, phone: true, settings: true },
    });
    const { settings, ...rest } = school;
    return { school: rest, ...settings! };
  }

  async update(actor: AuthUser, dto: UpdateSettingsDto) {
    const { schoolAddress, whatsappTemplates, ...fields } = dto;
    const before = await this.prisma.schoolSettings.findUniqueOrThrow({ where: { schoolId: actor.schoolId } });
    const templates = whatsappTemplates
      ? ({ ...(before.whatsappTemplates as Record<string, string>), ...whatsappTemplates } as Prisma.InputJsonValue)
      : undefined;
    await this.prisma.$transaction([
      this.prisma.schoolSettings.update({
        where: { schoolId: actor.schoolId },
        data: { ...fields, whatsappTemplates: templates },
      }),
      ...(schoolAddress !== undefined
        ? [this.prisma.school.update({ where: { id: actor.schoolId }, data: { address: schoolAddress } })]
        : []),
    ]);
    await this.audit.log(actor, 'SETTINGS_UPDATE', 'SchoolSettings', actor.schoolId, undefined, dto);
    await this.site.refresh();
    return this.get(actor);
  }
}
