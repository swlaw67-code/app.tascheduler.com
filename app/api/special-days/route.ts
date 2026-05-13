// app/api/special-days/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getDbConfig } from '@/lib/query';
import { companyQuery } from '@/lib/db/company';
import mysql from 'mysql2/promise';

export async function GET(req: NextRequest) {
  const config = await getDbConfig(req);
  if (!config) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const rows = await companyQuery<mysql.RowDataPacket[]>(
      config, 'SELECT id, date, name FROM special_days ORDER BY date ASC'
    );
    return NextResponse.json({ days: rows }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('GET special-days error:', err);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const config = await getDbConfig(req);
  if (!config) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await req.json();

    // IIS method override
    if (body._method === 'DELETE') {
      await companyQuery(config, 'DELETE FROM special_days WHERE id = ?', [body.id]);
      return NextResponse.json({ success: true });
    }

    if (!body.date || !body.name?.trim())
      return NextResponse.json({ error: 'Date and name are required.' }, { status: 400 });
    await companyQuery(config,
      'INSERT INTO special_days (date, name) VALUES (?, ?)',
      [body.date, body.name.trim()]
    );
    const rows = await companyQuery<mysql.RowDataPacket[]>(
      config, 'SELECT id FROM special_days WHERE date=? AND name=? ORDER BY id DESC LIMIT 1',
      [body.date, body.name.trim()]
    );
    return NextResponse.json({ success: true, id: rows[0]?.id });
  } catch (err) {
    console.error('POST special-days error:', err);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}

// IIS blocks DELETE verb — handled via POST with _method: 'DELETE' in body
// The POST handler below routes to delete logic when _method === 'DELETE'
