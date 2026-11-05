import { Body, Controller, Post } from '@nestjs/common';
import { z } from 'zod';
import { type AuthUser, CurrentUser, Roles } from '../common/decorators.js';
import { blankToUndefined, id, phoneSchema } from '../common/schemas.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { PrismaService } from '../prisma/prisma.service.js';

const messageSchema = z.object({
  kind: z.enum(['RECEIPT', 'PAYMENT_REMINDER', 'ABSENCE', 'CLASS_ANNOUNCEMENT', 'MEMBERSHIP_REMINDER', 'CUSTOM']),
  phone: phoneSchema,
  body: z.string().trim().min(1).max(2000),
  guardianId: blankToUndefined(id),
  studentId: blankToUndefined(id),
  paymentId: blankToUndefined(id),
});

/**
 * WhatsApp is click-to-send (wa.me): we only log what was prepared, delivery
 * cannot be confirmed (spec A5).
 */
@Roles('STAFF')
@Controller('messages')
export class MessagesController {
  constructor(private readonly prisma: PrismaService) {}

  @Post()
  log(@CurrentUser() actor: AuthUser, @Body(new ZodValidationPipe(messageSchema)) dto: z.infer<typeof messageSchema>) {
    return this.prisma.forSchool(actor.schoolId).messageLog.create({
      data: { ...dto, schoolId: actor.schoolId, preparedById: actor.id },
      select: { id: true, preparedAt: true },
    });
  }
}
