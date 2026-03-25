import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/middleware';
import { prisma } from '@/lib/prisma';
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

function formatDate(value: Date) {
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(value);
}

function formatMonthYear(start: Date, end: Date) {
  if (
    start.getFullYear() === end.getFullYear() &&
    start.getMonth() === end.getMonth()
  ) {
    return new Intl.DateTimeFormat('en-US', {
      month: 'long',
      year: 'numeric',
    }).format(start);
  }

  return `${formatDate(start)} - ${formatDate(end)}`;
}

function withHonorific(name: string) {
  const trimmed = name.trim();
  if (/^dr\.?\s/i.test(trimmed)) return trimmed;
  return `Dr ${trimmed}`;
}

function withoutDuplicateHonorific(name: string) {
  return name.trim().replace(/^dr\.?\s+/i, 'Dr ');
}

async function generateReportOverview(input: {
  clientName: string;
  periodLabel: string;
  teamOwners: string[];
  totalPosts: number;
  byPlatform: Record<string, number>;
  rows: Array<{ date: Date; platform: string; postLink: string; postedByName: string }>;
}) {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_REWRITE_MODEL || 'gemini-2.5-flash';

  if (!apiKey) {
    return `Genesis Virtue completed ${input.totalPosts} social media posts for ${withoutDuplicateHonorific(input.clientName)} during ${input.periodLabel}. The update covered ${Object.entries(input.byPlatform)
      .map(([platform, count]) => `${platform} (${count})`)
      .join(', ')} and was coordinated by ${input.teamOwners.join(', ')}.`;
  }

  const prompt = [
    'Write a polished client-facing monthly social media report overview for Genesis Virtue.',
    'Address the client by name in a warm, professional tone.',
    'Mention Genesis Virtue as the team delivering the work.',
    'Keep it to one short paragraph plus one closing sentence.',
    'Do not invent metrics or claims.',
    `Client: ${withoutDuplicateHonorific(input.clientName)}`,
    `Reporting period: ${input.periodLabel}`,
    `Posting owners: ${input.teamOwners.join(', ')}`,
    `Total posts delivered: ${input.totalPosts}`,
    `Platform totals: ${JSON.stringify(input.byPlatform)}`,
    `Posted items: ${JSON.stringify(
      input.rows.map((row) => ({
        date: formatDate(row.date),
        platform: row.platform,
        link: row.postLink,
        postedBy: row.postedByName,
      }))
    )}`,
  ].join('\n');

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            temperature: 0.5,
            maxOutputTokens: 220,
          },
        }),
      }
    );

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts
      ?.map((part: { text?: string }) => part.text || '')
      .join('')
      .trim();

    if (response.ok && text) {
      return text;
    }
  } catch {
    // Fallback below.
  }

  return `Dear ${withoutDuplicateHonorific(input.clientName)}, Genesis Virtue delivered ${input.totalPosts} social media posts during ${input.periodLabel}. The work spanned ${Object.entries(
    input.byPlatform
  )
    .map(([platform, count]) => `${platform} (${count})`)
    .join(', ')} and was coordinated by ${input.teamOwners.join(', ')}. Thank you for your continued trust in our team.`;
}

