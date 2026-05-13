'use client';
// components/settings/SkillsPanel.tsx
// Mirrors CSkillsDlg + CEditSkillsDlg exactly from source code
//
// Skills list: color swatch + name, Up/Down arrows (swap POI/sort_order)
// Double-click or Edit opens CEditSkillsDlg equivalent
//
// Edit Skill dialog layout (matches screenshot exactly):
//   Left:  Name, Color, "Percent Effective w/" + "1 Other Person" slider + value
//   Right top: "Skill Needs:" label + Edit button + read-only needs listbox
//   Right bottom: Higher Skill qualifies, Multiple by Employee, Need on Schedule,
//                 Exclude from Totals, Exclude Hours, Multiple Group Number, Code
//   Bottom: Save, Cancel (Cancel prompts "Save Changes?" if isDirty)

import { useState, useEffect, useRef } from 'react';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import SkillNeedsDialog from './SkillNeedsDialog';
import { colorRefToHex, hexToColorRef, DAY_NAMES, formatTime } from '@/lib/types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Skill {
  id:              number;
  name:            string;
  color:           number;
  code:            number;
  is_default:      number;
  poi:             number;
  op_perc_1:       number;
  exclude:         number;
  exclude_hours:   number;
  need:            number;
  higher:          number;
  multiple:        number;
  multiple_number: number;
  sort_order:      number;
}

interface SkillNeed {
  id:           number;
  skill_id:     number;
  day:          number;
  number:       number;
  start_hour:   number;
  start_minute: number;
  stop_hour:    number;
  stop_minute:  number;
}

interface SkillForm {
  name:            string;
  color:           number;
  op_perc_1:       number;
  higher:          boolean;
  multiple:        boolean;
  multiple_number: number;
  need:            boolean;
  exclude:         boolean;
  exclude_hours:   boolean;
  code:            number;
  is_default:      boolean;
}

interface Props { skills: Skill[]; onReload: () => void; onToast: (msg: string) => void; }

// ─── Needs list label — matches CSkillNeedData::ListRecords format exactly ───
function needLabel(need: SkillNeed): string {
  // Format: "{Number}: {Day}: {start}-{stop}"  e.g. "1: Sunday: 12:00a-8:00a"
  const start = formatTime(need.start_hour, need.start_minute, false);
  const stop  = formatTime(need.stop_hour,  need.stop_minute,  false);
  return `${need.number}: ${DAY_NAMES[need.day]}: ${start}-${stop}`;
}

// ─── SkillsPanel ─────────────────────────────────────────────────────────────

