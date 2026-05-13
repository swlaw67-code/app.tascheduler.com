// app/api/admin/companies/[code]/import/route.ts
// Handles ZIP upload containing TASScheduler flat files and imports into company DB
// Supported: .TSF (company+schedules+forecasts+templates+email)
//            .EMP (skills+employees+availability+breaks+fixed shifts)
//            .DAT (call data)
//            .HLD (special days/holidays)
//            .TOR (time-off requests)
// .ACH (archive) is intentionally skipped

import { NextRequest, NextResponse } from 'next/server';
import { getAdminSessionFromRequest } from '@/lib/auth';
import { masterQuery } from '@/lib/db/master';
import { companyQuery } from '@/lib/db/company';
import mysql from 'mysql2/promise';
import AdmZip from 'adm-zip';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ImportResult {
  file: string;
  records: Record<string, { inserted: number; skipped: number; errors: string[] }>;
  error?: string;
}

interface ImportSummary {
  success: boolean;
  results: ImportResult[];
  totalInserted: number;
  totalSkipped: number;
  totalErrors: number;
  refused?: string;
}

// ─── Binary struct parsers ────────────────────────────────────────────────────
// All structs verified against actual binary files from MSVC 32-bit compilation.
// No #pragma pack in source — uses MSVC default alignment rules.

function cstr(buf: Buffer, offset: number, len: number): string {
  const slice = buf.slice(offset, offset + len);
  const nullIdx = slice.indexOf(0);
  return (nullIdx === -1 ? slice : slice.slice(0, nullIdx))
    .toString('latin1')
    .trim();
}

function u8(buf: Buffer, offset: number): number { return buf.readUInt8(offset); }
function u16(buf: Buffer, offset: number): number { return buf.readUInt16LE(offset); }
function u32(buf: Buffer, offset: number): number { return buf.readUInt32LE(offset); }
function i32(buf: Buffer, offset: number): number { return buf.readInt32LE(offset); }
function f32(buf: Buffer, offset: number): number { return buf.readFloatLE(offset); }
function i64ms(buf: Buffer, offset: number): number {
  // Read __time64_t (int64 little-endian) as two 32-bit halves to avoid BigInt
  const lo = buf.readUInt32LE(offset);
  const hi = buf.readInt32LE(offset + 4);
  return (hi * 0x100000000 + lo) * 1000;
}
function bool8(buf: Buffer, offset: number): boolean { return buf.readUInt8(offset) !== 0; }

// Convert Windows time_t (__time64_t) to MySQL date string
function time64ToDate(buf: Buffer, offset: number): string | null {
  try {
    const ms = i64ms(buf, offset);
    if (ms === 0) return null;
    const d = new Date(ms);
    if (isNaN(d.getTime())) return null;
    return d.toISOString().split('T')[0];
  } catch { return null; }
}

