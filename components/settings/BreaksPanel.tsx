'use client';
// components/settings/BreaksPanel.tsx
// Mirrors CBreaksDlg + CEditBreakDlg exactly
//
// breakrec fields:
//   Minutes   — break duration (1–120 minutes)
//   Hours     — frequency: every X hours (1–24)
//   Minimum   — TimeRec: offset INTO shift for earliest break start (NOT a clock time)
//   Maximum   — TimeRec: offset INTO shift for latest break start (NOT a clock time)
//   Paid, AutoFill, Color, Name
//
// Example: Minimum=1h30m, Maximum=3h00m means:
//   On a 9am-5pm shift, break can start between 10:30am and 12:00pm

import { useState } from 'react';
import Modal from '@/components/ui/Modal';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import ColorPicker from '@/components/ui/ColorPicker';
import { colorRefToHex } from '@/lib/types';

interface Break {
  id:             number;
  name:           string;
  minutes:        number;
  hours:          number;
  paid:           number;
  auto_fill:      number;
  color:          number;
  minimum_hour:   number;
  minimum_minute: number;
  maximum_hour:   number;
  maximum_minute: number;
  sort_order:     number;
}

interface BreakForm {
  name:           string;
  minutes:        number;
  hours:          number;
  paid:           boolean;
  auto_fill:      boolean;
  color:          number;
  minimum_hour:   number;
  minimum_minute: number;
  maximum_hour:   number;
  maximum_minute: number;
}

const defaultForm = (): BreakForm => ({
  name: '', minutes: 15, hours: 4, paid: false, auto_fill: false, color: 255,
  // Defaults match C++ constructor: Minimum 1h30m, Maximum 2h30m
  minimum_hour: 1, minimum_minute: 30,
  maximum_hour: 2, maximum_minute: 30,
});

// Format offset as "Xh Ym" for display in list
function formatOffset(hour: number, minute: number): string {
  if (hour === 0 && minute === 0) return '0:00';
  if (minute === 0) return `${hour}:00`;
  return `${hour}:${String(minute).padStart(2, '0')}`;
}

interface Props { breaks: Break[]; onReload: () => void; onToast: (msg: string) => void; }

