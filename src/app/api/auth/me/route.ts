import { NextResponse } from 'next/server';
import { getDemoUserFromSession } from '@/lib/demo-auth';
import { getSession } from '@/lib/middleware';
import { isDatabaseConfigured, prisma } from '@/lib/prisma';
import { resolveEffectiveModuleAccess, resolveSessionTeamRole } from '@/lib/team-role-store';
import { withTimeout } from '@/lib/with-timeout';

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isDatabaseConfigured()) {
    return NextResponse.json({
      user: getDemoUserFromSession(session),
    });
  }

  const user = await withTimeout(
    prisma.user.findUnique({
      where: { id: session.userId },
      select: { id: true, name: true, email: true, role: true, teamRoleCode: true, userModuleAccess: true, tenantId: true, avatarUrl: true },
    }),
    12000,
    'Database request timed out while loading the session'
  );

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const roleCode = user.role === 'ADMIN' ? 'ADMIN' : (user.teamRoleCode || resolveSessionTeamRole(session) || 'VE').toUpperCase();
  return NextResponse.json({
    user: {
      ...user,
      roleCode,
      moduleAccess:
        user.role === 'ADMIN'
          ? resolveEffectiveModuleAccess(session.tenantId, 'ADMIN', user.userModuleAccess)
          : resolveEffectiveModuleAccess(session.tenantId, roleCode, user.userModuleAccess),
    },
  });
}
