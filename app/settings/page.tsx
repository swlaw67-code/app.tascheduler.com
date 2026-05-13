'use client';
// app/settings/page.tsx
// Mirrors COptionsDlg — global application options
// Two-column layout on desktop, single column on mobile.

import { useState, useEffect, useCallback } from 'react';
import AppShell from '@/components/layout/AppShell';
import ColorPicker from '@/components/ui/ColorPicker';
import Modal from '@/components/ui/Modal';
import { SWITCH_SOURCES, type SwitchSource } from '@/lib/types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Settings {
  switch_source:       string;
  erlang_c:            boolean;
  ignore_days:         boolean;
  call_length:         number;
  holiday_years:       number;
  mtf_schedule_rule:   string;
  employee_min_hours:  boolean;
  reverse_data:        boolean;
  show_totals:         boolean;
  schedule_30:         boolean;
  highest_skill:       boolean;
  weekend:             boolean;
  use_weekend:         boolean;
  weekend_count:       number;
  skill_breaks:        boolean;
  show_weekly:         boolean;
  show_cost:           boolean;
  black_ink:           boolean;
  military_time:       boolean;
  employee_sort:       boolean;
  disable_caching:     boolean;
  special_color:       number;
  moving_color:        number;
  actual_color:        number;
  chart_line_color:    number;
  chart_fill_color:    number;
  schedule_line_color: number;
}

interface ImportOptions {
  inbound:    boolean;
  outbound:   boolean;
  conf_setup: boolean;
  agent_conf: boolean;
  wrap:       boolean;
  admin:      boolean;
  hold:       boolean;
  queue:      boolean;
  hold_sec:   number;
  queue_sec:  number;
}

const defaultSettings: Settings = {
  switch_source: 'Telescan', erlang_c: false, ignore_days: false,
  call_length: 5, holiday_years: 1, mtf_schedule_rule: 'TASScheduler',
  employee_min_hours: false, reverse_data: false, show_totals: false,
  schedule_30: false, highest_skill: false, weekend: false,
  use_weekend: false, weekend_count: 0, skill_breaks: false,
  show_weekly: true, show_cost: false, black_ink: false,
  military_time: false, employee_sort: false, disable_caching: false,
  special_color: 65535, moving_color: 65280, actual_color: 16744448,
  chart_line_color: 32768, chart_fill_color: 65535, schedule_line_color: 32768,
};

const defaultImportOptions: ImportOptions = {
  inbound: true, outbound: true, conf_setup: false, agent_conf: false,
  wrap: false, admin: false, hold: false, queue: false,
  hold_sec: 30, queue_sec: 30,
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]
                   border-b border-[var(--border)] pb-1.5 mb-2.5 mt-4 first:mt-0">
      {children}
    </h2>
  );
}

function CheckRow({ label, checked, onChange, desc }: {
  label: string; checked: boolean; onChange: (v: boolean) => void; desc?: string;
}) {
  return (
    <label className="flex items-start gap-2.5 cursor-pointer group py-0.5">
      <input type="checkbox" checked={checked}
        onChange={e => onChange(e.target.checked)}
        className="mt-0.5 rounded border-gray-300 shrink-0" />
      <span className="text-sm">
        <span className="text-[var(--text-primary)]">{label}</span>
        {desc && <span className="block text-xs text-[var(--text-muted)] mt-0.5">{desc}</span>}
      </span>
    </label>
  );
}

// ─── Import Options Modal ─────────────────────────────────────────────────────

