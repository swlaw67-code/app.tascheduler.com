'use client';
// components/settings/PositionsPanel.tsx
import { useState } from 'react';
import Modal from '@/components/ui/Modal';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import TimePicker from '@/components/ui/TimePicker';
import { formatTime } from '@/lib/types';

interface Position {
  id: number; name: string;
  start_hour: number; start_minute: number; end_hour: number; end_minute: number;
}
interface PositionForm {
  name: string; start_hour: number; start_minute: number; end_hour: number; end_minute: number;
}
const defaultForm = (): PositionForm => ({
  name: '', start_hour: 8, start_minute: 0, end_hour: 17, end_minute: 0,
});

interface Props { positions: Position[]; onReload: () => void; onToast: (msg: string) => void; military: boolean; }

export default function PositionsPanel({ positions, onReload, onToast, military }: Props) {
  const [addOpen, setAddOpen]           = useState(false);
  const [editTarget, setEditTarget]     = useState<Position | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Position | null>(null);
  const [form, setForm]                 = useState<PositionForm>(defaultForm());
  const [saving, setSaving]             = useState(false);
  const [error, setError]               = useState('');

  function openAdd() { setForm(defaultForm()); setError(''); setAddOpen(true); }
  function openEdit(p: Position) {
    setForm({ name: p.name, start_hour: p.start_hour, start_minute: p.start_minute,
              end_hour: p.end_hour, end_minute: p.end_minute });
    setError(''); setEditTarget(p);
  }
  function set(field: keyof PositionForm, val: unknown) { setForm(f => ({ ...f, [field]: val })); }

  async function handleSave() {
    if (!form.name.trim()) { setError('Position name is required.'); return; }
    setSaving(true); setError('');
    try {
      const isEdit = !!editTarget;
      const url    = isEdit ? `/api/positions/${editTarget!.id}` : '/api/positions';
      const res    = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to save.'); return; }
      setAddOpen(false); setEditTarget(null);
      onToast(isEdit ? `Position "${form.name}" updated.` : `Position "${form.name}" added.`);
      onReload();
    } catch { setError('Connection error.'); }
    finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await fetch(`/api/positions/${deleteTarget.id}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ _method: 'DELETE' }),
      });
      onToast(`Position "${deleteTarget.name}" deleted.`); onReload();
    } catch { onToast('Failed to delete.'); }
    finally { setDeleteTarget(null); }
  }

  const FormBody = (
    <div className="space-y-4">
      <div>
        <label className="label">Position Name *</label>
        <input className="input" value={form.name} maxLength={50} autoFocus
          onChange={e => set('name', e.target.value)} placeholder="e.g. Morning Operator" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Start Time</label>
          <TimePicker hour={form.start_hour} minute={form.start_minute}
            onHour={h => set('start_hour', h)} onMinute={m => set('start_minute', m)}
            military={military} minuteStep={15} />
        </div>
        <div>
          <label className="label">End Time</label>
          <TimePicker hour={form.end_hour} minute={form.end_minute}
            onHour={h => set('end_hour', h)} onMinute={m => set('end_minute', m)}
            military={military} minuteStep={15} />
        </div>
      </div>
      {error && <div className="alert-error text-xs">{error}</div>}
    </div>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-[var(--text-secondary)]">
          {positions.length} position{positions.length !== 1 ? 's' : ''} defined
        </p>
        <button className="btn-primary btn-sm" onClick={openAdd}>+ Add Position</button>
      </div>
      {positions.length === 0 ? (
        <div className="text-center py-8 text-sm text-[var(--text-muted)] border-2
                        border-dashed border-[var(--border)] rounded-lg">No positions yet.</div>
      ) : (
        <div className="space-y-1.5">
          {positions.map(p => (
            <div key={p.id} className="flex items-center gap-3 px-3 py-2.5 bg-white border
                          border-[var(--border)] rounded-lg hover:border-[var(--border-strong)] group">
              <span className="flex-1 text-sm font-medium">{p.name}</span>
              <span className="text-xs text-[var(--text-muted)]">
                {formatTime(p.start_hour, p.start_minute, military)} –{' '}
                {formatTime(p.end_hour, p.end_minute, military)}
              </span>
              <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <button className="btn-ghost btn-sm text-xs" onClick={() => openEdit(p)}>Edit</button>
                <button className="btn btn-sm bg-white border border-red-200 text-red-600
                                   hover:bg-red-50 text-xs" onClick={() => setDeleteTarget(p)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
      {addOpen && (
        <Modal title="Add Position" onClose={() => setAddOpen(false)} size="sm"
          footer={<><button className="btn-secondary" onClick={() => setAddOpen(false)}>Cancel</button>
            <button className="btn-primary" disabled={saving} onClick={handleSave}>
              {saving ? 'Saving…' : 'Add Position'}</button></>}>{FormBody}</Modal>
      )}
      {editTarget && (
        <Modal title={`Edit — ${editTarget.name}`} onClose={() => setEditTarget(null)} size="sm"
          footer={<><button className="btn-secondary" onClick={() => setEditTarget(null)}>Cancel</button>
            <button className="btn-primary" disabled={saving} onClick={handleSave}>
              {saving ? 'Saving…' : 'Save Changes'}</button></>}>{FormBody}</Modal>
      )}
      {deleteTarget && (
        <ConfirmDialog title="Delete Position" message={`Delete "${deleteTarget.name}"?`}
          danger confirmLabel="Delete" onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)} />
      )}
    </div>
  );
}
