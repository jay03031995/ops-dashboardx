'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff } from 'lucide-react';

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const fetchWithTimeout = async (input: RequestInfo | URL, init?: RequestInit) => {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 15000);

    try {
      return await fetch(input, {
        ...init,
        signal: controller.signal,
      });
    } finally {
      window.clearTimeout(timeoutId);
    }
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetchWithTimeout('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();

      if (!response.ok) {
        const apiError = typeof data?.error === 'string' ? data.error : '';
        if (apiError.toLowerCase().includes('invalid credentials')) {
          setError('Invalid email or password. Please check and try again.');
        } else {
          setError(apiError || 'Login failed');
        }
        return;
      }

      const meRes = await fetchWithTimeout('/api/auth/me', { cache: 'no-store' });
      const meData = meRes.ok ? await meRes.json() : null;
      const moduleAccess = Array.isArray(meData?.user?.moduleAccess) ? meData.user.moduleAccess : [];
      const hasAdminModules =
        moduleAccess.includes('dashboard') ||
        moduleAccess.includes('task_board') ||
        moduleAccess.includes('reports') ||
        moduleAccess.includes('content_production') ||
        moduleAccess.includes('clients') ||
        moduleAccess.includes('team') ||
        moduleAccess.includes('settings');

      if (hasAdminModules || data.user?.role === 'ADMIN') {
        router.push('/admin');
      } else {
        router.push('/editor/dashboard');
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        setError('Login request timed out. The server may be stuck connecting to the database.');
      } else {
        setError('Unable to login');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f3f6fb] px-4 py-10">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-5xl items-center justify-center">
        <div className="w-full rounded-3xl border border-slate-200 bg-white shadow-xl">
          <div className="grid gap-0 md:grid-cols-[1.05fr_0.95fr]">
            <div className="rounded-t-3xl bg-[#0f2f59] px-8 py-10 text-white md:rounded-l-3xl md:rounded-tr-none">
              <div className="mb-6 flex items-center gap-4">
                <div className="rounded-2xl bg-white p-2.5 shadow-sm ring-1 ring-white/70">
                  <img
                    src="/brand/genesisvirtue-logo.png"
                    alt="GenesisVirtue"
                    className="h-14 w-14 rounded-xl object-contain"
                    onError={(e) => { e.currentTarget.src = "/brand/genesisvirtue-logo.svg"; }}
                  />
                </div>
                <div>
                  <div className="text-xl font-semibold tracking-tight text-white">GenesisVirtue</div>
                  <div className="text-sm text-blue-50">Operations Dashboard</div>
                </div>
              </div>
              <h1 className="text-3xl font-semibold leading-tight">Welcome back</h1>
              <p className="mt-3 text-sm text-blue-50">
                Clean, focused workspace for daily task operations.
              </p>

              <div className="mt-8 space-y-3 text-sm text-blue-50">
                <div className="rounded-xl border border-white/20 bg-white/5 px-4 py-3">
                  Role-based module access and team workflows.
                </div>
                <div className="rounded-xl border border-white/20 bg-white/5 px-4 py-3">
                  Task board, content production and reporting in one place.
                </div>
              </div>
            </div>

            <div className="rounded-b-3xl bg-white p-7 md:rounded-r-3xl md:rounded-bl-none">
              <div className="text-center">
                <div className="text-2xl font-semibold text-slate-900">Sign in</div>
                <p className="mt-2 text-sm text-slate-600">Access your workspace</p>
              </div>

              <form onSubmit={onSubmit} className="mt-6 space-y-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600">Email</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100"
                    placeholder="name@company.com"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600">Password</label>
                  <div className="relative mt-2">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 pr-11 text-sm text-slate-700 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100"
                      placeholder="••••••••"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-500 hover:bg-slate-100"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs text-slate-600">
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(event) => setRememberMe(event.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-blue-600"
                    />
                    Remember me
                  </label>
                  <button type="button" className="text-blue-600 hover:underline">
                    Forgot password?
                  </button>
                </div>

                {error ? (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {error}
                  </div>
                ) : null}

                <button
                  type="submit"
                  disabled={loading}
                  className="mt-2 w-full rounded-xl bg-[#2563eb] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_20px_40px_-25px_rgba(37,99,235,0.8)] hover:bg-[#1d4ed8] disabled:opacity-60"
                >
                  {loading ? 'Signing in...' : 'Sign in'}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
