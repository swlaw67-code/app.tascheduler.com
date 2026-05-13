'use client';
// app/forecast/page.tsx
// Mirrors CForecastView + CForecastDlg from the desktop app
// Shows forecast list, creates/loads forecasts, edits the 7×24×4 data grid

import { useState, useEffect, useCallback, useRef } from 'react';
import AppShell from '@/components/layout/AppShell';
import Modal from '@/components/ui/Modal';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { DAY_SHORT, formatTime } from '@/lib/types';
import { calculateWeeklyStaffing, type ForecastSlot } from '@/lib/erlang';

interface ForecastSummary {
  id: number; week_date: string; test_number: number;
  efficiency: number; weeks: number; erlang_c: number;
  service_level: number; target_answer_time: number;
  published: number; archived: number;
}

interface ForecastData {
  day: number; hour: number; quarter: number;
  ave_calls: number; ave_talk_time: number;
  ave_calls_adj: number; ave_talk_time_adj: number; ave_agent_adj: number;
}

// Grid cell key
const key = (day: number, hour: number, q: number) => `${day}-${hour}-${q}`;

// View modes — mirrors ShowWeekly/ShowTotals toggle from desktop
type ViewMode = 'weekly' | 'daily';
type DataField = 'calls' | 'talk_time' | 'agents';

