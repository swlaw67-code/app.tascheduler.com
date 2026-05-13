// app/login/page.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [companyCode, setCompanyCode] = useState('');
  const [password, setPassword]       = useState('');
  const [error, setError]             = useState('');
  const [loading, setLoading]         = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_code: companyCode.trim().toUpperCase(),
          password,
        }),
      });

      // Safely parse JSON — IIS may return non-JSON on some errors
      let data: { error?: string; expired?: boolean; success?: boolean } = {};
      try {
        data = await res.json();
      } catch {
        setError(`Server error (${res.status}). Please try again.`);
        return;
      }

      if (!res.ok || data.error) {
        setError(data.error || 'Login failed. Please check your credentials.');
        return;
      }

      // Redirect based on response
      if (data.expired) {
        router.push('/expired');
      } else {
        router.push('/schedule');
      }
    } catch {
      setError('Unable to reach the server. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-[var(--surface-bg)] p-4">
      {/* Background decoration */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute -top-40 -right-40 w-[600px] h-[600px] rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, #5363f8, transparent 70%)' }}
        />
        <div
          className="absolute -bottom-40 -left-40 w-[500px] h-[500px] rounded-full opacity-8"
          style={{ background: 'radial-gradient(circle, #292b87, transparent 70%)' }}
        />
      </div>

      <div className="relative w-full max-w-sm animate-slide-up">
        {/* Logo / Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-brand-600 shadow-lg shadow-brand-600/30 mb-4">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/>
              <line x1="8" y1="2" x2="8" y2="6"/>
              <line x1="3" y1="10" x2="21" y2="10"/>
              <line x1="8" y1="14" x2="10" y2="14"/>
              <line x1="12" y1="14" x2="16" y2="14"/>
              <line x1="8" y1="17" x2="10" y2="17"/>
              <line x1="12" y1="17" x2="16" y2="17"/>
            </svg>
          </div>
          <h1
            className="text-3xl text-[var(--text-primary)] mb-1"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            TASScheduler
          </h1>
          <p className="text-sm text-[var(--text-muted)]">
            Answering Service Workforce Scheduling
          </p>
        </div>

        {/* Login Card */}
        <div className="card p-8">
          <h2 className="text-base font-semibold text-[var(--text-primary)] mb-6">
            Sign in to your account
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label" htmlFor="company-code">
                Company Code
              </label>
              <input
                id="company-code"
                type="text"
                className="input font-mono tracking-widest uppercase"
                placeholder="YOURCODE"
                value={companyCode}
                onChange={e => setCompanyCode(e.target.value.toUpperCase())}
                maxLength={10}
                required
                autoFocus
                autoComplete="username"
              />
            </div>

            <div>
              <label className="label" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                type="password"
                className="input"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>

            {error && (
              <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 animate-fade-in">
                <svg className="w-4 h-4 mt-0.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8" x2="12" y2="12"/>
                  <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                {error}
              </div>
            )}

            <button
              type="submit"
              className="btn-primary w-full py-2.5 mt-2"
              disabled={loading}
            >
              {loading ? (
                <>
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 12a9 9 0 11-6.219-8.56"/>
                  </svg>
                  Signing in…
                </>
              ) : (
                'Sign In'
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-[var(--text-muted)] mt-6">
          © {new Date().getFullYear()} TASScheduler. All rights reserved.
        </p>
      </div>
    </main>
  );
}
