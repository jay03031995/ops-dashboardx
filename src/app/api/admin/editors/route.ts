import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getSession } from '@/lib/middleware';
import { isDatabaseConfigured, prisma } from '@/lib/prisma';
import { ensureDemoEditorsForTenant, getDemoEditorsStore } from '@/lib/dev-store';
import { canManageRoles, getTenantRoles, getMemberRoleCode, setMemberRoleCode } from '@/lib/team-role-store';

function resolveRoleCode(tenantId: string, value: unknown, fallback = 'VE') {
  const code = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (!code) return fallback;
  const exists = getTenantRoles(tenantId).some((role) => role.code === code);
  return exists ? code : fallback;
}

export async function GET() {
  const session = await getSession();
  if (!session || !canManageRoles(session)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isDatabaseConfigured()) {
    const editors = ensureDemoEditorsForTenant(session.tenantId);
    return NextResponse.json(
      editors
        .map((editor) => ({
          id: editor.id,
          name: editor.name,
          email: editor.email,
          role: resolveRoleCode(session.tenantId, editor.role, 'VE'),
        }))
        .sort((a, b) => a.email.localeCompare(b.email))
    );
  }

  try {
    const editors = await prisma.user.findMany({
      where: { tenantId: session.tenantId, role: 'EDITOR' },
      select: { id: true, name: true, email: true, role: true, teamRoleCode: true, avatarUrl: true },
      orderBy: { createdAt: 'asc' },
    });

    return NextResponse.json(
      editors.map((editor) => ({
        ...editor,
        role: resolveRoleCode(
          session.tenantId,
          editor.teamRoleCode || getMemberRoleCode(session.tenantId, editor.id) || (editor.role === 'EDITOR' ? 'VE' : 'ADMIN'),
          'VE'
        ),
      }))
    );
  } catch {
    return NextResponse.json({ error: 'Failed to fetch team members' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session || !canManageRoles(session)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const roleCode = resolveRoleCode(session.tenantId, body.role, 'VE');

    if (!name || !email) {
      return NextResponse.json({ error: 'Name and email are required' }, { status: 400 });
    }

    if (!isDatabaseConfigured()) {
      const editors = ensureDemoEditorsForTenant(session.tenantId);
      const exists = editors.some((editor) => editor.email === email);
      if (exists) {
        return NextResponse.json({ error: 'Team member with this email already exists' }, { status: 409 });
      }

      const newEditor = {
        id: `demo-editor-${Date.now()}`,
        name,
        email,
        role: roleCode,
        tenantId: session.tenantId,
        createdAt: new Date().toISOString(),
      };
      getDemoEditorsStore().push(newEditor);
      return NextResponse.json(
        { id: newEditor.id, name: newEditor.name, email: newEditor.email, role: newEditor.role },
        { status: 201 }
      );
    }

    const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) {
      return NextResponse.json({ error: 'Team member with this email already exists' }, { status: 409 });
    }

    const finalPassword = password || 'Editor@123';
    const hashedPassword = await bcrypt.hash(finalPassword, 10);

    const created = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role: 'EDITOR',
        teamRoleCode: roleCode,
        tenantId: session.tenantId,
      },
      select: { id: true, name: true, email: true },
    });
    setMemberRoleCode(session.tenantId, created.id, roleCode);

    return NextResponse.json({ ...created, role: roleCode }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Failed to create team member' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const session = await getSession();
  if (!session || !canManageRoles(session)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const id = typeof body.id === 'string' ? body.id : '';
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const roleCode = body.role ? resolveRoleCode(session.tenantId, body.role, 'VE') : null;
    const password = typeof body.password === 'string' ? body.password : '';

    if (!id) {
      return NextResponse.json({ error: 'Team member id is required' }, { status: 400 });
    }

    if (!isDatabaseConfigured()) {
      const editors = ensureDemoEditorsForTenant(session.tenantId);
      const index = editors.findIndex((editor) => editor.id === id);
      if (index === -1) {
        return NextResponse.json({ error: 'Team member not found' }, { status: 404 });
      }

      if (name) editors[index].name = name;
      if (email) editors[index].email = email;
      if (roleCode) editors[index].role = roleCode;

      return NextResponse.json(editors[index]);
    }

    const existing = await prisma.user.findFirst({
      where: { id, tenantId: session.tenantId, role: 'EDITOR' },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Team member not found' }, { status: 404 });
    }

    if (email) {
      const emailOwner = await prisma.user.findUnique({ where: { email }, select: { id: true } });
      if (emailOwner && emailOwner.id !== id) {
        return NextResponse.json({ error: 'Email already in use' }, { status: 409 });
      }
    }

    const avatarUrl = typeof body.avatarUrl === 'string' ? body.avatarUrl.trim() : '';

    const data: any = {
      ...(name ? { name } : {}),
      ...(email ? { email } : {}),
      ...(avatarUrl ? { avatarUrl } : {}),
      ...(roleCode ? { teamRoleCode: roleCode } : {}),
    };
    if (password) {
      data.password = await bcrypt.hash(password, 10);
    }

    const updated = await prisma.user.update({
      where: { id },
      data,
      select: { id: true, name: true, email: true, avatarUrl: true, teamRoleCode: true },
    });

    if (roleCode) setMemberRoleCode(session.tenantId, updated.id, roleCode);

    return NextResponse.json({
      ...updated,
      role: roleCode || updated.teamRoleCode || getMemberRoleCode(session.tenantId, updated.id) || 'VE',
    });
  } catch {
    return NextResponse.json({ error: 'Failed to update team member' }, { status: 500 });
  }
}
