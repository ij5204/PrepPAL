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
    <div style={{ minHeight: '100vh', background: '#0f1117', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 380, background: '#1a1f2e', borderRadius: 20, padding: 36, border: '1px solid #1f2937' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>🥦</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#f9fafb' }}>PrepPAL</div>
          <div style={{ fontSize: 14, color: '#9ca3af', marginTop: 4 }}>Your personal meal helper</div>
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
            background: '#22c55e', color: '#0f1117', border: 'none',
            borderRadius: 12, padding: '14px', fontSize: 16, fontWeight: 700,
            cursor: 'pointer', marginTop: 4, opacity: loading ? 0.7 : 1,
          }}>
            {loading ? 'Loading…' : mode === 'login' ? 'Log In' : 'Create Account'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <button onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
            style={{ background: 'none', border: 'none', color: '#22c55e', fontSize: 14, cursor: 'pointer' }}>
            {mode === 'login' ? "Don't have an account? Sign up" : 'Already have an account? Log in'}
          </button>
        </div>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  background: '#111827', border: '1px solid #374151', borderRadius: 12,
  padding: '13px 14px', fontSize: 15, color: '#f9fafb', outline: 'none',
};