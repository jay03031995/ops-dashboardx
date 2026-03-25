export type TeamChatMention = {
  id: string;
  name: string;
};

export type TeamChatMessage = {
  id: string;
  tenantId: string;
  authorId: string;
  authorName: string;
  authorRole: string;
  text: string;
  type: 'MESSAGE' | 'DOUBT';
  taskId: string | null;
  taskLabel: string | null;
  mentions: TeamChatMention[];
  createdAt: string;
};

const globalForChat = globalThis as unknown as {
  teamChatStore?: Record<string, TeamChatMessage[]>;
};

export function getTenantChatStore(tenantId: string) {
  if (!globalForChat.teamChatStore) globalForChat.teamChatStore = {};
  if (!globalForChat.teamChatStore[tenantId]) globalForChat.teamChatStore[tenantId] = [];
  return globalForChat.teamChatStore[tenantId];
}

