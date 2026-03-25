import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_15%_20%,rgba(59,130,246,0.22),transparent_40%),radial-gradient(circle_at_85%_10%,rgba(16,185,129,0.18),transparent_35%),linear-gradient(135deg,#f8fafc_0%,#eff6ff_45%,#f1f5f9_100%)] px-4 py-10">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-5xl items-center">
        <section className="w-full rounded-3xl border border-white/70 bg-white/80 p-8 shadow-[0_35px_100px_-45px_rgba(15,23,42,0.45)] backdrop-blur sm:p-10 lg:p-12">
          <div className="inline-flex items-center rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-blue-700">
            Genesis Virtue
          </div>
          <h1 className="mt-5 text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl">
            Ops Dashboard
          </h1>
          <p className="mt-4 max-w-2xl text-sm text-slate-600 sm:text-base">
            Centralize team operations, content production, reporting, and client workflows in one place.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="/admin/login"
              className="inline-flex items-center rounded-xl bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-800"
            >
              Open Login Dashboard
            </Link>
            <Link
              href="/admin"
              className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Go to Admin
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
