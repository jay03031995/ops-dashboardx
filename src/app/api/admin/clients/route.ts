import { NextResponse } from 'next/server';
import { isDatabaseConfigured, prisma } from '@/lib/prisma';
import { getSession } from '@/lib/middleware';
import { DemoClient, ensureDemoEditorsForTenant, getDemoClientsStore } from '@/lib/dev-store';
import { getMemberRoleCode } from '@/lib/team-role-store';
import { resolveEffectiveModuleAccess } from '@/lib/team-role-store';

function resolveUserRoleCode(
  tenantId: string,
  user: { id: string; role: 'ADMIN' | 'EDITOR'; teamRoleCode: string | null }
) {
  if (user.role === 'ADMIN') return 'ADMIN';
  return (user.teamRoleCode || getMemberRoleCode(tenantId, user.id) || 'VE').toUpperCase();
}

async function validateRoleAssignments(
  tenantId: string,
  editorId: string | null,
  socialManagerId: string | null
) {
  if (editorId && socialManagerId && editorId === socialManagerId) {
    return { ok: false as const, error: 'Editor and Social Manager must be different users' };
  }

  const ids = [editorId, socialManagerId].filter((v): v is string => !!v);
  if (!ids.length) return { ok: true as const };

  const users = await prisma.user.findMany({
    where: { tenantId, id: { in: ids } },
    select: { id: true, role: true, teamRoleCode: true },
  });
  const byId = new Map(users.map((u) => [u.id, u]));

  if (editorId) {
    const user = byId.get(editorId);
    if (!user) return { ok: false as const, error: 'Selected editor not found in this tenant' };
    const roleCode = resolveUserRoleCode(tenantId, user);
    if (roleCode !== 'VE') {
      return { ok: false as const, error: 'Editor Access supports only Video Editor (VE) members' };
    }
  }

  if (socialManagerId) {
    const user = byId.get(socialManagerId);
    if (!user) return { ok: false as const, error: 'Selected social manager not found in this tenant' };
    const roleCode = resolveUserRoleCode(tenantId, user);
    if (!['SM', 'ISM', 'CSM', 'CF', 'ADMIN'].includes(roleCode)) {
      return { ok: false as const, error: 'Social Manager field supports only SM/ISM/CSM/CF/Admin members' };
    }
  }

  return { ok: true as const };
}

async function canViewClients(session: Awaited<ReturnType<typeof getSession>>) {
  if (!session) return false;
  if (session.role === 'ADMIN') return true;
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { role: true, teamRoleCode: true, userModuleAccess: true },
  });
  const roleCode = user?.role === 'ADMIN' ? 'ADMIN' : (user?.teamRoleCode || session.roleCode || 'VE').toUpperCase();
  const access = resolveEffectiveModuleAccess(session.tenantId, roleCode, user?.userModuleAccess);
  return access.includes('clients') || access.includes('content_production') || access.includes('task_board');
}

export async function GET() {
  const session = await getSession();
  if (!(await canViewClients(session))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isDatabaseConfigured()) {
    const clients = getDemoClientsStore()
      .filter((client) => client.tenantId === session.tenantId)
      .sort((a, b) => a.name.localeCompare(b.name));
    return NextResponse.json(clients);
  }

  try {
    const clients = await prisma.client.findMany({
      where: { tenantId: session.tenantId },
      include: {
        editor: { select: { id: true, name: true, email: true } },
        socialManager: { select: { id: true, name: true, email: true } },
      },
      orderBy: { name: 'asc' },
    });
    return NextResponse.json(clients);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch clients' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { name, oneDriveFolder, editorId, socialManagerId } = body;
    if (!name || typeof name !== 'string') {
      return NextResponse.json({ error: 'Client name is required' }, { status: 400 });
    }

    if (!isDatabaseConfigured()) {
      const editors = ensureDemoEditorsForTenant(session.tenantId);
      const findEditorById = (id: string) =>
        editors.find((editor) => editor.id === id || editor.id.endsWith(`-${id}`)) || null;
      const mappedEditor =
        typeof editorId === 'string' && editorId
          ? findEditorById(editorId)
          : null;

      const demoClient: DemoClient = {
        id: `demo-client-${Date.now()}`,
        name: name.trim(),
        oneDriveFolder: oneDriveFolder?.trim() || null,
        editorId: editorId || null,
        tenantId: session.tenantId,
        editor: mappedEditor,
      };
      getDemoClientsStore().push(demoClient);
      return NextResponse.json(demoClient);
    }

    const valid = await validateRoleAssignments(
      session.tenantId,
      typeof editorId === 'string' && editorId.trim() ? editorId.trim() : null,
      typeof socialManagerId === 'string' && socialManagerId.trim() ? socialManagerId.trim() : null
    );
    if (!valid.ok) {
      return NextResponse.json({ error: valid.error }, { status: 400 });
    }

    const client = await prisma.client.create({
      data: {
        name,
        oneDriveFolder,
        editorId,
        socialManagerId,
        tenantId: session.tenantId,
      },
    });

    return NextResponse.json(client);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create client' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const clientId = typeof body.id === 'string' ? body.id : '';
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const oneDriveFolder =
      typeof body.oneDriveFolder === 'string' ? body.oneDriveFolder.trim() : body.oneDriveFolder === null ? null : undefined;
    const editorId = typeof body.editorId === 'string' && body.editorId.trim() ? body.editorId.trim() : null;
    const socialManagerId =
      typeof body.socialManagerId === 'string' && body.socialManagerId.trim() ? body.socialManagerId.trim() : null;

    if (!clientId) {
      return NextResponse.json({ error: 'Client id is required' }, { status: 400 });
    }

    if (!isDatabaseConfigured()) {
      const editors = ensureDemoEditorsForTenant(session.tenantId);
      const findEditorById = (id: string) =>
        editors.find((editor) => editor.id === id || editor.id.endsWith(`-${id}`)) || null;
      const clients = getDemoClientsStore();
      const index = clients.findIndex((client) => client.id === clientId && client.tenantId === session.tenantId);
      if (index === -1) {
        return NextResponse.json({ error: 'Client not found' }, { status: 404 });
      }

      const mappedEditor = editorId ? findEditorById(editorId) : null;
      clients[index] = {
        ...clients[index],
        ...(name ? { name } : {}),
        ...(oneDriveFolder !== undefined ? { oneDriveFolder } : {}),
        editorId,
        editor: mappedEditor,
      };

      return NextResponse.json(clients[index]);
    }

    const valid = await validateRoleAssignments(session.tenantId, editorId, socialManagerId);
    if (!valid.ok) {
      return NextResponse.json({ error: valid.error }, { status: 400 });
    }

    const existing = await prisma.client.findFirst({
      where: { id: clientId, tenantId: session.tenantId },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }

    const updated = await prisma.client.updateMany({
      where: { id: clientId, tenantId: session.tenantId },
      data: {
        ...(name ? { name } : {}),
        ...(oneDriveFolder !== undefined ? { oneDriveFolder } : {}),
        editorId,
        socialManagerId,
      },
    });
    if (!updated.count) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }

    const record = await prisma.client.findFirst({
      where: { id: clientId, tenantId: session.tenantId },
      include: {
        editor: { select: { id: true, name: true, email: true } },
        socialManager: { select: { id: true, name: true, email: true } },
      },
    });

    return NextResponse.json(record);
  } catch {
    return NextResponse.json({ error: 'Failed to update client mapping' }, { status: 500 });
  }
}
