import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { PrismaClient } from '../src/generated/prisma/client.js';
import { type Agent, bootApp, createUser, ensureSchool, H, loginAs, newPrisma } from './helpers.js';

// 1×1 transparent PNG
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

const doc = (...paragraphs: unknown[]) => ({ type: 'doc', content: paragraphs });
const para = (...content: unknown[]) => ({ type: 'paragraph', content });

/** Slice 7 acceptance rules (spec B, Slice 7 "Done when": drafts are not reachable) and spec A5 public site. */
describe('News & public site (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let staff: Agent;
  let admin: Agent;
  let teacher: Agent;
  let anonymous: ReturnType<typeof request>;
  let yearId: string;

  beforeAll(async () => {
    prisma = newPrisma();
    const { school, year } = await ensureSchool(prisma);
    yearId = year.id;
    await createUser(prisma, school.id, 'staff-s7@e2e.local', 'STAFF');
    await createUser(prisma, school.id, 'admin-s7@e2e.local', 'ADMIN');
    await createUser(prisma, school.id, 'teacher-s7@e2e.local', 'TEACHER');
    app = await bootApp();
    staff = await loginAs(app, 'staff-s7@e2e.local');
    admin = await loginAs(app, 'admin-s7@e2e.local');
    teacher = await loginAs(app, 'teacher-s7@e2e.local');
    anonymous = request(app.getHttpServer());
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  let id: string;
  let slug: string;

  it('creates a draft whose body is rendered through the whitelist', async () => {
    const res = await staff
      .post('/api/news')
      .set(H)
      .send({
        title: 'انطلاق السنة القرآنية 2026-2027',
        category: 'ANNOUNCEMENT',
        bodyJson: doc(
          para({ type: 'text', text: 'تنطلق الإملاءات يوم السبت ' }, { type: 'text', text: '<img src=x onerror=alert(1)>' }),
          para({ type: 'text', text: 'الصفحة', marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }] }),
        ),
      })
      .expect(201);
    ({ id, slug } = res.body);
    expect(res.body).toMatchObject({ status: 'DRAFT', hasCover: false, publishedAt: null });
    expect(res.body.bodyHtml).toBe('<p>تنطلق الإملاءات يوم السبت &lt;img src=x onerror=alert(1)&gt;</p><p>الصفحة</p>');
    expect(res.body.excerpt).toMatch(/^تنطلق الإملاءات/);
    await teacher.get('/api/news').expect(403);
  });

  it('keeps drafts unreachable from the public site', async () => {
    await anonymous.get(`/api/public/news/${slug}`).expect(404);
    const list = await anonymous.get('/api/public/news').expect(200);
    expect(list.body.items.map((p: { slug: string }) => p.slug)).not.toContain(slug);
  });

  it('publishes, unpublishes and republishes keeping the first date', async () => {
    const pub = await staff.post(`/api/news/${id}/publish`).set(H).expect(200);
    expect(pub.body.status).toBe('PUBLISHED');
    const firstDate = pub.body.publishedAt;

    const post = await anonymous.get(`/api/public/news/${slug}`).expect(200);
    expect(post.body).toMatchObject({ title: 'انطلاق السنة القرآنية 2026-2027', category: 'ANNOUNCEMENT' });
    expect(post.body.text).toContain('تنطلق الإملاءات يوم السبت');
    expect(post.body).not.toHaveProperty('authorId');
    const list = await anonymous.get('/api/public/news?category=ANNOUNCEMENT').expect(200);
    expect(list.body.items[0].slug).toBe(slug);

    await staff.post(`/api/news/${id}/unpublish`).set(H).expect(200);
    await anonymous.get(`/api/public/news/${slug}`).expect(404);
    const again = await staff.post(`/api/news/${id}/publish`).set(H).expect(200);
    expect(again.body.publishedAt).toBe(firstDate);
  });

  it('serves the cover publicly only while the post is published', async () => {
    const res = await staff.put(`/api/news/${id}/cover`).set(H).attach('file', PNG, 'cover.png').expect(200);
    expect(res.body).toMatchObject({ hasCover: true });
    expect(res.body).not.toHaveProperty('coverUrl');
    const img = await anonymous.get(`/api/public/news/${slug}/cover`).expect(200);
    expect(img.headers['content-type']).toBe('image/png');

    await staff.post(`/api/news/${id}/unpublish`).set(H).expect(200);
    await anonymous.get(`/api/public/news/${slug}/cover`).expect(404);
    await staff.get(`/api/news/${id}/cover`).expect(200); // office preview
  });

  it('publishes site information from settings, without student data', async () => {
    await admin
      .patch('/api/settings')
      .set(H)
      .send({ aboutHtml: 'جمعية قرآنية بسليمان.\nتأسّست سنة 2010.', socialLinks: { facebook: 'https://www.facebook.com/forckane' } })
      .expect(200);
    const site = await anonymous.get('/api/public/site').expect(200);
    expect(site.body).toMatchObject({ about: 'جمعية قرآنية بسليمان.\nتأسّست سنة 2010.', socialLinks: { facebook: 'https://www.facebook.com/forckane' } });
    expect(site.body.membership).toMatchObject({ name: '2026-2027' });
    expect(JSON.stringify(site.body)).not.toMatch(/student|guardian|phone2/i);
  });

  it("lists only public imla'at in the weekly schedule", async () => {
    await staff
      .post('/api/classes')
      .set(H)
      .send({
        academicYearId: yearId,
        name: 'إملاء البقرة (S7)',
        audience: 'ADULTS',
        genderPolicy: 'FEMALE_ONLY',
        slots: [{ day: 'WEDNESDAY', startTime: '15:30', endTime: '17:00', timeLabel: 'بعد العصر' }],
      })
      .expect(201);
    await staff.post('/api/classes').set(H).send({ academicYearId: yearId, name: 'حلقة داخلية (S7)', audience: 'ADULTS', isPublic: false }).expect(201);

    const res = await anonymous.get('/api/public/schedule').expect(200);
    const names = res.body.map((c: { name: string }) => c.name);
    expect(names).toContain('إملاء البقرة (S7)');
    expect(names).not.toContain('حلقة داخلية (S7)');
    const c = res.body.find((x: { name: string }) => x.name === 'إملاء البقرة (S7)');
    expect(c).toMatchObject({ genderPolicy: 'FEMALE_ONLY', scheduleSlots: [{ day: 'WEDNESDAY', timeLabel: 'بعد العصر' }] });
    expect(c).not.toHaveProperty('enrollments');
    expect(c).not.toHaveProperty('capacity');
  });

  it('deletes a post and its cover', async () => {
    await staff.delete(`/api/news/${id}`).set(H).expect(204);
    await staff.get(`/api/news/${id}`).expect(404);
    await anonymous.get(`/api/public/news/${slug}`).expect(404);
  });
});
