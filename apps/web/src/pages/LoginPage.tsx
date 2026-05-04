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
            style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: 14, cursor: 'pointer' }}>
            {mode === 'login' ? "Don't have an account? Sign up" : 'Already have an account? Log in'}
          </button>
        </div>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  background: 'var(--surface-2)',
  border: '1px solid var(--border)',
  borderRadius: 12,
  padding: '13px 14px',
  fontSize: 15,
  color: 'var(--text-primary)',
  outline: 'none',
};

const styles: Record<string, React.CSSProperties> = {
  root: {
    minHeight: '100vh',
    background: 'var(--bg)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    width: 400,
    maxWidth: '100%',
    background: 'var(--surface)',
    borderRadius: 16,
    padding: 34,
    border: '1px solid var(--border)',
    boxShadow: 'var(--shadow-lg)',
  },
  title: { fontSize: 26, fontWeight: 800, color: 'var(--text-primary)' },
  subtitle: { fontSize: 13, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.45 },
  primaryBtn: {
    background: 'var(--accent)',
    color: 'var(--accent-text)',
    border: '1px solid var(--accent-border-strong)',
  },
};