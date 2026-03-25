'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { LayoutDashboard, LogOut, Menu, MessageSquareText, Clapperboard, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Toaster } from 'react-hot-toast';

export default function EditorLayout({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<{ moduleAccess?: string[] } | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await fetch('/api/auth/me');
        if (res.ok) {
          const data = await res.json();
          const fetchedUser = data.user as { moduleAccess?: string[] };
          setUser(fetchedUser);
          const access = new Set(fetchedUser?.moduleAccess || []);
          if (pathname === '/editor/dashboard' && !access.has('editor_dashboard')) {
            router.push('/admin/login');
            return;
          }
          if (pathname === '/editor/chat' && !access.has('team_chat')) {
            router.push('/admin/login');
            return;
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
            'fixed inset-y-0 left-0 z-50 h-full w-64 border-r border-blue-100 bg-white transition-transform duration-200 lg:static lg:z-0 lg:translate-x-0',
            'border-r border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.86),rgba(246,249,255,0.7))] backdrop-blur-2xl',
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          )}
        >
          <div className="flex h-full flex-col px-3 py-4">
            <div className="mb-8 flex items-center justify-between px-2">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-2xl border border-white/80 bg-white/90 shadow-sm">
                  <img
                    src="/brand/genesisvirtue-logo.png"
                    alt="GenesisVirtue"
                    className="h-full w-full object-contain p-1"
                    onError={(e) => { e.currentTarget.src = "/brand/genesisvirtue-logo.svg"; }}
                  />
                </div>
                <div>
                  <div className="text-xl font-semibold text-slate-900">Editor Workspace</div>
                  <div className="text-xs text-slate-500">Production Console</div>
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
            <nav className="flex-1 space-y-2">
              {(user?.moduleAccess || []).includes('editor_dashboard') && (
                <Link
                  href="/editor/dashboard"
                  onClick={() => setSidebarOpen(false)}
                  className={cn(
                    'flex items-center rounded-2xl px-3.5 py-3 text-sm font-medium transition-all',
                    pathname === '/editor/dashboard'
                      ? 'bg-gradient-to-r from-sky-600 to-blue-600 text-white shadow-lg shadow-blue-500/20'
                      : 'text-slate-600 hover:bg-white/90 hover:text-sky-700 hover:shadow-sm'
                  )}
                >
                  <LayoutDashboard className="mr-3 h-5 w-5" />
                  Assignment Desk
                </Link>
              )}
              {(user?.moduleAccess || []).includes('team_chat') && (
                <Link
                  href="/editor/chat"
                  onClick={() => setSidebarOpen(false)}
                  className={cn(
                    'flex items-center rounded-2xl px-3.5 py-3 text-sm font-medium transition-all',
                    pathname === '/editor/chat'
                      ? 'bg-gradient-to-r from-sky-600 to-blue-600 text-white shadow-lg shadow-blue-500/20'
                      : 'text-slate-600 hover:bg-white/90 hover:text-sky-700 hover:shadow-sm'
                  )}
                >
                  <MessageSquareText className="mr-3 h-5 w-5" />
                  Team Communication
                </Link>
              )}
              {(user?.moduleAccess || []).includes('content_production_editor') && (
                <Link
                  href="/editor/content-production"
                  onClick={() => setSidebarOpen(false)}
                  className={cn(
                    'flex items-center rounded-2xl px-3.5 py-3 text-sm font-medium transition-all',
                    pathname === '/editor/content-production'
                      ? 'bg-gradient-to-r from-sky-600 to-blue-600 text-white shadow-lg shadow-blue-500/20'
                      : 'text-slate-600 hover:bg-white/90 hover:text-sky-700 hover:shadow-sm'
                  )}
                >
                  <Clapperboard className="mr-3 h-5 w-5" />
                  Content Production
                </Link>
              )}
            </nav>
            <div className="mt-auto border-t border-white/70 pt-4">
              <button
                onClick={handleLogout}
                className="flex w-full items-center rounded-2xl px-3.5 py-3 text-sm font-medium text-slate-600 transition-all hover:bg-white/90 hover:text-sky-700 hover:shadow-sm"
              >
                <LogOut className="mr-3 h-5 w-5" />
                Sign Out
              </button>
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
            <div className="text-sm font-semibold text-slate-900">Editor Workspace</div>
          </div>
          {children}
          <Toaster position="bottom-right" />
        </main>
      </div>
    </div>
  );
}
