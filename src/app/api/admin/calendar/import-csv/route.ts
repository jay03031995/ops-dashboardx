import { NextResponse } from 'next/server';
import { isDatabaseConfigured, prisma } from '@/lib/prisma';
import { getSession } from '@/lib/middleware';
import { getDemoCalendarStore, getDemoClientsStore } from '@/lib/dev-store';
import type { DemoClient } from '@/lib/dev-store';
import { syncContentProductionFromCalendar } from '@/lib/taskboard-content-sync';

type ParsedRow = {
  line: number;
  date: string;
  clientName: string;
  videoLink: string;
  refLink: string;
  remark: string;
  platform: string;
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

function parseRowDate(raw: string, fallback: Date) {
  const value = raw.trim();
  if (!value) return new Date(fallback);

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split('-').map(Number);
    const date = new Date(y, m - 1, d, 0, 0, 0, 0);
    if (!Number.isNaN(date.getTime())) return date;
  }

  // DD/MM/YYYY
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

  return new Date(fallback);
}

function looksLikeUrl(value: string) {
  return (
    /^https?:\/\//i.test(value) ||
    /^www\./i.test(value) ||
    /^(1drv\.ms|youtube\.com|youtu\.be|instagram\.com|tiktok\.com)\//i.test(value)
  );
}

