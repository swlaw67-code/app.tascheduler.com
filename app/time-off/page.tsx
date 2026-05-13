'use client';
// app/time-off/page.tsx
import { useState, useEffect, useCallback } from 'react';
import AppShell from '@/components/layout/AppShell';
import Modal from '@/components/ui/Modal';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import TimePicker from '@/components/ui/TimePicker';
import { TORStatus, formatTime } from '@/lib/types';

interface TOR {
  id: number; employee_id: number; employee_name: string;
  date_submitted: string | null; date_requested: string; end_date_requested: string | null;
  reason: string | null; all_day: number;
  start_hour: number; start_minute: number; end_hour: number; end_minute: number;
  approved: number; created_at: string;
}
interface Employee { id: number; name: string; }
interface TORForm {
  employee_id: number; date_requested: string; end_date_requested: string;
  reason: string; all_day: boolean;
  start_hour: number; start_minute: number; end_hour: number; end_minute: number;
}
const defaultForm = (): TORForm => ({
  employee_id: 0, date_requested: '', end_date_requested: '', reason: '', all_day: true,
  start_hour: 8, start_minute: 0, end_hour: 17, end_minute: 0,
});
const STATUS_LABELS: Record<number, { label: string; cls: string }> = {
  0: { label: 'Pending',  cls: 'badge-yellow' },
  1: { label: 'Approved', cls: 'badge-green'  },
  2: { label: 'Denied',   cls: 'badge-red'    },
};
const STATUS_FILTERS = [
  { value: '',  label: 'All' },
  { value: '0', label: 'Pending' },
  { value: '1', label: 'Approved' },
  { value: '2', label: 'Denied' },
];

