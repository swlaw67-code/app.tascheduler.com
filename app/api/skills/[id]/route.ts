// app/api/skills/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getDbConfig } from '@/lib/query';
import { companyQuery } from '@/lib/db/company';
import mysql from 'mysql2/promise';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const config = await getDbConfig(req);
  if (!config) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const id   = parseInt(params.id, 10);
    const body = await req.json();

    if (body._method === 'DELETE') {
      const empRows = await companyQuery<mysql.RowDataPacket[]>(
        config,
        'SELECT COUNT(*) AS cnt FROM employees WHERE skill_id = ? AND deleted = 0',
        [id]
      );
      if ((empRows[0]?.cnt ?? 0) > 0) {
        return NextResponse.json(
          { error: 'Cannot delete — employees are assigned to this skill.' },
          { status: 409 }
        );
      }
      await companyQuery(config, 'UPDATE skills SET deleted = 1 WHERE id = ?', [id]);
      return NextResponse.json({ success: true });
    }

    // UPDATE
    if (!body.name?.trim()) {
      return NextResponse.json({ error: 'Skill name is required.' }, { status: 400 });
    }
    const existing = await companyQuery<mysql.RowDataPacket[]>(
      config,
      'SELECT id FROM skills WHERE name = ? AND deleted = 0 AND id != ? LIMIT 1',
      [body.name.trim(), id]
    );
    if (existing.length > 0) {
      return NextResponse.json({ error: 'A skill with that name already exists.' }, { status: 409 });
    }
    await companyQuery(config,
      `UPDATE skills SET
        name=?, color=?, code=?, is_default=?, poi=?,
        op_perc_1=?, op_perc_2=?, op_perc_3=?, op_perc_4=?,
        min_per_shift_1=?, min_per_shift_2=?, min_per_shift_3=?,
        exclude=?, exclude_hours=?, need=?, higher=?, multiple=?, multiple_number=?
       WHERE id=? AND deleted=0`,
      [
        body.name.trim(), body.color ?? 0, body.code ?? 0,
        body.is_default ? 1 : 0, body.poi ?? 0,
        body.op_perc_1 ?? 100, body.op_perc_2 ?? 100,
        body.op_perc_3 ?? 100, body.op_perc_4 ?? 100,
        body.min_per_shift_1 ?? 0, body.min_per_shift_2 ?? 0, body.min_per_shift_3 ?? 0,
        body.exclude ? 1 : 0, body.exclude_hours ? 1 : 0, body.need ? 1 : 0,
        body.higher ? 1 : 0, body.multiple ? 1 : 0, body.multiple_number ?? 0,
        id,
      ]
    );
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('skills/[id] error:', err);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}
