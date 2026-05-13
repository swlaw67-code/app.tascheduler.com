'use client';
// app/schedule/page.tsx
// The primary scheduler view — mirrors the desktop 3-tab MDI layout
// Data | Forecast | Schedule tabs, all loaded on entry

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import AppShell from '@/components/layout/AppShell';
import Modal from '@/components/ui/Modal';
import { SWITCH_SOURCES, type SwitchSource, colorRefToHex } from '@/lib/types';

type MainTab = 'data' | 'forecast' | 'schedule';

const TABS: { id: MainTab; label: string }[] = [
  { id: 'data',     label: 'Data'     },
  { id: 'forecast', label: 'Forecast' },
  { id: 'schedule', label: 'Schedule' },
];

export default function SchedulePage() {
  const [activeTab, setActiveTab] = useState<MainTab>('schedule');

  return (
    <AppShell>
      <div className="flex flex-col h-full">

        {/* 3-tab bar — always visible, mirrors desktop tab row */}
        <div className="bg-white border-b border-[var(--border)] flex items-end px-4 shrink-0">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors mr-1
                          ${activeTab === tab.id
                            ? 'border-[var(--brand-600)] text-[var(--brand-700)]'
                            : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-hidden">
          {activeTab === 'data'     && <DataView     />}
          {activeTab === 'forecast' && <ForecastView />}
          {activeTab === 'schedule' && <ScheduleView />}
        </div>
      </div>
    </AppShell>
  );
}

// ─── Data View ────────────────────────────────────────────────────────────────

// Call Data view — mirrors CDataView exactly.

// ─── Types ────────────────────────────────────────────────────────────────────

interface DayRow {
  date:      string;         // yyyy-mm-dd
  calls:     number[];       // flat 96-element array, index = hour*4+quarter
  talk_time: number[];       // flat 96-element array, index = hour*4+quarter
}

interface GridData {
  grid:        DayRow[];
  shiftValues: number[];     // 96 entries [0,1,2]
  shiftNames:  string[];     // ['1st Shift', '2nd Shift', '3rd Shift']
  specialDays: string[];     // set of yyyy-mm-dd
  reverseData: boolean;
  specialColor: number;      // COLORREF
  allDates:    string[];     // for filter dropdowns, oldest→newest
}

interface ParsedRecord {
  date: string; hour: number; quarter: number; calls: number; talk_time: number;
}

interface ImportOptions {
  inbound: boolean; outbound: boolean; conf_setup: boolean; agent_conf: boolean;
  wrap: boolean; admin: boolean; hold: boolean; queue: boolean;
  hold_sec: number; queue_sec: number;
}

const DEFAULT_GENESIS_OPTIONS: ImportOptions = {
  inbound: true, outbound: true, conf_setup: true, agent_conf: true,
  wrap: true, admin: true, hold: true, queue: true,
  hold_sec: 0, queue_sec: 0,
};

const DEFAULT_OPTIONS: ImportOptions = {
  inbound: true, outbound: true, conf_setup: false, agent_conf: false,
  wrap: false, admin: false, hold: false, queue: false,
  hold_sec: 0, queue_sec: 0,
};

// ─── Column headers (matches _gszColumnLabel exactly) ─────────────────────────

const QUARTER_LABELS = (() => {
  const labels: string[] = [];
  for (let h = 0; h < 24; h++) {
    for (let q = 0; q < 4; q++) {
      const mins = q * 15;
      if (h === 0 && q === 0) { labels.push('12a'); continue; }
      if (h === 12 && q === 0) { labels.push('12p'); continue; }
      const displayH = h > 12 ? h - 12 : h === 0 ? 12 : h;
      labels.push(mins === 0 ? `${displayH}` : `${displayH}:${String(mins).padStart(2,'0')}`);
    }
  }
  return labels;
})();

const ALL_HEADERS = ['Date', ...QUARTER_LABELS, '1st', '2nd', '3rd', 'Total', ''];
const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  // yyyy-mm-dd → mm/dd/yy
  if (!iso || iso.length < 10) return iso;
  return `${iso.slice(5,7)}/${iso.slice(8,10)}/${iso.slice(2,4)}`;
}

function formatTalkTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  if (m > 0) return `${m}:${String(s).padStart(2,'0')}`;
  return `:${String(s).padStart(2,'0')}`;
}

function computeRowTotals(row: DayRow, shiftValues: number[]) {
  const shiftCalls = [0, 0, 0];
  let totalCalls = 0;
  for (let h = 0; h < 24; h++) {
    for (let q = 0; q < 4; q++) {
      const slot = h * 4 + q;
      const sv = shiftValues[slot] ?? 0;
      shiftCalls[sv] += row.calls[slot] ?? 0;
      totalCalls += row.calls[slot] ?? 0;
    }
  }
  return { shiftCalls, totalCalls };
}

// ─── Import parsers (from existing data page) ─────────────────────────────────

function normalizeDate(d: string): string {
  if (!d) return '';
  const clean = d.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean;
  const parts = clean.split(/[\/\-\.]/);
  if (parts.length === 3) {
    if (parts[0].length === 4)
      return `${parts[0]}-${parts[1].padStart(2,'0')}-${parts[2].padStart(2,'0')}`;
    return `${parts[2].padStart(4,'20')}-${parts[0].padStart(2,'0')}-${parts[1].padStart(2,'0')}`;
  }
  return clean;
}

