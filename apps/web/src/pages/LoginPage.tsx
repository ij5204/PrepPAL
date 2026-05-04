import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';

export function LoginPage() {
  const navigate = useNavigate();
  const { signInWithEmail, signUpWithEmail } = useAuthStore();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const result = mode === 'login'
      ? await signInWithEmail(email, password)
      : await signUpWithEmail(email, password, name);
    setLoading(false);
    if (result.error) { setError(result.error.message); return; }
    navigate('/dashboard');
  };

  return (
    <div style={styles.root}>
      <div style={styles.card}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={styles.logo} aria-hidden>PP</div>
          <div style={styles.title}>PrepPAL</div>
          <div style={styles.subtitle}>Plan meals, track nutrition, and keep your pantry organised.</div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {mode === 'signup' && (
            <input placeholder="Your name" value={name} onChange={e => setName(e.target.value)}
              style={inputStyle} />
          )}
          <input placeholder="Email" type="email" value={email} onChange={e => setEmail(e.target.value)}
            style={inputStyle} />
          <input placeholder="Password" type="password" value={password} onChange={e => setPassword(e.target.value)}
            style={inputStyle} />

          {error && <div style={{ color: '#ef4444', fontSize: 13 }}>{error}</div>}

          <button type="submit" disabled={loading} style={{
            ...styles.primaryBtn,
            borderRadius: 12, padding: '14px', fontSize: 16, fontWeight: 700,
            cursor: 'pointer', marginTop: 4, opacity: loading ? 0.7 : 1,
          }}>
            {loading ? 'Loading…' : mode === 'login' ? 'Log In' : 'Create Account'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <button onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
            style={{ background: 'none', border: 'none', color: 'rgba(199,210,254,0.95)', fontSize: 14, cursor: 'pointer' }}>
            {mode === 'login' ? "Don't have an account? Sign up" : 'Already have an account? Log in'}
          </button>
        </div>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  background: 'rgba(15, 23, 42, 0.65)',
  border: '1px solid rgba(148,163,184,0.22)',
  borderRadius: 12,
  padding: '13px 14px',
  fontSize: 15,
  color: '#f8fafc',
  outline: 'none',
};

const styles: Record<string, React.CSSProperties> = {
  root: {
    minHeight: '100vh',
    background:
      'radial-gradient(1200px 600px at 20% -10%, rgba(99,102,241,0.18), transparent 55%), radial-gradient(900px 450px at 90% 0%, rgba(16,185,129,0.07), transparent 55%), #0b0f17',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    width: 400,
    maxWidth: '100%',
    background: 'rgba(15, 23, 42, 0.72)',
    borderRadius: 18,
    padding: 34,
    border: '1px solid rgba(148,163,184,0.16)',
    boxShadow: '0 22px 60px rgba(0,0,0,0.55)',
    backdropFilter: 'blur(10px)',
  },
  logo: {
    width: 44,
    height: 44,
    borderRadius: 14,
    background: 'rgba(99,102,241,0.16)',
    border: '1px solid rgba(99,102,241,0.35)',
    color: '#c7d2fe',
    fontSize: 13,
    fontWeight: 900,
    letterSpacing: '0.7px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 12px',
  },
  title: { fontSize: 26, fontWeight: 850, color: '#f8fafc' },
  subtitle: { fontSize: 13, color: 'rgba(148,163,184,0.9)', marginTop: 6, lineHeight: 1.45 },
  primaryBtn: {
    background: 'linear-gradient(180deg, rgba(99,102,241,0.95), rgba(79,70,229,0.95))',
    color: '#0b0f17',
    border: '1px solid rgba(99,102,241,0.35)',
  },
};