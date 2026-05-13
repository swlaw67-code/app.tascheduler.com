'use client';
// app/employees/skills/page.tsx
import { useState, useEffect, useCallback } from 'react';
import AppShell from '@/components/layout/AppShell';
import SkillsPanel from '@/components/settings/SkillsPanel';

export default function SkillsPage() {
  const [skills, setSkills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast]     = useState('');

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 3500); }

  const loadSkills = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch('/api/skills');
      const data = await res.json();
      setSkills(data.skills || []);
    } catch { showToast('Failed to load skills.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadSkills(); }, [loadSkills]);

  return (
    <AppShell>
      <div className="p-6">
        <div className="mb-5">
          <h1 className="page-title">Skills</h1>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Manage skill types, staffing needs, and scheduling priorities
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
            : <SkillsPanel skills={skills} onReload={loadSkills} onToast={showToast} />}
        </div>
      </div>
    </AppShell>
  );
}
