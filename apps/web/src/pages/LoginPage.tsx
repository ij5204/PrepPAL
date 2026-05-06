import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';

const inp: React.CSSProperties = {
  background: 'var(--surf2)',
  border: '1px solid var(--bdr2)',
  borderRadius: 9,
  padding: '13px 16px',
  fontSize: 14,
  color: 'var(--txt)',
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
  fontFamily: 'var(--fb)',
  transition: 'border-color .15s',
};

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
    try {
      const result = mode === 'login'
        ? await signInWithEmail(email, password)
        : await signUpWithEmail(email, password, name);
      if (result.error) { setError(result.error.message); return; }
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.message ?? 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: '#050505',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
    }}>
      {/* Subtle grid bg */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none',
        background: 'radial-gradient(ellipse at 60% 40%, rgba(200,255,0,.05) 0%, transparent 60%)',
      }} />

      <div style={{ width: 420, maxWidth: '100%', position: 'relative', zIndex: 1 }}>
        {/* Brand */}
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{
            fontFamily: 'var(--fd)', fontSize: 48, letterSpacing: 4,
            color: 'var(--acc)', lineHeight: 1, marginBottom: 8,
          }}>
            PREPPAL
          </div>
          <div style={{ fontSize: 13, color: 'var(--txt2)', lineHeight: 1.6 }}>
            AI-powered meal planning · Reduce food waste · Hit your goals
          </div>
        </div>

        {/* Card */}
        <div style={{
          background: 'var(--surf)',
          border: '1px solid var(--bdr2)',
          borderRadius: 'var(--rad-xl)',
          padding: 32,
        }}>
          {/* Mode toggle */}
          <div style={{ display: 'flex', background: 'var(--surf2)', borderRadius: 8, padding: 3, marginBottom: 24, border: '1px solid var(--bdr)' }}>
            {(['login', 'signup'] as const).map(m => (
              <button
                key={m}
                type="button"
                onClick={() => { setMode(m); setError(''); }}
                style={{
                  flex: 1,
                  padding: '8px',
                  fontSize: 12,
                  fontWeight: 600,
                  fontFamily: 'var(--fd)',
                  letterSpacing: '1.5px',
                  borderRadius: 6,
                  border: 'none',
                  cursor: 'pointer',
                  background: mode === m ? 'var(--acc)' : 'transparent',
                  color: mode === m ? 'var(--dark)' : 'var(--txt2)',
                  transition: 'all .15s',
                }}
              >
                {m === 'login' ? 'LOG IN' : 'SIGN UP'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {mode === 'signup' && (
              <input
                placeholder="Your name"
                value={name}
                onChange={e => setName(e.target.value)}
                style={inp}
                autoFocus
              />
            )}
            <input
              placeholder="Email address"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              style={inp}
              autoFocus={mode === 'login'}
            />
            <input
              placeholder="Password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              style={inp}
            />

            {error && (
              <div style={{
                background: 'rgba(255,77,0,.08)',
                border: '1px solid rgba(255,77,0,.22)',
                borderRadius: 9,
                padding: '10px 14px',
                fontSize: 13,
                color: '#FF7A50',
              }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="tbBtn"
              style={{ padding: '14px', fontSize: 16, borderRadius: 9, marginTop: 4, width: '100%', opacity: loading ? 0.7 : 1 }}
            >
              {loading ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
                  <span className="animate-spin" style={{ display: 'inline-block', width: 16, height: 16, border: '2px solid rgba(0,0,0,.2)', borderTopColor: 'var(--dark)', borderRadius: '50%' }} />
                  Loading…
                </span>
              ) : mode === 'login' ? 'LOG IN' : 'CREATE ACCOUNT'}
            </button>
          </form>
        </div>

        <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--txt3)', marginTop: 20 }}>
          Your nutrition data is private and never shared.
        </p>
      </div>
    </div>
  );
}
