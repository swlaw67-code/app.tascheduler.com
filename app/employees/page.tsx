'use client';
// app/employees/page.tsx
import { useState, useEffect, useCallback } from 'react';
import AppShell from '@/components/layout/AppShell';
import Modal from '@/components/ui/Modal';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import EmployeeForm from '@/components/employees/EmployeeForm';
import type { FormData as EmployeeFormData } from '@/components/employees/EmployeeForm';
import type { WeekAvail } from '@/components/employees/AvailabilityGrid';
import { colorRefToHex } from '@/lib/types';

interface Skill  { id: number; name: string; color: number; }
interface Employee {
  id: number; name: string; email: string | null; phone: string | null;
  skill_id: number; skill_name: string | null; skill_color: number;
  inactive: number; sort_num: number; min_hours: number; max_hours: number;
  [key: string]: unknown;
}

export default function EmployeesPage() {
  const [employees, setEmployees]   = useState<Employee[]>([]);
  const [skills, setSkills]         = useState<Skill[]>([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [addOpen, setAddOpen]       = useState(false);
  const [editTarget, setEditTarget] = useState<Employee | null>(null);
  const [editDetail, setEditDetail] = useState<{employee: Record<string,unknown>; availability: Record<string,unknown>[]} | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Employee | null>(null);
  const [saving, setSaving]         = useState(false);
  const [formError, setFormError]   = useState('');
  const [toast, setToast]           = useState('');

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 3500); }

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [empRes, skillRes] = await Promise.all([fetch('/api/employees', { cache: 'no-store' }), fetch('/api/skills', { cache: 'no-store' })]);
      const empData   = await empRes.json();
      const skillData = await skillRes.json();
      setEmployees(empData.employees  || []);
      setSkills(skillData.skills      || []);
    } catch { showToast('Failed to load data.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  async function openEdit(emp: Employee) {
    setEditTarget(emp);
    try {
      const res  = await fetch(`/api/employees/${emp.id}`);
      const data = await res.json();
      setEditDetail({ employee: data.employee, availability: data.availability });
    } catch { setEditDetail({ employee: emp, availability: [] }); }
  }

  async function handleSave(form: EmployeeFormData, avail: WeekAvail) {
    setSaving(true); setFormError('');
    try {
      const isEdit = !!editTarget;
      const url    = isEdit
        ? `/api/employees/${editTarget!.id}`
        : '/api/employees';
      const res    = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isEdit ? { _method: 'PATCH', ...form } : form),
      });
      const data = await res.json();
      if (!res.ok) { setFormError(data.error || 'Failed to save.'); return; }

      const empId = isEdit ? editTarget!.id : data.id;
      for (let day = 0; day < 7; day++) {
        const dayAvail = avail[day];
        if (!dayAvail) continue;
        await fetch(`/api/employees/${empId}/availability`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ day, special: false, slots: dayAvail.enabled ? dayAvail.slots : [] }),
        });
      }
      setAddOpen(false); setEditTarget(null); setEditDetail(null);
      showToast(isEdit ? 'Employee updated.' : 'Employee added.');
      loadData();
    } catch (err) {
      console.error('Save error:', err);
      setFormError('Connection error. Please try again.');
    } finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await fetch(`/api/employees/${deleteTarget.id}?_method=DELETE`, { method: 'POST' });
      setDeleteTarget(null);
      showToast(`${deleteTarget.name} removed.`);
      loadData();
    } catch { showToast('Failed to delete employee.'); }
  }

  const filtered = employees.filter(e => {
    if (!showInactive && e.inactive) return false;
    if (search) {
      const s = search.toLowerCase();
      return (
        e.name.toLowerCase().includes(s) ||
        (e.skill_name?.toLowerCase().includes(s) ?? false) ||
        (e.email?.toLowerCase().includes(s) ?? false)
      );
    }
    return true;
  });

  return (
    <AppShell>
      <div className="p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="page-title">Employees</h1>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              {filtered.length} of {employees.length} employees
            </p>
          </div>
          <button className="btn-primary btn-sm"
            onClick={() => { setFormError(''); setAddOpen(true); }}>
            + Add Employee
          </button>
        </div>

        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1 max-w-xs">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
                 width="14" height="14" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input className="input input-sm pl-8" placeholder="Search name, skill, email…"
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
            <input type="checkbox" checked={showInactive}
              onChange={e => setShowInactive(e.target.checked)}
              className="rounded border-gray-300" />
            Show inactive
          </label>
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
            <div className="p-8 text-center text-sm text-[var(--text-muted)]">Loading employees…</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-sm text-[var(--text-muted)]">
              {search ? 'No employees match your search.' : 'No employees yet. Click "Add Employee" to get started.'}
            </div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>#</th><th>Name</th><th>Skill</th><th>Email</th>
                  <th>Phone</th><th>Hours (min/max)</th><th>Status</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((emp, idx) => (
                  <tr key={emp.id}>
                    <td className="text-[var(--text-muted)] text-xs w-8">{idx + 1}</td>
                    <td><span className="font-medium">{emp.name}</span></td>
                    <td>
                      {emp.skill_name ? (
                        <span className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full shrink-0"
                                style={{ background: colorRefToHex(emp.skill_color) }} />
                          <span className="text-sm">{emp.skill_name}</span>
                        </span>
                      ) : <span className="text-[var(--text-muted)]">—</span>}
                    </td>
                    <td className="text-xs text-[var(--text-secondary)]">
                      {emp.email ? emp.email.split(';')[0] : '—'}
                    </td>
                    <td className="text-xs text-[var(--text-secondary)]">{emp.phone || '—'}</td>
                    <td className="text-xs text-[var(--text-secondary)]">
                      {emp.min_hours}h / {emp.max_hours}h
                    </td>
                    <td>
                      {emp.inactive
                        ? <span className="badge-gray">Inactive</span>
                        : <span className="badge-green">Active</span>}
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        <button className="btn-ghost btn-sm text-xs" onClick={() => openEdit(emp)}>Edit</button>
                        <button className="btn btn-sm bg-white border border-red-200 text-red-600
                                           hover:bg-red-50 text-xs" onClick={() => setDeleteTarget(emp)}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {addOpen && (
        <Modal title="Add Employee" onClose={() => setAddOpen(false)} size="lg">
          <EmployeeForm skills={skills} military={false}
            onSave={handleSave} onCancel={() => setAddOpen(false)}
            saving={saving} error={formError} />
        </Modal>
      )}

      {editTarget && editDetail && (
        <Modal title={`Edit — ${editTarget.name}`}
          onClose={() => { setEditTarget(null); setEditDetail(null); }} size="lg">
          <EmployeeForm employee={editDetail.employee}
            skills={skills} military={false}
            onSave={handleSave}
            onCancel={() => { setEditTarget(null); setEditDetail(null); }}
            saving={saving} error={formError} />
        </Modal>
      )}

      {deleteTarget && (
        <ConfirmDialog title="Remove Employee"
          message={`Remove ${deleteTarget.name}? This cannot be undone.`}
          danger confirmLabel="Remove"
          onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)} />
      )}
    </AppShell>
  );
}
