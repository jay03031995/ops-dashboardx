import { NextResponse } from 'next/server';
import { getSession } from '@/lib/middleware';
import { isDatabaseConfigured, prisma } from '@/lib/prisma';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!isDatabaseConfigured()) {
    return NextResponse.json({ items: [] });
  }

  try {
    const items = await prisma.contentProduction.findMany({
      where: {
        tenantId: session.tenantId,
        OR: [
          { assignedEditorId: session.userId },
          { client: { editorId: session.userId } },
        ],
      },
      include: {
        client: true,
        assignedEditor: { select: { id: true, name: true, email: true } },
      },
      orderBy: { scheduledDate: 'asc' },
    });
    return NextResponse.json({ items });
  } catch {
    return NextResponse.json({ error: 'Failed to load content production' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json();
    const id = typeof body.id === 'string' ? body.id : '';
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

    const has = (key: string) => Object.prototype.hasOwnProperty.call(body, key);
    const status = typeof body.status === 'string' ? body.status.trim() : null;
    const editedContentUrl = typeof body.editedContentUrl === 'string' ? body.editedContentUrl.trim() : null;

    const updated = await prisma.contentProduction.updateMany({
      where: {
        id,
        tenantId: session.tenantId,
        OR: [
          { assignedEditorId: session.userId },
          { client: { editorId: session.userId } },
        ],
      },
      data: {
        ...(has('status') && status ? { status } : {}),
        ...(has('editedContentUrl') ? { editedContentUrl: editedContentUrl || null, status: 'READY_FOR_REVIEW' } : {}),
      },
    });

    if (!updated.count) return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    return NextResponse.json({ message: 'Updated' });
  } catch {
    return NextResponse.json({ error: 'Failed to update item' }, { status: 500 });
  }
}
