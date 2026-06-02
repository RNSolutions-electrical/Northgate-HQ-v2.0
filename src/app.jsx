import { useEffect, useMemo, useState } from 'react';
import {
  SignedIn,
  SignedOut,
  SignInButton,
  UserButton,
  useUser,
} from '@clerk/clerk-react';
import { CheckCircle2, Database, Loader2, ShieldAlert, XCircle } from 'lucide-react';
import { supabase } from './lib/supabaseClient';

export default function App() {
  const { user } = useUser();
  const [connectionStatus, setConnectionStatus] = useState('loading');
  const [connectionMessage, setConnectionMessage] = useState(
    'Checking v2 Supabase connection...'
  );
  const [sampleRows, setSampleRows] = useState([]);

  const supabaseProjectUrl = import.meta.env.VITE_SUPABASE_URL;

  const projectRef = useMemo(() => {
    try {
      return new URL(supabaseProjectUrl).hostname.split('.')[0];
    } catch {
      return 'unknown';
    }
  }, [supabaseProjectUrl]);

  useEffect(() => {
    async function testSupabaseConnection() {
      setConnectionStatus('loading');
      setConnectionMessage('Checking v2 Supabase connection...');

      const { data, error } = await supabase
        .from('cost_codes')
        .select('id, code, name, division')
        .limit(5);

      if (error) {
        setConnectionStatus('error');
        setConnectionMessage(error.message);
        setSampleRows([]);
        return;
      }

      setConnectionStatus('success');
      setConnectionMessage(
        `Connected to Supabase v2. cost_codes returned ${data.length} row(s).`
      );
      setSampleRows(data);
    }

    testSupabaseConnection();
  }, []);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Northgate HQ</p>
          <h1>Northgate HQ v2.0</h1>
          <p className="subtitle">
            Temporary app shell for Netlify, Clerk, and Supabase wiring.
          </p>
        </div>

        <div className="auth-card">
          <SignedOut>
            <SignInButton mode="modal">
              <button className="button">Sign In</button>
            </SignInButton>
          </SignedOut>

          <SignedIn>
            <UserButton />
          </SignedIn>
        </div>
      </header>

      <section className="grid">
        <article className="card">
          <div className="card-title">
            <Database size={20} />
            <h2>Supabase Connection</h2>
          </div>

          <StatusBadge status={connectionStatus} />

          <p className="message">{connectionMessage}</p>

          <dl className="details">
            <div>
              <dt>Expected project</dt>
              <dd>northgate-hq-v2.0</dd>
            </div>
            <div>
              <dt>Detected project ref</dt>
              <dd>{projectRef}</dd>
            </div>
            <div>
              <dt>Target project ref</dt>
              <dd>keogysnoukbendfkfjcn</dd>
            </div>
          </dl>
        </article>

        <article className="card">
          <div className="card-title">
            <CheckCircle2 size={20} />
            <h2>Migration Checkpoint</h2>
          </div>

          <ul className="checklist">
            <li>Phase 1 Inventory migration applied to v2 Supabase.</li>
            <li>Inventory balance trigger verified by post-migration tests.</li>
            <li>v1 Supabase project should remain untouched.</li>
            <li>Next build target: inventory cart checkout/finalization.</li>
          </ul>
        </article>

        <article className="card wide">
          <div className="card-title">
            <ShieldAlert size={20} />
            <h2>Signed-In State</h2>
          </div>

          <SignedOut>
            <p className="message">
              You are signed out. Use the Clerk sign-in button above to verify auth wiring.
            </p>
          </SignedOut>

          <SignedIn>
            <p className="message">
              Signed in as{' '}
              <strong>
                {user?.fullName || user?.primaryEmailAddress?.emailAddress || 'Clerk user'}
              </strong>
            </p>
          </SignedIn>
        </article>

        <article className="card wide">
          <div className="card-title">
            <Database size={20} />
            <h2>Sample cost_codes Rows</h2>
          </div>

          {sampleRows.length === 0 ? (
            <p className="message">
              No rows displayed yet. This may be normal if `cost_codes` has not been seeded.
            </p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Name</th>
                    <th>Division</th>
                  </tr>
                </thead>
                <tbody>
                  {sampleRows.map((row) => (
                    <tr key={row.id}>
                      <td>{row.code}</td>
                      <td>{row.name}</td>
                      <td>{row.division || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </article>
      </section>
    </main>
  );
}

function StatusBadge({ status }) {
  if (status === 'loading') {
    return (
      <div className="status loading">
        <Loader2 size={16} className="spin" />
        Checking
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div className="status success">
        <CheckCircle2 size={16} />
        Connected
      </div>
    );
  }

  return (
    <div className="status error">
      <XCircle size={16} />
      Error
    </div>
  );
}
