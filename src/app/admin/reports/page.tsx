'use client';

import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Calendar,
  Download,
  FileSpreadsheet,
  Loader2,
  Sparkles,
  Upload,
  WandSparkles,
} from 'lucide-react';
import toast from 'react-hot-toast';

type ReportsResponse = {
  summary: {
    total: number;
    completed: number;
    assigned: number;
    pending: number;
    completionRate: number;
  };
  byStatus: Record<string, number>;
  postingSummary: {
    total: number;
    byPlatform: Record<string, number>;
  };
  detailedEntries: {
    id: string;
    date: string;
    clientName: string;
    platform: string;
    status: string;
    editorName: string;
    videoLink?: string | null;
    editedVideoLink?: string | null;
    remarks?: string | null;
  }[];
  postingEntries: {
    id: string;
    date: string;
    clientName: string;
    platform: string;
    status: string;
    topic: string;
    postLink?: string | null;
    socialManagerName: string;
    source?: 'SYSTEM' | 'MANUAL';
  }[];
};

type TimePreset = 'TODAY' | 'WEEKLY' | 'MONTHLY' | 'CUSTOM';

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

function buildPeriodLabel(timePreset: TimePreset, monthFilter: string, customStart: string, customEnd: string, todayValue: string, today: Date) {
  if (timePreset === 'MONTHLY') return monthFilter;
  if (timePreset === 'CUSTOM') return `${customStart} to ${customEnd}`;
  if (timePreset === 'WEEKLY') return `${todayValue} to ${dateValue(addDays(today, 6))}`;
  return todayValue;
}

function buildQueryString(timePreset: TimePreset, monthFilter: string, customStart: string, customEnd: string, todayValue: string, today: Date) {
  if (timePreset === 'TODAY') {
    return `date=${todayValue}`;
  }
  if (timePreset === 'WEEKLY') {
    return `start=${todayValue}&end=${dateValue(addDays(today, 6))}`;
  }
  if (timePreset === 'MONTHLY') {
    const [yearStr, monthStr] = monthFilter.split('-');
    return `month=${Number(monthStr)}&year=${Number(yearStr)}`;
  }
  if (!customStart || !customEnd || customStart > customEnd) {
    return '';
  }
  return `start=${customStart}&end=${customEnd}`;
}

