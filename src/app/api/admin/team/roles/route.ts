import { NextResponse } from 'next/server';
import { getSession } from '@/lib/middleware';
import { addTenantRole, canManageRoles, getTenantRoles } from '@/lib/team-role-store';

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json({
    roles: getTenantRoles(session.tenantId),
    canManageRoles: canManageRoles(session),
  });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!canManageRoles(session)) {
    return NextResponse.json({ error: 'Only CF/Admin can create new roles' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : '';
    const name = typeof body.name === 'string' ? body.name.trim() : '';

    if (!code || !name) {
      return NextResponse.json({ error: 'Role code and role name are required' }, { status: 400 });
    }
    if (!/^[A-Z][A-Z0-9_]{1,9}$/.test(code)) {
      return NextResponse.json({ error: 'Role code must be 2-10 chars, uppercase letters/numbers/underscore' }, { status: 400 });
    }

    const result = addTenantRole(session.tenantId, { code, name });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 409 });
    }

    return NextResponse.json({ roles: getTenantRoles(session.tenantId) }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Failed to create role' }, { status: 500 });
  }
}

