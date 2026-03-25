'use client';

import { useCallback, useEffect, useState } from 'react';
import { Pencil, UserCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';

type TeamRoleOption = {
  code: string;
  name: string;
};

type TeamMember = {
  id: string;
  name: string | null;
  email: string;
  role?: string;
  avatarUrl?: string | null;
};

export default function AdminSettingsPage() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [roles, setRoles] = useState<TeamRoleOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEditModal, setShowEditModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState({
    id: '',
    name: '',
    email: '',
    role: 'VE',
    password: '',
    avatarUrl: '',
  });

  const fetchMembers = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/editors');
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error || 'Failed to load team members');
        setMembers([]);
        return;
      }
      setMembers(Array.isArray(data) ? data : []);
    } catch {
      toast.error('Failed to load team members');
      setMembers([]);
    }
  }, []);

  const fetchRoles = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/team/roles');
      const data = await res.json();
      if (!res.ok) return;
      setRoles(Array.isArray(data?.roles) ? data.roles : []);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchMembers(), fetchRoles()]).finally(() => setLoading(false));
  }, [fetchMembers, fetchRoles]);

  const openEdit = (member: TeamMember) => {
    setEditing({
      id: member.id,
      name: member.name || '',
      email: member.email,
      role: member.role || 'VE',
      password: '',
      avatarUrl: member.avatarUrl || '',
    });
    setShowEditModal(true);
  };

  const saveProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editing.id) return;
    setSaving(true);
    try {
      const res = await fetch('/api/admin/editors', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editing.id,
          name: editing.name,
          email: editing.email,
          role: editing.role,
          avatarUrl: editing.avatarUrl,
          ...(editing.password ? { password: editing.password } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error || 'Failed to update profile');
        return;
      }
      toast.success('Profile updated');
      setShowEditModal(false);
      setEditing({ id: '', name: '', email: '', role: 'VE', password: '', avatarUrl: '' });
      fetchMembers();
    } catch {
      toast.error('Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">Configuration</h1>
        <p className="mt-2 text-sm text-slate-500">Manage team member profiles and access settings.</p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-900">Team Profiles</h2>
          <p className="mt-1 text-sm text-slate-500">Update member name, email, role, and reset passwords.</p>
        </div>
        <div className="divide-y divide-slate-200">
          {loading ? (
            <div className="px-6 py-5 text-sm text-slate-500">Loading members...</div>
          ) : members.length === 0 ? (
            <div className="px-6 py-5 text-sm text-slate-500">No team members found.</div>
          ) : (
            members.map((member) => (
              <div key={member.id} className="flex flex-wrap items-center justify-between gap-4 px-6 py-4">
                <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-600">
                    {member.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={member.avatarUrl} alt={member.name || 'Avatar'} className="h-10 w-10 rounded-full object-cover" />
                    ) : (
                      <UserCircle2 className="h-5 w-5" />
                    )}
                </div>
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{member.name || 'Unnamed Member'}</div>
                    <div className="text-xs text-slate-500">{member.email}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
                    {(roles.find((role) => role.code === member.role)?.name || member.role || 'VE').toUpperCase()}
                  </span>
                  <button
                    onClick={() => openEdit(member)}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Edit Profile
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {showEditModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/45 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4">
              <h3 className="text-lg font-semibold text-slate-900">Edit Team Profile</h3>
              <p className="text-sm text-slate-500">Update profile details and reset password if needed.</p>
            </div>
            <form onSubmit={saveProfile} className="space-y-4">
              <div>
                <label className="text-xs font-semibold uppercase text-slate-400">Full Name</label>
                <input
                  className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-sm"
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  placeholder="Full name"
                />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase text-slate-400">Email</label>
                <input
                  type="email"
                  className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-sm"
                  value={editing.email}
                  onChange={(e) => setEditing({ ...editing, email: e.target.value })}
                  placeholder="Email address"
                />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase text-slate-400">Avatar URL</label>
                <input
                  className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-sm"
                  value={editing.avatarUrl}
                  onChange={(e) => setEditing({ ...editing, avatarUrl: e.target.value })}
                  placeholder="https://..."
                />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase text-slate-400">Role</label>
                <select
                  className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-sm"
                  value={editing.role}
                  onChange={(e) => setEditing({ ...editing, role: e.target.value })}
                >
                  {roles.map((role) => (
                    <option key={role.code} value={role.code}>
                      {role.name}
                    </option>
                  ))}
                  {!roles.length && (
                    <>
                      <option value="VE">Video Editor</option>
                      <option value="SM">Social Manager</option>
                      <option value="CSM">Customer Success Manager</option>
                      <option value="CF">Co-founder</option>
                      <option value="ADMIN">Founder</option>
                    </>
                  )}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold uppercase text-slate-400">Reset Password (optional)</label>
                <input
                  type="password"
                  className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-sm"
                  value={editing.password}
                  onChange={(e) => setEditing({ ...editing, password: e.target.value })}
                  placeholder="Leave blank to keep current"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
