'use client';
// app/company/breaks/page.tsx
// Breaks belongs under Company — mirrors desktop Company ribbon tab
import { useState, useEffect, useCallback } from 'react';
import AppShell from '@/components/layout/AppShell';
import BreaksPanel from '@/components/settings/BreaksPanel';

export default function BreaksPage() {
  const [breaks, setBreaks]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast]     = useState('');

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 3500); }

  const loadBreaks = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch('/api/breaks');
      const data = await res.json();
      setBreaks(data.breaks || []);
    } catch { showToast('Failed to load breaks.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadBreaks(); }, [loadBreaks]);

  return (
    <AppShell>
      <div className="p-6">
        <div className="mb-5">
          <h1 className="page-title">Breaks</h1>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Manage break types for scheduling
          </p>
        </div>
        {toast && (
          <div className="alert-success mb-4 animate-fade-in">
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
            {toast}
            <button className="ml-auto opacity-60 hover:opacity-100 text-xs"
                    onClick={() => setToast('')}>✕</button>
          </div>
        )}
        <div className="card p-5">
          {loading
            ? <div className="py-8 text-center text-sm text-[var(--text-muted)]">Loading…</div>
            : <BreaksPanel breaks={breaks} onReload={loadBreaks} onToast={showToast} />}
        </div>
      </div>
    </AppShell>
  );
}
