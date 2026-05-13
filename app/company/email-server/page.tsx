'use client';
// app/company/email-server/page.tsx
// Mirrors CCompanyServerDlg — SMTP email server configuration
// Fields: Sender, Sender Email, SMTP Server, Port, Encrypt (dropdown), User, Password

import { useState, useEffect, useCallback } from 'react';
import AppShell from '@/components/layout/AppShell';

interface EmailServerForm {
  sender:       string;
  sender_email: string;
  server:       string;
  port:         number;
  user:         string;
  password:     string;
  encrypt:      number;
}

const ENCRYPT_OPTIONS = ['None', 'SSL', 'TLS', 'Auto'];

const defaults: EmailServerForm = {
  sender: '', sender_email: '', server: '',
  port: 587, user: '', password: '', encrypt: 1,
};

export default function EmailServerPage() {
  const [form, setForm]       = useState<EmailServerForm>(defaults);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);
  const [error, setError]     = useState('');
  const [isDirty, setIsDirty] = useState(false);

  const load = useCallback(async () => {
    try {
      const res  = await fetch('/api/email-server');
      const data = await res.json();
      if (data.server) {
        const s = data.server;
        setForm({
          sender:       s.sender       ?? '',
          sender_email: s.sender_email ?? '',
          server:       s.server       ?? '',
          port:         Number(s.port  ?? 587),
          user:         s.user         ?? '',
          password:     s.password     ?? '',
          encrypt:      Number(s.encrypt ?? 1),
        });
      }
    } catch { setError('Failed to load email server settings.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  function set<K extends keyof EmailServerForm>(key: K, val: EmailServerForm[K]) {
    setForm(f => ({ ...f, [key]: val }));
    setIsDirty(true);
    setSaved(false);
  }

  async function handleSave() {
    setSaving(true); setError('');
    try {
      const res  = await fetch('/api/email-server', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to save.'); return; }
      setSaved(true); setIsDirty(false);
      setTimeout(() => setSaved(false), 3000);
    } catch { setError('Connection error.'); }
    finally { setSaving(false); }
  }

  if (loading) {
    return <AppShell><div className="p-6 text-sm text-[var(--text-muted)]">Loading…</div></AppShell>;
  }

  return (
    <AppShell>
      <div className="p-6">

        {/* Header — matches settings/company edit style */}
        <div className="flex items-center justify-between mb-5 lg:max-w-[480px]">
          <div>
            <h1 className="page-title">Email Server</h1>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              SMTP configuration for outgoing email
            </p>
          </div>
          <div className="flex items-center gap-3">
            {isDirty && !saving && (
              <span className="text-xs text-[var(--text-muted)]">Unsaved changes</span>
            )}
            {saved && (
              <span className="text-xs text-green-600 flex items-center gap-1">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                Saved
              </span>
            )}
            <button className="btn-primary btn-sm" disabled={saving || !isDirty}
              onClick={handleSave}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>

        {error && <div className="alert-error mb-4 text-xs lg:max-w-[480px]">{error}</div>}

        {/* Single card — narrow, matches right-column width style */}
        <div className="card p-5 w-full lg:max-w-[480px]">
          <div className="space-y-3">

            <div>
              <label className="label">Sender Name</label>
              <input className="input" value={form.sender} maxLength={50}
                placeholder="Answering Service Name"
                onChange={e => set('sender', e.target.value)} />
            </div>

            <div>
              <label className="label">Sender Email</label>
              <input className="input" type="email" value={form.sender_email} maxLength={50}
                placeholder="noreply@example.com"
                onChange={e => set('sender_email', e.target.value)} />
            </div>

            <div>
              <label className="label">SMTP Server</label>
              <input className="input" value={form.server} maxLength={50}
                placeholder="smtp.example.com"
                onChange={e => set('server', e.target.value)} />
            </div>

            <div className="flex gap-3">
              <div className="w-28 shrink-0">
                <label className="label">Port</label>
                <input className="input text-center" type="number" min={1} max={65535}
                  value={form.port}
                  onChange={e => set('port', Math.min(65535, Math.max(1, +e.target.value || 587)))} />
              </div>
              <div className="flex-1">
                <label className="label">Encryption</label>
                <select className="select" value={form.encrypt}
                  onChange={e => set('encrypt', +e.target.value)}>
                  {ENCRYPT_OPTIONS.map((opt, i) => (
                    <option key={i} value={i}>{opt}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="label">Username</label>
              <input className="input" value={form.user} maxLength={50}
                placeholder="SMTP username"
                onChange={e => set('user', e.target.value)} />
            </div>

            <div>
              <label className="label">Password</label>
              <input className="input" type="password" value={form.password} maxLength={255}
                placeholder="SMTP password"
                onChange={e => set('password', e.target.value)} />
            </div>

          </div>
        </div>

      </div>
    </AppShell>
  );
}
