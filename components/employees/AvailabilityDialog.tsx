'use client';
// components/employees/AvailabilityDialog.tsx
// Mirrors CAvailableDlg exactly from AvailableDlg.cpp
//
// Layout (matches IDD_AVAILABLE_DLG resource):
//   Left:   Days listbox (multi-select, Sunday-Saturday)
//           Start Time, Stop Time
//   Middle: Add, Delete, Delete All buttons
//   Right:  Availability List (read-only, shows "Day: start-stop")
//   Bottom: Save, Cancel
//
// Format: "Sunday: 8:00a-5:00p" — matches ListRecords Format2()

import { useState, useEffect } from 'react';
import { DAY_NAMES, formatTime } from '@/lib/types';

interface AvailEntry {
  id:           number;
  employee_id:  number;
  day:          number;
  start_hour:   number;
  start_minute: number;
  stop_hour:    number;
  stop_minute:  number;
  special:      number;
}

interface Props {
  employeeId:  number;
  employeeName: string;
  special:     boolean;   // false = regular avail, true = special avail
  military:    boolean;
  onClose:     () => void;
}

const HOURS   = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = [0, 15, 30, 45];

function entryLabel(e: AvailEntry, military: boolean): string {
  const start = formatTime(e.start_hour, e.start_minute, military);
  const stop  = formatTime(e.stop_hour,  e.stop_minute,  military);
  return `${DAY_NAMES[e.day]}: ${start}-${stop}`;
}