function ImportOptionsModal({
  switchName, onClose,
}: {
  switchName: string;
  onClose: () => void;
}) {
  const [opts, setOpts]     = useState<ImportOptions>(defaultImportOptions);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]  = useState(false);
  const [error, setError]    = useState('');
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res  = await fetch(`/api/settings/import-options?switch=${encodeURIComponent(switchName)}`);
        const data = await res.json();
        if (data.options) {
          const o = data.options;
          setOpts({
            inbound:    Boolean(o.inbound),
            outbound:   Boolean(o.outbound),
            conf_setup: Boolean(o.conf_setup),
            agent_conf: Boolean(o.agent_conf),
            wrap:       Boolean(o.wrap),
            admin:      Boolean(o.admin),
            hold:       Boolean(o.hold),
            queue:      Boolean(o.queue),
            hold_sec:   Number(o.hold_sec  ?? 30),
            queue_sec:  Number(o.queue_sec ?? 30),
          });
        }
      } catch { setError('Failed to load options.'); }
      finally { setLoading(false); }
    })();
  }, [switchName]);

  function set<K extends keyof ImportOptions>(key: K, val: ImportOptions[K]) {
    setOpts(o => ({ ...o, [key]: val }));
    setIsDirty(true);
  }

  async function handleSave() {
    setSaving(true); setError('');
    try {
      const res  = await fetch('/api/settings/import-options', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ switch_name: switchName, ...opts }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to save.'); return; }
      setIsDirty(false);
      onClose();
    } catch { setError('Connection error.'); }
    finally { setSaving(false); }
  }

  const title = `${switchName.toUpperCase()} IMPORT OPTIONS`;

  return (
    <Modal title={title} onClose={onClose} size="sm">
      {loading ? (
        <div className="p-6 text-sm text-[var(--text-muted)]">Loading…</div>
      ) : (
        <div className="p-5 space-y-2">
          {error && <div className="alert-error text-xs mb-3">{error}</div>}

          <CheckRow label="Inbound"        checked={opts.inbound}    onChange={v => set('inbound', v)} />
          <CheckRow label="Outbound"       checked={opts.outbound}   onChange={v => set('outbound', v)} />
          <CheckRow label="Conf Setup"     checked={opts.conf_setup} onChange={v => set('conf_setup', v)} />
          <CheckRow label="Agent Conf"     checked={opts.agent_conf} onChange={v => set('agent_conf', v)} />
          <CheckRow label="Agent Wrap"     checked={opts.wrap}       onChange={v => set('wrap', v)} />
          <CheckRow label="Admin"          checked={opts.admin}      onChange={v => set('admin', v)} />

          <div className="space-y-2 pt-1">
            <label className="flex items-center gap-2.5 cursor-pointer py-0.5">
              <input type="checkbox" checked={opts.hold}
                onChange={e => set('hold', e.target.checked)}
                className="rounded border-gray-300 shrink-0" />
              <span className="text-sm text-[var(--text-primary)]">Hold</span>
              {opts.hold && (
                <div className="flex items-center gap-1.5 ml-2">
                  <input className="input w-16 text-center py-0.5 text-xs"
                    type="number" min={0} max={600}
                    value={opts.hold_sec}
                    onChange={e => set('hold_sec', Math.min(600, Math.max(0, +e.target.value || 30)))} />
                  <span className="text-xs text-[var(--text-muted)]">sec</span>
                </div>
              )}
            </label>

            <label className="flex items-center gap-2.5 cursor-pointer py-0.5">
              <input type="checkbox" checked={opts.queue}
                onChange={e => set('queue', e.target.checked)}
                className="rounded border-gray-300 shrink-0" />
              <span className="text-sm text-[var(--text-primary)]">Queue</span>
              {opts.queue && (
                <div className="flex items-center gap-1.5 ml-2">
                  <input className="input w-16 text-center py-0.5 text-xs"
                    type="number" min={0} max={600}
                    value={opts.queue_sec}
                    onChange={e => set('queue_sec', Math.min(600, Math.max(0, +e.target.value || 30)))} />
                  <span className="text-xs text-[var(--text-muted)]">sec</span>
                </div>
              )}
            </label>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-[var(--border)] mt-4">
            <button className="btn-secondary btn-sm" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button className="btn-primary btn-sm" onClick={handleSave}
              disabled={saving || !isDirty}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [form, setForm]             = useState<Settings>(defaultSettings);
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [saved, setSaved]           = useState(false);
  const [error, setError]           = useState('');
  const [isDirty, setIsDirty]       = useState(false);
  const [showImportOpts, setShowImportOpts] = useState(false);

  const load = useCallback(async () => {
    try {
      const res  = await fetch('/api/settings');
      const data = await res.json();
      if (data.settings) {
        const s = data.settings;
        setForm({
          switch_source:       s.switch_source       ?? defaultSettings.switch_source,
          erlang_c:            Boolean(s.erlang_c),
          ignore_days:         Boolean(s.ignore_days),
          call_length:         Number(s.call_length   ?? defaultSettings.call_length),
          holiday_years:       Number(s.holiday_years ?? defaultSettings.holiday_years),
          mtf_schedule_rule:   s.mtf_schedule_rule   ?? defaultSettings.mtf_schedule_rule,
          employee_min_hours:  Boolean(s.employee_min_hours),
          reverse_data:        Boolean(s.reverse_data),
          show_totals:         Boolean(s.show_totals),
          schedule_30:         Boolean(s.schedule_30),
          highest_skill:       Boolean(s.highest_skill),
          weekend:             Boolean(s.weekend),
          use_weekend:         Boolean(s.use_weekend),
          weekend_count:       Number(s.weekend_count ?? 0),
          skill_breaks:        Boolean(s.skill_breaks),
          show_weekly:         Boolean(s.show_weekly),
          show_cost:           Boolean(s.show_cost),
          black_ink:           Boolean(s.black_ink),
          military_time:       Boolean(s.military_time),
          employee_sort:       Boolean(s.employee_sort),
          disable_caching:     Boolean(s.disable_caching),
          special_color:       Number(s.special_color       ?? defaultSettings.special_color),
          moving_color:        Number(s.moving_color        ?? defaultSettings.moving_color),
          actual_color:        Number(s.actual_color        ?? defaultSettings.actual_color),
          chart_line_color:    Number(s.chart_line_color    ?? defaultSettings.chart_line_color),
          chart_fill_color:    Number(s.chart_fill_color    ?? defaultSettings.chart_fill_color),
          schedule_line_color: Number(s.schedule_line_color ?? defaultSettings.schedule_line_color),
        });
      }
    } catch { setError('Failed to load settings.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  function set<K extends keyof Settings>(key: K, val: Settings[K]) {
    setForm(f => ({ ...f, [key]: val }));
    setIsDirty(true);
    setSaved(false);
  }

  async function handleSave() {
    setSaving(true); setError('');
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to save.'); return; }
      setSaved(true); setIsDirty(false);
      setTimeout(() => setSaved(false), 3000);
    } catch { setError('Connection error.'); }
    finally { setSaving(false); }
  }

  if (loading) {
    return <AppShell><div className="p-6 text-sm text-[var(--text-muted)]">Loading settings…</div></AppShell>;
  }

  return (
    <AppShell>
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-5 lg:max-w-[624px]">
          <div>
            <h1 className="page-title">Settings</h1>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">Global application options</p>
          </div>
          <div className="flex items-center gap-3">
            {isDirty && !saving && (
              <span className="text-xs text-[var(--text-muted)]">Unsaved changes</span>
            )}
            {saved && (
              <span className="text-xs text-green-600 flex items-center gap-1">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" strokeWidth="2.5">
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

        {/* Two-column layout */}
        <div className="flex flex-col lg:flex-row gap-4 items-start lg:max-w-[624px]">

          {/* ── LEFT column ───────────────────────────────────────── */}
          <div className="card p-5 w-full lg:w-80 shrink-0">

            <SectionTitle>Call Data</SectionTitle>
            <div className="space-y-2.5">
              <div>
                <label className="label text-[10px] mb-1">Switch Source</label>
                <div className="flex items-center gap-2">
                  <select className="select flex-1" value={form.switch_source}
                    onChange={e => set('switch_source', e.target.value as SwitchSource)}>
                    {SWITCH_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <button type="button" className="btn-secondary btn-sm text-xs shrink-0"
                    onClick={() => setShowImportOpts(true)}>
                    Options…
                  </button>
                </div>
              </div>
              <div>
                <label className="label text-[10px] mb-1">Max Call Length (minutes)</label>
                <input className="input w-20 text-center" type="number" min={1} max={180}
                  value={form.call_length}
                  onChange={e => set('call_length', Math.min(180, Math.max(1, +e.target.value || 5)))} />
              </div>
              <CheckRow label="Reverse Data" checked={form.reverse_data}
                onChange={v => set('reverse_data', v)}
                desc="Show newest dates first in data grid" />
              <CheckRow label="Ignore Days" checked={form.ignore_days}
                onChange={v => set('ignore_days', v)} />
            </div>

            <SectionTitle>Forecast</SectionTitle>
            <div className="space-y-1">
              <CheckRow label="Use Erlang C" checked={form.erlang_c}
                onChange={v => set('erlang_c', v)} />
              <div className="pt-1">
                <label className="label text-[10px] mb-1">Holiday Years</label>
                <input className="input w-20 text-center" type="number" min={0} max={50}
                  value={form.holiday_years}
                  onChange={e => set('holiday_years', Math.min(50, Math.max(0, +e.target.value || 1)))} />
              </div>
            </div>

            <SectionTitle>Schedule</SectionTitle>
            <div className="space-y-1">
              <div className="pb-1">
                <label className="label text-[10px] mb-1">MTF Schedule Rule</label>
                <input className="input" value={form.mtf_schedule_rule} maxLength={50}
                  onChange={e => set('mtf_schedule_rule', e.target.value)} />
              </div>
              <CheckRow label="Schedule 30" checked={form.schedule_30}
                onChange={v => set('schedule_30', v)}
                desc="30-minute increments instead of 15" />
              <CheckRow label="Highest Skill"  checked={form.highest_skill}  onChange={v => set('highest_skill', v)} />
              <CheckRow label="Skill Breaks"   checked={form.skill_breaks}   onChange={v => set('skill_breaks', v)} />
              <CheckRow label="Show Weekly"    checked={form.show_weekly}    onChange={v => set('show_weekly', v)} />
              <CheckRow label="Show Cost"      checked={form.show_cost}      onChange={v => set('show_cost', v)} />
              <CheckRow label="Show Totals"    checked={form.show_totals}    onChange={v => set('show_totals', v)} />
              <CheckRow label="Black Ink"      checked={form.black_ink}      onChange={v => set('black_ink', v)} />
            </div>

          </div>

          {/* ── RIGHT column ──────────────────────────────────────── */}
          <div className="card p-5 w-72 shrink-0">

            <SectionTitle>Employees</SectionTitle>
            <div className="space-y-1">
              <CheckRow label="Military Time"      checked={form.military_time}     onChange={v => set('military_time', v)} />
              <CheckRow label="Employee Min Hours" checked={form.employee_min_hours} onChange={v => set('employee_min_hours', v)} />
              <CheckRow label="Use Sort for View"  checked={form.employee_sort}      onChange={v => set('employee_sort', v)}
                desc="Use user-defined sort order instead of skill/level order" />
            </div>

            <SectionTitle>Weekend Rules</SectionTitle>
            <div className="space-y-1">
              <CheckRow label="Weekend"          checked={form.weekend}     onChange={v => set('weekend', v)} />
              <CheckRow label="Use Weekend Rule" checked={form.use_weekend} onChange={v => set('use_weekend', v)} />
              <div className="pt-1 flex items-center gap-2">
                <label className="text-sm text-[var(--text-primary)]">Weekend Count</label>
                <input className="input w-16 text-center" type="number" min={0} max={6}
                  value={form.weekend_count}
                  onChange={e => set('weekend_count', Math.min(6, Math.max(0, +e.target.value || 0)))} />
              </div>
            </div>

            <SectionTitle>Colors</SectionTitle>
            <div className="space-y-1.5">
              {([
                ['Special Day',    'special_color'      ],
                ['Moving Average', 'moving_color'       ],
                ['Actual Line',    'actual_color'       ],
                ['Chart Line',     'chart_line_color'   ],
                ['Chart Fill',     'chart_fill_color'   ],
                ['Schedule Line',  'schedule_line_color'],
              ] as [string, keyof Settings][]).map(([label, key]) => (
                <div key={key} className="flex items-center gap-3">
                  <span className="text-sm text-[var(--text-primary)] w-32 shrink-0">{label}</span>
                  <ColorPicker
                    value={form[key] as number}
                    onChange={v => set(key, v)}
                  />
                </div>
              ))}
            </div>

          </div>
        </div>


      </div>

      {showImportOpts && (
        <ImportOptionsModal
          switchName={form.switch_source}
          onClose={() => setShowImportOpts(false)}
        />
      )}
    </AppShell>
  );
}