async function generateClosingNote(input: {
  clientName: string;
  periodLabel: string;
  teamOwners: string[];
  totalPosts: number;
  byPlatform: Record<string, number>;
}) {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_REWRITE_MODEL || 'gemini-2.5-flash';

  if (!apiKey) {
    return `Thank you, ${withoutDuplicateHonorific(input.clientName)}, for your continued trust and collaboration with Genesis Virtue during ${input.periodLabel}. We also appreciate the focused effort of our internal team in delivering consistent support for your digital presence, and we look forward to building stronger visibility for your practice across ${Object.keys(input.byPlatform).join(', ') || 'your digital channels'}.`;
  }

  const prompt = [
    'Write a structured client-facing closing note for a social media performance report from Genesis Virtue.',
    'Acknowledge the effort of both the client and the Genesis Virtue team.',
    'Mention continued collaboration to strengthen the client’s online presence.',
    'Use warm, professional language.',
    'Write exactly 2 short paragraphs.',
    'The first paragraph should acknowledge the client and the reporting period.',
    'The second paragraph should appreciate the Genesis Virtue team and reinforce continued partnership for online presence.',
    `Client: ${withoutDuplicateHonorific(input.clientName)}`,
    `Period: ${input.periodLabel}`,
    `Team members involved: ${input.teamOwners.join(', ')}`,
    `Total published items: ${input.totalPosts}`,
    `Platform totals: ${JSON.stringify(input.byPlatform)}`,
  ].join('\n');

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            temperature: 0.45,
            maxOutputTokens: 120,
          },
        }),
      }
    );

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts
      ?.map((part: { text?: string }) => part.text || '')
      .join('')
      .trim();

    if (response.ok && text) {
      return text;
    }
  } catch {
    // Fallback below.
  }

  return `Thank you, ${withoutDuplicateHonorific(input.clientName)}, for your continued trust and collaboration with Genesis Virtue during ${input.periodLabel}. We also appreciate the dedicated effort of our team in supporting your brand presence, and we look forward to strengthening your online visibility with consistency and care.`;
}

function wrapText(text: string, maxChars: number) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';

  words.forEach((word) => {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  });

  if (current) {
    lines.push(current);
  }

  return lines;
}

