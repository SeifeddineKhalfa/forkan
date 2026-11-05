import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { hashPassword } from '../src/auth/auth.service.js';
import { csrfHeaderCheck } from '../src/common/csrf.middleware.js';
import { PrismaClient, type UserRole } from '../src/generated/prisma/client.js';
import { E2E_ENV } from './e2e-env.js';

export const H = { 'X-Requested-With': 'e2e' };
export type Agent = ReturnType<typeof request.agent>;

export const newPrisma = () =>
  new PrismaClient({ adapter: new PrismaPg({ connectionString: E2E_ENV.DATABASE_URL }) });

export async function bootApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  app.use(cookieParser());
  app.use(csrfHeaderCheck);
  await app.init();
  return app;
}

/** The school every e2e file logs into (SCHOOL_SLUG), with settings and a current year. */
export async function ensureSchool(prisma: PrismaClient) {
  const school = await prisma.school.upsert({
    where: { slug: E2E_ENV.SCHOOL_SLUG },
    update: {},
    create: { slug: E2E_ENV.SCHOOL_SLUG, name: 'مدرسة الاختبار' },
  });
  await prisma.schoolSettings.upsert({
    where: { schoolId: school.id },
    update: {},
    create: { schoolId: school.id, whatsappTemplates: {} },
  });
  const year = await prisma.academicYear.upsert({
    where: { schoolId_name: { schoolId: school.id, name: '2026-2027' } },
    update: {},
    create: {
      schoolId: school.id,
      name: '2026-2027',
      startDate: new Date('2026-09-01'),
      endDate: new Date('2027-06-30'),
      billableMonths: [9, 10, 11, 12, 1, 2, 3, 4, 5, 6],
      isCurrent: true,
    },
  });
  return { school, year };
}

/** A ready-to-use account (no forced password change). */
export async function createUser(
  prisma: PrismaClient,
  schoolId: string,
  email: string,
  role: UserRole,
  password = 'e2e-password-123',
) {
  return prisma.user.create({
    data: {
      schoolId,
      email,
      role,
      firstName: role,
      lastName: 'e2e',
      passwordHash: await hashPassword(password),
      mustChangePassword: false,
    },
  });
}

export async function loginAs(app: INestApplication, login: string, password = 'e2e-password-123'): Promise<Agent> {
  const agent = request.agent(app.getHttpServer());
  await agent.post('/api/auth/login').set(H).send({ login, password }).expect(200);
  return agent;
}
