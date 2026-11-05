import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { AttendanceModule } from './attendance/attendance.module.js';
import { AuditModule } from './audit/audit.module.js';
import { AuthModule } from './auth/auth.module.js';
import { ApiExceptionFilter } from './common/api-exception.filter.js';
import { validateEnv } from './config/env.js';
import { HealthController } from './health.controller.js';
import { HifzModule } from './hifz/hifz.module.js';
import { QuranModule } from './quran/quran.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { ClassesModule } from './classes/classes.module.js';
import { FilesModule } from './files/files.module.js';
import { ImportsModule } from './imports/imports.module.js';
import { FeesModule } from './fees/fees.module.js';
import { JobsModule } from './jobs/jobs.module.js';
import { MembershipsModule } from './memberships/memberships.module.js';
import { MessagesModule } from './messages/messages.module.js';
import { NewsModule } from './news/news.module.js';
import { PaymentsModule } from './payments/payments.module.js';
import { PdfModule } from './pdf/pdf.module.js';
import { SettingsModule } from './settings/settings.module.js';
import { PeopleModule } from './people/people.module.js';
import { StructureModule } from './structure/structure.module.js';
import { TeachersModule } from './teachers/teachers.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: { production: 'info', test: 'silent' }[process.env.NODE_ENV ?? ''] ?? 'debug',
        transport:
          process.env.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined,
        redact: ['req.headers.cookie', 'res.headers["set-cookie"]'],
      },
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
    PrismaModule,
    AuditModule,
    FilesModule,
    AuthModule,
    UsersModule,
    StructureModule,
    TeachersModule,
    ClassesModule,
    PeopleModule,
    ImportsModule,
    JobsModule,
    FeesModule,
    MembershipsModule,
    PdfModule,
    PaymentsModule,
    MessagesModule,
    SettingsModule,
    AttendanceModule,
    QuranModule,
    HifzModule,
    NewsModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
  ],
})
export class AppModule {}
