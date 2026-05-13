// app/api/positions/[id]/route.ts
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
      await companyQuery(config, 'DELETE FROM positions WHERE id = ?', [id]);
      return NextResponse.json({ success: true });
    }

    if (!body.name?.trim()) {
      return NextResponse.json({ error: 'Position name is required.' }, { status: 400 });
    }
    await companyQuery(config,
      `UPDATE positions SET name=?, start_hour=?, start_minute=?, end_hour=?, end_minute=?
       WHERE id=?`,
      [body.name.trim(), body.start_hour ?? 0, body.start_minute ?? 0,
       body.end_hour ?? 0, body.end_minute ?? 0, id]
    );
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('positions/[id] error:', err);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}
