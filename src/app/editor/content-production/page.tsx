'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle, ExternalLink, Save } from 'lucide-react';
import toast from 'react-hot-toast';

type ContentItem = {
  id: string;
  scheduledDate: string;
  topic: string;
  platform: string;
  status: string;
  editedContentUrl?: string | null;
  finalPostUrl?: string | null;
  client: { id: string; name: string };
};

export default function EditorContentProductionPage() {
  const [items, setItems] = useState<ContentItem[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    try {
      const res = await fetch('/api/editor/content-production', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error || 'Failed to load content tasks');
        return;
      }
      const list = Array.isArray(data.items) ? data.items : [];
      setItems(list);
      setDrafts((prev) => {
        const next = { ...prev };
        list.forEach((item: ContentItem) => {
          if (typeof next[item.id] !== 'string') {
            next[item.id] = item.editedContentUrl || '';
          }
        });
        return next;
      });
    } catch {
      toast.error('Failed to load content tasks');
    }
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const updateItem = async (item: ContentItem, markReady = false, statusOverride?: string) => {
    const editedContentUrl = (drafts[item.id] || '').trim();
    if (markReady && !editedContentUrl) {
      toast.error('Edited content link is required');
      return;
    }
    setSavingId(item.id);
    try {
      const res = await fetch('/api/editor/content-production', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: item.id,
          editedContentUrl,
          status: markReady ? 'READY_FOR_REVIEW' : statusOverride || item.status,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error || 'Failed to update content');
        return;
      }
      toast.success(markReady ? 'Marked ready for review' : statusOverride ? 'Status updated' : 'Saved');
      fetchItems();
    } catch {
      toast.error('Failed to update content');
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Content Production Tasks</h1>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left">Client</th>
                <th className="px-4 py-3 text-left">Date</th>
                <th className="px-4 py-3 text-left">Platform</th>
                <th className="px-4 py-3 text-left">Topic</th>
                <th className="px-4 py-3 text-left">Edited Content</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-slate-500">
                    No assigned content tasks yet.
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id}>
                    <td className="px-4 py-3 text-slate-700">{item.client.name}</td>
                    <td className="px-4 py-3 text-slate-600">{new Date(item.scheduledDate).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-slate-700">{item.platform}</td>
                    <td className="px-4 py-3 text-slate-700">{item.topic}</td>
                    <td className="px-4 py-3">
                      <div className="space-y-2">
                        <input
                          value={drafts[item.id] || ''}
                          onChange={(e) => setDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))}
                          placeholder="Paste edited content link"
                          className="w-64 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                        />
                        {item.editedContentUrl && (
                          <a href={item.editedContentUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline">
                            <ExternalLink className="h-3.5 w-3.5" />
                            View link
                          </a>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{item.status.replaceAll('_', ' ')}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          onClick={() => updateItem(item, false, 'IN_EDITING')}
                          disabled={savingId === item.id}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
                        >
                          Start Editing
                        </button>
                        <button
                          onClick={() => updateItem(item, false)}
                          disabled={savingId === item.id}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
                        >
                          <Save className="h-3.5 w-3.5" />
                          Save
                        </button>
                        <button
                          onClick={() => updateItem(item, true)}
                          disabled={savingId === item.id}
                          className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                        >
                          <CheckCircle className="h-3.5 w-3.5" />
                          Ready
                        </button>
                      </div>
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
