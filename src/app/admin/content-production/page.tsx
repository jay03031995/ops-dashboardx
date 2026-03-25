'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Calendar,
  CalendarRange,
  CheckCircle,
  ClipboardCopy,
  ExternalLink,
  Facebook,
  Instagram,
  Youtube,
  Filter,
  PlusSquare,
  Sparkles,
} from 'lucide-react';
import toast from 'react-hot-toast';

type Client = { id: string; name: string; editor?: { id: string; name: string | null; email?: string } | null };
type Editor = { id: string; name: string | null; email: string };

type ContentItem = {
  id: string;
  contentCalendarId?: string | null;
  scheduledDate: string;
  topic: string;
  platform: string;
  status: string;
  editedContentUrl?: string | null;
  finalPostUrl?: string | null;
  notes?: string | null;
  client: Client;
  assignedEditor?: { id: string; name: string | null; email?: string } | null;
};
type PostLinks = {
  facebook?: string;
  instagram?: string;
  youtubeShort?: string;
  youtubeVideo?: string;
  webBlog?: string;
  gmb?: string;
};
type PostPlatformKey = keyof PostLinks;
type PostLinkDraft = {
  platform: PostPlatformKey;
  link: string;
  links: PostLinks;
};

type TimePreset = 'TODAY' | 'TOMORROW' | 'WEEKLY' | 'MONTHLY' | 'CUSTOM';
type RewriteStyle = 'PROFESSIONAL' | 'SHORT' | 'FRIENDLY';

function monthValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function dateValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function addDays(source: Date, days: number) {
  const next = new Date(source);
  next.setDate(next.getDate() + days);
  return next;
}

function statusClass(status: string) {
  const value = status.toUpperCase();
  if (value === 'POSTED') return 'bg-emerald-100 text-emerald-700';
  if (value === 'APPROVED') return 'bg-emerald-50 text-emerald-700';
  if (value === 'SHARED_WITH_DOCTOR') return 'bg-purple-100 text-purple-700';
  if (value === 'RE_EDIT') return 'bg-rose-100 text-rose-700';
  if (value === 'PENDING') return 'bg-slate-100 text-slate-700';
  return 'bg-slate-100 text-slate-700';
}

function parsePostLinks(raw?: string | null): PostLinks {
  if (!raw) return {};
  const value = raw.trim();
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === 'object') return parsed as PostLinks;
  } catch {
    // fall through
  }
  return { webBlog: value };
}

function firstPostLink(raw?: string | null) {
  const links = parsePostLinks(raw);
  return (
    links.facebook ||
    links.instagram ||
    links.youtubeShort ||
    links.youtubeVideo ||
    links.webBlog ||
    links.gmb ||
    ''
  );
}

