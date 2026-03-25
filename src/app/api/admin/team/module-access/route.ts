import { NextResponse } from 'next/server';
import { getSession } from '@/lib/middleware';
import { isDatabaseConfigured, prisma } from '@/lib/prisma';
import { canManageRoles, MODULE_CATALOG, resolveEffectiveModuleAccess, sanitizeModuleAccess } from '@/lib/team-role-store';
import { ensureDemoEditorsForTenant } from '@/lib/dev-store';

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!canManageRoles(session)) {
    return NextResponse.json({ error: 'Only CF/Admin can view module access settings' }, { status: 403 });
  }

  if (!isDatabaseConfigured()) {
    const users = ensureDemoEditorsForTenant(session.tenantId).map((user) => ({
      id: user.id,
      name: user.name || user.email,
      email: user.email,
      role: user.role,
      teamRoleCode: user.role,
      userModuleAccess: [],
    }));
    const accessByUser = users.reduce<Record<string, string[]>>((acc, user) => {
      acc[user.id] = resolveEffectiveModuleAccess(session.tenantId, user.teamRoleCode || 'VE', user.userModuleAccess);
      return acc;
    }, {});
    return NextResponse.json({
      users,
      accessByUser,
      moduleCatalog: MODULE_CATALOG,
    });
  }

  const users = await prisma.user.findMany({
    where: { tenantId: session.tenantId },
    select: { id: true, name: true, email: true, role: true, teamRoleCode: true, userModuleAccess: true },
    orderBy: { createdAt: 'asc' },
  });
  const accessByUser = users.reduce<Record<string, string[]>>((acc, user) => {
    const roleCode = user.role === 'ADMIN' ? 'ADMIN' : (user.teamRoleCode || 'VE').toUpperCase();
    acc[user.id] = resolveEffectiveModuleAccess(session.tenantId, roleCode, user.userModuleAccess);
    return acc;
  }, {});

  return NextResponse.json({
    users,
    accessByUser,
    moduleCatalog: MODULE_CATALOG,
  });
}

export async function PATCH(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!canManageRoles(session)) {
    return NextResponse.json({ error: 'Only CF/Admin can update module access settings' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const userId = typeof body.userId === 'string' ? body.userId.trim() : '';
    const modules = sanitizeModuleAccess(Array.isArray(body.modules) ? body.modules : []);

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    if (!isDatabaseConfigured()) {
      return NextResponse.json({ error: 'Module access update is unavailable in demo mode' }, { status: 400 });
    }

    const updated = await prisma.user.updateMany({
      where: { id: userId, tenantId: session.tenantId },
      data: { userModuleAccess: modules },
    });
    if (!updated.count) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const users = await prisma.user.findMany({
      where: { tenantId: session.tenantId },
      select: { id: true, role: true, teamRoleCode: true, userModuleAccess: true },
      orderBy: { createdAt: 'asc' },
    });
    const accessByUser = users.reduce<Record<string, string[]>>((acc, user) => {
      const roleCode = user.role === 'ADMIN' ? 'ADMIN' : (user.teamRoleCode || 'VE').toUpperCase();
      acc[user.id] = resolveEffectiveModuleAccess(session.tenantId, roleCode, user.userModuleAccess);
      return acc;
    }, {});

    return NextResponse.json({ accessByUser });
  } catch {
    return NextResponse.json({ error: 'Failed to update module access' }, { status: 500 });
  }
}