export default function SkillsPanel({ skills, onReload, onToast }: Props) {
  const [editTarget, setEditTarget]     = useState<Skill | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Skill | null>(null);
  const [cancelDirty, setCancelDirty]   = useState(false); // isDirty cancel confirm

  function openEdit(skill: Skill) { setEditTarget(skill); }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      const res  = await fetch(`/api/skills/${deleteTarget.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ _method: 'DELETE' }),
      });
      const data = await res.json();
      if (!res.ok) onToast(`Cannot delete: ${data.error}`);
      else { onToast(`Skill "${deleteTarget.name}" deleted.`); onReload(); }
    } catch { onToast('Failed to delete skill.'); }
    finally { setDeleteTarget(null); }
  }

  async function handleSetDefault(skill: Skill) {
    try {
      for (const s of skills) {
        await fetch(`/api/skills/${s.id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: s.name, color: s.color, code: s.code,
            is_default: s.id === skill.id,
            op_perc_1: s.op_perc_1, op_perc_2: s.op_perc_1,
            op_perc_3: s.op_perc_1, op_perc_4: s.op_perc_1,
            min_per_shift_1: 0, min_per_shift_2: 0, min_per_shift_3: 0,
            exclude: Boolean(s.exclude), exclude_hours: Boolean(s.exclude_hours),
            need: Boolean(s.need), higher: Boolean(s.higher),
            multiple: Boolean(s.multiple), multiple_number: s.multiple_number,
          }),
        });
      }
      onToast(`"${skill.name}" set as default skill.`);
      onReload();
    } catch { onToast('Failed to set default.'); }
  }

  async function handleMoveUp(skill: Skill) {
    const idx = skills.findIndex(s => s.id === skill.id);
    if (idx <= 0) { onToast(`${skill.name} is already at the top.`); return; }
    const above = skills[idx - 1];
    try {
      await fetch('/api/skills/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id_a: skill.id, poi_a: skill.sort_order,
          id_b: above.id, poi_b: above.sort_order,
        }),
      });
      onReload();
    } catch { onToast('Failed to reorder.'); }
  }

  async function handleMoveDown(skill: Skill) {
    const idx = skills.findIndex(s => s.id === skill.id);
    if (idx >= skills.length - 1) { onToast(`${skill.name} is already at the bottom.`); return; }
    const below = skills[idx + 1];
    try {
      await fetch('/api/skills/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id_a: skill.id, poi_a: skill.sort_order,
          id_b: below.id, poi_b: below.sort_order,
        }),
      });
      onReload();
    } catch { onToast('Failed to reorder.'); }
  }

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-[var(--text-secondary)]">
          {skills.length} skill{skills.length !== 1 ? 's' : ''} defined
          <span className="text-[var(--text-muted)] ml-2 text-xs">(ordered by POI)</span>
        </p>
        <div className="flex items-center gap-2">
          <button className="btn-primary btn-sm"
            onClick={() => setEditTarget({ id: 0, name: '', color: 16777215, code: 0,
              is_default: 0, poi: 0, op_perc_1: 100, exclude: 0, exclude_hours: 0,
              need: 0, higher: 0, multiple: 0, multiple_number: 0,
              sort_order: skills.length + 1 })}>
            New Skill
          </button>
        </div>
      </div>

      {/* Skills list — mirrors CSkillsDlg owner-draw listbox */}
      {skills.length === 0 ? (
        <div className="text-center py-8 text-sm text-[var(--text-muted)] border-2
                        border-dashed border-[var(--border)] rounded-lg">
          No skills yet. Click "New Skill" to add your first skill.
        </div>
      ) : (
        <div className="border border-[var(--border)] rounded-lg overflow-hidden">
          {skills.map((skill, idx) => (
            <div key={skill.id}
                 className="flex items-center gap-3 px-3 py-2 border-b border-[var(--border)]
                            last:border-b-0 bg-white hover:bg-[var(--surface-hover)]
                            transition-colors group">

              {/* Up/Down arrows — mirrors MFC_UpButton / MFC_DownButton */}
              <div className="flex flex-col gap-0.5 shrink-0">
                <button onClick={() => handleMoveUp(skill)} disabled={idx === 0}
                  title="Move Up"
                  className="w-5 h-4 flex items-center justify-center rounded
                             text-[var(--text-muted)] hover:text-[var(--brand-600)]
                             disabled:opacity-25 disabled:cursor-not-allowed">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
                       stroke="currentColor" strokeWidth="2.5">
                    <polyline points="18 15 12 9 6 15"/>
                  </svg>
                </button>
                <button onClick={() => handleMoveDown(skill)} disabled={idx === skills.length - 1}
                  title="Move Down"
                  className="w-5 h-4 flex items-center justify-center rounded
                             text-[var(--text-muted)] hover:text-[var(--brand-600)]
                             disabled:opacity-25 disabled:cursor-not-allowed">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
                       stroke="currentColor" strokeWidth="2.5">
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </button>
              </div>

              {/* Color swatch — mirrors DrawList color rectangle */}
              <span className="w-10 h-5 rounded shrink-0 border border-black/10"
                    style={{ background: colorRefToHex(skill.color) }} />

              {/* Name */}
              <span className="flex-1 text-sm font-medium text-[var(--text-primary)]">
                {skill.name}
              </span>

              {/* POI number */}
              <span className="text-xs text-[var(--text-muted)] w-5 text-center shrink-0">
                {idx + 1}
              </span>

              {/* Badges */}
              <div className="flex items-center gap-1 shrink-0">
                {Boolean(skill.is_default) && <span className="badge-blue text-[10px]">Default</span>}
                {Boolean(skill.need)       && <span className="badge-green text-[10px]">Need</span>}
                {Boolean(skill.exclude)    && <span className="badge-yellow text-[10px]">Excl.</span>}
              </div>

              {/* Action buttons — visible on hover */}
              <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                <button className="btn-ghost btn-sm text-xs"
                  onClick={() => openEdit(skill)}>Edit</button>
                <button className="btn btn-sm bg-white border border-[var(--border)]
                                   text-[var(--text-muted)] hover:border-blue-200
                                   hover:text-blue-600 text-xs"
                  onClick={() => handleSetDefault(skill)}>Set Default</button>
                <button className="btn btn-sm bg-white border border-red-200
                                   text-red-600 hover:bg-red-50 text-xs"
                  onClick={() => setDeleteTarget(skill)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit / New Skill Dialog */}
      {editTarget && (
        <EditSkillDialog
          skill={editTarget}
          isNew={editTarget.id === 0}
          onSaved={(msg) => {
            setEditTarget(null);
            onToast(msg);
            onReload();
          }}
          onClose={() => setEditTarget(null)}
        />
      )}

      {/* Delete Confirm */}
      {deleteTarget && (
        <ConfirmDialog title="Delete Skill"
          message={`Delete "${deleteTarget.name}"? Employees assigned to this skill must be reassigned first.`}
          danger confirmLabel="Delete"
          onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)} />
      )}
    </div>
  );
}

// ─── EditSkillDialog ──────────────────────────────────────────────────────────
// Mirrors CEditSkillsDlg exactly — two-column layout matching screenshot

interface EditSkillDialogProps {
  skill:   Skill;
  isNew:   boolean;
  onSaved: (msg: string) => void;
  onClose: () => void;
}

function EditSkillDialog({ skill, isNew, onSaved, onClose }: EditSkillDialogProps) {
  const [form, setForm] = useState<SkillForm>({
    name:            skill.name,
    color:           skill.color,
    op_perc_1:       skill.op_perc_1,
    higher:          Boolean(skill.higher),
    multiple:        Boolean(skill.multiple),
    multiple_number: skill.multiple_number,
    need:            Boolean(skill.need),
    exclude:         Boolean(skill.exclude),
    exclude_hours:   Boolean(skill.exclude_hours),
    code:            skill.code,
    is_default:      Boolean(skill.is_default),
  });

  const [needs, setNeeds]           = useState<SkillNeed[]>([]);
  const [needsLoading, setNeedsLoading] = useState(true);
  const [showNeedsDialog, setShowNeedsDialog] = useState(false);
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState('');
  const [isDirty, setIsDirty]       = useState(false);
  // tracks id after new skill is saved — allows needs dialog to open
  const [savedId, setSavedId]       = useState<number>(skill.id);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  // Load needs on open — mirrors OnInitDialog calling LoadNeeds()
  useEffect(() => {
    if (!isNew) loadNeeds();
    else setNeedsLoading(false);
  }, []);

  async function loadNeeds() {
    setNeedsLoading(true);
    try {
      const res  = await fetch(`/api/skill-needs/${savedId || skill.id}`);
      const data = await res.json();
      setNeeds(data.needs || []);
    } catch { /* silent */ }
    finally { setNeedsLoading(false); }
  }

  function set<K extends keyof SkillForm>(field: K, val: SkillForm[K]) {
    setForm(f => ({ ...f, [field]: val }));
    setIsDirty(true);
  }

  // Cancel — mirrors OnBnClickedCancel: if isDirty → "Save Changes?" Yes/No/Cancel
  function handleCancel() {
    if (isDirty) { setShowCancelConfirm(true); }
    else { onClose(); }
  }

  async function handleSave() {
    if (!form.name.trim()) { setError('Name field cannot be blank.'); return; }
    setSaving(true); setError('');
    try {
      const url = isNew ? '/api/skills' : `/api/skills/${skill.id}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:            form.name.trim(),
          color:           form.color,
          code:            form.code,
          is_default:      form.is_default,
          op_perc_1:       form.op_perc_1,
          op_perc_2:       form.op_perc_1,
          op_perc_3:       form.op_perc_1,
          op_perc_4:       form.op_perc_1,
          min_per_shift_1: 0,
          min_per_shift_2: 0,
          min_per_shift_3: 0,
          higher:          form.higher,
          multiple:        form.multiple,
          multiple_number: form.multiple_number,
          need:            form.need,
          exclude:         form.exclude,
          exclude_hours:   form.exclude_hours,
          poi:             skill.sort_order,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.error) { setError(data.error); return; }
      if (isNew && data.id) setSavedId(data.id);
      onSaved(isNew ? `Skill "${form.name}" added.` : `Skill "${form.name}" updated.`);
    } catch { setError('Connection error.'); }
    finally { setSaving(false); }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl">

          {/* Title bar — "EDIT SKILL" centered like desktop */}
          <div className="px-5 py-3 border-b border-[var(--border)] text-center">
            <h2 className="text-sm font-semibold text-[var(--text-primary)] uppercase tracking-wide">
              {isNew ? 'New Skill' : 'Edit Skill'}
            </h2>
          </div>

          {/* Two-column body — matches screenshot layout */}
          <div className="flex gap-0 min-h-[340px]">

            {/* ── Left column ─────────────────────────────────────────────── */}
            <div className="w-56 shrink-0 p-5 border-r border-[var(--border)] space-y-4">

              {/* Name */}
              <div>
                <label className="label">Name:</label>
                <input
                  className="input"
                  value={form.name}
                  maxLength={24}
                  autoFocus
                  onChange={e => set('name', e.target.value)}
                />
              </div>

              {/* Color */}
              <div>
                <label className="label">Color:</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={colorRefToHex(form.color)}
                    onChange={e => { set('color', hexToColorRef(e.target.value)); }}
                    className="w-12 h-8 rounded cursor-pointer border border-[var(--border)]
                               bg-white p-0.5"
                  />
                  <span className="text-xs text-[var(--text-muted)]">
                    {colorRefToHex(form.color).toUpperCase()}
                  </span>
                </div>
              </div>

              {/* Percent Agent/Op */}
              <div>
                <label className="label">Percent Agent/Op</label>
                <input
                  type="range"
                  min={0} max={100}
                  value={form.op_perc_1}
                  onChange={e => set('op_perc_1', +e.target.value)}
                  className="w-full mt-1 mb-2"
                />
                <input
                  type="number"
                  min={0} max={100}
                  value={form.op_perc_1}
                  onChange={e => set('op_perc_1', Math.min(100, Math.max(0, +e.target.value)))}
                  className="input input-sm w-20 text-center"
                />
              </div>
            </div>

            {/* ── Right column ────────────────────────────────────────────── */}
            <div className="flex-1 p-5 flex flex-col gap-4">

              {/* Skill Needs: label + Edit button — matches screenshot top-right */}
              <div>
                <div className="flex items-center gap-3 mb-1.5">
                  <label className="label mb-0">Skill Needs:</label>
                  <button
                    type="button"
                    className="btn-secondary btn-sm text-xs"
                    disabled={saving}
                    onClick={async () => {
                      if (savedId === 0) {
                        // New unsaved skill — save it first silently then open needs
                        if (!form.name.trim()) { setError('Enter a name before adding needs.'); return; }
                        setSaving(true); setError('');
                        try {
                          const res = await fetch('/api/skills', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              name: form.name.trim(), color: form.color, code: form.code,
                              is_default: form.is_default, op_perc_1: form.op_perc_1,
                              op_perc_2: form.op_perc_1, op_perc_3: form.op_perc_1,
                              op_perc_4: form.op_perc_1, min_per_shift_1: 0,
                              min_per_shift_2: 0, min_per_shift_3: 0,
                              higher: form.higher, multiple: form.multiple,
                              multiple_number: form.multiple_number, need: form.need,
                              exclude: form.exclude, exclude_hours: form.exclude_hours,
                              poi: skill.sort_order,
                            }),
                          });
                          const data = await res.json().catch(() => ({}));
                          if (data.error) { setError(data.error); return; }
                          setSavedId(data.id ?? 0);
                          setIsDirty(false);
                          setShowNeedsDialog(true);
                        } catch { setError('Connection error.'); }
                        finally { setSaving(false); }
                      } else {
                        setShowNeedsDialog(true);
                      }
                    }}
                  >
                    Edit
                  </button>
                  {savedId === 0 && (
                    <span className="text-xs text-[var(--text-muted)]">(saves skill first)</span>
                  )}
                </div>

                {/* Read-only needs listbox — mirrors m_SkillNeeds listbox */}
                <div className="border border-[var(--border)] rounded-md overflow-y-auto bg-white"
                     style={{ minHeight: '120px', maxHeight: '160px' }}>
                  {needsLoading ? (
                    <p className="text-xs text-[var(--text-muted)] p-2">Loading…</p>
                  ) : needs.length === 0 ? (
                    <p className="text-xs text-[var(--text-muted)] p-2">No needs defined.</p>
                  ) : (
                    needs.map(need => (
                      <div key={need.id}
                           className="px-2 py-1 text-xs font-mono border-b
                                      border-[var(--border)] last:border-b-0
                                      text-[var(--text-primary)]">
                        {needLabel(need)}
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Checkboxes — exact wording and order from screenshot */}
              <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                <label className="flex items-center gap-2 cursor-pointer text-sm">
                  <input type="checkbox" checked={form.higher}
                    onChange={e => set('higher', e.target.checked)}
                    className="rounded border-gray-300" />
                  Higher Skill qualifies
                </label>

                <label className="flex items-center gap-2 cursor-pointer text-sm">
                  <input type="checkbox" checked={form.exclude}
                    onChange={e => set('exclude', e.target.checked)}
                    className="rounded border-gray-300" />
                  Exclude from Totals
                </label>

                <label className="flex items-center gap-2 cursor-pointer text-sm">
                  <input type="checkbox" checked={form.multiple}
                    onChange={e => set('multiple', e.target.checked)}
                    className="rounded border-gray-300" />
                  Multiple by Employee
                </label>

                <label className="flex items-center gap-2 cursor-pointer text-sm">
                  <input type="checkbox" checked={form.exclude_hours}
                    onChange={e => set('exclude_hours', e.target.checked)}
                    className="rounded border-gray-300" />
                  Exclude Hours
                </label>

                <label className="flex items-center gap-2 cursor-pointer text-sm">
                  <input type="checkbox" checked={form.need}
                    onChange={e => set('need', e.target.checked)}
                    className="rounded border-gray-300" />
                  Need on Schedule
                </label>
              </div>

              {/* Multiple Group Number + Code — matches bottom-right of screenshot */}
              <div className="flex items-center gap-6 pt-1">
                <div className="flex items-center gap-2">
                  <label className="text-sm text-[var(--text-secondary)] whitespace-nowrap">
                    Multiple Group Number:
                  </label>
                  <input
                    type="number" min={0} max={255}
                    value={form.multiple_number}
                    onChange={e => set('multiple_number', +e.target.value)}
                    className="input input-sm w-16 text-center"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-sm text-[var(--text-secondary)]">Code:</label>
                  <input
                    type="number" min={0} max={255}
                    value={form.code}
                    onChange={e => set('code', +e.target.value)}
                    className="input input-sm w-16 text-center"
                  />
                </div>
              </div>

              {error && <div className="alert-error text-xs">{error}</div>}
            </div>
          </div>

          {/* Footer — Save, Cancel buttons matching desktop */}
          <div className="flex items-center justify-between px-5 py-3.5
                          border-t border-[var(--border)] bg-[var(--surface-stripe)]">
            <button
              className="btn-primary btn-sm flex items-center gap-1.5"
              disabled={saving}
              onClick={handleSave}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" strokeWidth="2">
                <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/>
                <polyline points="17 21 17 13 7 13 7 21"/>
                <polyline points="7 3 7 8 15 8"/>
              </svg>
              {saving ? 'Saving…' : 'Save'}
            </button>

            <button
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
        </div>
      </div>

      {/* Skill Needs Dialog — opens on top, reloads list on close */}
      {showNeedsDialog && (
        <SkillNeedsDialog
          skillId={savedId}
          skillName={form.name || skill.name}
          military={false}
          onClose={() => {
            setShowNeedsDialog(false);
            loadNeeds(); // mirrors: if (dlg.DoModal() == IDOK) LoadNeeds()
          }}
        />
      )}

      {/* Cancel confirmation — mirrors OnBnClickedCancel isDirty check */}
      {showCancelConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-sm w-full mx-4">
            <h3 className="font-semibold text-[var(--text-primary)] mb-1">Skill List Changed</h3>
            <p className="text-sm text-[var(--text-secondary)] mb-5">Save Changes?</p>
            <div className="flex gap-3 justify-end">
              <button className="btn-secondary btn-sm"
                onClick={() => { setShowCancelConfirm(false); onClose(); }}>
                No
              </button>
              <button className="btn-secondary btn-sm"
                onClick={() => setShowCancelConfirm(false)}>
                Cancel
              </button>
              <button className="btn-primary btn-sm"
                onClick={() => { setShowCancelConfirm(false); handleSave(); }}>
                Yes
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
