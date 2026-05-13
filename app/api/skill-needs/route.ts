// app/api/skill-needs/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getDbConfig } from '@/lib/query';
import { companyQuery } from '@/lib/db/company';
import mysql from 'mysql2/promise';

export async function POST(req: NextRequest) {
  const config = await getDbConfig(req);
  if (!config) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();

    // Delete single need
    if (body._method === 'DELETE') {
      await companyQuery(config,
        'DELETE FROM skill_needs WHERE id = ?',
        [parseInt(String(body.id), 10)]
      );
      return NextResponse.json({ success: true });
    }

    // Add new need(s)
    const rawDays = Array.isArray(body.days) ? body.days : [body.day];
    const days: number[] = rawDays
      .map((d: unknown) => parseInt(String(d), 10))
      .filter((d: number) => !isNaN(d) && d >= 0 && d <= 6);

    if (days.length === 0) {
      return NextResponse.json({ error: 'No valid days provided.' }, { status: 400 });
    }

    const skillId    = parseInt(String(body.skill_id), 10);
    const number     = Math.max(1, parseInt(String(body.number ?? 1), 10));
    const startHour  = parseInt(String(body.start_hour  ?? 0), 10);
    const startMin   = parseInt(String(body.start_minute ?? 0), 10);
    const stopHour   = parseInt(String(body.stop_hour   ?? 0), 10);
    const stopMin    = parseInt(String(body.stop_minute  ?? 0), 10);

    // Insert each day separately with error logging
    let count = 0;
    for (const day of days) {
      try {
        await companyQuery<mysql.RowDataPacket[]>(
          config,
          `INSERT INTO skill_needs
             (skill_id, day, number, start_hour, start_minute, stop_hour, stop_minute)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [skillId, day, number, startHour, startMin, stopHour, stopMin]
        );
        count++;
      } catch (insertErr) {
        console.error(`Failed to insert skill need for day ${day}:`, insertErr);
      }
    }

    return NextResponse.json({ success: true, count });
  } catch (err) {
    console.error('skill-needs POST error:', err);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}
