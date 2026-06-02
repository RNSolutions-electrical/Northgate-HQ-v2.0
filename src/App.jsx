import { SignedIn, SignedOut, SignInButton, UserButton, useUser } from '@clerk/clerk-react';
import { Database, LayoutDashboard, ShieldCheck } from 'lucide-react';
import { supabase } from './services/supabaseClient.js';
import { usePermissions } from './hooks/usePermissions.js';

function Dashboard() {
  const { user } = useUser();
  const permissions = usePermissions();

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900/80 px-6 py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.25em] text-slate-400">Northgate HQ v2.0</p>
            <h1 className="text-2xl font-semibold">Operations Dashboard</h1>
          </div>
          <UserButton afterSignOutUrl="/" />
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl gap-6 px-6 py-8 md:grid-cols-3">
        <article className="rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-lg">
          <LayoutDashboard className="mb-4 h-8 w-8" />
          <h2 className="text-lg font-semibold">Dashboard Shell</h2>
          <p className="mt-2 text-sm text-slate-400">
            Base app shell is online. Inventory module wiring comes next.
          </p>
        </article>

        <article className="rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-lg">
          <ShieldCheck className="mb-4 h-8 w-8" />
          <h2 className="text-lg font-semibold">Clerk Auth</h2>
          <p className="mt-2 text-sm text-slate-400">
            Signed in as {user?.primaryEmailAddress?.emailAddress ?? user?.id}.
          </p>
          <p className="mt-2 text-xs text-slate-500">
            Temporary role: {permissions.role} / {permissions.division}
          </p>
        </article>

        <article className="rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-lg">
          <Database className="mb-4 h-8 w-8" />
          <h2 className="text-lg font-semibold">Supabase Client</h2>
          <p className="mt-2 text-sm text-slate-400">
            Client initialized: {supabase ? 'yes' : 'no'}.
          </p>
        </article>
      </section>
    </main>
  );
}

function Landing() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-slate-100">
      <section className="max-w-xl rounded-3xl border border-slate-800 bg-slate-900 p-8 text-center shadow-2xl">
        <p className="text-sm uppercase tracking-[0.25em] text-slate-400">Northgate HQ v2.0</p>
        <h1 className="mt-3 text-4xl font-bold">Operations Platform</h1>
        <p className="mt-4 text-slate-400">
          Sign in to access the Northgate HQ dashboard.
        </p>
        <div className="mt-8">
          <SignInButton mode="modal">
            <button className="rounded-xl bg-slate-100 px-5 py-3 font-semibold text-slate-950 hover:bg-white">
              Sign In
            </button>
          </SignInButton>
        </div>
      </section>
    </main>
  );
}

export default function App() {
  return (
    <>
      <SignedOut>
        <Landing />
      </SignedOut>
      <SignedIn>
        <Dashboard />
      </SignedIn>
    </>
  );
}
