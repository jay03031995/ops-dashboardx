import { Session } from '@/lib/middleware';
import { getDemoEditorsStore } from '@/lib/dev-store';

export type TeamRoleOption = {
  code: string;
  name: string;
  system?: boolean;
};

export type TeamModuleOption = {
  key: string;
  label: string;
};

const DEFAULT_TEAM_ROLES: TeamRoleOption[] = [
  { code: 'SM', name: 'Social Manager', system: true },
  { code: 'VE', name: 'Video Editor', system: true },
  { code: 'ISM', name: 'Intern Social Manager', system: true },
  { code: 'CSM', name: 'Customer Success Manager', system: true },
  { code: 'CF', name: 'Co-founder', system: true },
  { code: 'ADMIN', name: 'Founder', system: true },
];

export const MODULE_CATALOG: TeamModuleOption[] = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'task_board', label: 'Task Board' },
  { key: 'reports', label: 'Reports' },
  { key: 'content_production', label: 'Content Production' },
  { key: 'content_production_editor', label: 'Content Production (Editor)' },
  { key: 'clients', label: 'Clients' },
  { key: 'team', label: 'The Team' },
  { key: 'team_chat', label: 'Team Chat' },
  { key: 'settings', label: 'Configuration' },
  { key: 'editor_dashboard', label: 'Editor Dashboard' },
];

const globalForRoles = globalThis as unknown as {
  tenantRoleCatalog?: Record<string, TeamRoleOption[]>;
  memberRoleByTenant?: Record<string, Record<string, string>>;
  tenantRoleModuleAccess?: Record<string, Record<string, string[]>>;
};

function getRoleCatalogStore() {
  if (!globalForRoles.tenantRoleCatalog) {
    globalForRoles.tenantRoleCatalog = {};
  }
  return globalForRoles.tenantRoleCatalog;
}

function getMemberRoleStore() {
  if (!globalForRoles.memberRoleByTenant) {
    globalForRoles.memberRoleByTenant = {};
  }
  return globalForRoles.memberRoleByTenant;
}

function getRoleModuleAccessStore() {
  if (!globalForRoles.tenantRoleModuleAccess) {
    globalForRoles.tenantRoleModuleAccess = {};
  }
  return globalForRoles.tenantRoleModuleAccess;
}

function defaultModulesForRole(code: string): string[] {
  const role = code.toUpperCase();
  if (role === 'ADMIN' || role === 'CF') {
    return MODULE_CATALOG.map((mod) => mod.key);
  }
  if (role === 'SM' || role === 'CSM' || role === 'ISM') {
    return ['dashboard', 'task_board', 'reports', 'content_production', 'clients', 'team_chat', 'editor_dashboard'];
  }
  if (role === 'VE') {
    return ['editor_dashboard', 'team_chat', 'content_production_editor'];
  }
  return ['editor_dashboard', 'team_chat'];
}

export function getTenantRoles(tenantId: string): TeamRoleOption[] {
  const store = getRoleCatalogStore();
  if (!store[tenantId]) {
    store[tenantId] = [...DEFAULT_TEAM_ROLES];
  }
  return store[tenantId];
}

export function addTenantRole(tenantId: string, role: TeamRoleOption) {
  const roles = getTenantRoles(tenantId);
  if (roles.some((r) => r.code.toUpperCase() === role.code.toUpperCase())) {
    return { ok: false as const, error: 'Role code already exists' };
  }
  roles.push({ code: role.code.toUpperCase(), name: role.name, system: false });
  setRoleModuleAccess(tenantId, role.code.toUpperCase(), defaultModulesForRole(role.code.toUpperCase()));
  return { ok: true as const };
}

export function getMemberRoleCode(tenantId: string, userId: string): string | null {
  const store = getMemberRoleStore();
  return store[tenantId]?.[userId] || null;
}

export function setMemberRoleCode(tenantId: string, userId: string, roleCode: string) {
  const store = getMemberRoleStore();
  if (!store[tenantId]) store[tenantId] = {};
  store[tenantId][userId] = roleCode.toUpperCase();
}

export function resolveSessionTeamRole(session: Session): string {
  if (session.role === 'ADMIN') return 'ADMIN';
  if (session.roleCode) return session.roleCode.toUpperCase();

  const roleFromMap = getMemberRoleCode(session.tenantId, session.userId);
  if (roleFromMap) return roleFromMap;

  const demoRole =
    getDemoEditorsStore().find((editor) => editor.tenantId === session.tenantId && editor.id === session.userId)?.role || null;
  return (demoRole || 'VE').toUpperCase();
}

export function canManageRoles(session: Session): boolean {
  const roleCode = resolveSessionTeamRole(session);
  return session.role === 'ADMIN' || roleCode === 'CF' || roleCode === 'ADMIN';
}

export function hasModuleAccess(session: Session, moduleKey: string): boolean {
  if (session.role === 'ADMIN') return true;
  const roleCode = resolveSessionTeamRole(session);
  const access = getRoleModuleAccess(session.tenantId, roleCode);
  return access.includes(moduleKey);
}

export function getRoleModuleAccess(tenantId: string, roleCode: string): string[] {
  const role = roleCode.toUpperCase();
  const store = getRoleModuleAccessStore();
  if (!store[tenantId]) store[tenantId] = {};
  if (!store[tenantId][role]) {
    store[tenantId][role] = defaultModulesForRole(role);
  }
  return store[tenantId][role];
}

export function setRoleModuleAccess(tenantId: string, roleCode: string, modules: string[]) {
  const clean = sanitizeModuleAccess(modules);
  const store = getRoleModuleAccessStore();
  if (!store[tenantId]) store[tenantId] = {};
  store[tenantId][roleCode.toUpperCase()] = clean;
}

export function getAllRoleModuleAccess(tenantId: string) {
  const roles = getTenantRoles(tenantId);
  const map: Record<string, string[]> = {};
  roles.forEach((role) => {
    map[role.code] = getRoleModuleAccess(tenantId, role.code);
  });
  return map;
}

export function sanitizeModuleAccess(modules: string[] | null | undefined) {
  const allowedKeys = new Set(MODULE_CATALOG.map((mod) => mod.key));
  const input = Array.isArray(modules) ? modules : [];
  return Array.from(new Set(input.filter((mod) => typeof mod === 'string' && allowedKeys.has(mod))));
}

export function resolveEffectiveModuleAccess(
  tenantId: string,
  roleCode: string,
  userModuleAccess?: string[] | null
) {
  const explicit = sanitizeModuleAccess(userModuleAccess);
  if (explicit.length > 0) return explicit;
  return getRoleModuleAccess(tenantId, roleCode);
}
