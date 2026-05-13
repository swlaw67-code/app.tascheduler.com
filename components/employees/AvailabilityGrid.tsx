'use client';
// components/employees/AvailabilityGrid.tsx
// 7-day availability grid — each day shows a time range picker
// Mirrors the desktop app's CDefaultAvailDlg / CAvailableDlg

import { useState } from 'react';
import { DAY_SHORT } from '@/lib/types';

interface AvailSlot {
  start_hour:   number;
  start_minute: number;
  stop_hour:    number;
  stop_minute:  number;
}

interface DayAvail {
  enabled: boolean;
  slots:   AvailSlot[];
}

export type WeekAvail = DayAvail[];

interface Props {
  value:    WeekAvail;
  onChange: (val: WeekAvail) => void;
  military: boolean;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = [0, 15, 30, 45];

function timeLabel(hour: number, minute: number, military: boolean): string {
  if (military) {
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  }
  const h = hour % 12 || 12;
  const m = String(minute).padStart(2, '0');
  return `${h}:${m}${hour < 12 ? 'am' : 'pm'}`;
}

export function defaultWeekAvail(): WeekAvail {
  return Array.from({ length: 7 }, () => ({
    enabled: false,
    slots: [{ start_hour: 8, start_minute: 0, stop_hour: 17, stop_minute: 0 }],
  }));
}

export function availFromDb(
  rows: { day: number; start_hour: number; start_minute: number; stop_hour: number; stop_minute: number }[]
): WeekAvail {
  const week = defaultWeekAvail();
  const byDay = new Map<number, AvailSlot[]>();
  for (const r of rows) {
    if (!byDay.has(r.day)) byDay.set(r.day, []);
    byDay.get(r.day)!.push({
      start_hour: r.start_hour, start_minute: r.start_minute,
      stop_hour:  r.stop_hour,  stop_minute:  r.stop_minute,
    });
  }
  for (const [day, slots] of byDay) {
    week[day] = { enabled: true, slots };
  }
  return week;
}

export default function AvailabilityGrid({ value, onChange, military }: Props) {
  function toggleDay(day: number) {
    const next = [...value];
    next[day] = { ...next[day], enabled: !next[day].enabled };
    onChange(next);
  }

  function updateSlot(day: number, slotIdx: number, field: keyof AvailSlot, val: number) {
    const next = value.map((d, di) => {
      if (di !== day) return d;
      const slots = d.slots.map((s, si) =>
        si === slotIdx ? { ...s, [field]: val } : s
      );
      return { ...d, slots };
    });
    onChange(next);
  }

  function addSlot(day: number) {
    const next = value.map((d, di) => {
      if (di !== day) return d;
      return {
        ...d,
        slots: [...d.slots, { start_hour: 8, start_minute: 0, stop_hour: 17, stop_minute: 0 }],
      };
    });
    onChange(next);
  }

  function removeSlot(day: number, slotIdx: number) {
    const next = value.map((d, di) => {
      if (di !== day) return d;
      return { ...d, slots: d.slots.filter((_, si) => si !== slotIdx) };
    });
    onChange(next);
  }

  return (
    <div className="space-y-2">
      {value.map((dayAvail, day) => (
        <div key={day}
             className={`border rounded-lg transition-colors
                         ${dayAvail.enabled
                           ? 'border-[var(--brand-300)] bg-[var(--brand-50)]'
                           : 'border-[var(--border)] bg-white'}`}>
          {/* Day header */}
          <div className="flex items-center gap-3 px-3 py-2">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={dayAvail.enabled}
                onChange={() => toggleDay(day)}
                className="w-4 h-4 rounded border-gray-300 text-[var(--brand-600)]
                           focus:ring-[var(--brand-500)]"
              />
              <span className={`text-sm font-semibold w-8
                                ${dayAvail.enabled
                                  ? 'text-[var(--brand-700)]'
                                  : 'text-[var(--text-muted)]'}`}>
                {DAY_SHORT[day]}
              </span>
            </label>

            {dayAvail.enabled && (
              <button
                type="button"
                onClick={() => addSlot(day)}
                className="ml-auto text-xs text-[var(--brand-600)] hover:text-[var(--brand-800)]
                           font-medium transition-colors"
              >
                + Add slot
              </button>
            )}
          </div>

          {/* Time slots */}
          {dayAvail.enabled && (
            <div className="px-3 pb-3 space-y-2">
              {dayAvail.slots.map((slot, si) => (
                <div key={si} className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-[var(--text-muted)] w-10">From</span>

                  {/* Start hour */}
                  <select
                    className="select input-sm w-24 text-xs"
                    value={slot.start_hour}
                    onChange={e => updateSlot(day, si, 'start_hour', +e.target.value)}
                  >
                    {HOURS.map(h => (
                      <option key={h} value={h}>{timeLabel(h, slot.start_minute, military)}</option>
                    ))}
                  </select>

                  {/* Start minute */}
                  <select
                    className="select input-sm w-20 text-xs"
                    value={slot.start_minute}
                    onChange={e => updateSlot(day, si, 'start_minute', +e.target.value)}
                  >
                    {MINUTES.map(m => (
                      <option key={m} value={m}>:{String(m).padStart(2,'0')}</option>
                    ))}
                  </select>

                  <span className="text-xs text-[var(--text-muted)]">to</span>

                  {/* Stop hour */}
                  <select
                    className="select input-sm w-24 text-xs"
                    value={slot.stop_hour}
                    onChange={e => updateSlot(day, si, 'stop_hour', +e.target.value)}
                  >
                    {HOURS.map(h => (
                      <option key={h} value={h}>{timeLabel(h, slot.stop_minute, military)}</option>
                    ))}
                  </select>

                  {/* Stop minute */}
                  <select
                    className="select input-sm w-20 text-xs"
                    value={slot.stop_minute}
                    onChange={e => updateSlot(day, si, 'stop_minute', +e.target.value)}
                  >
                    {MINUTES.map(m => (
                      <option key={m} value={m}>:{String(m).padStart(2,'0')}</option>
                    ))}
                  </select>

                  {/* Remove slot button */}
                  {dayAvail.slots.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeSlot(day, si)}
                      className="text-[var(--text-muted)] hover:text-red-500 transition-colors ml-1"
                      title="Remove this time slot"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                           stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18"/>
                        <line x1="6" y1="6" x2="18" y2="18"/>
                      </svg>
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
