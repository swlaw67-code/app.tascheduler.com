'use client';
// components/employees/EmployeeForm.tsx
// Mirrors CEmployeeDlg exactly — two-column layout from IDD_EMPLOYEE_DLG resource
//
// LEFT column:
//   Name, City/State/Zip, Phone, Max Days/Week, Min/Max Hours/Day, Split Shift
//   Max Days Row, Employee #, Hire Date
//   Skill Level, Inactive, Pay Rate, Pay Cycle, Overtime, Time Zone
//   Use Weekend Rule, Last Known Saturday, Two Days Off
//   Skill List (owner-draw multi-select with color swatches)
//
// RIGHT column:
//   Address, Email
//   Min/Max Hours/Week
//   Edit Availability button, Preferred radio group, Shift Availability list
//   Use Special Avail checkbox, Edit Special Avail button
//
// Rules:
//   - At least one skill must be selected (mirrors validation in OnBnClickedOk)
//   - First selected skill = primary Skill_ID
//   - Edit Availability opens CAvailableDlg equivalent
//   - Edit Special Avail disabled unless Use Special is checked
//   - isDirty cancel confirmation

import { useState, useEffect } from 'react';
import AvailabilityDialog from './AvailabilityDialog';
import { colorRefToHex, formatTime, DAY_NAMES } from '@/lib/types';
import type { WeekAvail } from '@/components/employees/AvailabilityGrid';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Skill { id: number; name: string; color: number; }

export interface FormData {
  name:              string;
  skill_id:          number;    // primary skill (first selected)
  skill_ids:         number[];  // ALL selected skills including primary
  email:             string;
  phone:             string;
  address:           string;
  city:              string;
  state:             string;
  zip:               string;
  min_hours:         number;
  max_hours:         number;
  min_hours_day:     number;
  max_hours_day:     number;
  max_days_week:     number;
  max_days_row:      number;
  skill_level:       number;
  pay_rate:          number;
  pay_cycle:         number;
  split_shift:       boolean;
  overtime:          boolean;
  two_days_off:      boolean;
  use_weekend_rule:  boolean;
  poor_performance:  boolean;
  inactive:          boolean;
  use_special:       boolean;
  timezone:          number;
  preference:        number;    // 0=No Pref, 1=1st Shift, 2=2nd Shift
  hire_date:         string;
  mtf_employee_id:   string;
  saturday_date:     string;
}

const defaultForm = (): FormData => ({
  name: '', skill_id: 0, skill_ids: [],
  email: '', phone: '', address: '', city: '', state: '', zip: '',
  min_hours: 20, max_hours: 40,
  min_hours_day: 4, max_hours_day: 8,
  max_days_week: 5, max_days_row: 0,
  skill_level: 1, pay_rate: 0, pay_cycle: 0,
  split_shift: false, overtime: false, two_days_off: false,
  use_weekend_rule: false, poor_performance: false,
  inactive: false, use_special: false,
  timezone: 0, preference: 0,
  hire_date: new Date().toISOString().split('T')[0], mtf_employee_id: '', saturday_date: '',
});

// For availability display in the read-only list
interface AvailEntry {
  id: number; day: number;
  start_hour: number; start_minute: number;
  stop_hour: number; stop_minute: number;
  special: number;
}

const PAY_CYCLES = ['Weekly', 'Bi-Weekly', 'Semi-Monthly', 'Monthly'];
// Timezone offsets in hours relative to switch location — stored as actual offset value
// Dropdown order matches C++ SetTimeZone: 0, -1, +1, -2, +2, -3, +3
const TIMEZONE_OPTIONS = [
  { value: 0,  label: '0'  },
  { value: -1, label: '-1' },
  { value: 1,  label: '+1' },
  { value: -2, label: '-2' },
  { value: 2,  label: '+2' },
  { value: -3, label: '-3' },
  { value: 3,  label: '+3' },
];

interface Props {
  employee?:    Record<string, unknown>;
  employeeSkills?: number[];  // existing skill ids for this employee
  skills:       Skill[];
  military:     boolean;
  onSave:       (data: FormData, avail: WeekAvail) => Promise<void>;
  onCancel:     () => void;
  saving:       boolean;
  error:        string;
}

