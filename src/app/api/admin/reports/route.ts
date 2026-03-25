import { NextResponse } from 'next/server';
import { getSession } from '@/lib/middleware';
import { isDatabaseConfigured, prisma } from '@/lib/prisma';
import { resolveEffectiveModuleAccess } from '@/lib/team-role-store';

type PostLinks = {
  facebook?: string;
  instagram?: string;
  youtubeShort?: string;
  youtubeVideo?: string;
  webBlog?: string;
  gmb?: string;
};

function parseDateRange(searchParams: URLSearchParams) {
  const dateStr = searchParams.get('date');
  const monthStr = searchParams.get('month');
  const yearStr = searchParams.get('year');
  const startStr = searchParams.get('start');
  const endStr = searchParams.get('end');

  if (startStr && endStr) {
    const start = new Date(startStr);
    const end = new Date(endStr);
    if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      return { start, end };
    }
  }

  if (monthStr && yearStr) {
    const month = Number(monthStr);
    const year = Number(yearStr);
    if (!Number.isNaN(month) && !Number.isNaN(year) && month >= 1 && month <= 12) {
      const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
      const end = new Date(year, month, 0, 23, 59, 59, 999);
      return { start, end };
    }
  }

  if (dateStr) {
    const date = new Date(dateStr);
    if (!Number.isNaN(date.getTime())) {
      const start = new Date(date.setHours(0, 0, 0, 0));
      const end = new Date(date.setHours(23, 59, 59, 999));
      return { start, end };
    }
  }

  return { start: null, end: null };
}

function summarizeProductionEntries(entries: Array<any>) {
  const byStatus: Record<string, number> = {};
  const byPlatform: Record<string, number> = {};
  const byEditor: Record<string, number> = {};
  const byEditorDetailed: Record<
    string,
    { id: string; name: string; total: number; completed: number; assigned: number; pending: number }
  > = {};
  const byClient: Record<string, number> = {};

  entries.forEach((entry) => {
    const status = String(entry.status || 'PLANNED').toUpperCase();
    byStatus[status] = (byStatus[status] || 0) + 1;

    const platform = entry.platform || 'Unknown';
    byPlatform[platform] = (byPlatform[platform] || 0) + 1;

    const editorId = entry.assignedEditor?.id || 'unassigned';
    const editorName = entry.assignedEditor?.name || entry.assignedEditor?.email || 'Unassigned';
    byEditor[editorName] = (byEditor[editorName] || 0) + 1;
    if (!byEditorDetailed[editorId]) {
      byEditorDetailed[editorId] = { id: editorId, name: editorName, total: 0, completed: 0, assigned: 0, pending: 0 };
    }
    byEditorDetailed[editorId].total += 1;
    if (status === 'POSTED' || status === 'APPROVED') byEditorDetailed[editorId].completed += 1;
    if (status === 'IN_EDITING' || status === 'READY_FOR_REVIEW' || status === 'APPROVAL') byEditorDetailed[editorId].assigned += 1;
    if (status === 'PLANNED' || status === 'PENDING') byEditorDetailed[editorId].pending += 1;

    const clientName = entry.client?.name || 'Client';
    byClient[clientName] = (byClient[clientName] || 0) + 1;
  });

  const total = entries.length;
  const completed = (byStatus.POSTED || 0) + (byStatus.APPROVED || 0);
  const completionRate = total ? Math.round((completed / total) * 100) : 0;

  return {
    summary: {
      total,
      completed,
      assigned: (byStatus.IN_EDITING || 0) + (byStatus.READY_FOR_REVIEW || 0) + (byStatus.APPROVAL || 0),
      pending: (byStatus.PLANNED || 0) + (byStatus.PENDING || 0),
      completionRate,
    },
    byStatus,
    byPlatform,
    byEditor: Object.entries(byEditor).sort((a, b) => b[1] - a[1]),
    byEditorDetailed: Object.values(byEditorDetailed).sort((a, b) => b.total - a.total),
    byClient: Object.entries(byClient).sort((a, b) => b[1] - a[1]),
  };
}

function serializeDetailedEntries(entries: Array<any>) {
  return entries.map((entry) => ({
    id: entry.id,
    date: entry.scheduledDate,
    clientName: entry.client?.name || 'Client',
    platform: entry.platform || 'Unknown',
    status: (entry.status || 'PLANNED').toUpperCase(),
    editorName: entry.assignedEditor?.name || entry.assignedEditor?.email || 'Unassigned',
    videoLink: firstPostLink(entry.finalPostUrl) || null,
    editedVideoLink: entry.editedContentUrl || null,
    refVideo: null,
    remarks: entry.notes || entry.topic || null,
    attachmentUrl: null,
  }));
}

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
  const first =
    links.instagram ||
    links.facebook ||
    links.youtubeShort ||
    links.youtubeVideo ||
    links.webBlog ||
    links.gmb ||
    '';
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

function summarizePostingEntries(entries: Array<any>) {
  const byPlatform: Record<string, number> = {};
  entries.forEach((entry) => {
    const platform = entry.platform || 'Unknown';
    byPlatform[platform] = (byPlatform[platform] || 0) + 1;
  });

  return {
    total: entries.length,
    byPlatform,
  };
}

