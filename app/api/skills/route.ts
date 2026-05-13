// app/api/skills/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getDbConfig } from '@/lib/query';
import { companyQuery } from '@/lib/db/company';
import mysql from 'mysql2/promise';

// GET — list all active skills ordered by sort_order (POI)
export async function GET(req: NextRequest) {
  const config = await getDbConfig(req);
  if (!config) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const rows = await companyQuery<mysql.RowDataPacket[]>(
      config,
      `SELECT id, name, color, code, is_default, poi, deleted,
              op_perc_1, op_perc_2, op_perc_3, op_perc_4,
              min_per_shift_1, min_per_shift_2, min_per_shift_3,
              exclude, exclude_hours, need, higher,
              multiple, multiple_number, sort_order
       FROM skills
       WHERE deleted = 0
       ORDER BY sort_order ASC, name ASC`
    );
    return NextResponse.json({ skills: rows });
  } catch (err) {
    console.error('GET skills error:', err);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}

// POST — create a new skill
export async function POST(req: NextRequest) {
  const config = await getDbConfig(req);
  if (!config) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();

    if (!body.name?.trim()) {
      return NextResponse.json({ error: 'Skill name is required.' }, { status: 400 });
    }

    // Check duplicate name
    const existing = await companyQuery<mysql.RowDataPacket[]>(
      config,
      'SELECT id FROM skills WHERE name = ? AND deleted = 0 LIMIT 1',
      [body.name.trim()]
    );
    if (existing.length > 0) {
      return NextResponse.json({ error: 'A skill with that name already exists.' }, { status: 409 });
    }

    // Get next sort order
    const maxRows = await companyQuery<mysql.RowDataPacket[]>(
      config,
      'SELECT COALESCE(MAX(sort_order), 0) AS max_sort FROM skills WHERE deleted = 0'
    );
    const nextSort = (maxRows[0]?.max_sort ?? 0) + 1;

    // Insert without ResultSetHeader casting — avoids 500 error
    await companyQuery<mysql.RowDataPacket[]>(
      config,
      `INSERT INTO skills (
        name, color, code, is_default, poi,
        op_perc_1, op_perc_2, op_perc_3, op_perc_4,
        min_per_shift_1, min_per_shift_2, min_per_shift_3,
        exclude, exclude_hours, need, higher,
        multiple, multiple_number, deleted, sort_order
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?)`,
      [
        body.name.trim(),
        body.color           ?? 0,
        body.code            ?? 0,
        body.is_default      ? 1 : 0,
        nextSort,
        body.op_perc_1       ?? 100,
        body.op_perc_2       ?? 100,
        body.op_perc_3       ?? 100,
        body.op_perc_4       ?? 100,
        body.min_per_shift_1 ?? 0,
        body.min_per_shift_2 ?? 0,
        body.min_per_shift_3 ?? 0,
        body.exclude         ? 1 : 0,
        body.exclude_hours   ? 1 : 0,
        body.need            ? 1 : 0,
        body.higher          ? 1 : 0,
        body.multiple        ? 1 : 0,
        body.multiple_number ?? 0,
        nextSort,
      ]
    );

    // Fetch the new skill's id by name since we can't get insertId
    const newSkill = await companyQuery<mysql.RowDataPacket[]>(
      config,
      'SELECT id FROM skills WHERE name = ? AND deleted = 0 ORDER BY id DESC LIMIT 1',
      [body.name.trim()]
    );

    return NextResponse.json({ success: true, id: newSkill[0]?.id ?? 0 });
  } catch (err) {
    console.error('POST skill error:', err);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}
