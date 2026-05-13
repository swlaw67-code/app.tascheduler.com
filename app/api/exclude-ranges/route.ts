// app/api/exclude-ranges/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getDbConfig } from '@/lib/query';
import { companyQuery } from '@/lib/db/company';
import mysql from 'mysql2/promise';

export async function GET(req: NextRequest) {
  const config = await getDbConfig(req);
  if (!config) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const rows = await companyQuery<mysql.RowDataPacket[]>(
      config, 'SELECT id, start_datetime, end_datetime FROM exclude_ranges ORDER BY start_datetime ASC'
    );
    return NextResponse.json({ ranges: rows }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('GET exclude-ranges error:', err);
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
      if (body.all) {
        await companyQuery(config, 'DELETE FROM exclude_ranges');
      } else {
        await companyQuery(config, 'DELETE FROM exclude_ranges WHERE id = ?', [body.id]);
      }
      return NextResponse.json({ success: true });
    }

    // Bulk insert (from CSV import) or single insert
    const ranges: { start: number; end: number }[] = body.ranges ?? [{ start: body.start, end: body.end }];
    let inserted = 0;
    for (const r of ranges) {
      if (r.start === undefined || r.end === undefined || r.end < r.start) continue;
      await companyQuery(config,
        'INSERT INTO exclude_ranges (start_datetime, end_datetime) VALUES (?, ?)',
        [r.start, r.end]
      );
      inserted++;
    }
    return NextResponse.json({ success: true, inserted });
  } catch (err) {
    console.error('POST exclude-ranges error:', err);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}

// IIS blocks DELETE verb — handled via POST with _method: 'DELETE' in body
