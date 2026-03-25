const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const MODULES_ALL = [
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
];

function defaultModulesForRole(roleCode) {
  const role = (roleCode || 'VE').toUpperCase();
  if (role === 'ADMIN' || role === 'CF') return MODULES_ALL;
  if (role === 'SM' || role === 'CSM' || role === 'ISM') {
    return ['dashboard', 'task_board', 'reports', 'content_production', 'clients', 'team_chat', 'editor_dashboard'];
  }
  if (role === 'VE') return ['editor_dashboard', 'team_chat', 'content_production_editor'];
  return ['editor_dashboard', 'team_chat'];
}

async function main() {
  const users = await prisma.user.findMany({
    select: { id: true, role: true, teamRoleCode: true, userModuleAccess: true },
  });

  let updated = 0;
  for (const user of users) {
    const existing = Array.isArray(user.userModuleAccess) ? user.userModuleAccess : [];
    if (existing.length > 0) continue;
    const roleCode = user.role === 'ADMIN' ? 'ADMIN' : (user.teamRoleCode || 'VE').toUpperCase();
    const modules = defaultModulesForRole(roleCode);
    await prisma.user.update({
      where: { id: user.id },
      data: { userModuleAccess: modules },
    });
    updated += 1;
  }

  console.log(`Backfill complete. Updated users: ${updated}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
