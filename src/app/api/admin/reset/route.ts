import { NextResponse } from 'next/server';
import { getSession } from '@/lib/middleware';
import { isDatabaseConfigured, prisma } from '@/lib/prisma';
import { getDemoCalendarStore, getDemoClientsStore, getDemoEditorsStore } from '@/lib/dev-store';

export async function POST() {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    if (!isDatabaseConfigured()) {
      const demoCalendar = getDemoCalendarStore();
      const demoClients = getDemoClientsStore();
      const demoEditors = getDemoEditorsStore();

      const keptCalendar = demoCalendar.filter((entry) => entry.tenantId !== session.tenantId);
      const keptClients = demoClients.filter((client) => client.tenantId !== session.tenantId);
      const keptEditors = demoEditors.filter((editor) => editor.tenantId !== session.tenantId);

      demoCalendar.splice(0, demoCalendar.length, ...keptCalendar);
      demoClients.splice(0, demoClients.length, ...keptClients);
      demoEditors.splice(0, demoEditors.length, ...keptEditors);

      return NextResponse.json({ message: 'Demo data reset completed' });
    }

    await prisma.$transaction([
      prisma.contentCalendar.deleteMany({ where: { tenantId: session.tenantId } }),
      prisma.client.deleteMany({ where: { tenantId: session.tenantId } }),
    ]);

    return NextResponse.json({ message: 'Database data reset completed' });
  } catch {
    return NextResponse.json({ error: 'Failed to reset data' }, { status: 500 });
  }
}

