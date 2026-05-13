// app/api/positions/route.ts
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
      `SELECT id, name, start_hour, start_minute, end_hour, end_minute
       FROM positions ORDER BY start_hour ASC, start_minute ASC, name ASC`
    );
    return NextResponse.json({ positions: rows });
  } catch (err) {
    console.error('GET positions error:', err);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const config = await getDbConfig(req);
  if (!config) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    if (!body.name?.trim()) {
      return NextResponse.json({ error: 'Position name is required.' }, { status: 400 });
    }

    const [result] = await companyQuery<mysql.ResultSetHeader[]>(
      config,
      `INSERT INTO positions (name, start_hour, start_minute, end_hour, end_minute)
       VALUES (?, ?, ?, ?, ?)`,
      [
        body.name.trim(),
        body.start_hour   ?? 0,
        body.start_minute ?? 0,
        body.end_hour     ?? 0,
        body.end_minute   ?? 0,
      ]
    ) as unknown as [mysql.ResultSetHeader];

    return NextResponse.json({
      success: true,
      id: (result as unknown as mysql.ResultSetHeader).insertId
    });
  } catch (err) {
    console.error('POST position error:', err);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}
