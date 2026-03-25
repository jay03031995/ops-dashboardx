import { NextResponse } from 'next/server';
import { getSession } from '@/lib/middleware';
import { prisma } from '@/lib/prisma';
import { resolveEffectiveModuleAccess } from '@/lib/team-role-store';

async function canAccess(session: Awaited<ReturnType<typeof getSession>>) {
  if (!session) return false;
  if (session.role === 'ADMIN') return true;
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { teamRoleCode: true, role: true, userModuleAccess: true },
  });
  const roleCode =
    user?.role === 'ADMIN' ? 'ADMIN' : (user?.teamRoleCode || session.roleCode || 'VE').toUpperCase();
  return resolveEffectiveModuleAccess(session.tenantId, roleCode, user?.userModuleAccess).includes('reports');
}

export async function GET() {
  const session = await getSession();
  if (!(await canAccess(session))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const csv = [
    'Date,Platform,Post Link,Posted By,Remarks',
    '2026-03-24,Instagram,https://www.instagram.com/p/example,Neha,Manual campaign post',
    '2026-03-24,Facebook,https://www.facebook.com/example,Neha,Cross-posted update',
  ].join('\n');

  return new NextResponse(`${csv}\n`, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="manual-report-template.csv"',
    },
  });
}
