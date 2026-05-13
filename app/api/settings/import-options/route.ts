// app/api/settings/import-options/route.ts
// GET/POST switch_import_options for a specific switch
import { NextRequest, NextResponse } from 'next/server';
import { getDbConfig } from '@/lib/query';
import { companyQuery } from '@/lib/db/company';
import mysql from 'mysql2/promise';

export async function GET(req: NextRequest) {
  const config = await getDbConfig(req);
  if (!config) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const switchName = new URL(req.url).searchParams.get('switch');
    if (!switchName) return NextResponse.json({ error: 'switch param required' }, { status: 400 });
    const rows = await companyQuery<mysql.RowDataPacket[]>(
      config,
      'SELECT * FROM switch_import_options WHERE switch_name = ? LIMIT 1',
      [switchName]
    );
    return NextResponse.json({ options: rows[0] ?? null }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('GET import-options error:', err);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const config = await getDbConfig(req);
  if (!config) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await req.json();
    if (!body.switch_name) return NextResponse.json({ error: 'switch_name required' }, { status: 400 });
    await companyQuery(config,
      `INSERT INTO switch_import_options
         (switch_name, inbound, outbound, conf_setup, agent_conf, wrap, admin, hold, queue, hold_sec, queue_sec)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE
         inbound   = VALUES(inbound),
         outbound  = VALUES(outbound),
         conf_setup = VALUES(conf_setup),
         agent_conf = VALUES(agent_conf),
         wrap      = VALUES(wrap),
         admin     = VALUES(admin),
         hold      = VALUES(hold),
         queue     = VALUES(queue),
         hold_sec  = VALUES(hold_sec),
         queue_sec = VALUES(queue_sec)`,
      [
        body.switch_name,
        body.inbound    ? 1 : 0,
        body.outbound   ? 1 : 0,
        body.conf_setup ? 1 : 0,
        body.agent_conf ? 1 : 0,
        body.wrap       ? 1 : 0,
        body.admin      ? 1 : 0,
        body.hold       ? 1 : 0,
        body.queue      ? 1 : 0,
        Math.min(600, Math.max(0, parseInt(body.hold_sec)  || 30)),
        Math.min(600, Math.max(0, parseInt(body.queue_sec) || 30)),
      ]
    );
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('POST import-options error:', err);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}
