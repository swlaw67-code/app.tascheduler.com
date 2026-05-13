// lib/types.ts
// TypeScript interfaces — mirrors both the MariaDB schema and original C++ structs

// ─── Master DB ───────────────────────────────────────────────────────────────

export interface CompanyRecord {
  id: number;
  company_code: string;
  password_hash: string;
  db_name: string;
  db_user: string;
  db_pass: string;
  expired: boolean;
  created_at: Date;
  last_login: Date | null;
}

// ─── Session / Auth ───────────────────────────────────────────────────────────

export interface SessionPayload {
  company_code: string;
  db_name: string;
  db_user: string;
  db_pass: string;
  iat?: number;
  exp?: number;
}

export interface AdminSessionPayload {
  role: 'admin';
  iat?: number;
  exp?: number;
}

// ─── Company ──────────────────────────────────────────────────────────────────

export interface Company {
  id: number;
  version: string | null;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  email: string | null;
  phone: string | null;
  fax: string | null;
  schedule_start_day: number;  // 0=Sun, 1=Mon, etc.
  max_seats: number;
  first_shift: string | null;
  second_shift: string | null;
  third_shift: string | null;
  shift_color_1: number;       // COLORREF as integer
  shift_color_2: number;
  shift_color_3: number;
  shift_values: Buffer | null; // 96-byte binary
  min_hours: number;
  autofill_breaks: boolean;
  company_not_247: boolean;
  created_at: Date;
  updated_at: Date;
}

// ─── Company Settings (registry → DB) ────────────────────────────────────────

export interface CompanySettings {
  id: number;
  switch_source: SwitchSource;
  erlang_c: boolean;
  ignore_days: boolean;
  call_length: number;         // 1–180 minutes
  holiday_years: number;       // 0–50
  mtf_schedule_rule: string;
  employee_min_hours: boolean;
  reverse_data: boolean;
  show_totals: boolean;
  schedule_30: boolean;        // 30-min schedule increments
  highest_skill: boolean;
  weekend: boolean;
  use_weekend: boolean;
  weekend_count: number;       // 0–6
  skill_breaks: boolean;
  show_weekly: boolean;
  show_cost: boolean;
  black_ink: boolean;
  military_time: boolean;
  employee_sort: boolean;
  disable_caching: boolean;
  special_color: number;       // COLORREF
  moving_color: number;
  actual_color: number;
  chart_line_color: number;
  chart_fill_color: number;
  schedule_line_color: number;
}

export type SwitchSource =
  | 'Telescan'
  | 'Infinity'
  | 'Pinnacle'
  | 'Szeto'
  | 'SzetoII'
  | 'SoftSwitch'
  | 'Softswitch2'
  | 'Genesis';

export const SWITCH_SOURCES: SwitchSource[] = [
  'Telescan', 'Infinity', 'Pinnacle', 'Szeto', 'SzetoII',
  'SoftSwitch', 'Softswitch2', 'Genesis',
];

// ─── Switch Import Options ────────────────────────────────────────────────────

export interface SwitchImportOptions {
  id: number;
  switch_name: string;
  inbound: boolean;
  outbound: boolean;
  conf_setup: boolean;
  agent_conf: boolean;
  wrap: boolean;
  admin: boolean;
  hold: boolean;
  queue: boolean;
  hold_sec: number;   // 0–600
  queue_sec: number;  // 0–600
}

// ─── Email Server ─────────────────────────────────────────────────────────────

export interface EmailServer {
  id: number;
  sender: string | null;
  sender_email: string | null;
  server: string | null;
  port: number;
  user: string | null;
  password: string | null;
  encrypt: EncryptType;
}

export enum EncryptType {
  None = 0,
  TLS  = 1,
  SSL  = 2,
}

// ─── Skills ───────────────────────────────────────────────────────────────────

export interface Skill {
  id: number;
  name: string;
  color: number;          // COLORREF as integer
  poi: number;
  op_perc_1: number;
  op_perc_2: number;
  op_perc_3: number;
  op_perc_4: number;
  min_per_shift_1: number;
  min_per_shift_2: number;
  min_per_shift_3: number;
  is_default: boolean;
  higher: boolean;
  multiple: boolean;
  multiple_number: number;
  need: boolean;
  exclude: boolean;
  exclude_hours: boolean;
  deleted: boolean;
  code: number;
  sort_order: number;
  created_at: Date;
}