export default function BreaksPanel({ breaks, onReload, onToast }: Props) {
  const [addOpen, setAddOpen]           = useState(false);
  const [editTarget, setEditTarget]     = useState<Break | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Break | null>(null);
  const [form, setForm]                 = useState<BreakForm>(defaultForm());
  const [saving, setSaving]             = useState(false);
  const [error, setError]               = useState('');

  function openAdd() { setForm(defaultForm()); setError(''); setAddOpen(true); }

  function openEdit(b: Break) {
    setForm({
      name:           b.name,
      minutes:        b.minutes,
      hours:          b.hours,
      paid:           Boolean(b.paid),
      auto_fill:      Boolean(b.auto_fill),
      color:          b.color,
      minimum_hour:   b.minimum_hour,
      minimum_minute: b.minimum_minute,
      maximum_hour:   b.maximum_hour,
      maximum_minute: b.maximum_minute,
    });
    setError(''); setEditTarget(b);
  }

  function set(field: keyof BreakForm, val: unknown) {
    setForm(f => ({ ...f, [field]: val }));
  }

  async function handleSave() {
    if (!form.name.trim()) { setError('Break name is required.'); return; }
    if (!form.minutes || form.minutes < 1) { setError('Duration must be at least 1 minute.'); return; }
    if (!form.hours || form.hours < 1)    { setError('Frequency must be at least 1 hour.'); return; }
    setSaving(true); setError('');
    try {
      const isEdit = !!editTarget;
      const url    = isEdit ? `/api/breaks/${editTarget!.id}` : '/api/breaks';
      const res    = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (data.error) { setError(data.error); return; }
      setAddOpen(false); setEditTarget(null);
      onToast(isEdit ? `Break "${form.name}" updated.` : `Break "${form.name}" added.`);
      onReload();
    } catch { setError('Connection error.'); }
    finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      const res  = await fetch(`/api/breaks/${deleteTarget.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ _method: 'DELETE' }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.error) onToast(`Error: ${data.error}`);
      else { onToast(`Break "${deleteTarget.name}" deleted.`); onReload(); }
    } catch { onToast('Failed to delete.'); }
    finally { setDeleteTarget(null); }
  }

  // Offset input — hours 0–23, minutes in 15-min steps
  function OffsetInput({
    labelText, hourField, minuteField
  }: {
    labelText:   string;
    hourField:   'minimum_hour' | 'maximum_hour';
    minuteField: 'minimum_minute' | 'maximum_minute';
  }) {
    return (
      <div>
        <label className="label">{labelText}</label>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <input
              type="number" min={0} max={23}
              value={form[hourField]}
              onChange={e => set(hourField, Math.min(23, Math.max(0, +e.target.value)))}
              className="input input-sm w-16 text-center"
            />
            <span className="text-xs text-[var(--text-muted)]">hr</span>
          </div>
          <div className="flex items-center gap-1">
            <select
              value={form[minuteField]}
              onChange={e => set(minuteField, +e.target.value)}
              className="select input-sm w-16"
            >
              <option value={0}>00</option>
              <option value={15}>15</option>
              <option value={30}>30</option>
              <option value={45}>45</option>
            </select>
            <span className="text-xs text-[var(--text-muted)]">min</span>
          </div>
          <span className="text-xs text-[var(--text-muted)]">
            into shift
          </span>
        </div>
      </div>
    );
  }

  const FormBody = (
    <div className="space-y-4">
      <div>
        <label className="label">Break Name *</label>
        <input className="input" value={form.name} maxLength={24} autoFocus
          onChange={e => set('name', e.target.value)}
          placeholder="e.g. Lunch, Short Break" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Duration (minutes)</label>
          <input className="input" type="number" min={1} max={120}
            value={form.minutes}
            onChange={e => set('minutes', Math.min(120, Math.max(1, +e.target.value)))} />
        </div>
        <div>
          <label className="label">Frequency (every X hours)</label>
          <input className="input" type="number" min={1} max={24}
            value={form.hours}
            onChange={e => set('hours', Math.min(24, Math.max(1, +e.target.value)))} />
        </div>
      </div>

      {/* Minimum/Maximum — offset into shift, NOT clock times */}
      <OffsetInput
        labelText="Earliest Start (hrs:min into shift)"
        hourField="minimum_hour"
        minuteField="minimum_minute"
      />
      <OffsetInput
        labelText="Latest Start (hrs:min into shift)"
        hourField="maximum_hour"
        minuteField="maximum_minute"
      />

      <ColorPicker label="Break Color" value={form.color}
        onChange={v => set('color', v)} />

      <div className="grid grid-cols-2 gap-2 border-t border-[var(--border)] pt-3">
        <label className="flex items-center gap-2 cursor-pointer text-sm">
          <input type="checkbox" checked={form.paid}
            onChange={e => set('paid', e.target.checked)}
            className="rounded border-gray-300" />
          Paid Break
        </label>
        <label className="flex items-center gap-2 cursor-pointer text-sm">
          <input type="checkbox" checked={form.auto_fill}
            onChange={e => set('auto_fill', e.target.checked)}
            className="rounded border-gray-300" />
          Auto-Fill Break
        </label>
      </div>

      {error && <div className="alert-error text-xs">{error}</div>}
    </div>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-[var(--text-secondary)]">
          {breaks.length} break type{breaks.length !== 1 ? 's' : ''} defined
        </p>
        <button className="btn-primary btn-sm" onClick={openAdd}>+ Add Break</button>
      </div>

      {breaks.length === 0 ? (
        <div className="text-center py-8 text-sm text-[var(--text-muted)] border-2
                        border-dashed border-[var(--border)] rounded-lg">
          No break types yet.
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="table">
            <thead>
              <tr>
                <th>Break</th>
                <th>Duration</th>
                <th>Frequency</th>
                <th>Minimum</th>
                <th>Maximum</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {breaks.map(b => (
                <tr key={b.id}>
                  <td>
                    <span className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full shrink-0 border border-black/10"
                            style={{ background: colorRefToHex(b.color) }} />
                      <span className="font-medium">{b.name}</span>
                      <div className="flex items-center gap-1">
                        {Boolean(b.paid)      && <span className="badge-green text-[10px]">Paid</span>}
                        {Boolean(b.auto_fill) && <span className="badge-blue text-[10px]">Auto</span>}
                      </div>
                    </span>
                  </td>
                  <td className="text-sm text-[var(--text-secondary)]">{b.minutes} min</td>
                  <td className="text-sm text-[var(--text-secondary)]">Every {b.hours}h</td>
                  <td className="text-sm text-[var(--text-secondary)] font-mono">
                    {formatOffset(b.minimum_hour, b.minimum_minute)}
                  </td>
                  <td className="text-sm text-[var(--text-secondary)] font-mono">
                    {formatOffset(b.maximum_hour, b.maximum_minute)}
                  </td>
                  <td>
                    <div className="flex items-center gap-2">
                      <button className="btn-ghost btn-sm text-xs"
                        onClick={() => openEdit(b)}>Edit</button>
                      <button className="btn btn-sm bg-white border border-red-200
                                         text-red-600 hover:bg-red-50 text-xs"
                        onClick={() => setDeleteTarget(b)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {addOpen && (
        <Modal title="Add Break Type" onClose={() => setAddOpen(false)} size="md"
          footer={
            <>
              <button className="btn-secondary" onClick={() => setAddOpen(false)}>Cancel</button>
              <button className="btn-primary" disabled={saving} onClick={handleSave}>
                {saving ? 'Saving…' : 'Add Break'}
              </button>
            </>
          }>{FormBody}</Modal>
      )}

      {editTarget && (
        <Modal title={`Edit Break — ${editTarget.name}`}
          onClose={() => setEditTarget(null)} size="md"
          footer={
            <>
              <button className="btn-secondary" onClick={() => setEditTarget(null)}>Cancel</button>
              <button className="btn-primary" disabled={saving} onClick={handleSave}>
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </>
          }>{FormBody}</Modal>
      )}

      {deleteTarget && (
        <ConfirmDialog title="Delete Break Type"
          message={`Delete "${deleteTarget.name}: ${deleteTarget.minutes} minute ${deleteTarget.paid ? 'paid' : 'unpaid'} break every ${deleteTarget.hours} hours"?`}
          danger confirmLabel="Delete"
          onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)} />
      )}
    </div>
  );
}
