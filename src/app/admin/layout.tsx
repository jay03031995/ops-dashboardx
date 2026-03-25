'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  CalendarDays,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  Users,
  UserSquare2,
  MessageSquareText,
  BarChart3,
  Clapperboard,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Toaster } from 'react-hot-toast';

const primaryItems = [
  { icon: LayoutDashboard, label: 'Dashboard', href: '/admin', moduleKey: 'dashboard' },
  { icon: CalendarDays, label: 'Task Board', href: '/admin/task-board', moduleKey: 'task_board' },
  { icon: BarChart3, label: 'Reports', href: '/admin/reports', moduleKey: 'reports' },
  { icon: Clapperboard, label: 'Content Production', href: '/admin/content-production', moduleKey: 'content_production' },
  { icon: Users, label: 'Clients', href: '/admin/clients', moduleKey: 'clients' },
  { icon: UserSquare2, label: 'The Team', href: '/admin/editors', moduleKey: 'team' },
  { icon: MessageSquareText, label: 'Team Chat', href: '/admin/chat', moduleKey: 'team_chat' },
];

const settingsItems = [{ icon: Settings, label: 'Configuration', href: '/admin/settings', moduleKey: 'settings' }];

type SessionUser = {
  id?: string;
  name?: string | null;
  email?: string;
  avatarUrl?: string | null;
  role?: string;
  roleCode?: string;
  moduleAccess?: string[];
};

