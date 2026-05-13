// app/api/skill-needs/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getDbConfig } from '@/lib/query';
import { companyQuery } from '@/lib/db/company';
import mysql from 'mysql2/promise';

// POST — add a new skill need record
export async function POST(req: NextRequest) {
  const config = await getDbConfig(req);
  if (!config) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();

    // Can add multiple days at once (mirrors multi-select in desktop)
    const days: number[] = Array.isArray(body.days) ? body.days : [body.day];

    const inserted: number[] = [];
    for (const day of days) {
      const [result] = await companyQuery<mysql.ResultSetHeader[]>(
        config,
        `INSERT INTO skill_needs
           (skill_id, day, number, start_hour, start_minute, stop_hour, stop_minute)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          body.skill_id,
          day,
          body.number      ?? 1,
          body.start_hour  ?? 0,
          body.start_minute ?? 0,
          body.stop_hour   ?? 0,
          body.stop_minute ?? 0,
        ]
      ) as unknown as [mysql.ResultSetHeader];
      inserted.push((result as unknown as mysql.ResultSetHeader).insertId);
    }

    return NextResponse.json({ success: true, ids: inserted });
  } catch (err) {
    console.error('POST skill-need error:', err);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}

// DELETE — remove a single skill need by id
export async function DELETE(req: NextRequest) {
  const config = await getDbConfig(req);
  if (!config) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { id } = await req.json();
    await companyQuery(config, 'DELETE FROM skill_needs WHERE id = ?', [id]);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE skill-need error:', err);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}
