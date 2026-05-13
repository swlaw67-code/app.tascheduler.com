// app/api/call-data/grid/route.ts
// Returns call data for the grid — now one row per date with pre-parsed JSON arrays.
// With JSON storage, the entire dataset is ~100-200 rows instead of 56,000+.

import { NextRequest, NextResponse } from 'next/server';
import { getDbConfig } from '@/lib/query';
import { companyQuery } from '@/lib/db/company';
import mysql from 'mysql2/promise';

export async function GET(req: NextRequest) {
  const config = await getDbConfig(req);
  if (!config) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const url       = new URL(req.url);
    const fromDate  = url.searchParams.get('from');
    const toDate    = url.searchParams.get('to');
    const daysParam = url.searchParams.get('days'); // comma-separated 0-6 (Sun=0)

    // Single query — all dates, one row each
    let sql = 'SELECT date, calls, talk_time FROM call_data WHERE 1=1';
    const params: unknown[] = [];
    if (fromDate) { sql += ' AND date >= ?'; params.push(fromDate); }
    if (toDate)   { sql += ' AND date <= ?'; params.push(toDate); }
    sql += ' ORDER BY date ASC';

    const rows = await companyQuery<mysql.RowDataPacket[]>(config, sql, params);

    // Parse JSON and optionally filter by day-of-week
    const allowedDays = daysParam
      ? new Set(daysParam.split(',').map(Number))
      : null;

    const grid = rows
      .filter(row => {
        if (!allowedDays) return true;
        // MariaDB DATE columns arrive as JS Date objects — convert to string first
        const dateStr = row.date instanceof Date
          ? row.date.toISOString().slice(0, 10)
          : String(row.date).slice(0, 10);
        const d = new Date(dateStr + 'T12:00:00');
        return allowedDays.has(d.getDay());
      })
      .map(row => {
        const dateStr = row.date instanceof Date
          ? row.date.toISOString().slice(0, 10)
          : String(row.date).slice(0, 10);
        return {
          date:      dateStr,
          calls:     JSON.parse(row.calls     as string) as number[],
          talk_time: JSON.parse(row.talk_time as string) as number[],
        };
      });

    // Get company shift_values
    const companyRows = await companyQuery<mysql.RowDataPacket[]>(
      config,
      'SELECT HEX(shift_values) AS shift_values_hex, first_shift, second_shift, third_shift FROM company LIMIT 1'
    );
    const shiftValuesHex = companyRows[0]?.shift_values_hex as string ?? null;
    let shiftValues: number[] = new Array(96).fill(0);
    if (shiftValuesHex && shiftValuesHex.length === 192) {
      for (let i = 0; i < 96; i++) {
        shiftValues[i] = parseInt(shiftValuesHex.slice(i * 2, i * 2 + 2), 16);
      }
    }

    // Special days
    const specialRows = await companyQuery<mysql.RowDataPacket[]>(
      config, 'SELECT date FROM special_days ORDER BY date'
    );
    const specialDays = specialRows.map(r => r.date as string);

    // Settings
    const settingsRows = await companyQuery<mysql.RowDataPacket[]>(
      config, 'SELECT reverse_data, special_color FROM company_settings LIMIT 1'
    );
    const reverseData  = Boolean(settingsRows[0]?.reverse_data);
    const specialColor = Number(settingsRows[0]?.special_color ?? 65535);

    // All available dates for filter dropdowns
    const allDatesRows = await companyQuery<mysql.RowDataPacket[]>(
      config, 'SELECT date FROM call_data ORDER BY date ASC'
    );
    const allDates = allDatesRows.map(r =>
      r.date instanceof Date ? r.date.toISOString().slice(0, 10) : String(r.date).slice(0, 10)
    );

    return NextResponse.json({
      grid,
      shiftValues,
      shiftNames: [
        companyRows[0]?.first_shift  as string ?? '1st Shift',
        companyRows[0]?.second_shift as string ?? '2nd Shift',
        companyRows[0]?.third_shift  as string ?? '3rd Shift',
      ],
      specialDays,
      reverseData,
      specialColor,
      allDates,
    }, { headers: { 'Cache-Control': 'no-store' } });

  } catch (err) {
    console.error('GET call-data/grid error:', err);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}
