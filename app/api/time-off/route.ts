// app/api/time-off/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getDbConfig } from '@/lib/query';
import { companyQuery } from '@/lib/db/company';
import mysql from 'mysql2/promise';

// GET — list time-off requests with optional filter
export async function GET(req: NextRequest) {
  const config = await getDbConfig(req);
  if (!config) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const url      = new URL(req.url);
    const status   = url.searchParams.get('status');   // 0=pending, 1=approved, 2=denied, null=all
    const empId    = url.searchParams.get('employee_id');
    const fromDate = url.searchParams.get('from');
    const toDate   = url.searchParams.get('to');

    let sql = `
      SELECT
        t.id, t.employee_id, t.date_submitted, t.date_requested,
        t.end_date_requested, t.reason, t.all_day,
        t.start_hour, t.start_minute, t.end_hour, t.end_minute,
        t.approved, t.online_status, t.created_at,
        e.name AS employee_name
      FROM time_off_requests t
      LEFT JOIN employees e ON e.id = t.employee_id
      WHERE e.deleted = 0
    `;
    const params: unknown[] = [];

    if (status !== null && status !== '') {
      sql += ' AND t.approved = ?'; params.push(+status);
    }
    if (empId) {
      sql += ' AND t.employee_id = ?'; params.push(+empId);
    }
    if (fromDate) {
      sql += ' AND t.date_requested >= ?'; params.push(fromDate);
    }
    if (toDate) {
      sql += ' AND t.date_requested <= ?'; params.push(toDate);
    }

    sql += ' ORDER BY t.date_requested DESC, t.created_at DESC';

    const rows = await companyQuery<mysql.RowDataPacket[]>(config, sql, params);
    return NextResponse.json({ requests: rows });
  } catch (err) {
    console.error('GET time-off error:', err);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}

// POST — create a new TOR
export async function POST(req: NextRequest) {
  const config = await getDbConfig(req);
  if (!config) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();

    if (!body.employee_id) {
      return NextResponse.json({ error: 'Employee is required.' }, { status: 400 });
    }
    if (!body.date_requested) {
      return NextResponse.json({ error: 'Date requested is required.' }, { status: 400 });
    }

    const today = new Date().toISOString().split('T')[0];

    const [result] = await companyQuery<mysql.ResultSetHeader[]>(
      config,
      `INSERT INTO time_off_requests (
        employee_id, date_submitted, date_requested, end_date_requested,
        reason, all_day, start_hour, start_minute, end_hour, end_minute,
        approved, online_status
      ) VALUES (?,?,?,?,?,?,?,?,?,?,0,0)`,
      [
        body.employee_id,
        today,
        body.date_requested,
        body.end_date_requested  || null,
        body.reason?.trim()      || null,
        body.all_day             ? 1 : 0,
        body.all_day ? 0 : (body.start_hour   ?? 0),
        body.all_day ? 0 : (body.start_minute ?? 0),
        body.all_day ? 0 : (body.end_hour     ?? 0),
        body.all_day ? 0 : (body.end_minute   ?? 0),
      ]
    ) as unknown as [mysql.ResultSetHeader];

    return NextResponse.json({
      success: true,
      id: (result as unknown as mysql.ResultSetHeader).insertId
    });
  } catch (err) {
    console.error('POST time-off error:', err);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}
