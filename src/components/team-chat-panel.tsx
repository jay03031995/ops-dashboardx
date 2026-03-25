'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link2, MessageCircleMore, RefreshCw, Send } from 'lucide-react';
import toast from 'react-hot-toast';

type ChatMessage = {
  id: string;
  authorId: string;
  authorName: string;
  authorRole: string;
  text: string;
  type: 'MESSAGE' | 'DOUBT';
  taskId: string | null;
  taskLabel: string | null;
  mentions: { id: string; name: string }[];
  createdAt: string;
};

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

function formatTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function TeamChatPanel({
  calendarLink,
  compact = false,
  variant = 'page',
}: {
  calendarLink: string;
  compact?: boolean;
  variant?: 'page' | 'widget';
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [users, setUsers] = useState<ChatUser[]>([]);
  const [tasks, setTasks] = useState<ChatTask[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  const [taskId, setTaskId] = useState('');
  const [text, setText] = useState('');
  const [isDoubt, setIsDoubt] = useState(false);
  const [mentionIds, setMentionIds] = useState<string[]>([]);
  const [mentionQuery, setMentionQuery] = useState('');
  const [taskClientFilter, setTaskClientFilter] = useState('ALL');
  const [taskDateFilter, setTaskDateFilter] = useState('');
  const [showConversation, setShowConversation] = useState(variant !== 'widget');

  const fetchChat = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/team/chat', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error || 'Failed to load chat');
        return;
      }
      setMessages(Array.isArray(data?.messages) ? data.messages : []);
      setUsers(Array.isArray(data?.users) ? data.users : []);
      setTasks(Array.isArray(data?.tasks) ? data.tasks : []);
      setCurrentUserId(typeof data?.currentUserId === 'string' ? data.currentUserId : null);
    } catch {
      toast.error('Failed to load chat');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchChat();
    const timer = setInterval(fetchChat, 8000);
    return () => clearInterval(timer);
  }, [fetchChat]);

  const availableTaskClients = useMemo(() => {
    const set = new Set<string>();
    tasks.forEach((task) => set.add(task.clientName));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      if (taskClientFilter !== 'ALL' && task.clientName !== taskClientFilter) return false;
      if (taskDateFilter) {
        const taskDate = new Date(task.date);
        const filterDate = new Date(taskDateFilter);
        if (taskDate.toDateString() !== filterDate.toDateString()) return false;
      }
      return true;
    });
  }, [taskClientFilter, taskDateFilter, tasks]);

  const mentionSuggestions = useMemo(() => {
    if (!mentionQuery) return [];
    const q = mentionQuery.toLowerCase();
    return users.filter((user) => user.name.toLowerCase().includes(q)).slice(0, 6);
  }, [mentionQuery, users]);

  const quickEmojis = ['😀', '👍', '❤️', '🔥', '✅', '🚀'];

  const handleTextChange = (value: string) => {
    setText(value);
    const cursor = value.length;
    const slice = value.slice(0, cursor);
    const lastAt = slice.lastIndexOf('@');
    if (lastAt === -1) {
      setMentionQuery('');
      return;
    }
    const after = slice.slice(lastAt + 1);
    if (after.includes(' ') || after.includes('\n')) {
      setMentionQuery('');
      return;
    }
    setMentionQuery(after.trim());
  };

  const insertMention = (user: ChatUser) => {
    const value = text;
    const cursor = value.length;
    const slice = value.slice(0, cursor);
    const lastAt = slice.lastIndexOf('@');
    const before = value.slice(0, lastAt);
    const after = value.slice(cursor);
    const nextValue = `${before}@${user.name} ${after}`.replace(/\s{2,}/g, ' ');
    setText(nextValue);
    setMentionQuery('');
    setMentionIds((prev) => (prev.includes(user.id) ? prev : [...prev, user.id]));
  };

  const sendMessage = async () => {
    if (!text.trim()) {
      toast.error('Write a message');
      return;
    }

    const mentionIdsFromText = users
      .filter((user) => text.includes(`@${user.name}`))
      .map((user) => user.id);
    const finalMentionIds = Array.from(new Set([...mentionIds, ...mentionIdsFromText]));

    setSending(true);
    try {
      const res = await fetch('/api/team/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          taskId: taskId || null,
          mentionIds: finalMentionIds,
          type: isDoubt ? 'DOUBT' : 'MESSAGE',
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error || 'Failed to send message');
        return;
      }

      setMessages((prev) => [...prev, data]);
      setText('');
      setTaskId('');
      setMentionIds([]);
      setIsDoubt(false);
      setMentionQuery('');
      toast.success('Message sent');
    } catch {
      toast.error('Failed to send message');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className={compact ? 'space-y-4' : 'space-y-6'}>
      {!compact && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Team Chat</h1>
              <p className="mt-1 text-sm text-slate-500">Discuss tasks, tag members, ask doubts, and track updates in one place.</p>
            </div>
            <button
              onClick={fetchChat}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-100 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-200 disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </section>
      )}

      <section className={compact ? 'space-y-4' : 'grid grid-cols-1 gap-6 xl:grid-cols-5'}>
        {showConversation && (
          <div className={compact ? 'rounded-2xl border border-slate-200 bg-[#efeae2] p-4 shadow-sm' : 'rounded-2xl border border-slate-200 bg-[#efeae2] p-5 shadow-sm xl:col-span-3'}>
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-700">
            <MessageCircleMore className="h-4 w-4" />
            Conversation
          </div>
          <div className={compact ? 'max-h-[18rem] space-y-3 overflow-y-auto pr-1' : 'max-h-[28rem] space-y-3 overflow-y-auto pr-1'}>
            {messages.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-white/70 p-6 text-center text-sm text-slate-500">
                No messages yet. Start the team conversation.
              </div>
            ) : (
              messages.map((msg) => {
                const isOwn = currentUserId && msg.authorId === currentUserId;
                const visibleMentions = msg.mentions.filter((mention) => !msg.text.includes(`@${mention.name}`));
                return (
                  <div key={msg.id} className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-3 shadow-sm ${
                        isOwn ? 'bg-[#dcf8c6] rounded-tr-sm' : 'bg-white rounded-tl-sm'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-slate-900">{msg.authorName}</span>
                          <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-600">
                            {msg.authorRole}
                          </span>
                          {msg.type === 'DOUBT' && (
                            <span className="rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-700">
                              Doubt
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-slate-500">{formatTime(msg.createdAt)}</span>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap text-sm text-slate-800">{msg.text}</p>

                      {(msg.taskLabel || visibleMentions.length > 0) && (
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          {msg.taskLabel && (
                            <a
                              href={calendarLink}
                              className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
                            >
                              <Link2 className="h-3.5 w-3.5" />
                              {msg.taskLabel}
                            </a>
                          )}
                          {visibleMentions.map((mention) => (
                            <span key={`${msg.id}-${mention.id}`} className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-700">
                              @{mention.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
        )}

        <div className={compact ? 'rounded-2xl border border-slate-200 bg-white p-4 shadow-sm' : 'rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-2'}>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-700">Compose</div>
              {variant === 'widget' && (
                <button
                  type="button"
                  onClick={() => setShowConversation((prev) => !prev)}
                  className="text-xs text-blue-600 hover:underline"
                >
                  {showConversation ? 'Hide messages' : 'View messages'}
                </button>
              )}
              {compact && (
                <button
                  onClick={fetchChat}
                  disabled={loading}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 disabled:opacity-60"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Tag Task</label>
              <div className="mt-2 grid gap-2">
                <select
                  value={taskClientFilter}
                  onChange={(e) => setTaskClientFilter(e.target.value)}
                  className="w-full rounded-full border border-slate-200 bg-white p-2 text-sm shadow-sm"
                >
                  <option value="ALL">All Clients</option>
                  {availableTaskClients.map((client) => (
                    <option key={client} value={client}>
                      {client}
                    </option>
                  ))}
                </select>
                <input
                  type="date"
                  value={taskDateFilter}
                  onChange={(e) => setTaskDateFilter(e.target.value)}
                  className="w-full rounded-full border border-slate-200 bg-white p-2 text-sm shadow-sm"
                />
                <select
                  value={taskId}
                  onChange={(e) => setTaskId(e.target.value)}
                  className="w-full rounded-full border border-slate-200 bg-white p-2.5 text-sm shadow-sm"
                >
                  <option value="">No task tag</option>
                  {filteredTasks.map((task) => (
                    <option key={task.id} value={task.id}>
                      {task.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">Message</label>
              <textarea
                value={text}
                onChange={(e) => handleTextChange(e.target.value)}
                placeholder="Write update, doubt, or task note..."
                rows={compact ? 4 : 6}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm"
              />
              <div className="mt-2 flex flex-wrap gap-2">
                {quickEmojis.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => handleTextChange(`${text}${emoji}`)}
                    className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm hover:bg-slate-50"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
              {mentionSuggestions.length > 0 && (
                <div className="mt-2 rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
                  <div className="text-xs text-slate-500">Tag teammate</div>
                  <div className="mt-1 space-y-1">
                    {mentionSuggestions.map((user) => (
                      <button
                        key={user.id}
                        type="button"
                        onClick={() => insertMention(user)}
                        className="flex w-full items-center justify-between rounded-lg px-2 py-1 text-left text-sm text-slate-700 hover:bg-slate-100"
                      >
                        <span>@{user.name}</span>
                        <span className="text-xs text-slate-500">{user.role}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <label className="inline-flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={isDoubt} onChange={(e) => setIsDoubt(e.target.checked)} />
              Mark this as doubt/question
            </label>

            <button
              onClick={sendMessage}
              disabled={sending}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
            >
              <Send className="h-4 w-4" />
              {sending ? 'Sending...' : 'Send Message'}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