// Convert mm/dd/yyyy date string from flat file to MySQL yyyy-mm-dd
function flatDateToMySQL(s: string): string | null {
  if (!s || s.length < 8) return null;
  // Format in files: "03/09/2018" or "141006" (yymmdd for some forecast dates)
  if (s.includes('/')) {
    const [m, d, y] = s.split('/');
    if (!m || !d || !y) return null;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  // yymmdd format used in forecast/schedule dates
  if (s.length === 6) {
    return `20${s.slice(0, 2)}-${s.slice(2, 4)}-${s.slice(4, 6)}`;
  }
  return null;
}

// ─── TSF parser ──────────────────────────────────────────────────────────────
// Structure: CCompanyData::Data (1024 bytes) followed by tagged records
// Each tagged record: char id[5] + unsigned long RecSize (4 bytes) + data

const COMPANY_DATA_SIZE = 1024;

function parseTSF(buf: Buffer) {
  if (buf.length < COMPANY_DATA_SIZE) throw new Error('TSF file too small');

  // Parse CCompanyData::Data (1024 bytes)
  const company = {
    version:           cstr(buf, 0, 5),
    name:              cstr(buf, 5, 101),
    address:           cstr(buf, 106, 101),
    city:              cstr(buf, 207, 31),
    state:             cstr(buf, 238, 3),
    zip:               cstr(buf, 241, 11),
    email:             cstr(buf, 252, 61),
    phone:             cstr(buf, 313, 14),
    fax:               cstr(buf, 327, 14),
    schedule_start_day: u8(buf, 341),
    max_seats:         u8(buf, 342),
    file_id:           cstr(buf, 448, 4),
    first_shift:       cstr(buf, 452, 15),
    second_shift:      cstr(buf, 467, 15),
    third_shift:       cstr(buf, 482, 15),
    shift_color_1:     u32(buf, 500),
    shift_color_2:     u32(buf, 504),
    shift_color_3:     u32(buf, 508),
    // ShiftValues[96] at 512 — stored as JSON
    shift_values:      JSON.stringify(Array.from(buf.slice(512, 608))),
    min_hours:         u8(buf, 608),
    autofill_breaks:   bool8(buf, 609),
    online_company_code: cstr(buf, 610, 11),
    online_synced:     bool8(buf, 621),
    company_not_247:   bool8(buf, 622),
    online_connect_password: cstr(buf, 623, 31),
  };

  if (company.file_id !== 'TSF') throw new Error('Not a valid TSF file (FileID mismatch)');

  // Parse tagged records
  const records: Record<string, Buffer[]> = {};
  let offset = COMPANY_DATA_SIZE;

  while (offset < buf.length - 9) {
    const tag = cstr(buf, offset, 4);
    const recSize = u32(buf, offset + 5);
    if (recSize > buf.length - offset - 9) break; // safety
    const recBuf = buf.slice(offset + 9, offset + 9 + recSize);
    if (!records[tag]) records[tag] = [];
    records[tag].push(recBuf);
    offset += 9 + recSize;
  }

  // Parse FCST records (8836 bytes each)
  const forecasts = (records['FCST'] || []).map(r => ({
    forecast_id:        u32(r, 0),
    date:               flatDateToMySQL(cstr(r, 4, 11)),
    testnumber:         u16(r, 16),
    // forecastrec[7] at offset 20, each 1256 bytes
    forecast_data:      Array.from({ length: 7 }, (_, i) => {
      const base = 20 + i * 1256;
      return {
        day: i,
        date: cstr(r, base, 7),
        ave_calls:     Array.from({ length: 24 }, (_, h) =>
          Array.from({ length: 4 }, (_, q) => r.readFloatLE(base + 488 + (h * 4 + q) * 4))
        ),
        ave_talk_time: Array.from({ length: 24 }, (_, h) =>
          Array.from({ length: 4 }, (_, q) => r.readFloatLE(base + 872 + (h * 4 + q) * 4))
        ),
      };
    }),
    efficiency:         u32(r, 8812),
    weeks:              u32(r, 8816),
    erlang_c:           bool8(r, 8820),
    service_level:      u32(r, 8824),
    target_answer_time: u32(r, 8828),
    published:          bool8(r, 8832),
  }));

  // Parse FADJ records (8072 bytes each)
  // forecastrecadj[7]: float AveCallsAdj[24][4] + float AveTalkTimeAdj[24][4] + float AveAgentAdj[24][4]
  // Each forecastrecadj: 3 * 24 * 4 * 4 = 1152 bytes; 7 * 1152 = 8064
  // UINT32 ForecastAdj_ID: 0, UINT32 Forecast_ID: 4, data at 8
  const forecast_adjs = (records['FADJ'] || []).map(r => ({
    forecast_adj_id: u32(r, 0),
    forecast_id:     u32(r, 4),
    adj_data:        Array.from({ length: 7 }, (_, i) => {
      const base = 8 + i * 1152;
      return {
        day: i,
        ave_calls_adj:     Array.from({ length: 24 }, (_, h) =>
          Array.from({ length: 4 }, (_, q) => r.readFloatLE(base + (h * 4 + q) * 4))
        ),
        ave_talk_time_adj: Array.from({ length: 24 }, (_, h) =>
          Array.from({ length: 4 }, (_, q) => r.readFloatLE(base + 384 + (h * 4 + q) * 4))
        ),
        ave_agent_adj:     Array.from({ length: 24 }, (_, h) =>
          Array.from({ length: 4 }, (_, q) => r.readFloatLE(base + 768 + (h * 4 + q) * 4))
        ),
      };
    }),
  }));

  // Parse SCHL records (32 bytes each) — schedules
  const schedules = (records['SCHL'] || []).map(r => ({
    schedule_id:          u32(r, 0),
    date:                 flatDateToMySQL(cstr(r, 4, 11)),
    testnumber:           u16(r, 16),
    forecast_id:          u32(r, 20),
    previous_schedule_id: u32(r, 24),
    published:            bool8(r, 28),
  }));

  // Parse SCHA records (40 bytes each) — schedule availability
  const schedule_avail = (records['SCHA'] || []).map(r => ({
    schedule_id:      u32(r, 0),
    schedule_avail_id: u32(r, 4),
    employee_id:      u32(r, 8),
    day:              u8(r, 12),
    start_hour:       i32(r, 16),
    start_minute:     i32(r, 20),
    stop_hour:        i32(r, 24),
    stop_minute:      i32(r, 28),
    special:          bool8(r, 32),
    skill_level:      u8(r, 36),
  }));

  // Parse SHFT records (40 bytes each) — shifts
  const shifts = (records['SHFT'] || []).map(r => ({
    schedule_id:  u32(r, 0),
    shift_id:     u32(r, 4),
    employee_id:  u32(r, 8),
    skill_id:     u32(r, 12),
    day:          u16(r, 16),
    start_hour:   i32(r, 20),
    start_minute: i32(r, 24),
    stop_hour:    i32(r, 28),
    stop_minute:  i32(r, 32),
    next_day:     bool8(r, 36),
  }));

  // Parse SBRK records (24 bytes each) — shift breaks
  const shift_breaks = (records['SBRK'] || []).map(r => ({
    schedule_id:    u32(r, 0),
    shift_break_id: u32(r, 4),
    shift_id:       u32(r, 8),
    start_hour:     i32(r, 12),
    start_minute:   i32(r, 16),
    break_id:       u32(r, 20),
  }));

  // Parse TMPN records (56 bytes each) — template names
  const template_names = (records['TMPN'] || []).map(r => ({
    template_id: u32(r, 0),
    name:        cstr(r, 4, 50),
  }));

  // Parse TMPL records (40 bytes each) — template shifts (same layout as SHFT)
  const template_shifts = (records['TMPL'] || []).map(r => ({
    template_id:  u32(r, 0),
    shift_id:     u32(r, 4),
    employee_id:  u32(r, 8),
    skill_id:     u32(r, 12),
    day:          u16(r, 16),
    start_hour:   i32(r, 20),
    start_minute: i32(r, 24),
    stop_hour:    i32(r, 28),
    stop_minute:  i32(r, 32),
    next_day:     bool8(r, 36),
  }));

  // Parse TBRK records (24 bytes each) — template breaks (same layout as SBRK)
  const template_breaks = (records['TBRK'] || []).map(r => ({
    template_id:    u32(r, 0),
    shift_break_id: u32(r, 4),
    shift_id:       u32(r, 8),
    start_hour:     i32(r, 12),
    start_minute:   i32(r, 16),
    break_id:       u32(r, 20),
  }));

  // Parse MAIL records (476 bytes each) — email server
  const email_servers = (records['MAIL'] || []).map(r => ({
    email_server_id: u32(r, 0),
    sender:          cstr(r, 4, 51),
    sender_email:    cstr(r, 55, 51),
    server:          cstr(r, 106, 51),
    port:            i32(r, 160),
    user:            cstr(r, 164, 51),
    password:        cstr(r, 215, 256),
    encrypt:         i32(r, 472),
  }));

  // Parse POSR records (72 bytes each) — positions
  // UINT32 PositionRec_ID:0, char Name[51]:4, pad1->56, TimeRec Start:56(h=56,m=60), TimeRec End:64(h=64,m=68)
  const positions = (records['POSR'] || []).map(r => ({
    position_id:  u32(r, 0),
    name:         cstr(r, 4, 51),
    start_hour:   i32(r, 56),
    start_minute: i32(r, 60),
    end_hour:     i32(r, 64),
    end_minute:   i32(r, 68),
  }));

  return {
    company, forecasts, forecast_adjs, schedules, schedule_avail,
    shifts, shift_breaks, template_names, template_shifts, template_breaks,
    email_servers, positions,
  };
}

// ─── EMP parser ──────────────────────────────────────────────────────────────
// Structure: tagged records only (no header), same id[5]+RecSize[4]+data format

function parseEMP(buf: Buffer) {
  const records: Record<string, Buffer[]> = {};
  let offset = 0;

  while (offset < buf.length - 9) {
    const tag = cstr(buf, offset, 4);
    const recSize = u32(buf, offset + 5);
    if (recSize > buf.length - offset - 9) break;
    const recBuf = buf.slice(offset + 9, offset + 9 + recSize);
    if (!records[tag]) records[tag] = [];
    records[tag].push(recBuf);
    offset += 9 + recSize;
  }

  // Parse SKIL records (56 bytes) — skills
  const skills = (records['SKIL'] || []).map(r => ({
    skill_id:      u32(r, 0),
    name:          cstr(r, 4, 25),
    color:         u32(r, 32),
    poi:           u8(r, 36),
    op_perc_1:     u8(r, 37),
    op_perc_2:     u8(r, 38),
    op_perc_3:     u8(r, 39),
    op_perc_4:     u8(r, 40),
    default_skill: bool8(r, 44),
    higher:        bool8(r, 45),
    multiple:      bool8(r, 46),
    multiple_number: u8(r, 47),
    need:          bool8(r, 48),
    exclude:       bool8(r, 49),
    exclude_hours: bool8(r, 50),
    deleted:       bool8(r, 51),
    code:          u8(r, 52),
  }));

  // Parse SKND records (28 bytes) — skill needs
  const skill_needs = (records['SKND'] || []).map(r => ({
    skill_need_id: u32(r, 0),
    skill_id:      u32(r, 4),
    day:           u8(r, 8),
    number:        u8(r, 9),
    start_hour:    i32(r, 12),
    start_minute:  i32(r, 16),
    stop_hour:     i32(r, 20),
    stop_minute:   i32(r, 24),
  }));

  // Parse EMPL records (400 bytes) — employees
  const employees = (records['EMPL'] || []).map(r => ({
    employee_id:     u32(r, 0),
    skill_id:        u32(r, 4),
    name:            cstr(r, 8, 51),
    address:         cstr(r, 59, 101),
    city:            cstr(r, 160, 31),
    state:           cstr(r, 191, 3),
    zip:             cstr(r, 194, 11),
    email:           cstr(r, 205, 61),
    phone:           cstr(r, 266, 14),
    min_hours:       u8(r, 280),
    max_hours:       u8(r, 281),
    split_shift:     bool8(r, 282),
    skill_level:     u8(r, 283),
    poor_performance: bool8(r, 284),
    inactive:        bool8(r, 285),
    pay_rate:        f32(r, 288),
    pay_cycle:       i32(r, 292),
    overtime:        bool8(r, 296),
    min_hours_day:   u8(r, 297),
    max_hours_day:   u8(r, 298),
    max_days_week:   u8(r, 299),
    mtf_employee_id: cstr(r, 300, 51),
    sort_num:        i32(r, 352),
    preference:      i32(r, 356),
    timezone:        i32(r, 360),
    max_days_row:    u8(r, 364),
    hire_date:       flatDateToMySQL(cstr(r, 365, 11)),
    hire_time:       time64ToDate(r, 376),
    two_days_off:    bool8(r, 384),
    use_weekend_rule: bool8(r, 385),
    saturday_date:   flatDateToMySQL(cstr(r, 386, 11)),
    deleted:         bool8(r, 397),
    use_special:     bool8(r, 398),
  }));

  // Parse EMPA records (32 bytes) — employee availability
  const employee_avail = (records['EMPA'] || []).map(r => ({
    employee_avail_id: u32(r, 0),
    employee_id:       u32(r, 4),
    day:               u8(r, 8),
    start_hour:        i32(r, 12),
    start_minute:      i32(r, 16),
    stop_hour:         i32(r, 20),
    stop_minute:       i32(r, 24),
    special:           bool8(r, 28),
  }));

  // Parse EMPS records (12 bytes) — employee skills (many-to-many)
  const employee_skills = (records['EMPS'] || []).map(r => ({
    employee_skill_id: u32(r, 0),
    skill_id:          u32(r, 4),
    employee_id:       u32(r, 8),
  }));

  // Parse BRKS records (60 bytes) — breaks
  const breaks = (records['BRKS'] || []).map(r => ({
    break_id:  u32(r, 0),
    minutes:   u8(r, 4),
    hours:     u8(r, 5),
    min_hour:  i32(r, 8),
    min_minute: i32(r, 12),
    max_hour:  i32(r, 16),
    max_minute: i32(r, 20),
    paid:      bool8(r, 24),
    autofill:  bool8(r, 25),
    color:     u32(r, 28),
    name:      cstr(r, 32, 25),
    deleted:   bool8(r, 57),
  }));

  // Parse FSFT records (12 bytes) — fixed shifts
  const fixed_shifts = (records['FSFT'] || []).map(r => ({
    fixed_shift_id: u32(r, 0),
    length:         f32(r, 4),
    standard:       bool8(r, 8),
  }));

  // Parse EFSD records (8 bytes) — employee fixed shift assignments
  const employee_fixed_shifts = (records['EFSD'] || []).map(r => ({
    employee_id:    u32(r, 0),
    fixed_shift_id: u32(r, 4),
  }));

  // Parse FBRK records (16 bytes) — fixed shift breaks
  const fixed_shift_breaks = (records['FBRK'] || []).map(r => ({
    fixed_shift_id:       u32(r, 0),
    fixed_shift_break_id: u32(r, 4),
    break_id:             u32(r, 8),
    total:                i32(r, 12),
  }));

  return {
    skills, skill_needs, employees, employee_avail,
    employee_skills, breaks, fixed_shifts, employee_fixed_shifts, fixed_shift_breaks,
  };
}

// ─── DAT parser ──────────────────────────────────────────────────────────────
// Structure: raw sequential dayrec structs, no headers or tags
// dayrec: char date[7] + UINT16 Calls[24][4] + UINT32 TalkTime[24][4] +
//         UINT32 TalkTime1 + UINT32 TalkTime2 + UINT32 TalkTime3 + UINT32 TotalTalkTime
// Size: 7 + 1(pad) + 192 + 384 + 16 = 600 bytes
// Actually: char[7]=7, pad1->8, UINT16[96]=192, UINT32[96]=384, UINT32*4=16 -> 600

const DAY_REC_SIZE = 600;

function parseDAT(buf: Buffer) {
  const records = [];
  let offset = 0;
  while (offset + DAY_REC_SIZE <= buf.length) {
    const dateRaw = cstr(buf, offset, 7); // yymmdd or similar
    const date = flatDateToMySQL(dateRaw);
    const calls: number[][] = [];
    const talk_time: number[][] = [];
    for (let h = 0; h < 24; h++) {
      calls.push([]);
      talk_time.push([]);
      for (let q = 0; q < 4; q++) {
        calls[h].push(buf.readUInt16LE(offset + 8 + (h * 4 + q) * 2));
        talk_time[h].push(buf.readUInt32LE(offset + 200 + (h * 4 + q) * 4));
      }
    }
    const talk_time_1 = buf.readUInt32LE(offset + 584);
    const talk_time_2 = buf.readUInt32LE(offset + 588);
    const talk_time_3 = buf.readUInt32LE(offset + 592);
    const total_talk_time = buf.readUInt32LE(offset + 596);
    if (date) {
      records.push({ date, calls, talk_time, talk_time_1, talk_time_2, talk_time_3, total_talk_time });
    }
    offset += DAY_REC_SIZE;
  }
  return records;
}

// ─── HLD parser ──────────────────────────────────────────────────────────────
// Structure: raw sequential CSpecialDayData::Data = specialdayrec structs
// specialdayrec: UINT32 SDR_ID(0) + char date[11](4) + char name[50](15)
// Total: 4+11+50 = 65, padded to 68 (UINT32 is largest, align 4: 65->68)

const HLD_REC_SIZE = 68;

function parseHLD(buf: Buffer) {
  const records = [];
  let offset = 0;
  while (offset + HLD_REC_SIZE <= buf.length) {
    const sdr_id = u32(buf, offset);
    const dateRaw = cstr(buf, offset + 4, 11);
    const name = cstr(buf, offset + 15, 50);
    const date = flatDateToMySQL(dateRaw);
    if (date && name) {
      records.push({ sdr_id, date, name });
    }
    offset += HLD_REC_SIZE;
  }
  return records;
}

// ─── TOR parser ──────────────────────────────────────────────────────────────
// Structure: [RecSize:4][timeoffrec] pairs (size-prefixed, no id tag)
// timeoffrec: UINT32 TOR_ID(0) + UINT32 Employee_ID(4) + char DateSubmitted[11](8)
//   + char DateRequested[11](19) + char Reason[50](30) + bool AllDay(80)
//   + pad3 -> TimeRec StartTime(84): hour(84),minute(88) + TimeRec EndTime(92): hour(92),minute(96)
//   + BYTE Approved(100) + char EndDateRequested[11](101) + BYTE OnlineStatus(112)
//   + pad3 -> 116 bytes total

function parseTOR(buf: Buffer) {
  const records = [];
  let offset = 0;
  while (offset + 4 < buf.length) {
    const recSize = u32(buf, offset);
    offset += 4;
    if (offset + recSize > buf.length) break;
    const r = buf.slice(offset, offset + recSize);
    offset += recSize;

    const tor_id       = u32(r, 0);
    const employee_id  = u32(r, 4);
    const date_submitted = flatDateToMySQL(cstr(r, 8, 11));
    const date_requested = flatDateToMySQL(cstr(r, 19, 11));
    const reason       = cstr(r, 30, 50);
    const all_day      = bool8(r, 80);
    const start_hour   = i32(r, 84);
    const start_minute = i32(r, 88);
    const end_hour     = i32(r, 92);
    const end_minute   = i32(r, 96);
    const approved     = u8(r, 100);
    const end_date_requested = flatDateToMySQL(cstr(r, 101, 11));
    const online_status = u8(r, 112);

    if (employee_id > 0) {
      records.push({
        tor_id, employee_id, date_submitted, date_requested, reason,
        all_day, start_hour, start_minute, end_hour, end_minute,
        approved, end_date_requested, online_status,
      });
    }
  }
  return records;
}

// ─── DB insertion helpers ─────────────────────────────────────────────────────

async function insertTSF(
  config: { db_name: string; db_user: string; db_pass: string },
  parsed: ReturnType<typeof parseTSF>,
  result: ImportResult
) {
  const r = result.records;

  // company_settings
  r['company_settings'] = { inserted: 0, skipped: 0, errors: [] };
  try {
    const c = parsed.company;
    await companyQuery(config,
      `INSERT INTO company_settings (
        name, address, city, state, zip, email, phone, fax,
        schedule_start_day, max_seats,
        first_shift, second_shift, third_shift,
        shift_color_1, shift_color_2, shift_color_3,
        shift_values, min_hours, autofill_breaks,
        online_company_code, online_synced, company_not_247
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        c.name, c.address, c.city, c.state, c.zip, c.email, c.phone, c.fax,
        c.schedule_start_day, c.max_seats,
        c.first_shift, c.second_shift, c.third_shift,
        c.shift_color_1, c.shift_color_2, c.shift_color_3,
        c.shift_values, c.min_hours, c.autofill_breaks ? 1 : 0,
        c.online_company_code, c.online_synced ? 1 : 0, c.company_not_247 ? 1 : 0,
      ]
    );
    r['company_settings'].inserted = 1;
  } catch (e: unknown) {
    r['company_settings'].errors.push(String(e instanceof Error ? e.message : e));
  }

  // email_server
  r['email_server'] = { inserted: 0, skipped: 0, errors: [] };
  for (const m of parsed.email_servers) {
    try {
      await companyQuery(config,
        `INSERT INTO email_server (sender, sender_email, server, port, user, password, encrypt)
         VALUES (?,?,?,?,?,?,?)`,
        [m.sender, m.sender_email, m.server, m.port, m.user, m.password, m.encrypt]
      );
      r['email_server'].inserted++;
    } catch (e: unknown) {
      r['email_server'].errors.push(String(e instanceof Error ? e.message : e));
    }
  }

  // positions
  r['positions'] = { inserted: 0, skipped: 0, errors: [] };
  for (const p of parsed.positions) {
    try {
      await companyQuery(config,
        `INSERT INTO positions (name, start_hour, start_minute, end_hour, end_minute)
         VALUES (?,?,?,?,?)`,
        [p.name, p.start_hour, p.start_minute, p.end_hour, p.end_minute]
      );
      r['positions'].inserted++;
    } catch (e: unknown) {
      r['positions'].errors.push(String(e instanceof Error ? e.message : e));
    }
  }

  // forecasts
  r['forecasts'] = { inserted: 0, skipped: 0, errors: [] };
  for (const f of parsed.forecasts) {
    try {
      await companyQuery(config,
        `INSERT INTO forecasts (id, date, testnumber, efficiency, weeks, erlang_c,
         service_level, target_answer_time, published)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [f.forecast_id, f.date, f.testnumber, f.efficiency, f.weeks,
         f.erlang_c ? 1 : 0, f.service_level, f.target_answer_time, f.published ? 1 : 0]
      );
      // Insert forecast_data rows
      for (const fd of f.forecast_data) {
        for (let h = 0; h < 24; h++) {
          for (let q = 0; q < 4; q++) {
            const calls = fd.ave_calls[h][q];
            const talk = fd.ave_talk_time[h][q];
            if (calls > 0 || talk > 0) {
              await companyQuery(config,
                `INSERT INTO forecast_data (forecast_id, day, hour, quarter, ave_calls, ave_talk_time)
                 VALUES (?,?,?,?,?,?)`,
                [f.forecast_id, fd.day, h, q, calls, talk]
              );
            }
          }
        }
      }
      r['forecasts'].inserted++;
    } catch (e: unknown) {
      r['forecasts'].errors.push(`Forecast ${f.forecast_id}: ${e instanceof Error ? e.message : e}`);
    }
  }

  // schedules
  r['schedules'] = { inserted: 0, skipped: 0, errors: [] };
  for (const s of parsed.schedules) {
    try {
      await companyQuery(config,
        `INSERT INTO schedules (id, date, testnumber, forecast_id, previous_schedule_id, published)
         VALUES (?,?,?,?,?,?)`,
        [s.schedule_id, s.date, s.testnumber, s.forecast_id,
         s.previous_schedule_id || null, s.published ? 1 : 0]
      );
      r['schedules'].inserted++;
    } catch (e: unknown) {
      r['schedules'].errors.push(`Schedule ${s.schedule_id}: ${e instanceof Error ? e.message : e}`);
    }
  }

  // schedule_availability
  r['schedule_availability'] = { inserted: 0, skipped: 0, errors: [] };
  for (const sa of parsed.schedule_avail) {
    try {
      await companyQuery(config,
        `INSERT INTO schedule_availability
         (schedule_id, employee_id, day, start_hour, start_minute, stop_hour, stop_minute, special, skill_level)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [sa.schedule_id, sa.employee_id, sa.day,
         sa.start_hour, sa.start_minute, sa.stop_hour, sa.stop_minute,
         sa.special ? 1 : 0, sa.skill_level]
      );
      r['schedule_availability'].inserted++;
    } catch (e: unknown) {
      r['schedule_availability'].errors.push(String(e instanceof Error ? e.message : e));
    }
  }

  // shifts
  r['shifts'] = { inserted: 0, skipped: 0, errors: [] };
  for (const s of parsed.shifts) {
    try {
      await companyQuery(config,
        `INSERT INTO shifts (id, schedule_id, employee_id, skill_id, day,
         start_hour, start_minute, stop_hour, stop_minute, next_day)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [s.shift_id, s.schedule_id, s.employee_id, s.skill_id, s.day,
         s.start_hour, s.start_minute, s.stop_hour, s.stop_minute, s.next_day ? 1 : 0]
      );
      r['shifts'].inserted++;
    } catch (e: unknown) {
      r['shifts'].errors.push(String(e instanceof Error ? e.message : e));
    }
  }

  // shift_breaks
  r['shift_breaks'] = { inserted: 0, skipped: 0, errors: [] };
  for (const sb of parsed.shift_breaks) {
    try {
      await companyQuery(config,
        `INSERT INTO shift_breaks (id, schedule_id, shift_id, start_hour, start_minute, break_id)
         VALUES (?,?,?,?,?,?)`,
        [sb.shift_break_id, sb.schedule_id, sb.shift_id,
         sb.start_hour, sb.start_minute, sb.break_id]
      );
      r['shift_breaks'].inserted++;
    } catch (e: unknown) {
      r['shift_breaks'].errors.push(String(e instanceof Error ? e.message : e));
    }
  }

  // templates
  r['templates'] = { inserted: 0, skipped: 0, errors: [] };
  for (const t of parsed.template_names) {
    try {
      await companyQuery(config,
        `INSERT INTO templates (id, name) VALUES (?,?)`,
        [t.template_id, t.name]
      );
      r['templates'].inserted++;
    } catch (e: unknown) {
      r['templates'].errors.push(String(e instanceof Error ? e.message : e));
    }
  }

  // template_shifts
  r['template_shifts'] = { inserted: 0, skipped: 0, errors: [] };
  for (const ts of parsed.template_shifts) {
    try {
      await companyQuery(config,
        `INSERT INTO template_shifts (id, template_id, employee_id, skill_id, day,
         start_hour, start_minute, stop_hour, stop_minute, next_day)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [ts.shift_id, ts.template_id, ts.employee_id, ts.skill_id, ts.day,
         ts.start_hour, ts.start_minute, ts.stop_hour, ts.stop_minute, ts.next_day ? 1 : 0]
      );
      r['template_shifts'].inserted++;
    } catch (e: unknown) {
      r['template_shifts'].errors.push(String(e instanceof Error ? e.message : e));
    }
  }

  // template_shift_breaks
  r['template_shift_breaks'] = { inserted: 0, skipped: 0, errors: [] };
  for (const tb of parsed.template_breaks) {
    try {
      await companyQuery(config,
        `INSERT INTO template_shift_breaks (id, template_id, shift_id, start_hour, start_minute, break_id)
         VALUES (?,?,?,?,?,?)`,
        [tb.shift_break_id, tb.template_id, tb.shift_id,
         tb.start_hour, tb.start_minute, tb.break_id]
      );
      r['template_shift_breaks'].inserted++;
    } catch (e: unknown) {
      r['template_shift_breaks'].errors.push(String(e instanceof Error ? e.message : e));
    }
  }
}

async function insertEMP(
  config: { db_name: string; db_user: string; db_pass: string },
  parsed: ReturnType<typeof parseEMP>,
  result: ImportResult
) {
  const r = result.records;

  // skills (skip deleted)
  r['skills'] = { inserted: 0, skipped: 0, errors: [] };
  for (const s of parsed.skills) {
    if (s.deleted) { r['skills'].skipped++; continue; }
    try {
      await companyQuery(config,
        `INSERT INTO skills (id, name, color, poi, op_perc_1, op_perc_2, op_perc_3, op_perc_4,
         is_default, higher, multiple, multiple_number, need, exclude, exclude_hours, code)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [s.skill_id, s.name, s.color, s.poi,
         s.op_perc_1, s.op_perc_2, s.op_perc_3, s.op_perc_4,
         s.default_skill ? 1 : 0, s.higher ? 1 : 0, s.multiple ? 1 : 0,
         s.multiple_number, s.need ? 1 : 0, s.exclude ? 1 : 0,
         s.exclude_hours ? 1 : 0, s.code]
      );
      r['skills'].inserted++;
    } catch (e: unknown) {
      r['skills'].errors.push(`Skill ${s.skill_id} '${s.name}': ${e instanceof Error ? e.message : e}`);
    }
  }

  // skill_needs
  r['skill_needs'] = { inserted: 0, skipped: 0, errors: [] };
  for (const sn of parsed.skill_needs) {
    try {
      await companyQuery(config,
        `INSERT INTO skill_needs (id, skill_id, day, number, start_hour, start_minute, stop_hour, stop_minute)
         VALUES (?,?,?,?,?,?,?,?)`,
        [sn.skill_need_id, sn.skill_id, sn.day, sn.number,
         sn.start_hour, sn.start_minute, sn.stop_hour, sn.stop_minute]
      );
      r['skill_needs'].inserted++;
    } catch (e: unknown) {
      r['skill_needs'].errors.push(String(e instanceof Error ? e.message : e));
    }
  }

  // breaks (skip deleted)
  r['breaks'] = { inserted: 0, skipped: 0, errors: [] };
  for (const b of parsed.breaks) {
    if (b.deleted) { r['breaks'].skipped++; continue; }
    try {
      await companyQuery(config,
        `INSERT INTO breaks (id, name, minutes, hours, min_hour, min_minute,
         max_hour, max_minute, paid, autofill, color)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        [b.break_id, b.name, b.minutes, b.hours,
         b.min_hour, b.min_minute, b.max_hour, b.max_minute,
         b.paid ? 1 : 0, b.autofill ? 1 : 0, b.color]
      );
      r['breaks'].inserted++;
    } catch (e: unknown) {
      r['breaks'].errors.push(`Break ${b.break_id}: ${e instanceof Error ? e.message : e}`);
    }
  }

  // employees (skip deleted)
  r['employees'] = { inserted: 0, skipped: 0, errors: [] };
  for (const e of parsed.employees) {
    if (e.deleted) { r['employees'].skipped++; continue; }
    try {
      await companyQuery(config,
        `INSERT INTO employees (
          id, skill_id, name, address, city, state, zip, email, phone,
          min_hours, max_hours, split_shift, skill_level, poor_performance, inactive,
          pay_rate, pay_cycle, overtime, min_hours_day, max_hours_day, max_days_week,
          mtf_employee_id, sort_num, preference, timezone, max_days_row,
          hire_date, two_days_off, use_weekend_rule, saturday_date, use_special, deleted
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0)`,
        [
          e.employee_id, e.skill_id, e.name,
          e.address || null, e.city || null, e.state || null, e.zip || null,
          e.email || null, e.phone || null,
          e.min_hours, e.max_hours, e.split_shift ? 1 : 0,
          e.skill_level, e.poor_performance ? 1 : 0, e.inactive ? 1 : 0,
          e.pay_rate, e.pay_cycle, e.overtime ? 1 : 0,
          e.min_hours_day, e.max_hours_day, e.max_days_week,
          e.mtf_employee_id || null,
          e.sort_num < 0 ? null : e.sort_num,
          e.preference, e.timezone, e.max_days_row,
          e.hire_date || null, e.two_days_off ? 1 : 0,
          e.use_weekend_rule ? 1 : 0, e.saturday_date || null,
          e.use_special ? 1 : 0,
        ]
      );
      r['employees'].inserted++;
    } catch (e2: unknown) {
      r['employees'].errors.push(`Employee ${e.employee_id} '${e.name}': ${e2 instanceof Error ? e2.message : e2}`);
    }
  }

  // employee_availability
  r['employee_availability'] = { inserted: 0, skipped: 0, errors: [] };
  for (const ea of parsed.employee_avail) {
    try {
      await companyQuery(config,
        `INSERT INTO employee_availability
         (employee_id, day, start_hour, start_minute, stop_hour, stop_minute, special)
         VALUES (?,?,?,?,?,?,?)`,
        [ea.employee_id, ea.day, ea.start_hour, ea.start_minute,
         ea.stop_hour, ea.stop_minute, ea.special ? 1 : 0]
      );
      r['employee_availability'].inserted++;
    } catch (e: unknown) {
      r['employee_availability'].errors.push(String(e instanceof Error ? e.message : e));
    }
  }

  // employee_skills
  r['employee_skills'] = { inserted: 0, skipped: 0, errors: [] };
  for (const es of parsed.employee_skills) {
    try {
      await companyQuery(config,
        `INSERT IGNORE INTO employee_skills (employee_id, skill_id) VALUES (?,?)`,
        [es.employee_id, es.skill_id]
      );
      r['employee_skills'].inserted++;
    } catch (e: unknown) {
      r['employee_skills'].errors.push(String(e instanceof Error ? e.message : e));
    }
  }

  // fixed_shifts
  r['fixed_shifts'] = { inserted: 0, skipped: 0, errors: [] };
  for (const fs of parsed.fixed_shifts) {
    try {
      await companyQuery(config,
        `INSERT INTO fixed_shifts (id, length, standard) VALUES (?,?,?)`,
        [fs.fixed_shift_id, fs.length, fs.standard ? 1 : 0]
      );
      r['fixed_shifts'].inserted++;
    } catch (e: unknown) {
      r['fixed_shifts'].errors.push(String(e instanceof Error ? e.message : e));
    }
  }

  // employee_fixed_shifts
  r['employee_fixed_shifts'] = { inserted: 0, skipped: 0, errors: [] };
  for (const efs of parsed.employee_fixed_shifts) {
    try {
      await companyQuery(config,
        `INSERT IGNORE INTO employee_fixed_shifts (employee_id, fixed_shift_id) VALUES (?,?)`,
        [efs.employee_id, efs.fixed_shift_id]
      );
      r['employee_fixed_shifts'].inserted++;
    } catch (e: unknown) {
      r['employee_fixed_shifts'].errors.push(String(e instanceof Error ? e.message : e));
    }
  }

  // fixed_shift_breaks
  r['fixed_shift_breaks'] = { inserted: 0, skipped: 0, errors: [] };
  for (const fsb of parsed.fixed_shift_breaks) {
    try {
      await companyQuery(config,
        `INSERT INTO fixed_shift_breaks (fixed_shift_id, break_id, total)
         VALUES (?,?,?)`,
        [fsb.fixed_shift_id, fsb.break_id, fsb.total]
      );
      r['fixed_shift_breaks'].inserted++;
    } catch (e: unknown) {
      r['fixed_shift_breaks'].errors.push(String(e instanceof Error ? e.message : e));
    }
  }
}

async function insertDAT(
  config: { db_name: string; db_user: string; db_pass: string },
  records: ReturnType<typeof parseDAT>,
  result: ImportResult
) {
  result.records['call_data'] = { inserted: 0, skipped: 0, errors: [] };
  for (const d of records) {
    try {
      // Flatten calls and talk_time arrays for storage
      for (let h = 0; h < 24; h++) {
        for (let q = 0; q < 4; q++) {
          const calls = d.calls[h][q];
          const talk = d.talk_time[h][q];
          if (calls > 0 || talk > 0) {
            await companyQuery(config,
              `INSERT INTO call_data (date, hour, quarter, calls, talk_time)
               VALUES (?,?,?,?,?)
               ON DUPLICATE KEY UPDATE calls=VALUES(calls), talk_time=VALUES(talk_time)`,
              [d.date, h, q, calls, talk]
            );
          }
        }
      }
      result.records['call_data'].inserted++;
    } catch (e: unknown) {
      result.records['call_data'].errors.push(`${d.date}: ${e instanceof Error ? e.message : e}`);
    }
  }
}

async function insertHLD(
  config: { db_name: string; db_user: string; db_pass: string },
  records: ReturnType<typeof parseHLD>,
  result: ImportResult
) {
  result.records['special_days'] = { inserted: 0, skipped: 0, errors: [] };
  for (const d of records) {
    try {
      await companyQuery(config,
        `INSERT INTO special_days (date, name) VALUES (?,?)`,
        [d.date, d.name]
      );
      result.records['special_days'].inserted++;
    } catch (e: unknown) {
      result.records['special_days'].errors.push(`${d.date}: ${e instanceof Error ? e.message : e}`);
    }
  }
}

async function insertTOR(
  config: { db_name: string; db_user: string; db_pass: string },
  records: ReturnType<typeof parseTOR>,
  result: ImportResult
) {
  result.records['time_off_requests'] = { inserted: 0, skipped: 0, errors: [] };
  for (const t of records) {
    try {
      await companyQuery(config,
        `INSERT INTO time_off_requests
         (employee_id, date_submitted, date_requested, reason, all_day,
          start_hour, start_minute, end_hour, end_minute, approved,
          end_date_requested, online_status)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          t.employee_id, t.date_submitted, t.date_requested,
          t.reason || null, t.all_day ? 1 : 0,
          t.start_hour, t.start_minute, t.end_hour, t.end_minute,
          t.approved, t.end_date_requested || null, t.online_status,
        ]
      );
      result.records['time_off_requests'].inserted++;
    } catch (e: unknown) {
      result.records['time_off_requests'].errors.push(`TOR ${t.tor_id}: ${e instanceof Error ? e.message : e}`);
    }
  }
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: { code: string } }
) {
  const { code } = params;

  // Verify admin session
  if (!await getAdminSessionFromRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 200 });
  }

  // Look up company in tas_master
  let companyRow: mysql.RowDataPacket | undefined;
  try {
    const rows = await masterQuery<mysql.RowDataPacket[]>(
      'SELECT company_code, db_name, db_user, db_pass FROM companies WHERE company_code = ?',
      [code]
    );
    companyRow = rows[0];
  } catch {
    return NextResponse.json({ error: 'Failed to look up company' }, { status: 500 });
  }

  if (!companyRow) {
    return NextResponse.json({ error: 'Company not found' }, { status: 404 });
  }

  const dbConfig = {
    db_name: companyRow.db_name as string,
    db_user: companyRow.db_user as string,
    db_pass: companyRow.db_pass as string,
  };

  // Check if company already has data (refuse to re-import)
  try {
    const rows = await companyQuery<mysql.RowDataPacket[]>(
      dbConfig,
      'SELECT COUNT(*) AS cnt FROM company_settings'
    );
    if ((rows[0]?.cnt ?? 0) > 0) {
      const summary: ImportSummary = {
        success: false,
        results: [],
        totalInserted: 0,
        totalSkipped: 0,
        totalErrors: 0,
        refused: 'This company already has data. Import is only allowed on empty databases.',
      };
      return NextResponse.json(summary, { status: 409 });
    }
  } catch {
    // Table may not exist yet — proceed
  }

  // Parse multipart form data
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Failed to parse form data' }, { status: 400 });
  }

  const file = formData.get('file') as File | null;
  if (!file) {
    return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
  }

  if (!file.name.toLowerCase().endsWith('.zip')) {
    return NextResponse.json({ error: 'File must be a ZIP archive' }, { status: 400 });
  }

  // Read ZIP
  const arrayBuffer = await file.arrayBuffer();
  const zipBuffer = Buffer.from(arrayBuffer);

  let zip: AdmZip;
  try {
    zip = new AdmZip(zipBuffer);
  } catch {
    return NextResponse.json({ error: 'Invalid or corrupted ZIP file' }, { status: 400 });
  }

  const entries = zip.getEntries();
  const summary: ImportSummary = {
    success: true,
    results: [],
    totalInserted: 0,
    totalSkipped: 0,
    totalErrors: 0,
  };

  // Process each supported file type
  const supported = ['.tsf', '.emp', '.dat', '.hld', '.tor'];

  for (const entry of entries) {
    if (entry.isDirectory) continue;
    const name = entry.name.toLowerCase();
    const ext = name.slice(name.lastIndexOf('.'));
    if (!supported.includes(ext)) continue;

    const result: ImportResult = { file: entry.name, records: {} };
    const buf = entry.getData();

    try {
      if (ext === '.tsf') {
        const parsed = parseTSF(buf);
        await insertTSF(dbConfig, parsed, result);
      } else if (ext === '.emp') {
        const parsed = parseEMP(buf);
        await insertEMP(dbConfig, parsed, result);
      } else if (ext === '.dat') {
        const records = parseDAT(buf);
        await insertDAT(dbConfig, records, result);
      } else if (ext === '.hld') {
        const records = parseHLD(buf);
        await insertHLD(dbConfig, records, result);
      } else if (ext === '.tor') {
        const records = parseTOR(buf);
        await insertTOR(dbConfig, records, result);
      }
    } catch (e: unknown) {
      result.error = e instanceof Error ? e.message : String(e);
      summary.success = false;
    }

    summary.results.push(result);

    // Accumulate totals
    for (const stat of Object.values(result.records)) {
      summary.totalInserted += stat.inserted;
      summary.totalSkipped += stat.skipped;
      summary.totalErrors += stat.errors.length;
    }
  }

  if (summary.results.length === 0) {
    return NextResponse.json({
      ...summary,
      success: false,
      refused: 'No supported files found in ZIP (.tsf, .emp, .dat, .hld, .tor)',
    }, { status: 400 });
  }

  if (summary.totalErrors > 0) summary.success = false;

  return NextResponse.json(summary);
}
