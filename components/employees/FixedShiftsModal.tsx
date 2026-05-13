'use client';
// components/employees/FixedShiftsModal.tsx
// Mirrors CFixedShiftDlg exactly
//
// KEY FIXES:
// 1. Tree view with expand/collapse — shifts as parent nodes, breaks as children
// 2. AddBreak range logic: adds break to ALL shifts from selected shift
//    through "Add to Shift" (mirrors CFixedShiftData::AddBreak start→stop loop)
// 3. Layout: tree ~50%, buttons ~15%, employees ~35%

import { useState, useEffect, useCallback } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FixedShiftBreak {
  id:             number;
  fixed_shift_id: number;
  break_id:       number;
  total:          number;
  break_name:     string;
  minutes:        number;
  paid:           number;
}

interface FixedShift {
  id:       number;
  length:   number;
  standard: number;
  breaks:   FixedShiftBreak[];
}

interface Break {
  id:      number;
  name:    string;
  minutes: number;
  paid:    number;
}

interface Employee {
  id:       number;
  name:     string;
  inactive: number;
}

// ─── Selected item in the tree ────────────────────────────────────────────────
type TreeSelection =
  | { type: 'shift'; shift: FixedShift }
  | { type: 'break'; shift: FixedShift; brk: FixedShiftBreak };

// ─── FixedShiftsModal ─────────────────────────────────────────────────────────

interface Props { onClose: () => void; }