// ─── Breaks ───────────────────────────────────────────────────────────────────

export interface Break {
  id: number;
  name: string;
  minutes: number;
  hours: number;
  minimum_hour: number;
  minimum_minute: number;
  maximum_hour: number;
  maximum_minute: number;
  paid: boolean;
  auto_fill: boolean;
  color: number;         // COLORREF
  deleted: boolean;
  sort_order: number;
  created_at: Date;
}

// ─── Positions ────────────────────────────────────────────────────────────────

export interface Position {
  id: number;
  name: string;
  start_hour: number;
  start_minute: number;
  end_hour: number;
  end_minute: number;
  created_at: Date;
}

// ─── Special Days ─────────────────────────────────────────────────────────────

export interface SpecialDay {
  id: number;
  date: string;         // ISO date string YYYY-MM-DD
  name: string;
  created_at: Date;
}

// ─── Employees ────────────────────────────────────────────────────────────────

export interface Employee {
  id: number;
  skill_id: number;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  email: string | null;      // May contain semicolon-separated addresses
  phone: string | null;
  min_hours: number;
  max_hours: number;
  split_shift: boolean;
  skill_level: number;
  poor_performance: boolean;
  inactive: boolean;
  pay_rate: number;
  pay_cycle: number;
  overtime: boolean;
  min_hours_day: number;
  max_hours_day: number;
  max_days_week: number;
  mtf_employee_id: string | null;
  sort_num: number;
  preference: number;
  timezone: number;
  max_days_row: number;
  hire_date: string | null;   // ISO date
  two_days_off: boolean;
  use_weekend_rule: boolean;
  saturday_date: string | null;
  deleted: boolean;
  use_special: boolean;
  portal_active: boolean;
  password_hash: string | null;
  created_at: Date;
  updated_at: Date;
}

// Helper: get primary email (first before semicolon)
export function getPrimaryEmail(email: string | null): string | null {
  if (!email) return null;
  return email.split(';')[0].trim() || null;
}

export interface EmployeeSkill {
  id: number;
  employee_id: number;
  skill_id: number;
}

export interface EmployeeAvailability {
  id: number;
  employee_id: number;
  day: number;           // 0=Sun through 6=Sat
  start_hour: number;
  start_minute: number;
  stop_hour: number;
  stop_minute: number;
  special: boolean;
}

// ─── Skill Needs ─────────────────────────────────────────────────────────────

export interface SkillNeed {
  id: number;
  skill_id: number;
  day: number;
  number: number;
  start_hour: number;
  start_minute: number;
  stop_hour: number;
  stop_minute: number;
}

// ─── Fixed Shifts ─────────────────────────────────────────────────────────────

export interface FixedShift {
  id: number;
  length: number;         // hours as float
  standard: boolean;
  created_at: Date;
  breaks?: FixedShiftBreak[];
}

export interface FixedShiftBreak {
  id: number;
  fixed_shift_id: number;
  break_id: number;
  total: number;
}

export interface EmployeeFixedShift {
  id: number;
  employee_id: number;
  fixed_shift_id: number;
}

// ─── Exclude Ranges ───────────────────────────────────────────────────────────

export interface ExcludeRange {
  id: number;
  start_datetime: bigint;
  end_datetime: bigint;
}

// ─── Forecasts ────────────────────────────────────────────────────────────────

export interface Forecast {
  id: number;
  week_date: string;        // ISO date of week start
  test_number: number;
  efficiency: number;       // percent 0–100+
  weeks: number;
  erlang_c: boolean;
  service_level: number;    // percent e.g. 80
  target_answer_time: number; // seconds e.g. 20
  published: boolean;
  archived: boolean;
  created_at: Date;
}

export interface ForecastDataPoint {
  id: number;
  forecast_id: number;
  day: number;              // 0–6
  hour: number;             // 0–23
  quarter: number;          // 0–3 (15-min increments)
  operators: string | null;
  ave_calls: number;
  ave_talk_time: number;
  ave_calls_adj: number;
  ave_talk_time_adj: number;
  ave_agent_adj: number;
}

// Full 7-day forecast grid: [day][hour][quarter]
export type ForecastGrid = ForecastDataPoint[][][];

// ─── Call Data ────────────────────────────────────────────────────────────────

