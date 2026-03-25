'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bell,
  CalendarDays,
  CalendarRange,
  CheckSquare2,
  CirclePlus,
  Download,
  ExternalLink,
  Filter,
  Instagram,
  MoreVertical,
  RefreshCw,
  Search,
  Users,
  Youtube,
} from 'lucide-react';
import toast from 'react-hot-toast';

type CalendarEntry = {
  id: string;
  date: string;
  videoTopic: string;
  videoLink?: string | null;
  videoUrl?: string | null;
  assignedEditor?: { id: string; name: string | null } | null;
  platform: string;
  status: string;
  client: {
    id: string;
    name: string;
    editor?: { name: string | null };
  };
};

type Client = { id: string };
type TimePreset = 'TODAY' | 'TOMORROW' | 'WEEKLY' | 'MONTHLY' | 'CUSTOM';

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

function formatDate(date: string) {
  return new Date(date).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function statusClass(status: string) {
  const value = status.toUpperCase();
  if (value === 'COMPLETED') return 'bg-green-100 text-green-700';
  if (value === 'ASSIGNED') return 'bg-blue-100 text-blue-700';
  if (value === 'PENDING') return 'bg-amber-100 text-amber-700';
  return 'bg-slate-100 text-slate-700';
}

function platformClass(platform: string) {
  const value = platform.toLowerCase();
  if (value.includes('instagram')) return 'bg-pink-100 text-pink-700';
  if (value.includes('youtube')) return 'bg-red-100 text-red-700';
  if (value.includes('facebook')) return 'bg-blue-100 text-blue-700';
  if (value.includes('linkedin')) return 'bg-sky-100 text-sky-700';
  return 'bg-indigo-100 text-indigo-700';
}

export default function AdminIndexPage() {
  const today = useMemo(() => new Date(), []);
  const todayValue = dateValue(today);
  const [timePreset, setTimePreset] = useState<TimePreset>('TODAY');
  const [monthFilter, setMonthFilter] = useState(monthValue(today));
  const [customStart, setCustomStart] = useState(todayValue);
  const [customEnd, setCustomEnd] = useState(todayValue);
  const [entries, setEntries] = useState<CalendarEntry[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'ASSIGNED' | 'COMPLETED'>('ALL');
  const [page, setPage] = useState(1);
  const rowsPerPage = 5;

  const fetchDashboard = useCallback(async () => {
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
          setEntries([]);
          setLoading(false);
          return;
        }
        query = `start=${customStart}&end=${customEnd}`;
      }

      const [calendarRes, clientsRes] = await Promise.all([
        fetch(`/api/admin/calendar?${query}`),
        fetch('/api/admin/clients'),
      ]);

      const [calendarData, clientsData] = await Promise.all([calendarRes.json(), clientsRes.json()]);

      if (!calendarRes.ok) {
        setEntries([]);
        toast.error(calendarData?.error || 'Failed to load dashboard tasks');
      } else {
        setEntries(Array.isArray(calendarData) ? calendarData : []);
      }

      if (!clientsRes.ok) {
        setClients([]);
      } else {
        setClients(Array.isArray(clientsData) ? clientsData : []);
      }
    } catch {
      setEntries([]);
      setClients([]);
      toast.error('Failed to load dashboard tasks');
    } finally {
      setLoading(false);
    }
  }, [customEnd, customStart, monthFilter, timePreset, today, todayValue]);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  const totalEntries = entries.length;
  const assignedCount = useMemo(() => {
    return entries.filter((entry) => String(entry.status).toUpperCase() === 'ASSIGNED').length;
  }, [entries]);
  const pendingCount = useMemo(() => {
    return entries.filter((entry) => String(entry.status).toUpperCase() === 'PENDING').length;
  }, [entries]);
  const completedCount = useMemo(() => {
    return entries.filter((entry) => String(entry.status).toUpperCase() === 'COMPLETED').length;
  }, [entries]);

  const dueTodayCount = useMemo(() => {
    const now = new Date();
    return entries.filter((entry) => isSameDay(new Date(entry.date), now)).length;
  }, [entries]);

  const platformCounts = useMemo(() => {
    const counts = {
      instagram: 0,
      facebook: 0,
      youtubeLong: 0,
      youtubeShort: 0,
      linkedin: 0,
      other: 0,
    };
    for (const entry of entries) {
      const p = String(entry.platform || '').toLowerCase();
      if (p === 'instagram') counts.instagram += 1;
      else if (p === 'facebook') counts.facebook += 1;
      else if (p === 'youtube - long') counts.youtubeLong += 1;
      else if (p === 'youtube - short') counts.youtubeShort += 1;
      else if (p === 'linkedin') counts.linkedin += 1;
      else counts.other += 1;
    }
    return counts;
  }, [entries]);
  const instagramProgress = totalEntries > 0 ? Math.round((platformCounts.instagram / totalEntries) * 100) : 0;

  const editorWise = useMemo(() => {
    const bucket: Record<string, number> = {};
    for (const entry of entries) {
      const name = entry.assignedEditor?.name || entry.client.editor?.name || 'Unassigned';
      bucket[name] = (bucket[name] || 0) + 1;
    }
    return Object.entries(bucket).sort((a, b) => b[1] - a[1]);
  }, [entries]);

  const periodLabel = useMemo(() => {
    if (timePreset === 'TODAY') return `Today (${todayValue})`;
    if (timePreset === 'TOMORROW') return `Tomorrow (${dateValue(addDays(today, 1))})`;
    if (timePreset === 'WEEKLY') return `Weekly (${todayValue} to ${dateValue(addDays(today, 6))})`;
    if (timePreset === 'MONTHLY') return `Monthly (${monthFilter})`;
    return `Custom (${customStart || 'N/A'} to ${customEnd || 'N/A'})`;
  }, [customEnd, customStart, monthFilter, timePreset, today, todayValue]);

  const filteredEntries = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    return entries.filter((entry) => {
      if (statusFilter !== 'ALL' && entry.status.toUpperCase() !== statusFilter) return false;
      if (!query) return true;
      const editorName = entry.assignedEditor?.name || entry.client.editor?.name || 'Unassigned';
      return (
        entry.client.name.toLowerCase().includes(query) ||
        editorName.toLowerCase().includes(query) ||
        String(entry.platform).toLowerCase().includes(query) ||
        String(entry.videoLink || entry.videoUrl || '').toLowerCase().includes(query)
      );
    });
  }, [entries, searchText, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredEntries.length / rowsPerPage));
  const pageEntries = useMemo(() => {
    const start = (page - 1) * rowsPerPage;
    return filteredEntries.slice(start, start + rowsPerPage);
  }, [filteredEntries, page]);

  useEffect(() => {
    if (page > totalPages) setPage(1);
  }, [page, totalPages]);

  const exportCsv = () => {
    const headers = ['Client Name', 'Video Link', 'Date', 'Assigned Editor', 'Platform', 'Status'];
    const rows = filteredEntries.map((entry) => [
      entry.client.name,
      entry.videoLink || entry.videoUrl || '',
      entry.date,
      entry.assignedEditor?.name || entry.client.editor?.name || 'Unassigned',
      entry.platform,
      entry.status,
    ]);
    const csv = [headers, ...rows]
      .map((line) => line.map((item) => `"${String(item).replaceAll('"', '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dashboard-tasks-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="gv-page">
      <section className="gv-hero">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[260px] flex-1">
            <Search className="pointer-events-none absolute left-4 top-3.5 h-4 w-4 text-slate-400" />
            <input
              value={searchText}
              onChange={(e) => {
                setSearchText(e.target.value);
                setPage(1);
              }}
              placeholder="Search clients, assignments or team members"
              className="gv-input w-full py-2.5 pl-10 pr-3"
            />
          </div>
          <button
            onClick={fetchDashboard}
            disabled={loading}
            className="gv-button-muted disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <Link
            href="/admin/task-board"
            className="gv-button-primary"
          >
            <CirclePlus className="h-4 w-4" />
            Add Task
          </Link>
          <button className="gv-button-muted px-3">
            <Bell className="h-4 w-4" />
          </button>
        </div>
      </section>

      <section className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Executive Overview</h1>
        <div className="gv-panel-soft flex items-center gap-2 px-3 py-2 text-sm text-slate-600">
          <CalendarRange className="h-4 w-4" />
          <select
            value={timePreset}
            onChange={(e) => setTimePreset(e.target.value as TimePreset)}
            className="bg-transparent outline-none"
          >
            <option value="TODAY">Today</option>
            <option value="TOMORROW">Tomorrow</option>
            <option value="WEEKLY">Last 7 Days</option>
            <option value="MONTHLY">Last 30 Days</option>
            <option value="CUSTOM">Custom</option>
          </select>
        </div>
      </section>

      {(timePreset === 'MONTHLY' || timePreset === 'CUSTOM') && (
        <section className="flex flex-wrap items-center gap-2">
          {timePreset === 'MONTHLY' && (
            <input
              type="month"
              value={monthFilter}
              onChange={(e) => setMonthFilter(e.target.value)}
              className="gv-input"
            />
          )}
          {timePreset === 'CUSTOM' && (
            <>
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="gv-input"
              />
              <span className="text-sm text-slate-500">to</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="gv-input"
              />
            </>
          )}
        </section>
      )}

      <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="gv-panel">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-medium text-slate-500">Total Tasks</p>
            <span className="rounded-lg bg-indigo-50 p-2 text-indigo-600"><CheckSquare2 className="h-4 w-4" /></span>
          </div>
          <p className="text-3xl font-semibold text-slate-900">{totalEntries}</p>
          <p className="mt-2 text-sm text-slate-500">Assigned: <span className="font-medium text-emerald-600">{assignedCount}</span> • Pending: <span className="font-medium text-amber-600">{pendingCount}</span></p>
        </div>

        <div className="gv-panel">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-medium text-slate-500">Instagram Tasks</p>
            <span className="rounded-lg bg-pink-50 p-2 text-pink-600"><Instagram className="h-4 w-4" /></span>
          </div>
          <p className="text-3xl font-semibold text-slate-900">{platformCounts.instagram}</p>
          <div className="mt-3 h-1.5 w-full rounded-full bg-slate-100">
            <div className="h-1.5 rounded-full bg-pink-500" style={{ width: `${instagramProgress}%` }} />
          </div>
          <p className="mt-2 text-sm text-slate-500">Share of tasks: <span className="font-medium text-slate-700">{instagramProgress}%</span></p>
        </div>

        <div className="gv-panel">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-medium text-slate-500">YouTube Tasks</p>
            <span className="rounded-lg bg-red-50 p-2 text-red-600"><Youtube className="h-4 w-4" /></span>
          </div>
          <p className="text-3xl font-semibold text-slate-900">{platformCounts.youtubeLong + platformCounts.youtubeShort}</p>
          <p className="mt-2 text-sm text-slate-500">Due today: <span className="font-medium text-slate-700">{dueTodayCount}</span></p>
        </div>

        <div className="gv-panel">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-medium text-slate-500">Editor Assignments</p>
            <span className="rounded-lg bg-emerald-50 p-2 text-emerald-600"><Users className="h-4 w-4" /></span>
          </div>
          <p className="text-3xl font-semibold text-slate-900">{editorWise.length} Active</p>
          <p className="mt-2 text-sm text-slate-500">Completed: <span className="font-medium text-emerald-600">{completedCount}</span></p>
        </div>
      </section>

      <section>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Task Board</h2>
            <p className="mt-1 text-sm text-slate-500">Live assignment register across the operations desk</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="gv-panel-soft flex items-center gap-2 px-3 py-2 shadow-none">
              <Filter className="h-4 w-4 text-slate-500" />
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value as 'ALL' | 'PENDING' | 'ASSIGNED' | 'COMPLETED');
                  setPage(1);
                }}
                className="text-sm text-slate-700 outline-none"
              >
                <option value="ALL">All</option>
                <option value="PENDING">Pending</option>
                <option value="ASSIGNED">Assigned</option>
                <option value="COMPLETED">Completed</option>
              </select>
            </div>
            <button onClick={exportCsv} className="gv-button-muted">
              <Download className="h-4 w-4" />
              Export
            </button>
          </div>
        </div>

        <section className="gv-table-shell">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Client Name</th>
                  <th className="px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Video Link</th>
                  <th className="px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Platform</th>
                  <th className="px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Status</th>
                  <th className="px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Assigned Editor</th>
                  <th className="px-5 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {pageEntries.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-10 text-center text-sm text-slate-500">
                      No tasks for selected range.
                    </td>
                  </tr>
                ) : (
                  pageEntries.map((entry, idx) => {
                    const editorName = entry.assignedEditor?.name || entry.client.editor?.name || 'Unassigned';
                    const initials = editorName
                      .split(' ')
                      .slice(0, 2)
                      .map((t) => t[0]?.toUpperCase() || '')
                      .join('');
                    return (
                      <tr key={entry.id} className="hover:bg-slate-50/70">
                        <td className="px-5 py-3">
                          <div className="text-base font-semibold text-slate-900">{entry.client.name}</div>
                          <div className="text-xs text-slate-500">{['Premium Plan', 'Basic Plan', 'Enterprise Plan'][idx % 3]}</div>
                        </td>
                        <td className="px-5 py-3 text-sm text-slate-700">
                          {(entry.videoLink || entry.videoUrl) ? (
                            <a
                              href={entry.videoLink || entry.videoUrl || '#'}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-blue-700 hover:underline"
                            >
                              {(entry.videoLink || entry.videoUrl || '').replace(/^https?:\/\//, '').slice(0, 26)}...
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          ) : (
                            <span className="text-slate-400">No Link</span>
                          )}
                        </td>
                        <td className="px-5 py-3">
                          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${platformClass(entry.platform)}`}>{entry.platform}</span>
                        </td>
                        <td className="px-5 py-3">
                          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold uppercase ${statusClass(entry.status)}`}>
                            {entry.status}
                          </span>
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2.5">
                            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-700">
                              {initials || 'U'}
                            </span>
                            <span className="text-sm text-slate-700">{editorName}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3 text-center">
                          <button className="inline-flex items-center justify-center rounded-lg p-1.5 text-slate-500 hover:bg-slate-100">
                            <MoreVertical className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between border-t border-slate-200 px-6 py-3 text-sm text-slate-500">
            <span>Showing {pageEntries.length} of {filteredEntries.length} tasks</span>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="rounded-lg border border-slate-200 px-2 py-1 disabled:opacity-40"
              >
                ‹
              </button>
              <span className="rounded-lg bg-blue-700 px-2.5 py-1 text-xs font-semibold text-white">{page}</span>
              {totalPages > 1 && <span className="text-xs text-slate-500">of {totalPages}</span>}
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="rounded-lg border border-slate-200 px-2 py-1 disabled:opacity-40"
              >
                ›
              </button>
            </div>
          </div>
        </section>
      </section>
    </div>
  );
}
