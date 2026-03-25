import { NextResponse } from 'next/server';
import { getSession } from '@/lib/middleware';
import { isDatabaseConfigured, prisma } from '@/lib/prisma';
import { ensureDemoEditorsForTenant, getDemoCalendarStore, getDemoClientsStore } from '@/lib/dev-store';
import { getTenantChatStore, TeamChatMention } from '@/lib/chat-store';

type ChatUser = {
  id: string;
  name: string;
  email?: string;
  role: string;
};

type ChatTask = {
  id: string;
  label: string;
  date: string;
  clientName: string;
};

function formatTaskLabel(clientName: string, date: Date, topic: string) {
  const d = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return `${clientName} • ${d} • ${topic || 'Task'}`;
}

async function loadUsersAndTasks(tenantId: string, session: Awaited<ReturnType<typeof getSession>>) {
  let users: ChatUser[] = [];
  let tasks: ChatTask[] = [];

  if (!isDatabaseConfigured()) {
    const editors = ensureDemoEditorsForTenant(tenantId);
    users = [
      {
        id: session?.userId || 'session-user',
        name: session?.email || 'Admin',
        email: session?.email,
        role: session?.role || 'ADMIN',
      },
      ...editors.map((editor) => ({
        id: editor.id,
        name: editor.name || editor.email,
        email: editor.email,
        role: editor.role,
      })),
    ];

    const seenUser = new Set<string>();
    users = users.filter((user) => {
      if (seenUser.has(user.id)) return false;
      seenUser.add(user.id);
      return true;
    });

    const clientNameById = new Map(
      getDemoClientsStore()
        .filter((client) => client.tenantId === tenantId)
        .map((client) => [client.id, client.name])
    );
    tasks = getDemoCalendarStore()
      .filter((entry) => entry.tenantId === tenantId)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 300)
      .map((entry) => {
        const clientName = clientNameById.get(entry.clientId) || 'Client';
        return {
          id: entry.id,
          date: entry.date,
          clientName,
          label: formatTaskLabel(
            clientName,
            new Date(entry.date),
            entry.videoTopic || entry.remarks || 'Task'
          ),
        };
      });

    return { users, tasks };
  }

  const [dbUsers, dbTasks] = await Promise.all([
    prisma.user.findMany({
      where: { tenantId },
      select: { id: true, name: true, email: true, role: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.contentCalendar.findMany({
      where: { tenantId },
      select: {
        id: true,
        date: true,
        videoTopic: true,
        client: { select: { name: true } },
      },
      orderBy: { date: 'desc' },
      take: 300,
    }),
  ]);

  users = dbUsers.map((user) => ({
    id: user.id,
    name: user.name || user.email,
    email: user.email,
    role: user.role,
  }));
  tasks = dbTasks.map((task) => ({
    id: task.id,
    date: task.date.toISOString(),
    clientName: task.client.name,
    label: formatTaskLabel(task.client.name, task.date, task.videoTopic),
  }));

  return { users, tasks };
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { users, tasks } = await loadUsersAndTasks(session.tenantId, session);
    if (!isDatabaseConfigured()) {
      const messages = getTenantChatStore(session.tenantId)
        .slice()
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
        .slice(-500);
      return NextResponse.json({ messages, users, tasks, currentUserId: session.userId });
    }

    const dbMessages = await prisma.teamChatMessage.findMany({
      where: { tenantId: session.tenantId },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    const messages = dbMessages
      .slice()
      .reverse()
      .map((message) => ({
        ...message,
        mentions: Array.isArray(message.mentions) ? message.mentions : [],
        createdAt: message.createdAt.toISOString(),
      }));

    return NextResponse.json({ messages, users, tasks, currentUserId: session.userId });
  } catch {
    return NextResponse.json({ error: 'Failed to load team chat' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json();
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    const taskId = typeof body.taskId === 'string' && body.taskId.trim() ? body.taskId.trim() : null;
    const type: 'MESSAGE' | 'DOUBT' = body.type === 'DOUBT' ? 'DOUBT' : 'MESSAGE';
    const mentionIds = Array.isArray(body.mentionIds) ? body.mentionIds.filter((v) => typeof v === 'string') : [];

    if (!text) return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    if (text.length > 2000) return NextResponse.json({ error: 'Message is too long' }, { status: 400 });

    const { users, tasks } = await loadUsersAndTasks(session.tenantId, session);
    const author = users.find((user) => user.id === session.userId) || {
      id: session.userId,
      name: session.email || 'Team Member',
      role: session.role,
    };
    const task = taskId ? tasks.find((item) => item.id === taskId) : null;

    const mentionLookup = new Map(users.map((user) => [user.id, user.name]));
    const mentions: TeamChatMention[] = mentionIds
      .filter((id, index) => mentionIds.indexOf(id) === index)
      .map((id) => ({ id, name: mentionLookup.get(id) || 'Unknown' }));

    const message = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      tenantId: session.tenantId,
      authorId: author.id,
      authorName: author.name,
      authorRole: author.role,
      text,
      type,
      taskId: task?.id || null,
      taskLabel: task?.label || null,
      mentions,
      createdAt: new Date().toISOString(),
    };

    if (!isDatabaseConfigured()) {
      const store = getTenantChatStore(session.tenantId);
      store.push(message);
      if (store.length > 2000) {
        store.splice(0, store.length - 2000);
      }
      return NextResponse.json(message, { status: 201 });
    }

    const created = await prisma.teamChatMessage.create({
      data: {
        id: message.id,
        tenantId: message.tenantId,
        authorId: message.authorId,
        authorName: message.authorName,
        authorRole: message.authorRole,
        text: message.text,
        type: message.type,
        taskId: message.taskId,
        taskLabel: message.taskLabel,
        mentions,
      },
    });

    return NextResponse.json(
      {
        ...created,
        mentions: Array.isArray(created.mentions) ? created.mentions : [],
        createdAt: created.createdAt.toISOString(),
      },
      { status: 201 }
    );
  } catch {
    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 });
  }
}
