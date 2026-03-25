import { NextResponse } from 'next/server';
import { isDatabaseConfigured, prisma } from '@/lib/prisma';
import { getSession } from '@/lib/middleware';
import { getDemoCalendarStore, getDemoClientsStore } from '@/lib/dev-store';
import { getTaskMeta } from '@/lib/task-meta-store';
import { syncContentProductionFromCalendar } from '@/lib/taskboard-content-sync';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!isDatabaseConfigured()) {
    const demoClients = getDemoClientsStore().filter((client) => client.tenantId === session.tenantId);
    const demoAssignments = getDemoCalendarStore()
      .filter(
        (entry) =>
          entry.tenantId === session.tenantId &&
          (entry.status === 'PENDING' || entry.status === 'ASSIGNED' || entry.status === 'COMPLETED')
      )
      .filter((entry) => {
        const meta = getTaskMeta(session.tenantId, entry.id);
        if (meta?.assignedEditorId) return meta.assignedEditorId === session.userId;
        const client = demoClients.find((c) => c.id === entry.clientId);
        return client?.editorId === session.userId;
      })
      .map((entry) => {
        const client = demoClients.find((c) => c.id === entry.clientId);
        const meta = getTaskMeta(session.tenantId, entry.id);
        return {
          ...entry,
          videoUrl: entry.videoUrl || null,
          editedVideoUrl: entry.editedVideoUrl || null,
          remarks: meta?.remarks ?? entry.remarks ?? entry.videoTopic ?? null,
          attachmentUrl: meta?.attachmentUrl ?? entry.attachmentUrl ?? null,
          client: { id: client?.id || entry.clientId, name: client?.name || 'Unknown Client' },
        };
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return NextResponse.json(demoAssignments);
  }

  try {
    const assignments = await prisma.contentCalendar.findMany({
      where: {
        tenantId: session.tenantId,
        status: { in: ['PENDING', 'ASSIGNED', 'COMPLETED'] },
        OR: [
          { assignedEditorId: session.userId },
          { client: { editorId: session.userId } },
        ],
      },
      include: { client: true },
      orderBy: { date: 'desc' },
    });
    return NextResponse.json(
      assignments.map((entry) => ({
        ...entry,
        remarks: entry.videoTopic ?? null,
        attachmentUrl: entry.attachmentUrl ?? null,
      }))
    );
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch assignments' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  if (!isDatabaseConfigured()) {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
      const body = await request.json();
      const has = (key: string) => Object.prototype.hasOwnProperty.call(body, key);
      const assignmentId = typeof body.id === 'string' ? body.id : '';
      const editedVideoUrl = typeof body.editedVideoUrl === 'string' ? body.editedVideoUrl.trim() : null;
      if (!assignmentId) {
        return NextResponse.json({ error: 'Assignment id is required' }, { status: 400 });
      }

      const entries = getDemoCalendarStore();
      const index = entries.findIndex((entry) => entry.id === assignmentId && entry.tenantId === session.tenantId);
      if (index === -1) {
        return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });
      }

      const nextEditedVideoUrl = has('editedVideoUrl') ? editedVideoUrl || null : entries[index].editedVideoUrl || null;
      const statusRaw =
        typeof body.status === 'string' && ['COMPLETED', 'ASSIGNED', 'PENDING'].includes(body.status.toUpperCase())
          ? body.status.toUpperCase()
          : null;
      const status =
        statusRaw ||
        (has('editedVideoUrl') && nextEditedVideoUrl ? 'COMPLETED' : entries[index].status);
      if (status === 'COMPLETED' && !nextEditedVideoUrl) {
        return NextResponse.json({ error: 'Edited video link is required to mark complete' }, { status: 400 });
      }

      if (has('editedVideoUrl')) entries[index].editedVideoUrl = editedVideoUrl || null;
      entries[index].status = status as 'PENDING' | 'ASSIGNED' | 'COMPLETED';
      return NextResponse.json({ message: 'Assignment updated', status });
    } catch {
      return NextResponse.json({ error: 'Failed to update assignment' }, { status: 500 });
    }
  }

  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json();
    const has = (key: string) => Object.prototype.hasOwnProperty.call(body, key);
    const assignmentId = typeof body.id === 'string' ? body.id : '';
    const editedVideoUrl = typeof body.editedVideoUrl === 'string' ? body.editedVideoUrl.trim() : null;
    if (!assignmentId) {
      return NextResponse.json({ error: 'Assignment id is required' }, { status: 400 });
    }

    const existing = await prisma.contentCalendar.findFirst({
      where: {
        id: assignmentId,
        tenantId: session.tenantId,
        OR: [
          { assignedEditorId: session.userId },
          { client: { editorId: session.userId } },
        ],
      },
      select: { editedVideoUrl: true },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });
    }

    const nextEditedVideoUrl = has('editedVideoUrl') ? editedVideoUrl || null : existing.editedVideoUrl || null;
    const statusRaw =
      typeof body.status === 'string' && ['COMPLETED', 'ASSIGNED', 'PENDING'].includes(body.status.toUpperCase())
        ? body.status.toUpperCase()
        : null;
    const status =
      statusRaw ||
      (has('editedVideoUrl') && nextEditedVideoUrl ? 'COMPLETED' : null);
    if (status === 'COMPLETED' && !nextEditedVideoUrl) {
      return NextResponse.json({ error: 'Edited video link is required to mark complete' }, { status: 400 });
    }

    const updated = await prisma.contentCalendar.updateMany({
      where: {
        id: assignmentId,
        tenantId: session.tenantId,
        OR: [
          { assignedEditorId: session.userId },
          { client: { editorId: session.userId } },
        ],
      },
      data: {
        ...(status ? { status } : {}),
        ...(has('editedVideoUrl') ? { editedVideoUrl: editedVideoUrl || null } : {}),
      },
    });

    if (updated.count === 0) {
      return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });
    }

    const record = await prisma.contentCalendar.findFirst({
      where: { id: assignmentId, tenantId: session.tenantId },
      select: {
        id: true,
        tenantId: true,
        clientId: true,
        date: true,
        platform: true,
        videoTopic: true,
        status: true,
        editedVideoUrl: true,
        assignedEditorId: true,
      },
    });
    if (record) {
      await syncContentProductionFromCalendar({
        id: record.id,
        tenantId: record.tenantId,
        clientId: record.clientId,
        date: record.date,
        platform: record.platform,
        topic: record.videoTopic,
        status: record.status,
        editedVideoUrl: record.editedVideoUrl || null,
        assignedEditorId: record.assignedEditorId || null,
      });
    }

    return NextResponse.json({ message: 'Assignment updated', status: record?.status || status || null });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update assignment' }, { status: 500 });
  }
}
