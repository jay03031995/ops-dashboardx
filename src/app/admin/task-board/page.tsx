'use client';

import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Calendar,
  Download,
  Facebook,
  Grid3X3,
  Instagram,
  LayoutGrid,
  Linkedin,
  Paperclip,
  Pencil,
  PlusSquare,
  RefreshCw,
  Search,
  SquarePlay,
  Table2,
  Upload,
  Youtube,
} from 'lucide-react';
import toast from 'react-hot-toast';

interface Client {
  id: string;
  name: string;
  editor?: { name: string | null };
}

interface Editor {
  id: string;
  name: string | null;
  email: string;
}

interface CalendarEntry {
  id: string;
  date: string;
  videoTopic: string;
  videoUrl?: string | null;
  videoLink?: string | null;
  editedVideoUrl?: string | null;
  refVideo?: string | null;
  remarks?: string | null;
  attachmentUrl?: string | null;
  assignedEditor?: { id: string; name: string | null } | null;
  platform: string;
  status: string;
  client: Client;
}

type TimePreset = 'TODAY' | 'TOMORROW' | 'WEEKLY' | 'MONTHLY' | 'CUSTOM';
type ActionFilter = 'ALL' | 'PENDING' | 'ASSIGNED' | 'COMPLETED';

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

function isSameDate(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function platformClass(platform: string) {
  const p = platform.toLowerCase();
  if (p === 'instagram') return 'bg-pink-100 text-pink-700';
  if (p === 'facebook') return 'bg-blue-100 text-blue-700';
  if (p === 'youtube - long') return 'bg-red-100 text-red-700';
  if (p === 'youtube - short') return 'bg-rose-100 text-rose-700';
  if (p === 'linkedin') return 'bg-sky-100 text-sky-700';
  if (p === 'youtube') return 'bg-red-100 text-red-700';
  return 'bg-slate-100 text-slate-700';
}

function platformIcon(platform: string) {
  const p = platform.toLowerCase();
  if (p === 'instagram') return Instagram;
  if (p === 'facebook') return Facebook;
  if (p === 'youtube - short') return SquarePlay;
  if (p === 'youtube - long' || p === 'youtube') return Youtube;
  if (p === 'linkedin') return Linkedin;
  return SquarePlay;
}

function statusClass(status: string) {
  const s = status.toUpperCase();
  if (s === 'COMPLETED') return 'bg-green-100 text-green-700';
  if (s === 'ASSIGNED') return 'bg-blue-100 text-blue-700';
  if (s === 'PENDING') return 'bg-amber-100 text-amber-700';
  return 'bg-slate-100 text-slate-700';
}

export default function CalendarPage() {
  const today = useMemo(() => new Date(), []);
  const todayValue = dateValue(today);
  const [monthFilter, setMonthFilter] = useState(monthValue(today));
  const [timePreset, setTimePreset] = useState<TimePreset>('TODAY');
  const [customStart, setCustomStart] = useState(todayValue);
  const [customEnd, setCustomEnd] = useState(todayValue);
  const [entries, setEntries] = useState<CalendarEntry[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [editors, setEditors] = useState<Editor[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [uploadingCsv, setUploadingCsv] = useState(false);
  const [search, setSearch] = useState('');
  const [clientFilter, setClientFilter] = useState('ALL');
  const [editorFilter, setEditorFilter] = useState('ALL');
  const [actionFilter, setActionFilter] = useState<ActionFilter>('ALL');
  const [viewMode, setViewMode] = useState<'table' | 'grid' | 'kanban'>('kanban');
  const [showModal, setShowModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [activeRemarkEntry, setActiveRemarkEntry] = useState<CalendarEntry | null>(null);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const [newEntry, setNewEntry] = useState({
    date: new Date().toISOString().split('T')[0],
    videoTopic: '',
    videoLink: '',
    editedVideoUrl: '',
    refVideo: '',
    remarks: '',
    attachmentUrl: '',
    platform: 'Instagram',
    clientId: '',
  });
  const [editingEntry, setEditingEntry] = useState({
    id: '',
    date: '',
    videoTopic: '',
    videoLink: '',
    editedVideoUrl: '',
    refVideo: '',
    remarks: '',
    attachmentUrl: '',
    platform: 'Instagram',
    status: 'PENDING',
    assignedEditorId: '',
    clientId: '',
  });
  const [bulkForm, setBulkForm] = useState({
    date: '',
    status: '',
    platform: '',
    assignedEditorId: '__UNCHANGED__',
  });
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadingAttachment, setUploadingAttachment] = useState<'new' | 'edit' | null>(null);

  const safeEntries = Array.isArray(entries) ? entries : [];
  const safeClients = Array.isArray(clients) ? clients : [];
  const safeEditors = Array.isArray(editors) ? editors : [];

  const fetchEntries = useCallback(async () => {
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
        if (!customStart || !customEnd) {
          setEntries([]);
          return;
        }
        if (customStart > customEnd) {
          setEntries([]);
          toast.error('Custom range is invalid');
          return;
        }
        query = `start=${customStart}&end=${customEnd}`;
      }

      const res = await fetch(`/api/admin/calendar?${query}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) {
        setEntries([]);
        toast.error(data?.error || 'Failed to fetch calendar entries');
        return;
      }
      if (Array.isArray(data)) {
        setEntries(data);
      } else {
        setEntries([]);
        toast.error('Unexpected calendar response');
      }
    } catch {
      setEntries([]);
      toast.error('Failed to fetch calendar entries');
    }
  }, [customEnd, customStart, monthFilter, timePreset, today, todayValue]);

  const fetchClients = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/clients', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) {
        setClients([]);
        toast.error(data?.error || 'Failed to fetch clients');
        return;
      }
      if (Array.isArray(data)) {
        setClients(data);
      } else {
        setClients([]);
      }
    } catch {
      setClients([]);
      toast.error('Failed to fetch clients');
    }
  }, []);

  const fetchEditors = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/editors', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) {
        setEditors([]);
        return;
      }
      setEditors(Array.isArray(data) ? data : []);
    } catch {
      setEditors([]);
    }
  }, []);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  useEffect(() => {
    fetchEditors();
  }, [fetchEditors]);

  const availableEditors = useMemo(() => {
    const set = new Set<string>();
    for (const entry of safeEntries) {
      set.add(entry.client.editor?.name || 'Unassigned');
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [safeEntries]);

  const filteredEntries = useMemo(() => {
    const q = search.trim().toLowerCase();
    return safeEntries.filter((entry) => {
      if (clientFilter !== 'ALL' && entry.client.id !== clientFilter) return false;
      const editorName = entry.client.editor?.name || 'Unassigned';
      if (editorFilter !== 'ALL' && editorName !== editorFilter) return false;
      if (actionFilter !== 'ALL' && entry.status.toUpperCase() !== actionFilter) return false;

      if (!q) return true;
      return (
        entry.client.name.toLowerCase().includes(q) ||
        (entry.videoLink || entry.videoUrl || '').toLowerCase().includes(q) ||
        (entry.editedVideoUrl || '').toLowerCase().includes(q) ||
        (entry.refVideo || '').toLowerCase().includes(q) ||
        (entry.remarks || entry.videoTopic || '').toLowerCase().includes(q) ||
        entry.platform.toLowerCase().includes(q) ||
        (entry.client.editor?.name || '').toLowerCase().includes(q)
      );
    });
  }, [actionFilter, clientFilter, editorFilter, safeEntries, search]);

  const visibleEntries = filteredEntries;
  const kanbanColumns = useMemo(
    () => ({
      PENDING: visibleEntries.filter((entry) => entry.status.toUpperCase() === 'PENDING'),
      ASSIGNED: visibleEntries.filter((entry) => entry.status.toUpperCase() === 'ASSIGNED'),
      COMPLETED: visibleEntries.filter((entry) => entry.status.toUpperCase() === 'COMPLETED'),
    }),
    [visibleEntries]
  );
  const selectedVisibleCount = useMemo(
    () => visibleEntries.filter((entry) => selectedIds.includes(entry.id)).length,
    [selectedIds, visibleEntries]
  );
  const allVisibleSelected = visibleEntries.length > 0 && selectedVisibleCount === visibleEntries.length;
  const todayEntries = safeEntries.filter((entry) => isSameDate(new Date(entry.date), today));
  const todayTotal = todayEntries.length;
  const todayAssignedCount = todayEntries.filter((entry) => entry.status === 'ASSIGNED').length;
  const todayPendingCount = todayEntries.filter((entry) => entry.status === 'PENDING').length;
  const todayCompletedCount = todayEntries.filter((entry) => entry.status === 'COMPLETED').length;
  const todayInstagramCount = todayEntries.filter((entry) => entry.platform.toLowerCase() === 'instagram').length;
  const todayYoutubeCount = todayEntries.filter((entry) => entry.platform.toLowerCase().startsWith('youtube')).length;
  const attachmentCount = useMemo(
    () => visibleEntries.filter((entry) => Boolean(entry.attachmentUrl)).length,
    [visibleEntries]
  );
  const editorTodayCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const entry of todayEntries) {
      const editorName = entry.client.editor?.name?.trim() || 'Unassigned';
      counts[editorName] = (counts[editorName] || 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [todayEntries]);
  const periodLabel = useMemo(() => {
    if (timePreset === 'TODAY') return `Today (${todayValue})`;
    if (timePreset === 'TOMORROW') return `Tomorrow (${dateValue(addDays(today, 1))})`;
    if (timePreset === 'WEEKLY') return `Weekly (${todayValue} to ${dateValue(addDays(today, 6))})`;
    if (timePreset === 'MONTHLY') return `Monthly (${monthFilter})`;
    return `Custom (${customStart || 'N/A'} to ${customEnd || 'N/A'})`;
  }, [customEnd, customStart, monthFilter, timePreset, today, todayValue]);

  useEffect(() => {
    const validIds = new Set(safeEntries.map((entry) => entry.id));
    setSelectedIds((prev) => prev.filter((id) => validIds.has(id)));
  }, [safeEntries]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch('/api/admin/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manual: true }),
      });
      const data = await res.json();
      if (res.ok) {
        if (data?.skipped) {
          toast(data?.message || 'Sync skipped');
        } else {
          toast.success(`Sync complete: ${data.results?.length || 0} processed`);
        }
      } else {
        toast.error(data?.error || 'Sync failed');
      }
    } catch {
      toast.error('Sync failed');
    } finally {
      setSyncing(false);
      fetchEntries();
    }
  };

  const handleCsvImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadingCsv(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/admin/calendar/import-csv', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error || 'Failed to import CSV');
        return;
      }

      const skippedCount = Array.isArray(data?.skipped) ? data.skipped.length : 0;
      toast.success(
        `CSV imported: ${data?.createdEntries || 0} tasks, ${data?.createdClients || 0} new clients` +
          (skippedCount ? `, ${skippedCount} skipped` : '')
      );

      await Promise.all([fetchEntries(), fetchClients()]);
    } catch {
      toast.error('Failed to import CSV');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
      setUploadingCsv(false);
    }
  };

  const uploadAttachment = async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch('/api/admin/calendar/upload-attachment', {
      method: 'POST',
      body: formData,
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data?.error || 'Failed to upload attachment');
    }
    return data.url as string;
  };

  const handleNewAttachment = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploadingAttachment('new');
    try {
      const url = await uploadAttachment(file);
      setNewEntry((prev) => ({ ...prev, attachmentUrl: url }));
      toast.success('Attachment uploaded');
    } catch (error: any) {
      toast.error(error?.message || 'Failed to upload attachment');
    } finally {
      setUploadingAttachment(null);
      event.target.value = '';
    }
  };

  const handleEditAttachment = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploadingAttachment('edit');
    try {
      const url = await uploadAttachment(file);
      setEditingEntry((prev) => ({ ...prev, attachmentUrl: url }));
      toast.success('Attachment uploaded');
    } catch (error: any) {
      toast.error(error?.message || 'Failed to upload attachment');
    } finally {
      setUploadingAttachment(null);
      event.target.value = '';
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      const res = await fetch('/api/admin/calendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newEntry),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error || 'Failed to add event');
        return;
      }
      toast.success('Entry added');
      setShowModal(false);
      setNewEntry({
        date: new Date().toISOString().split('T')[0],
        videoTopic: '',
        videoLink: '',
        editedVideoUrl: '',
        refVideo: '',
        remarks: '',
        attachmentUrl: '',
        platform: 'Instagram',
        clientId: '',
      });
      fetchEntries();
    } catch {
      toast.error('Failed to add event');
    }
  };

  const openEditEntry = (entry: CalendarEntry) => {
    setEditingEntry({
      id: entry.id,
      date: new Date(entry.date).toISOString().split('T')[0],
      videoTopic: entry.videoTopic || '',
      videoLink: entry.videoLink || entry.videoUrl || '',
      editedVideoUrl: entry.editedVideoUrl || '',
      refVideo: entry.refVideo || '',
      remarks: entry.remarks || '',
      attachmentUrl: entry.attachmentUrl || '',
      platform: entry.platform,
      status: entry.status || 'PENDING',
      assignedEditorId: entry.assignedEditor?.id || '',
      clientId: entry.client.id,
    });
    setShowEditModal(true);
  };

  const openRemarkDialog = (entry: CalendarEntry) => {
    setActiveRemarkEntry(entry);
  };

  const handleEditSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      const res = await fetch('/api/admin/calendar', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingEntry),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error || 'Failed to update entry');
        return;
      }
      setEntries((prev) =>
        prev.map((entry) =>
          entry.id === data.id
            ? {
                ...entry,
                ...data,
                client: data.client || entry.client,
              }
            : entry
        )
      );
      toast.success('Entry updated');
      setShowEditModal(false);
    } catch {
      toast.error('Failed to update entry');
    }
  };

  const handleDeleteEntry = async (id: string) => {
    const ok = window.confirm('Delete this task?');
    if (!ok) return;
    try {
      const res = await fetch(`/api/admin/calendar?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error || 'Failed to delete task');
        return;
      }
      setEntries((prev) => prev.filter((entry) => entry.id !== id));
      toast.success('Task deleted');
    } catch {
      toast.error('Failed to delete task');
    }
  };

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  const toggleSelectAllVisible = () => {
    if (allVisibleSelected) {
      const visibleSet = new Set(visibleEntries.map((entry) => entry.id));
      setSelectedIds((prev) => prev.filter((id) => !visibleSet.has(id)));
      return;
    }
    const combined = new Set<string>([...selectedIds, ...visibleEntries.map((entry) => entry.id)]);
    setSelectedIds(Array.from(combined));
  };

  const resetBulkState = () => {
    setShowBulkModal(false);
    setBulkForm({ date: '', status: '', platform: '', assignedEditorId: '__UNCHANGED__' });
  };

  const handleBulkUpdate = async () => {
    if (!selectedIds.length) return;
    if (!bulkForm.date && !bulkForm.status && !bulkForm.platform && bulkForm.assignedEditorId === '__UNCHANGED__') {
      toast.error('Choose at least one field to update');
      return;
    }

    setBulkUpdating(true);
    try {
      const selectedSet = new Set(selectedIds);
      const targetEntries = safeEntries.filter((entry) => selectedSet.has(entry.id));

      await Promise.all(
        targetEntries.map(async (entry) => {
          const payload: Record<string, string> = { id: entry.id };
          if (bulkForm.date) payload.date = bulkForm.date;
          if (bulkForm.status) payload.status = bulkForm.status;
          if (bulkForm.platform) payload.platform = bulkForm.platform;
          if (bulkForm.assignedEditorId !== '__UNCHANGED__') {
            payload.assignedEditorId = bulkForm.assignedEditorId === '__CLEAR__' ? '' : bulkForm.assignedEditorId;
          }

          const res = await fetch('/api/admin/calendar', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          if (!res.ok) throw new Error('bulk-update-failed');
        })
      );

      toast.success(`Updated ${selectedIds.length} task(s)`);
      setSelectedIds([]);
      resetBulkState();
      await fetchEntries();
    } catch {
      toast.error('Bulk update failed for one or more tasks');
    } finally {
      setBulkUpdating(false);
    }
  };

  const handleBulkDelete = async () => {
    if (!selectedIds.length) return;
    const ok = window.confirm(`Delete ${selectedIds.length} selected task(s)?`);
    if (!ok) return;

    setBulkUpdating(true);
    try {
      await Promise.all(
        selectedIds.map(async (id) => {
          const res = await fetch(`/api/admin/calendar?id=${encodeURIComponent(id)}`, {
            method: 'DELETE',
          });
          if (!res.ok) throw new Error('bulk-delete-failed');
        })
      );
      toast.success(`Deleted ${selectedIds.length} task(s)`);
      setSelectedIds([]);
      resetBulkState();
      await fetchEntries();
    } catch {
      toast.error('Bulk delete failed for one or more tasks');
    } finally {
      setBulkUpdating(false);
    }
  };

  return (
    <div className="gv-page">
      <section className="gv-hero flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Task Board</h1>
          <p className="mt-1 text-sm text-slate-500">Coordinate production requests, references, attachments, and delivery progress in one workspace.</p>
        </div>
        <div className="flex items-center gap-3">
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
            onClick={handleSync}
            disabled={syncing}
            className="gv-button-muted disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing' : 'Sync Now'}
          </button>
          <input
            suppressHydrationWarning
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={handleCsvImport}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingCsv}
            className="gv-button-muted disabled:opacity-60"
          >
            <Upload className="h-4 w-4" />
            {uploadingCsv ? 'Uploading CSV' : 'Upload CSV'}
          </button>
          <a
            href="/api/admin/calendar/template"
            download
            className="gv-button-muted"
          >
            <Download className="h-4 w-4" />
            Download Template
          </a>
          <button
            onClick={() => setShowModal(true)}
            className="gv-button-primary"
          >
            <PlusSquare className="h-4 w-4" />
            Add Task
          </button>
        </div>
      </section>

      <section className="gv-table-shell">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-slate-900">Task Board</h2>
            <div className="relative inline-flex h-8 w-8 items-center justify-center rounded-xl border border-white/80 bg-white/80 text-slate-600">
              <Paperclip className="h-4 w-4" />
              {attachmentCount > 0 && (
                <span className="absolute -right-1.5 -top-1.5 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-semibold text-white">
                  {attachmentCount}
                </span>
              )}
            </div>
            <div className="inline-flex rounded-2xl border border-white/80 bg-white/80 p-1">
              <button
                onClick={() => setViewMode('table')}
                className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold ${viewMode === 'table' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500'}`}
              >
                <Table2 className="h-3.5 w-3.5" />
                Table
              </button>
              <button
                onClick={() => setViewMode('kanban')}
                className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold ${viewMode === 'kanban' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500'}`}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                Kanban
              </button>
              <button
                onClick={() => setViewMode('grid')}
                className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold ${viewMode === 'grid' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500'}`}
              >
                <Grid3X3 className="h-3.5 w-3.5" />
                Grid
              </button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setShowBulkModal(true)}
              disabled={selectedIds.length === 0}
              className="gv-button-muted disabled:cursor-not-allowed disabled:opacity-50"
            >
              Bulk Edit ({selectedIds.length})
            </button>
            <select
              suppressHydrationWarning
              value={clientFilter}
              onChange={(e) => setClientFilter(e.target.value)}
              className="gv-input py-2"
            >
              <option value="ALL">All Clients</option>
              {safeClients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
            <select
              suppressHydrationWarning
              value={editorFilter}
              onChange={(e) => setEditorFilter(e.target.value)}
              className="gv-input py-2"
            >
              <option value="ALL">All Editors</option>
              {availableEditors.map((editorName) => (
                <option key={editorName} value={editorName}>
                  {editorName}
                </option>
              ))}
            </select>
            <select
              suppressHydrationWarning
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value as ActionFilter)}
              className="gv-input py-2"
            >
              <option value="ALL">All Actions</option>
              <option value="PENDING">Pending</option>
              <option value="ASSIGNED">Assigned</option>
              <option value="COMPLETED">Completed</option>
            </select>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                suppressHydrationWarning
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search tasks..."
                className="gv-input w-64 py-2 pl-9 pr-3"
              />
            </div>
          </div>
        </div>

        {viewMode === 'table' ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                    <input
                      suppressHydrationWarning
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={toggleSelectAllVisible}
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Client Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Video Link</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Edited Video</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Ref Video (Optional)</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Remarks</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Attachment</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Platform</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Editor</th>
                  <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-400">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {visibleEntries.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="px-6 py-6 text-center text-sm text-slate-500">No entries for selected range.</td>
                  </tr>
                ) : (
                  visibleEntries.map((entry) => (
                    <tr key={entry.id}>
                      <td className="px-4 py-4">
                        <input
                          suppressHydrationWarning
                          type="checkbox"
                          checked={selectedIds.includes(entry.id)}
                          onChange={() => toggleSelected(entry.id)}
                          className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                      </td>
                      <td className="px-6 py-4 text-sm font-medium text-slate-900">{entry.client.name}</td>
                      <td className="px-6 py-4 text-sm text-slate-700">
                        {(entry.videoLink || entry.videoUrl) ? (
                          <a
                            href={entry.videoLink || entry.videoUrl || '#'}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                          >
                            Open Link
                          </a>
                        ) : (
                          <span className="text-slate-400">No Link</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-700">
                        {entry.editedVideoUrl ? (
                          <a
                            href={entry.editedVideoUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                          >
                            Edited Link
                          </a>
                        ) : (
                          <span className="text-slate-400">No Link</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-700">
                        {entry.refVideo ? (
                          <a
                            href={entry.refVideo}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                          >
                            Open Ref
                          </a>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-700">
                        <button
                          type="button"
                          onClick={() => openRemarkDialog(entry)}
                          className="max-w-[360px] truncate text-left underline decoration-slate-300 underline-offset-2 hover:text-slate-900"
                          title={entry.remarks || entry.videoTopic || '-'}
                        >
                          {entry.remarks || entry.videoTopic || '-'}
                        </button>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-700">
                        {entry.attachmentUrl ? (
                          <a
                            href={entry.attachmentUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                          >
                            <Paperclip className="h-3.5 w-3.5" />
                            Attachment
                          </a>
                        ) : (
                          <span className="text-slate-400">No File</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <span className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold uppercase ${platformClass(entry.platform)}`}>
                          {(() => {
                            const Icon = platformIcon(entry.platform);
                            return <Icon className="h-3.5 w-3.5" />;
                          })()}
                          {entry.platform}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold uppercase ${statusClass(entry.status)}`}>
                          {entry.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-700">{entry.assignedEditor?.name || entry.client.editor?.name || 'Unassigned'}</td>
                      <td className="px-6 py-4 text-right">
                        <div className="inline-flex items-center gap-2">
                          <button
                            onClick={() => openEditEntry(entry)}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteEntry(entry.id)}
                            className="rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
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
        ) : viewMode === 'kanban' ? (
          <div className="overflow-x-auto p-4">
            <div className="grid min-w-[980px] grid-cols-3 gap-4">
              {([
                ['PENDING', kanbanColumns.PENDING, 'bg-amber-100 text-amber-700 border-amber-300'],
                ['ASSIGNED', kanbanColumns.ASSIGNED, 'bg-sky-100 text-sky-700 border-sky-300'],
                ['COMPLETED', kanbanColumns.COMPLETED, 'bg-emerald-100 text-emerald-700 border-emerald-300'],
              ] as const).map(([status, items, badgeClass]) => (
                <div key={status} className="rounded-[22px] border border-white/80 bg-white/60 p-3 backdrop-blur-xl">
                  <div className="mb-3 flex items-center justify-between">
                    <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${badgeClass}`}>{status}</span>
                    <span className="text-xs text-slate-500">{items.length} tasks</span>
                  </div>
                  <div className="space-y-3">
                    {items.length === 0 ? (
                      <div className="rounded-[18px] border border-dashed border-slate-300 bg-white/80 p-5 text-center text-xs text-slate-500">
                        No tasks
                      </div>
                    ) : (
                      items.map((entry) => (
                        <div key={entry.id} className="rounded-[18px] border border-white/80 bg-white/85 p-3 shadow-sm backdrop-blur">
                          <div className="mb-1 text-sm font-semibold text-slate-900">{entry.client.name}</div>
                          <div className="mb-2 text-xs text-slate-500">{new Date(entry.date).toLocaleDateString()}</div>
                          <button
                            type="button"
                            onClick={() => openRemarkDialog(entry)}
                            className="mb-2 line-clamp-2 text-left text-xs text-slate-500 underline decoration-slate-300 underline-offset-2 hover:text-slate-700"
                            title={entry.remarks || entry.videoTopic || '-'}
                          >
                            {entry.remarks || entry.videoTopic || '-'}
                          </button>
                          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
                            <span className={`inline-flex items-center gap-1 rounded-md px-2 py-1 font-semibold uppercase ${platformClass(entry.platform)}`}>
                              {(() => {
                                const Icon = platformIcon(entry.platform);
                                return <Icon className="h-3.5 w-3.5" />;
                              })()}
                              {entry.platform}
                            </span>
                            <label className="inline-flex items-center gap-1 text-slate-500">
                              <input
                                suppressHydrationWarning
                                type="checkbox"
                                checked={selectedIds.includes(entry.id)}
                                onChange={() => toggleSelected(entry.id)}
                                className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600"
                              />
                              Select
                            </label>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                              <button
                              onClick={() => openEditEntry(entry)}
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              Edit
                            </button>
                            <button
                              onClick={() => handleDeleteEntry(entry.id)}
                              className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-100"
                            >
                              Delete
                            </button>
                            {(entry.videoLink || entry.videoUrl) ? (
                              <a
                                href={entry.videoLink || entry.videoUrl || '#'}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                              >
                                Link
                              </a>
                            ) : null}
                            {entry.refVideo ? (
                              <a
                                href={entry.refVideo}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                              >
                                Ref
                              </a>
                            ) : null}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-2 xl:grid-cols-3">
            {visibleEntries.length === 0 ? (
              <div className="col-span-full rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
                No entries for selected range.
              </div>
            ) : (
              visibleEntries.map((entry) => (
                <div key={entry.id} className="rounded-[20px] border border-white/80 bg-white/85 p-4 shadow-sm backdrop-blur">
                  <div className="mb-2 flex items-center justify-end">
                    <label className="inline-flex items-center gap-2 text-xs text-slate-500">
                      <input
                        suppressHydrationWarning
                        type="checkbox"
                        checked={selectedIds.includes(entry.id)}
                        onChange={() => toggleSelected(entry.id)}
                        className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      Select
                    </label>
                  </div>
                  <div className="text-sm font-medium text-slate-900">{entry.client.name}</div>
                  <div className="mt-1 text-sm text-slate-600">
                    {(entry.videoLink || entry.videoUrl) ? (
                      <a
                        href={entry.videoLink || entry.videoUrl || '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline decoration-slate-300 underline-offset-2 hover:text-slate-900"
                      >
                        Open Video Link
                      </a>
                    ) : (
                      'No video link'
                    )}
                  </div>
                  <div className="mt-1 text-sm text-slate-600">
                    {entry.editedVideoUrl ? (
                      <a
                        href={entry.editedVideoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline decoration-slate-300 underline-offset-2 hover:text-slate-900"
                      >
                        Edited Video Link
                      </a>
                    ) : (
                      'No edited link'
                    )}
                  </div>
                  <div className="mt-2 text-xs text-slate-500">
                    Ref Video:{' '}
                    {entry.refVideo ? (
                      <a
                        href={entry.refVideo}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline decoration-slate-300 underline-offset-2 hover:text-slate-900"
                      >
                        Open Ref Link
                      </a>
                    ) : (
                      '-'
                    )}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    Remarks:{' '}
                    <button
                      type="button"
                      onClick={() => openRemarkDialog(entry)}
                      className="underline decoration-slate-300 underline-offset-2 hover:text-slate-900"
                    >
                      View full remark
                    </button>
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    Attachment:{' '}
                    {entry.attachmentUrl ? (
                      <a href={entry.attachmentUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline">
                        <Paperclip className="h-3.5 w-3.5" />
                        Open Attachment
                      </a>
                    ) : (
                      'No File'
                    )}
                  </div>
                  <div className="mt-3 flex items-center gap-2 text-xs">
                    <span className={`inline-flex items-center gap-1 rounded-md px-2 py-1 font-semibold uppercase ${platformClass(entry.platform)}`}>
                      {(() => {
                        const Icon = platformIcon(entry.platform);
                        return <Icon className="h-3.5 w-3.5" />;
                      })()}
                      {entry.platform}
                    </span>
                    <span className={`rounded-full px-2 py-1 font-semibold uppercase ${statusClass(entry.status)}`}>{entry.status}</span>
                  </div>
                  <div className="mt-3 text-xs text-slate-500">Editor: {entry.assignedEditor?.name || entry.client.editor?.name || 'Unassigned'}</div>
                  <div className="mt-3 flex items-center gap-2">
                    <button
                      onClick={() => openEditEntry(entry)}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Edit
                    </button>
                    <button
                      onClick={() => handleDeleteEntry(entry.id)}
                      className="rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        <div className="flex items-center justify-between border-t border-slate-200 px-6 py-3 text-sm text-slate-500">
          <span>Showing {visibleEntries.length} of {filteredEntries.length} task entries</span>
          <span>{periodLabel}</span>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="gv-panel">
          <div className="mb-3 text-xs font-medium uppercase tracking-wider text-slate-500">
            Today's Tasks
          </div>
          <div className="text-3xl font-semibold text-slate-900">{todayTotal}</div>
          <p className="mt-2 text-sm text-slate-500">Assigned: {todayAssignedCount} • Pending: {todayPendingCount} • Completed: {todayCompletedCount}</p>
        </div>

        <div className="gv-panel">
          <div className="mb-3 text-xs font-medium uppercase tracking-wider text-slate-500">
            Platform Summary (Today)
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600">Instagram Tasks</span>
              <span className="font-semibold text-slate-900">{todayInstagramCount}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600">YouTube Tasks</span>
              <span className="font-semibold text-slate-900">{todayYoutubeCount}</span>
            </div>
          </div>
        </div>

        <div className="gv-panel">
          <div className="mb-3 text-xs font-medium uppercase tracking-wider text-slate-500">
            Editor-wise Assignment (Today)
          </div>
          {editorTodayCounts.length === 0 ? (
            <p className="text-sm text-slate-500">No tasks for today.</p>
          ) : (
            <div className="space-y-2">
              {editorTodayCounts.map(([editor, count]) => (
                <div key={editor} className="flex items-center justify-between text-sm">
                  <span className="truncate text-slate-600">{editor}</span>
                  <span className="font-semibold text-slate-900">{count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {showBulkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4">
          <div className="w-full max-w-md rounded-[28px] border border-white/80 bg-white/90 p-6 shadow-[0_30px_80px_-36px_rgba(15,23,42,0.4)] backdrop-blur-2xl">
            <h2 className="text-lg font-semibold text-slate-900">Bulk Edit Tasks</h2>
            <p className="mt-1 text-sm text-slate-500">
              Selected tasks: <span className="font-medium text-slate-800">{selectedIds.length}</span>
            </p>
            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700">Date</label>
                <input
                  suppressHydrationWarning
                  type="date"
                  value={bulkForm.date}
                  onChange={(e) => setBulkForm((prev) => ({ ...prev, date: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-slate-200 p-2.5"
                />
                <p className="mt-1 text-xs text-slate-500">Leave blank to keep existing dates unchanged.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Status</label>
                <select
                  suppressHydrationWarning
                  value={bulkForm.status}
                  onChange={(e) => setBulkForm((prev) => ({ ...prev, status: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-slate-200 p-2.5"
                >
                  <option value="">No Change</option>
                  <option value="PENDING">PENDING</option>
                  <option value="ASSIGNED">ASSIGNED</option>
                  <option value="COMPLETED">COMPLETED</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Platform</label>
                <select
                  suppressHydrationWarning
                  value={bulkForm.platform}
                  onChange={(e) => setBulkForm((prev) => ({ ...prev, platform: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-slate-200 p-2.5"
                >
                  <option value="">No Change</option>
                  <option>Instagram</option>
                  <option>Facebook</option>
                  <option>Youtube - Long</option>
                  <option>Youtube - Short</option>
                  <option>Linkedin</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Reassign Editor</label>
                <select
                  suppressHydrationWarning
                  value={bulkForm.assignedEditorId}
                  onChange={(e) => setBulkForm((prev) => ({ ...prev, assignedEditorId: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-slate-200 p-2.5"
                >
                  <option value="__UNCHANGED__">No Change</option>
                  <option value="__CLEAR__">Use Client Mapping</option>
                  {safeEditors.map((editor) => (
                    <option key={editor.id} value={editor.id}>
                      {editor.name || editor.email}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={handleBulkDelete}
                disabled={bulkUpdating || selectedIds.length === 0}
                className="rounded-xl border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
              >
                Delete Selected
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={resetBulkState}
                  disabled={bulkUpdating}
                  className="rounded-xl px-4 py-2 text-sm text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleBulkUpdate}
                  disabled={bulkUpdating || selectedIds.length === 0}
                  className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
                >
                  {bulkUpdating ? 'Updating...' : 'Apply Bulk Update'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4">
          <div className="w-full max-w-4xl rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Add Task</h2>
                <p className="mt-1 text-sm text-slate-500">Split view keeps essentials and media details separate.</p>
              </div>
            </div>
            <form onSubmit={handleSubmit} className="mt-5 grid gap-6 lg:grid-cols-2">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700">Date</label>
                  <input
                    suppressHydrationWarning
                    type="date"
                    required
                    value={newEntry.date}
                    onChange={(e) => setNewEntry({ ...newEntry, date: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 p-2.5"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Client</label>
                  <select
                    suppressHydrationWarning
                    required
                    value={newEntry.clientId}
                    onChange={(e) => setNewEntry({ ...newEntry, clientId: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 p-2.5"
                  >
                    <option value="">Select client</option>
                    {safeClients.map((client) => (
                      <option key={client.id} value={client.id}>{client.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Platform</label>
                  <select
                    suppressHydrationWarning
                    value={newEntry.platform}
                    onChange={(e) => setNewEntry({ ...newEntry, platform: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 p-2.5"
                  >
                    <option>Instagram</option>
                    <option>Facebook</option>
                    <option>Youtube - Long</option>
                    <option>Youtube - Short</option>
                    <option>Linkedin</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Remarks</label>
                  <input
                    suppressHydrationWarning
                    value={newEntry.remarks}
                    onChange={(e) => setNewEntry({ ...newEntry, remarks: e.target.value, videoTopic: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 p-2.5"
                  />
                </div>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700">Video Link</label>
                  <input
                    suppressHydrationWarning
                    value={newEntry.videoLink}
                    onChange={(e) => setNewEntry({ ...newEntry, videoLink: e.target.value, videoTopic: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 p-2.5"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Ref Video (Optional)</label>
                  <input
                    suppressHydrationWarning
                    value={newEntry.refVideo}
                    onChange={(e) => setNewEntry({ ...newEntry, refVideo: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 p-2.5"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Attachment (jpg, png, pdf)</label>
                  <input
                    suppressHydrationWarning
                    type="file"
                    accept=".jpg,.jpeg,.png,.pdf"
                    onChange={handleNewAttachment}
                    className="mt-1 w-full rounded-xl border border-slate-200 p-2.5"
                  />
                  <div className="mt-1 text-xs text-slate-500">
                    {uploadingAttachment === 'new'
                      ? 'Uploading attachment...'
                      : newEntry.attachmentUrl
                        ? `Attached: ${newEntry.attachmentUrl}`
                        : 'No attachment'}
                  </div>
                  {newEntry.attachmentUrl && (
                    <a
                      href={newEntry.attachmentUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-flex items-center gap-1 text-xs text-blue-700 hover:underline"
                    >
                      <Paperclip className="h-3.5 w-3.5" />
                      Open uploaded attachment
                    </a>
                  )}
                </div>
              </div>
              <div className="lg:col-span-2 flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="rounded-xl px-4 py-2 text-sm text-slate-600 hover:bg-slate-100">
                  Cancel
                </button>
                <button type="submit" className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800">
                  Save Task
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4">
          <div className="w-full max-w-5xl rounded-2xl bg-white p-6 shadow-xl">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Edit Task</h2>
              <p className="mt-1 text-sm text-slate-500">Details on the left, media and assignment controls on the right.</p>
            </div>
            <form onSubmit={handleEditSubmit} className="mt-5 grid gap-6 lg:grid-cols-2">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700">Date</label>
                  <input
                    suppressHydrationWarning
                    type="date"
                    required
                    value={editingEntry.date}
                    onChange={(e) => setEditingEntry({ ...editingEntry, date: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 p-2.5"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Client</label>
                  <select
                    suppressHydrationWarning
                    required
                    value={editingEntry.clientId}
                    onChange={(e) => setEditingEntry({ ...editingEntry, clientId: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 p-2.5"
                  >
                    <option value="">Select client</option>
                    {safeClients.map((client) => (
                      <option key={client.id} value={client.id}>
                        {client.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Platform</label>
                  <select
                    suppressHydrationWarning
                    value={editingEntry.platform}
                    onChange={(e) => setEditingEntry({ ...editingEntry, platform: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 p-2.5"
                  >
                    <option>Instagram</option>
                    <option>Facebook</option>
                    <option>Youtube - Long</option>
                    <option>Youtube - Short</option>
                    <option>Linkedin</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Remarks</label>
                  <textarea
                    suppressHydrationWarning
                    value={editingEntry.remarks}
                    onChange={(e) => setEditingEntry({ ...editingEntry, remarks: e.target.value, videoTopic: e.target.value })}
                    rows={5}
                    className="mt-1 w-full rounded-xl border border-slate-200 p-2.5"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Status</label>
                  <select
                    suppressHydrationWarning
                    value={editingEntry.status}
                    onChange={(e) => setEditingEntry({ ...editingEntry, status: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 p-2.5"
                  >
                    <option value="PENDING">PENDING</option>
                    <option value="ASSIGNED">ASSIGNED</option>
                    <option value="COMPLETED">COMPLETED</option>
                  </select>
                </div>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700">Video Link</label>
                  <input
                    suppressHydrationWarning
                    value={editingEntry.videoLink}
                    onChange={(e) => setEditingEntry({ ...editingEntry, videoLink: e.target.value, videoTopic: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 p-2.5"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Edited Video Link (Editor Only)</label>
                  <input
                    suppressHydrationWarning
                    value={editingEntry.editedVideoUrl}
                    onChange={(e) => setEditingEntry({ ...editingEntry, editedVideoUrl: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 p-2.5"
                  />
                  {editingEntry.editedVideoUrl ? (
                    <a
                      href={editingEntry.editedVideoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-flex items-center gap-1 text-xs text-blue-700 hover:underline"
                    >
                      Open edited link
                    </a>
                  ) : null}
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Ref Video (Optional)</label>
                  <input
                    suppressHydrationWarning
                    value={editingEntry.refVideo}
                    onChange={(e) => setEditingEntry({ ...editingEntry, refVideo: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 p-2.5"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Attachment (jpg, png, pdf)</label>
                  <input
                    suppressHydrationWarning
                    type="file"
                    accept=".jpg,.jpeg,.png,.pdf"
                    onChange={handleEditAttachment}
                    className="mt-1 w-full rounded-xl border border-slate-200 p-2.5"
                  />
                  <div className="mt-1 text-xs text-slate-500">
                    {uploadingAttachment === 'edit'
                      ? 'Uploading attachment...'
                      : editingEntry.attachmentUrl
                        ? `Attached: ${editingEntry.attachmentUrl}`
                        : 'No attachment'}
                  </div>
                  {editingEntry.attachmentUrl && (
                    <a
                      href={editingEntry.attachmentUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-flex items-center gap-1 text-xs text-blue-700 hover:underline"
                    >
                      <Paperclip className="h-3.5 w-3.5" />
                      Open uploaded attachment
                    </a>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Reassign Editor</label>
                  <select
                    suppressHydrationWarning
                    value={editingEntry.assignedEditorId}
                    onChange={(e) => setEditingEntry({ ...editingEntry, assignedEditorId: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 p-2.5"
                  >
                    <option value="">Use Client Mapping</option>
                    {safeEditors.map((editor) => (
                      <option key={editor.id} value={editor.id}>
                        {editor.name || editor.email}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="lg:col-span-2 flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowEditModal(false)} className="rounded-xl px-4 py-2 text-sm text-slate-600 hover:bg-slate-100">
                  Cancel
                </button>
                <button type="submit" className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800">
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {activeRemarkEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Remark Details</h2>
                <p className="mt-1 text-sm text-slate-500">{activeRemarkEntry.client.name}</p>
              </div>
              <button
                type="button"
                onClick={() => setActiveRemarkEntry(null)}
                className="rounded-xl px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"
              >
                Close
              </button>
            </div>
            <div className="mt-5 space-y-4">
              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Full Remark</div>
                <div className="max-h-[320px] overflow-y-auto whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                  {activeRemarkEntry.remarks || activeRemarkEntry.videoTopic || '-'}
                </div>
              </div>
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs text-slate-500">
                  Ref Video:{' '}
                  {activeRemarkEntry.refVideo ? (
                    <a
                      href={activeRemarkEntry.refVideo}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline decoration-slate-300 underline-offset-2 hover:text-slate-900"
                    >
                      Open Ref Link
                    </a>
                  ) : (
                    '-'
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setActiveRemarkEntry(null);
                    openEditEntry(activeRemarkEntry);
                  }}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  <Pencil className="h-4 w-4" />
                  Edit Task
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