function serializePostingEntries(entries: Array<any>) {
  return entries.flatMap((entry) => {
    const links = collectPostLinks(entry.finalPostUrl);
    const owner =
      entry.client?.socialManager?.name ||
      entry.client?.socialManager?.email ||
      entry.assignedEditor?.name ||
      entry.assignedEditor?.email ||
      'Unassigned';

    if (!links.length) {
      const fallback = firstPostLink(entry.finalPostUrl);
      if (!fallback) return [];
      return [{
        id: `${entry.id}-default`,
        date: entry.scheduledDate,
        clientName: entry.client?.name || 'Client',
        platform: entry.platform || 'Unknown',
        status: entry.status || 'POSTED',
        topic: entry.topic || '',
        postLink: fallback,
        socialManagerName: owner,
      }];
    }

    return links.map((link) => ({
      id: `${entry.id}-${link.platform.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      date: entry.scheduledDate,
      clientName: entry.client?.name || 'Client',
      platform: link.platform,
      status: entry.status || 'POSTED',
      topic: entry.topic || '',
      postLink: link.url,
      socialManagerName: owner,
    }));
  });
}

function serializeManualPostingEntries(entries: Array<any>) {
  return entries.map((entry) => ({
    id: entry.id,
    date: entry.reportDate,
    clientName: entry.client?.name || 'Client',
    platform: entry.platform || 'Unknown',
    status: 'MANUAL',
    topic: entry.remarks || '',
    postLink: entry.postLink || null,
    socialManagerName:
      entry.postedByName ||
      entry.client?.socialManager?.name ||
      entry.client?.socialManager?.email ||
      'Unassigned',
    source: 'MANUAL',
  }));
}

function mergePostingEntries(
  databaseEntries: Array<ReturnType<typeof serializePostingEntries>[number]>,
  manualEntries: Array<ReturnType<typeof serializeManualPostingEntries>[number]>
) {
  return [...databaseEntries.map((entry) => ({ ...entry, source: 'SYSTEM' })), ...manualEntries].sort((a, b) => {
    const left = new Date(a.date).getTime();
    const right = new Date(b.date).getTime();
    if (left !== right) return left - right;
    return a.platform.localeCompare(b.platform);
  });
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (session.role !== 'ADMIN') {
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { teamRoleCode: true, role: true, userModuleAccess: true },
    });
    const roleCode = user?.role === 'ADMIN' ? 'ADMIN' : (user?.teamRoleCode || session.roleCode || 'VE').toUpperCase();
    const hasReports = resolveEffectiveModuleAccess(session.tenantId, roleCode, user?.userModuleAccess).includes('reports');
    if (!hasReports) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const { start, end } = parseDateRange(searchParams);
  const editorFilter = searchParams.get('editorId');
  const clientFilter = searchParams.get('clientId');

  try {
    if (!isDatabaseConfigured()) {
      return NextResponse.json({
        ...summarizeProductionEntries([]),
        detailedEntries: [],
        postingSummary: summarizePostingEntries([]),
        postingEntries: [],
      });
    }
    const productionWhere: any = { tenantId: session.tenantId };
    if (start && end) {
      productionWhere.scheduledDate = { gte: start, lte: end };
    }
    if (clientFilter) {
      productionWhere.clientId = clientFilter;
    }
    if (editorFilter) {
      productionWhere.assignedEditorId = editorFilter;
    }

    const postedWhere: any = {
      ...productionWhere,
      finalPostUrl: { not: null },
    };

    const entries = await prisma.contentProduction.findMany({
      where: productionWhere,
      include: {
        client: {
          select: {
            id: true,
            name: true,
            socialManager: { select: { name: true, email: true } },
          },
        },
        assignedEditor: { select: { id: true, name: true, email: true } },
      },
      orderBy: [{ scheduledDate: 'desc' }, { platform: 'asc' }],
    });

    const postedEntries = await prisma.contentProduction.findMany({
      where: postedWhere,
      include: {
        client: {
          select: {
            id: true,
            name: true,
            socialManager: { select: { name: true, email: true } },
          },
        },
        assignedEditor: { select: { id: true, name: true, email: true } },
      },
      orderBy: [{ scheduledDate: 'asc' }, { platform: 'asc' }],
    });

    const manualWhere: any = {
      tenantId: session.tenantId,
    };
    if (start && end) {
      manualWhere.reportDate = { gte: start, lte: end };
    }
    if (clientFilter) {
      manualWhere.clientId = clientFilter;
    }

    const manualPostedEntries = await prisma.manualReportEntry.findMany({
      where: manualWhere,
      include: {
        client: {
          select: {
            id: true,
            name: true,
            socialManager: { select: { name: true, email: true } },
          },
        },
      },
      orderBy: [{ reportDate: 'asc' }, { platform: 'asc' }],
    });

    const mergedPostingEntries = mergePostingEntries(
      serializePostingEntries(postedEntries),
      serializeManualPostingEntries(manualPostedEntries)
    );

    return NextResponse.json({
      ...summarizeProductionEntries(entries),
      detailedEntries: serializeDetailedEntries(entries),
      postingSummary: summarizePostingEntries(mergedPostingEntries),
      postingEntries: mergedPostingEntries,
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to load reports' }, { status: 500 });
  }
}