export default function ReportsPage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const today = useMemo(() => new Date(), []);
  const todayValue = dateValue(today);
  const [timePreset, setTimePreset] = useState<TimePreset>('MONTHLY');
  const [monthFilter, setMonthFilter] = useState(monthValue(today));
  const [customStart, setCustomStart] = useState(todayValue);
  const [customEnd, setCustomEnd] = useState(todayValue);
  const [clientFilter, setClientFilter] = useState('ALL');
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
  const [reports, setReports] = useState<ReportsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [overviewDraft, setOverviewDraft] = useState('');
  const [overviewBusy, setOverviewBusy] = useState(false);

  const queryString = useMemo(
    () => buildQueryString(timePreset, monthFilter, customStart, customEnd, todayValue, today),
    [customEnd, customStart, monthFilter, timePreset, today, todayValue]
  );

  const activePeriodLabel = useMemo(
    () => buildPeriodLabel(timePreset, monthFilter, customStart, customEnd, todayValue, today),
    [customEnd, customStart, monthFilter, timePreset, today, todayValue]
  );

  const fetchClients = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/clients', { cache: 'no-store' });
      const data = await res.json();
      if (res.ok && Array.isArray(data)) {
        setClients(data);
      }
    } catch {
      // no-op
    }
  }, []);

  const fetchReports = useCallback(async () => {
    if (!queryString) {
      setReports(null);
      return;
    }

    setLoading(true);
    try {
      const clientQuery = clientFilter !== 'ALL' ? `&clientId=${encodeURIComponent(clientFilter)}` : '';
      const res = await fetch(`/api/admin/reports?${queryString}${clientQuery}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error || 'Unable to load reporting data');
        setReports(null);
        return;
      }
      setReports(data);
    } catch {
      toast.error('Unable to load reporting data');
      setReports(null);
    } finally {
      setLoading(false);
    }
  }, [clientFilter, queryString]);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  useEffect(() => {
    setOverviewDraft('');
  }, [clientFilter, activePeriodLabel]);

  const selectedClientName = clients.find((client) => client.id === clientFilter)?.name || 'Select a client';
  const postingEntries = reports?.postingEntries || [];
  const detailedEntries = reports?.detailedEntries || [];
  const postingSummary = reports?.postingSummary || { total: 0, byPlatform: {} };
  const statusSummary = Object.entries(reports?.byStatus || {});
  const platformSummary = Object.entries(postingSummary.byPlatform || {});

  const generateOverview = async (mode: 'GENERATE' | 'REFINE') => {
    if (clientFilter === 'ALL') {
      toast.error('Select a client first');
      return;
    }
    if (!queryString) {
      toast.error('Select a valid reporting period');
      return;
    }
    if (mode === 'REFINE' && !overviewDraft.trim()) {
      toast.error('Enter a draft before using AI refinement');
      return;
    }

    setOverviewBusy(true);
    try {
      const res = await fetch(`/api/admin/reports/overview?${queryString}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: clientFilter,
          mode,
          text: overviewDraft,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error || 'Unable to generate executive summary');
        return;
      }
      setOverviewDraft(data.text || '');
    } catch {
      toast.error('Unable to generate executive summary');
    } finally {
      setOverviewBusy(false);
    }
  };

  const triggerManualUpload = () => {
    if (clientFilter === 'ALL') {
      toast.error('Select a client before uploading manual work');
      return;
    }
    fileInputRef.current?.click();
  };

  const handleManualUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (clientFilter === 'ALL') {
      toast.error('Select a client before uploading manual work');
      return;
    }

    const formData = new FormData();
    formData.append('clientId', clientFilter);
    formData.append('file', file);

    setUploading(true);
    try {
      const res = await fetch('/api/admin/reports/import-csv', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error || 'Unable to import CSV');
        return;
      }
      const skipped = Array.isArray(data?.skipped) ? data.skipped.length : 0;
      toast.success(
        skipped ? `Imported ${data.createdEntries} rows and skipped ${skipped}` : `Imported ${data.createdEntries} rows`
      );
      await fetchReports();
    } catch {
      toast.error('Unable to import CSV');
    } finally {
      setUploading(false);
    }
  };

  const downloadTemplate = () => {
    window.location.href = '/api/admin/reports/template';
  };

  const downloadPostingCsv = () => {
    if (clientFilter === 'ALL') {
      toast.error('Select a client first');
      return;
    }
    if (!postingEntries.length) {
      toast.error('No reporting records available');
      return;
    }

    const escapeCsv = (value: string) => {
      if (/[",\n]/.test(value)) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    };

    const rows = [
      ['Date', 'Platform', 'Published By', 'Live Link', 'Operational Notes', 'Record Source'],
      ...postingEntries.map((entry) => [
        new Date(entry.date).toLocaleDateString(),
        entry.platform,
        entry.socialManagerName,
        entry.postLink || '',
        entry.topic || '',
        entry.source || 'SYSTEM',
      ]),
    ];

    const csv = `${rows.map((row) => row.map((cell) => escapeCsv(String(cell))).join(',')).join('\n')}\n`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${selectedClientName.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-report-${activePeriodLabel.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const downloadClientPdfReport = async () => {
    if (clientFilter === 'ALL') {
      toast.error('Select a client first');
      return;
    }
    if (!queryString) {
      toast.error('Select a valid reporting period');
      return;
    }

    try {
      const res = await fetch(`/api/admin/reports/client-pdf?${queryString}&clientId=${encodeURIComponent(clientFilter)}&ts=${Date.now()}`, {
        cache: 'no-store',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data?.error || 'Unable to generate PDF');
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${selectedClientName.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-executive-report-${activePeriodLabel.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Unable to generate PDF');
    }
  };

  const metricCards = [
    {
      label: 'Production Items',
      value: reports?.summary.total ?? 0,
      accent: 'from-sky-500/85 via-cyan-400/70 to-white',
      text: 'Content Production records in scope',
    },
    {
      label: 'Published Deliverables',
      value: postingSummary.total,
      accent: 'from-emerald-500/85 via-teal-400/70 to-white',
      text: 'Live links available for client reporting',
    },
    {
      label: 'Active Workflow',
      value: reports?.summary.assigned ?? 0,
      accent: 'from-amber-400/90 via-orange-300/70 to-white',
      text: 'Items currently under production review',
    },
    {
      label: 'Completion Ratio',
      value: `${reports?.summary.completionRate ?? 0}%`,
      accent: 'from-fuchsia-500/80 via-pink-400/70 to-white',
      text: 'Published vs total production scope',
    },
  ];

  return (
    <div className="min-h-screen space-y-6 bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.18),_transparent_24%),radial-gradient(circle_at_top_right,_rgba(236,72,153,0.14),_transparent_22%),linear-gradient(180deg,_#eef4ff_0%,_#f7f9fc_46%,_#ffffff_100%)] p-1">
      <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleManualUpload} />

      <section className="relative overflow-hidden rounded-[32px] border border-white/70 bg-white/65 p-6 shadow-[0_20px_70px_-28px_rgba(15,23,42,0.35)] backdrop-blur-2xl">
        <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-r from-sky-500/16 via-white to-fuchsia-500/14" />
        <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/80 bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500 shadow-sm">
              <FileSpreadsheet className="h-3.5 w-3.5 text-sky-500" />
              Reporting Studio
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl">
              Client reporting with executive-grade presentation
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
              Generate a polished delivery dashboard from Content Production records, combine manual submissions when required,
              and prepare a branded report package with AI-assisted executive language.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:w-[520px]">
            <div className="rounded-[24px] border border-white/80 bg-white/80 p-4 shadow-sm backdrop-blur">
              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Client Account</div>
              <div className="mt-2 text-lg font-semibold text-slate-900">{selectedClientName}</div>
            </div>
            <div className="rounded-[24px] border border-white/80 bg-white/80 p-4 shadow-sm backdrop-blur">
              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Reporting Window</div>
              <div className="mt-2 text-lg font-semibold text-slate-900">{activePeriodLabel}</div>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[32px] border border-white/70 bg-white/65 p-6 shadow-[0_20px_70px_-28px_rgba(15,23,42,0.3)] backdrop-blur-2xl">
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={timePreset}
              onChange={(event) => setTimePreset(event.target.value as TimePreset)}
              className="rounded-2xl border border-white/70 bg-white/85 px-4 py-3 text-sm font-medium text-slate-700 shadow-sm outline-none"
            >
              <option value="TODAY">Daily view</option>
              <option value="WEEKLY">Weekly view</option>
              <option value="MONTHLY">Monthly view</option>
              <option value="CUSTOM">Custom range</option>
            </select>
            {timePreset === 'MONTHLY' && (
              <div className="relative">
                <Calendar className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
                <input
                  type="month"
                  value={monthFilter}
                  onChange={(event) => setMonthFilter(event.target.value)}
                  className="rounded-2xl border border-white/70 bg-white/85 py-3 pl-9 pr-4 text-sm font-medium text-slate-700 shadow-sm outline-none"
                />
              </div>
            )}
            {timePreset === 'CUSTOM' && (
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="date"
                  value={customStart}
                  onChange={(event) => setCustomStart(event.target.value)}
                  className="rounded-2xl border border-white/70 bg-white/85 px-4 py-3 text-sm font-medium text-slate-700 shadow-sm outline-none"
                />
                <span className="text-sm text-slate-500">to</span>
                <input
                  type="date"
                  value={customEnd}
                  onChange={(event) => setCustomEnd(event.target.value)}
                  className="rounded-2xl border border-white/70 bg-white/85 px-4 py-3 text-sm font-medium text-slate-700 shadow-sm outline-none"
                />
              </div>
            )}
            <select
              value={clientFilter}
              onChange={(event) => setClientFilter(event.target.value)}
              className="rounded-2xl border border-white/70 bg-white/85 px-4 py-3 text-sm font-medium text-slate-700 shadow-sm outline-none"
            >
              <option value="ALL">Select client</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
            <div className="ml-auto inline-flex items-center gap-2 rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white shadow-lg shadow-slate-900/20">
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              {loading ? 'Refreshing records' : 'Synced to Content Production'}
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={triggerManualUpload}
              disabled={uploading || clientFilter === 'ALL'}
              className="inline-flex items-center gap-2 rounded-2xl border border-white/80 bg-white/85 px-4 py-3 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-white disabled:opacity-50"
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Upload Manual Records
            </button>
            <button
              onClick={downloadTemplate}
              className="inline-flex items-center gap-2 rounded-2xl border border-white/80 bg-white/85 px-4 py-3 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-white"
            >
              <Download className="h-4 w-4" />
              Download CSV Template
            </button>
            <button
              onClick={downloadPostingCsv}
              disabled={clientFilter === 'ALL' || postingEntries.length === 0}
              className="inline-flex items-center gap-2 rounded-2xl border border-white/80 bg-white/85 px-4 py-3 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-white disabled:opacity-50"
            >
              <FileSpreadsheet className="h-4 w-4" />
              Export CSV
            </button>
            <button
              onClick={downloadClientPdfReport}
              disabled={clientFilter === 'ALL'}
              className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-slate-900 to-slate-700 px-4 py-3 text-sm font-medium text-white shadow-lg shadow-slate-900/20 transition hover:opacity-95 disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              Export PDF
            </button>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {metricCards.map((card) => (
          <div
            key={card.label}
            className={`rounded-[28px] border border-white/70 bg-gradient-to-br ${card.accent} p-5 shadow-[0_18px_50px_-30px_rgba(15,23,42,0.5)]`}
          >
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-700/80">{card.label}</div>
            <div className="mt-3 text-4xl font-semibold tracking-tight text-slate-900">{card.value}</div>
            <div className="mt-2 text-sm text-slate-700/75">{card.text}</div>
          </div>
        ))}
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-[32px] border border-white/70 bg-white/65 p-6 shadow-[0_20px_70px_-28px_rgba(15,23,42,0.3)] backdrop-blur-2xl">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-sky-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-sky-700">
                <WandSparkles className="h-3.5 w-3.5" />
                Executive Summary
              </div>
              <h2 className="mt-3 text-xl font-semibold text-slate-900">AI-assisted client narrative</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                Generate a professional report overview from live reporting records, or refine your own draft with the configured Gemini key.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => generateOverview('GENERATE')}
                disabled={overviewBusy || clientFilter === 'ALL'}
                className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-sky-600 to-cyan-500 px-4 py-3 text-sm font-medium text-white shadow-lg shadow-sky-500/20 transition hover:opacity-95 disabled:opacity-50"
              >
                {overviewBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Generate Summary
              </button>
              <button
                onClick={() => generateOverview('REFINE')}
                disabled={overviewBusy || clientFilter === 'ALL' || !overviewDraft.trim()}
                className="inline-flex items-center gap-2 rounded-2xl border border-white/80 bg-white/85 px-4 py-3 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-white disabled:opacity-50"
              >
                <WandSparkles className="h-4 w-4" />
                Refine Draft
              </button>
            </div>
          </div>

          <div className="mt-5 rounded-[28px] border border-white/80 bg-gradient-to-br from-white to-slate-50 p-4 shadow-inner">
            <textarea
              value={overviewDraft}
              onChange={(event) => setOverviewDraft(event.target.value)}
              placeholder="Executive summary will appear here. You can edit it manually, then use Refine Draft for a more polished client-facing version."
              className="min-h-[220px] w-full resize-none rounded-[24px] border border-slate-200 bg-white/90 p-4 text-sm leading-7 text-slate-700 outline-none"
            />
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-[32px] border border-white/70 bg-white/65 p-6 shadow-[0_20px_70px_-28px_rgba(15,23,42,0.3)] backdrop-blur-2xl">
            <h2 className="text-xl font-semibold text-slate-900">Platform Distribution</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Published links and approved manual submissions included in the client-facing package.
            </p>
            <div className="mt-5 space-y-3">
              {platformSummary.length ? (
                platformSummary.map(([platform, count], index) => (
                  <div key={platform} className="rounded-[24px] border border-white/80 bg-white/85 p-4 shadow-sm">
                    <div className="flex items-center justify-between gap-3 text-sm font-medium text-slate-700">
                      <span>{platform}</span>
                      <span>{count}</span>
                    </div>
                    <div className="mt-3 h-2.5 rounded-full bg-slate-100">
                      <div
                        className={`h-2.5 rounded-full ${
                          index % 4 === 0
                            ? 'bg-sky-500'
                            : index % 4 === 1
                              ? 'bg-emerald-500'
                              : index % 4 === 2
                                ? 'bg-fuchsia-500'
                                : 'bg-amber-500'
                        }`}
                        style={{ width: `${postingSummary.total ? (count / postingSummary.total) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-[24px] border border-dashed border-slate-200 bg-white/70 p-5 text-sm text-slate-500">
                  No published links are available for the selected range.
                </div>
              )}
            </div>
          </div>

          <div className="rounded-[32px] border border-white/70 bg-white/65 p-6 shadow-[0_20px_70px_-28px_rgba(15,23,42,0.3)] backdrop-blur-2xl">
            <h2 className="text-xl font-semibold text-slate-900">Workflow Status</h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {statusSummary.length ? (
                statusSummary.map(([status, count]) => (
                  <div key={status} className="rounded-full border border-white/80 bg-white/85 px-3 py-2 text-sm text-slate-700 shadow-sm">
                    <span className="font-semibold">{count}</span> {status.replace(/_/g, ' ')}
                  </div>
                ))
              ) : (
                <div className="text-sm text-slate-500">No workflow records available.</div>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[32px] border border-white/70 bg-white/65 p-6 shadow-[0_20px_70px_-28px_rgba(15,23,42,0.3)] backdrop-blur-2xl">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Publishing Ledger</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Date-wise delivery register sourced from Content Production, with manual record uploads merged where needed.
            </p>
          </div>
          <div className="text-sm text-slate-500">{postingEntries.length} records</div>
        </div>

        <div className="mt-5 overflow-x-auto rounded-[28px] border border-white/80 bg-white/85 shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50/90 text-[11px] uppercase tracking-[0.2em] text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left">Date</th>
                <th className="px-4 py-3 text-left">Platform</th>
                <th className="px-4 py-3 text-left">Published By</th>
                <th className="px-4 py-3 text-left">Live Link</th>
                <th className="px-4 py-3 text-left">Operational Note</th>
                <th className="px-4 py-3 text-left">Source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {postingEntries.map((entry) => (
                <tr key={entry.id} className="align-top text-slate-700">
                  <td className="px-4 py-4">{new Date(entry.date).toLocaleDateString()}</td>
                  <td className="px-4 py-4">{entry.platform}</td>
                  <td className="px-4 py-4">{entry.socialManagerName}</td>
                  <td className="max-w-[320px] px-4 py-4">
                    {entry.postLink ? (
                      <a href={entry.postLink} target="_blank" rel="noreferrer" className="break-all text-sky-700 hover:underline">
                        {entry.postLink}
                      </a>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td className="max-w-[260px] px-4 py-4">{entry.topic || '-'}</td>
                  <td className="px-4 py-4">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                        entry.source === 'MANUAL' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                      }`}
                    >
                      {entry.source === 'MANUAL' ? 'Manual' : 'System'}
                    </span>
                  </td>
                </tr>
              ))}
              {postingEntries.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                    No published records available for the selected client and reporting window.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-[32px] border border-white/70 bg-white/65 p-6 shadow-[0_20px_70px_-28px_rgba(15,23,42,0.3)] backdrop-blur-2xl">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Production Register</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Detailed production records retained for internal review, operational validation, and client escalations.
            </p>
          </div>
          <div className="text-sm text-slate-500">{detailedEntries.length} items</div>
        </div>

        <div className="mt-5 overflow-x-auto rounded-[28px] border border-white/80 bg-white/85 shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50/90 text-[11px] uppercase tracking-[0.2em] text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left">Date</th>
                <th className="px-4 py-3 text-left">Platform</th>
                <th className="px-4 py-3 text-left">Workflow Stage</th>
                <th className="px-4 py-3 text-left">Editor</th>
                <th className="px-4 py-3 text-left">Notes</th>
                <th className="px-4 py-3 text-left">Edited Asset</th>
                <th className="px-4 py-3 text-left">Final Link</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {detailedEntries.map((entry) => (
                <tr key={entry.id} className="align-top text-slate-700">
                  <td className="px-4 py-4">{new Date(entry.date).toLocaleDateString()}</td>
                  <td className="px-4 py-4">{entry.platform}</td>
                  <td className="px-4 py-4">{entry.status.replace(/_/g, ' ')}</td>
                  <td className="px-4 py-4">{entry.editorName}</td>
                  <td className="max-w-[300px] px-4 py-4">{entry.remarks || '-'}</td>
                  <td className="px-4 py-4">
                    {entry.editedVideoLink ? (
                      <a href={entry.editedVideoLink} target="_blank" rel="noreferrer" className="text-sky-700 hover:underline">
                        View asset
                      </a>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td className="px-4 py-4">
                    {entry.videoLink ? (
                      <a href={entry.videoLink} target="_blank" rel="noreferrer" className="text-sky-700 hover:underline">
                        View link
                      </a>
                    ) : (
                      '-'
                    )}
                  </td>
                </tr>
              ))}
              {detailedEntries.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                    No production records available for the selected filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