export default function AvailabilityDialog({
  employeeId, employeeName, special, military, onClose
}: Props) {
  const [entries, setEntries]           = useState<AvailEntry[]>([]);
  const [loading, setLoading]           = useState(true);
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [selectedEntryId, setSelectedEntryId] = useState<number | null>(null);
  const [startHour, setStartHour]       = useState(0);
  const [startMinute, setStartMinute]   = useState(0);
  const [stopHour, setStopHour]         = useState(0);
  const [stopMinute, setStopMinute]     = useState(0);
  const [saving, setSaving]             = useState(false);
  const [error, setError]               = useState('');

  useEffect(() => { loadEntries(); }, []);

  async function loadEntries() {
    setLoading(true);
    try {
      const res  = await fetch(
        `/api/employees/${employeeId}/availability?special=${special ? '1' : '0'}`
      );
      const data = await res.json();
      setEntries(data.availability || []);
    } catch { setError('Failed to load availability.'); }
    finally { setLoading(false); }
  }

  function toggleDay(day: number) {
    setSelectedDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    );
  }

  async function handleAdd() {
    if (selectedDays.length === 0) { setError('Select at least one day.'); return; }
    setSaving(true); setError('');
    try {
      for (const day of selectedDays) {
        await fetch(`/api/employees/${employeeId}/availability`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            day,
            special,
            slots: [{
              start_hour:   startHour,
              start_minute: startMinute,
              stop_hour:    stopHour,
              stop_minute:  stopMinute,
            }],
          }),
        });
      }
      await loadEntries();
      setSelectedDays([]);
    } catch { setError('Connection error.'); }
    finally { setSaving(false); }
  }

  async function handleDelete() {
    if (selectedEntryId === null) return;
    const entry = entries.find(e => e.id === selectedEntryId);
    if (!entry) return;
    if (!confirm(`Delete: ${entryLabel(entry, military)}?`)) return;
    try {
      // Delete this specific entry by clearing that day's availability
      // and re-adding any remaining entries for that day
      const sameDayEntries = entries.filter(
        e => e.day === entry.day && e.id !== selectedEntryId
      );
      await fetch(`/api/employees/${employeeId}/availability`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          day:     entry.day,
          special,
          slots:   sameDayEntries.map(e => ({
            start_hour:   e.start_hour,
            start_minute: e.start_minute,
            stop_hour:    e.stop_hour,
            stop_minute:  e.stop_minute,
          })),
        }),
      });
      setSelectedEntryId(null);
      await loadEntries();
    } catch { setError('Failed to delete.'); }
  }

  async function handleDeleteAll() {
    if (!entries.length) return;
    if (!confirm('Are you sure you want to Delete All?')) return;
    try {
      // Clear all 7 days
      for (let day = 0; day < 7; day++) {
        await fetch(`/api/employees/${employeeId}/availability`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ day, special, slots: [] }),
        });
      }
      setSelectedEntryId(null);
      await loadEntries();
    } catch { setError('Failed to delete all.'); }
  }

  function TimeSelect({
    hour, minute, onHour, onMinute,
  }: {
    hour: number; minute: number;
    onHour: (h: number) => void; onMinute: (m: number) => void;
  }) {
    return (
      <div className="flex items-center gap-1">
        <select className="select input-sm text-xs flex-1" value={hour}
          onChange={e => onHour(+e.target.value)}>
          {HOURS.map(h => (
            <option key={h} value={h}>
              {military
                ? String(h).padStart(2,'0') + ':00'
                : `${h % 12 || 12}:00 ${h < 12 ? 'AM' : 'PM'}`}
            </option>
          ))}
        </select>
        <span className="text-[var(--text-muted)] text-xs">:</span>
        <select className="select input-sm text-xs w-14" value={minute}
          onChange={e => onMinute(+e.target.value)}>
          {MINUTES.map(m => (
            <option key={m} value={m}>{String(m).padStart(2,'0')}</option>
          ))}
        </select>
      </div>
    );
  }

  const title = special
    ? `SPECIAL AVAILABILITY — ${employeeName.toUpperCase()}`
    : `EMPLOYEE SHIFT AVAILABILITY — ${employeeName.toUpperCase()}`;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-xl">

        {/* Title */}
        <div className="px-5 py-3 border-b border-[var(--border)] text-center">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-primary)]">
            {title}
          </h3>
        </div>

        {/* Body — mirrors IDD_AVAILABLE_DLG layout */}
        <div className="flex p-4 gap-3">

          {/* Left: Days + times */}
          <div className="w-44 shrink-0">
            <label className="label mb-1">Days:</label>
            <div className="border border-[var(--border)] rounded-md overflow-hidden mb-3">
              {DAY_NAMES.map((day, i) => (
                <div key={i} onClick={() => toggleDay(i)}
                     className={`px-3 py-1.5 text-sm cursor-pointer select-none border-b
                                 border-[var(--border)] last:border-b-0
                                 ${selectedDays.includes(i)
                                   ? 'bg-[var(--brand-600)] text-white'
                                   : 'hover:bg-[var(--surface-hover)]'}`}>
                  {day}
                </div>
              ))}
            </div>

            <div className="mb-2">
              <label className="label">Start Time:</label>
              <TimeSelect hour={startHour} minute={startMinute}
                onHour={setStartHour} onMinute={setStartMinute} />
            </div>
            <div>
              <label className="label">Stop Time:</label>
              <TimeSelect hour={stopHour} minute={stopMinute}
                onHour={setStopHour} onMinute={setStopMinute} />
            </div>
          </div>

          {/* Middle: Buttons — mirrors Add/Delete/DeleteAll button column */}
          <div className="flex flex-col gap-2 pt-7 w-24 shrink-0">
            <button
              className="btn-primary btn-sm text-xs w-full"
              onClick={handleAdd}
              disabled={saving || selectedDays.length === 0}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" strokeWidth="2" className="mr-1 inline">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
              Add
            </button>
            <button
              className="btn btn-sm text-xs w-full bg-white border border-red-200
                         text-red-600 hover:bg-red-50 disabled:opacity-40"
              onClick={handleDelete}
              disabled={selectedEntryId === null}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" strokeWidth="2" className="mr-1 inline">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6l-1 14H6L5 6"/>
              </svg>
              Delete
            </button>
            <button
              className="btn btn-sm text-xs w-full bg-white border border-[var(--border)]
                         text-[var(--text-secondary)] hover:border-red-200 hover:text-red-600
                         disabled:opacity-40"
              onClick={handleDeleteAll}
              disabled={entries.length === 0}
            >
              Delete All
            </button>
          </div>

          {/* Right: Availability List */}
          <div className="flex-1 flex flex-col">
            <label className="label mb-1">Availability List:</label>
            <div className="flex-1 border border-[var(--border)] rounded-md overflow-y-auto"
                 style={{ minHeight: '220px' }}>
              {loading ? (
                <p className="text-xs text-[var(--text-muted)] p-2">Loading…</p>
              ) : entries.length === 0 ? (
                <p className="text-xs text-[var(--text-muted)] p-2">
                  No availability defined. Select day(s), set times, click Add.
                </p>
              ) : (
                entries.map(entry => (
                  <div key={entry.id}
                       onClick={() => setSelectedEntryId(
                         entry.id === selectedEntryId ? null : entry.id
                       )}
                       className={`px-2 py-1.5 text-sm cursor-pointer select-none
                                   border-b border-[var(--border)] last:border-b-0
                                   ${selectedEntryId === entry.id
                                     ? 'bg-[var(--brand-600)] text-white'
                                     : 'hover:bg-[var(--surface-hover)]'}`}>
                    {entryLabel(entry, military)}
                  </div>
                ))
              )}
            </div>
            {error && <div className="alert-error mt-2 text-xs">{error}</div>}
          </div>
        </div>

        {/* Footer — Save, Cancel */}
        <div className="flex items-center justify-between px-5 py-3
                        border-t border-[var(--border)] bg-[var(--surface-stripe)]">
          <button className="btn-primary btn-sm" onClick={onClose}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" strokeWidth="2" className="mr-1 inline">
              <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/>
              <polyline points="17 21 17 13 7 13 7 21"/>
            </svg>
            Save
          </button>
          <button className="btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
