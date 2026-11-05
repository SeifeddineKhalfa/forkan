// Reloads only the Qur'an reference data: `npx tsx prisma/reload-quran.ts`
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { loadQuranReference } from './load-quran.js';

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
await loadQuranReference(prisma);
await prisma.$disconnect();
