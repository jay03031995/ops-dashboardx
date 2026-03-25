const DEMO_TENANT_ID = 'demo-tenant';

const ADMIN_MODULES = [
  'dashboard',
  'task_board',
  'reports',
  'content_production',
  'content_production_editor',
  'clients',
  'team',
  'team_chat',
  'settings',
  'editor_dashboard',
] as const;

export const DEMO_ADMIN_USER = {
  id: 'demo-admin',
  name: 'Jay',
  email: 'jay@genesisvirtue.com',
  password: 'Admin@123',
  role: 'ADMIN' as const,
  roleCode: 'ADMIN',
  tenantId: DEMO_TENANT_ID,
  avatarUrl: null,
  moduleAccess: [...ADMIN_MODULES],
};

export function matchDemoUser(email: string, password: string) {
  if (
    email.trim().toLowerCase() === DEMO_ADMIN_USER.email &&
    password === DEMO_ADMIN_USER.password
  ) {
    return DEMO_ADMIN_USER;
  }
  return null;
}

export function getDemoUserFromSession(session: {
  userId: string;
  tenantId: string;
  role: 'ADMIN' | 'EDITOR';
  email?: string;
  roleCode?: string;
}) {
  if (session.userId === DEMO_ADMIN_USER.id || session.email === DEMO_ADMIN_USER.email) {
    const { password: _password, ...demoUser } = DEMO_ADMIN_USER;
    return demoUser;
  }

  return {
    id: session.userId,
    name: session.email?.split('@')[0] || 'Demo User',
    email: session.email || 'demo.user@example.com',
    role: session.role,
    roleCode: session.roleCode || (session.role === 'ADMIN' ? 'ADMIN' : 'VE'),
    tenantId: session.tenantId,
    avatarUrl: null,
    moduleAccess:
      session.role === 'ADMIN'
        ? [...ADMIN_MODULES]
        : ['editor_dashboard', 'team_chat', 'content_production_editor'],
  };
}
