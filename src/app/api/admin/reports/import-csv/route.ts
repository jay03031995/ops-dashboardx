import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/middleware';
import { resolveEffectiveModuleAccess } from '@/lib/team-role-store';

type ParsedRow = {
  line: number;
  date: string;
  platform: string;
  postLink: string;
  postedByName: string;
  remarks: string;
};

function parseCsvLine(line: string) {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  values.push(current.trim());
  return values;
}

function parseCsvRows(content: string): string[][] {
  return content
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map(parseCsvLine);
}

function normalizeHeader(value: string) {
  return value.toLowerCase().trim();
}

function findIndex(headers: string[], patterns: string[]) {
  return headers.findIndex((header) => patterns.some((pattern) => header.includes(pattern)));
}

function parseRowDate(raw: string) {
  const value = raw.trim();
  if (!value) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split('-').map(Number);
    const date = new Date(y, m - 1, d, 0, 0, 0, 0);
    if (!Number.isNaN(date.getTime())) return date;
  }

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) {
    const [d, m, y] = value.split('/').map(Number);
    const date = new Date(y, m - 1, d, 0, 0, 0, 0);
    if (!Number.isNaN(date.getTime())) return date;
  }

  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    parsed.setHours(0, 0, 0, 0);
    return parsed;
  }

  return null;
}

function extractRows(rows: string[][]): ParsedRow[] {
  if (!rows.length) return [];

  const headers = rows[0].map(normalizeHeader);
  const dateIndex = findIndex(headers, ['date']);
  const platformIndex = findIndex(headers, ['platform']);
  const linkIndex = findIndex(headers, ['post link', 'social media link', 'link', 'url']);
  const postedByIndex = findIndex(headers, ['posted by', 'social manager', 'manager', 'owner']);
  const remarksIndex = findIndex(headers, ['remarks', 'remark', 'notes', 'topic']);
  const hasHeader =
    dateIndex !== -1 || platformIndex !== -1 || linkIndex !== -1 || postedByIndex !== -1 || remarksIndex !== -1;

  const start = hasHeader ? 1 : 0;
  const dIdx = dateIndex !== -1 ? dateIndex : 0;
  const pIdx = platformIndex !== -1 ? platformIndex : 1;
  const lIdx = linkIndex !== -1 ? linkIndex : 2;
  const pbIdx = postedByIndex !== -1 ? postedByIndex : 3;
  const rIdx = remarksIndex !== -1 ? remarksIndex : 4;
  const parsed: ParsedRow[] = [];

  for (let i = start; i < rows.length; i += 1) {
    const line = i + 1;
    const date = (rows[i][dIdx] || '').trim();
    const platform = (rows[i][pIdx] || '').trim();
    const postLink = (rows[i][lIdx] || '').trim();
    const postedByName = (rows[i][pbIdx] || '').trim();
    const remarks = (rows[i][rIdx] || '').trim();
    if (!date || !platform || !postLink) continue;
    parsed.push({ line, date, platform, postLink, postedByName, remarks });
  }

  return parsed;
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

export async function POST(request: Request) {
  const session = await getSession();
  if (!(await canAccess(session))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const clientId = String(formData.get('clientId') || '').trim();
    const file = formData.get('file');

    if (!clientId) {
      return NextResponse.json({ error: 'clientId is required' }, { status: 400 });
    }

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'CSV file is required' }, { status: 400 });
    }

    const client = await prisma.client.findFirst({
      where: { id: clientId, tenantId: session!.tenantId },
      select: { id: true },
    });
    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }

    const text = await file.text();
    const parsedRows = extractRows(parseCsvRows(text));
    if (!parsedRows.length) {
      return NextResponse.json({ error: 'No valid rows found in CSV' }, { status: 400 });
    }

    const skipped: { line: number; reason: string }[] = [];
    let createdEntries = 0;

    for (const row of parsedRows) {
      const reportDate = parseRowDate(row.date);
      if (!reportDate) {
        skipped.push({ line: row.line, reason: 'Invalid date' });
        continue;
      }

      await prisma.manualReportEntry.create({
        data: {
          tenantId: session!.tenantId,
          clientId,
          reportDate,
          platform: row.platform,
          postLink: row.postLink,
          postedByName: row.postedByName || null,
          remarks: row.remarks || null,
        },
      });
      createdEntries += 1;
    }

    return NextResponse.json({ createdEntries, skipped });
  } catch (error) {
    console.error('Failed to import manual report CSV', error);
    return NextResponse.json({ error: 'Failed to import CSV' }, { status: 500 });
  }
}
