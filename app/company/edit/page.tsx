'use client';
// app/company/edit/page.tsx
// Mirrors CCompanyDlg — company info + shift configuration
// Shift times generate the 96-byte shift_values BINARY(96) array.
// 3rd shift commonly wraps midnight (e.g. 22:00–06:00).

import { useState, useEffect, useCallback } from 'react';
import AppShell from '@/components/layout/AppShell';
import ColorPicker from '@/components/ui/ColorPicker';
import { colorRefToHex, DAY_NAMES } from '@/lib/types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ShiftDef {
  name:       string;
  color:      number;
  start_hour: number;
  start_min:  number;
  stop_hour:  number;
  stop_min:   number;
}

interface CompanyForm {
  name:               string;
  address:            string;
  city:               string;
  state:              string;
  zip:                string;
  email:              string;
  phone:              string;
  fax:                string;
  schedule_start_day: number;
  max_seats:          number;
  min_hours:          number;
  autofill_breaks:    boolean;
  company_not_247:    boolean;
  shifts:             ShiftDef[];
}

// ─── Shift values helpers ─────────────────────────────────────────────────────

function buildShiftValues(shifts: ShiftDef[]): number[] {
  const vals = new Array(96).fill(0);
  // Apply reverse so shift 0 (1st) wins on overlap
  for (let s = 2; s >= 0; s--) {
    const sh = shifts[s];
    const startSlot = sh.start_hour * 4 + Math.floor(sh.start_min / 15);
    const stopSlot  = sh.stop_hour  * 4 + Math.floor(sh.stop_min  / 15);
    if (stopSlot > startSlot) {
      for (let slot = startSlot; slot < stopSlot; slot++) vals[slot] = s;
    } else if (stopSlot < startSlot) {
      // Overnight wrap
      for (let slot = startSlot; slot < 96; slot++) vals[slot] = s;
      for (let slot = 0; slot < stopSlot; slot++) vals[slot] = s;
    }
  }
  return vals;
}

function parseShiftValues(hex: string, shiftNames: string[], shiftColors: number[]): ShiftDef[] {
  const defaults: ShiftDef[] = [
    { name: shiftNames[0] || '1st Shift', color: shiftColors[0] || 0x00FFFF00, start_hour: 6,  start_min: 0, stop_hour: 14, stop_min: 0 },
    { name: shiftNames[1] || '2nd Shift', color: shiftColors[1] || 0x00FFFF00, start_hour: 14, start_min: 0, stop_hour: 22, stop_min: 0 },
    { name: shiftNames[2] || '3rd Shift', color: shiftColors[2] || 0x00FFFF00, start_hour: 22, start_min: 0, stop_hour: 6,  stop_min: 0 },
  ];
  if (!hex || hex.length !== 192) return defaults;

  const bytes: number[] = [];
  for (let i = 0; i < 192; i += 2) bytes.push(parseInt(hex.slice(i, i + 2), 16));

  return [0, 1, 2].map((idx): ShiftDef => {
    const name  = shiftNames[idx]  || defaults[idx].name;
    const color = shiftColors[idx] || defaults[idx].color;

    const slots = bytes.map((b, i) => b === idx ? i : -1).filter(i => i !== -1);
    if (slots.length === 0) return defaults[idx];

    const hasStart = slots[0] === 0;
    const hasEnd   = slots[slots.length - 1] === 95;
    const isOvernight = hasStart && hasEnd && slots.length < 96;

    if (isOvernight) {
      // Find the gap (consecutive non-matching slots between morning and evening runs)
      // Morning run: slots starting at 0
      // Evening run: slots ending at 95
      // Gap is between them — find first slot where next slot is NOT consecutive
      let morningEndSlot = -1;
      for (let i = 0; i < slots.length - 1; i++) {
        if (slots[i + 1] - slots[i] > 1) {
          morningEndSlot = slots[i]; // last slot of morning run (before gap)
          break;
        }
      }
      if (morningEndSlot === -1) {
        // All 96 slots belong to this shift
        return { name, color, start_hour: 0, start_min: 0, stop_hour: 24, stop_min: 0 };
      }
      // Evening run starts right after morningEndSlot's gap
      const eveningStartSlot = morningEndSlot + 1 +
        bytes.slice(morningEndSlot + 1).findIndex(b => b === idx);

      const stopSlot  = morningEndSlot + 1; // exclusive end of morning = stop time
      const startSlot = eveningStartSlot;   // start of evening run = start time

      return {
        name, color,
        start_hour: Math.floor(startSlot / 4),
        start_min:  (startSlot % 4) * 15,
        stop_hour:  stopSlot >= 96 ? 24 : Math.floor(stopSlot / 4),
        stop_min:   (stopSlot % 4) * 15,
      };
    }

    // Normal contiguous shift
    const startSlot = slots[0];
    const stopSlot  = slots[slots.length - 1] + 1;
    return {
      name, color,
      start_hour: Math.floor(startSlot / 4),
      start_min:  (startSlot % 4) * 15,
      stop_hour:  stopSlot >= 96 ? 24 : Math.floor(stopSlot / 4),
      stop_min:   (stopSlot % 4) * 15,
    };
  });
}

