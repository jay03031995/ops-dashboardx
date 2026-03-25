import { NextResponse } from 'next/server';
import { getSession } from '@/lib/middleware';
import { isDatabaseConfigured, prisma } from '@/lib/prisma';
import { decryptCredential, encryptCredential } from '@/lib/credential-crypto';

const PLATFORMS = new Set(['Instagram', 'Facebook', 'Linkedin', 'Youtube']);

function normalizePlatform(value: string) {
  const v = value.trim().toLowerCase();
  if (v === 'instagram') return 'Instagram';
  if (v === 'facebook') return 'Facebook';
  if (v === 'linkedin' || v === 'linked in') return 'Linkedin';
  if (v === 'youtube' || v === 'yt') return 'Youtube';
  return '';
}

async function requireClientAccess(session: Awaited<ReturnType<typeof getSession>>, clientId: string) {
  if (!session) return { ok: false as const, status: 401, error: 'Unauthorized' };
  if (session.role === 'ADMIN') return { ok: true as const };
  const client = await prisma.client.findFirst({
    where: { id: clientId, tenantId: session.tenantId },
    select: { socialManagerId: true },
  });
  if (!client) return { ok: false as const, status: 404, error: 'Client not found' };
  if (client.socialManagerId !== session.userId) {
    return { ok: false as const, status: 403, error: 'Forbidden' };
  }
  return { ok: true as const };
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get('clientId') || '';
  const includePassword = searchParams.get('includePassword') === '1';
  if (!clientId) {
    return NextResponse.json({ error: 'clientId is required' }, { status: 400 });
  }

  try {
    const access = await requireClientAccess(session, clientId);
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const credentials = await prisma.socialCredential.findMany({
      where: { clientId },
      orderBy: { platform: 'asc' },
    });

    const data = credentials.map((entry) => ({
      id: entry.id,
      platform: entry.platform,
      username: entry.username,
      hasPassword: Boolean(entry.passwordEnc),
      password: includePassword ? decryptCredential(entry.passwordEnc) : undefined,
      updatedAt: entry.updatedAt.toISOString(),
    }));

    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: 'Failed to load credentials' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
  }

  try {
    const body = await request.json();
    const clientId = typeof body.clientId === 'string' ? body.clientId.trim() : '';
    const platform = typeof body.platform === 'string' ? normalizePlatform(body.platform) : '';
    const username = typeof body.username === 'string' ? body.username.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';

    if (!clientId) return NextResponse.json({ error: 'clientId is required' }, { status: 400 });
    if (!platform || !PLATFORMS.has(platform)) {
      return NextResponse.json({ error: 'Valid platform is required' }, { status: 400 });
    }
    if (!password) return NextResponse.json({ error: 'Password is required' }, { status: 400 });

    const access = await requireClientAccess(session, clientId);
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const passwordEnc = encryptCredential(password);

    const saved = await prisma.socialCredential.upsert({
      where: { clientId_platform: { clientId, platform } },
      update: { username: username || null, passwordEnc },
      create: { clientId, platform, username: username || null, passwordEnc },
    });

    return NextResponse.json({
      id: saved.id,
      platform: saved.platform,
      username: saved.username,
      hasPassword: true,
      updatedAt: saved.updatedAt.toISOString(),
    });
  } catch (error: any) {
    if (error?.message === 'CREDENTIALS_SECRET_MISSING') {
      return NextResponse.json({ error: 'Credentials secret not configured' }, { status: 500 });
    }
    return NextResponse.json({ error: 'Failed to save credentials' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const session = await getSession();
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
  }

  try {
    const body = await request.json();
    const clientId = typeof body.clientId === 'string' ? body.clientId.trim() : '';
    const platform = typeof body.platform === 'string' ? normalizePlatform(body.platform) : '';

    if (!clientId) return NextResponse.json({ error: 'clientId is required' }, { status: 400 });
    if (!platform || !PLATFORMS.has(platform)) {
      return NextResponse.json({ error: 'Valid platform is required' }, { status: 400 });
    }

    const access = await requireClientAccess(session, clientId);
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    await prisma.socialCredential.delete({
      where: { clientId_platform: { clientId, platform } },
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Failed to delete credentials' }, { status: 500 });
  }
}
