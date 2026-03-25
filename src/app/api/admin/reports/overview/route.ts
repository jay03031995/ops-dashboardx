import { NextResponse } from 'next/server';
import { getSession } from '@/lib/middleware';
import { prisma, isDatabaseConfigured } from '@/lib/prisma';
import { resolveEffectiveModuleAccess } from '@/lib/team-role-store';

function parseDateRange(searchParams: URLSearchParams) {
  const monthStr = searchParams.get('month');
  const yearStr = searchParams.get('year');
  const startStr = searchParams.get('start');
  const endStr = searchParams.get('end');
  const dateStr = searchParams.get('date');

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

function formatDate(value: Date) {
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(value);
}

function formatPeriod(start: Date, end: Date) {
  if (start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth()) {
    return new Intl.DateTimeFormat('en-US', {
      month: 'long',
      year: 'numeric',
    }).format(start);
  }
  return `${formatDate(start)} to ${formatDate(end)}`;
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
  return resolveEffectiveModuleAccess(session.tenantId, roleCode, user?.userModuleAccess).includes('reports');
}

function extractGeminiText(payload: any): string {
  const parts =
    payload?.candidates?.flatMap((candidate: any) =>
      Array.isArray(candidate?.content?.parts)
        ? candidate.content.parts
            .map((part: any) => (typeof part?.text === 'string' ? part.text : ''))
            .filter(Boolean)
        : []
    ) || [];
  return parts.join('\n').trim();
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!(await canAccess(session))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: 'AI overview is unavailable in demo mode' }, { status: 400 });
  }

  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: 'GEMINI_API_KEY is not configured on the server' }, { status: 500 });
  }

  try {
    const url = new URL(request.url);
    const { start, end } = parseDateRange(url.searchParams);
    const body = await request.json();
    const clientId = typeof body.clientId === 'string' ? body.clientId.trim() : '';
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    const mode = typeof body.mode === 'string' ? body.mode.trim().toUpperCase() : 'GENERATE';

    if (!clientId) {
      return NextResponse.json({ error: 'clientId is required' }, { status: 400 });
    }
    if (!start || !end) {
      return NextResponse.json({ error: 'A valid date range is required' }, { status: 400 });
    }

    const client = await prisma.client.findFirst({
      where: { id: clientId, tenantId: session!.tenantId },
      include: {
        socialManager: { select: { name: true, email: true } },
      },
    });
    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }

    const contentItems = await prisma.contentProduction.findMany({
      where: {
        tenantId: session!.tenantId,
        clientId,
        scheduledDate: { gte: start, lte: end },
      },
      select: {
        scheduledDate: true,
        platform: true,
        status: true,
        topic: true,
        finalPostUrl: true,
        assignedEditor: { select: { name: true, email: true } },
      },
      orderBy: [{ scheduledDate: 'asc' }, { platform: 'asc' }],
    });

    const manualItems = await prisma.manualReportEntry.findMany({
      where: {
        tenantId: session!.tenantId,
        clientId,
        reportDate: { gte: start, lte: end },
      },
      select: {
        reportDate: true,
        platform: true,
        postLink: true,
        postedByName: true,
        remarks: true,
      },
      orderBy: [{ reportDate: 'asc' }, { platform: 'asc' }],
    });

    const totalItems = contentItems.length;
    const postedItems = contentItems.filter((item) => String(item.status).toUpperCase() === 'POSTED' && item.finalPostUrl);
    const platformTotals = [...postedItems, ...manualItems].reduce<Record<string, number>>((acc, item) => {
      const platform = item.platform || 'Unknown';
      acc[platform] = (acc[platform] || 0) + 1;
      return acc;
    }, {});
    const statusTotals = contentItems.reduce<Record<string, number>>((acc, item) => {
      const status = String(item.status || 'PLANNED').toUpperCase();
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {});
    const teamMembers = Array.from(
      new Set(
        [
          client.socialManager?.name || client.socialManager?.email || '',
          ...contentItems.map((item) => item.assignedEditor?.name || item.assignedEditor?.email || ''),
          ...manualItems.map((item) => item.postedByName || ''),
        ].filter(Boolean)
      )
    );
    const periodLabel = formatPeriod(start, end);

    const prompt =
      mode === 'REFINE' && text
        ? [
            'Refine the following executive summary for a professional client report from Genesis Virtue.',
            'Use polished corporate language.',
            'Keep it concise, warm, and confident.',
            'Do not invent facts or metrics.',
            'Do not use overly descriptive or casual wording.',
            `Client: ${client.name}`,
            `Period: ${periodLabel}`,
            `Current draft:\n${text}`,
          ].join('\n')
        : [
            'Write a professional executive summary for a client-facing social media performance report from Genesis Virtue.',
            'Use polished business terminology.',
            'Keep it concise: one short paragraph and one closing sentence.',
            'Do not mention AI.',
            'Do not invent facts, performance claims, or marketing metrics.',
            `Client: ${client.name}`,
            `Reporting period: ${periodLabel}`,
            `Social manager / team members involved: ${teamMembers.join(', ') || 'Unassigned'}`,
            `Total content production items: ${totalItems}`,
            `Posted items with live links: ${postedItems.length + manualItems.length}`,
            `Platform totals: ${JSON.stringify(platformTotals)}`,
            `Production status totals: ${JSON.stringify(statusTotals)}`,
            `Posted records: ${JSON.stringify(
              [...postedItems, ...manualItems].map((item: any) => ({
                date: formatDate(item.scheduledDate || item.reportDate),
                platform: item.platform,
                postedBy:
                  item.assignedEditor?.name ||
                  item.assignedEditor?.email ||
                  item.postedByName ||
                  client.socialManager?.name ||
                  client.socialManager?.email ||
                  'Unassigned',
              }))
            )}`,
          ].join('\n');

    const model = process.env.GEMINI_REWRITE_MODEL || 'gemini-2.5-flash';
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': process.env.GEMINI_API_KEY,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.5,
            maxOutputTokens: 260,
          },
        }),
      }
    );

    const payload = await response.json();
    if (!response.ok) {
      const message = payload?.error?.message || payload?.message || 'Failed to generate overview';
      return NextResponse.json({ error: message }, { status: 500 });
    }

    const overview = extractGeminiText(payload);
    if (!overview) {
      return NextResponse.json({ error: 'Gemini returned an empty overview' }, { status: 500 });
    }

    return NextResponse.json({ text: overview });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to generate overview';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
