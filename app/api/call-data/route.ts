// app/api/call-data/route.ts
// GET: retrieve call data (one row per date, flat 96-element JSON arrays)
// POST: import parsed slot records — groups by date, upserts one row per date

import { NextRequest, NextResponse } from 'next/server';
import { getDbConfig } from '@/lib/query';
import { companyQuery } from '@/lib/db/company';
import mysql from 'mysql2/promise';

export async function GET(req: NextRequest) {
  const config = await getDbConfig(req);
  if (!config) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const url      = new URL(req.url);
    const fromDate = url.searchParams.get('from');
    const toDate   = url.searchParams.get('to');
    let sql = 'SELECT date, calls, talk_time FROM call_data WHERE 1=1';
    const params: unknown[] = [];
    if (fromDate) { sql += ' AND date >= ?'; params.push(fromDate); }
    if (toDate)   { sql += ' AND date <= ?'; params.push(toDate); }
    sql += ' ORDER BY date ASC';
    const rows = await companyQuery<mysql.RowDataPacket[]>(config, sql, params);
    return NextResponse.json({ data: rows }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('GET call-data error:', err);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const config = await getDbConfig(req);
  if (!config) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await req.json();

    // IIS method override — handle delete
    if (body._method === 'DELETE') {
      if (!body.date) return NextResponse.json({ error: 'date required' }, { status: 400 });
      await companyQuery(config, 'DELETE FROM call_data WHERE date = ?', [body.date]);
      return NextResponse.json({ success: true });
    }

    const records: { date: string; hour: number; quarter: number; calls: number; talk_time: number }[]
      = body.records;
    const mode: 'overwrite' | 'add' = body.mode === 'add' ? 'add' : 'overwrite';

    if (!Array.isArray(records) || records.length === 0) {
      return NextResponse.json({ error: 'No records provided.' }, { status: 400 });
    }

    // Group incoming slot records by date into flat 96-element arrays
    const dateMap = new Map<string, { calls: number[]; talk_time: number[] }>();
    for (const rec of records) {
      if (!rec.date || rec.hour === undefined || rec.quarter === undefined) continue;
      if (!dateMap.has(rec.date)) {
        dateMap.set(rec.date, { calls: new Array(96).fill(0), talk_time: new Array(96).fill(0) });
      }
      const slot = rec.hour * 4 + rec.quarter;
      if (slot >= 0 && slot < 96) {
        dateMap.get(rec.date)!.calls[slot]     += rec.calls     || 0;
        dateMap.get(rec.date)!.talk_time[slot] += rec.talk_time || 0;
      }
    }

    let inserted = 0;
    let updated  = 0;

    for (const [date, data] of dateMap.entries()) {
      const existing = await companyQuery<mysql.RowDataPacket[]>(
        config, 'SELECT calls, talk_time FROM call_data WHERE date = ? LIMIT 1', [date]
      );
      if (existing.length > 0) {
        if (mode === 'add') {
          // Add mode — sum new data into existing
          const exCalls:    number[] = JSON.parse(existing[0].calls as string);
          const exTalkTime: number[] = JSON.parse(existing[0].talk_time as string);
          for (let i = 0; i < 96; i++) {
            data.calls[i]     += exCalls[i]    || 0;
            data.talk_time[i] += exTalkTime[i] || 0;
          }
        }
        // Overwrite mode — just replace with new data (no merge needed)
        await companyQuery(config,
          'UPDATE call_data SET calls=?, talk_time=? WHERE date=?',
          [JSON.stringify(data.calls), JSON.stringify(data.talk_time), date]
        );
        updated++;
      } else {
        await companyQuery(config,
          'INSERT INTO call_data (date, calls, talk_time) VALUES (?,?,?)',
          [date, JSON.stringify(data.calls), JSON.stringify(data.talk_time)]
        );
        inserted++;
      }
    }

    return NextResponse.json({ success: true, inserted, updated });
  } catch (err) {
    console.error('POST call-data error:', err);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}