export default function ForecastPage() {
  const [forecasts, setForecasts]   = useState<ForecastSummary[]>([]);
  const [selected, setSelected]     = useState<ForecastSummary | null>(null);
  const [gridData, setGridData]     = useState<Map<string, ForecastData>>(new Map());
  const [loading, setLoading]       = useState(true);
  const [gridLoading, setGridLoading] = useState(false);
  const [viewMode, setViewMode]     = useState<ViewMode>('weekly');
  const [dataField, setDataField]   = useState<DataField>('calls');
  const [activeDay, setActiveDay]   = useState(0);
  const [newOpen, setNewOpen]       = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ForecastSummary | null>(null);
  const [toast, setToast]           = useState('');
  const saveTimer                   = useRef<ReturnType<typeof setTimeout>>();

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 3000); }

  const loadForecasts = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch('/api/forecast');
      const data = await res.json();
      setForecasts(data.forecasts || []);
    } catch { showToast('Failed to load forecasts.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadForecasts(); }, [loadForecasts]);

  async function loadForecast(fc: ForecastSummary) {
    setSelected(fc);
    setGridLoading(true);
    try {
      const res  = await fetch(`/api/forecast/${fc.id}`);
      const data = await res.json();
      const map  = new Map<string, ForecastData>();
      for (const slot of (data.data || [])) {
        map.set(key(slot.day, slot.hour, slot.quarter), slot);
      }
      setGridData(map);
    } catch { showToast('Failed to load forecast data.'); }
    finally { setGridLoading(false); }
  }

  function getCellValue(day: number, hour: number, q: number): number {
    const slot = gridData.get(key(day, hour, q));
    if (!slot) return 0;
    if (dataField === 'calls') return slot.ave_calls_adj || slot.ave_calls || 0;
    if (dataField === 'talk_time') return slot.ave_talk_time_adj || slot.ave_talk_time || 0;
    // agents — calculate from erlang
    return 0;
  }

  // Calculate required agents for the whole grid using Erlang C
  const staffingMap = useCallback((): Map<string, number> => {
    if (!selected) return new Map();
    const slots: ForecastSlot[] = [];
    gridData.forEach((slot, k) => {
      const [day, hour, quarter] = k.split('-').map(Number);
      slots.push({
        day, hour, quarter,
        ave_calls:         slot.ave_calls,
        ave_calls_adj:     slot.ave_calls_adj,
        ave_talk_time:     slot.ave_talk_time,
        ave_talk_time_adj: slot.ave_talk_time_adj,
        ave_agent_adj:     slot.ave_agent_adj,
      });
    });
    const results = calculateWeeklyStaffing(
      slots,
      Boolean(selected.erlang_c),
      selected.service_level / 100,
      selected.target_answer_time,
      selected.efficiency
    );
    const map = new Map<string, number>();
    for (const r of results) map.set(key(r.day, r.hour, r.quarter), r.actual);
    return map;
  }, [selected, gridData]);

  function getAgentValue(day: number, hour: number, q: number): number {
    const slot = gridData.get(key(day, hour, q));
    if (slot?.ave_agent_adj && slot.ave_agent_adj > 0) return slot.ave_agent_adj;
    return staffingMap().get(key(day, hour, q)) ?? 0;
  }

  // Save a single cell edit with debounce
  async function saveCell(
    day: number, hour: number, q: number,
    field: 'ave_calls_adj' | 'ave_talk_time_adj' | 'ave_agent_adj',
    value: number
  ) {
    if (!selected) return;

    // Optimistic update
    const k = key(day, hour, q);
    setGridData(prev => {
      const next = new Map(prev);
      const existing = next.get(k) || {
        day, hour, quarter: q,
        ave_calls: 0, ave_talk_time: 0,
        ave_calls_adj: 0, ave_talk_time_adj: 0, ave_agent_adj: 0,
      };
      next.set(k, { ...existing, [field]: value });
      return next;
    });

    // Debounced save
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        await fetch('/api/forecast/data', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify([{ forecast_id: selected.id, day, hour, quarter: q, [field]: value }]),
        });
      } catch { showToast('Failed to save cell.'); }
    }, 800);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      const res  = await fetch(`/api/forecast/${deleteTarget.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) { showToast(`Error: ${data.error}`); return; }
      if (selected?.id === deleteTarget.id) { setSelected(null); setGridData(new Map()); }
      showToast('Forecast deleted.');
      loadForecasts();
    } catch { showToast('Failed to delete.'); }
    finally { setDeleteTarget(null); }
  }

  async function togglePublish() {
    if (!selected) return;
    try {
      await fetch(`/api/forecast/${selected.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ published: !selected.published }),
      });
      const updated = { ...selected, published: selected.published ? 0 : 1 };
      setSelected(updated);
      setForecasts(prev => prev.map(f => f.id === updated.id ? updated : f));
      showToast(updated.published ? 'Forecast published.' : 'Forecast unpublished.');
    } catch { showToast('Failed to update.'); }
  }

  function fmtDate(d: string) {
    return new Date(d + 'T00:00:00').toLocaleDateString('en-US',
      { month: 'short', day: 'numeric', year: 'numeric' });
  }

  // Hours to display — show 24 hours in groups
  const HOURS = Array.from({ length: 24 }, (_, i) => i);
  const QUARTERS = [0, 1, 2, 3];
  const DAYS = viewMode === 'weekly' ? [0,1,2,3,4,5,6] : [activeDay];

  const fieldMap: Record<DataField, 'ave_calls_adj'|'ave_talk_time_adj'|'ave_agent_adj'> = {
    calls:     'ave_calls_adj',
    talk_time: 'ave_talk_time_adj',
    agents:    'ave_agent_adj',
  };

  return (
    <AppShell>
      <div className="flex h-full">
        {/* Left panel — forecast list */}
        <div className="w-56 shrink-0 border-r border-[var(--border)] bg-white flex flex-col">
          <div className="px-3 py-3 border-b border-[var(--border)] flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wide">
              Forecasts
            </span>
            <button
              className="text-[var(--brand-600)] hover:text-[var(--brand-800)] text-lg font-light
                         leading-none transition-colors"
              onClick={() => setNewOpen(true)}
              title="New forecast"
            >+</button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <p className="text-xs text-[var(--text-muted)] text-center py-6">Loading…</p>
            ) : forecasts.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)] text-center py-6 px-3">
                No forecasts yet. Click + to create one.
              </p>
            ) : (
              forecasts.map(fc => (
                <button
                  key={fc.id}
                  onClick={() => loadForecast(fc)}
                  className={`w-full text-left px-3 py-2.5 border-b border-[var(--border)]
                              transition-colors text-xs group
                              ${selected?.id === fc.id
                                ? 'bg-[var(--surface-active)] text-[var(--brand-700)]'
                                : 'hover:bg-[var(--surface-hover)] text-[var(--text-primary)]'}`}
                >
                  <div className="font-medium">{fmtDate(fc.week_date)}</div>
                  <div className="text-[var(--text-muted)] mt-0.5 flex items-center gap-1.5">
                    Test #{fc.test_number}
                    {Boolean(fc.published) && (
                      <span className="badge-green text-[9px] px-1 py-0">Pub</span>
                    )}
                    {Boolean(fc.erlang_c) && (
                      <span className="badge-blue text-[9px] px-1 py-0">Erlang</span>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {!selected ? (
            <div className="flex-1 flex items-center justify-center text-[var(--text-muted)] text-sm">
              Select a forecast from the list, or create a new one.
            </div>
          ) : (
            <>
              {/* Forecast toolbar */}
              <div className="bg-white border-b border-[var(--border)] px-4 py-2.5
                              flex items-center gap-3 flex-wrap shrink-0">
                <div className="text-sm font-semibold text-[var(--text-primary)]">
                  Week of {fmtDate(selected.week_date)}
                  <span className="text-[var(--text-muted)] font-normal ml-2">
                    Test #{selected.test_number}
                  </span>
                </div>

                {/* View mode */}
                <div className="flex items-center gap-1 ml-auto">
                  {(['weekly','daily'] as ViewMode[]).map(m => (
                    <button key={m}
                      onClick={() => setViewMode(m)}
                      className={`px-2.5 py-1 text-xs rounded font-medium transition-colors
                                  ${viewMode === m
                                    ? 'bg-[var(--brand-600)] text-white'
                                    : 'bg-white border border-[var(--border)] text-[var(--text-secondary)]'}`}
                    >{m === 'weekly' ? 'Week' : 'Day'}</button>
                  ))}
                </div>

                {/* Data field toggle */}
                <div className="flex items-center gap-1">
                  {([['calls','Calls'],['talk_time','Talk Time'],['agents','Agents']] as [DataField,string][]).map(([f,l]) => (
                    <button key={f}
                      onClick={() => setDataField(f)}
                      className={`px-2.5 py-1 text-xs rounded font-medium transition-colors
                                  ${dataField === f
                                    ? 'bg-[var(--brand-100)] text-[var(--brand-700)] border border-[var(--brand-300)]'
                                    : 'bg-white border border-[var(--border)] text-[var(--text-secondary)]'}`}
                    >{l}</button>
                  ))}
                </div>

                <button
                  onClick={togglePublish}
                  className={`btn btn-sm text-xs ${selected.published
                    ? 'bg-amber-50 border-amber-300 text-amber-700'
                    : 'btn-secondary'}`}
                >
                  {selected.published ? 'Unpublish' : 'Publish'}
                </button>

                <button
                  className="btn btn-sm bg-white border border-red-200 text-red-600
                             hover:bg-red-50 text-xs"
                  onClick={() => setDeleteTarget(selected)}
                >Delete</button>
              </div>

              {/* Day selector (daily mode) */}
              {viewMode === 'daily' && (
                <div className="bg-[var(--surface-stripe)] border-b border-[var(--border)]
                                flex px-4 py-1.5 gap-1">
                  {DAY_SHORT.map((d, i) => (
                    <button key={i}
                      onClick={() => setActiveDay(i)}
                      className={`px-3 py-1 text-xs rounded font-medium transition-colors
                                  ${activeDay === i
                                    ? 'bg-[var(--brand-600)] text-white'
                                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
                    >{d}</button>
                  ))}
                </div>
              )}

              {/* The grid */}
              {gridLoading ? (
                <div className="flex-1 flex items-center justify-center text-sm text-[var(--text-muted)]">
                  Loading forecast data…
                </div>
              ) : (
                <div className="flex-1 overflow-auto">
                  <table className="text-[11px] border-collapse w-max min-w-full">
                    <thead className="sticky top-0 z-10 bg-[var(--surface-stripe)]">
                      <tr>
                        <th className="px-2 py-1.5 text-left text-[var(--text-muted)] font-semibold
                                       border-b border-r border-[var(--border)] w-16 sticky left-0
                                       bg-[var(--surface-stripe)]">
                          Hour
                        </th>
                        {DAYS.map(d => (
                          <th key={d} colSpan={4}
                              className="px-2 py-1.5 text-center font-semibold text-[var(--text-secondary)]
                                         border-b border-r border-[var(--border)] min-w-[140px]">
                            {DAY_SHORT[d]}
                          </th>
                        ))}
                      </tr>
                      <tr className="bg-[var(--surface-stripe)]">
                        <th className="border-b border-r border-[var(--border)] sticky left-0
                                       bg-[var(--surface-stripe)]" />
                        {DAYS.map(d =>
                          QUARTERS.map(q => (
                            <th key={`${d}-${q}`}
                                className="px-1 py-1 text-center text-[var(--text-muted)]
                                           border-b border-r border-[var(--border)] font-normal">
                              :{String(q * 15).padStart(2,'0')}
                            </th>
                          ))
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {HOURS.map(hour => (
                        <tr key={hour} className="hover:bg-[var(--surface-hover)]">
                          <td className="px-2 py-1 text-[var(--text-muted)] font-medium
                                         border-b border-r border-[var(--border)] sticky left-0
                                         bg-white text-center">
                            {formatTime(hour, 0, false).replace(':00', '')}
                          </td>
                          {DAYS.map(day =>
                            QUARTERS.map(q => {
                              const val = dataField === 'agents'
                                ? getAgentValue(day, hour, q)
                                : getCellValue(day, hour, q);
                              const isEmpty = val === 0;

                              return (
                                <td key={`${day}-${q}`}
                                    className="border-b border-r border-[var(--border)] p-0">
                                  <input
                                    type="number"
                                    min={0}
                                    step={dataField === 'talk_time' ? 1 : 0.1}
                                    value={isEmpty ? '' : val}
                                    placeholder="0"
                                    onChange={e => {
                                      const v = parseFloat(e.target.value) || 0;
                                      saveCell(day, hour, q, fieldMap[dataField], v);
                                    }}
                                    className={`w-full px-1.5 py-1 text-center text-[11px]
                                                bg-transparent focus:outline-none
                                                focus:bg-[var(--brand-50)] focus:text-[var(--brand-700)]
                                                ${isEmpty ? 'text-[var(--text-muted)]' : 'text-[var(--text-primary)]'}`}
                                  />
                                </td>
                              );
                            })
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 animate-slide-up
                        alert-success shadow-lg z-50 max-w-sm">
          <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
          {toast}
        </div>
      )}

      {/* New Forecast Modal */}
      {newOpen && (
        <NewForecastModal
          onClose={() => setNewOpen(false)}
          onCreated={(fc) => {
            setNewOpen(false);
            loadForecasts();
            loadForecast(fc);
            showToast('Forecast created.');
          }}
          existingForecasts={forecasts}
        />
      )}

      {/* Delete Confirm */}
      {deleteTarget && (
        <ConfirmDialog title="Delete Forecast"
          message={`Delete the forecast for week of ${fmtDate(deleteTarget.week_date)} (Test #${deleteTarget.test_number})? This also deletes all forecast data.`}
          danger confirmLabel="Delete"
          onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)} />
      )}
    </AppShell>
  );
}

// ─── New Forecast Modal ───────────────────────────────────────────────────────

interface NewForecastModalProps {
  onClose:           () => void;
  onCreated:         (fc: ForecastSummary) => void;
  existingForecasts: ForecastSummary[];
}

function NewForecastModal({ onClose, onCreated, existingForecasts }: NewForecastModalProps) {
  const [form, setForm] = useState({
    week_date:          '',
    efficiency:         100,
    weeks:              1,
    erlang_c:           false,
    service_level:      80,
    target_answer_time: 20,
    copy_from_id:       '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  async function handleCreate() {
    if (!form.week_date) { setError('Week date is required.'); return; }
    setSaving(true); setError('');
    try {
      const res  = await fetch('/api/forecast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          copy_from_id: form.copy_from_id ? +form.copy_from_id : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to create.'); return; }

      // Fetch the full new forecast summary
      const fcRes  = await fetch(`/api/forecast/${data.id}`);
      const fcData = await fcRes.json();
      onCreated(fcData.forecast);
    } catch { setError('Connection error.'); }
    finally { setSaving(false); }
  }

  function set(field: string, val: unknown) { setForm(f => ({ ...f, [field]: val })); }

  return (
    <Modal title="New Forecast" onClose={onClose} size="md"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={saving} onClick={handleCreate}>
            {saving ? 'Creating…' : 'Create Forecast'}
          </button>
        </>
      }>
      <div className="space-y-4">
        <div>
          <label className="label">Week Start Date *</label>
          <input className="input" type="date" value={form.week_date}
            onChange={e => set('week_date', e.target.value)} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Efficiency %</label>
            <input className="input" type="number" min={1} max={200}
              value={form.efficiency} onChange={e => set('efficiency', +e.target.value)} />
          </div>
          <div>
            <label className="label">Weeks of Data</label>
            <input className="input" type="number" min={1} max={52}
              value={form.weeks} onChange={e => set('weeks', +e.target.value)} />
          </div>
        </div>

        <label className="flex items-center gap-2 cursor-pointer text-sm">
          <input type="checkbox" checked={form.erlang_c}
            onChange={e => set('erlang_c', e.target.checked)}
            className="rounded border-gray-300" />
          Use Erlang C staffing calculation
        </label>

        {form.erlang_c && (
          <div className="grid grid-cols-2 gap-3 pl-6">
            <div>
              <label className="label">Service Level %</label>
              <input className="input" type="number" min={1} max={100}
                value={form.service_level} onChange={e => set('service_level', +e.target.value)} />
            </div>
            <div>
              <label className="label">Target Answer (sec)</label>
              <input className="input" type="number" min={1} max={600}
                value={form.target_answer_time}
                onChange={e => set('target_answer_time', +e.target.value)} />
            </div>
          </div>
        )}

        {existingForecasts.length > 0 && (
          <div>
            <label className="label">Copy Data From (optional)</label>
            <select className="select" value={form.copy_from_id}
              onChange={e => set('copy_from_id', e.target.value)}>
              <option value="">— Start empty —</option>
              {existingForecasts.map(fc => (
                <option key={fc.id} value={fc.id}>
                  {new Date(fc.week_date + 'T00:00:00').toLocaleDateString('en-US',
                    { month: 'short', day: 'numeric', year: 'numeric' })} — Test #{fc.test_number}
                </option>
              ))}
            </select>
          </div>
        )}

        {error && <div className="alert-error text-xs">{error}</div>}
      </div>
    </Modal>
  );
}
