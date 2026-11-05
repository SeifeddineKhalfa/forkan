// Idempotent seed: school, settings, current academic year, main venue,
// first admin (from env) and the Qur'an reference data (surahs, ayah counts, athman).
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import * as argon2 from 'argon2';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { loadQuranReference } from './load-quran.js';

const required = (name: string) => {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
};

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: required('DATABASE_URL') }),
});

const WHATSAPP_TEMPLATES = {
  RECEIPT: 'السلام عليكم، تمّ استلام دفعة بقيمة {{amount}} د.ت للطالب(ة) {{studentName}}. الوصل: {{receiptUrl}}',
  PAYMENT_REMINDER: 'السلام عليكم، نذكّركم بمعلوم {{label}} للطالب(ة) {{studentName}} بقيمة {{amount}} د.ت. بارك الله فيكم.',
  ABSENCE: 'السلام عليكم، نعلمكم بتغيّب {{studentName}} عن إملاء {{className}} يوم {{date}}.',
  MEMBERSHIP_REMINDER: 'السلام عليكم، نذكّركم بتجديد الانخراط في الجمعية للسنة {{year}} ({{amount}} د.ت) قبل {{deadline}}.',
  CLASS_ANNOUNCEMENT: '{{text}}',
};

async function main() {
  const slug = required('SEED_SCHOOL_SLUG');
  const school = await prisma.school.upsert({
    where: { slug },
    update: {},
    create: { slug, name: required('SEED_SCHOOL_NAME') },
  });

  await prisma.schoolSettings.upsert({
    where: { schoolId: school.id },
    update: {},
    create: { schoolId: school.id, whatsappTemplates: WHATSAPP_TEMPLATES },
  });

  await prisma.academicYear.upsert({
    where: { schoolId_name: { schoolId: school.id, name: '2026-2027' } },
    update: {},
    create: {
      schoolId: school.id,
      name: '2026-2027',
      startDate: new Date('2026-09-01'),
      endDate: new Date('2027-06-30'),
      billableMonths: [9, 10, 11, 12, 1, 2, 3, 4, 5, 6],
      isCurrent: true,
      membershipFee: '20.000',
      membershipWindowStart: new Date('2026-11-01'),
      membershipWindowEnd: new Date('2027-01-30'),
    },
  });

  await prisma.venue.upsert({
    where: { schoolId_name: { schoolId: school.id, name: 'مقر الجمعية' } },
    update: {},
    create: { schoolId: school.id, name: 'مقر الجمعية', address: 'شارع البيئة، قبالة جامع النور، سليمان' },
  });

  const email = required('SEED_ADMIN_EMAIL').toLowerCase();
  const existing = await prisma.user.findUnique({
    where: { schoolId_email: { schoolId: school.id, email } },
  });
  if (!existing) {
    await prisma.user.create({
      data: {
        schoolId: school.id,
        email,
        role: 'ADMIN',
        firstName: 'مدير',
        lastName: 'المنظومة',
        passwordHash: await argon2.hash(required('SEED_ADMIN_PASSWORD'), { type: argon2.argon2id }),
        mustChangePassword: true,
      },
    });
    console.log(`Admin created: ${email} (password from SEED_ADMIN_PASSWORD, must be changed at first login)`);
  }

  await loadQuranReference(prisma);
  console.log(`Seed complete for "${school.name}"`);
}

await main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
