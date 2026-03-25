import { DEMO_EDITORS } from './demo-data';

export type DemoEditor = {
  id: string;
  name: string | null;
  email: string;
  role: string;
  tenantId: string;
  createdAt: string;
};

export type DemoClient = {
  id: string;
  name: string;
  oneDriveFolder: string | null;
  editorId: string | null;
  tenantId: string;
  editor: { id: string; name: string | null; email: string } | null;
};

export type DemoCalendarEntry = {
  id: string;
  date: string;
  videoTopic: string;
  videoLink?: string | null;
  refVideo?: string | null;
  remarks?: string | null;
  attachmentUrl?: string | null;
  platform: string;
  status: 'PENDING' | 'ASSIGNED' | 'COMPLETED';
  videoUrl?: string | null;
  editedVideoUrl?: string | null;
  assignedEditorId?: string | null;
  clientId: string;
  tenantId: string;
};

const globalForDemo = globalThis as unknown as {
  demoEditors?: DemoEditor[];
  demoClients?: DemoClient[];
  demoCalendarEntries?: DemoCalendarEntry[];
};

const DEFAULT_DEMO_TENANT_ID = 'demo-tenant';
const DEFAULT_CLIENTS = ['Apex Dental', 'Bloom Skin', 'City Ortho', 'Nova Care'];
const DEFAULT_PLATFORMS = ['Instagram', 'Facebook', 'Youtube - Long', 'Linkedin'];

function initializeDefaultDemoData() {
  if (!globalForDemo.demoEditors) {
    globalForDemo.demoEditors = [];
  }
  if (!globalForDemo.demoClients) {
    globalForDemo.demoClients = [];
  }
  if (!globalForDemo.demoCalendarEntries) {
    globalForDemo.demoCalendarEntries = [];
  }

  const hasEditors = globalForDemo.demoEditors.some((editor) => editor.tenantId === DEFAULT_DEMO_TENANT_ID);
  if (!hasEditors) {
    DEMO_EDITORS.forEach((editor) => {
      globalForDemo.demoEditors!.push({
        id: `${DEFAULT_DEMO_TENANT_ID}-${editor.id}`,
        name: editor.name,
        email: editor.email,
        role: editor.role,
        tenantId: DEFAULT_DEMO_TENANT_ID,
        createdAt: new Date().toISOString(),
      });
    });
  }
  const editors = globalForDemo.demoEditors.filter((editor) => editor.tenantId === DEFAULT_DEMO_TENANT_ID);
  const hasClients = globalForDemo.demoClients.some((client) => client.tenantId === DEFAULT_DEMO_TENANT_ID);
  if (!hasClients) {
    DEFAULT_CLIENTS.forEach((name, index) => {
      const editor = editors[index % editors.length] || null;
      globalForDemo.demoClients!.push({
        id: `${DEFAULT_DEMO_TENANT_ID}-client-${index + 1}`,
        name,
        oneDriveFolder: `https://example.com/${name.toLowerCase().replace(/\s+/g, '-')}`,
        editorId: editor?.id || null,
        tenantId: DEFAULT_DEMO_TENANT_ID,
        editor: editor
          ? { id: editor.id, name: editor.name, email: editor.email }
          : null,
      });
    });
  }

  const hasCalendar = globalForDemo.demoCalendarEntries.some((entry) => entry.tenantId === DEFAULT_DEMO_TENANT_ID);
  if (!hasCalendar) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    globalForDemo.demoClients!
      .filter((client) => client.tenantId === DEFAULT_DEMO_TENANT_ID)
      .forEach((client, index) => {
        for (let dayOffset = 0; dayOffset < 3; dayOffset += 1) {
          const date = new Date(today);
          date.setDate(today.getDate() + dayOffset);
          const assignedEditor = editors[(index + dayOffset) % editors.length] || null;
          globalForDemo.demoCalendarEntries!.push({
            id: `${client.id}-task-${dayOffset + 1}`,
            date: date.toISOString(),
            videoTopic: `${client.name} campaign ${dayOffset + 1}`,
            platform: DEFAULT_PLATFORMS[(index + dayOffset) % DEFAULT_PLATFORMS.length],
            status: dayOffset === 0 ? 'ASSIGNED' : dayOffset === 1 ? 'PENDING' : 'COMPLETED',
            videoUrl: dayOffset === 0 ? `https://example.com/raw/${client.id}/${dayOffset + 1}` : null,
            editedVideoUrl: dayOffset === 2 ? `https://example.com/edited/${client.id}/${dayOffset + 1}` : null,
            assignedEditorId: assignedEditor?.id || null,
            clientId: client.id,
            tenantId: DEFAULT_DEMO_TENANT_ID,
          });
        }
      });
  }
}

export function getDemoEditorsStore() {
  if (!globalForDemo.demoEditors) {
    globalForDemo.demoEditors = [];
  }
  initializeDefaultDemoData();
  return globalForDemo.demoEditors;
}

export function ensureDemoEditorsForTenant(tenantId: string) {
  const store = getDemoEditorsStore();
  const hasTenantEditors = store.some((editor) => editor.tenantId === tenantId);
  if (!hasTenantEditors) {
    DEMO_EDITORS.forEach((editor) => {
      store.push({
        id: `${tenantId}-${editor.id}`,
        name: editor.name,
        email: editor.email,
        role: editor.role,
        tenantId,
        createdAt: new Date().toISOString(),
      });
    });
  }
  return store.filter((editor) => editor.tenantId === tenantId);
}

export function getDemoClientsStore() {
  if (!globalForDemo.demoClients) {
    globalForDemo.demoClients = [];
  }
  initializeDefaultDemoData();
  return globalForDemo.demoClients;
}

export function getDemoCalendarStore() {
  if (!globalForDemo.demoCalendarEntries) {
    globalForDemo.demoCalendarEntries = [];
  }
  initializeDefaultDemoData();
  return globalForDemo.demoCalendarEntries;
}