function slotToLabel(slot: number): string {
  const h = Math.floor(slot / 4);
  const m = (slot % 4) * 15;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
}

function fmtTime(h: number, m: number): string {
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
}

const defaultForm = (): CompanyForm => ({
  name: '', address: '', city: '', state: '', zip: '',
  email: '', phone: '', fax: '',
  schedule_start_day: 0, max_seats: 1, min_hours: 10,
  autofill_breaks: false, company_not_247: false,
  shifts: [
    { name: '1st Shift', color: 0x00FFFF00, start_hour: 6,  start_min: 0, stop_hour: 14, stop_min: 0 },
    { name: '2nd Shift', color: 0x00FFFF00, start_hour: 14, start_min: 0, stop_hour: 22, stop_min: 0 },
    { name: '3rd Shift', color: 0x00FFFF00, start_hour: 22, start_min: 0, stop_hour: 6,  stop_min: 0 },
  ],
});

// ─── Time select ──────────────────────────────────────────────────────────────

const HOURS   = Array.from({ length: 25 }, (_, i) => i);
const MINUTES = [0, 15, 30, 45];

function TimeSelect({ hour, minute, onChangeHour, onChangeMinute }: {
  hour: number; minute: number;
  onChangeHour: (h: number) => void;
  onChangeMinute: (m: number) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <select className="input py-1 text-xs text-center" style={{ width: '3.5rem' }}
        value={hour} onChange={e => onChangeHour(+e.target.value)}>
        {HOURS.map(h => <option key={h} value={h}>{String(h).padStart(2,'0')}</option>)}
      </select>
      <span className="text-[var(--text-muted)] text-xs font-bold select-none">:</span>
      <select className="input py-1 text-xs text-center" style={{ width: '3.5rem' }}
        value={minute} onChange={e => onChangeMinute(+e.target.value)}>
        {MINUTES.map(m => <option key={m} value={m}>{String(m).padStart(2,'0')}</option>)}
      </select>
    </div>
  );
}

// ─── Shift timeline ───────────────────────────────────────────────────────────

