import { NextResponse } from 'next/server';
import { getSession } from '@/lib/middleware';
import { isDatabaseConfigured, prisma } from '@/lib/prisma';
import { resolveEffectiveModuleAccess } from '@/lib/team-role-store';

async function logWhatsAppSummaryActivity(
  session: NonNullable<Awaited<ReturnType<typeof getSession>>>,
  clientId: string,
  dateStr: string,
  itemCount: number
) {
  try {
    const [actor, client] = await Promise.all([
      prisma.user.findUnique({
        where: { id: session.userId },
        select: { name: true, email: true, teamRoleCode: true, role: true },
      }),
      prisma.client.findFirst({
        where: { id: clientId, tenantId: session.tenantId },
        select: { name: true },
      }),
    ]);

    const actorName = actor?.name || actor?.email || session.email || 'Team Member';
    const actorRole = actor?.role === 'ADMIN' ? 'ADMIN' : (actor?.teamRoleCode || session.roleCode || 'VE').toUpperCase();
    const clientName = client?.name || clientId;

    await prisma.teamChatMessage.create({
      data: {
        id: `wa-log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        tenantId: session.tenantId,
        authorId: session.userId,
        authorName: actorName,
        authorRole: actorRole,
        text: `Generated WhatsApp update for ${clientName} on ${dateStr} (${itemCount} item${itemCount === 1 ? '' : 's'})`,
        type: 'MODULE_LOG',
        taskId: null,
        taskLabel: 'WhatsApp Update',
        mentions: [],
      },
    });
  } catch {
    // Logging should not block summary response.
  }
}

async function canAccess(session: Awaited<ReturnType<typeof getSession>>) {
  if (!session) return false;
  if (session.role === 'ADMIN') return true;
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { teamRoleCode: true, role: true, userModuleAccess: true },
  });
  const roleCode =
    user?.role === 'ADMIN' ? 'ADMIN' : (user?.teamRoleCode || session.roleCode || 'VE').toUpperCase();
  return resolveEffectiveModuleAccess(session.tenantId, roleCode, user?.userModuleAccess).includes('content_production');
}

function formatDate(date: Date) {
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
}

function formatTime(date: Date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}
type PostLinks = {
  facebook?: string;
  instagram?: string;
  youtubeShort?: string;
  youtubeVideo?: string;
  webBlog?: string;
  gmb?: string;
};

function normalizeUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^[a-z0-9.-]+\.[a-z]{2,}(\/.*)?$/i.test(trimmed)) return `https://${trimmed}`;
  return '';
}

function parsePostLinks(raw?: string | null): PostLinks {
  if (!raw) return {};
  const value = raw.trim();
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === 'object') return parsed as PostLinks;
  } catch {
    // fall through
  }
  return { webBlog: value };
}

function firstPostLink(raw?: string | null) {
  const links = parsePostLinks(raw);
  const first = (
    links.facebook ||
    links.instagram ||
    links.youtubeShort ||
    links.youtubeVideo ||
    links.webBlog ||
    links.gmb ||
    ''
  );
  return normalizeUrl(first);
}

function collectPostLinks(raw?: string | null) {
  const links = parsePostLinks(raw);
  const entries: Array<{ platform: string; url: string }> = [];
  const add = (platform: string, value?: string) => {
    if (!value) return;
    const normalized = normalizeUrl(value);
    if (!normalized) return;
    entries.push({ platform, url: normalized });
  };
  add('Facebook', links.facebook);
  add('Instagram', links.instagram);
  add('YouTube Short', links.youtubeShort);
  add('YouTube Video', links.youtubeVideo);
  add('Web Blog', links.webBlog);
  add('Google Business Post', links.gmb);
  return entries;
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!(await canAccess(session))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get('clientId');
  const dateStr = searchParams.get('date');
  if (!clientId || !dateStr) {
    return NextResponse.json({ error: 'clientId and date are required' }, { status: 400 });
  }

  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) {
    return NextResponse.json({ error: 'Invalid date' }, { status: 400 });
  }

  if (!isDatabaseConfigured()) {
    return NextResponse.json({ message: 'Database not configured' }, { status: 500 });
  }

  const start = new Date(date.setHours(0, 0, 0, 0));
  const end = new Date(date.setHours(23, 59, 59, 999));

  try {
    const entries = await prisma.contentProduction.findMany({
      where: {
        tenantId: session!.tenantId,
        clientId,
        finalPostUrl: { not: null },
        OR: [
          { updatedAt: { gte: start, lte: end } },
          { scheduledDate: { gte: start, lte: end } },
        ],
      },
      select: {
        contentCalendarId: true,
        platform: true,
        topic: true,
        finalPostUrl: true,
        client: { select: { name: true } },
        updatedAt: true,
      },
      orderBy: { updatedAt: 'asc' },
    });

    const expandedLines = entries.flatMap((entry) => {
      const links = collectPostLinks(entry.finalPostUrl);
      if (links.length) {
        return links.map((link) => `${link.platform} - ${link.url} (${formatTime(entry.updatedAt)})`);
      }
      const fallback = firstPostLink(entry.finalPostUrl);
      if (!fallback) return [];
      return [`${entry.platform} - ${fallback} (${formatTime(entry.updatedAt)})`];
    });

    const lines = expandedLines.map((line, index) => `${index + 1}. ${line}`);

    const header = `Today's Work Update`;
    const dateLine = `Date : ${formatDate(start)}`;
    const body = lines.length ? lines.join('\n') : 'No content posted today.';
    const footer = `Regards ;\nTeam Genesis`;
    const message = `${header}\n${dateLine}\n\n${body}\n\n${footer}`;

    if (session?.role === 'ADMIN') {
      await logWhatsAppSummaryActivity(session, clientId, dateStr, lines.length);
    }

    return NextResponse.json({ message, count: entries.length });
  } catch {
    return NextResponse.json({ error: 'Failed to generate summary' }, { status: 500 });
  }
}
