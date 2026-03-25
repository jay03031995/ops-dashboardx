import { NextResponse } from 'next/server';
import { getSession } from '@/lib/middleware';
import { isDatabaseConfigured, prisma } from '@/lib/prisma';
import { resolveEffectiveModuleAccess } from '@/lib/team-role-store';
import { getDemoClientsStore, getDemoEditorsStore } from '@/lib/dev-store';
import { backfillContentProductionFromCalendar } from '@/lib/taskboard-content-sync';

async function logAdminActivity(
  session: NonNullable<Awaited<ReturnType<typeof getSession>>>,
  text: string,
  taskId?: string | null
) {
  try {
    const actor = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { name: true, email: true },
    });
    const authorName = actor?.name || actor?.email || session.email || 'Admin';
    await prisma.teamChatMessage.create({
      data: {
        id: `admin-log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        tenantId: session.tenantId,
        authorId: session.userId,
        authorName,
        authorRole: 'ADMIN',
        text,
        type: 'ADMIN_LOG',
        taskId: taskId || null,
        taskLabel: null,
        mentions: [],
      },
    });
  } catch {
    // Ignore audit log failure; business action should still succeed.
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

export async function GET(request: Request) {
  const session = await getSession();
  if (!(await canAccess(session))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const { start, end } = parseDateRange(searchParams);
  const clientId = searchParams.get('clientId');
  const status = searchParams.get('status');
  const editorId = searchParams.get('editorId');

  if (!isDatabaseConfigured()) {
    return NextResponse.json({ items: [] });
  }

  const where: any = { tenantId: session!.tenantId };
  if (start && end) {
    where.scheduledDate = { gte: start, lte: end };
  }
  if (clientId) where.clientId = clientId;
  if (status) where.status = status;
  if (editorId) {
    where.OR = [
      { assignedEditorId: editorId },
      { client: { editorId } },
    ];
  }

  try {
    await backfillContentProductionFromCalendar(session!.tenantId, { start, end });

    const items = await prisma.contentProduction.findMany({
      where,
      include: {
        client: { include: { editor: { select: { id: true, name: true, email: true } } } },
        assignedEditor: { select: { id: true, name: true, email: true } },
      },
      orderBy: { scheduledDate: 'asc' },
    });
    return NextResponse.json({ items });
  } catch (error) {
    console.error('Failed to load content production', error);
    const message = error instanceof Error ? error.message : 'Failed to load content production';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!(await canAccess(session))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json();
    const scheduledDate = typeof body.scheduledDate === 'string' ? body.scheduledDate : '';
    const clientId = typeof body.clientId === 'string' ? body.clientId : '';
    const topic = typeof body.topic === 'string' ? body.topic.trim() : '';
    const platform = typeof body.platform === 'string' ? body.platform.trim() : '';
    const assignedEditorId = typeof body.assignedEditorId === 'string' ? body.assignedEditorId.trim() : null;
    const notes = typeof body.notes === 'string' ? body.notes.trim() : null;

    if (!scheduledDate || !clientId || !topic || !platform) {
      return NextResponse.json({ error: 'scheduledDate, clientId, topic and platform are required' }, { status: 400 });
    }

    const client = await prisma.client.findFirst({
      where: { id: clientId, tenantId: session!.tenantId },
      select: { editorId: true },
    });
    const effectiveAssignedEditorId = assignedEditorId || client?.editorId || null;

    const created = await prisma.contentProduction.create({
      data: {
        scheduledDate: new Date(scheduledDate),
        clientId,
        topic,
        platform,
        assignedEditorId: effectiveAssignedEditorId,
        notes,
        tenantId: session!.tenantId,
        createdById: session!.userId,
      },
      include: {
        client: { include: { editor: { select: { id: true, name: true, email: true } } } },
        assignedEditor: { select: { id: true, name: true, email: true } },
      },
    });
    if (session?.role === 'ADMIN') {
      await logAdminActivity(
        session,
        `Created content item: ${created.topic} (${created.platform}) for ${created.client.name}`,
        created.id
      );
    }

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error('Failed to create content item', error);
    const message = error instanceof Error ? error.message : 'Failed to create item';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const session = await getSession();
  if (!(await canAccess(session))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json();
    const id = typeof body.id === 'string' ? body.id : '';
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

    const has = (key: string) => Object.prototype.hasOwnProperty.call(body, key);
    const topic = typeof body.topic === 'string' ? body.topic.trim() : null;
    const platform = typeof body.platform === 'string' ? body.platform.trim() : null;
    const scheduledDate = typeof body.scheduledDate === 'string' ? body.scheduledDate : null;
    const status = typeof body.status === 'string' ? body.status.trim() : null;
    const assignedEditorId = has('assignedEditorId')
      ? typeof body.assignedEditorId === 'string' && body.assignedEditorId.trim()
        ? body.assignedEditorId.trim()
        : null
      : undefined;
    const editedContentUrl = typeof body.editedContentUrl === 'string' ? body.editedContentUrl.trim() : null;
    const finalPostUrl = typeof body.finalPostUrl === 'string' ? body.finalPostUrl.trim() : null;
    const notes = typeof body.notes === 'string' ? body.notes.trim() : null;

    if (status === 'POSTED' && !finalPostUrl && !has('finalPostUrl')) {
      return NextResponse.json({ error: 'finalPostUrl is required when status is POSTED' }, { status: 400 });
    }

    const updated = await prisma.contentProduction.updateMany({
      where: { id, tenantId: session!.tenantId },
      data: {
        ...(has('topic') ? { topic: topic || '' } : {}),
        ...(has('platform') && platform ? { platform } : {}),
        ...(has('scheduledDate') && scheduledDate ? { scheduledDate: new Date(scheduledDate) } : {}),
        ...(has('status') && status ? { status } : {}),
        ...(has('assignedEditorId') ? { assignedEditorId } : {}),
        ...(has('editedContentUrl') ? { editedContentUrl: editedContentUrl || null } : {}),
        ...(has('finalPostUrl') ? { finalPostUrl: finalPostUrl || null } : {}),
        ...(has('notes') ? { notes: notes || null } : {}),
      },
    });

    if (!updated.count) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    const record = await prisma.contentProduction.findFirst({
      where: { id, tenantId: session!.tenantId },
      include: {
        client: { include: { editor: { select: { id: true, name: true, email: true } } } },
        assignedEditor: { select: { id: true, name: true, email: true } },
      },
    });
    if (record && session?.role === 'ADMIN') {
      await logAdminActivity(
        session,
        `Updated content item: ${record.topic} (${record.platform}) status ${record.status}`,
        record.id
      );
    }

    return NextResponse.json(record);
  } catch (error) {
    console.error('Failed to update content item', error);
    const message = error instanceof Error ? error.message : 'Failed to update item';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const session = await getSession();
  if (!(await canAccess(session))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

    const target = await prisma.contentProduction.findFirst({
      where: { id, tenantId: session!.tenantId },
      select: { id: true, topic: true, platform: true, contentCalendarId: true, client: { select: { name: true } } },
    });
    if (!target) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    if (target.contentCalendarId) {
      await prisma.contentCalendar.deleteMany({
        where: { id: target.contentCalendarId, tenantId: session!.tenantId },
      });
      await prisma.contentProduction.deleteMany({
        where: { tenantId: session!.tenantId, contentCalendarId: target.contentCalendarId },
      });
    } else {
      await prisma.contentProduction.deleteMany({ where: { id, tenantId: session!.tenantId } });
    }
    if (session?.role === 'ADMIN') {
      await logAdminActivity(
        session,
        `Deleted content item: ${target.topic} (${target.platform}) for ${target.client.name}`,
        target.id
      );
    }
    return NextResponse.json({ message: 'Deleted' });
  } catch (error) {
    console.error('Failed to delete content item', error);
    const message = error instanceof Error ? error.message : 'Failed to delete item';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