export default function ContentProductionPage() {
  const today = useMemo(() => new Date(), []);
  const todayValue = dateValue(today);
  const [timePreset, setTimePreset] = useState<TimePreset>('WEEKLY');
  const [monthFilter, setMonthFilter] = useState(monthValue(today));
  const [customStart, setCustomStart] = useState(todayValue);
  const [customEnd, setCustomEnd] = useState(todayValue);
  const [items, setItems] = useState<ContentItem[]>([]);
  const [finalDrafts, setFinalDrafts] = useState<Record<string, string>>({});
  const [statusDrafts, setStatusDrafts] = useState<Record<string, string>>({});
  const [postLinkDrafts, setPostLinkDrafts] = useState<Record<string, PostLinkDraft>>({});
  const [activePostLinkId, setActivePostLinkId] = useState<string | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [editors, setEditors] = useState<Editor[]>([]);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [clientFilter, setClientFilter] = useState('ALL');
  const [editorFilter, setEditorFilter] = useState('ALL');
  const [showModal, setShowModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editing, setEditing] = useState<ContentItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [summaryClientId, setSummaryClientId] = useState('');
  const [summaryDate, setSummaryDate] = useState(todayValue);
  const [summaryText, setSummaryText] = useState('');
  const [rewriteStyle, setRewriteStyle] = useState<RewriteStyle>('PROFESSIONAL');
  const [rewritingSummary, setRewritingSummary] = useState(false);

  const [form, setForm] = useState({
    scheduledDate: todayValue,
    clientId: '',
    platform: 'Instagram',
    topic: '',
    assignedEditorId: '',
    notes: '',
  });

  const [editForm, setEditForm] = useState({
    id: '',
    scheduledDate: '',
    clientId: '',
    platform: '',
    topic: '',
    assignedEditorId: '',
    status: 'PENDING',
    editedContentUrl: '',
    finalPostUrl: '',
    notes: '',
  });
  const [linksForm, setLinksForm] = useState({
    id: '',
    status: 'PENDING',
    assignedEditorId: '',
    editedContentUrl: '',
    postLinks: {
      facebook: '',
      instagram: '',
      youtubeShort: '',
      youtubeVideo: '',
      webBlog: '',
      gmb: '',
    } as PostLinks,
    draftPlatform: 'instagram' as PostPlatformKey,
    draftLink: '',
  });

  const fetchClients = useCallback(async () => {
    const res = await fetch('/api/admin/clients', { cache: 'no-store' });
    const data = await res.json();
    if (res.ok && Array.isArray(data)) setClients(data);
  }, []);

  const fetchEditors = useCallback(async () => {
    const res = await fetch('/api/admin/editors', { cache: 'no-store' });
    const data = await res.json();
    if (res.ok && Array.isArray(data)) setEditors(data);
  }, []);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      let query = '';
      if (timePreset === 'TODAY') {
        query = `date=${todayValue}`;
      } else if (timePreset === 'TOMORROW') {
        query = `date=${dateValue(addDays(today, 1))}`;
      } else if (timePreset === 'WEEKLY') {
        query = `start=${todayValue}&end=${dateValue(addDays(today, 6))}`;
      } else if (timePreset === 'MONTHLY') {
        const [yearStr, monthStr] = monthFilter.split('-');
        query = `month=${Number(monthStr)}&year=${Number(yearStr)}`;
      } else {
        if (!customStart || !customEnd || customStart > customEnd) {
          setItems([]);
          return;
        }
        query = `start=${customStart}&end=${customEnd}`;
      }

      const res = await fetch(`/api/admin/content-production?${query}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error || 'Failed to load content plan');
        setItems([]);
        return;
      }
      const loaded = Array.isArray(data.items) ? data.items : [];
      setItems(loaded);
      setFinalDrafts((prev) => {
        const next = { ...prev };
        loaded.forEach((item: ContentItem) => {
          if (typeof next[item.id] !== 'string') {
            next[item.id] = item.finalPostUrl || '';
          }
        });
        return next;
      });
      setStatusDrafts((prev) => {
        const next = { ...prev };
        loaded.forEach((item: ContentItem) => {
          if (typeof next[item.id] !== 'string') {
            next[item.id] = item.status;
          }
        });
        return next;
      });
      setPostLinkDrafts((prev) => {
        const next = { ...prev };
        loaded.forEach((item: ContentItem) => {
          if (!next[item.id]) {
            next[item.id] = {
              platform: 'instagram',
              link: '',
              links: parsePostLinks(item.finalPostUrl),
            };
          } else if (!next[item.id].links) {
            next[item.id].links = parsePostLinks(item.finalPostUrl);
          }
        });
        return next;
      });
    } catch {
      toast.error('Failed to load content plan');
    } finally {
      setLoading(false);
    }
  }, [customEnd, customStart, monthFilter, timePreset, today, todayValue]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  useEffect(() => {
    fetchClients();
    fetchEditors();
  }, [fetchClients, fetchEditors]);

  useEffect(() => {
    if (!summaryClientId && clients.length > 0) {
      setSummaryClientId(clients[0].id);
    }
  }, [clients, summaryClientId]);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (statusFilter !== 'ALL' && item.status !== statusFilter) return false;
      if (clientFilter !== 'ALL' && item.client.id !== clientFilter) return false;
      if (editorFilter !== 'ALL') {
        const editorId = item.assignedEditor?.id || item.client.editor?.id || '';
        if (editorId !== editorFilter) return false;
      }
      return true;
    });
  }, [clientFilter, editorFilter, items, statusFilter]);

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      const res = await fetch('/api/admin/content-production', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error || 'Failed to create item');
        return;
      }
      toast.success('Content planned');
      setShowModal(false);
      setForm({ scheduledDate: todayValue, clientId: '', platform: 'Instagram', topic: '', assignedEditorId: '', notes: '' });
      fetchItems();
    } catch {
      toast.error('Failed to create item');
    }
  };

  const openEdit = (item: ContentItem) => {
    setEditing(item);
    setEditForm({
      id: item.id,
      scheduledDate: new Date(item.scheduledDate).toISOString().split('T')[0],
      clientId: item.client.id,
      platform: item.platform,
      topic: item.topic,
      assignedEditorId: item.assignedEditor?.id || '',
      status: item.status,
      editedContentUrl: item.editedContentUrl || '',
      finalPostUrl: item.finalPostUrl || '',
      notes: item.notes || '',
    });
    setShowEditModal(true);
  };


  const handleUpdate = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      const res = await fetch('/api/admin/content-production', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error || 'Failed to update item');
        return;
      }
      setItems((prev) => prev.map((item) => (item.id === data.id ? data : item)));
      toast.success('Content updated');
      setShowEditModal(false);
      setEditing(null);
    } catch {
      toast.error('Failed to update item');
    }
  };

  const handleDelete = async (item: ContentItem) => {
    const linkedTaskMessage = item.contentCalendarId
      ? ' This will also remove the linked Task Board task.'
      : '';
    if (!window.confirm(`Delete this content item?${linkedTaskMessage}`)) return;
    try {
      const res = await fetch(`/api/admin/content-production?id=${encodeURIComponent(item.id)}`, { method: 'DELETE' });
      if (!res.ok) {
        toast.error('Failed to delete item');
        return;
      }
      setItems((prev) => prev.filter((entry) => entry.id !== item.id));
      toast.success('Deleted');
    } catch {
      toast.error('Failed to delete item');
    }
  };

  const generateSummary = async () => {
    if (!summaryClientId || !summaryDate) {
      toast.error('Select client and date');
      return;
    }
    const res = await fetch(
      `/api/admin/content-production/whatsapp-summary?clientId=${encodeURIComponent(summaryClientId)}&date=${encodeURIComponent(summaryDate)}`
    );
    const data = await res.json();
    if (!res.ok) {
      toast.error(data?.error || 'Failed to generate summary');
      return;
    }
    setSummaryText(data.message || '');
  };

  const copySummary = async () => {
    if (!summaryText) return;
    try {
      await navigator.clipboard.writeText(summaryText);
      toast.success('Summary copied');
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = summaryText;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      toast.success('Summary copied');
    }
  };

  const rewriteSummary = async () => {
    if (!summaryText.trim()) {
      toast.error('Generate a WhatsApp update first');
      return;
    }

    const clientName = clients.find((client) => client.id === summaryClientId)?.name || '';

    setRewritingSummary(true);
    try {
      const res = await fetch('/api/admin/content-production/whatsapp-rewrite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: summaryText,
          style: rewriteStyle,
          clientName,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error || 'Failed to rewrite WhatsApp update');
        return;
      }
      setSummaryText(data.text || summaryText);
      toast.success('WhatsApp update rewritten');
    } catch {
      toast.error('Failed to rewrite WhatsApp update');
    } finally {
      setRewritingSummary(false);
    }
  };

  const platforms = ['Website Blog', 'Instagram', 'Facebook', 'YouTube', 'GMB', 'LinkedIn'];

  const saveFinalLink = async (item: ContentItem, markPosted = false) => {
    const finalPostUrl = (finalDrafts[item.id] || '').trim();
    if (markPosted && !finalPostUrl) {
      toast.error('Final post link is required to mark Posted');
      return;
    }
    const res = await fetch('/api/admin/content-production', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: item.id,
        finalPostUrl,
        status: markPosted ? 'POSTED' : item.status,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data?.error || 'Failed to update post link');
      return;
    }
    setItems((prev) => prev.map((entry) => (entry.id === data.id ? data : entry)));
    toast.success(markPosted ? 'Marked as Posted' : 'Post link saved');
  };

  const updateStatus = async (item: ContentItem, status: string) => {
    const postLinks = postLinkDrafts[item.id]?.links || parsePostLinks(item.finalPostUrl);
    const hasAnyPostLink = Object.values(postLinks || {}).some((value) => typeof value === 'string' && value.trim());
    if (status === 'POSTED' && !hasAnyPostLink) {
      toast.error('Add at least one post link before marking Posted');
      return;
    }
    const res = await fetch('/api/admin/content-production', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: item.id,
        status,
        ...(status === 'POSTED' ? { finalPostUrl: JSON.stringify(postLinks || {}) } : {}),
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data?.error || 'Failed to update status');
      return;
    }
    setItems((prev) => prev.map((entry) => (entry.id === data.id ? data : entry)));
    toast.success(`Status updated to ${status.replaceAll('_', ' ')}`);
  };


  const platformOptions: { key: PostPlatformKey; label: string }[] = [
    { key: 'instagram', label: 'Instagram' },
    { key: 'facebook', label: 'Facebook' },
    { key: 'youtubeShort', label: 'YouTube Short' },
    { key: 'youtubeVideo', label: 'YouTube Video' },
    { key: 'webBlog', label: 'Web Blog' },
    { key: 'gmb', label: 'Google Business Post' },
  ];

  const platformMeta: Record<PostPlatformKey, { label: string; color: string; Icon: typeof ExternalLink }> = {
    instagram: { label: 'Instagram', color: 'bg-pink-100 text-pink-700 border-pink-200', Icon: Instagram },
    facebook: { label: 'Facebook', color: 'bg-blue-100 text-blue-700 border-blue-200', Icon: Facebook },
    youtubeShort: { label: 'YouTube Short', color: 'bg-red-100 text-red-700 border-red-200', Icon: Youtube },
    youtubeVideo: { label: 'YouTube Video', color: 'bg-red-100 text-red-700 border-red-200', Icon: Youtube },
    webBlog: { label: 'Web Blog', color: 'bg-slate-100 text-slate-700 border-slate-200', Icon: ExternalLink },
    gmb: { label: 'GMB', color: 'bg-amber-100 text-amber-700 border-amber-200', Icon: ExternalLink },
  };

  const savePostLinks = async (itemId: string) => {
    const draft = postLinkDrafts[itemId];
    if (!draft) return;
    const res = await fetch('/api/admin/content-production', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: itemId,
        finalPostUrl: JSON.stringify(draft.links || {}),
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data?.error || 'Failed to save links');
      return;
    }
    setItems((prev) => prev.map((entry) => (entry.id === data.id ? data : entry)));
    toast.success('Post links updated');
    setActivePostLinkId(null);
  };

  const openPostLinks = (item: ContentItem) => {
    const parsed = parsePostLinks(item.finalPostUrl);
    setPostLinkDrafts((prev) => ({
      ...prev,
      [item.id]: {
        platform: prev[item.id]?.platform || 'instagram',
        link: '',
        links: Object.keys(parsed).length ? parsed : prev[item.id]?.links || {},
      },
    }));
    setActivePostLinkId(item.id);
  };

  return (
    <div className="gv-page">
      <section className="gv-hero flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Content Production</h1>
          <p className="mt-1 text-sm text-slate-500">Manage planning, approvals, publishing links, and client communications across channels.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <select
            suppressHydrationWarning
            value={timePreset}
            onChange={(e) => setTimePreset(e.target.value as TimePreset)}
            className="gv-input"
          >
            <option value="TODAY">Today</option>
            <option value="TOMORROW">Tomorrow</option>
            <option value="WEEKLY">Weekly</option>
            <option value="MONTHLY">Monthly</option>
            <option value="CUSTOM">Custom</option>
          </select>
          {timePreset === 'MONTHLY' && (
            <div className="relative">
              <Calendar className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <input
                suppressHydrationWarning
                type="month"
                className="gv-input py-2.5 pl-9 pr-3"
                value={monthFilter}
                onChange={(e) => setMonthFilter(e.target.value)}
              />
            </div>
          )}
          {timePreset === 'CUSTOM' && (
            <div className="flex items-center gap-2">
              <input
                suppressHydrationWarning
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="gv-input"
              />
              <span className="text-sm text-slate-500">to</span>
              <input
                suppressHydrationWarning
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="gv-input"
              />
            </div>
          )}
          <button
            onClick={() => setShowModal(true)}
            className="gv-button-primary"
          >
            <PlusSquare className="h-4 w-4" />
            New Item
          </button>
        </div>
      </section>

      <section className="gv-panel flex flex-wrap items-center gap-3">
        <div className="gv-panel-soft inline-flex items-center gap-2 px-3 py-2 text-sm text-slate-600">
          <Filter className="h-4 w-4" />
          Filters
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="gv-input py-2"
        >
          <option value="ALL">All Status</option>
          <option value="PENDING">Pending</option>
          <option value="SHARED_WITH_DOCTOR">Shared With Doctor</option>
          <option value="APPROVED">Approved</option>
          <option value="POSTED">Posted</option>
          <option value="RE_EDIT">Re - edit</option>
        </select>
        <select
          value={clientFilter}
          onChange={(e) => setClientFilter(e.target.value)}
          className="gv-input py-2"
        >
          <option value="ALL">All Clients</option>
          {clients.map((client) => (
            <option key={client.id} value={client.id}>{client.name}</option>
          ))}
        </select>
        <select
          value={editorFilter}
          onChange={(e) => setEditorFilter(e.target.value)}
          className="gv-input py-2"
        >
          <option value="ALL">All Editors</option>
          {editors.map((editor) => (
            <option key={editor.id} value={editor.id}>{editor.name || editor.email}</option>
          ))}
        </select>
      </section>

      <section className="gv-table-shell">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left">Client</th>
                <th className="px-4 py-3 text-left">Date</th>
                <th className="px-4 py-3 text-left">Platform</th>
                <th className="px-4 py-3 text-left">Topic</th>
                <th className="px-4 py-3 text-left">Editor</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Edited File</th>
                <th className="px-4 py-3 text-left">Post Link</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-6 text-center text-slate-500">
                    No content items found.
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => (
                  <tr key={item.id}>
                    <td className="px-4 py-3 text-slate-700">{item.client.name}</td>
                    <td className="px-4 py-3 text-slate-600">{new Date(item.scheduledDate).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-slate-700">{item.platform}</td>
                    <td className="px-4 py-3 text-slate-700">{item.topic}</td>
                    <td className="px-4 py-3 text-slate-600">{item.assignedEditor?.name || item.client.editor?.name || 'Unassigned'}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold uppercase ${statusClass(item.status)}`}>
                        {item.status.replaceAll('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {item.editedContentUrl ? (
                        <a href={item.editedContentUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-blue-600 hover:underline">
                          <ExternalLink className="h-4 w-4" />
                          View
                        </a>
                      ) : (
                        <span className="text-slate-400">Pending</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => openPostLinks(item)}
                          className="rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                        >
                          Add Post Link
                        </button>
                        {platformOptions.map((option) => {
                          const value = parsePostLinks(item.finalPostUrl)[option.key];
                          if (!value) return null;
                          const meta = platformMeta[option.key];
                          const Icon = meta.Icon;
                          return (
                            <a
                              key={option.key}
                              href={value}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-semibold ${meta.color}`}
                              title={`${meta.label} Post`}
                            >
                              <Icon className="h-3 w-3" />
                              {meta.label}
                            </a>
                          );
                        })}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-2">
                        <select
                          value={statusDrafts[item.id] || item.status}
                          onChange={(e) => setStatusDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))}
                          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700"
                        >
                          <option value="PENDING">Pending</option>
                          <option value="APPROVED">Approved</option>
                          <option value="SHARED_WITH_DOCTOR">Shared With Doctor</option>
                          <option value="POSTED">Posted</option>
                          <option value="RE_EDIT">Re - edit</option>
                        </select>
                        <button
                          onClick={() => updateStatus(item, statusDrafts[item.id] || item.status)}
                          className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs text-blue-700 hover:bg-blue-100"
                        >
                          Update
                        </button>
                        <button
                          onClick={() => openEdit(item)}
                          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(item)}
                          className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs text-rose-700 hover:bg-rose-100"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {loading && <div className="px-4 py-3 text-sm text-slate-500">Loading content plan...</div>}
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="gv-panel">
          <div className="mb-4 text-sm font-semibold text-slate-700">Today's WhatsApp Update</div>
          <div className="grid gap-3 md:grid-cols-3">
            <select
              value={summaryClientId}
              onChange={(e) => setSummaryClientId(e.target.value)}
              className="gv-input py-2"
            >
              <option value="">Select Client</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>{client.name}</option>
              ))}
            </select>
            <input
              type="date"
              value={summaryDate}
              onChange={(e) => setSummaryDate(e.target.value)}
              className="gv-input py-2"
            />
            <button
              onClick={generateSummary}
              className="gv-button-primary justify-center"
            >
              <CheckCircle className="h-4 w-4" />
              Generate
            </button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <select
              value={rewriteStyle}
              onChange={(e) => setRewriteStyle(e.target.value as RewriteStyle)}
              className="gv-input py-2"
            >
              <option value="PROFESSIONAL">Professional Rewrite</option>
              <option value="SHORT">Short Rewrite</option>
              <option value="FRIENDLY">Friendly Rewrite</option>
            </select>
            <button
              onClick={rewriteSummary}
              disabled={!summaryText || rewritingSummary}
              className="gv-button-muted justify-center disabled:opacity-50"
            >
              <Sparkles className="h-4 w-4" />
              {rewritingSummary ? 'Rewriting...' : 'AI Rewrite'}
            </button>
          </div>
          <div className="mt-4 rounded-[20px] border border-white/80 bg-white/72 p-4 text-sm text-slate-700 whitespace-pre-wrap min-h-[120px] shadow-inner">
            {summaryText || 'Generate a summary to share with clients.'}
          </div>
          <div className="mt-3 flex justify-end">
            <button
              onClick={copySummary}
              disabled={!summaryText}
              className="gv-button-muted disabled:opacity-50"
            >
              <ClipboardCopy className="h-4 w-4" />
              Copy WhatsApp Update
            </button>
          </div>
        </div>

        <div className="gv-panel">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-700">
            <CalendarRange className="h-4 w-4" />
            Status Overview
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="rounded-[20px] border border-white/80 bg-white/72 p-4">
              <div className="text-xs text-slate-500">Planned</div>
              <div className="mt-2 text-2xl font-semibold text-slate-900">{filteredItems.filter((i) => i.status === 'PLANNED').length}</div>
            </div>
            <div className="rounded-[20px] border border-blue-100/80 bg-blue-50/80 p-4">
              <div className="text-xs text-blue-700">In Editing</div>
              <div className="mt-2 text-2xl font-semibold text-blue-900">{filteredItems.filter((i) => i.status === 'IN_EDITING').length}</div>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <div className="text-xs text-amber-700">Ready for Review</div>
              <div className="mt-2 text-2xl font-semibold text-amber-900">{filteredItems.filter((i) => i.status === 'READY_FOR_REVIEW').length}</div>
            </div>
            <div className="rounded-xl border border-purple-200 bg-purple-50 p-4">
              <div className="text-xs text-purple-700">Approval</div>
              <div className="mt-2 text-2xl font-semibold text-purple-900">
                {filteredItems.filter((i) => i.status === 'SENT_FOR_APPROVAL' || i.status === 'APPROVED').length}
              </div>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <div className="text-xs text-emerald-700">Posted</div>
              <div className="mt-2 text-2xl font-semibold text-emerald-900">{filteredItems.filter((i) => i.status === 'POSTED').length}</div>
            </div>
          </div>
        </div>
      </section>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4">
          <div className="w-full max-w-2xl rounded-[28px] border border-white/80 bg-white/90 p-6 shadow-[0_30px_80px_-36px_rgba(15,23,42,0.4)] backdrop-blur-2xl">
            <h2 className="text-lg font-semibold text-slate-900">Plan Content</h2>
            <form onSubmit={handleCreate} className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-slate-700">Scheduled Date</label>
                <input
                  type="date"
                  value={form.scheduledDate}
                  onChange={(e) => setForm({ ...form, scheduledDate: e.target.value })}
                  className="gv-input mt-1 w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Client</label>
                <select
                  value={form.clientId}
                  onChange={(e) => setForm({ ...form, clientId: e.target.value })}
                  className="gv-input mt-1 w-full"
                >
                  <option value="">Select client</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>{client.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Platform</label>
                <select
                  value={form.platform}
                  onChange={(e) => setForm({ ...form, platform: e.target.value })}
                  className="gv-input mt-1 w-full"
                >
                  {platforms.map((platform) => (
                    <option key={platform}>{platform}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Assigned Editor</label>
                <select
                  value={form.assignedEditorId}
                  onChange={(e) => setForm({ ...form, assignedEditorId: e.target.value })}
                  className="gv-input mt-1 w-full"
                >
                  <option value="">Assign editor</option>
                  {editors.map((editor) => (
                    <option key={editor.id} value={editor.id}>{editor.name || editor.email}</option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-700">Content Topic</label>
                <input
                  value={form.topic}
                  onChange={(e) => setForm({ ...form, topic: e.target.value })}
                  className="gv-input mt-1 w-full"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-700">Notes</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={3}
                  className="gv-input mt-1 w-full"
                />
              </div>
              <div className="md:col-span-2 flex justify-end gap-2">
                <button type="button" onClick={() => setShowModal(false)} className="rounded-xl px-4 py-2 text-sm text-slate-600 hover:bg-slate-100">
                  Cancel
                </button>
                <button type="submit" className="gv-button-primary">
                  Save Plan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showEditModal && editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4">
          <div className="w-full max-w-3xl rounded-[28px] border border-white/80 bg-white/90 p-6 shadow-[0_30px_80px_-36px_rgba(15,23,42,0.4)] backdrop-blur-2xl">
            <h2 className="text-lg font-semibold text-slate-900">Update Content</h2>
            <form onSubmit={handleUpdate} className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-slate-700">Scheduled Date</label>
                <input
                  type="date"
                  value={editForm.scheduledDate}
                  onChange={(e) => setEditForm({ ...editForm, scheduledDate: e.target.value })}
                  className="gv-input mt-1 w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Client</label>
                <select
                  value={editForm.clientId}
                  onChange={(e) => setEditForm({ ...editForm, clientId: e.target.value })}
                  className="gv-input mt-1 w-full"
                >
                  <option value="">Select client</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>{client.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Platform</label>
                <select
                  value={editForm.platform}
                  onChange={(e) => setEditForm({ ...editForm, platform: e.target.value })}
                  className="gv-input mt-1 w-full"
                >
                  {platforms.map((platform) => (
                    <option key={platform}>{platform}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Assigned Editor</label>
                <select
                  value={editForm.assignedEditorId}
                  onChange={(e) => setEditForm({ ...editForm, assignedEditorId: e.target.value })}
                  className="gv-input mt-1 w-full"
                >
                  <option value="">Assign editor</option>
                  {editors.map((editor) => (
                    <option key={editor.id} value={editor.id}>{editor.name || editor.email}</option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-700">Content Topic</label>
                <input
                  value={editForm.topic}
                  onChange={(e) => setEditForm({ ...editForm, topic: e.target.value })}
                  className="gv-input mt-1 w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Status</label>
                <select
                  value={editForm.status}
                  onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                  className="gv-input mt-1 w-full"
                >
                  <option value="SENT_FOR_APPROVAL">Sent for Approval</option>
                  <option value="APPROVED">Approved</option>
                  <option value="POSTED">Posted</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Edited Content Link</label>
                <input
                  value={editForm.editedContentUrl}
                  onChange={(e) => setEditForm({ ...editForm, editedContentUrl: e.target.value })}
                  className="gv-input mt-1 w-full"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-700">Final Post Link</label>
                <input
                  value={editForm.finalPostUrl}
                  onChange={(e) => setEditForm({ ...editForm, finalPostUrl: e.target.value })}
                  className="gv-input mt-1 w-full"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-700">Notes</label>
                <textarea
                  value={editForm.notes}
                  onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                  rows={3}
                  className="gv-input mt-1 w-full"
                />
              </div>
              <div className="md:col-span-2 flex justify-end gap-2">
                <button type="button" onClick={() => setShowEditModal(false)} className="rounded-xl px-4 py-2 text-sm text-slate-600 hover:bg-slate-100">
                  Cancel
                </button>
                <button type="submit" className="gv-button-primary">
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {activePostLinkId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4">
          <div className="w-full max-w-md rounded-[28px] border border-white/80 bg-white/90 p-5 shadow-[0_30px_80px_-36px_rgba(15,23,42,0.4)] backdrop-blur-2xl">
            <div className="text-sm font-semibold text-slate-800">Add Post Link</div>
            <div className="mt-3 space-y-3">
              <div>
                <div className="text-xs font-semibold text-slate-600">Platform</div>
                <select
                  value={postLinkDrafts[activePostLinkId]?.platform || 'instagram'}
                  onChange={(e) =>
                    setPostLinkDrafts((prev) => ({
                      ...prev,
                      [activePostLinkId]: {
                        platform: e.target.value as PostPlatformKey,
                        link: prev[activePostLinkId]?.link || '',
                        links: prev[activePostLinkId]?.links || {},
                      },
                    }))
                  }
                  className="gv-input mt-1 w-full"
                >
                  {platformOptions.map((option) => (
                    <option key={option.key} value={option.key}>{option.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-600">Link</div>
                <input
                  value={postLinkDrafts[activePostLinkId]?.link || ''}
                  onChange={(e) =>
                    setPostLinkDrafts((prev) => ({
                      ...prev,
                      [activePostLinkId]: {
                        platform: prev[activePostLinkId]?.platform || 'instagram',
                        link: e.target.value,
                        links: prev[activePostLinkId]?.links || {},
                      },
                    }))
                  }
                  placeholder="Paste URL"
                  className="gv-input mt-1 w-full"
                />
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    const draft = postLinkDrafts[activePostLinkId];
                    const value = draft?.link?.trim();
                    if (!draft || !value) return;
                    setPostLinkDrafts((prev) => ({
                      ...prev,
                      [activePostLinkId]: {
                        ...draft,
                        links: { ...draft.links, [draft.platform]: value },
                        link: '',
                      },
                    }));
                  }}
                  className="gv-button-primary px-3 py-2 text-xs"
                >
                  Add Link
                </button>
              </div>
              <div className="space-y-2">
                {platformOptions.map((option) => {
                  const value = postLinkDrafts[activePostLinkId]?.links?.[option.key];
                  if (!value) return null;
                  return (
                    <div key={option.key} className="flex items-center justify-between rounded-[18px] border border-white/80 bg-white/80 px-3 py-2 text-xs">
                      <div>
                        <div className="font-semibold text-slate-700">{option.label}</div>
                        <div className="max-w-[220px] truncate text-slate-500">{value}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setPostLinkDrafts((prev) => ({
                            ...prev,
                            [activePostLinkId]: {
                              ...prev[activePostLinkId],
                              links: { ...prev[activePostLinkId]?.links, [option.key]: '' },
                            },
                          }))
                        }
                        className="text-rose-600 hover:underline"
                      >
                        Remove
                      </button>
                    </div>
                  );
                })}
                {(!postLinkDrafts[activePostLinkId] || Object.values(postLinkDrafts[activePostLinkId].links || {}).every((value) => !value)) && (
                  <div className="text-xs text-slate-500">No links added yet.</div>
                )}
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setActivePostLinkId(null)}
                  className="rounded-xl px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => savePostLinks(activePostLinkId)}
                  className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                >
                  Save Links
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