export interface CallDataPoint {
  id: number;
  date: string;             // ISO date
  hour: number;
  quarter: number;
  calls: number;
  talk_time: number;
}

// ─── Schedules ────────────────────────────────────────────────────────────────

export interface Schedule {
  id: number;
  week_date: string;
  test_number: number;
  forecast_id: number | null;
  previous_schedule_id: number | null;
  published: boolean;
  archived: boolean;
  created_at: Date;
}

export interface Shift {
  id: number;
  schedule_id: number;
  employee_id: number;
  skill_id: number;
  day: number;             // 0–6
  start_hour: number;
  start_minute: number;
  stop_hour: number;
  stop_minute: number;
  next_day: boolean;       // shift ends after midnight
}

export interface ShiftBreak {
  id: number;
  shift_id: number;
  schedule_id: number;
  break_id: number;
  start_hour: number;
  start_minute: number;
}

// Combined shift with its breaks for the schedule grid
export interface ShiftWithBreaks extends Shift {
  breaks: ShiftBreak[];
  employee_name?: string;
  skill_name?: string;
  skill_color?: number;
}

// ─── Templates ────────────────────────────────────────────────────────────────

export interface Template {
  id: number;
  name: string;
  created_at: Date;
  archived: boolean;
}

export interface TemplateShift {
  id: number;
  template_id: number;
  employee_id: number;
  skill_id: number;
  day: number;
  start_hour: number;
  start_minute: number;
  stop_hour: number;
  stop_minute: number;
  next_day: boolean;
}

export interface TemplateShiftBreak {
  id: number;
  template_shift_id: number;
  template_id: number;
  break_id: number;
  start_hour: number;
  start_minute: number;
}

// ─── Time Off Requests ────────────────────────────────────────────────────────

export interface TimeOffRequest {
  id: number;
  employee_id: number;
  date_submitted: string | null;
  date_requested: string;
  end_date_requested: string | null;
  reason: string | null;
  all_day: boolean;
  start_hour: number;
  start_minute: number;
  end_hour: number;
  end_minute: number;
  approved: TORStatus;
  online_status: number;
  created_at: Date;
  // Joined fields
  employee_name?: string;
}

export enum TORStatus {
  Pending  = 0,
  Approved = 1,
  Denied   = 2,
}

// ─── Notes ────────────────────────────────────────────────────────────────────

export interface Note {
  id: number;
  schedule_id: number;
  note_text: string | null;
  created_at: Date;
}

export interface IndividualNote {
  id: number;
  schedule_id: number;
  employee_id: number;
  note_text: string | null;
  created_at: Date;
}

// ─── Time utilities ───────────────────────────────────────────────────────────

export interface TimeRec {
  hour: number;
  minute: number;
}

export function formatTime(hour: number, minute: number, military: boolean): string {
  if (military) {
    return `${String(hour).padStart(2, '0')}${String(minute).padStart(2, '0')}`;
  }
  const h = hour % 12 || 12;
  const m = String(minute).padStart(2, '0');
  const ampm = hour < 12 ? 'am' : 'pm';
  return `${h}:${m}${ampm}`;
}

export function timeToMinutes(hour: number, minute: number): number {
  return hour * 60 + minute;
}

export function minutesToTime(minutes: number): TimeRec {
  return { hour: Math.floor(minutes / 60), minute: minutes % 60 };
}

export function getShiftDurationHours(
  startHour: number, startMin: number,
  stopHour: number,  stopMin: number,
  nextDay: boolean
): number {
  let start = startHour * 60 + startMin;
  let stop  = stopHour  * 60 + stopMin;
  if (nextDay || stop <= start) stop += 24 * 60;
  return (stop - start) / 60;
}

// Convert Windows COLORREF integer to CSS hex string
export function colorRefToHex(colorRef: number): string {
  const r = colorRef & 0xff;
  const g = (colorRef >> 8) & 0xff;
  const b = (colorRef >> 16) & 0xff;
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

// Convert CSS hex string to Windows COLORREF integer
export function hexToColorRef(hex: string): number {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return r | (g << 8) | (b << 16);
}

// Day name helpers
export const DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
export const DAY_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

export function getWeekDates(weekDate: string, startDay: number = 0): string[] {
  const base = new Date(weekDate + 'T00:00:00');
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(base);
    d.setDate(base.getDate() + ((i + startDay) % 7));
    return d.toISOString().split('T')[0];
  });
}
