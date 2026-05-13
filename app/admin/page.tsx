'use client';
// app/admin/page.tsx
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import ImportModal from '@/components/admin/ImportModal';

interface Company {
  id: number; company_code: string; db_name: string;
  expired: number; created_at: string; last_login: string | null;
}

export default function AdminDashboard() {
  const router = useRouter();
  const [companies, setCompanies]   = useState<Company[]>([]);
  const [loading, setLoading]       = useState(true);
  const [showNew, setShowNew]       = useState(false);
  const [actionMsg, setActionMsg]   = useState('');
  const [importTarget, setImportTarget] = useState<{code: string; name: string} | null>(null);

  const loadCompanies = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/companies');
      let data: { companies?: unknown[]; error?: string } = {};
      try { data = await res.json(); } catch { /* non-JSON — IIS error */ }
      if (data.error === 'Unauthorized' || res.status === 401) {
        router.push('/admin/login'); return;
      }
      setCompanies((data.companies || []) as Company[]);
    } catch { setActionMsg('Failed to load companies.'); }
    finally { setLoading(false); }
  }, [router]);

  useEffect(() => { loadCompanies(); }, [loadCompanies]);

  async function toggleExpired(code: string, current: number) {
    await fetch(`/api/admin/companies/${code}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expired: !current, force_logout: !current }),
    });
    setActionMsg(`${code} ${!current ? 'suspended' : 'reactivated'}.`);
    loadCompanies();
  }

  async function forceLogout(code: string) {
    await fetch(`/api/admin/companies/${code}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ force_logout: true }),
    });
    setActionMsg(`${code} session cleared.`);
  }

  async function handleLogout() {
    await fetch('/api/admin/auth/logout', { method: 'POST' });
    router.push('/admin/login');
  }

  function formatDate(d: string | null) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-US',
      { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  return (
    <div className="min-h-screen bg-[var(--surface-bg)]">
      <header className="bg-[var(--surface-sidebar)] text-white px-6 py-3.5
                         flex items-center justify-between shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-[var(--brand-500)] flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
              <rect x="3" y="4" width="18" height="18" rx="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/>
              <line x1="8" y1="2" x2="8" y2="6"/>
              <line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
          </div>
          <span className="font-semibold text-sm">TASScheduler Admin</span>
        </div>
        <button onClick={handleLogout}
          className="text-xs text-[var(--text-sidebar)] hover:text-white transition-colors">
          Sign Out
        </button>
      </header>

      <main className="max-w-5xl mx-auto p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="page-title">Company Accounts</h1>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              {companies.length} {companies.length === 1 ? 'company' : 'companies'} registered
            </p>
          </div>
          <button className="btn-primary btn-sm" onClick={() => setShowNew(true)}>+ Add Company</button>
        </div>

        {actionMsg && (
          <div className="alert-success mb-4 animate-fade-in">
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
            {actionMsg}
            <button className="ml-auto text-xs opacity-60 hover:opacity-100"
              onClick={() => setActionMsg('')}>✕</button>
          </div>
        )}

        <div className="card overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-sm text-[var(--text-muted)]">Loading…</div>
          ) : companies.length === 0 ? (
            <div className="p-8 text-center text-sm text-[var(--text-muted)]">
              No companies yet. Click "Add Company" to get started.
            </div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Company Code</th><th>Database</th><th>Status</th>
                  <th>Created</th><th>Last Login</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {companies.map(c => (
                  <tr key={c.id}>
                    <td className="font-mono font-semibold text-[var(--brand-700)]">{c.company_code}</td>
                    <td className="font-mono text-xs text-[var(--text-muted)]">{c.db_name}</td>
                    <td>
                      {c.expired
                        ? <span className="badge-red">Suspended</span>
                        : <span className="badge-green">Active</span>}
                    </td>
                    <td className="text-xs text-[var(--text-muted)]">{formatDate(c.created_at)}</td>
                    <td className="text-xs text-[var(--text-muted)]">{formatDate(c.last_login)}</td>
                    <td>
                      <div className="flex items-center gap-2">
                        <button
                          className={`btn btn-sm border ${c.expired
                            ? 'text-green-700 border-green-300 hover:bg-green-50'
                            : 'text-amber-700 border-amber-300 hover:bg-amber-50'} bg-white`}
                          onClick={() => toggleExpired(c.company_code, c.expired)}>
                          {c.expired ? 'Reactivate' : 'Suspend'}
                        </button>
                        <button
                          className="btn btn-sm bg-white border border-[var(--border)]
                                     text-[var(--text-secondary)] hover:bg-[var(--surface-bg)]"
                          onClick={() => forceLogout(c.company_code)}>
                          Kick
                        </button>
                        <button
                          className="btn btn-sm bg-white border border-blue-200
                                     text-blue-700 hover:bg-blue-50"
                          onClick={() => setImportTarget({ code: c.company_code, name: c.company_code })}>
                          Import
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card mt-6 p-5">
          <h2 className="section-title mb-3">Adding a New Company — Database Setup</h2>
          <p className="text-sm text-[var(--text-secondary)] mb-3">
            Before adding a company here, create their database in Plesk first:
          </p>
          <ol className="text-sm text-[var(--text-secondary)] space-y-1.5 list-decimal list-inside">
            <li>In Plesk → Databases → <strong>Add Database</strong></li>
            <li>Name it <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">tas_COMPANYCODE</code></li>
            <li>Add a database user named <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">COMPANYCODE</code> scoped to that database only</li>
            <li>Run <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">company_schema.sql</code> in phpMyAdmin</li>
            <li>Then click <strong>Add Company</strong> above</li>
          </ol>
        </div>
      </main>

      {importTarget && (
        <ImportModal
          companyCode={importTarget.code}
          companyName={importTarget.name}
          onClose={() => setImportTarget(null)}
        />
      )}

      {showNew && (
        <NewCompanyModal
          onClose={() => setShowNew(false)}
          onCreated={() => {
            setShowNew(false); loadCompanies();
            setActionMsg('Company created successfully.');
          }}
        />
      )}
    </div>
  );
}

function NewCompanyModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ company_code: '', password: '', db_user: '', db_pass: '' });
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);

  const code    = form.company_code.toUpperCase();
  const db_name = code ? `tas_${code}` : 'tas_';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      const res  = await fetch('/api/admin/companies', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, company_code: code, db_name }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to create.'); return; }
      onCreated();
    } catch { setError('Connection error.'); }
    finally { setLoading(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md animate-slide-up">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
          <h2 className="section-title">Add New Company</h2>
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div>
            <label className="label">Company Code <span className="text-[var(--text-muted)] normal-case font-normal">(max 10 chars)</span></label>
            <input className="input font-mono uppercase tracking-widest"
              value={form.company_code} maxLength={10} required
              onChange={e => setForm(f => ({ ...f, company_code: e.target.value.toUpperCase() }))}
              placeholder="ACME01" />
            {code && (
              <p className="text-xs text-[var(--text-muted)] mt-1">
                Database: <code className="bg-gray-100 px-1 rounded">{db_name}</code>
              </p>
            )}
          </div>
          <div>
            <label className="label">Scheduler Login Password</label>
            <input className="input" type="password" required value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              placeholder="Password for the scheduler login" />
          </div>
          <div className="border-t border-[var(--border)] pt-4">
            <p className="text-xs text-[var(--text-muted)] mb-3">
              Database user credentials — created in Plesk for this company's database
            </p>
            <div className="space-y-3">
              <div>
                <label className="label">Database Username</label>
                <input className="input font-mono text-xs" value={form.db_user} required
                  onChange={e => setForm(f => ({ ...f, db_user: e.target.value }))}
                  placeholder="COMPANYCODE (same as company code)" />
              </div>
              <div>
                <label className="label">Database Password</label>
                <input className="input" type="password" required value={form.db_pass}
                  onChange={e => setForm(f => ({ ...f, db_pass: e.target.value }))}
                  placeholder="Database user password from Plesk" />
              </div>
            </div>
          </div>
          {error && <div className="alert-error text-xs">{error}</div>}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" className="btn-primary flex-1" disabled={loading}>
              {loading ? 'Creating…' : 'Create Company'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
