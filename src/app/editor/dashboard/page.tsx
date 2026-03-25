'use client';

import { useState, useEffect, useMemo } from 'react';
import { ExternalLink, CheckCircle, Save, Filter } from 'lucide-react';
import toast from 'react-hot-toast';

interface Client {
  id: string;
  name: string;
}

interface CalendarEntry {
  id: string;
  date: string;
  videoTopic: string;
  platform: string;
  status: string;
  videoUrl: string | null;
  refVideo?: string | null;
  editedVideoUrl?: string | null;
  remarks?: string | null;
  attachmentUrl?: string | null;
  client: Client;
}

type TimePreset = 'TODAY' | 'TOMORROW' | 'WEEKLY' | 'MONTHLY' | 'CUSTOM';

function monthValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function dateValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function localDateKey(date: Date) {
  return dateValue(date);
}

function addDaysToDateKey(key: string, days: number) {
  const base = new Date(`${key}T00:00:00`);
  base.setDate(base.getDate() + days);
  return localDateKey(base);
}

export default function EditorDashboard() {
  const today = useMemo(() => new Date(), []);
  const todayValue = dateValue(today);
  const [assignments, setAssignments] = useState<CalendarEntry[]>([]);
  const [editedLinkDrafts, setEditedLinkDrafts] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [clientFilter, setClientFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [platformFilter, setPlatformFilter] = useState('ALL');
  const [timePreset, setTimePreset] = useState<TimePreset>('TODAY');
  const [monthFilter, setMonthFilter] = useState(monthValue(today));
  const [customStart, setCustomStart] = useState(todayValue);
  const [customEnd, setCustomEnd] = useState(todayValue);

  useEffect(() => {
    fetchAssignments();
  }, []);

  const fetchAssignments = async () => {
    try {
      const res = await fetch('/api/editor/assignments');
      const data = await res.json();
      if (!res.ok) {
        setAssignments([]);
        toast.error(data?.error || 'Failed to fetch assignments');
        return;
      }

      if (Array.isArray(data)) {
        setAssignments(data);
      } else {
        setAssignments([]);
        toast.error('Unexpected assignments response');
      }
    } catch (err) {
      setAssignments([]);
      toast.error('Failed to fetch assignments');
      console.error(err);
    }
  };

  useEffect(() => {
    setEditedLinkDrafts((prev) => {
      const next = { ...prev };
      assignments.forEach((item) => {
        if (typeof next[item.id] !== 'string') {
          next[item.id] = item.editedVideoUrl || '';
        }
      });
      return next;
    });
  }, [assignments]);

  const availableClients = useMemo(() => {
    const set = new Set<string>();
    assignments.forEach((entry) => set.add(entry.client.name));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [assignments]);

  const availablePlatforms = useMemo(() => {
    const set = new Set<string>();
    assignments.forEach((entry) => set.add(entry.platform));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [assignments]);

  const filteredAssignments = useMemo(() => {
    const q = search.trim().toLowerCase();
    return assignments.filter((entry) => {
      if (clientFilter !== 'ALL' && entry.client.name !== clientFilter) return false;
      if (statusFilter !== 'ALL' && entry.status.toUpperCase() !== statusFilter) return false;
      if (platformFilter !== 'ALL' && entry.platform !== platformFilter) return false;
      const entryDateKey = localDateKey(new Date(entry.date));
      if (timePreset === 'TODAY') {
        if (entryDateKey !== todayValue) return false;
      } else if (timePreset === 'TOMORROW') {
        if (entryDateKey !== addDaysToDateKey(todayValue, 1)) return false;
      } else if (timePreset === 'WEEKLY') {
        const endKey = addDaysToDateKey(todayValue, 6);
        if (entryDateKey < todayValue || entryDateKey > endKey) return false;
      } else if (timePreset === 'MONTHLY') {
        if (!entryDateKey.startsWith(`${monthFilter}-`)) return false;
      } else {
        if (!customStart || !customEnd) return false;
        if (customStart > customEnd) return false;
        if (entryDateKey < customStart || entryDateKey > customEnd) return false;
      }
      if (!q) return true;
      return (
        entry.client.name.toLowerCase().includes(q) ||
        entry.videoTopic.toLowerCase().includes(q) ||
        entry.platform.toLowerCase().includes(q) ||
        (entry.videoUrl || '').toLowerCase().includes(q) ||
        (entry.editedVideoUrl || '').toLowerCase().includes(q) ||
        (entry.remarks || '').toLowerCase().includes(q) ||
        (entry.attachmentUrl || '').toLowerCase().includes(q)
      );
    });
  }, [assignments, clientFilter, customEnd, customStart, monthFilter, platformFilter, search, statusFilter, timePreset, todayValue]);

  const updateEditedLink = async (item: CalendarEntry) => {
    const editedVideoUrl = (editedLinkDrafts[item.id] || '').trim();
    if (!editedVideoUrl) {
      toast.error('Edited video link is required');
      return;
    }
    setSavingId(item.id);
    try {
      const res = await fetch('/api/editor/assignments', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: item.id,
          editedVideoUrl,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data?.error || 'Failed to update edited link');
        return;
      }

      toast.success('Edited link saved and task completed');
      setAssignments((prev) =>
        prev.map((entry) =>
          entry.id === item.id ? { ...entry, editedVideoUrl, status: data.status || entry.status } : entry
        )
      );
    } catch (error) {
      toast.error('Failed to update edited link');
      console.error(error);
    } finally {
      setSavingId(null);
    }
  };

  const markComplete = async (item: CalendarEntry) => {
    const editedVideoUrl = (editedLinkDrafts[item.id] || '').trim();
    if (!editedVideoUrl) {
      toast.error('Edited video link is required to mark complete');
      return;
    }
    setCompletingId(item.id);
    try {
      const res = await fetch('/api/editor/assignments', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, status: 'COMPLETED', editedVideoUrl }),
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data?.error || 'Failed to mark complete');
        return;
      }

      toast.success('Task marked as complete!');
      setAssignments((prev) =>
        prev.map((entry) =>
          entry.id === item.id ? { ...entry, status: 'COMPLETED', editedVideoUrl } : entry
        )
      );
    } catch (error) {
      toast.error('Failed to mark complete');
      console.error(error);
    } finally {
      setCompletingId(null);
    }
  };

  return (
    <div className="gv-page">
      <section className="gv-hero">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Assignment Desk</h1>
        <p className="mt-1 text-sm text-slate-500">Review instructions, reference assets, and deliver final edited links without visual clutter.</p>
      </section>
      <div className="gv-panel">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-1 items-center gap-2">
            <div className="gv-panel-soft flex items-center gap-2 px-3 py-2 text-sm text-slate-500">
              <Filter className="h-4 w-4" />
              Filters
            </div>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search client, topic, platform, links..."
              className="gv-input w-full min-w-[240px]"
            />
          </div>
          <select
            value={clientFilter}
            onChange={(e) => setClientFilter(e.target.value)}
            className="gv-input min-w-[160px]"
          >
            <option value="ALL">All Clients</option>
            {availableClients.map((client) => (
              <option key={client} value={client}>
                {client}
              </option>
            ))}
          </select>
          <select
            value={platformFilter}
            onChange={(e) => setPlatformFilter(e.target.value)}
            className="gv-input min-w-[160px]"
          >
            <option value="ALL">All Platforms</option>
            {availablePlatforms.map((platform) => (
              <option key={platform} value={platform}>
                {platform}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="gv-input min-w-[140px]"
          >
            <option value="ALL">All Status</option>
            <option value="PENDING">PENDING</option>
            <option value="ASSIGNED">ASSIGNED</option>
            <option value="COMPLETED">COMPLETED</option>
          </select>
          <select
            value={timePreset}
            onChange={(e) => setTimePreset(e.target.value as TimePreset)}
            className="gv-input min-w-[140px]"
          >
            <option value="TODAY">Today</option>
            <option value="TOMORROW">Tomorrow</option>
            <option value="WEEKLY">Weekly</option>
            <option value="MONTHLY">Monthly</option>
            <option value="CUSTOM">Custom</option>
          </select>
          {timePreset === 'MONTHLY' && (
            <input
              type="month"
              value={monthFilter}
              onChange={(e) => setMonthFilter(e.target.value)}
              className="gv-input"
            />
          )}
          {timePreset === 'CUSTOM' && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="gv-input"
              />
              <span className="text-xs text-slate-400">to</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="gv-input"
              />
            </div>
          )}
        </div>
      </div>
      <div className="gv-table-shell">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left">Client</th>
                <th className="px-4 py-3 text-left">Date</th>
                <th className="px-4 py-3 text-left">Topic</th>
                <th className="px-4 py-3 text-left">Instruction</th>
                <th className="px-4 py-3 text-left">Platform</th>
                <th className="px-4 py-3 text-left">Reference Video</th>
                <th className="px-4 py-3 text-left">Attachment</th>
                <th className="px-4 py-3 text-left">Original Video</th>
                <th className="px-4 py-3 text-left">Edited Video Link</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredAssignments.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-4 py-8 text-center text-slate-500">
                    No assignments match your filters.
                  </td>
                </tr>
              ) : (
                filteredAssignments.map((item) => (
                  <tr key={item.id} className="align-top">
                    <td className="px-4 py-4 font-medium text-slate-900">{item.client.name}</td>
                    <td className="px-4 py-4 text-slate-600">{new Date(item.date).toLocaleDateString()}</td>
                    <td className="px-4 py-4 text-slate-700">{item.videoTopic}</td>
                    <td className="px-4 py-4 text-slate-600">{item.remarks || '-'}</td>
                    <td className="px-4 py-4 text-slate-600">{item.platform}</td>
                    <td className="px-4 py-4">
                      {item.refVideo ? (
                        <a
                          href={item.refVideo}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                        >
                          <ExternalLink className="h-4 w-4" />
                          Open
                        </a>
                      ) : (
                        <span className="text-slate-400">No link</span>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      {item.attachmentUrl ? (
                        <a
                          href={item.attachmentUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                        >
                          <ExternalLink className="h-4 w-4" />
                          Open
                        </a>
                      ) : (
                        <span className="text-slate-400">No file</span>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      {item.videoUrl ? (
                        <a
                          href={item.videoUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                        >
                          <ExternalLink className="h-4 w-4" />
                          Open
                        </a>
                      ) : (
                        <span className="text-slate-400">No link</span>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <div className="space-y-2">
                        <input
                          value={editedLinkDrafts[item.id] || ''}
                          onChange={(e) =>
                            setEditedLinkDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))
                          }
                          placeholder="Paste edited video link"
                          className="gv-input w-64"
                        />
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => updateEditedLink(item)}
                            disabled={savingId === item.id}
                            className="gv-button-muted px-3 py-1.5 text-xs disabled:opacity-60"
                          >
                            <Save className="h-3.5 w-3.5" />
                            {savingId === item.id ? 'Saving...' : 'Save Link'}
                          </button>
                          {item.editedVideoUrl ? (
                            <a
                              href={item.editedVideoUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                              Open Edited
                            </a>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                          item.status === 'COMPLETED' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'
                        }`}
                      >
                        {item.status}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-right">
                      {item.status !== 'COMPLETED' ? (
                        <button
                          onClick={() => markComplete(item)}
                          disabled={completingId === item.id}
                          className="gv-button-primary px-3 py-2 text-xs disabled:opacity-60"
                        >
                          <CheckCircle className="h-4 w-4" />
                          {completingId === item.id ? 'Completing...' : 'Complete'}
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400">Completed</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
