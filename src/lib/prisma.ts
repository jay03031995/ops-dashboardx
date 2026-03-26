import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  prismaAdapter?: PrismaPg;
};

function createPrismaClient() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl || process.env.APP_DEMO_MODE === 'true') {
    throw new Error('DATABASE_URL is not configured for Prisma');
  }

  const adapter =
    globalForPrisma.prismaAdapter ??
    new PrismaPg({
      connectionString: databaseUrl,
      connectionTimeoutMillis: 5_000,
      ssl: {
        rejectUnauthorized: false,
      },
    });

  const client =
    globalForPrisma.prisma ??
    new PrismaClient({
      adapter,
      log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
    });

  if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = client;
    globalForPrisma.prismaAdapter = adapter;
  }

  return client;
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, property, receiver) {
    const client = createPrismaClient();
    const value = Reflect.get(client, property, receiver);
    return typeof value === 'function' ? value.bind(client) : value;
  },
}) as PrismaClient;

export function isDatabaseConfigured() {
  if (!process.env.DATABASE_URL) {
    return false;
  }
  return process.env.APP_DEMO_MODE !== 'true';
}
