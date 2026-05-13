// app/api/breaks/[id]/route.ts
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
      const used = await companyQuery<mysql.RowDataPacket[]>(
        config, 'SELECT COUNT(*) AS cnt FROM shift_breaks WHERE break_id = ?', [id]
      );
      if ((used[0]?.cnt ?? 0) > 0) {
        return NextResponse.json(
          { error: 'Cannot delete — this break is used in existing schedules.' },
          { status: 409 }
        );
      }
      await companyQuery(config, 'UPDATE breaks SET deleted = 1 WHERE id = ?', [id]);
      return NextResponse.json({ success: true });
    }

    // UPDATE
    if (!body.name?.trim()) {
      return NextResponse.json({ error: 'Break name is required.' }, { status: 400 });
    }
    await companyQuery(config,
      `UPDATE breaks SET name=?, minutes=?, hours=?, paid=?, auto_fill=?, color=?,
        minimum_hour=?, minimum_minute=?, maximum_hour=?, maximum_minute=?
       WHERE id=? AND deleted=0`,
      [
        body.name.trim(), body.minutes ?? 0, body.hours ?? 0,
        body.paid ? 1 : 0, body.auto_fill ? 1 : 0, body.color ?? 0,
        body.minimum_hour ?? 0, body.minimum_minute ?? 0,
        body.maximum_hour ?? 0, body.maximum_minute ?? 0,
        id,
      ]
    );
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('breaks/[id] error:', err);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}