export default function TimeOffPage() {
  const [requests, setRequests]   = useState<TOR[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading]     = useState(true);
  const [statusFilter, setStatusFilter] = useState('0');
  const [empFilter, setEmpFilter] = useState('');
  const [addOpen, setAddOpen]         = useState(false);
  const [editTarget, setEditTarget]   = useState<TOR | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TOR | null>(null);
  const [form, setForm]               = useState<TORForm>(defaultForm());
  const [saving, setSaving]           = useState(false);
  const [formError, setFormError]     = useState('');
  const [toast, setToast]             = useState('');

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 3500); }

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== '') params.set('status', statusFilter);
      if (empFilter) params.set('employee_id', empFilter);
      const [torRes, empRes] = await Promise.all([
        fetch(`/api/time-off?${params}`), fetch('/api/employees'),
      ]);
      const torData = await torRes.json();
      const empData = await empRes.json();
      setRequests(torData.requests   || []);
      setEmployees(empData.employees || []);
    } catch { showToast('Failed to load data.'); }
    finally { setLoading(false); }
  }, [statusFilter, empFilter]);

  useEffect(() => { loadData(); }, [loadData]);

  function openAdd() { setForm(defaultForm()); setFormError(''); setAddOpen(true); }
  function openEdit(tor: TOR) {
    setForm({
      employee_id: tor.employee_id,
      date_requested: tor.date_requested?.split('T')[0] || '',
      end_date_requested: tor.end_date_requested?.split('T')[0] || '',
      reason: tor.reason || '', all_day: Boolean(tor.all_day),
      start_hour: tor.start_hour, start_minute: tor.start_minute,
      end_hour: tor.end_hour, end_minute: tor.end_minute,
    });
    setFormError(''); setEditTarget(tor);
  }
  function setF(field: keyof TORForm, val: unknown) { setForm(f => ({ ...f, [field]: val })); }

  async function handleSave() {
    if (!form.employee_id)    { setFormError('Employee is required.'); return; }
    if (!form.date_requested) { setFormError('Date is required.'); return; }
    setSaving(true); setFormError('');
    try {
      const isEdit = !!editTarget;
      const url    = isEdit ? `/api/time-off/${editTarget!.id}?_method=PATCH` : '/api/time-off';
      const res    = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) { setFormError(data.error || 'Failed to save.'); return; }
      setAddOpen(false); setEditTarget(null);
      showToast(isEdit ? 'Request updated.' : 'Request added.');
      loadData();
    } catch { setFormError('Connection error.'); }
    finally { setSaving(false); }
  }

  async function handleApprove(tor: TOR, approved: number) {
    try {
      await fetch(`/api/time-off/${tor.id}?_method=PATCH`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved }),
      });
      showToast(approved === 1 ? `Approved: ${tor.employee_name}` : `Denied: ${tor.employee_name}`);
      loadData();
    } catch { showToast('Failed to update.'); }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await fetch(`/api/time-off/${deleteTarget.id}?_method=DELETE`, { method: 'POST' });
      setDeleteTarget(null); showToast('Request deleted.'); loadData();
    } catch { showToast('Failed to delete.'); }
  }

  function fmtDate(d: string | null) {
    if (!d) return '—';
    return new Date(d + 'T00:00:00').toLocaleDateString('en-US',
      { month: 'short', day: 'numeric', year: 'numeric' });
  }

  const FormBody = (
    <div className="space-y-4">
      <div>
        <label className="label">Employee *</label>
        <select className="select" value={form.employee_id}
          onChange={e => setF('employee_id', +e.target.value)}>
          <option value={0}>— Select employee —</option>
          {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Date Requested *</label>
          <input className="input" type="date" value={form.date_requested}
            onChange={e => setF('date_requested', e.target.value)} />
        </div>
        <div>
          <label className="label">End Date (multi-day)</label>
          <input className="input" type="date" value={form.end_date_requested}
            onChange={e => setF('end_date_requested', e.target.value)} />
        </div>
      </div>
      <div>
        <label className="label">Reason</label>
        <input className="input" value={form.reason} maxLength={50}
          onChange={e => setF('reason', e.target.value)} placeholder="Optional" />
      </div>
      <label className="flex items-center gap-2 cursor-pointer text-sm">
        <input type="checkbox" checked={form.all_day}
          onChange={e => setF('all_day', e.target.checked)} className="rounded border-gray-300" />
        All Day
      </label>
      {!form.all_day && (
        <div className="grid grid-cols-2 gap-4 pl-1">
          <div>
            <label className="label">Start Time</label>
            <TimePicker hour={form.start_hour} minute={form.start_minute}
              onHour={h => setF('start_hour', h)} onMinute={m => setF('start_minute', m)} minuteStep={15} />
          </div>
          <div>
            <label className="label">End Time</label>
            <TimePicker hour={form.end_hour} minute={form.end_minute}
              onHour={h => setF('end_hour', h)} onMinute={m => setF('end_minute', m)} minuteStep={15} />
          </div>
        </div>
      )}
      {formError && <div className="alert-error text-xs">{formError}</div>}
    </div>
  );

  return (
    <AppShell>
      <div className="p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="page-title">Time Off Requests</h1>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              {requests.length} request{requests.length !== 1 ? 's' : ''}
            </p>
          </div>
          <button className="btn-primary btn-sm" onClick={openAdd}>+ Add Request</button>
        </div>

        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <div className="flex items-center gap-1.5">
            {STATUS_FILTERS.map(f => (
              <button key={f.value} onClick={() => setStatusFilter(f.value)}
                className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors
                            ${statusFilter === f.value
                              ? 'bg-[var(--brand-600)] text-white border-[var(--brand-700)]'
                              : 'bg-white text-[var(--text-secondary)] border-[var(--border)]'}`}>
                {f.label}
              </button>
            ))}
          </div>
          <select className="select input-sm w-48 ml-auto" value={empFilter}
            onChange={e => setEmpFilter(e.target.value)}>
            <option value="">All Employees</option>
            {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </div>

        {toast && (
          <div className="alert-success mb-4 animate-fade-in">
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
            {toast}
          </div>
        )}

        <div className="card overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-sm text-[var(--text-muted)]">Loading…</div>
          ) : requests.length === 0 ? (
            <div className="p-8 text-center text-sm text-[var(--text-muted)]">
              No time-off requests found.
            </div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Employee</th><th>Date Requested</th><th>Duration</th>
                  <th>Reason</th><th>Submitted</th><th>Status</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {requests.map(tor => {
                  const status = STATUS_LABELS[tor.approved] ?? STATUS_LABELS[0];
                  return (
                    <tr key={tor.id}>
                      <td className="font-medium">{tor.employee_name}</td>
                      <td className="text-sm">
                        {fmtDate(tor.date_requested)}
                        {tor.end_date_requested && tor.end_date_requested !== tor.date_requested && (
                          <span className="text-[var(--text-muted)]"> – {fmtDate(tor.end_date_requested)}</span>
                        )}
                      </td>
                      <td className="text-sm text-[var(--text-secondary)]">
                        {tor.all_day ? 'All day' : `${formatTime(tor.start_hour, tor.start_minute, false)} – ${formatTime(tor.end_hour, tor.end_minute, false)}`}
                      </td>
                      <td className="text-sm text-[var(--text-secondary)]">{tor.reason || '—'}</td>
                      <td className="text-xs text-[var(--text-muted)]">{fmtDate(tor.date_submitted)}</td>
                      <td><span className={status.cls}>{status.label}</span></td>
                      <td>
                        <div className="flex items-center gap-1.5">
                          {tor.approved !== TORStatus.Approved && (
                            <button className="btn btn-sm bg-white border border-green-300 text-green-700
                                               hover:bg-green-50 text-xs"
                              onClick={() => handleApprove(tor, TORStatus.Approved)}>✓</button>
                          )}
                          {tor.approved !== TORStatus.Denied && (
                            <button className="btn btn-sm bg-white border border-red-200 text-red-600
                                               hover:bg-red-50 text-xs"
                              onClick={() => handleApprove(tor, TORStatus.Denied)}>✗</button>
                          )}
                          <button className="btn-ghost btn-sm text-xs" onClick={() => openEdit(tor)}>Edit</button>
                          <button className="btn btn-sm bg-white border border-[var(--border)]
                                             text-[var(--text-muted)] hover:text-red-600 text-xs"
                            onClick={() => setDeleteTarget(tor)}>Del</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {addOpen && (
        <Modal title="Add Time-Off Request" onClose={() => setAddOpen(false)} size="md"
          footer={<><button className="btn-secondary" onClick={() => setAddOpen(false)}>Cancel</button>
            <button className="btn-primary" disabled={saving} onClick={handleSave}>
              {saving ? 'Saving…' : 'Add Request'}</button></>}>{FormBody}</Modal>
      )}
      {editTarget && (
        <Modal title={`Edit Request — ${editTarget.employee_name}`}
          onClose={() => setEditTarget(null)} size="md"
          footer={<><button className="btn-secondary" onClick={() => setEditTarget(null)}>Cancel</button>
            <button className="btn-primary" disabled={saving} onClick={handleSave}>
              {saving ? 'Saving…' : 'Save Changes'}</button></>}>{FormBody}</Modal>
      )}
      {deleteTarget && (
        <ConfirmDialog title="Delete Request"
          message={`Delete request for ${deleteTarget.employee_name}?`}
          danger confirmLabel="Delete"
          onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)} />
      )}
    </AppShell>
  );
}