export default function EmployeeForm({
  employee, employeeSkills, skills, military, onSave, onCancel, saving, error
}: Props) {
  const [form, setForm]         = useState<FormData>(defaultForm());
  const [isDirty, setIsDirty]   = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [formError, setFormError] = useState('');

  // Availability state
  const [availability, setAvailability]     = useState<AvailEntry[]>([]);
  const [availLoading, setAvailLoading]     = useState(false);
  const [showAvailDialog, setShowAvailDialog] = useState(false);
  const [showSpecialDialog, setShowSpecialDialog] = useState(false);

  const isNew = !employee;
  const employeeId = employee ? Number(employee.id) : 0;

  // Load form data from employee record
  useEffect(() => {
    if (employee) {
      const skillIds = employeeSkills || [];
      setForm({
        name:             String(employee.name             ?? ''),
        skill_id:         Number(employee.skill_id         ?? 0),
        skill_ids:        skillIds,
        email:            String(employee.email            ?? ''),
        phone:            String(employee.phone            ?? ''),
        address:          String(employee.address          ?? ''),
        city:             String(employee.city             ?? ''),
        state:            String(employee.state            ?? ''),
        zip:              String(employee.zip              ?? ''),
        min_hours:        Number(employee.min_hours        ?? 20),
        max_hours:        Number(employee.max_hours        ?? 40),
        min_hours_day:    Number(employee.min_hours_day    ?? 4),
        max_hours_day:    Number(employee.max_hours_day    ?? 8),
        max_days_week:    Number(employee.max_days_week    ?? 5),
        max_days_row:     Number(employee.max_days_row     ?? 0),
        skill_level:      Number(employee.skill_level      ?? 1),
        pay_rate:         Number(employee.pay_rate         ?? 0),
        pay_cycle:        Number(employee.pay_cycle        ?? 0),
        split_shift:      Boolean(employee.split_shift),
        overtime:         Boolean(employee.overtime),
        two_days_off:     Boolean(employee.two_days_off),
        use_weekend_rule: Boolean(employee.use_weekend_rule),
        poor_performance: Boolean(employee.poor_performance),
        inactive:         Boolean(employee.inactive),
        use_special:      Boolean(employee.use_special),
        timezone:         Number(employee.timezone         ?? 0),
        preference:       Number(employee.preference       ?? 0),
        hire_date:        employee.hire_date
          ? String(employee.hire_date).split('T')[0] : '',
        mtf_employee_id:  String(employee.mtf_employee_id ?? ''),
        saturday_date:    employee.saturday_date
          ? String(employee.saturday_date).split('T')[0] : '',
      });
    }
  }, [employee, employeeSkills]);

  // Load availability for existing employees
  useEffect(() => {
    if (employeeId) loadAvailability();
  }, [employeeId]);

  async function loadAvailability() {
    setAvailLoading(true);
    try {
      const res  = await fetch(`/api/employees/${employeeId}/availability?special=0`);
      const data = await res.json();
      setAvailability(data.availability || []);
    } catch { /* silent */ }
    finally { setAvailLoading(false); }
  }

  function set<K extends keyof FormData>(field: K, val: FormData[K]) {
    setForm(f => ({ ...f, [field]: val }));
    setIsDirty(true);
  }

  // Toggle skill in the multi-select list — mirrors LBN_SELCHANGE handler
  function toggleSkill(skillId: number) {
    setForm(f => {
      const newIds = f.skill_ids.includes(skillId)
        ? f.skill_ids.filter(id => id !== skillId)
        : [...f.skill_ids, skillId];
      // First selected skill becomes primary Skill_ID
      const primaryId = newIds.length > 0 ? newIds[0] : 0;
      return { ...f, skill_ids: newIds, skill_id: primaryId };
    });
    setIsDirty(true);
  }

  function handleCancel() {
    if (isDirty) setShowCancel(true);
    else onCancel();
  }

  async function handleSave() {
    // Mirrors OnBnClickedOk: must have at least one skill selected
    if (form.skill_ids.length === 0) {
      setFormError('At least one skill must be selected.');
      return;
    }
    if (!form.name.trim()) {
      setFormError('Employee name is required.');
      return;
    }
    setFormError('');
    // Availability is managed separately via AvailabilityDialog; pass empty avail
    const emptyAvail = Object.fromEntries(
      Array.from({ length: 7 }, (_, i) => [i, { enabled: false, slots: [] }])
    ) as unknown as WeekAvail;
    await onSave(form, emptyAvail);
  }

  // Build availability display strings — mirrors LoadAvailability/ListRecords
  const regularAvail = availability.filter(e => !e.special);

  return (
    <>
      {/* ── Two-column dialog body ────────────────────────────────────── */}
      <div className="flex gap-4 p-4 min-h-0">

        {/* ── LEFT COLUMN ─────────────────────────────────────────────── */}
        <div className="flex-1 min-w-0 space-y-2.5">

          {/* Name */}
          <div className="flex items-center gap-2">
            <label className="label mb-0 w-12 shrink-0">Name:</label>
            <input className="input flex-1" value={form.name} maxLength={50}
              autoFocus onChange={e => set('name', e.target.value)}
              placeholder="Employee name" />
          </div>

          {/* City / State / Zip */}
          <div>
            <label className="label mb-1 text-[10px] text-[var(--text-muted)]">
              City / State / Zip:
            </label>
            <div className="flex gap-1.5">
              <input className="input flex-1" value={form.city} maxLength={30}
                placeholder="City" onChange={e => set('city', e.target.value)} />
              <input className="input w-12 text-center" value={form.state} maxLength={2}
                placeholder="ST" onChange={e => set('state', e.target.value.toUpperCase())} />
              <input className="input w-24" value={form.zip} maxLength={10}
                placeholder="Zip" onChange={e => set('zip', e.target.value)} />
            </div>
          </div>

          {/* Phone */}
          <div className="flex items-center gap-2">
            <label className="label mb-0 w-12 shrink-0">Phone:</label>
            <input className="input w-40" value={form.phone} maxLength={13}
              placeholder="(000)000-0000" onChange={e => set('phone', e.target.value)} />
          </div>

          {/* Hours row */}
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="label text-[10px]">Max Days/Wk</label>
              <input className="input text-center" type="number" min={0} max={7}
                value={form.max_days_week} onChange={e => set('max_days_week', +e.target.value)} />
            </div>
            <div>
              <label className="label text-[10px]">Min Hrs/Day</label>
              <input className="input text-center" type="number" min={0} max={24}
                value={form.min_hours_day} onChange={e => set('min_hours_day', +e.target.value)} />
            </div>
            <div>
              <label className="label text-[10px]">Max Hrs/Day</label>
              <input className="input text-center" type="number" min={0} max={24}
                value={form.max_hours_day} onChange={e => set('max_hours_day', +e.target.value)} />
            </div>
          </div>

          {/* Split Shift */}
          <label className="flex items-center gap-2 cursor-pointer text-sm">
            <input type="checkbox" checked={form.split_shift}
              onChange={e => set('split_shift', e.target.checked)}
              className="rounded border-gray-300" />
            Split Shift Capable
          </label>

          {/* Max Days Row, Employee #, Hire Date */}
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="label text-[10px]">Max Days in Row</label>
              <input className="input text-center" type="number" min={0} max={14}
                value={form.max_days_row} onChange={e => set('max_days_row', +e.target.value)} />
            </div>
            <div>
              <label className="label text-[10px]">Employee #</label>
              <input className="input" value={form.mtf_employee_id} maxLength={50}
                onChange={e => set('mtf_employee_id', e.target.value)} />
            </div>
            <div>
              <label className="label text-[10px]">Hire Date</label>
              <input className="input" type="date" value={form.hire_date}
                onChange={e => set('hire_date', e.target.value)} />
            </div>
          </div>

          {/* Skill Level, Inactive, Pay Rate, Pay Cycle, Overtime, Time Zone */}
          <div className="flex items-end gap-2 flex-wrap">
            <div className="w-16">
              <label className="label text-[10px]">Skill Lvl (1-10)</label>
              <input className="input text-center" type="number" min={1} max={10}
                value={form.skill_level} onChange={e => set('skill_level', +e.target.value)} />
            </div>
            <label className="flex items-center gap-1.5 cursor-pointer text-sm pb-1">
              <input type="checkbox" checked={form.inactive}
                onChange={e => set('inactive', e.target.checked)}
                className="rounded border-gray-300" />
              Inactive
            </label>
            <div className="w-20">
              <label className="label text-[10px]">Pay Rate</label>
              <input className="input text-center" type="number" min={0} step={0.01}
                value={form.pay_rate}
                onChange={e => set('pay_rate', parseFloat(e.target.value) || 0)} />
            </div>
            <div className="w-28">
              <label className="label text-[10px]">Pay Cycle</label>
              <select className="select" value={form.pay_cycle}
                onChange={e => set('pay_cycle', +e.target.value)}>
                {PAY_CYCLES.map((p, i) => <option key={i} value={i}>{p}</option>)}
              </select>
            </div>
            <label className="flex items-center gap-1.5 cursor-pointer text-sm pb-1">
              <input type="checkbox" checked={form.overtime}
                onChange={e => set('overtime', e.target.checked)}
                className="rounded border-gray-300" />
              Overtime
            </label>
            <div className="w-24">
              <label className="label text-[10px]">Time Zone</label>
              <select className="select" value={form.timezone}
                onChange={e => set('timezone', +e.target.value)}>
                {TIMEZONE_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          </div>

          {/* Weekend Rule + Saturday Date + Two Days Off */}
          <div className="flex items-end gap-3 flex-wrap">
            <label className="flex items-center gap-1.5 cursor-pointer text-sm">
              <input type="checkbox" checked={form.use_weekend_rule}
                onChange={e => set('use_weekend_rule', e.target.checked)}
                className="rounded border-gray-300" />
              Use Weekend Off Rule
            </label>
            {form.use_weekend_rule && (
              <div>
                <label className="label text-[10px]">Last Known Saturday</label>
                <input className="input w-36" type="date" value={form.saturday_date}
                  onChange={e => set('saturday_date', e.target.value)} />
              </div>
            )}
            <label className="flex items-center gap-1.5 cursor-pointer text-sm">
              <input type="checkbox" checked={form.two_days_off}
                onChange={e => set('two_days_off', e.target.checked)}
                className="rounded border-gray-300" />
              Two Days in a Row Off
            </label>
          </div>

          {/* ── Skill List — owner-draw multi-select with color swatches ── */}
          <div>
            <label className="label mb-1">Skill List:</label>
            <div className="border border-[var(--border)] rounded-md overflow-y-auto"
                 style={{ height: '130px' }}>
              {skills.length === 0 ? (
                <p className="text-xs text-[var(--text-muted)] p-2">No skills defined.</p>
              ) : (
                skills.map(skill => {
                  const selected = form.skill_ids.includes(skill.id);
                  return (
                    <div key={skill.id}
                         onClick={() => toggleSkill(skill.id)}
                         className={`flex items-center gap-2 px-2 py-1.5 cursor-pointer
                                     select-none border-b border-[var(--border)] last:border-b-0
                                     transition-colors
                                     ${selected
                                       ? 'bg-[var(--brand-600)] text-white'
                                       : 'hover:bg-[var(--surface-hover)]'}`}>
                      {/* Color swatch — mirrors DrawList color rectangle */}
                      <span className="w-8 h-4 rounded shrink-0 border border-black/15"
                            style={{
                              background: colorRefToHex(skill.color),
                              opacity: selected ? 0.9 : 1,
                            }} />
                      <span className="text-sm">{skill.name}</span>
                      {/* Primary skill indicator */}
                      {selected && form.skill_ids[0] === skill.id && (
                        <span className="ml-auto text-[10px] opacity-80 font-medium">
                          Primary
                        </span>
                      )}
                    </div>
                  );
                })
              )}
            </div>
            {form.skill_ids.length === 0 && (
              <p className="text-xs text-amber-600 mt-1">
                Select at least one skill.
              </p>
            )}
          </div>
        </div>

        {/* ── RIGHT COLUMN ────────────────────────────────────────────── */}
        <div className="w-56 shrink-0 space-y-2.5">

          {/* Address */}
          <div>
            <label className="label text-[10px]">Address:</label>
            <input className="input" value={form.address} maxLength={100}
              placeholder="Street address"
              onChange={e => set('address', e.target.value)} />
          </div>

          {/* Email */}
          <div>
            <label className="label text-[10px]">E-Mail:</label>
            <input className="input" type="email" value={form.email} maxLength={255}
              placeholder="email@example.com"
              onChange={e => set('email', e.target.value)} />
          </div>

          {/* Min/Max Hours per Week */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label text-[10px]">Min Hrs/Wk</label>
              <input className="input text-center" type="number" min={0} max={168}
                value={form.min_hours}
                onChange={e => set('min_hours', +e.target.value)} />
            </div>
            <div>
              <label className="label text-[10px]">Max Hrs/Wk</label>
              <input className="input text-center" type="number" min={0} max={168}
                value={form.max_hours}
                onChange={e => set('max_hours', +e.target.value)} />
            </div>
          </div>

          {/* Edit Availability button */}
          <div>
            <button
              type="button"
              className="btn-secondary btn-sm w-full text-xs"
              disabled={isNew}
              onClick={() => setShowAvailDialog(true)}
              title={isNew ? 'Save employee first to edit availability' : undefined}
            >
              Edit Availability
            </button>
            {isNew && (
              <p className="text-[10px] text-[var(--text-muted)] mt-0.5">
                Save employee first
              </p>
            )}
          </div>

          {/* Preferred radio group */}
          <div className="border border-[var(--border)] rounded-md p-2">
            <p className="text-xs font-semibold text-[var(--text-secondary)] mb-1.5">
              Preferred
            </p>
            {['No Preference', '1st Shift', '2nd Shift'].map((label, i) => (
              <label key={i} className="flex items-center gap-2 cursor-pointer text-sm mb-1">
                <input type="radio" name="preference" value={i}
                  checked={form.preference === i}
                  onChange={() => set('preference', i)}
                  className="text-[var(--brand-600)]" />
                {label}
              </label>
            ))}
          </div>

          {/* Shift Availability list — read-only, mirrors m_ShiftAvailability */}
          <div>
            <label className="label mb-1 text-[10px]">Shift Availability:</label>
            <div className="border border-[var(--border)] rounded-md overflow-y-auto bg-white"
                 style={{ height: '130px' }}>
              {availLoading ? (
                <p className="text-xs text-[var(--text-muted)] p-2">Loading…</p>
              ) : isNew ? (
                <p className="text-xs text-[var(--text-muted)] p-2">
                  Available after saving employee.
                </p>
              ) : regularAvail.length === 0 ? (
                <p className="text-xs text-[var(--text-muted)] p-2">
                  No availability set.
                </p>
              ) : (
                regularAvail.map(entry => (
                  <div key={entry.id}
                       className="px-2 py-1 text-xs border-b border-[var(--border)]
                                  last:border-b-0 text-[var(--text-primary)]">
                    {DAY_NAMES[entry.day]}: {formatTime(entry.start_hour, entry.start_minute, military)}
                    -{formatTime(entry.stop_hour, entry.stop_minute, military)}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Use Special + Edit Special Avail */}
          <div className="space-y-1.5">
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <input type="checkbox" checked={form.use_special}
                onChange={e => set('use_special', e.target.checked)}
                className="rounded border-gray-300" />
              Use Special Availability
            </label>
            <button
              type="button"
              className="btn-secondary btn-sm w-full text-xs disabled:opacity-40"
              disabled={!form.use_special || isNew}
              onClick={() => setShowSpecialDialog(true)}
            >
              Edit Special Availability
            </button>
          </div>
        </div>
      </div>

      {/* Error messages */}
      {(formError || error) && (
        <div className="mx-4 mb-2">
          <div className="alert-error text-xs">{formError || error}</div>
        </div>
      )}

      {/* ── Footer: Save, Cancel ─────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-3
                      border-t border-[var(--border)] bg-[var(--surface-stripe)] shrink-0">
        <button
          type="button"
          className="btn-primary btn-sm flex items-center gap-1.5"
          disabled={saving}
          onClick={handleSave}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" strokeWidth="2" className="shrink-0">
            <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/>
            <polyline points="17 21 17 13 7 13 7 21"/>
          </svg>
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          className="btn-secondary btn-sm flex items-center gap-1.5"
          onClick={handleCancel}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6"  y1="6" x2="18" y2="18"/>
          </svg>
          Cancel
        </button>
      </div>

      {/* ── Availability dialogs ─────────────────────────────────────── */}
      {showAvailDialog && employeeId > 0 && (
        <AvailabilityDialog
          employeeId={employeeId}
          employeeName={form.name}
          special={false}
          military={military}
          onClose={() => {
            setShowAvailDialog(false);
            loadAvailability(); // reload list after editing
          }}
        />
      )}

      {showSpecialDialog && employeeId > 0 && (
        <AvailabilityDialog
          employeeId={employeeId}
          employeeName={form.name}
          special={true}
          military={military}
          onClose={() => {
            setShowSpecialDialog(false);
          }}
        />
      )}

      {/* ── Cancel confirmation (isDirty) ────────────────────────────── */}
      {showCancel && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70]">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-sm w-full mx-4">
            <h3 className="font-semibold text-[var(--text-primary)] mb-1">Data Changed</h3>
            <p className="text-sm text-[var(--text-secondary)] mb-5">Save Changes?</p>
            <div className="flex gap-3 justify-end">
              <button className="btn-secondary btn-sm"
                onClick={() => { setShowCancel(false); onCancel(); }}>
                No
              </button>
              <button className="btn-secondary btn-sm"
                onClick={() => setShowCancel(false)}>
                Cancel
              </button>
              <button className="btn-primary btn-sm"
                onClick={() => { setShowCancel(false); handleSave(); }}>
                Yes
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