export default function FixedShiftsModal({ onClose }: Props) {
  const [shifts, setShifts]       = useState<FixedShift[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [breaks, setBreaks]       = useState<Break[]>([]);
  const [loading, setLoading]     = useState(true);
  const [expanded, setExpanded]   = useState<Set<number>>(new Set());
  const [selected, setSelected]   = useState<TreeSelection | null>(null);
  const [selEmpIds, setSelEmpIds] = useState<number[]>([]);
  const [allEmployees, setAllEmployees] = useState(false);
  const [msg, setMsg]             = useState('');
  const [msgError, setMsgError]   = useState(false);

  // Sub-dialogs
  const [showAdd, setShowAdd]           = useState(false);
  const [showEdit, setShowEdit]         = useState(false);
  const [showAddBreak, setShowAddBreak] = useState(false);
  const [showEditBreak, setShowEditBreak] = useState(false);
  const [showCreate, setShowCreate]     = useState(false);
  const [showEmpShifts, setShowEmpShifts] = useState<Employee | null>(null);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);

  function toast(m: string, err = false) {
    setMsg(m); setMsgError(err);
    setTimeout(() => setMsg(''), 4000);
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sr, er, br] = await Promise.all([
        fetch('/api/fixed-shifts'),
        fetch('/api/employees'),
        fetch('/api/breaks'),
      ]);
      const sd = await sr.json();
      const ed = await er.json();
      const bd = await br.json();
      setShifts(sd.shifts || []);
      setEmployees((ed.employees || []).filter((e: Employee) => !e.inactive));
      setBreaks(bd.breaks || []);
    } catch { toast('Failed to load.', true); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  function toggleExpand(shiftId: number) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(shiftId)) next.delete(shiftId);
      else next.add(shiftId);
      return next;
    });
  }

  // ── Button states — mirrors OnSelChangeFixedShiftTree ─────────────────────
  const selIsShift = selected?.type === 'shift';
  const selIsBreak = selected?.type === 'break';
  const canEdit    = selIsShift || selIsBreak;
  const canDelete  = selIsShift || selIsBreak;
  const canAddBreak = selIsShift;
  const editLabel  = selIsBreak ? 'Edit Break' : 'Edit Shift';
  const delLabel   = selIsBreak ? 'Delete Break' : 'Delete Shift';

  function getEmpIds(): number[] {
    if (allEmployees) return employees.map(e => e.id);
    return selEmpIds;
  }

  // ── Delete ────────────────────────────────────────────────────────────────
  async function handleDelete() {
    if (!selected) return;
    try {
      if (selected.type === 'shift') {
        await fetch(`/api/fixed-shifts/${selected.shift.id}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ _method: 'DELETE' }),
        });
      } else {
        await fetch(`/api/fixed-shifts/${selected.shift.id}/breaks`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ _method: 'DELETE', break_record_id: selected.brk.id }),
        });
      }
      setSelected(null);
      load();
    } catch { toast('Failed to delete.', true); }
  }

  async function handleDeleteAll() {
    try {
      await fetch('/api/fixed-shifts/0', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ _method: 'DELETE_ALL' }),
      });
      setSelected(null); setConfirmDeleteAll(false); load();
    } catch { toast('Failed to delete all.', true); }
  }

  // ── Copy ──────────────────────────────────────────────────────────────────
  async function handleCopy(allShifts = false) {
    const empIds = getEmpIds();
    if (empIds.length === 0) { toast('Select at least one employee.', true); return; }
    if (!allShifts && !selIsShift) { toast('Select a shift to copy.', true); return; }
    try {
      const body: Record<string, unknown> = { employee_ids: empIds };
      if (!allShifts && selected?.type === 'shift') {
        body.shift_ids = [selected.shift.id];
      }
      const res  = await fetch('/api/employee-fixed-shifts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      toast(data.message || 'Copied successfully.');
    } catch { toast('Failed to copy.', true); }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl flex flex-col"
           style={{ width: '820px', maxHeight: '90vh' }}>

        {/* Title */}
        <div className="px-5 py-3 border-b border-[var(--border)] text-center shrink-0">
          <h2 className="text-sm font-semibold uppercase tracking-wide">Fixed Shifts</h2>
        </div>

        {/* Body: tree (50%) | buttons (15%) | employees (35%) */}
        <div className="flex flex-1 overflow-hidden min-h-0">

          {/* ── Tree (50%) ─────────────────────────────────────────────── */}
          <div className="flex gap-3 p-4 border-r border-[var(--border)]"
               style={{ width: '65%' }}>
            <div className="flex-1 border border-[var(--border)] rounded-md overflow-y-auto
                            bg-white font-mono text-sm"
                 style={{ minHeight: '360px' }}>
              {loading ? (
                <p className="text-xs text-[var(--text-muted)] p-3">Loading…</p>
              ) : (
                <>
                  {/* Root node */}
                  <div className="px-2 py-1.5 font-bold text-[var(--text-primary)]
                                  bg-[var(--surface-stripe)] border-b border-[var(--border)]
                                  text-sm">
                    Shifts
                  </div>

                  {shifts.length === 0 ? (
                    <p className="text-xs text-[var(--text-muted)] p-3">
                      No fixed shifts. Click New to create one.
                    </p>
                  ) : (
                    shifts.map(shift => {
                      const isSelected   = selected?.type === 'shift' && selected.shift.id === shift.id;
                      const isExpanded   = expanded.has(shift.id);
                      const hasBreaks    = shift.breaks.length > 0;

                      return (
                        <div key={shift.id}>
                          {/* Shift row */}
                          <div
                            onClick={() => setSelected({ type: 'shift', shift })}
                            className={`flex items-center gap-1 px-2 py-1.5 cursor-pointer
                                        select-none border-b border-[var(--border)]
                                        ${isSelected
                                          ? 'bg-[var(--brand-600)] text-white'
                                          : 'hover:bg-[var(--surface-hover)]'}`}
                          >
                            {/* Expand/collapse triangle */}
                            <button
                              type="button"
                              onClick={e => { e.stopPropagation(); if (hasBreaks) toggleExpand(shift.id); }}
                              className={`w-4 h-4 flex items-center justify-center shrink-0
                                          text-xs transition-transform
                                          ${!hasBreaks ? 'opacity-0 pointer-events-none' : ''}
                                          ${isSelected ? 'text-white' : 'text-[var(--text-muted)]'}`}
                            >
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
                                   stroke="currentColor" strokeWidth="2.5"
                                   style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                                            transition: 'transform 0.15s' }}>
                                <polyline points="9 18 15 12 9 6"/>
                              </svg>
                            </button>

                            <span>{shift.length.toFixed(2)} hours</span>
                            {shift.standard ? (
                              <span className={`ml-1 text-xs ${isSelected ? 'text-white/70' : 'text-[var(--text-muted)]'}`}>✓</span>
                            ) : null}
                          </div>

                          {/* Break children — shown when expanded */}
                          {hasBreaks && isExpanded && shift.breaks.map(brk => {
                            const brkSelected = selected?.type === 'break'
                              && selected.brk.id === brk.id;
                            return (
                              <div key={brk.id}
                                   onClick={() => setSelected({ type: 'break', shift, brk })}
                                   className={`flex items-center gap-1 pl-8 pr-2 py-1.5
                                               cursor-pointer select-none border-b
                                               border-[var(--border)]
                                               ${brkSelected
                                                 ? 'bg-[var(--brand-600)] text-white'
                                                 : 'bg-[var(--surface-stripe)] hover:bg-[var(--surface-hover)]'}`}>
                                {/* Break label: "{total}: {minutes} min. {Paid/Unpaid} {name}" */}
                                {brk.total}: {brk.minutes} min. {brk.paid ? 'Paid' : 'Unpaid'} {brk.break_name}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })
                  )}
                </>
              )}
            </div>

            {/* Buttons column */}
            <div className="flex flex-col gap-1.5 w-28 shrink-0">
              <button className="btn-primary btn-sm text-xs w-full"
                onClick={() => setShowAdd(true)}>New</button>
              <button className="btn-secondary btn-sm text-xs w-full"
                disabled={!canEdit}
                onClick={() => {
                  if (selIsBreak) setShowEditBreak(true);
                  else setShowEdit(true);
                }}>{editLabel}</button>
              <button className="btn btn-sm text-xs w-full bg-white border border-red-200
                                 text-red-600 hover:bg-red-50 disabled:opacity-40"
                disabled={!canDelete} onClick={handleDelete}>{delLabel}</button>
              <button className="btn btn-sm text-xs w-full bg-white border border-red-200
                                 text-red-600 hover:bg-red-50"
                onClick={() => setConfirmDeleteAll(true)}>Delete All</button>
              <div className="h-px bg-[var(--border)] my-1" />
              <button className="btn-secondary btn-sm text-xs w-full"
                disabled={!canAddBreak}
                onClick={() => setShowAddBreak(true)}>Add Break</button>
              <div className="h-px bg-[var(--border)] my-1" />
              <button className="btn-secondary btn-sm text-xs w-full"
                disabled={!selIsShift}
                onClick={() => handleCopy(false)}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" strokeWidth="2" className="inline mr-1">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>Copy
              </button>
              <button className="btn-secondary btn-sm text-xs w-full"
                onClick={() => handleCopy(true)}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" strokeWidth="2" className="inline mr-1">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>Copy All
              </button>
              <div className="h-px bg-[var(--border)] my-1" />
              <button className="btn-secondary btn-sm text-xs w-full"
                onClick={() => setShowCreate(true)}>Create Shifts</button>
            </div>
          </div>

          {/* ── Employees (35%) ────────────────────────────────────────── */}
          <div style={{ width: '35%' }} className="p-4 flex flex-col gap-2 min-h-0">
            <div className="flex items-center justify-between shrink-0">
              <label className="label mb-0 text-xs">Employees:</label>
              <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                <input type="checkbox" checked={allEmployees}
                  onChange={e => { setAllEmployees(e.target.checked); setSelEmpIds([]); }}
                  className="rounded border-gray-300" />
                All
              </label>
            </div>
            <div className="flex-1 border border-[var(--border)] rounded-md overflow-y-auto min-h-0"
                 style={{ minHeight: '360px' }}>
              {employees.map(emp => {
                const isSel = allEmployees || selEmpIds.includes(emp.id);
                return (
                  <div key={emp.id}
                       onDoubleClick={() => setShowEmpShifts(emp)}
                       onClick={() => !allEmployees && setSelEmpIds(prev =>
                         prev.includes(emp.id)
                           ? prev.filter(x => x !== emp.id)
                           : [...prev, emp.id]
                       )}
                       className={`px-2 py-1.5 text-xs cursor-pointer select-none
                                   border-b border-[var(--border)] last:border-b-0
                                   ${isSel
                                     ? 'bg-[var(--brand-600)] text-white'
                                     : 'hover:bg-[var(--surface-hover)]'}`}>
                    {emp.name}
                  </div>
                );
              })}
            </div>
            <p className="text-[10px] text-[var(--text-muted)] shrink-0">
              Double-click to view employee&apos;s fixed shifts
            </p>
          </div>
        </div>

        {/* Toast */}
        {msg && (
          <div className={`mx-4 mb-2 px-3 py-2 rounded text-xs
                           ${msgError ? 'alert-error' : 'alert-success'}`}>
            {msg}
          </div>
        )}

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[var(--border)] flex justify-end shrink-0">
          <button className="btn-secondary btn-sm" onClick={onClose}>Close</button>
        </div>
      </div>

      {/* ── Sub-dialogs ─────────────────────────────────────────────── */}
      {showAdd && (
        <ShiftLengthDialog isEdit={false}
          onSave={async (length, standard) => {
            await fetch('/api/fixed-shifts', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ length, standard }),
            });
            setShowAdd(false); load();
          }}
          onClose={() => setShowAdd(false)} />
      )}

      {showEdit && selected?.type === 'shift' && (
        <ShiftLengthDialog isEdit={true}
          initialLength={selected.shift.length}
          initialStandard={Boolean(selected.shift.standard)}
          onSave={async (length, standard) => {
            await fetch(`/api/fixed-shifts/${selected.shift.id}`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ length, standard }),
            });
            setShowEdit(false); load();
          }}
          onClose={() => setShowEdit(false)} />
      )}

      {showAddBreak && selected?.type === 'shift' && (
        <AddBreakDialog
          shifts={shifts}
          breaks={breaks}
          currentShiftId={selected.shift.id}
          isEdit={false}
          onSave={async (fromShiftId, toShiftId, breakId, total) => {
            // Mirrors CFixedShiftData::AddBreak — add to ALL shifts from→to
            await fetch(`/api/fixed-shifts/${fromShiftId}/breaks`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                break_id:         breakId,
                add_to_shift_id:  toShiftId,
                total,
                range_mode:       true, // tells API to add to all shifts in range
              }),
            });
            setShowAddBreak(false); load();
          }}
          onClose={() => setShowAddBreak(false)} />
      )}

      {showEditBreak && selected?.type === 'break' && (
        <AddBreakDialog
          shifts={shifts}
          breaks={breaks}
          currentShiftId={selected.shift.id}
          isEdit={true}
          initialBreakId={selected.brk.break_id}
          initialTotal={selected.brk.total}
          breakRecordId={selected.brk.id}
          onSave={async (_from, _to, breakId, total) => {
            await fetch(`/api/fixed-shifts/${selected.shift.id}/breaks`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                _method: 'UPDATE',
                break_record_id: selected.brk.id,
                break_id: breakId,
                total,
              }),
            });
            setShowEditBreak(false); load();
          }}
          onClose={() => setShowEditBreak(false)} />
      )}

      {showCreate && (
        <CreateShiftsDialog
          onSave={async (start, end, inc) => {
            let cur = start;
            while (cur <= end + 0.001) {
              await fetch('/api/fixed-shifts', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ length: parseFloat(cur.toFixed(2)), standard: true }),
              });
              cur += inc;
            }
            setShowCreate(false);
            toast(`Created shifts ${start}–${end} hours.`);
            load();
          }}
          onClose={() => setShowCreate(false)} />
      )}

      {showEmpShifts && (
        <EmployeeShiftsDialog
          employee={showEmpShifts}
          onClose={() => { setShowEmpShifts(null); load(); }} />
      )}

      {confirmDeleteAll && (
        <Confirm message="Are you sure you want to delete all shifts?"
          onConfirm={handleDeleteAll}
          onCancel={() => setConfirmDeleteAll(false)} />
      )}
    </div>
  );
}

// ─── ShiftLengthDialog ────────────────────────────────────────────────────────

function ShiftLengthDialog({ isEdit, initialLength = 8.5, initialStandard = true, onSave, onClose }: {
  isEdit: boolean; initialLength?: number; initialStandard?: boolean;
  onSave: (length: number, standard: boolean) => void; onClose: () => void;
}) {
  const [length, setLength]     = useState(initialLength.toString());
  const [standard, setStandard] = useState(initialStandard);
  const [isDirty, setIsDirty]   = useState(false);
  const [error, setError]       = useState('');
  const [showCancel, setShowCancel] = useState(false);

  function save() {
    const len = parseFloat(length);
    if (isNaN(len) || len < 0.5 || len > 12.5) {
      setError('Length must be 0.5–12.5 hours.'); return;
    }
    onSave(len, standard);
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]">
      <div className="bg-white rounded-xl shadow-2xl w-72">
        <div className="px-5 py-3 border-b border-[var(--border)] text-center">
          <h3 className="text-sm font-semibold uppercase tracking-wide">
            {isEdit ? 'Edit Fixed Shift' : 'New Fixed Shift'}
          </h3>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="label">Shift Length (hours)</label>
            <input className="input" type="number" step="0.25" min={0.5} max={12.5}
              value={length} autoFocus
              onChange={e => { setLength(e.target.value); setIsDirty(true); setError(''); }} />
            <p className="text-[10px] text-[var(--text-muted)] mt-1">Range: 0.5–12.5 hours</p>
          </div>
          <label className="flex items-center gap-2 cursor-pointer text-sm">
            <input type="checkbox" checked={standard}
              onChange={e => { setStandard(e.target.checked); setIsDirty(true); }}
              className="rounded border-gray-300" />
            Standard Shift
          </label>
          {error && <div className="alert-error text-xs">{error}</div>}
        </div>
        <div className="flex items-center justify-between px-5 py-3 border-t border-[var(--border)]
                        bg-[var(--surface-stripe)]">
          <button className="btn-primary btn-sm" onClick={save}>Save</button>
          <button className="btn-secondary btn-sm"
            onClick={() => isDirty ? setShowCancel(true) : onClose()}>Cancel</button>
        </div>
      </div>
      {showCancel && (
        <Confirm message="Save Changes?"
          onConfirm={save}
          onCancel={() => { setShowCancel(false); onClose(); }} />
      )}
    </div>
  );
}

// ─── AddBreakDialog ───────────────────────────────────────────────────────────
// When adding (not editing): shows "Add to Shift" dropdown — mirrors CFixedBreakDlg
// When adding in range mode: adds break to ALL shifts from current through "Add to Shift"

function AddBreakDialog({ shifts, breaks, currentShiftId, isEdit,
  initialBreakId, initialTotal = 1, breakRecordId, onSave, onClose }: {
  shifts: FixedShift[]; breaks: Break[]; currentShiftId: number;
  isEdit: boolean; initialBreakId?: number; initialTotal?: number;
  breakRecordId?: number;
  onSave: (fromShiftId: number, toShiftId: number, breakId: number, total: number) => void;
  onClose: () => void;
}) {
  const [breakId, setBreakId]       = useState(initialBreakId ?? (breaks[0]?.id ?? 0));
  const [toShiftId, setToShiftId]   = useState(currentShiftId);
  const [total, setTotal]           = useState(initialTotal);
  const [error, setError]           = useState('');

  const currentShift = shifts.find(s => s.id === currentShiftId);

  function save() {
    if (!breakId) { setError('Select a break type.'); return; }
    onSave(currentShiftId, toShiftId, breakId, total);
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]">
      <div className="bg-white rounded-xl shadow-2xl w-80">
        <div className="px-5 py-3 border-b border-[var(--border)] text-center">
          <h3 className="text-sm font-semibold uppercase tracking-wide">
            {isEdit ? 'Edit Fixed Break' : 'Add Fixed Break'}
          </h3>
        </div>
        <div className="p-5 space-y-4">
          {/* Current shift (read-only) */}
          <div>
            <label className="label">Current Shift</label>
            <p className="text-sm font-medium font-mono">
              {currentShift ? `${currentShift.length.toFixed(2)} hours` : '—'}
            </p>
          </div>

          {/* Break list — mirrors m_BreakList listbox */}
          <div>
            <label className="label">Break Type *</label>
            <div className="border border-[var(--border)] rounded-md overflow-y-auto max-h-36">
              {breaks.map(b => (
                <div key={b.id} onClick={() => setBreakId(b.id)}
                     className={`px-3 py-1.5 text-sm cursor-pointer border-b border-[var(--border)]
                                 last:border-b-0
                                 ${breakId === b.id
                                   ? 'bg-[var(--brand-600)] text-white'
                                   : 'hover:bg-[var(--surface-hover)]'}`}>
                  {b.minutes} min. {b.paid ? 'Paid' : 'Unpaid'} {b.name}
                </div>
              ))}
            </div>
          </div>

          {/* Total (1–4) */}
          <div>
            <label className="label">Total (1–4)</label>
            <input className="input input-sm w-20 text-center" type="number" min={1} max={4}
              value={total}
              onChange={e => setTotal(Math.min(4, Math.max(1, +e.target.value)))} />
          </div>

          {/* Add to Shift — only for Add mode, mirrors m_AddToShift combo */}
          {/* In CFixedShiftData::AddBreak: adds to ALL shifts from current → selected */}
          {!isEdit && (
            <div>
              <label className="label">Add to Shift (and all shifts in between)</label>
              <select className="select" value={toShiftId}
                onChange={e => setToShiftId(+e.target.value)}>
                {shifts.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.length.toFixed(2)} hours{s.standard ? ' ✓' : ''}
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-[var(--text-muted)] mt-1">
                Break will be added to all shifts from{' '}
                {currentShift?.length.toFixed(2)}h through the selected shift.
              </p>
            </div>
          )}

          {error && <div className="alert-error text-xs">{error}</div>}
        </div>
        <div className="flex items-center justify-between px-5 py-3 border-t border-[var(--border)]
                        bg-[var(--surface-stripe)]">
          <button className="btn-primary btn-sm" onClick={save}>Save</button>
          <button className="btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ─── CreateShiftsDialog ───────────────────────────────────────────────────────

function CreateShiftsDialog({ onSave, onClose }: {
  onSave: (start: number, end: number, inc: number) => void;
  onClose: () => void;
}) {
  const [start, setStart]   = useState('1.0');
  const [end, setEnd]       = useState('8.5');
  const [incIdx, setIncIdx] = useState(0);
  const [isDirty, setIsDirty] = useState(false);
  const [error, setError]   = useState('');
  const [showCancel, setShowCancel] = useState(false);
  const INCS = [0.25, 0.50, 1.00];

  function save() {
    const s = parseFloat(start), e = parseFloat(end);
    if (isNaN(s) || s < 1 || s > 12) { setError('Start must be 1–12'); return; }
    if (isNaN(e) || e < 1 || e > 12) { setError('End must be 1–12'); return; }
    if (e < s) { setError('End must be ≥ Start'); return; }
    onSave(s, e, INCS[incIdx]);
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]">
      <div className="bg-white rounded-xl shadow-2xl w-72">
        <div className="px-5 py-3 border-b border-[var(--border)] text-center">
          <h3 className="text-sm font-semibold uppercase tracking-wide">Create Fixed Shifts</h3>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="label">Start Shift Length</label>
            <input className="input" type="number" step="0.25" min={1} max={12}
              value={start} onChange={e => { setStart(e.target.value); setIsDirty(true); }} />
          </div>
          <div>
            <label className="label">End Shift Length</label>
            <input className="input" type="number" step="0.25" min={1} max={12}
              value={end} onChange={e => { setEnd(e.target.value); setIsDirty(true); }} />
          </div>
          <div>
            <label className="label">Increment</label>
            <select className="select" value={incIdx}
              onChange={e => { setIncIdx(+e.target.value); setIsDirty(true); }}>
              <option value={0}>0.25 hours (15 min)</option>
              <option value={1}>0.50 hours (30 min)</option>
              <option value={2}>1.00 hours</option>
            </select>
          </div>
          {error && <div className="alert-error text-xs">{error}</div>}
        </div>
        <div className="flex items-center justify-between px-5 py-3 border-t border-[var(--border)]
                        bg-[var(--surface-stripe)]">
          <button className="btn-primary btn-sm" onClick={save}>Create</button>
          <button className="btn-secondary btn-sm"
            onClick={() => isDirty ? setShowCancel(true) : onClose()}>Cancel</button>
        </div>
      </div>
      {showCancel && (
        <Confirm message="Save Changes?"
          onConfirm={save}
          onCancel={() => { setShowCancel(false); onClose(); }} />
      )}
    </div>
  );
}

// ─── EmployeeShiftsDialog ─────────────────────────────────────────────────────

function EmployeeShiftsDialog({ employee, onClose }: {
  employee: Employee; onClose: () => void;
}) {
  const [assignments, setAssignments] = useState<FixedShift[]>([]);
  const [expanded, setExpanded]       = useState<Set<number>>(new Set());
  const [selected, setSelected]       = useState<number | null>(null);
  const [loading, setLoading]         = useState(true);
  const [confirmAll, setConfirmAll]   = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const [allRes, empRes] = await Promise.all([
        fetch('/api/fixed-shifts'),
        fetch(`/api/employee-fixed-shifts?employee_id=${employee.id}`),
      ]);
      const allData = await allRes.json();
      const empData = await empRes.json();
      const assignedIds = new Set(
        (empData.assignments || []).map((a: { fixed_shift_id: number }) => a.fixed_shift_id)
      );
      setAssignments((allData.shifts || []).filter((s: FixedShift) => assignedIds.has(s.id)));
    } catch { /* silent */ }
    finally { setLoading(false); }
  }

  async function handleDelete() {
    if (!selected) return;
    await fetch('/api/employee-fixed-shifts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ _method: 'DELETE', employee_id: employee.id, fixed_shift_id: selected }),
    });
    setSelected(null); load();
  }

  async function handleDeleteAll() {
    await fetch('/api/employee-fixed-shifts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ _method: 'DELETE_EMPLOYEE_ALL', employee_id: employee.id }),
    });
    setConfirmAll(false); setSelected(null); load();
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]">
      <div className="bg-white rounded-xl shadow-2xl w-72">
        <div className="px-5 py-3 border-b border-[var(--border)] text-center">
          <h3 className="text-sm font-semibold uppercase tracking-wide">
            {employee.name.toUpperCase()}&apos;S FIXED SHIFTS
          </h3>
        </div>
        <div className="p-4">
          <div className="border border-[var(--border)] rounded-md overflow-y-auto font-mono text-sm"
               style={{ minHeight: '200px', maxHeight: '320px' }}>
            {loading ? (
              <p className="text-xs text-[var(--text-muted)] p-3">Loading…</p>
            ) : assignments.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)] p-3">No fixed shifts assigned.</p>
            ) : (
              <>
                <div className="px-2 py-1.5 font-bold bg-[var(--surface-stripe)]
                                border-b border-[var(--border)]">Shifts</div>
                {assignments.map(s => (
                  <div key={s.id}>
                    <div onClick={() => setSelected(s.id === selected ? null : s.id)}
                         className={`flex items-center gap-1 px-2 py-1.5 cursor-pointer
                                     border-b border-[var(--border)]
                                     ${selected === s.id
                                       ? 'bg-[var(--brand-600)] text-white'
                                       : 'hover:bg-[var(--surface-hover)]'}`}>
                      {s.breaks.length > 0 && (
                        <button type="button"
                          onClick={e => { e.stopPropagation(); setExpanded(prev => { const n = new Set(prev); n.has(s.id) ? n.delete(s.id) : n.add(s.id); return n; }); }}
                          className="w-4 h-4 flex items-center justify-center">
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
                               stroke="currentColor" strokeWidth="2.5"
                               style={{ transform: expanded.has(s.id) ? 'rotate(90deg)' : 'none',
                                        transition: 'transform 0.15s' }}>
                            <polyline points="9 18 15 12 9 6"/>
                          </svg>
                        </button>
                      )}
                      <span>{s.length.toFixed(2)} hours{s.standard ? ' ✓' : ''}</span>
                    </div>
                    {expanded.has(s.id) && s.breaks.map(b => (
                      <div key={b.id}
                           className="pl-8 pr-2 py-1 text-xs border-b border-[var(--border)]
                                      bg-[var(--surface-stripe)] text-[var(--text-secondary)]">
                        {b.total}: {b.minutes} min. {b.paid ? 'Paid' : 'Unpaid'} {b.break_name}
                      </div>
                    ))}
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
        <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--border)]
                        bg-[var(--surface-stripe)]">
          <div className="flex gap-2">
            <button className="btn btn-sm bg-white border border-red-200 text-red-600
                               hover:bg-red-50 text-xs disabled:opacity-40"
              disabled={!selected} onClick={handleDelete}>Delete</button>
            <button className="btn btn-sm bg-white border border-red-200 text-red-600
                               hover:bg-red-50 text-xs disabled:opacity-40"
              disabled={assignments.length === 0}
              onClick={() => setConfirmAll(true)}>Delete All</button>
          </div>
          <button className="btn-secondary btn-sm text-xs" onClick={onClose}>Close</button>
        </div>
      </div>
      {confirmAll && (
        <Confirm message={`Delete all fixed shifts for ${employee.name}?`}
          onConfirm={handleDeleteAll} onCancel={() => setConfirmAll(false)} />
      )}
    </div>
  );
}

// ─── Confirm overlay ──────────────────────────────────────────────────────────

function Confirm({ message, onConfirm, onCancel }: {
  message: string; onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70]">
      <div className="bg-white rounded-lg shadow-xl p-6 max-w-sm w-full mx-4">
        <p className="text-sm text-[var(--text-primary)] mb-5">{message}</p>
        <div className="flex gap-3 justify-end">
          <button className="btn-secondary btn-sm" onClick={onCancel}>No</button>
          <button className="btn-primary btn-sm" onClick={onConfirm}>Yes</button>
        </div>
      </div>
    </div>
  );
}
