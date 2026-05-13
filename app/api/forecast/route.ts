// app/api/forecast/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getDbConfig } from '@/lib/query';
import { companyQuery } from '@/lib/db/company';
import mysql from 'mysql2/promise';

// GET — list all forecasts (not archived by default)
export async function GET(req: NextRequest) {
  const config = await getDbConfig(req);
  if (!config) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const url       = new URL(req.url);
    const archive   = url.searchParams.get('archived') === '1';

    const rows = await companyQuery<mysql.RowDataPacket[]>(
      config,
      `SELECT id, week_date, test_number, efficiency, weeks, erlang_c,
              service_level, target_answer_time, published, archived, created_at
       FROM forecasts
       WHERE archived = ?
       ORDER BY week_date DESC, test_number DESC`,
      [archive ? 1 : 0]
    );
    return NextResponse.json({ forecasts: rows });
  } catch (err) {
    console.error('GET forecasts error:', err);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}

// POST — create a new forecast week
export async function POST(req: NextRequest) {
  const config = await getDbConfig(req);
  if (!config) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();

    if (!body.week_date) {
      return NextResponse.json({ error: 'Week date is required.' }, { status: 400 });
    }

    // Get next test number for this week
    const existing = await companyQuery<mysql.RowDataPacket[]>(
      config,
      `SELECT COALESCE(MAX(test_number), 0) AS max_test
       FROM forecasts WHERE week_date = ? AND archived = 0`,
      [body.week_date]
    );
    const testNumber = (existing[0]?.max_test ?? 0) + 1;

    const [result] = await companyQuery<mysql.ResultSetHeader[]>(
      config,
      `INSERT INTO forecasts (
        week_date, test_number, efficiency, weeks, erlang_c,
        service_level, target_answer_time, published, archived
      ) VALUES (?,?,?,?,?,?,?,0,0)`,
      [
        body.week_date,
        testNumber,
        body.efficiency         ?? 100,
        body.weeks              ?? 1,
        body.erlang_c           ? 1 : 0,
        body.service_level      ?? 80,
        body.target_answer_time ?? 20,
      ]
    ) as unknown as [mysql.ResultSetHeader];

    const newId = (result as unknown as mysql.ResultSetHeader).insertId;

    // If copying from another forecast, copy its data slots
    if (body.copy_from_id) {
      const srcSlots = await companyQuery<mysql.RowDataPacket[]>(
        config,
        'SELECT * FROM forecast_data WHERE forecast_id = ?',
        [body.copy_from_id]
      );
      for (const slot of srcSlots) {
        await companyQuery(config,
          `INSERT INTO forecast_data
             (forecast_id, day, hour, quarter, operators,
              ave_calls, ave_talk_time, ave_calls_adj, ave_talk_time_adj, ave_agent_adj)
           VALUES (?,?,?,?,?,?,?,0,0,0)`,
          [newId, slot.day, slot.hour, slot.quarter, slot.operators,
           slot.ave_calls, slot.ave_talk_time]
        );
      }
    }

    return NextResponse.json({ success: true, id: newId, test_number: testNumber });
  } catch (err) {
    console.error('POST forecast error:', err);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}
