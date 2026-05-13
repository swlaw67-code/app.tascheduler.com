'use client';
// components/settings/SkillNeedsDialog.tsx
import { useState, useEffect } from 'react';
import { DAY_NAMES, formatTime } from '@/lib/types';

interface SkillNeed {
  id: number; skill_id: number; day: number; number: number;
  start_hour: number; start_minute: number; stop_hour: number; stop_minute: number;
}
interface Props { skillId: number; skillName: string; military: boolean; onClose: () => void; }

const HOURS   = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = [0, 15, 30, 45];

function needLabel(need: SkillNeed, military: boolean): string {
  const start = formatTime(need.start_hour, need.start_minute, military);
  const stop  = formatTime(need.stop_hour,  need.stop_minute,  military);
  return `${need.number}: ${DAY_NAMES[need.day]}: ${start}-${stop}`;
}

export default function SkillNeedsDialog({ skillId, skillName, military, onClose }: Props) {
  const [needs, setNeeds]               = useState<SkillNeed[]>([]);
  const [loading, setLoading]           = useState(true);
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [selectedNeedId, setSelectedNeedId] = useState<number | null>(null);
  const [number, setNumber]             = useState(1);
  const [startHour, setStartHour]       = useState(0);
  const [startMinute, setStartMinute]   = useState(0);
  const [stopHour, setStopHour]         = useState(0);
  const [stopMinute, setStopMinute]     = useState(0);
  const [saving, setSaving]             = useState(false);
  const [error, setError]               = useState('');

  useEffect(() => { loadNeeds(); }, []);

  async function loadNeeds() {
    setLoading(true);
    try {
      const res  = await fetch(`/api/skill-needs/${skillId}`);
      const data = await res.json();
      setNeeds(data.needs || []);
    } catch { setError('Failed to load needs.'); }
    finally { setLoading(false); }
  }

  function toggleDay(day: number) {
    setSelectedDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    );
  }

  function toggleAll() {
    setSelectedDays(selectedDays.length === 7 ? [] : [0, 1, 2, 3, 4, 5, 6]);
  }

  async function handleAdd() {
    if (selectedDays.length === 0) { setError('Select at least one day.'); return; }
    if (number < 1) { setError('Needed must be at least 1.'); return; }
    setSaving(true); setError('');
    try {
      // Explicitly send integers
      const payload = {
        skill_id:     skillId,
        days:         selectedDays.map(d => parseInt(String(d), 10)),
        number:       parseInt(String(number), 10),
        start_hour:   parseInt(String(startHour), 10),
        start_minute: parseInt(String(startMinute), 10),
        stop_hour:    parseInt(String(stopHour), 10),
        stop_minute:  parseInt(String(stopMinute), 10),
      };
      const res  = await fetch('/api/skill-needs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (data.error) { setError(data.error); return; }
      await loadNeeds();
      setSelectedDays([]);
    } catch {
      setError('Connection error.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (selectedNeedId === null) return;
    const need = needs.find(n => n.id === selectedNeedId);
    if (!need) return;
    if (!confirm(`Delete: ${needLabel(need, military)}?`)) return;
    try {
      await fetch('/api/skill-needs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ _method: 'DELETE', id: selectedNeedId }),
      });
      setSelectedNeedId(null);
      await loadNeeds();
    } catch { setError('Failed to delete.'); }
  }

  async function handleDeleteAll() {
    if (!needs.length) return;
    if (!confirm('Are you sure you want to Delete All?')) return;
    try {
      await fetch(`/api/skill-needs/${skillId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ _method: 'DELETE_ALL' }),
      });
      setSelectedNeedId(null);
      await loadNeeds();
    } catch { setError('Failed to delete all.'); }
  }

  function hourLabel(h: number): string {
    if (military) return String(h).padStart(2, '0') + ':00';
    const h12 = h % 12 || 12;
    const ampm = h < 12 ? 'AM' : 'PM';
    return `${h12}:00 ${ampm}`;
  }

  function minuteLabel(m: number): string {
    return ':' + String(m).padStart(2, '0');
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl animate-slide-up">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--border)]">
          <h2 className="section-title">Skill Needs — {skillName}</h2>
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div className="flex">

          {/* Left panel */}
          <div className="w-60 shrink-0 p-4 border-r border-[var(--border)]">

            {/* Day checkboxes */}
            <div className="flex items-center justify-between mb-1.5">
              <label className="label mb-0">Days:</label>
              <button type="button" onClick={toggleAll}
                className="text-[10px] text-[var(--brand-600)] hover:text-[var(--brand-800)] font-medium">
                {selectedDays.length === 7 ? 'Deselect All' : 'Select All'}
              </button>
            </div>

            <div className="border border-[var(--border)] rounded-md overflow-hidden mb-4">
              {DAY_NAMES.map((day, i) => (
                <label key={i}
                  className={`flex items-center gap-2.5 px-3 py-1.5 cursor-pointer
                              border-b border-[var(--border)] last:border-b-0 select-none
                              transition-colors text-sm
                              ${selectedDays.includes(i)
                                ? 'bg-[var(--surface-active)] text-[var(--brand-700)] font-medium'
                                : 'hover:bg-[var(--surface-hover)]'}`}>
                  <input type="checkbox" checked={selectedDays.includes(i)}
                    onChange={() => toggleDay(i)}
                    className="rounded border-gray-300 text-[var(--brand-600)]" />
                  {day}
                </label>
              ))}
            </div>

            {/* Needed */}
            <div className="mb-3">
              <label className="label">Needed:</label>
              <input className="input input-sm w-24" type="number" min={1} max={255}
                value={number} onChange={e => setNumber(parseInt(e.target.value) || 1)} />
            </div>

            {/* Start Time — wider dropdowns */}
            <div className="mb-3">
              <label className="label">Start Time:</label>
              <div className="flex items-center gap-1.5">
                <select className="select text-xs flex-1" value={startHour}
                  onChange={e => setStartHour(+e.target.value)}>
                  {HOURS.map(h => (
                    <option key={h} value={h}>{hourLabel(h)}</option>
                  ))}
                </select>
                <select className="select text-xs w-16" value={startMinute}
                  onChange={e => setStartMinute(+e.target.value)}>
                  {MINUTES.map(m => (
                    <option key={m} value={m}>{minuteLabel(m)}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Stop Time — wider dropdowns */}
            <div className="mb-4">
              <label className="label">Stop Time:</label>
              <div className="flex items-center gap-1.5">
                <select className="select text-xs flex-1" value={stopHour}
                  onChange={e => setStopHour(+e.target.value)}>
                  {HOURS.map(h => (
                    <option key={h} value={h}>{hourLabel(h)}</option>
                  ))}
                </select>
                <select className="select text-xs w-16" value={stopMinute}
                  onChange={e => setStopMinute(+e.target.value)}>
                  {MINUTES.map(m => (
                    <option key={m} value={m}>{minuteLabel(m)}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Buttons */}
            <div className="flex flex-col gap-2">
              <button className="btn-primary btn-sm w-full" onClick={handleAdd}
                disabled={saving || selectedDays.length === 0}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" strokeWidth="2">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
                {saving
                  ? 'Adding…'
                  : selectedDays.length > 1
                    ? `Add (${selectedDays.length} days)`
                    : 'Add'}
              </button>
              <button
                className="btn btn-sm w-full bg-white border border-red-200 text-red-600
                           hover:bg-red-50 disabled:opacity-40"
                onClick={handleDelete} disabled={selectedNeedId === null}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6l-1 14H6L5 6"/>
                  <path d="M10 11v6M14 11v6"/>
                </svg>
                Delete
              </button>
              <button
                className="btn btn-sm w-full bg-white border border-[var(--border)]
                           text-[var(--text-secondary)] hover:border-red-200 hover:text-red-600
                           disabled:opacity-40"
                onClick={handleDeleteAll} disabled={needs.length === 0}>
                Delete All
              </button>
            </div>
          </div>

          {/* Right panel — needs list */}
          <div className="flex-1 p-4 flex flex-col">
            <label className="label mb-1">
              Needs List:
              <span className="text-[var(--text-muted)] font-normal ml-1">
                ({needs.length} {needs.length === 1 ? 'entry' : 'entries'})
              </span>
            </label>
            <div className="flex-1 border border-[var(--border)] rounded-md overflow-y-auto"
                 style={{ minHeight: '320px' }}>
              {loading ? (
                <p className="text-xs text-[var(--text-muted)] p-3">Loading…</p>
              ) : needs.length === 0 ? (
                <p className="text-xs text-[var(--text-muted)] p-3">
                  No needs defined. Check days, set the time and count, then click Add.
                </p>
              ) : (
                needs.map(need => (
                  <div key={need.id}
                       onClick={() => setSelectedNeedId(
                         need.id === selectedNeedId ? null : need.id
                       )}
                       className={`px-3 py-1.5 text-sm cursor-pointer select-none font-mono
                                   border-b border-[var(--border)] last:border-b-0
                                   ${selectedNeedId === need.id
                                     ? 'bg-[var(--brand-600)] text-white'
                                     : 'hover:bg-[var(--surface-hover)]'}`}>
                    {needLabel(need, military)}
                  </div>
                ))
              )}
            </div>
            {error && <div className="alert-error mt-3 text-xs">{error}</div>}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end px-5 py-3.5 border-t border-[var(--border)]">
          <button className="btn-secondary" onClick={onClose}>Save &amp; Close</button>
        </div>
      </div>
    </div>
  );
}
