import jwt from 'jsonwebtoken';
import { cookies, headers } from 'next/headers';

type SessionRole = 'ADMIN' | 'EDITOR';

export type Session = {
  userId: string;
  tenantId: string;
  role: SessionRole;
  roleCode?: string;
  email?: string;
};

type TokenPayload = Partial<Session> & {
  sub?: string;
  id?: string;
  tenantId?: string;
  role?: string;
  roleCode?: string;
  email?: string;
};

function normalizeRole(role?: string): SessionRole | null {
  if (role === 'ADMIN' || role === 'EDITOR') return role;
  return null;
}

function normalizePayload(payload: TokenPayload): Session | null {
  const role = normalizeRole(payload.role);
  const userId = payload.userId || payload.id || payload.sub;
  const tenantId = payload.tenantId;
  if (!role || !userId || !tenantId) return null;

  return { userId, tenantId, role, roleCode: payload.roleCode, email: payload.email };
}

export async function getSession(): Promise<Session | null> {
  const cookieStore = await cookies();
  const token =
    cookieStore.get('token')?.value ||
    cookieStore.get('auth-token')?.value ||
    cookieStore.get('session-token')?.value;

  if (token) {
    try {
      const secret = process.env.JWT_SECRET || 'development-secret';
      const decoded = jwt.verify(token, secret) as TokenPayload;
      const session = normalizePayload(decoded);
      if (session) return session;
    } catch {
      // Invalid/expired token; continue to header/dev fallback.
    }
  }

  // Useful for local testing if auth routes are not wired yet.
  const headerStore = await headers();
  const headerRole = normalizeRole(headerStore.get('x-user-role') || undefined);
  const headerUserId = headerStore.get('x-user-id');
  const headerTenantId = headerStore.get('x-tenant-id');
  if (headerRole && headerUserId && headerTenantId) {
    return { userId: headerUserId, tenantId: headerTenantId, role: headerRole };
  }

  return null;
}
