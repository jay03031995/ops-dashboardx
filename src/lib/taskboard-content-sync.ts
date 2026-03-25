import { prisma } from '@/lib/prisma';

type CalendarSyncEntry = {
  id: string;
  tenantId: string;
  clientId: string;
  date: Date;
  platform: string;
  topic: string;
  status: string;
  editedVideoUrl?: string | null;
  assignedEditorId?: string | null;
};

function mapCalendarStatusToProduction(status: string) {
  const value = status.toUpperCase();
  if (value === 'ASSIGNED') return 'IN_EDITING';
  if (value === 'COMPLETED') return 'READY_FOR_REVIEW';
  return 'PENDING';
}

async function resolveAssignedEditorId(
  tenantId: string,
  clientId: string,
  assignedEditorId?: string | null
) {
  if (assignedEditorId) return assignedEditorId;
  const client = await prisma.client.findFirst({
    where: { id: clientId, tenantId },
    select: { editorId: true },
  });
  return client?.editorId || null;
}

export async function syncContentProductionFromCalendar(entry: CalendarSyncEntry) {
  const mappedStatus = mapCalendarStatusToProduction(entry.status);
  const effectiveAssignedEditorId = await resolveAssignedEditorId(
    entry.tenantId,
    entry.clientId,
    entry.assignedEditorId || null
  );
  const existing = await prisma.contentProduction.findFirst({
    where: { tenantId: entry.tenantId, contentCalendarId: entry.id },
    select: { id: true, status: true },
  });

  if (!existing) {
    await prisma.contentProduction.create({
      data: {
        contentCalendarId: entry.id,
        tenantId: entry.tenantId,
        clientId: entry.clientId,
        platform: entry.platform,
        topic: entry.topic,
        scheduledDate: entry.date,
        status: mappedStatus,
        editedContentUrl: entry.editedVideoUrl || null,
        assignedEditorId: effectiveAssignedEditorId,
      },
    });
    return;
  }

  await prisma.contentProduction.update({
    where: { id: existing.id },
    data: {
      clientId: entry.clientId,
      platform: entry.platform,
      topic: entry.topic,
      scheduledDate: entry.date,
      editedContentUrl: entry.editedVideoUrl || null,
      assignedEditorId: effectiveAssignedEditorId,
      ...(existing.status === 'POSTED' ? {} : { status: mappedStatus }),
    },
  });
}

export async function deleteContentProductionFromCalendar(tenantId: string, calendarId: string) {
  await prisma.contentProduction.deleteMany({
    where: { tenantId, contentCalendarId: calendarId },
  });
}

export async function backfillContentProductionFromCalendar(
  tenantId: string,
  range?: { start: Date | null; end: Date | null }
) {
  const calendarWhere: any = { tenantId };
  if (range?.start && range?.end) {
    calendarWhere.date = { gte: range.start, lte: range.end };
  }

  const calendarEntries = await prisma.contentCalendar.findMany({
    where: calendarWhere,
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

  for (const entry of calendarEntries) {
    await syncContentProductionFromCalendar({
      id: entry.id,
      tenantId: entry.tenantId,
      clientId: entry.clientId,
      date: entry.date,
      platform: entry.platform,
      topic: entry.videoTopic,
      status: entry.status,
      editedVideoUrl: entry.editedVideoUrl || null,
      assignedEditorId: entry.assignedEditorId || null,
    });
  }
}
