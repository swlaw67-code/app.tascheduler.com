// app/api/time-off/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getDbConfig } from '@/lib/query';
import { companyQuery } from '@/lib/db/company';

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
      await companyQuery(config, 'DELETE FROM time_off_requests WHERE id = ?', [id]);
      return NextResponse.json({ success: true });
    }

    if (body.approved !== undefined) {
      await companyQuery(config,
        'UPDATE time_off_requests SET approved = ? WHERE id = ?', [body.approved, id]
      );
      return NextResponse.json({ success: true });
    }

    await companyQuery(config,
      `UPDATE time_off_requests SET
        employee_id=?, date_requested=?, end_date_requested=?, reason=?,
        all_day=?, start_hour=?, start_minute=?, end_hour=?, end_minute=?
       WHERE id=?`,
      [
        body.employee_id, body.date_requested,
        body.end_date_requested || null, body.reason?.trim() || null,
        body.all_day ? 1 : 0,
        body.all_day ? 0 : (body.start_hour   ?? 0),
        body.all_day ? 0 : (body.start_minute ?? 0),
        body.all_day ? 0 : (body.end_hour     ?? 0),
        body.all_day ? 0 : (body.end_minute   ?? 0),
        id,
      ]
    );
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('time-off/[id] error:', err);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}
