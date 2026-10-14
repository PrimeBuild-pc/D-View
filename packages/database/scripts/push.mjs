import { PrismaClient } from '@prisma/client';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import process from 'node:process';

const prisma = new PrismaClient();
try {
  // PostgreSQL validates legacy duplicates without Prisma's blanket data-loss opt-in.
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      IF to_regclass('"PermissionChangeOperationResult"') IS NOT NULL THEN
        CREATE UNIQUE INDEX IF NOT EXISTS "PermissionChangeOperationResult_executionId_operationId_key"
          ON "PermissionChangeOperationResult" ("executionId", "operationId");
      END IF;
    END $$;
  `);
} finally {
  await prisma.$disconnect();
}

execFileSync(process.execPath, [
  createRequire(import.meta.url).resolve('prisma/build/index.js'),
  'db', 'push', '--schema', 'prisma/schema.prisma', ...process.argv.slice(2),
], { stdio: 'inherit' });
