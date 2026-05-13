// app/api/email-server/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getDbConfig } from '@/lib/query';
import { companyQuery } from '@/lib/db/company';
import mysql from 'mysql2/promise';

export async function GET(req: NextRequest) {
  const config = await getDbConfig(req);
  if (!config) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    // Get the most complete record (non-null sender preferred)
    const rows = await companyQuery<mysql.RowDataPacket[]>(
      config,
      'SELECT id, sender, sender_email, server, port, `user`, password, encrypt FROM email_server ORDER BY sender IS NULL ASC, id DESC LIMIT 1'
    );
    return NextResponse.json({ server: rows[0] ?? null }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('GET email-server error:', err);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const config = await getDbConfig(req);
  if (!config) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await req.json();

    // Clean up null duplicate rows, keep only the real record
    await companyQuery(config,
      'DELETE FROM email_server WHERE sender IS NULL AND id NOT IN (SELECT id FROM (SELECT MAX(id) as id FROM email_server) t)'
    );
    const existing = await companyQuery<mysql.RowDataPacket[]>(
      config, 'SELECT id FROM email_server ORDER BY id DESC LIMIT 1'
    );

    const values = [
      body.sender       || null,
      body.sender_email || null,
      body.server       || null,
      Math.max(1, parseInt(body.port) || 587),
      body.user         || null,
      body.password     || null,
      parseInt(body.encrypt) ?? 0,
    ];

    if (existing.length > 0) {
      await companyQuery(config,
        'UPDATE email_server SET sender=?, sender_email=?, server=?, port=?, `user`=?, password=?, encrypt=? WHERE id=?',
        [...values, existing[0].id]
      );
    } else {
      await companyQuery(config,
        `INSERT INTO email_server (sender, sender_email, server, port, `+"`user`"+`, password, encrypt)
         VALUES (?,?,?,?,?,?,?)`,
        values
      );
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('POST email-server error:', err);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}