function normalizeUrl(value: string) {
  if (/^www\./i.test(value)) return `https://${value}`;
  if (/^(1drv\.ms|youtube\.com|youtu\.be|instagram\.com|tiktok\.com)\//i.test(value)) return `https://${value}`;
  return value;
}

function inferPlatform(value: string) {
  const url = value.toLowerCase();
  if (url.includes('youtube.com/shorts/') || url.includes('youtu.be/')) return 'Youtube - Short';
  if (url.includes('youtube') || url.includes('youtu.be')) return 'Youtube - Long';
  if (url.includes('instagram')) return 'Instagram';
  if (url.includes('facebook')) return 'Facebook';
  if (url.includes('linkedin')) return 'Linkedin';
  if (url.includes('1drv.ms') || url.includes('onedrive')) return 'Instagram';
  return 'Instagram';
}

function normalizePlatform(value: string) {
  const v = value.trim().toLowerCase();
  if (!v) return '';
  if (v === 'instagram') return 'Instagram';
  if (v === 'facebook') return 'Facebook';
  if (v === 'youtube - long' || v === 'youtube long' || v === 'youtube') return 'Youtube - Long';
  if (v === 'youtube - short' || v === 'youtube short' || v === 'shorts') return 'Youtube - Short';
  if (v === 'linkedin' || v === 'linked in') return 'Linkedin';
  return '';
}

function extractRows(rows: string[][]): ParsedRow[] {
  if (!rows.length) return [];

  const headers = rows[0].map(normalizeHeader);
  const dateIndex = findIndex(headers, ['date', 'task date', 'scheduled date']);
  const clientIndex = findIndex(headers, ['client name', 'client', 'name']);
  const videoLinkIndex = findIndex(headers, ['video link', 'video url', 'link']);
  const refLinkIndex = findIndex(headers, ['ref link', 'reference', 'ref video']);
  const remarkIndex = findIndex(headers, ['remark', 'remarks', 'note']);
  const platformIndex = findIndex(headers, ['platform']);

  const parsed: ParsedRow[] = [];
  const hasHeader =
    dateIndex !== -1 ||
    clientIndex !== -1 ||
    videoLinkIndex !== -1 ||
    refLinkIndex !== -1 ||
    remarkIndex !== -1 ||
    platformIndex !== -1;
  const start = hasHeader ? 1 : 0;
  const dIdx = dateIndex !== -1 ? dateIndex : 0;
  const cIdx = clientIndex !== -1 ? clientIndex : 0;
  const vIdx = videoLinkIndex !== -1 ? videoLinkIndex : 1;
  const rIdx = refLinkIndex !== -1 ? refLinkIndex : 2;
  const rmIdx = remarkIndex !== -1 ? remarkIndex : 3;
  const pIdx = platformIndex !== -1 ? platformIndex : 4;

  for (let i = start; i < rows.length; i += 1) {
    const line = i + 1;
    const date = (rows[i][dIdx] || '').trim();
    const clientName = (rows[i][cIdx] || '').trim();
    const videoLink = (rows[i][vIdx] || '').trim();
    const refLink = (rows[i][rIdx] || '').trim();
    const remark = (rows[i][rmIdx] || '').trim();
    const platform = (rows[i][pIdx] || '').trim();
    if (!clientName) continue;
    parsed.push({ line, date, clientName, videoLink, refLink, remark, platform });
  }
  return parsed;
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'CSV file is required' }, { status: 400 });
    }

    const text = await file.text();
    const parsed = extractRows(parseCsvRows(text));
    if (!parsed.length) {
      return NextResponse.json({ error: 'No valid rows found in CSV' }, { status: 400 });
    }

    let createdClients = 0;
    let createdEntries = 0;
    const skipped: { line: number; reason: string }[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (!isDatabaseConfigured()) {
      const clientsStore = getDemoClientsStore();
      const calendarStore = getDemoCalendarStore();

      for (const row of parsed) {
        const name = row.clientName.trim();
        if (!name) {
          skipped.push({ line: row.line, reason: 'Missing client name' });
          continue;
        }

        let client = clientsStore.find(
          (c) => c.tenantId === session.tenantId && c.name.toLowerCase() === name.toLowerCase()
        );
        if (!client) {
          const demoClient: DemoClient = {
            id: `demo-client-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            name,
            oneDriveFolder: null,
            editorId: null,
            tenantId: session.tenantId,
            editor: null,
          };
          clientsStore.push(demoClient);
          client = demoClient;
          createdClients += 1;
        }

        const normalized = normalizeUrl(row.videoLink);
        const asUrl = looksLikeUrl(normalized);
        const hasEditor = Boolean(client.editorId);

        const date = parseRowDate(row.date, today);
        let videoUrl: string | null = null;
        let status: 'PENDING' | 'ASSIGNED' = 'PENDING';
        if (asUrl && hasEditor) {
          status = 'ASSIGNED';
        }
        if (asUrl) videoUrl = normalized;

        const normalizedPlatform = normalizePlatform(row.platform);
        const platform = normalizedPlatform || (asUrl ? inferPlatform(normalized) : 'Instagram');
        const videoTopic = row.remark || row.videoLink || 'CSV Imported Task';

        calendarStore.push({
          id: `demo-calendar-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          date: date.toISOString(),
          videoTopic,
          videoLink: videoUrl,
          remarks: row.remark || videoTopic,
          refVideo: row.refLink || null,
          attachmentUrl: null,
          platform,
          status,
          videoUrl,
          clientId: client.id,
          tenantId: session.tenantId,
        });
        createdEntries += 1;
      }

      return NextResponse.json({ createdClients, createdEntries, skipped });
    }

    for (const row of parsed) {
      const name = row.clientName.trim();
      if (!name) {
        skipped.push({ line: row.line, reason: 'Missing client name' });
        continue;
      }

      const existingClient = await prisma.client.findUnique({
        where: { name_tenantId: { name, tenantId: session.tenantId } },
        select: { id: true },
      });

      const client = await prisma.client.upsert({
        where: { name_tenantId: { name, tenantId: session.tenantId } },
        update: {},
        create: {
          name,
          tenantId: session.tenantId,
        },
        select: { id: true, editorId: true },
      });
      if (!existingClient) createdClients += 1;

      const normalized = normalizeUrl(row.videoLink);
      const asUrl = looksLikeUrl(normalized);
      const hasEditor = Boolean(client.editorId);

      const date = parseRowDate(row.date, today);
      let videoUrl: string | null = null;
      let status: 'PENDING' | 'ASSIGNED' = 'PENDING';
      if (asUrl && hasEditor) {
        status = 'ASSIGNED';
      }
      if (asUrl) videoUrl = normalized;

      const normalizedPlatform = normalizePlatform(row.platform);
      const platform = normalizedPlatform || (asUrl ? inferPlatform(normalized) : 'Instagram');
      const videoTopic = row.remark || row.videoLink || 'CSV Imported Task';

      const createdEntry = await prisma.contentCalendar.create({
        data: {
          tenantId: session.tenantId,
          clientId: client.id,
          date,
          status,
          videoUrl,
          refVideo: row.refLink || null,
          attachmentUrl: null,
          videoTopic,
          platform,
        },
      });
      await syncContentProductionFromCalendar({
        id: createdEntry.id,
        tenantId: session.tenantId,
        clientId: createdEntry.clientId,
        date: createdEntry.date,
        platform: createdEntry.platform,
        topic: createdEntry.videoTopic,
        status: createdEntry.status,
        assignedEditorId: createdEntry.assignedEditorId || null,
      });
      createdEntries += 1;
    }

    return NextResponse.json({ createdClients, createdEntries, skipped });
  } catch {
    return NextResponse.json({ error: 'Failed to import CSV' }, { status: 500 });
  }
}
