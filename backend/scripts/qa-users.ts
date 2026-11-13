/** Dev only: creates/refreshes the QA accounts from QA_* in .env (browser checks). */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { hashPassword } from '../src/auth/auth.service.js';
import { PrismaClient } from '../src/generated/prisma/client.js';

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const school = await prisma.school.findUniqueOrThrow({ where: { slug: process.env.SCHOOL_SLUG! } });
const passwordHash = await hashPassword(process.env.QA_ADMIN_PASSWORD!);
for (const [email, role] of [[process.env.QA_ADMIN_EMAIL!, 'ADMIN'], [process.env.QA_TEACHER_EMAIL!, 'TEACHER']] as const) {
  const existing = await prisma.user.findFirst({ where: { schoolId: school.id, email } });
  const data = { passwordHash, mustChangePassword: false, isActive: true, role };
  if (existing) await prisma.user.update({ where: { id: existing.id }, data });
  else await prisma.user.create({ data: { ...data, schoolId: school.id, email, firstName: 'QA', lastName: role } });
  console.log('ok', role);
}
await prisma.$disconnect();
