// app/api/breaks/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getDbConfig } from '@/lib/query';
import { companyQuery } from '@/lib/db/company';
import mysql from 'mysql2/promise';

export async function GET(req: NextRequest) {
  const config = await getDbConfig(req);
  if (!config) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const rows = await companyQuery<mysql.RowDataPacket[]>(
      config,
      `SELECT id, name, minutes, hours, paid, auto_fill, color, deleted,
              minimum_hour, minimum_minute, maximum_hour, maximum_minute, sort_order
       FROM breaks
       WHERE deleted = 0
       ORDER BY sort_order ASC, name ASC`
    );
    return NextResponse.json({ breaks: rows });
  } catch (err) {
    console.error('GET breaks error:', err);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const config = await getDbConfig(req);
  if (!config) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();

    if (!body.name?.trim()) {
      return NextResponse.json({ error: 'Break name is required.' }, { status: 400 });
    }

    // Validate: minutes OR hours must be non-zero
    if (!body.minutes && !body.hours) {
      return NextResponse.json({ error: 'Break must have a duration (minutes or hours).' }, { status: 400 });
    }

    const maxRows = await companyQuery<mysql.RowDataPacket[]>(
      config,
      'SELECT COALESCE(MAX(sort_order), 0) AS max_sort FROM breaks WHERE deleted = 0'
    );
    const nextSort = (maxRows[0]?.max_sort ?? 0) + 1;

    const [result] = await companyQuery<mysql.ResultSetHeader[]>(
      config,
      `INSERT INTO breaks (
        name, minutes, hours, paid, auto_fill, color,
        minimum_hour, minimum_minute, maximum_hour, maximum_minute,
        deleted, sort_order
      ) VALUES (?,?,?,?,?,?,?,?,?,?,0,?)`,
      [
        body.name.trim(),
        body.minutes         ?? 0,
        body.hours           ?? 0,
        body.paid            ? 1 : 0,
        body.auto_fill       ? 1 : 0,
        body.color           ?? 0,
        body.minimum_hour    ?? 0,
        body.minimum_minute  ?? 0,
        body.maximum_hour    ?? 0,
        body.maximum_minute  ?? 0,
        nextSort,
      ]
    ) as unknown as [mysql.ResultSetHeader];

    return NextResponse.json({
      success: true,
      id: (result as unknown as mysql.ResultSetHeader).insertId
    });
  } catch (err) {
    console.error('POST break error:', err);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}
