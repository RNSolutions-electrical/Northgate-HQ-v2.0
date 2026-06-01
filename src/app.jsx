import { useEffect, useState } from 'react';
import {
  SignedIn,
  SignedOut,
  SignInButton,
  UserButton,
  useUser,
} from '@clerk/clerk-react';
import { supabase } from './lib/supabaseClient';

export default function App() {
  const { user } = useUser();
  const [status, setStatus] = useState('loading');
  const [message, setMessage] = useState('Checking Supabase connection...');

  useEffect(() => {
    async function testConnection() {
      const { data, error } = await supabase
        .from('cost_codes')
        .select('*')
        .limit(5);

      if (error) {
        setStatus('error');
        setMessage(error.message);
        return;
      }

      setStatus('success');
      setMessage(`Connected to Supabase. cost_codes returned ${data.length} row(s).`);
    }

    testConnection();
  }, []);

  return (
    <main style={{ padding: '2rem', fontFamily: 'Arial, sans-serif' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between' }}>
        <div>
          <h1>Northgate HQ v2.0</h1>
          <p>Inventory migration applied. App wiring test.</p>
        </div>

        <SignedIn>
          <UserButton />
        </SignedIn>
      </header>

      <section style={{ marginTop: '2rem' }}>
        <SignedOut>
          <p>Please sign in to continue.</p>
          <SignInButton mode="modal">
            <button>Sign In</button>
          </SignInButton>
        </SignedOut>

        <SignedIn>
          <p>Signed in as {user?.fullName || user?.primaryEmailAddress?.emailAddress}</p>
        </SignedIn>
      </section>

      <section style={{ marginTop: '2rem' }}>
        <h2>Supabase Connection Test</h2>
        <p>
          <strong>Status:</strong> {status}
        </p>
        <p>{message}</p>
      </section>
    </main>
  );
}
