import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import type { User as PrepUser } from '@preppal/types';
import { supabase } from './lib/supabase';

type SystemEventRow = {
  id: string;
  event_type: string;
  source: string;
  payload: Record<string, unknown>;
  error: string | null;
  created_at: string;
};

export default function App() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [sessionActive, setSessionActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [users, setUsers] = useState<PrepUser[]>([]);
  const [events, setEvents] = useState<SystemEventRow[]>([]);
  const [me, setMe] = useState<PrepUser | null>(null);

  const isAdmin = useMemo(
    () => me?.role === 'admin' || me?.role === 'support_admin',
    [me]
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    setNotice(null);
    try {
      const [usersRes, eventsRes, userRes] = await Promise.all([
        supabase.from('users').select('*').order('created_at', { ascending: false }),
        supabase
          .from('system_events')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(100),
        supabase.auth.getUser(),
      ]);

      setUsers((usersRes.data as PrepUser[]) ?? []);
      setEvents((eventsRes.data as SystemEventRow[]) ?? []);

      const uid = userRes.data.user?.id ?? null;
      if (uid) {
        const { data: mine } = await supabase.from('users').select('*').eq('id', uid).single();
        setMe((mine as PrepUser) ?? null);
      } else setMe(null);
    } catch {
      setNotice('Could not load admin data.');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setSessionActive(!!data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) =>
      setSessionActive(!!session)
    );
    return () => {
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (sessionActive) void refresh();
  }, [sessionActive, refresh]);

  const logAudit = async (action: string) => {
    if (!me?.id || me.role !== 'admin') return;
    setNotice(null);
    const { error } = await supabase.from('audit_logs').insert({
      admin_id: me.id,
      action,
      metadata: { ts: new Date().toISOString() },
    });
    if (error) setNotice('Audit log rejected (needs admin role in database).');
    else setNotice('Audit event recorded.');
  };

  const signIn = async () => {
    setLoading(true);
    setNotice(null);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) setNotice(error.message);
    setLoading(false);
  };

  if (!sessionActive) {
    return (
      <main style={wrap}>
        <h1 style={h1}>PrepPAL Admin</h1>
        <p style={muted}>Sign in with an account that has role admin in Postgres.</p>
        <label style={label}>
          Email
          <input style={inp} value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label style={label}>
          Password
          <input
            style={inp}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <button style={btn} disabled={loading} type="button" onClick={() => void signIn()}>
          Sign in
        </button>
        {notice ? <p style={err}>{notice}</p> : null}
      </main>
    );
  }

  return (
    <main style={layout}>
      <header style={{ marginBottom: 24 }}>
        <h1 style={h1}>PrepPAL Admin</h1>
        <p style={muted}>Users and edge-function diagnostics ({me?.email ?? 'signed in'}).</p>
        {!isAdmin ? (
          <p style={err}>
            This account is not an admin in public.users — lists may be truncated by RLS.
          </p>
        ) : null}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
          <button style={ghost} type="button" disabled={loading} onClick={() => void refresh()}>
            Refresh data
          </button>
          {me?.role === 'admin' ? (
            <button style={ghost} type="button" onClick={() => void logAudit('ADMIN_DASHBOARD_PING')}>
              Record audit ping
            </button>
          ) : null}
          <button
            style={ghost}
            type="button"
            onClick={() =>
              supabase.auth
                .signOut()
                .then(() => setSessionActive(false))
                .catch(() => {})
            }
          >
            Sign out
          </button>
        </div>
        {notice ? <p style={{ color: '#6ee7b7' }}>{notice}</p> : null}
      </header>

      <section style={grid}>
        <div style={card}>
          <h2 style={h2}>Users</h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={table}>
              <thead>
                <tr>
                  <th style={th}>Name</th>
                  <th style={th}>Email</th>
                  <th style={th}>Joined</th>
                  <th style={th}>Last active</th>
                  <th style={th}>Role</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td style={td}>{u.name}</td>
                    <td style={td}>{u.email}</td>
                    <td style={td}>{fmt(u.created_at)}</td>
                    <td style={td}>{fmt(u.last_active_at ?? u.updated_at)}</td>
                    <td style={td}>{u.role}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div style={card}>
          <h2 style={h2}>Edge / system events (recent)</h2>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, maxHeight: 480, overflow: 'auto' }}>
            {events.map((ev) => (
              <li key={ev.id} style={eventRow}>
                <div style={{ fontWeight: 700 }}>
                  {ev.event_type}{' '}
                  <span style={mutedTiny}>{fmt(ev.created_at)}</span>
                </div>
                <div style={mutedTiny}>{ev.source}</div>
                {ev.error ? <div style={{ color: '#fca5a5' }}>{ev.error}</div> : null}
              </li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  );
}

function fmt(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

const wrap: CSSProperties = {
  fontFamily: '"Inter","Segoe UI","system-ui",sans-serif',
  maxWidth: 420,
  margin: '64px auto',
  padding: 24,
  color: '#f8fafc',
  background: '#0b1120',
  minHeight: '100vh',
};

const layout: CSSProperties = {
  ...wrap,
  maxWidth: 1100,
};

const grid: CSSProperties = {
  display: 'grid',
  gap: 20,
  gridTemplateColumns: '1fr',
};

const h1: CSSProperties = { fontSize: 28, marginBottom: 4 };
const h2: CSSProperties = { fontSize: 18, marginBottom: 12 };

const muted: CSSProperties = { color: '#94a3b8', marginTop: 8 };
const mutedTiny: CSSProperties = { color: '#64748b', fontSize: 12 };

const inp: CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 8,
  border: '1px solid #334155',
  marginTop: 6,
  background: '#020617',
  color: '#f1f5f9',
};
const label: CSSProperties = { display: 'block', marginTop: 12, fontSize: 14 };

const btn: CSSProperties = {
  marginTop: 16,
  width: '100%',
  padding: '12px 16px',
  borderRadius: 10,
  border: 'none',
  cursor: 'pointer',
  fontWeight: 700,
  background: '#22c55e',
  color: '#04120a',
};
const ghost: CSSProperties = {
  padding: '8px 14px',
  borderRadius: 8,
  border: '1px solid #334155',
  background: '#0f172a',
  color: '#e2e8f0',
  cursor: 'pointer',
};
const err: CSSProperties = { color: '#fca5a5', marginTop: 12 };

const card: CSSProperties = {
  background: '#0f172a',
  padding: 20,
  borderRadius: 12,
  border: '1px solid #1e293b',
};
const table: CSSProperties = { width: '100%', borderCollapse: 'collapse' };
const th: CSSProperties = {
  textAlign: 'left',
  padding: '10px 8px',
  borderBottom: '1px solid #334155',
  fontSize: 12,
};
const td: CSSProperties = { padding: '8px', borderBottom: '1px solid #1e293b', fontSize: 13 };

const eventRow: CSSProperties = {
  padding: '12px 0',
  borderBottom: '1px solid #1e293b',
};
