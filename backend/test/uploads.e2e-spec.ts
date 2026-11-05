import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '../src/generated/prisma/client.js';
import { type Agent, bootApp, createUser, ensureSchool, H, loginAs, newPrisma } from './helpers.js';

// 1×1 transparent PNG
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

describe('private uploads (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let staff: Agent;
  let teacher: Agent;
  let studentId: string;

  beforeAll(async () => {
    prisma = newPrisma();
    const { school } = await ensureSchool(prisma);
    await createUser(prisma, school.id, 'staff-up@e2e.local', 'STAFF');
    await createUser(prisma, school.id, 'teacher-up@e2e.local', 'TEACHER');
    app = await bootApp();
    staff = await loginAs(app, 'staff-up@e2e.local');
    teacher = await loginAs(app, 'teacher-up@e2e.local');
    const s = await staff
      .post('/api/students')
      .set(H)
      .send({ firstName: 'صورة', lastName: 'تجربة', gender: 'FEMALE', dateOfBirth: '1990-01-01' })
      .expect(201);
    studentId = s.body.id;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  const upload = (buf: Buffer, name: string) =>
    staff.put(`/api/students/${studentId}/photo`).set(H).attach('file', buf, name);

  it('refuses a photo without the guardian consent', async () => {
    const res = await upload(PNG, 'p.png').expect(422);
    expect(res.body.code).toBe('PHOTO_CONSENT_REQUIRED');
  });

  it('stores a real image, serves it to staff only, and rejects disguised files', async () => {
    await staff.patch(`/api/students/${studentId}`).set(H).send({ photoConsent: true }).expect(200);

    const fake = await upload(Buffer.from('not an image at all'), 'evil.png').expect(415);
    expect(fake.body.code).toBe('UNSUPPORTED_FILE');

    const ok = await upload(PNG, 'p.png').expect(200);
    expect(ok.body.photoUrl).toMatch(/^[\w-]+\/students\/[\w-]+\.png$/);

    const photo = await staff.get(`/api/students/${studentId}/photo`).expect(200);
    expect(photo.headers['content-type']).toBe('image/png');
    expect(photo.headers['cache-control']).toContain('private');
    await teacher.get(`/api/students/${studentId}/photo`).expect(403);
  });

  it('deletes the photo when consent is withdrawn', async () => {
    await staff.patch(`/api/students/${studentId}`).set(H).send({ photoConsent: false }).expect(200);
    await staff.get(`/api/students/${studentId}/photo`).expect(404);
  });
});