function parseForSwitch(source: SwitchSource, content: string, opts?: ImportOptions, maxTimeSec = 300): ParsedRecord[] {
  const lines = content.split('\n');

  // ── Genesis: tab-delimited per-call records, skip header line ─────────────
  // Mirrors C++ exactly:
  // - Accumulate slots per currdate using a dayrec equivalent
  // - When date changes, save currdate's data and reset (last date is NOT saved
  //   unless followed by another date — matches desktop behavior)
  // - Only process when answertype == 1 (case 15)
  // - Hold/Queue/Wrap/Patch only added when those options are enabled (defaults:
  //   Inbound=true, Outbound=true, all others=false per switch_import_options)
  // - A call is only counted (isCall) for calltype 4 (inbound) or 5 (outbound)
  // - TalkTime only accumulated when tottime > 0 AND (call OR tottime from options)
  if (source === 'Genesis') {
    const MaxTime = maxTimeSec;
    // Use fetched import options or fall back to Genesis C++ defaults (all true)
    const o = opts ?? DEFAULT_GENESIS_OPTIONS;
    const optInbound   = o.inbound;
    const optOutbound  = o.outbound;
    const optConfSetup = o.conf_setup;
    const optWrap      = o.wrap;
    const optHold      = o.hold;
    const optQueue     = o.queue;
    const optHoldSec   = o.hold_sec;
    const optQueueSec  = o.queue_sec;

    // slotData: date -> slot(0-95) -> {calls, talk_time}
    const dateMap = new Map<string, { calls: number[]; talk_time: number[] }>();
    let currdate = '';
    // Track order dates were first seen so we know which is last
    const dateOrder: string[] = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;
      const cols = line.split('\t').map(c => c.replace(/^"|"$/g, '').trim());
      if (cols.length < 15) continue;
      try {
        // Col 1: "2014-10-06 09:23:45"
        const spaceIdx = cols[0].indexOf(' ');
        if (spaceIdx < 0) continue;
        const dateRaw = cols[0].slice(0, spaceIdx);
        const timeRaw = cols[0].slice(spaceIdx + 1).trim();
        const dateStr = normalizeDate(dateRaw);
        if (!dateStr) continue;

        // Track currdate — when date changes, mark previous as complete
        // (mirrors C++ AddRecord on date change)
        if (currdate === '') {
          currdate = dateRaw;
          dateOrder.push(dateStr);
          dateMap.set(dateStr, { calls: new Array(96).fill(0), talk_time: new Array(96).fill(0) });
        } else if (dateRaw !== currdate) {
          // Date changed — previous date is now complete
          currdate = dateRaw;
          if (!dateMap.has(dateStr)) {
            dateOrder.push(dateStr);
            dateMap.set(dateStr, { calls: new Array(96).fill(0), talk_time: new Array(96).fill(0) });
          }
        }

        // Parse time for slot
        const tp = timeRaw.split(':').map(Number);
        const hour = tp[0];
        const quarter = Math.floor(tp[1] / 15);
        if (isNaN(hour) || isNaN(quarter)) continue;
        const slot = hour * 4 + quarter;
        if (slot < 0 || slot > 95) continue;

        // Per-record fields
        let tottime = 0;
        let ahold   = 0;

        if (optHold) {
          let holdtime = parseInt(cols[4]) || 0;
          holdtime = holdtime > optHoldSec ? holdtime - optHoldSec : 0;
          tottime += holdtime;
        }
        if (optConfSetup) {
          const patch = parseInt(cols[5]) || 0;
          tottime += Math.min(patch, MaxTime);
        }
        if (optQueue) {
          ahold = parseInt(cols[6]) || 0;
          const prescreen = parseInt(cols[7]) || 0;
          if (prescreen) ahold = ahold >= prescreen ? ahold - prescreen : 0;
        }
        const talk = Math.min(parseInt(cols[8]) || 0, MaxTime);
        if (optWrap) {
          const wrap = Math.min(parseInt(cols[9]) || 0, MaxTime);
          tottime += wrap;
        }

        const answertype = parseInt(cols[11]) || 0;
        // cols[12] and cols[13] skipped (case 13/14 not in C++ switch)
        const calltype = parseInt(cols[14]) || 0;

        if (answertype === 1) {
          let isCall = false;
          if (calltype > 2 && calltype < 6) {
            if (ahold > optQueueSec) ahold -= optQueueSec; else ahold = 0;
            if (optQueue) tottime += ahold;
          }
          if (calltype === 4 && optInbound)  { isCall = true; tottime += talk; }
          else if (calltype === 5 && optOutbound) { isCall = true; tottime += talk; }

          if (tottime > 0) {
            const dayData = dateMap.get(dateStr)!;
            if (isCall) dayData.calls[slot]++;
            dayData.talk_time[slot] += tottime;
          }
        }
      } catch { continue; }
    }

    // Build records — exclude the LAST date (mirrors C++ which only saves on date change)
    const records: ParsedRecord[] = [];
    const datesToSave = dateOrder.slice(0, -1); // drop last date
    for (const dateStr of datesToSave) {
      const dayData = dateMap.get(dateStr)!;
      for (let s = 0; s < 96; s++) {
        if (dayData.calls[s] > 0 || dayData.talk_time[s] > 0) {
          records.push({
            date: dateStr,
            hour: Math.floor(s / 4),
            quarter: s % 4,
            calls: dayData.calls[s],
            talk_time: dayData.talk_time[s],
          });
        }
      }
    }
    return records;
  }

  // ── Pinnacle: CSV per-call records, ALL dates saved (sorted list approach) ──
  // Col1: "5/19/2024  12:04:37AM" (12h AM/PM datetime)
  // Col2-9: inbound,outbound,confSetup,agentConf,wrap,SA,hold,queue (float seconds)
  // Col10: account (optional, for exclusions)
  // Call counting: if talktime>0: count if inbound/wrap/SA/hold/queue time present,
  //   outbound counted separately, conf/agentConf counted separately
  if (source === 'Pinnacle') {
    const MaxTime = maxTimeSec;
    const o = opts ?? { inbound:true, outbound:true, conf_setup:true, agent_conf:true,
                        wrap:true, admin:true, hold:true, queue:true, hold_sec:0, queue_sec:0 };
    interface PinRec { dateKey: string; i: number; j: number; time: number[] }
    const pinList: PinRec[] = [];

    for (const line of lines) {
      if (!line.trim()) continue;
      const cols = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
      if (cols.length < 9) continue;
      try {
        // Parse datetime: "5/19/2024  12:04:37AM"
        const dtStr = cols[0].trim();
        const spaceIdx = dtStr.search(/\s+\d/);
        if (spaceIdx < 0) continue;
        const datePart = dtStr.slice(0, spaceIdx).trim();
        const timePart = dtStr.slice(spaceIdx).trim();

        // Date: m/d/yyyy or m/d/yy → normalize to yyyy-mm-dd
        const dp = datePart.split('/');
        if (dp.length < 3) continue;
        const yr = dp[2].length === 2 ? `20${dp[2]}` : dp[2];
        const dateStr = `${yr}-${dp[0].padStart(2,'0')}-${dp[1].padStart(2,'0')}`;

        // Time: "12:04:37AM" — 12-hour with AM/PM
        const ampm = timePart.slice(-2).toUpperCase();
        const am = ampm === 'AM';
        const timeNums = timePart.slice(0, -2).split(':').map(Number);
        let hour = timeNums[0];
        const min = timeNums[1] ?? 0;
        if (hour === 12) {
          if (am) hour = 0;    // 12AM = midnight = 0
          // 12PM stays 12
        } else {
          if (!am) hour += 12; // 1PM-11PM → 13-23
        }
        const quarter = Math.floor(min / 15);

        // Parse 8 time fields (float seconds → int)
        const pinTime = new Array(8).fill(0);
        const flags = [o.inbound, o.outbound, o.conf_setup, o.agent_conf,
                       o.wrap, o.admin, o.hold, o.queue];

        for (let k = 0; k < 8; k++) {
          if (!flags[k]) continue;
          let t = Math.floor(parseFloat(cols[k + 1]) || 0);
          // Hold (k=6) and Queue (k=7) use threshold subtraction
          if (k === 6) { t = t > o.hold_sec  ? t - o.hold_sec  : 0; }
          if (k === 7) { t = t > o.queue_sec ? t - o.queue_sec : 0; }
          // All others cap at MaxTime
          if (k < 6)   { if (t > MaxTime) t = MaxTime; }
          pinTime[k] = t;
        }

        pinList.push({ dateKey: dateStr, i: hour, j: quarter, time: pinTime });
      } catch { continue; }
    }

    if (pinList.length === 0) return [];

    // Sort by date then time (mirrors PinnacleSort)
    pinList.sort((a, b) => {
      if (a.dateKey !== b.dateKey) return a.dateKey < b.dateKey ? -1 : 1;
      if (a.i !== b.i) return a.i - b.i;
      return a.j - b.j;
    });

    // Accumulate into per-date/slot buckets — ALL dates saved (unlike Genesis)
    const dateMap = new Map<string, { calls: number[]; talk_time: number[] }>();
    const dateOrder: string[] = [];

    for (const pr of pinList) {
      if (!dateMap.has(pr.dateKey)) {
        dateOrder.push(pr.dateKey);
        dateMap.set(pr.dateKey, { calls: new Array(96).fill(0), talk_time: new Array(96).fill(0) });
      }
      const slot = pr.i * 4 + pr.j;
      if (slot < 0 || slot > 95) continue;
      const day = dateMap.get(pr.dateKey)!;

      const talktime = pr.time.reduce((a, b) => a + b, 0);
      if (talktime > 0) {
        // Count calls: inbound/wrap/SA/hold/queue = 1 call; outbound = 1 call; conf/agentConf = 1 call
        if (pr.time[0] || pr.time[4] || pr.time[5] || pr.time[6] || pr.time[7]) day.calls[slot]++;
        if (pr.time[1]) day.calls[slot]++;
        if (pr.time[2] || pr.time[3]) day.calls[slot]++;
        day.talk_time[slot] += talktime;
      }
    }

    const records: ParsedRecord[] = [];
    for (const dateStr of dateOrder) {
      const day = dateMap.get(dateStr)!;
      for (let s = 0; s < 96; s++) {
        if (day.calls[s] > 0 || day.talk_time[s] > 0) {
          records.push({ date: dateStr, hour: Math.floor(s/4), quarter: s%4,
                         calls: day.calls[s], talk_time: day.talk_time[s] });
        }
      }
    }
    return records;
  }

    // ── SoftSwitch / SoftSwitch2: CSV per-call records ─────────────────────────
  // File has \r\r\n line endings — normalize before split
  // Uses CallEndTime (col5/idx4) for date assignment
  // SoftSwitch2 uses col21(idx20)=AgtTalkTime, col23(idx22)=AgtPatchTime,
  //   col24(idx23)=StationHoldTime, col25(idx24)=SystemHoldTime
  // queue_time = RingTime(idx12) + SystemHoldTime(idx24)
  // Skips header line. Excludes records with empty ClientId(idx7).
  // Saves ALL dates (last date saved at end — unlike Genesis)
  // Minimum call count filter: date only saved if >10 calls in any quarter-0 slot
  // C++ Round(atof()) = standard rounding
  if (source === 'SoftSwitch' || source === 'Softswitch2') {
    const MaxTime = maxTimeSec;
    const o = opts ?? { inbound:true, outbound:true, conf_setup:true, agent_conf:true,
                        wrap:false, admin:false, hold:true, queue:true, hold_sec:0, queue_sec:0 };
    const isSS2 = source === 'Softswitch2';

    // Normalize line endings (\r\r\n, \r\n, \r all → \n)
    const normalized = content.replace(/\r\r\n/g, '\n').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const ss2lines = normalized.split('\n').filter(l => l.trim());

    interface SS2Rec {
      dateKey: string; hour: number; quarter: number;
      inbound_talk: number; outbound_talk: number;
      patch: number; hold: number; queue: number;
      acct: string;
    }
    const recList: SS2Rec[] = [];

    // Simple CSV split respecting double-quoted fields
    function splitCSV(line: string): string[] {
      const result: string[] = [];
      let current = '';
      let inQuotes = false;
      for (let ci = 0; ci < line.length; ci++) {
        const ch = line[ci];
        if (ch === '"') { inQuotes = !inQuotes; }
        else if (ch === ',' && !inQuotes) { result.push(current); current = ''; }
        else { current += ch; }
      }
      result.push(current);
      return result;
    }

    for (let li = 1; li < ss2lines.length; li++) {
      const line = ss2lines[li];
      if (!line.trim()) continue;
      try {
        const cols = splitCSV(line);
        if (cols.length < 25) continue;

        // Both use cnt=5(idx4): SS1=CallStartTime, SS2=CallEndTime
        const endTime = cols[4].replace(/"/g, '').trim();
        if (endTime.length < 19) continue;
        const dateStr = endTime.slice(0, 10);  // "2024-02-12"
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) continue;
        const hour    = parseInt(endTime.slice(11, 13));
        const minute  = parseInt(endTime.slice(14, 16));
        const quarter = Math.floor(minute / 15);

        const callType = cols[5].replace(/"/g, '').trim();
        const acct     = cols[7].replace(/"/g, '').trim();
        if (!acct) continue;  // exclude empty account

        const inbound = callType === 'InBound';

        // queue_time = RingTime(idx12) + SystemHoldTime(SS2=idx24, SS1=idx23)
        const queueTime = Math.round(parseFloat(cols[12]) || 0)
                        + Math.round(parseFloat(isSS2 ? cols[24] : cols[23]) || 0);
        // talk time: SS2=col21(idx20), SS1=col20(idx19)
        const talkRaw   = Math.round(parseFloat(isSS2 ? cols[20] : cols[19]) || 0);
        const talkTime  = Math.min(talkRaw, MaxTime);
        // patch: SS2=col23(idx22), SS1=col22(idx21) — only inbound
        const patchTime = inbound
          ? Math.min(Math.round(parseFloat(isSS2 ? cols[22] : cols[21]) || 0), MaxTime)
          : 0;
        // hold: SS2=col24(idx23), SS1=col23(idx22)
        const holdTime  = Math.round(parseFloat(isSS2 ? cols[23] : cols[22]) || 0);

        if (talkTime > 0) {
          recList.push({ dateKey: dateStr, hour, quarter,
            inbound_talk: inbound ? talkTime : 0,
            outbound_talk: inbound ? 0 : talkTime,
            patch: patchTime, hold: holdTime, queue: queueTime, acct });
        }
      } catch { continue; }
    }

    // Sort by date then time
    recList.sort((a, b) => {
      if (a.dateKey !== b.dateKey) return a.dateKey < b.dateKey ? -1 : 1;
      if (a.hour !== b.hour) return a.hour - b.hour;
      return a.quarter - b.quarter;
    });

    // Accumulate into per-date slot buckets
    const dateMap  = new Map<string, { calls: number[]; talk_time: number[] }>();
    const dateOrder: string[] = [];

    for (const rec of recList) {
      if (!dateMap.has(rec.dateKey)) {
        dateOrder.push(rec.dateKey);
        dateMap.set(rec.dateKey, { calls: new Array(96).fill(0), talk_time: new Array(96).fill(0) });
      }
      const slot = rec.hour * 4 + rec.quarter;
      if (slot < 0 || slot > 95) continue;
      const day = dateMap.get(rec.dateKey)!;

      // Hold threshold
      const holdUsed  = o.hold  && rec.hold  > o.hold_sec  ? rec.hold  - o.hold_sec  : 0;
      // Queue threshold
      const queueUsed = o.queue && rec.queue > o.queue_sec ? rec.queue - o.queue_sec : 0;

      let slotTalk = 0;
      let isCall = false;

      if (o.inbound && rec.inbound_talk) {
        isCall = true;
        slotTalk += rec.inbound_talk;
      }
      if (o.outbound && rec.outbound_talk) {
        isCall = true;
        slotTalk += rec.outbound_talk;
      }
      if (o.conf_setup) slotTalk += rec.patch;
      slotTalk += holdUsed + queueUsed;

      if (isCall) {
        day.calls[slot]++;
        day.talk_time[slot] += slotTalk;
      }
    }

    // Save dates — apply count>10 filter (sum of calls in quarter-0 slots must be >10)
    const records: ParsedRecord[] = [];
    for (const dateStr of dateOrder) {
      const day = dateMap.get(dateStr)!;
      // Count check: sum of calls[i*4+0] for all hours
      let count = 0;
      for (let h = 0; h < 24; h++) count += day.calls[h * 4];
      if (count <= 10) continue;  // skip dates with too few calls

      for (let s = 0; s < 96; s++) {
        if (day.calls[s] > 0 || day.talk_time[s] > 0) {
          records.push({ date: dateStr, hour: Math.floor(s/4), quarter: s%4,
                         calls: day.calls[s], talk_time: day.talk_time[s] });
        }
      }
    }
    return records;
  }

    // ── Telescan ─────────────────────────────────────────────────────────────
  // CSV per-call records. No header line. col[0]=rec type (0=inbound,1=outbound).
  // All dates saved. col[1]="19-Jul-12" date, col[2]="HH:MM" time
  // rec=0: col[4]=account, col[7]=agent(skip if "   "),
  //   col[11]=queue(threshold), col[12]=inbound talk(capped), col[13]=hold(threshold)
  // rec=1: col[4]=account, col[7]=outbound talk(capped)
  if (source === 'Telescan') {
    const MaxTime = maxTimeSec;
    const o = opts ?? { inbound:true, outbound:true, conf_setup:false, agent_conf:false,
                        wrap:false, admin:false, hold:true, queue:true, hold_sec:0, queue_sec:0 };

    const TMONTHS: Record<string,string> = {
      'Jan':'01','Feb':'02','Mar':'03','Apr':'04','May':'05','Jun':'06',
      'Jul':'07','Aug':'08','Sep':'09','Oct':'10','Nov':'11','Dec':'12'
    };

    const parseTelescanDate = (s: string): string | null => {
      const parts = s.trim().split('-');
      if (parts.length !== 3) return null;
      const [day, mon, yr] = parts;
      const mo = TMONTHS[mon];
      if (!mo) return null;
      return `20${yr}-${mo}-${day.padStart(2,'0')}`;
    };

    interface TelRec {
      dateKey: string; hour: number; minute: number;
      rec: string; cols: string[];
    }
    const telList: TelRec[] = [];

    for (const line of lines) {
      if (!line.trim()) continue;
      const cols = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
      if (cols.length < 3) continue;
      const rec = cols[0];
      if (rec !== '0' && rec !== '1') continue;
      const dateKey = parseTelescanDate(cols[1]);
      if (!dateKey) continue;
      const hour   = parseInt(cols[2].slice(0, 2));
      const minute = parseInt(cols[2].slice(3, 5));
      if (isNaN(hour) || isNaN(minute)) continue;
      telList.push({ dateKey, hour, minute, rec, cols });
    }

    telList.sort((a, b) => {
      if (a.dateKey !== b.dateKey) return a.dateKey < b.dateKey ? -1 : 1;
      if (a.hour !== b.hour) return a.hour - b.hour;
      return a.minute - b.minute;
    });

    const dateMap  = new Map<string, { calls: number[]; talk_time: number[] }>();
    const dateOrder: string[] = [];

    for (const tr of telList) {
      const { dateKey, hour, minute, rec, cols } = tr;
      if (!dateMap.has(dateKey)) {
        dateOrder.push(dateKey);
        dateMap.set(dateKey, { calls: new Array(96).fill(0), talk_time: new Array(96).fill(0) });
      }
      const slot = hour * 4 + Math.floor(minute / 15);
      if (slot < 0 || slot > 95) continue;
      const day = dateMap.get(dateKey)!;

      if (rec === '0' && o.inbound) {
        if ((cols[7] ?? '') === '   ') continue;
        const qt = parseInt(cols[11] ?? '0') || 0;
        const queueUsed = o.queue && qt > o.queue_sec ? qt - o.queue_sec : 0;
        let tt = parseInt(cols[12] ?? '0') || 0;
        if (tt > MaxTime) tt = MaxTime;
        const ht = parseInt(cols[13] ?? '0') || 0;
        const holdUsed = o.hold && ht > o.hold_sec ? ht - o.hold_sec : 0;
        day.calls[slot]++;
        day.talk_time[slot] += tt + queueUsed + holdUsed;
      } else if (rec === '1' && o.outbound) {
        let tt = parseInt(cols[7] ?? '0') || 0;
        if (tt > MaxTime) tt = MaxTime;
        day.calls[slot]++;
        day.talk_time[slot] += tt;
      }
    }

    const records: ParsedRecord[] = [];
    for (const dateKey of dateOrder) {
      const day = dateMap.get(dateKey)!;
      for (let s = 0; s < 96; s++) {
        if (day.calls[s] > 0 || day.talk_time[s] > 0) {
          records.push({ date: dateKey, hour: Math.floor(s/4), quarter: s%4,
                         calls: day.calls[s], talk_time: day.talk_time[s] });
        }
      }
    }
    return records;
  }

  // ── All other switches: simple date/time/calls/talktime format ──────────
  const tsvSwitches = ['Szeto','SzetoII'];
  const sep   = tsvSwitches.includes(source) ? '\t' : ',';
  const hasHdr = lines[0]?.toLowerCase().includes('date') || lines[0]?.toLowerCase().includes('time');
  const start = hasHdr ? 1 : 0;
  const records: ParsedRecord[] = [];
  for (let i = start; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const cols = lines[i].split(sep).map(c => c.trim().replace(/^"|"$/g, ''));
    if (cols.length < 3) continue;
    try {
      const [h, m] = cols[1].split(':').map(Number);
      if (isNaN(h) || isNaN(m)) continue;
      records.push({ date: normalizeDate(cols[0]), hour: h, quarter: Math.floor(m/15),
                     calls: parseFloat(cols[2]) || 0, talk_time: Math.round(parseFloat(cols[3]) || 0) });
    } catch { continue; }
  }
  return records;
}

// ─── Data Grid component ──────────────────────────────────────────────────────

interface GridProps {
  data:         GridData;
  onSelChange:  (calls: number, talkTime: number, selected: boolean) => void;
  onDeleteRow:  (date: string) => void;
}

function DataGrid({ data, onSelChange, onDeleteRow }: GridProps) {
  const { grid, shiftValues, specialDays, reverseData, specialColor } = data;
  const specialSet = useMemo(() => new Set(specialDays), [specialDays]);
  const specialBg = colorRefToHex(specialColor);

  // Selection state: {rowIdx, colIdx} ranges (0-based data row, 0=Date col)
  const [selStart, setSelStart] = useState<{r:number;c:number}|null>(null);
  const [selEnd,   setSelEnd]   = useState<{r:number;c:number}|null>(null);
  const [mouseDown, setMouseDown] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const displayRows = reverseData ? [...grid].reverse() : grid;

  // Compute selection bounds
  const selBounds = useMemo(() => {
    if (!selStart || !selEnd) return null;
    return {
      r1: Math.min(selStart.r, selEnd.r),
      r2: Math.max(selStart.r, selEnd.r),
      c1: Math.min(selStart.c, selEnd.c),
      c2: Math.max(selStart.c, selEnd.c),
    };
  }, [selStart, selEnd]);

  // Compute selection totals whenever selection changes
  useEffect(() => {
    if (!selBounds) { onSelChange(0, 0, false); return; }
    const { r1, r2, c1, c2 } = selBounds;
    let totalCalls = 0;
    let totalTalk  = 0;
    for (let ri = r1; ri <= r2; ri++) {
      const row = displayRows[ri];
      if (!row) continue;
      for (let ci = c1; ci <= c2; ci++) {
        if (ci === 0) continue; // Date column
        const slotIdx = ci - 1; // 0-based slot index
        if (slotIdx < 96) {
          totalCalls += row.calls[slotIdx] ?? 0;
          totalTalk  += row.talk_time[slotIdx] ?? 0;
        } else {
          // Shift/total columns — sum underlying slots for both calls and talk_time
          const extra = slotIdx - 96; // 0=1st,1=2nd,2=3rd,3=Total
          for (let i = 0; i < 96; i++) {
            const sv = shiftValues[i] ?? 0;
            if (extra === 3 || sv === extra) {
              totalCalls += row.calls[i]     ?? 0;
              totalTalk  += row.talk_time[i] ?? 0;
            }
          }
        }
      }
    }
    onSelChange(totalCalls, totalTalk, true);
  }, [selBounds, displayRows, shiftValues, onSelChange]);

  function isSelected(r: number, c: number) {
    if (!selBounds) return false;
    return r >= selBounds.r1 && r <= selBounds.r2 && c >= selBounds.c1 && c <= selBounds.c2;
  }

  function handleMouseDown(r: number, c: number) {
    if (c === 0) return; // date col not selectable
    setSelStart({ r, c });
    setSelEnd({ r, c });
    setMouseDown(true);
  }

  function handleMouseEnter(r: number, c: number) {
    if (!mouseDown || c === 0) return;
    setSelEnd({ r, c });
  }

  function handleMouseUp() {
    setMouseDown(false);
  }

  return (
    <div
      ref={containerRef}
      className="overflow-auto border border-[var(--border)] rounded-lg select-none"
      style={{ maxHeight: 'calc(100vh - 320px)' }}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <table className="text-xs border-collapse" style={{ minWidth: 'max-content' }}>
        <thead className="sticky top-0 z-10 bg-[var(--surface-stripe)]">
          <tr>
            {ALL_HEADERS.map((header, ci) => (
              <th
                key={ci}
                className={`border border-[var(--border)] px-1 py-0.5 font-semibold
                            text-[var(--text-secondary)] whitespace-nowrap text-center
                            ${ci === 0 ? 'sticky left-0 z-20 bg-[var(--surface-stripe)] min-w-[72px]' : ''}`}
                style={{ minWidth: ci === 0 ? 72 : ci >= 97 ? 44 : 35, maxWidth: ci >= 97 ? 44 : 35 }}
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {displayRows.map((row, ri) => {
            const isSpecial = specialSet.has(row.date);
            const { shiftCalls, totalCalls } = computeRowTotals(row, shiftValues);
            return (
              <tr key={row.date} className="hover:brightness-95">
                {/* Date column — sticky */}
                <td
                  className="sticky left-0 border border-[var(--border)] px-1.5 py-0.5
                             font-medium text-[var(--text-primary)] whitespace-nowrap z-10"
                  style={{
                    background: isSpecial ? specialBg : 'var(--surface-card)',
                    minWidth: 72,
                  }}
                >
                  {formatDate(row.date)}
                </td>

                {/* 96 quarter-hour call columns */}
                {Array.from({ length: 24 }, (_, h) =>
                  Array.from({ length: 4 }, (_, q) => {
                    const ci = h * 4 + q + 1;
                    const val = row.calls[h * 4 + q] ?? 0;
                    const sel = isSelected(ri, ci);
                    return (
                      <td
                        key={ci}
                        onMouseDown={() => handleMouseDown(ri, ci)}
                        onMouseEnter={() => handleMouseEnter(ri, ci)}
                        className="border border-[var(--border)] text-center py-0.5 cursor-cell"
                        style={{
                          minWidth: 35, maxWidth: 35,
                          background: sel
                            ? 'var(--brand-200)'
                            : isSpecial ? specialBg : undefined,
                          color: val === 0 ? 'var(--text-muted)' : 'var(--text-primary)',
                        }}
                      >
                        {val}
                      </td>
                    );
                  })
                )}

                {/* 1st, 2nd, 3rd shift totals */}
                {[0, 1, 2].map(s => {
                  const ci = 97 + s;
                  const val = shiftCalls[s];
                  const sel = isSelected(ri, ci);
                  return (
                    <td
                      key={ci}
                      onMouseDown={() => handleMouseDown(ri, ci)}
                      onMouseEnter={() => handleMouseEnter(ri, ci)}
                      className="border border-[var(--border)] text-center py-0.5 font-medium cursor-cell"
                      style={{
                        minWidth: 44, maxWidth: 44,
                        background: sel
                          ? 'var(--brand-200)'
                          : isSpecial ? specialBg : 'var(--surface-stripe)',
                        color: val === 0 ? 'var(--text-muted)' : 'var(--text-primary)',
                      }}
                    >
                      {val}
                    </td>
                  );
                })}

                {/* Total */}
                {(() => {
                  const ci = 100;
                  const sel = isSelected(ri, ci);
                  return (
                    <td
                      key={ci}
                      onMouseDown={() => handleMouseDown(ri, ci)}
                      onMouseEnter={() => handleMouseEnter(ri, ci)}
                      className="border border-[var(--border)] text-center py-0.5 font-semibold cursor-cell"
                      style={{
                        minWidth: 44, maxWidth: 44,
                        background: sel
                          ? 'var(--brand-200)'
                          : isSpecial ? specialBg : 'var(--surface-stripe)',
                        color: totalCalls === 0 ? 'var(--text-muted)' : 'var(--text-primary)',
                      }}
                    >
                      {totalCalls}
                    </td>
                  );
                })()}

                {/* Delete */}
                <td className="border border-[var(--border)] text-center py-0.5 sticky right-0 z-10"
                    style={{ minWidth: 32, maxWidth: 32, background: 'var(--surface-card)' }}>
                  <button
                    onClick={() => onDeleteRow(row.date)}
                    className="text-red-500 hover:text-red-700 leading-none px-1"
                    title={`Delete ${row.date}`}
                  >
                    ×
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function DataView() {
  const [gridData,     setGridData]     = useState<GridData | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState('');

  // Filter state
  const [filterFrom,   setFilterFrom]   = useState('');
  const [filterTo,     setFilterTo]     = useState('');
  const [filterDays,   setFilterDays]   = useState<boolean[]>([true,true,true,true,true,true,true]);
  const [isFiltered,   setIsFiltered]   = useState(false);

  // Selection totals
  const [selCalls,     setSelCalls]     = useState(0);
  const [selTalk,      setSelTalk]      = useState(0);
  const [hasSelection, setHasSelection] = useState(false);

  // Import state
  const [showImport,     setShowImport]     = useState(false);
  const [showSpecialDays, setShowSpecialDays] = useState(false);
  const [showExclude,     setShowExclude]     = useState(false);
  const [source,       setSource]       = useState<SwitchSource>('Telescan');
  const [file,         setFile]         = useState<File | null>(null);
  const [parsed,       setParsed]       = useState<ParsedRecord[] | null>(null);
  const [parseError,   setParseError]   = useState('');
  const [importing,    setImporting]    = useState(false);
  const [importResult, setImportResult] = useState<{inserted:number;updated:number}|null>(null);
  const [importMode,   setImportMode]   = useState<'overwrite'|'add'>('overwrite');
  const [callLength,   setCallLength]   = useState(5); // minutes, from company_settings

  const loadGrid = useCallback(async (from?: string, to?: string, days?: boolean[]) => {
    setLoading(true); setError('');
    try {
      let url = '/api/call-data/grid?';
      if (from) url += `from=${encodeURIComponent(from)}&`;
      if (to)   url += `to=${encodeURIComponent(to)}&`;
      if (days && !days.every(Boolean)) {
        const activeDays = days.map((v,i) => v ? i : -1).filter(i => i >= 0);
        url += `days=${activeDays.join(',')}&`;
      }
      const res  = await fetch(url, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to load.'); return; }
      setGridData(data);
    } catch { setError('Connection error.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadGrid(); }, [loadGrid]);

  function handleShowAll() {
    setFilterFrom('');
    setFilterTo('');
    setFilterDays([true,true,true,true,true,true,true]);
    setIsFiltered(false);
    loadGrid();
  }

  function handleFilter() {
    setIsFiltered(true);
    loadGrid(filterFrom || undefined, filterTo || undefined, filterDays);
  }

  function toggleDay(i: number) {
    setFilterDays(d => d.map((v,j) => j === i ? !v : v));
  }

  const handleDeleteRow = useCallback(async (date: string) => {
    if (!confirm(`Delete all call data for ${date}?`)) return;
    try {
      const res = await fetch('/api/call-data', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ _method: 'DELETE', date }),
      });
      if (res.ok) loadGrid();
    } catch { /* silent */ }
  }, [loadGrid]);

  const handleSelChange = useCallback((calls: number, talk: number, selected: boolean) => {
    setSelCalls(calls);
    setSelTalk(talk);
    setHasSelection(selected);
  }, []);

  // Import handlers
  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f); setParsed(null); setParseError(''); setImportResult(null);

    // Fetch import options and call_length setting in parallel
    let opts: ImportOptions | undefined;
    let maxTimeSec = callLength * 60; // use current state as fallback
    try {
      const [optsRes, settingsRes] = await Promise.all([
        fetch(`/api/settings/import-options?switch=${encodeURIComponent(source)}`),
        fetch('/api/settings'),
      ]);
      if (optsRes.ok) {
        const data = await optsRes.json();
        if (data.options) {
          opts = {
            inbound:    Boolean(data.options.inbound),
            outbound:   Boolean(data.options.outbound),
            conf_setup: Boolean(data.options.conf_setup),
            agent_conf: Boolean(data.options.agent_conf),
            wrap:       Boolean(data.options.wrap),
            admin:      Boolean(data.options.admin),
            hold:       Boolean(data.options.hold),
            queue:      Boolean(data.options.queue),
            hold_sec:   Number(data.options.hold_sec  ?? 0),
            queue_sec:  Number(data.options.queue_sec ?? 0),
          };
        }
      }
      if (settingsRes.ok) {
        const sdata = await settingsRes.json();
        const cl = Number(sdata.settings?.call_length ?? 5);
        maxTimeSec = cl * 60;
        setCallLength(cl);
      }
    } catch { /* use defaults */ }

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const records = parseForSwitch(source, ev.target?.result as string, opts, maxTimeSec);
        if (records.length === 0) { setParseError('No valid records found.'); return; }
        setParsed(records);
      } catch (err) { setParseError(`Parse error: ${String(err)}`); }
    };
    reader.readAsText(f);
  }

  async function handleImport() {
    if (!parsed) return;
    setImporting(true);
    try {
      const res  = await fetch('/api/call-data', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ records: parsed, mode: importMode }),
      });
      const data = await res.json();
      if (!res.ok) { setParseError(data.error || 'Import failed.'); return; }
      setImportResult(data);
      setParsed(null); setFile(null);
      loadGrid(); // reload grid after import
    } catch { setParseError('Connection error.'); }
    finally { setImporting(false); }
  }

  const allDates = gridData?.allDates ?? [];

  return (
    <>
    <div className="p-4 flex flex-col gap-3 h-full overflow-auto">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="page-title">Call Data</h1>
            {gridData && (
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                {gridData.grid.length} days
                {isFiltered && ' (filtered)'}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button className="btn-secondary btn-sm text-xs"
              onClick={() => setShowImport(v => !v)}>
              {showImport ? 'Hide Import' : 'Import Data'}
            </button>
            <button className="btn-secondary btn-sm text-xs"
              onClick={() => setShowSpecialDays(true)}>
              Holidays
            </button>
            <button className="btn-secondary btn-sm text-xs"
              onClick={() => setShowExclude(true)}>
              Exclude Accounts
            </button>
          </div>
        </div>

        {/* Filter bar */}
        <div className="card p-3 flex flex-wrap items-end gap-3">
          <div>
            <label className="label text-[10px] mb-1">Start Date</label>
            <select className="select text-xs py-1 w-32" value={filterFrom}
              onChange={e => setFilterFrom(e.target.value)}>
              <option value="">— All —</option>
              {allDates.map(d => (
                <option key={d} value={d}>{formatDate(d)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label text-[10px] mb-1">End Date</label>
            <select className="select text-xs py-1 w-32" value={filterTo}
              onChange={e => setFilterTo(e.target.value)}>
              <option value="">— All —</option>
              {allDates.map(d => (
                <option key={d} value={d}>{formatDate(d)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label text-[10px] mb-1">Days</label>
            <div className="flex items-center gap-1">
              {DAYS_OF_WEEK.map((day, i) => (
                <label key={i} className="flex flex-col items-center gap-0.5 cursor-pointer">
                  <input type="checkbox" checked={filterDays[i]}
                    onChange={() => toggleDay(i)}
                    className="rounded border-gray-300" />
                  <span className="text-[9px] text-[var(--text-muted)]">{day}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2 pb-0.5">
            <button className="btn-primary btn-sm text-xs" onClick={handleFilter}>
              Filter
            </button>
            {isFiltered && (
              <button className="btn-secondary btn-sm text-xs" onClick={handleShowAll}>
                Show All
              </button>
            )}
          </div>

          {/* Selection totals */}
          {hasSelection && (
            <div className="ml-auto flex items-center gap-3 text-xs font-mono
                            text-[var(--text-primary)] border-l border-[var(--border)] pl-3">
              <span>Calls={selCalls}</span>
              <span>Time={formatTalkTime(selTalk)}</span>
            </div>
          )}
        </div>

        {/* Grid */}
        {error && <div className="alert-error text-xs">{error}</div>}

        {loading ? (
          <div className="p-8 text-center text-sm text-[var(--text-muted)]">Loading…</div>
        ) : gridData && gridData.grid.length === 0 ? (
          <div className="p-8 text-center text-sm text-[var(--text-muted)]">
            {isFiltered ? 'No data matches the filter.' : 'No call data yet. Import data using the button above.'}
          </div>
        ) : gridData ? (
          <DataGrid data={gridData} onSelChange={handleSelChange} onDeleteRow={handleDeleteRow} />
        ) : null}

        {/* Import section */}
        {showImport && (
          <div className="card p-4 space-y-3">
            <h2 className="section-title">Import Call Data</h2>

            <div className="flex items-end gap-3 flex-wrap">
              <div>
                <label className="label text-[10px] mb-1">Switch Source</label>
                <select className="select text-xs w-36" value={source}
                  onChange={e => { setSource(e.target.value as SwitchSource); setParsed(null); }}>
                  {SWITCH_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="label text-[10px] mb-1">Import Mode</label>
                <div className="flex items-center gap-3">
                  {(['overwrite','add'] as const).map(mode => (
                    <label key={mode} className="flex items-center gap-1.5 cursor-pointer text-sm">
                      <input type="radio" name="importMode" value={mode}
                        checked={importMode === mode}
                        onChange={() => setImportMode(mode)} />
                      {mode === 'overwrite' ? 'Overwrite' : 'Add'}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="label text-[10px] mb-1">Data File</label>
                <label className="btn-secondary btn-sm text-xs cursor-pointer">
                  {file ? file.name : 'Choose file…'}
                  <input type="file" className="hidden" accept=".csv,.tsv,.txt,.log"
                    onChange={handleFile} />
                </label>
              </div>
              {parsed && (
                <button className="btn-primary btn-sm text-xs" disabled={importing}
                  onClick={handleImport}>
                  {importing ? 'Importing…' : `Import ${parsed.length} records`}
                </button>
              )}
            </div>

            {parseError && <div className="alert-error text-xs">{parseError}</div>}
            {importResult && (
              <div className="alert-success text-xs">
                Import complete — {importResult.inserted} added, {importResult.updated} updated.
              </div>
            )}
          </div>
        )}

    </div>

      {showSpecialDays && (
        <SpecialDaysModal onClose={() => { setShowSpecialDays(false); loadGrid(); }} />
      )}
      {showExclude && (
        <ExcludeModal onClose={() => setShowExclude(false)} />
      )}
    </>
  );
}


// ─── Forecast View ────────────────────────────────────────────────────────────

function ForecastView() {
  return (
    <div className="p-6 h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="section-title">Forecast</h2>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Staffing forecast based on call volume data
          </p>
        </div>
      </div>
      <div className="card flex-1 flex items-center justify-center text-sm text-[var(--text-muted)]">
        Forecast grid — coming in next batch
      </div>
    </div>
  );
}

// ─── Schedule View ────────────────────────────────────────────────────────────

function ScheduleView() {
  return (
    <div className="p-6 h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="section-title">Schedule</h2>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Weekly employee schedule
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-secondary btn-sm">Load Schedule</button>
          <button className="btn-primary btn-sm">New Schedule</button>
        </div>
      </div>
      <div className="card flex-1 flex items-center justify-center text-sm text-[var(--text-muted)]">
        Schedule grid — coming in next batch
      </div>
    </div>
  );
}

// ─── Special Days Modal ───────────────────────────────────────────────────────

function SpecialDaysModal({ onClose }: { onClose: () => void }) {
  const [days, setDays]       = useState<{ id: number; date: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [date, setDate]       = useState(() => new Date().toISOString().slice(0, 10));
  const [name, setName]       = useState('');
  const [error, setError]     = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);

  useEffect(() => { loadDays(); }, []);

  async function loadDays() {
    setLoading(true);
    try {
      const res = await fetch('/api/special-days');
      const data = await res.json();
      setDays((data.days || []).map((d: { id: number; date: Date | string; name: string }) => ({
        id:   d.id,
        date: d.date instanceof Date ? d.date.toISOString().slice(0, 10) : String(d.date).slice(0, 10),
        name: d.name,
      })));
    } catch { setError('Failed to load.'); }
    finally { setLoading(false); }
  }

  async function handleAdd() {
    if (!date || !name.trim()) { setError('Date and name are required.'); return; }
    setError('');
    const res = await fetch('/api/special-days', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, name }),
    });
    if (res.ok) { setName(''); loadDays(); }
    else { const d = await res.json(); setError(d.error || 'Failed to add.'); }
  }

  async function handleDelete() {
    if (!selectedId) return;
    const day = days.find(d => d.id === selectedId);
    if (!day) return;
    if (!confirm(`Delete ${day.date} — ${day.name}?`)) return;
    const res = await fetch('/api/special-days', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ _method: 'DELETE', id: selectedId }),
    });
    if (res.ok) { setSelectedId(null); await loadDays(); }
  }

  function formatDate(iso: string) {
    if (!iso || iso.length < 10) return iso;
    return `${iso.slice(5,7)}/${iso.slice(8,10)}/${iso.slice(2,4)}`;
  }

  return (
    <Modal title="Holidays / Special Days" onClose={onClose} size="md">
      <div className="p-4 space-y-3">
        {error && <div className="alert-error text-xs">{error}</div>}

        {/* Add row */}
        <div className="flex items-end gap-2">
          <div>
            <label className="label text-[10px] mb-1">Date</label>
            <input className="input" type="date" value={date}
              onChange={e => setDate(e.target.value)} />
          </div>
          <div className="flex-1">
            <label className="label text-[10px] mb-1">Name</label>
            <input className="input" value={name} maxLength={49}
              placeholder="Holiday name"
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAdd()} />
          </div>
          <button className="btn-primary btn-sm" onClick={handleAdd}>Add</button>
        </div>

        {/* List */}
        <div className="border border-[var(--border)] rounded-md overflow-hidden">
          <div className="flex bg-[var(--surface-stripe)] text-xs font-semibold
                          text-[var(--text-secondary)] px-2 py-1.5 border-b border-[var(--border)]">
            <span className="w-24 shrink-0">Date</span>
            <span>Name</span>
          </div>
          <div className="overflow-y-auto" style={{ maxHeight: '280px' }}>
            {loading ? (
              <p className="text-xs text-[var(--text-muted)] p-3">Loading…</p>
            ) : days.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)] p-3">No holidays defined.</p>
            ) : days.map(d => (
              <div key={d.id}
                onClick={() => setSelectedId(d.id === selectedId ? null : d.id)}
                className={`flex items-center px-2 py-1.5 cursor-pointer text-sm
                            border-b border-[var(--border)] last:border-b-0
                            ${d.id === selectedId
                              ? 'bg-[var(--brand-600)] text-white'
                              : 'hover:bg-[var(--surface-hover)]'}`}>
                <span className="w-24 shrink-0 font-mono text-xs">{formatDate(d.date)}</span>
                <span>{d.name}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-1">
          <button className="btn-secondary btn-sm text-xs"
            disabled={!selectedId} onClick={handleDelete}>
            Delete
          </button>
          <button className="btn-primary btn-sm" onClick={onClose}>Save & Close</button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Exclude Accounts Modal ───────────────────────────────────────────────────

function ExcludeModal({ onClose }: { onClose: () => void }) {
  const [ranges, setRanges]   = useState<{ id: number; start: number; end: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [addStart, setAddStart] = useState('');
  const [addEnd, setAddEnd]   = useState('');

  useEffect(() => { loadRanges(); }, []);

  async function loadRanges() {
    setLoading(true);
    try {
      const res = await fetch('/api/exclude-ranges');
      const data = await res.json();
      setRanges((data.ranges || []).map((r: { id: number; start_datetime: number; end_datetime: number }) => ({
        id: r.id, start: r.start_datetime, end: r.end_datetime,
      })));
    } catch { setError('Failed to load.'); }
    finally { setLoading(false); }
  }

  async function handleAdd() {
    const start = parseInt(addStart);
    const end   = parseInt(addEnd || addStart);
    if (isNaN(start)) { setError('Start account is required.'); return; }
    if (end < start)  { setError('End account must be ≥ Start account.'); return; }
    setError('');
    const res = await fetch('/api/exclude-ranges', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ start, end }),
    });
    if (res.ok) { setAddStart(''); setAddEnd(''); setShowAdd(false); loadRanges(); }
    else { const d = await res.json(); setError(d.error || 'Failed to add.'); }
  }

  async function handleDelete() {
    if (!selectedId) return;
    const r = ranges.find(x => x.id === selectedId);
    if (!r) return;
    if (!confirm(`Delete range ${r.start}${r.start !== r.end ? ` - ${r.end}` : ''}?`)) return;
    const res = await fetch('/api/exclude-ranges', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ _method: 'DELETE', id: selectedId }),
    });
    if (res.ok) { setSelectedId(null); await loadRanges(); }
  }

  async function handleDeleteAll() {
    if (!confirm('Delete all excluded accounts? This cannot be undone.')) return;
    const res = await fetch('/api/exclude-ranges', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ _method: 'DELETE', all: true }),
    });
    if (res.ok) { setSelectedId(null); await loadRanges(); }
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    const text = await file.text();
    const lines = text.split('\n').filter(l => l.trim());
    // Group consecutive account numbers into ranges (mirrors C++ OnBnClickedImport)
    const newRanges: { start: number; end: number }[] = [];
    let start = -1;
    let end   = -1;
    for (const line of lines) {
      const val = parseInt(line.split(',')[0].replace(/"/g, '').trim());
      if (isNaN(val)) continue;
      if (start === -1) { start = val; end = val; }
      else if (val === end + 1) { end = val; }
      else {
        newRanges.push({ start, end });
        start = val; end = val;
      }
    }
    if (start !== -1) newRanges.push({ start, end });
    if (newRanges.length === 0) { setError('No valid account numbers found.'); return; }
    const res = await fetch('/api/exclude-ranges', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ranges: newRanges }),
    });
    if (res.ok) { loadRanges(); }
    else { const d = await res.json(); setError(d.error || 'Import failed.'); }
    e.target.value = '';
  }

  return (
    <Modal title="Exclude Accounts" onClose={onClose} size="md">
      <div className="p-4 space-y-3">
        {error && <div className="alert-error text-xs">{error}</div>}

        {/* Add form */}
        {showAdd && (
          <div className="border border-[var(--border)] rounded-md p-3 space-y-2 bg-[var(--surface-stripe)]">
            <div className="flex items-end gap-2">
              <div>
                <label className="label text-[10px] mb-1">Start Account</label>
                <input className="input w-36" type="number" value={addStart}
                  onChange={e => setAddStart(e.target.value)}
                  placeholder="0" />
              </div>
              <div>
                <label className="label text-[10px] mb-1">End Account</label>
                <input className="input w-36" type="number" value={addEnd}
                  onChange={e => setAddEnd(e.target.value)}
                  placeholder="Same as start" />
              </div>
            </div>
            <div className="flex gap-2">
              <button className="btn-primary btn-sm text-xs" onClick={handleAdd}>Add</button>
              <button className="btn-secondary btn-sm text-xs"
                onClick={() => { setShowAdd(false); setAddStart(''); setAddEnd(''); setError(''); }}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* List */}
        <div className="border border-[var(--border)] rounded-md overflow-hidden">
          <div className="flex bg-[var(--surface-stripe)] text-xs font-semibold
                          text-[var(--text-secondary)] px-2 py-1.5 border-b border-[var(--border)]">
            <span>Account Range</span>
          </div>
          <div className="overflow-y-auto" style={{ maxHeight: '280px' }}>
            {loading ? (
              <p className="text-xs text-[var(--text-muted)] p-3">Loading…</p>
            ) : ranges.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)] p-3">No excluded accounts.</p>
            ) : ranges.map(r => (
              <div key={r.id}
                onClick={() => setSelectedId(r.id === selectedId ? null : r.id)}
                className={`px-2 py-1.5 cursor-pointer text-sm font-mono
                            border-b border-[var(--border)] last:border-b-0
                            ${r.id === selectedId
                              ? 'bg-[var(--brand-600)] text-white'
                              : 'hover:bg-[var(--surface-hover)]'}`}>
                {r.start === r.end ? r.start : `${r.start} - ${r.end}`}
              </div>
            ))}
          </div>
        </div>

        {/* Footer buttons */}
        <div className="flex items-center gap-2 pt-1">
          <button className="btn-secondary btn-sm text-xs"
            onClick={() => { setShowAdd(true); setError(''); }}>
            Add
          </button>
          <button className="btn-secondary btn-sm text-xs"
            disabled={!selectedId} onClick={handleDelete}>
            Delete
          </button>
          <button className="btn-secondary btn-sm text-xs"
            disabled={ranges.length === 0} onClick={handleDeleteAll}>
            Delete All
          </button>
          <label className="btn-secondary btn-sm text-xs cursor-pointer">
            Import CSV
            <input type="file" className="hidden" accept=".csv,.txt"
              onChange={handleImport} />
          </label>
          <button className="btn-primary btn-sm text-xs ml-auto" onClick={onClose}>
            Save & Close
          </button>
        </div>
      </div>
    </Modal>
  );
}