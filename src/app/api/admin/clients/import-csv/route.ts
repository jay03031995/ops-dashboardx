import { NextResponse } from 'next/server';
import { isDatabaseConfigured, prisma } from '@/lib/prisma';
import { getSession } from '@/lib/middleware';
import { getDemoClientsStore } from '@/lib/dev-store';
import type { DemoClient } from '@/lib/dev-store';

type ParsedRow = {
  line: number;
  clientName: string;
  oneDriveFolder: string;
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

function extractRows(rows: string[][]): ParsedRow[] {
  if (!rows.length) return [];

  const headers = rows[0].map(normalizeHeader);
  const clientIndex = findIndex(headers, ['client name', 'client', 'name']);
  const folderIndex = findIndex(headers, [
    'onedrive folder',
    'one drive folder',
    'onedrive',
    'one drive',
    'folder',
    'folder link',
    'embed link',
    'link',
  ]);

  const parsed: ParsedRow[] = [];
  const hasHeader = clientIndex !== -1 || folderIndex !== -1;
  const start = hasHeader ? 1 : 0;
  const cIdx = clientIndex !== -1 ? clientIndex : 0;
  const fIdx = folderIndex !== -1 ? folderIndex : 1;

  for (let i = start; i < rows.length; i += 1) {
    const line = i + 1;
    const clientName = (rows[i][cIdx] || '').trim();
    const oneDriveFolder = (rows[i][fIdx] || '').trim();
    if (!clientName) continue;
    parsed.push({ line, clientName, oneDriveFolder });
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
    const skipped: { line: number; reason: string }[] = [];

    if (!isDatabaseConfigured()) {
      const clientsStore = getDemoClientsStore();

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
            oneDriveFolder: row.oneDriveFolder || null,
            editorId: null,
            tenantId: session.tenantId,
            editor: null,
          };
          clientsStore.push(demoClient);
          createdClients += 1;
          continue;
        }

        client.oneDriveFolder = row.oneDriveFolder || null;
      }

      return NextResponse.json({ createdClients, skipped });
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

      await prisma.client.upsert({
        where: { name_tenantId: { name, tenantId: session.tenantId } },
        update: {
          ...(row.oneDriveFolder ? { oneDriveFolder: row.oneDriveFolder } : {}),
        },
        create: {
          name,
          oneDriveFolder: row.oneDriveFolder || null,
          tenantId: session.tenantId,
        },
      });

      if (!existingClient) createdClients += 1;
    }

    return NextResponse.json({ createdClients, skipped });
  } catch {
    return NextResponse.json({ error: 'Failed to import CSV' }, { status: 500 });
  }
}