function ShiftTimeline({ shifts }: { shifts: ShiftDef[] }) {
  const vals = buildShiftValues(shifts);
  const timeLabels = ['12a','2','4','6','8','10','12p','2','4','6','8','10','12a'];
  return (
    <div className="mt-4">
      <p className="text-xs text-[var(--text-muted)] mb-1.5">24-hour preview</p>
      <div className="flex h-5 rounded overflow-hidden border border-[var(--border)]">
        {vals.map((v, i) => (
          <div key={i} style={{ flex: 1, background: colorRefToHex(shifts[v]?.color ?? 0xFFFFFF) }}
               title={`${slotToLabel(i)} — ${shifts[v]?.name ?? ''}`} />
        ))}
      </div>
      <div className="flex justify-between mt-0.5">
        {timeLabels.map((l, i) => <span key={i} className="text-[9px] text-[var(--text-muted)]">{l}</span>)}
      </div>
      <div className="flex items-center gap-4 mt-1.5 flex-wrap">
        {shifts.map((s, i) => {
          const overnight = s.stop_hour < s.start_hour ||
            (s.stop_hour === s.start_hour && s.stop_min < s.start_min);
          return (
            <span key={i} className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
              <span className="w-3 h-3 rounded-sm border border-black/10 inline-block shrink-0"
                    style={{ background: colorRefToHex(s.color) }} />
              {s.name}
              <span className="text-[var(--text-muted)]">
                {fmtTime(s.start_hour, s.start_min)}–{fmtTime(s.stop_hour, s.stop_min)}
                {overnight ? ' (+1)' : ''}
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CompanyEditPage() {
  const [form, setForm]       = useState<CompanyForm>(defaultForm());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);
  const [error, setError]     = useState('');
  const [isDirty, setIsDirty] = useState(false);

  const load = useCallback(async () => {
    try {
      const res  = await fetch('/api/company');
      const data = await res.json();
      if (data.company) {
        const c = data.company;
        const shiftNames  = [c.first_shift || '1st Shift', c.second_shift || '2nd Shift', c.third_shift || '3rd Shift'];
        const shiftColors = [Number(c.shift_color_1 ?? 0x00FFFF00), Number(c.shift_color_2 ?? 0x00FFFF00), Number(c.shift_color_3 ?? 0x00FFFF00)];
        setForm({
          name:               c.name    ?? '',
          address:            c.address ?? '',
          city:               c.city    ?? '',
          state:              c.state   ?? '',
          zip:                c.zip     ?? '',
          email:              c.email   ?? '',
          phone:              c.phone   ?? '',
          fax:                c.fax     ?? '',
          schedule_start_day: Number(c.schedule_start_day ?? 0),
          max_seats:          Number(c.max_seats  ?? 1),
          min_hours:          Number(c.min_hours  ?? 10),
          autofill_breaks:    Boolean(c.autofill_breaks),
          company_not_247:    Boolean(c.company_not_247),
          shifts:             parseShiftValues(c.shift_values_hex || '', shiftNames, shiftColors),
        });
      }
    } catch { setError('Failed to load company data.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  function setField<K extends keyof CompanyForm>(key: K, val: CompanyForm[K]) {
    setForm(f => ({ ...f, [key]: val }));
    setIsDirty(true); setSaved(false);
  }

  function setShift(idx: number, key: keyof ShiftDef, val: string | number) {
    setForm(f => ({ ...f, shifts: f.shifts.map((s, i) => i === idx ? { ...s, [key]: val } : s) }));
    setIsDirty(true); setSaved(false);
  }

  async function handleSave() {
    setSaving(true); setError('');
    try {
      const res = await fetch('/api/company', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name, address: form.address || null,
          city: form.city || null, state: form.state || null,
          zip: form.zip || null, email: form.email || null,
          phone: form.phone || null, fax: form.fax || null,
          schedule_start_day: form.schedule_start_day,
          max_seats: form.max_seats, min_hours: form.min_hours,
          autofill_breaks: form.autofill_breaks,
          company_not_247: form.company_not_247,
          first_shift:  form.shifts[0].name,
          second_shift: form.shifts[1].name,
          third_shift:  form.shifts[2].name,
          shift_color_1: form.shifts[0].color,
          shift_color_2: form.shifts[1].color,
          shift_color_3: form.shifts[2].color,
          shift_values: buildShiftValues(form.shifts),
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to save.'); return; }
      setSaved(true); setIsDirty(false);
      setTimeout(() => setSaved(false), 3000);
    } catch { setError('Connection error.'); }
    finally { setSaving(false); }
  }

  if (loading) {
    return <AppShell><div className="p-6 text-sm text-[var(--text-muted)]">Loading…</div></AppShell>;
  }

  const SHIFT_LABELS = ['1st Shift', '2nd Shift', '3rd Shift'];

  return (
    <AppShell>
      <div className="p-6">

        <div className="flex items-center justify-between mb-5 lg:max-w-[980px]">
          <div>
            <h1 className="page-title">Edit Company</h1>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">Company information and shift configuration</p>
          </div>
          <div className="flex items-center gap-3">
            {isDirty && !saving && (
              <span className="text-xs text-[var(--text-muted)]">Unsaved changes</span>
            )}
            {saved && (
              <span className="text-xs text-green-600 flex items-center gap-1">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                Saved
              </span>
            )}
            <button className="btn-primary btn-sm" disabled={saving || !isDirty} onClick={handleSave}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>

        {error && <div className="alert-error mb-4 text-xs">{error}</div>}

        {/* Two-column: info left, shifts right — stacks on small screens */}
        <div className="flex flex-col lg:flex-row gap-4 items-start lg:max-w-[980px]">

          {/* LEFT: Company Info */}
          <div className="card p-5 w-full lg:w-96 shrink-0">
            <h2 className="section-title mb-3">Company Information</h2>
            <div className="space-y-3">
              <div>
                <label className="label">Company Name</label>
                <input className="input" value={form.name} maxLength={100}
                  onChange={e => setField('name', e.target.value)} />
              </div>
              <div>
                <label className="label">Address</label>
                <input className="input" value={form.address} maxLength={100}
                  onChange={e => setField('address', e.target.value)} />
              </div>
              <div className="flex gap-2">
                <div className="flex-1 min-w-0">
                  <label className="label">City</label>
                  <input className="input" value={form.city} maxLength={30}
                    onChange={e => setField('city', e.target.value)} />
                </div>
                <div className="w-14 shrink-0">
                  <label className="label">State</label>
                  <input className="input text-center uppercase" value={form.state} maxLength={2}
                    onChange={e => setField('state', e.target.value.toUpperCase())} />
                </div>
                <div className="w-24 shrink-0">
                  <label className="label">Zip</label>
                  <input className="input" value={form.zip} maxLength={10}
                    onChange={e => setField('zip', e.target.value)} />
                </div>
              </div>
              <div>
                <label className="label">Email</label>
                <input className="input" type="email" value={form.email} maxLength={60}
                  onChange={e => setField('email', e.target.value)} />
              </div>
              <div className="flex gap-2">
                <div className="flex-1 min-w-0">
                  <label className="label">Phone</label>
                  <input className="input" value={form.phone} maxLength={13}
                    onChange={e => setField('phone', e.target.value)} />
                </div>
                <div className="flex-1 min-w-0">
                  <label className="label">Fax</label>
                  <input className="input" value={form.fax} maxLength={13}
                    onChange={e => setField('fax', e.target.value)} />
                </div>
              </div>
              <div className="flex gap-2 flex-wrap">
                <div className="flex-1 min-w-0">
                  <label className="label">Schedule Start Day</label>
                  <select className="select" value={form.schedule_start_day}
                    onChange={e => setField('schedule_start_day', +e.target.value)}>
                    {DAY_NAMES.map((d, i) => <option key={i} value={i}>{d}</option>)}
                  </select>
                </div>
                <div className="w-20 shrink-0">
                  <label className="label">Max Seats</label>
                  <input className="input text-center" type="number" min={1}
                    value={form.max_seats}
                    onChange={e => setField('max_seats', Math.max(1, +e.target.value || 1))} />
                </div>
                <div className="w-20 shrink-0">
                  <label className="label">Min Hours</label>
                  <input className="input text-center" type="number" min={1} max={24}
                    value={form.min_hours}
                    onChange={e => setField('min_hours', Math.min(24, Math.max(1, +e.target.value || 10)))} />
                </div>
              </div>
              <div className="flex items-center gap-5 pt-1">
                <label className="flex items-center gap-2 cursor-pointer text-sm">
                  <input type="checkbox" checked={form.autofill_breaks}
                    onChange={e => setField('autofill_breaks', e.target.checked)}
                    className="rounded border-gray-300" />
                  Autofill Breaks
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-sm">
                  <input type="checkbox" checked={form.company_not_247}
                    onChange={e => setField('company_not_247', e.target.checked)}
                    className="rounded border-gray-300" />
                  Not 24/7
                </label>
              </div>
            </div>
          </div>

          {/* RIGHT: Shift Configuration */}
          <div className="card p-5 w-[580px] shrink-0">
            <h2 className="section-title mb-1">Shift Configuration</h2>
            <p className="text-xs text-[var(--text-muted)] mb-4">
              Define the time range for each shift. Overnight shifts (e.g. 22:00–06:00)
              are supported — when stop is earlier than start the shift wraps midnight.
            </p>

            <div className="flex gap-3 flex-wrap">
              {form.shifts.map((shift, idx) => {
                const overnight = shift.stop_hour < shift.start_hour ||
                  (shift.stop_hour === shift.start_hour && shift.stop_min < shift.start_min);
                return (
                  <div key={idx} className="border border-[var(--border)] rounded-lg p-3 w-44 shrink-0">
                    {/* Name + color */}
                    <div className="flex items-end gap-3 mb-2.5 flex-wrap">
                      <div>
                        <label className="label text-[10px] mb-0.5">{SHIFT_LABELS[idx]} Label</label>
                        <input className="input w-full text-sm" value={shift.name} maxLength={14}
                          onChange={e => setShift(idx, 'name', e.target.value)} />
                      </div>
                      <div>
                        <label className="label text-[10px] mb-0.5">Color</label>
                        <ColorPicker value={shift.color} onChange={v => setShift(idx, 'color', v)} />
                      </div>
                    </div>

                    {/* Start and Stop stacked */}
                    <div className="space-y-1.5">
                      <div>
                        <label className="label text-[10px] mb-0.5">Start</label>
                        <TimeSelect
                          hour={shift.start_hour} minute={shift.start_min}
                          onChangeHour={h => setShift(idx, 'start_hour', h)}
                          onChangeMinute={m => setShift(idx, 'start_min', m)}
                        />
                      </div>
                      <div>
                        <label className="label text-[10px] mb-0.5">Stop</label>
                        <TimeSelect
                          hour={shift.stop_hour} minute={shift.stop_min}
                          onChangeHour={h => setShift(idx, 'stop_hour', h)}
                          onChangeMinute={m => setShift(idx, 'stop_min', m)}
                        />
                      </div>
                      {overnight && (
                        <span className="text-xs text-amber-600 font-medium">overnight +1</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <ShiftTimeline shifts={form.shifts} />
          </div>

        </div>



      </div>
    </AppShell>
  );
}