function roleDisplay(roleCode?: string, fallbackRole?: string) {
  const code = (roleCode || fallbackRole || 'ADMIN').toUpperCase();
  if (code === 'VE') return 'Video Editor';
  if (code === 'SM') return 'Social Manager';
  if (code === 'ISM') return 'Intern Social Manager';
  if (code === 'CSM') return 'Customer Success Manager';
  if (code === 'CF') return 'Co-founder';
  if (code === 'ADMIN') return 'Admin';
  return code;
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const checkAuth = async () => {
      if (pathname === '/admin/login') return;

      try {
        const res = await fetch('/api/auth/me');
        if (res.ok) {
          const data = await res.json();
          const fetchedUser = data.user as SessionUser;
          setUser(fetchedUser);
          const access = new Set(fetchedUser?.moduleAccess || []);

          if (pathname.startsWith('/admin') && pathname !== '/admin/login') {
            const item =
              [...primaryItems, ...settingsItems].find((nav) => pathname === nav.href || pathname.startsWith(`${nav.href}/`));
            if (item && fetchedUser?.role !== 'ADMIN' && !access.has(item.moduleKey)) {
              router.push(access.has('editor_dashboard') ? '/editor/dashboard' : '/admin/login');
            }
          }
        } else {
          router.push('/admin/login');
        }
      } catch {
        router.push('/admin/login');
      }
    };

    checkAuth();
  }, [pathname, router]);

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/admin/login');
  };

  if (pathname === '/admin/login') {
    return (
      <>
        {children}
        <Toaster position="bottom-right" />
      </>
    );
  }

  const allowedAccess = new Set(user?.moduleAccess || []);
  const visiblePrimaryItems =
    user?.role === 'ADMIN'
      ? primaryItems
      : primaryItems.filter((item) => allowedAccess.has(item.moduleKey));
  const visibleSettingsItems =
    user?.role === 'ADMIN'
      ? settingsItems
      : settingsItems.filter((item) => allowedAccess.has(item.moduleKey));
  const roleLabel = roleDisplay(user?.roleCode, user?.role);
  const panelTitle = `${roleLabel} Panel`;

  return (
    <div className="min-h-screen bg-transparent p-2 sm:p-4">
      <div className="flex min-h-[calc(100vh-1rem)] overflow-hidden rounded-[30px] border border-white/70 bg-white/45 shadow-[0_30px_90px_-38px_rgba(15,23,42,0.45)] backdrop-blur-2xl sm:min-h-[calc(100vh-2rem)] sm:rounded-[34px]">
        {sidebarOpen ? (
          <button
            onClick={() => setSidebarOpen(false)}
            className="fixed inset-0 z-40 bg-black/45 lg:hidden"
            aria-label="Close sidebar overlay"
          />
        ) : null}

        <aside
          className={cn(
            'fixed inset-y-0 left-0 z-50 flex w-72 shrink-0 flex-col border-r border-blue-100 bg-white transition-transform duration-200 lg:static lg:z-0 lg:translate-x-0',
            'border-r border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.86),rgba(246,249,255,0.7))] backdrop-blur-2xl',
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          )}
        >
          <div className="p-6">
            <div className="mb-8 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl border border-white/80 bg-white/90 shadow-sm">
                  <img
                    src="/brand/genesisvirtue-logo.png"
                    alt="GenesisVirtue"
                    className="h-full w-full object-contain p-1"
                    onError={(e) => { e.currentTarget.src = "/brand/genesisvirtue-logo.svg"; }}
                  />
                </div>
                <div>
                  <div className="text-xl font-semibold tracking-tight text-slate-900">{panelTitle}</div>
                  <div className="text-xs text-slate-500">Operations Workspace</div>
                </div>
              </div>
              <button
                onClick={() => setSidebarOpen(false)}
                className="rounded-xl border border-white/80 bg-white/80 p-1.5 text-slate-500 shadow-sm lg:hidden"
                aria-label="Close sidebar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <nav className="space-y-2">
              {visiblePrimaryItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={cn(
                    'flex items-center rounded-2xl px-3.5 py-3 text-sm font-medium transition-all',
                    pathname === item.href
                      ? 'bg-gradient-to-r from-sky-600 to-blue-600 text-white shadow-lg shadow-blue-500/20'
                      : 'text-slate-600 hover:bg-white/90 hover:text-sky-700 hover:shadow-sm'
                  )}
                >
                  <item.icon className="mr-3 h-5 w-5" />
                  {item.label}
                </Link>
              ))}
            </nav>

            <div className="mt-8 text-[11px] font-semibold uppercase tracking-wider text-slate-500/70">Settings</div>
            <nav className="mt-2 space-y-2">
              {visibleSettingsItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={cn(
                    'flex items-center rounded-2xl px-3.5 py-3 text-sm font-medium transition-all',
                    pathname === item.href
                      ? 'bg-gradient-to-r from-sky-600 to-blue-600 text-white shadow-lg shadow-blue-500/20'
                      : 'text-slate-600 hover:bg-white/90 hover:text-sky-700 hover:shadow-sm'
                  )}
                >
                  <item.icon className="mr-3 h-5 w-5" />
                  {item.label}
                </Link>
              ))}
              <button
                onClick={handleLogout}
                className="flex w-full items-center rounded-2xl px-3.5 py-3 text-left text-sm font-medium text-slate-600 transition-all hover:bg-white/90 hover:text-sky-700 hover:shadow-sm"
              >
                <LogOut className="mr-3 h-5 w-5" />
                Sign Out
              </button>
            </nav>
          </div>

          <div className="mt-auto border-t border-white/70 px-6 py-5">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-sky-100 to-blue-100 text-lg font-bold text-blue-700">
                {user?.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={user.avatarUrl} alt={user?.name || 'Avatar'} className="h-full w-full object-cover" />
                ) : (
                  (user?.name || user?.email || 'Admin').slice(0, 2).toUpperCase()
                )}
              </div>
              <div>
                <div className="text-sm font-semibold text-slate-900">{user?.name || 'John Doe'}</div>
                <div className="text-xs text-slate-500">{roleLabel}</div>
              </div>
            </div>
          </div>
        </aside>

        <main className="w-full overflow-y-auto bg-[linear-gradient(180deg,rgba(255,255,255,0.32),rgba(255,255,255,0.1))] p-4 sm:p-6">
          <div className="mb-4 flex items-center justify-between lg:hidden">
            <button
              onClick={() => setSidebarOpen(true)}
              className="inline-flex items-center gap-2 rounded-2xl border border-white/80 bg-white/80 px-3 py-2 text-sm font-semibold text-sky-700 shadow-sm"
            >
              <Menu className="h-4 w-4" />
              Menu
            </button>
            <div className="text-sm font-semibold text-slate-900">{panelTitle}</div>
          </div>
          {children}
          <Toaster position="bottom-right" />
        </main>
      </div>
    </div>
  );
}
