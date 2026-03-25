type TaskMeta = {
  videoLink?: string | null;
  refVideo?: string | null;
  remarks?: string | null;
  attachmentUrl?: string | null;
  assignedEditorId?: string | null;
};

type TenantTaskMetaMap = Record<string, Record<string, TaskMeta>>;

const globalForTaskMeta = globalThis as unknown as {
  taskMetaStore?: TenantTaskMetaMap;
};

function getStore(): TenantTaskMetaMap {
  if (!globalForTaskMeta.taskMetaStore) {
    globalForTaskMeta.taskMetaStore = {};
  }
  return globalForTaskMeta.taskMetaStore;
}

export function getTaskMeta(tenantId: string, entryId: string): TaskMeta | null {
  const store = getStore();
  return store[tenantId]?.[entryId] || null;
}

export function setTaskMeta(tenantId: string, entryId: string, meta: TaskMeta) {
  const store = getStore();
  if (!store[tenantId]) store[tenantId] = {};
  store[tenantId][entryId] = {
    ...(store[tenantId][entryId] || {}),
    ...meta,
  };
}

export function deleteTaskMeta(tenantId: string, entryId: string) {
  const store = getStore();
  if (!store[tenantId]) return;
  delete store[tenantId][entryId];
}
