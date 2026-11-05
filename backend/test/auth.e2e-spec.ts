import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { hashPassword } from '../src/auth/auth.service.js';
import { csrfHeaderCheck } from '../src/common/csrf.middleware.js';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { E2E_ENV } from './e2e-env.js';
import { ensureSchool } from './helpers.js';

const ADMIN = { login: 'admin@e2e.local', password: 'initial-pass-123' };
const H = { 'X-Requested-With': 'e2e' };

type Agent = ReturnType<typeof request.agent>;

describe('Auth & users (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let otherSchoolUserEmail: string;

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: E2E_ENV.DATABASE_URL }) });
    const { school } = await ensureSchool(prisma);
    const other = await prisma.school.create({ data: { slug: 'other-school', name: 'مدرسة أخرى' } });
    await prisma.user.create({
      data: {
        schoolId: school.id,
        email: ADMIN.login,
        role: 'ADMIN',
        firstName: 'مدير',
        lastName: 'الاختبار',
        passwordHash: await hashPassword(ADMIN.password),
      },
    });
    otherSchoolUserEmail = 'stranger@other.local';
    await prisma.user.create({
      data: {
        schoolId: other.id,
        email: otherSchoolUserEmail,
        role: 'ADMIN',
        firstName: 'غريب',
        lastName: 'غريب',
        passwordHash: await hashPassword('whatever-123456'),
      },
    });

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.use(cookieParser());
    app.use(csrfHeaderCheck);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  const login = (agent: Agent, l: string, p: string) =>
    agent.post('/api/auth/login').set(H).send({ login: l, password: p });

  it('serves the health check without auth', async () => {
    await request(app.getHttpServer()).get('/api/health').expect(200, { status: 'ok' });
  });

  it('rejects mutating requests without the CSRF header', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ login: ADMIN.login, password: ADMIN.password });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('CSRF_HEADER_MISSING');
  });

  it('rejects a wrong password with a stable error code', async () => {
    const res = await login(request.agent(app.getHttpServer()), ADMIN.login, 'nope-nope-nope');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_CREDENTIALS');
  });

  it('runs the full admin → teacher flow', async () => {
    const admin = request.agent(app.getHttpServer());

    const first = await login(admin, ADMIN.login, ADMIN.password).expect(200);
    expect(first.body.user.mustChangePassword).toBe(true);
    expect(String(first.headers['set-cookie'])).toMatch(/access_token=.*HttpOnly/);

    // Forced password change blocks everything else.
    const blocked = await admin.get('/api/users').expect(403);
    expect(blocked.body.code).toBe('PASSWORD_CHANGE_REQUIRED');
    await admin.get('/api/auth/me').expect(200);

    await admin
      .post('/api/auth/change-password')
      .set(H)
      .send({ currentPassword: ADMIN.password, newPassword: 'admin-new-pass-456' })
      .expect(200);

    // Tenant isolation: the other school's user is never listed.
    const list = await admin.get('/api/users').expect(200);
    const emails = (list.body as { email: string }[]).map((u) => u.email);
    expect(emails).toContain(ADMIN.login);
    expect(emails).not.toContain(otherSchoolUserEmail);

    const created = await admin
      .post('/api/users')
      .set(H)
      .send({
        email: 'teacher@e2e.local',
        role: 'TEACHER',
        firstName: 'حبيبة',
        lastName: 'المؤدّبة',
        temporaryPassword: 'teacher-temp-123',
      })
      .expect(201);
    expect(created.body.mustChangePassword).toBe(true);

    const invalid = await admin.post('/api/users').set(H).send({ role: 'TEACHER' }).expect(400);
    expect(invalid.body.code).toBe('VALIDATION_FAILED');

    const teacher = request.agent(app.getHttpServer());
    await login(teacher, 'teacher@e2e.local', 'teacher-temp-123').expect(200);
    await teacher
      .post('/api/auth/change-password')
      .set(H)
      .send({ currentPassword: 'teacher-temp-123', newPassword: 'teacher-new-pass-1' })
      .expect(200);
    const me = await teacher.get('/api/auth/me').expect(200);
    expect(me.body.user.role).toBe('TEACHER');
    const forbidden = await teacher.get('/api/users').expect(403);
    expect(forbidden.body.code).toBe('FORBIDDEN');

    const audit = await prisma.auditLog.findMany({ where: { action: 'USER_CREATE' } });
    expect(audit).toHaveLength(1);
  });

  it('rotates refresh tokens and kills the session when an old one is reused', async () => {
    const server = app.getHttpServer();
    const res = await login(request.agent(server), ADMIN.login, 'admin-new-pass-456').expect(200);
    const cookies = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
    const oldRefresh = cookies.find((c) => c.startsWith('refresh_token='))!.split(';')[0];

    const rotated = await request(server)
      .post('/api/auth/refresh')
      .set(H)
      .set('Cookie', oldRefresh)
      .expect(200);
    const newRefresh = ([] as string[])
      .concat(rotated.headers['set-cookie'] ?? [])
      .find((c) => c.startsWith('refresh_token='))!
      .split(';')[0];
    expect(newRefresh).not.toBe(oldRefresh);

    // Replaying the old token revokes the family, so the new one dies too.
    await request(server).post('/api/auth/refresh').set(H).set('Cookie', oldRefresh).expect(401);
    const dead = await request(server)
      .post('/api/auth/refresh')
      .set(H)
      .set('Cookie', newRefresh)
      .expect(401);
    expect(dead.body.code).toBe('SESSION_EXPIRED');
  });
});
