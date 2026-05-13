// app/api/settings/route.ts
// GET/POST company_settings (single row, id=1)
import { NextRequest, NextResponse } from 'next/server';
import { getDbConfig } from '@/lib/query';
import { companyQuery } from '@/lib/db/company';
import mysql from 'mysql2/promise';

export async function GET(req: NextRequest) {
  const config = await getDbConfig(req);
  if (!config) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const rows = await companyQuery<mysql.RowDataPacket[]>(
      config, 'SELECT * FROM company_settings WHERE id = 1 LIMIT 1'
    );
    return NextResponse.json({ settings: rows[0] ?? null }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('GET settings error:', err);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const config = await getDbConfig(req);
  if (!config) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await req.json();
    await companyQuery(config,
      `INSERT INTO company_settings
        (id, switch_source, erlang_c, ignore_days, call_length, holiday_years,
         mtf_schedule_rule, employee_min_hours, reverse_data, show_totals, schedule_30,
         highest_skill, weekend, use_weekend, weekend_count, skill_breaks, show_weekly,
         show_cost, black_ink, military_time, employee_sort, disable_caching,
         special_color, moving_color, actual_color, chart_line_color, chart_fill_color,
         schedule_line_color)
       VALUES (1,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE
        switch_source       = VALUES(switch_source),
        erlang_c            = VALUES(erlang_c),
        ignore_days         = VALUES(ignore_days),
        call_length         = VALUES(call_length),
        holiday_years       = VALUES(holiday_years),
        mtf_schedule_rule   = VALUES(mtf_schedule_rule),
        employee_min_hours  = VALUES(employee_min_hours),
        reverse_data        = VALUES(reverse_data),
        show_totals         = VALUES(show_totals),
        schedule_30         = VALUES(schedule_30),
        highest_skill       = VALUES(highest_skill),
        weekend             = VALUES(weekend),
        use_weekend         = VALUES(use_weekend),
        weekend_count       = VALUES(weekend_count),
        skill_breaks        = VALUES(skill_breaks),
        show_weekly         = VALUES(show_weekly),
        show_cost           = VALUES(show_cost),
        black_ink           = VALUES(black_ink),
        military_time       = VALUES(military_time),
        employee_sort       = VALUES(employee_sort),
        disable_caching     = VALUES(disable_caching),
        special_color       = VALUES(special_color),
        moving_color        = VALUES(moving_color),
        actual_color        = VALUES(actual_color),
        chart_line_color    = VALUES(chart_line_color),
        chart_fill_color    = VALUES(chart_fill_color),
        schedule_line_color = VALUES(schedule_line_color)`,
      [
        body.switch_source       ?? 'Telescan',
        body.erlang_c            ? 1 : 0,
        body.ignore_days         ? 1 : 0,
        Math.min(180, Math.max(1, parseInt(body.call_length) || 5)),
        Math.min(50,  Math.max(0, parseInt(body.holiday_years) || 1)),
        body.mtf_schedule_rule   ?? 'TASScheduler',
        body.employee_min_hours  ? 1 : 0,
        body.reverse_data        ? 1 : 0,
        body.show_totals         ? 1 : 0,
        body.schedule_30         ? 1 : 0,
        body.highest_skill       ? 1 : 0,
        body.weekend             ? 1 : 0,
        body.use_weekend         ? 1 : 0,
        Math.min(6, Math.max(0, parseInt(body.weekend_count) || 0)),
        body.skill_breaks        ? 1 : 0,
        body.show_weekly         ? 1 : 0,
        body.show_cost           ? 1 : 0,
        body.black_ink           ? 1 : 0,
        body.military_time       ? 1 : 0,
        body.employee_sort       ? 1 : 0,
        body.disable_caching     ? 1 : 0,
        body.special_color       ?? 65535,
        body.moving_color        ?? 65280,
        body.actual_color        ?? 16744448,
        body.chart_line_color    ?? 32768,
        body.chart_fill_color    ?? 65535,
        body.schedule_line_color ?? 32768,
      ]
    );
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('POST settings error:', err);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}
