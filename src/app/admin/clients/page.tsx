'use client';

import { useState, useEffect, useRef, type ChangeEvent } from 'react';
import { createPortal } from 'react-dom';
import { Plus, User, Folder, Upload, Download, ExternalLink } from 'lucide-react';
import toast from 'react-hot-toast';

interface Client {
  id: string;
  name: string;
  oneDriveFolder: string | null;
  editor?: { id: string; name: string | null; email: string };
  socialManager?: { id: string; name: string | null; email: string };
}

interface Editor {
  id: string;
  name: string | null;
  email: string;
  role?: string;
}

type CredentialRecord = {
  platform: string;
  username?: string | null;
  hasPassword: boolean;
  updatedAt?: string;
};

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [editors, setEditors] = useState<Editor[]>([]);
  const [mappingDraft, setMappingDraft] = useState<Record<string, string>>({});
  const [managerDraft, setManagerDraft] = useState<Record<string, string>>({});
  const [savingClientId, setSavingClientId] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [uploadingCsv, setUploadingCsv] = useState(false);
  const [newClient, setNewClient] = useState({ name: '', oneDriveFolder: '', editorId: '' });
  const [editingClient, setEditingClient] = useState({ id: '', name: '', oneDriveFolder: '', editorId: '' });
  const [showAccessModal, setShowAccessModal] = useState(false);
  const [accessClient, setAccessClient] = useState<Client | null>(null);
  const [credentials, setCredentials] = useState<Record<string, CredentialRecord>>({});
  const [credentialForm, setCredentialForm] = useState({ platform: 'Instagram', username: '', password: '' });
  const [loadingCredentials, setLoadingCredentials] = useState(false);
  const [savingCredential, setSavingCredential] = useState(false);
  const [revealedPassword, setRevealedPassword] = useState('');
  const [currentUser, setCurrentUser] = useState<{ id: string; role: 'ADMIN' | 'EDITOR' } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchClients = async () => {
    try {
      const res = await fetch('/api/admin/clients');
      const data = await res.json();
      if (!res.ok) {
        setClients([]);
        toast.error(data?.error || 'Failed to fetch clients');
        return;
      }

      if (Array.isArray(data)) {
        setClients(data);
        const draft: Record<string, string> = {};
        const mgrDraft: Record<string, string> = {};
        for (const client of data) {
          draft[client.id] = client.editor?.id || '';
          mgrDraft[client.id] = client.socialManager?.id || '';
        }
        setMappingDraft(draft);
        setManagerDraft(mgrDraft);
      } else {
        setClients([]);
        toast.error('Unexpected clients response');
      }
    } catch (err) {
      setClients([]);
      toast.error('Failed to fetch clients');
      console.error(err);
    }
  };

  const saveMapping = async (clientId: string) => {
    try {
      setSavingClientId(clientId);
      const res = await fetch('/api/admin/clients', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: clientId,
          editorId: mappingDraft[clientId] || null,
          socialManagerId: managerDraft[clientId] || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error || 'Failed to update mapping');
        return;
      }
      toast.success('Client-editor mapping saved');
      fetchClients();
    } catch (error) {
      toast.error('Failed to update mapping');
      console.error(error);
    } finally {
      setSavingClientId(null);
    }
  };

  const openEditClient = (client: Client) => {
    setEditingClient({
      id: client.id,
      name: client.name,
      oneDriveFolder: client.oneDriveFolder || '',
      editorId: client.editor?.id || '',
    });
    setShowEditModal(true);
  };

  const canManageVault = (client: Client) => {
    if (!currentUser) return true;
    if (currentUser.role === 'ADMIN') return true;
    return client.socialManager?.id === currentUser.id;
  };

  const openAccessVault = (client: Client) => {
    setAccessClient(client);
    setCredentialForm({ platform: 'Instagram', username: '', password: '' });
    setRevealedPassword('');
    setShowAccessModal(true);
    fetchCredentials(client.id);
  };

  const fetchCredentials = async (clientId: string) => {
    setLoadingCredentials(true);
    try {
      const res = await fetch(`/api/admin/clients/credentials?clientId=${encodeURIComponent(clientId)}`);
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error || 'Failed to load credentials');
        return;
      }
      const map: Record<string, CredentialRecord> = {};
      if (Array.isArray(data)) {
        data.forEach((entry) => {
          map[entry.platform] = entry;
        });
      }
      setCredentials(map);
    } catch {
      toast.error('Failed to load credentials');
    } finally {
      setLoadingCredentials(false);
    }
  };

  const saveCredential = async () => {
    if (!accessClient) return;
    if (!credentialForm.password.trim()) {
      toast.error('Password is required');
      return;
    }

    setSavingCredential(true);
    try {
      const res = await fetch('/api/admin/clients/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: accessClient.id,
          platform: credentialForm.platform,
          username: credentialForm.username,
          password: credentialForm.password,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error || 'Failed to save credentials');
        return;
      }
      toast.success('Credentials saved');
      setCredentialForm((prev) => ({ ...prev, password: '' }));
      await fetchCredentials(accessClient.id);
    } catch {
      toast.error('Failed to save credentials');
    } finally {
      setSavingCredential(false);
    }
  };

  const deleteCredential = async (platform: string) => {
    if (!accessClient) return;
    setSavingCredential(true);
    try {
      const res = await fetch('/api/admin/clients/credentials', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: accessClient.id, platform }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error || 'Failed to delete credentials');
        return;
      }
      toast.success('Credentials deleted');
      setRevealedPassword('');
      await fetchCredentials(accessClient.id);
    } catch {
      toast.error('Failed to delete credentials');
    } finally {
      setSavingCredential(false);
    }
  };

  const revealCredential = async (platform: string) => {
    if (!accessClient) return;
    setSavingCredential(true);
    try {
      const res = await fetch(
        `/api/admin/clients/credentials?clientId=${encodeURIComponent(accessClient.id)}&includePassword=1`
      );
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error || 'Failed to reveal password');
        return;
      }
      const match = Array.isArray(data) ? data.find((entry) => entry.platform === platform) : null;
      setRevealedPassword(match?.password || '');
    } catch {
      toast.error('Failed to reveal password');
    } finally {
      setSavingCredential(false);
    }
  };

  const saveClientDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingClient.id) return;

    try {
      setSavingClientId(editingClient.id);
      const res = await fetch('/api/admin/clients', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingClient.id,
          name: editingClient.name,
          oneDriveFolder: editingClient.oneDriveFolder,
          editorId: editingClient.editorId || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error || 'Failed to update client');
        return;
      }
      toast.success('Client updated');
      setShowEditModal(false);
      fetchClients();
    } catch (error) {
      toast.error('Failed to update client');
      console.error(error);
    } finally {
      setSavingClientId(null);
    }
  };

  const fetchEditors = async () => {
    try {
      const res = await fetch('/api/admin/editors');
      const data = await res.json();
      if (!res.ok) {
        setEditors([]);
        toast.error(data?.error || 'Failed to fetch editors');
        return;
      }
      if (Array.isArray(data)) {
        setEditors(data);
      } else {
        setEditors([]);
        toast.error('Unexpected editors response');
      }
    } catch (err) {
      setEditors([]);
      toast.error('Failed to fetch editors');
      console.error(err);
    }
  };

  const editorAccessMembers = editors.filter((member) => (member.role || 'VE').toUpperCase() === 'VE');
  const socialManagerMembers = editors.filter((member) =>
    ['SM', 'ISM', 'CSM', 'CF', 'ADMIN'].includes((member.role || 'VE').toUpperCase())
  );

  const fetchCurrentUser = async () => {
    try {
      const res = await fetch('/api/auth/me');
      const data = await res.json();
      if (!res.ok) return;
      if (data?.user?.id && data?.user?.role) {
        setCurrentUser({ id: data.user.id, role: data.user.role });
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    setMounted(true);
    fetchClients();
    fetchEditors();
    fetchCurrentUser();
  }, []);

  const normalizeFolderLink = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return '';
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    if (/^www\./i.test(trimmed)) return `https://${trimmed}`;
    if (/^(1drv\.ms|onedrive\.live\.com)\//i.test(trimmed)) return `https://${trimmed}`;
    return trimmed;
  };

  const handleCsvImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadingCsv(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/admin/clients/import-csv', {
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
        `CSV imported: ${data?.createdClients || 0} clients` +
          (skippedCount ? `, ${skippedCount} skipped` : '')
      );

      await fetchClients();
    } catch {
      toast.error('Failed to import CSV');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
      setUploadingCsv(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/admin/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newClient),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success('Client added');
        setShowModal(false);
        setNewClient({ name: '', oneDriveFolder: '', editorId: '' });
        fetchClients();
      } else {
        toast.error(data?.error || 'Failed to add client');
      }
    } catch (err) {
      toast.error('Failed to add client');
      console.error(err);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Clients</h1>
          <p className="mt-1 text-sm text-slate-500">Bulk import client directories and manage editor access.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={handleCsvImport}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingCsv}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-60"
          >
            <Upload className="h-4 w-4" />
            {uploadingCsv ? 'Uploading CSV' : 'Upload CSV'}
          </button>
          <a
            href="/templates/clients-template.csv"
            download
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
          >
            <Download className="h-4 w-4" />
            Download Template
          </a>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Client
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Client</th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">OneDrive Folder</th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Editor Access</th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Social Manager</th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white">
            {clients.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-4 text-center text-sm text-slate-500">No clients mapped yet.</td>
              </tr>
            ) : (
              clients.map((client) => (
                <tr key={client.id}>
                  <td className="px-6 py-4 text-sm font-medium text-slate-900">{client.name}</td>
                  <td className="px-6 py-4 text-sm text-slate-600">
                    {client.oneDriveFolder ? (
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="inline-flex items-center text-slate-700">
                          <Folder className="mr-2 h-4 w-4" />
                          <span className="text-xs font-medium uppercase text-emerald-600">Link added</span>
                        </div>
                        <a
                          href={normalizeFolderLink(client.oneDriveFolder)}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          View Content
                        </a>
                      </div>
                    ) : (
                      <div className="inline-flex items-center">
                        <Folder className="mr-2 h-4 w-4" />
                        <span className="text-slate-500">No folder set</span>
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="inline-flex items-center">
                      <User className="mr-2 h-4 w-4 text-slate-500" />
                      <select
                        className="rounded-lg border border-slate-200 p-2 text-sm"
                        value={mappingDraft[client.id] || ''}
                        onChange={(e) => setMappingDraft({ ...mappingDraft, [client.id]: e.target.value })}
                      >
                        <option value="">Unassigned</option>
                        {editorAccessMembers.map((editor) => (
                          <option key={editor.id} value={editor.id}>
                            {editor.name || editor.email}
                          </option>
                        ))}
                      </select>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <select
                      className="rounded-lg border border-slate-200 p-2 text-sm"
                      value={managerDraft[client.id] || ''}
                      onChange={(e) => setManagerDraft({ ...managerDraft, [client.id]: e.target.value })}
                    >
                      <option value="">Unassigned</option>
                      {socialManagerMembers.map((editor) => (
                        <option key={editor.id} value={editor.id}>
                          {editor.name || editor.email}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => saveMapping(client.id)}
                        disabled={savingClientId === client.id}
                        className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                      >
                        {savingClientId === client.id ? 'Saving...' : 'Save Mapping'}
                      </button>
                      {canManageVault(client) ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            openAccessVault(client);
                          }}
                          className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        >
                          Manage Access
                        </button>
                      ) : null}
                      <button
                        onClick={() => openEditClient(client)}
                        className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        Edit
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
        You can create multiple content calendar events on the same date from the Task Board page. Each event maps to one client and its assigned editor.
      </div>

      {mounted && showModal
        ? createPortal(
            <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50">
              <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
                <h2 className="mb-4 text-lg font-semibold text-slate-900">Add New Client</h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Client Name</label>
                    <input
                      type="text"
                      required
                      className="mt-1 w-full rounded-lg border border-slate-200 p-2 focus:outline-none focus:ring-2 focus:ring-blue-200"
                      value={newClient.name}
                      onChange={(e) => setNewClient({ ...newClient, name: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700">OneDrive Folder (Path or Share URL)</label>
                    <input
                      type="text"
                      placeholder="Clients/ClientName or https://1drv.ms/..."
                      className="mt-1 w-full rounded-lg border border-slate-200 p-2 focus:outline-none focus:ring-2 focus:ring-blue-200"
                      value={newClient.oneDriveFolder}
                      onChange={(e) => setNewClient({ ...newClient, oneDriveFolder: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Assign Editor</label>
                    <select
                      className="mt-1 w-full rounded-lg border border-slate-200 p-2 focus:outline-none focus:ring-2 focus:ring-blue-200"
                      value={newClient.editorId}
                      onChange={(e) => setNewClient({ ...newClient, editorId: e.target.value })}
                    >
                      <option value="">Unassigned</option>
                      {editorAccessMembers.map((editor) => (
                        <option key={editor.id} value={editor.id}>
                          {(editor.name || editor.email) + (editor.role ? ` (${editor.role})` : '')}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex justify-end space-x-3 mt-6">
                    <button
                      type="button"
                      onClick={() => setShowModal(false)}
                      className="px-4 py-2 text-slate-600 hover:text-slate-800"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                    >
                      Save Client
                    </button>
                  </div>
                </form>
              </div>
            </div>,
            document.body
          )
        : null}

      {mounted && showEditModal
        ? createPortal(
            <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/45 p-4">
              <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
                <h2 className="mb-4 text-lg font-semibold text-slate-900">Edit Client</h2>
                <form onSubmit={saveClientDetails} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Client Name</label>
                    <input
                      type="text"
                      required
                      className="mt-1 w-full rounded-lg border border-slate-200 p-2 focus:outline-none focus:ring-2 focus:ring-blue-200"
                      value={editingClient.name}
                      onChange={(e) => setEditingClient({ ...editingClient, name: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700">OneDrive Folder (Path or Share URL)</label>
                    <input
                      type="text"
                      className="mt-1 w-full rounded-lg border border-slate-200 p-2 focus:outline-none focus:ring-2 focus:ring-blue-200"
                      value={editingClient.oneDriveFolder}
                      onChange={(e) => setEditingClient({ ...editingClient, oneDriveFolder: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Assign Member</label>
                    <select
                      className="mt-1 w-full rounded-lg border border-slate-200 p-2 focus:outline-none focus:ring-2 focus:ring-blue-200"
                      value={editingClient.editorId}
                      onChange={(e) => setEditingClient({ ...editingClient, editorId: e.target.value })}
                    >
                      <option value="">Unassigned</option>
                      {editorAccessMembers.map((editor) => (
                        <option key={editor.id} value={editor.id}>
                          {(editor.name || editor.email) + (editor.role ? ` (${editor.role})` : '')}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="mt-6 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowEditModal(false)}
                      className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={savingClientId === editingClient.id}
                      className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                    >
                      {savingClientId === editingClient.id ? 'Saving...' : 'Save Client'}
                    </button>
                  </div>
                </form>
              </div>
            </div>,
            document.body
          )
        : null}

      {mounted && showAccessModal
        ? createPortal(
            <div className="fixed inset-0 z-[9999] bg-slate-900/45">
              <div className="absolute left-1/2 top-1/2 w-[92vw] max-w-2xl -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-2xl">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">Client Access Vault</h2>
                    <p className="mt-1 text-sm text-slate-500">{accessClient?.name || 'Client'}</p>
                  </div>
                  <button
                    onClick={() => setShowAccessModal(false)}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
                  >
                    Close
                  </button>
                </div>

                <div className="mt-5 grid gap-4 lg:grid-cols-[1.2fr_1fr]">
                  <div className="rounded-xl border border-slate-200 p-4">
                    <h3 className="text-sm font-semibold text-slate-800">Saved Access</h3>
                    <div className="mt-3 space-y-3 text-sm text-slate-600">
                      {loadingCredentials ? (
                        <p>Loading...</p>
                      ) : (
                        ['Instagram', 'Facebook', 'Linkedin', 'Youtube'].map((platform) => {
                          const entry = credentials[platform];
                          return (
                            <div key={platform} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                              <div>
                                <div className="text-xs uppercase text-slate-400">{platform}</div>
                                <div className="text-sm font-medium text-slate-700">
                                  {entry?.username || 'Not set'}
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => revealCredential(platform)}
                                  className="rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-white"
                                  disabled={savingCredential}
                                >
                                  View
                                </button>
                                <button
                                  onClick={() => deleteCredential(platform)}
                                  className="rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-white"
                                  disabled={savingCredential}
                                >
                                  Remove
                                </button>
                              </div>
                            </div>
                          );
                        })
                      )}
                      {revealedPassword ? (
                        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                          Revealed password: <span className="font-semibold">{revealedPassword}</span>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 p-4">
                    <h3 className="text-sm font-semibold text-slate-800">Add or Update Access</h3>
                    <div className="mt-3 space-y-3 text-sm text-slate-600">
                      <div>
                        <label className="text-xs font-semibold uppercase text-slate-400">Platform</label>
                        <select
                          className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-sm"
                          value={credentialForm.platform}
                          onChange={(e) => setCredentialForm({ ...credentialForm, platform: e.target.value })}
                        >
                          <option value="Instagram">Instagram</option>
                          <option value="Facebook">Facebook</option>
                          <option value="Linkedin">Linkedin</option>
                          <option value="Youtube">Youtube</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-semibold uppercase text-slate-400">Username</label>
                        <input
                          className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-sm"
                          value={credentialForm.username}
                          onChange={(e) => setCredentialForm({ ...credentialForm, username: e.target.value })}
                          placeholder="@handle or email"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold uppercase text-slate-400">Password</label>
                        <input
                          type="password"
                          className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-sm"
                          value={credentialForm.password}
                          onChange={(e) => setCredentialForm({ ...credentialForm, password: e.target.value })}
                          placeholder="Enter password"
                        />
                      </div>
                      <button
                        onClick={saveCredential}
                        disabled={savingCredential}
                        className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                      >
                        {savingCredential ? 'Saving...' : 'Save Credentials'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