function paragraphLines(text: string, maxChars: number) {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  if (!paragraphs.length) {
    return [];
  }

  return paragraphs.flatMap((paragraph, index) => {
    const lines = wrapText(paragraph, maxChars);
    return index === paragraphs.length - 1 ? lines : [...lines, ''];
  });
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
  if (!(await canAccess(session))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get('clientId');
  const { start, end } = parseDateRange(searchParams);

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

  const postedEntries = await prisma.contentProduction.findMany({
    where: {
      tenantId: session!.tenantId,
      clientId,
      finalPostUrl: { not: null },
      scheduledDate: { gte: start, lte: end },
    },
    orderBy: [{ scheduledDate: 'asc' }, { platform: 'asc' }],
    select: {
      scheduledDate: true,
      platform: true,
      finalPostUrl: true,
      topic: true,
    },
  });

  const safeRows = postedEntries
    .flatMap((entry) => {
      const owner =
        client.socialManager?.name ||
        client.socialManager?.email ||
        'Unassigned';
      const links = collectPostLinks(entry.finalPostUrl);
      if (!links.length) {
        const fallback = normalizeUrl(entry.finalPostUrl as string);
        return fallback
          ? [{
              date: entry.scheduledDate,
              platform: entry.platform || 'Unknown',
              topic: entry.topic || '',
              postLink: fallback,
              postedByName: owner,
            }]
          : [];
      }
      return links.map((link) => ({
        date: entry.scheduledDate,
        platform: link.platform,
        topic: entry.topic || '',
        postLink: link.url,
        postedByName: owner,
      }));
    });

  const manualEntries = await prisma.manualReportEntry.findMany({
    where: {
      tenantId: session!.tenantId,
      clientId,
      reportDate: { gte: start, lte: end },
    },
    orderBy: [{ reportDate: 'asc' }, { platform: 'asc' }],
    select: {
      reportDate: true,
      platform: true,
      postLink: true,
      postedByName: true,
      remarks: true,
    },
  });

  const mergedRows = [
    ...safeRows,
    ...manualEntries.map((entry) => ({
      date: entry.reportDate,
      platform: entry.platform || 'Unknown',
      topic: entry.remarks || '',
      postLink: entry.postLink,
      postedByName:
        entry.postedByName ||
        client.socialManager?.name ||
        client.socialManager?.email ||
        'Unassigned',
    })),
  ].sort((a, b) => {
    const left = new Date(a.date).getTime();
    const right = new Date(b.date).getTime();
    if (left !== right) return left - right;
    return a.platform.localeCompare(b.platform);
  });

  const byPlatform = mergedRows.reduce<Record<string, number>>((acc, row) => {
    acc[row.platform] = (acc[row.platform] || 0) + 1;
    return acc;
  }, {});

  const teamOwners = Array.from(new Set(mergedRows.map((row) => row.postedByName).filter(Boolean)));
  const socialManagerName = teamOwners.join(', ') || client.socialManager?.name || client.socialManager?.email || 'Unassigned';
  const periodLabel = formatMonthYear(start, end);
  const reportOverview = await generateReportOverview({
    clientName: client.name,
    periodLabel,
    teamOwners: teamOwners.length ? teamOwners : [socialManagerName],
    totalPosts: mergedRows.length,
    byPlatform,
    rows: mergedRows,
  });
  const closingNote = await generateClosingNote({
    clientName: client.name,
    periodLabel,
    teamOwners: teamOwners.length ? teamOwners : [socialManagerName],
    totalPosts: mergedRows.length,
    byPlatform,
  });

  const pdf = await PDFDocument.create();
  const pageSize: [number, number] = [842, 1191];
  const margin = 48;
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);
  const logoPath = path.join(process.cwd(), 'public', 'brand', 'genesisvirtue-logo.png');
  const logoBytes = await readFile(logoPath);
  const logoImage = await pdf.embedPng(logoBytes);
  const logoDims = logoImage.scale(0.23);

  let page = pdf.addPage(pageSize);
  let cursorY = page.getHeight() - margin;

  const ensureSpace = (required: number) => {
    if (cursorY - required < margin) {
      page = pdf.addPage(pageSize);
      cursorY = page.getHeight() - margin;
    }
  };

  const drawLine = (label: string, value: string, yStep = 18) => {
    ensureSpace(yStep + 8);
    page.drawText(label, {
      x: margin,
      y: cursorY,
      size: 11,
      font: boldFont,
      color: rgb(0.1, 0.18, 0.35),
    });
    page.drawText(value, {
      x: margin + 120,
      y: cursorY,
      size: 11,
      font,
      color: rgb(0.18, 0.22, 0.3),
    });
    cursorY -= yStep;
  };

  const drawParagraph = (text: string, maxChars = 98, lineHeight = 15) => {
    const lines = paragraphLines(text, maxChars);
    ensureSpace(lines.length * lineHeight + 10);
    lines.forEach((line) => {
      if (line) {
        page.drawText(line, {
          x: margin,
          y: cursorY,
          size: 11,
          font,
          color: rgb(0.18, 0.22, 0.3),
        });
      }
      cursorY -= lineHeight;
    });
    cursorY -= 6;
  };

  page.drawRectangle({
    x: 0,
    y: page.getHeight() - 118,
    width: page.getWidth(),
    height: 118,
    color: rgb(0.08, 0.16, 0.33),
  });
  page.drawImage(logoImage, {
    x: margin,
    y: page.getHeight() - 92,
    width: logoDims.width,
    height: logoDims.height,
  });
  page.drawText('Genesis Virtue', {
    x: margin + 78,
    y: page.getHeight() - 58,
    size: 22,
    font: boldFont,
    color: rgb(1, 1, 1),
  });
  page.drawText('Client Social Media Performance Report', {
    x: margin + 78,
    y: page.getHeight() - 82,
    size: 12,
    font,
    color: rgb(0.87, 0.92, 1),
  });

  cursorY = page.getHeight() - 150;
  page.drawText('Monthly Client Report', {
    x: margin,
    y: cursorY,
    size: 20,
    font: boldFont,
    color: rgb(0.1, 0.18, 0.35),
  });
  cursorY -= 28;

  drawLine('Client', client.name);
  drawLine('Period', periodLabel);
  drawLine('Social Manager', socialManagerName);
  drawLine('Total Posts', String(mergedRows.length));
  drawLine(
    'Platform Mix',
    Object.entries(byPlatform)
      .map(([platform, count]) => `${platform}: ${count}`)
      .join(' | ') || 'No posted items'
  );

  cursorY -= 8;
  page.drawText('Report Overview', {
    x: margin,
    y: cursorY,
    size: 14,
    font: boldFont,
    color: rgb(0.1, 0.18, 0.35),
  });
  cursorY -= 22;
  drawParagraph(reportOverview);

  cursorY -= 4;
  page.drawText('Date-wise Posting Details', {
    x: margin,
    y: cursorY,
    size: 14,
    font: boldFont,
    color: rgb(0.1, 0.18, 0.35),
  });
  cursorY -= 20;

  const columns = [
    { label: 'Date', x: margin, width: 72 },
    { label: 'Platform', x: margin + 78, width: 100 },
    { label: 'Posted By', x: margin + 184, width: 120 },
    { label: 'Post Link', x: margin + 310, width: 470 },
  ];

  const drawTableHeader = () => {
    ensureSpace(28);
    page.drawRectangle({
      x: margin - 4,
      y: cursorY - 6,
      width: 748,
      height: 22,
      color: rgb(0.92, 0.95, 1),
    });
    columns.forEach((column) => {
      page.drawText(column.label, {
        x: column.x,
        y: cursorY,
        size: 10,
        font: boldFont,
        color: rgb(0.1, 0.18, 0.35),
      });
    });
    cursorY -= 24;
  };

  drawTableHeader();

  if (!mergedRows.length) {
    page.drawText('No posted content found for the selected period.', {
      x: margin,
      y: cursorY,
      size: 11,
      font,
      color: rgb(0.35, 0.4, 0.5),
    });
  } else {
    mergedRows.forEach((row) => {
      const linkLines = wrapText(row.postLink, 62);
      const rowHeight = Math.max(18, linkLines.length * 12 + 4);
      ensureSpace(rowHeight + 12);
      if (cursorY < page.getHeight() - margin - 360 && cursorY - rowHeight < margin) {
        page = pdf.addPage(pageSize);
        cursorY = page.getHeight() - margin;
        drawTableHeader();
      }

      page.drawText(formatDate(row.date), {
        x: columns[0].x,
        y: cursorY,
        size: 10,
        font,
        color: rgb(0.18, 0.22, 0.3),
      });
      page.drawText(row.platform, {
        x: columns[1].x,
        y: cursorY,
        size: 10,
        font,
        color: rgb(0.18, 0.22, 0.3),
      });
      page.drawText(row.postedByName || socialManagerName, {
        x: columns[2].x,
        y: cursorY,
        size: 10,
        font,
        color: rgb(0.18, 0.22, 0.3),
      });
      linkLines.forEach((line, index) => {
        page.drawText(line, {
          x: columns[3].x,
          y: cursorY - index * 12,
          size: 10,
          font,
          color: rgb(0.07, 0.24, 0.65),
        });
      });
      cursorY -= rowHeight;
      page.drawLine({
        start: { x: margin - 4, y: cursorY + 4 },
        end: { x: 792, y: cursorY + 4 },
        thickness: 0.6,
        color: rgb(0.88, 0.9, 0.94),
      });
      cursorY -= 8;
    });
  }

  cursorY -= 10;
  ensureSpace(80);
  page.drawText('Closing Note', {
    x: margin,
    y: cursorY,
    size: 14,
    font: boldFont,
    color: rgb(0.1, 0.18, 0.35),
  });
  cursorY -= 22;
  drawParagraph(closingNote);

  const pdfBytes = await pdf.save();
  const fileName = `${client.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${periodLabel
    .replace(/[^a-z0-9]+/gi, '-')
    .toLowerCase()}-genesis-report.pdf`;

  return new NextResponse(Buffer.from(pdfBytes), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      Pragma: 'no-cache',
      Expires: '0',
    },
  });
}
