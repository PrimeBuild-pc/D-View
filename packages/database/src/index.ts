import { PrismaClient, type Prisma } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export type { PrismaClient };
export type { Prisma };

/**
 * Widen a typed value into Prisma's Json input type.
 *
 * Prisma's InputJsonValue requires an index signature, which our snapshot and
 * warning interfaces deliberately do not have. The cast is confined here so it
 * cannot drift into a `as never` scattered across route files, which is how the
 * previous code did it.
 */
export function toJson<T>(value: T): Prisma.InputJsonValue {
  return value as unknown as Prisma.InputJsonValue;
}
