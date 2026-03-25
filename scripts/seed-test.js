const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

const tenantSlug = 'default';
const tenantName = 'Default';

const editorCount = 5;
const clientCount = 10;
const calendarCount = 20;
const contentProductionCount = 12;

const platforms = ['Instagram', 'Facebook', 'Youtube - Long', 'Youtube - Short', 'Linkedin'];
const productionPlatforms = ['Website Blog', 'Instagram', 'Facebook', 'YouTube', 'GMB', 'LinkedIn'];

function pick(list, index) {
  return list[index % list.length];
}

async function ensureTenant() {
  const existing = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
  if (existing) return existing;
  return prisma.tenant.create({ data: { name: tenantName, slug: tenantSlug } });
}

async function upsertEditors(tenantId) {
  const editors = [];
  for (let i = 1; i <= editorCount; i += 1) {
    const email = `editor${i}@genesisvirtue.com`;
    const name = `Editor ${i}`;
    const password = `Editor${i}@123`;
    const hashed = await bcrypt.hash(password, 10);

    const editor = await prisma.user.upsert({
      where: { email },
      update: { name, password: hashed, role: 'EDITOR', tenantId },
      create: { name, email, password: hashed, role: 'EDITOR', tenantId },
    });
    editors.push(editor);
  }
  return editors;
}

async function upsertClients(tenantId, editors) {
  const clients = [];
  for (let i = 1; i <= clientCount; i += 1) {
    const name = `Client ${i}`;
    const oneDriveFolder = `https://1drv.ms/f/some-folder-${i}`;
    const editor = editors[i % editors.length];

    const client = await prisma.client.upsert({
      where: { name_tenantId: { name, tenantId } },
      update: { oneDriveFolder, editorId: editor.id },
      create: { name, oneDriveFolder, editorId: editor.id, tenantId },
    });
    clients.push(client);
  }
  return clients;
}

async function createCalendarEntries(tenantId, clients) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = 0; i < calendarCount; i += 1) {
    const client = clients[i % clients.length];
    const date = new Date(today);
    date.setDate(today.getDate() + (i % 14));

    await prisma.contentCalendar.create({
      data: {
        tenantId,
        clientId: client.id,
        date,
        videoTopic: `Seeded Task ${i + 1}`,
        platform: pick(platforms, i),
        status: i % 3 === 0 ? 'ASSIGNED' : 'PENDING',
        videoUrl: i % 3 === 0 ? `https://1drv.ms/v/some-video-${i + 1}` : null,
      },
    });
  }
}

async function createContentProduction(tenantId, clients, editors) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = 0; i < contentProductionCount; i += 1) {
    const client = clients[i % clients.length];
    const editor = editors[i % editors.length];
    const date = new Date(today);
    date.setDate(today.getDate() + (i % 7));

    await prisma.contentProduction.create({
      data: {
        tenantId,
        clientId: client.id,
        scheduledDate: date,
        topic: `Content Topic ${i + 1}`,
        platform: pick(productionPlatforms, i),
        status: i % 4 === 0 ? 'PLANNED' : i % 4 === 1 ? 'IN_EDITING' : i % 4 === 2 ? 'READY_FOR_REVIEW' : 'POSTED',
        assignedEditorId: editor.id,
        editedContentUrl: i % 4 >= 2 ? `https://1drv.ms/v/edited-content-${i + 1}` : null,
        finalPostUrl: i % 4 === 3 ? `https://social.example.com/post/${i + 1}` : null,
        notes: 'Seeded content notes',
      },
    });
  }
}

async function main() {
  const tenant = await ensureTenant();
  const editors = await upsertEditors(tenant.id);
  const clients = await upsertClients(tenant.id, editors);
  await createCalendarEntries(tenant.id, clients);
  await createContentProduction(tenant.id, clients, editors);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
