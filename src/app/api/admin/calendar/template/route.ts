import { NextResponse } from 'next/server';
import { getSession } from '@/lib/middleware';
import { isDatabaseConfigured, prisma } from '@/lib/prisma';
import { getDemoClientsStore } from '@/lib/dev-store';

function csvEscape(value: string) {
  const text = value ?? '';
  if (text.includes(',') || text.includes('"') || text.includes('\n')) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function dateValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let clientNames: string[] = [];
  if (!isDatabaseConfigured()) {
    clientNames = getDemoClientsStore()
      .filter((client) => client.tenantId === session.tenantId)
      .map((client) => client.name);
  } else {
    const clients = await prisma.client.findMany({
      where: { tenantId: session.tenantId },
      select: { name: true },
      orderBy: { name: 'asc' },
    });
    clientNames = clients.map((client) => client.name);
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const lines: string[] = ['Date,Client Name,Video Link,Ref Link,Remark,Platform'];

  if (!clientNames.length) {
    for (let day = 0; day < 7; day += 1) {
      const d = new Date(today);
      d.setDate(today.getDate() + day);
      lines.push([dateValue(d), '', '', '', '', 'Instagram'].map(csvEscape).join(','));
    }
  } else {
    for (let day = 0; day < 7; day += 1) {
      const d = new Date(today);
      d.setDate(today.getDate() + day);
      const date = dateValue(d);
      for (const clientName of clientNames) {
        lines.push([date, clientName, '', '', '', 'Instagram'].map(csvEscape).join(','));
      }
    }
  }

  const csv = `${lines.join('\n')}\n`;
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="task-tracker-template.csv"',
      'Cache-Control': 'no-store',
    },
  });
}
