// app/api/employees/[id]/availability/route.ts
// GET: returns availability slots for one employee + special flag
// POST: upserts one row per (employee_id, special) with full JSON slots array

import { NextRequest, NextResponse } from 'next/server';
import { getDbConfig } from '@/lib/query';
import { companyQuery } from '@/lib/db/company';
import mysql from 'mysql2/promise';

type Slot = {
  day: number;
  start_hour: number; start_minute: number;
  stop_hour: number;  stop_minute: number;
};

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const config = await getDbConfig(req);
  if (!config) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const id      = parseInt(params.id, 10);
    const url     = new URL(req.url);
    const special = url.searchParams.get('special') === '1' ? 1 : 0;

    const rows = await companyQuery<mysql.RowDataPacket[]>(
      config,
      'SELECT slots FROM employee_availability WHERE employee_id = ? AND special = ? LIMIT 1',
      [id, special]
    );

    let availability: object[] = [];
    if (rows.length > 0 && rows[0].slots) {
      try {
        const slots: Slot[] = JSON.parse(rows[0].slots as string);
        // Add synthetic id + special for backwards compat with AvailabilityDialog
        availability = slots.map((s, i) => ({ id: i + 1, ...s, special }));
      } catch { /* malformed JSON — return empty */ }
    }

    return NextResponse.json({ availability }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('GET availability error:', err);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const config = await getDbConfig(req);
  if (!config) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const id          = parseInt(params.id, 10);
    const body        = await req.json();
    const specialFlag = body.special ? 1 : 0;

    let newSlots: Slot[];

    if (body.day !== undefined) {
      // Per-day update from AvailabilityDialog — fetch existing, replace this day's slots
      const existing = await companyQuery<mysql.RowDataPacket[]>(
        config,
        'SELECT slots FROM employee_availability WHERE employee_id = ? AND special = ? LIMIT 1',
        [id, specialFlag]
      );
      let allSlots: Slot[] = [];
      if (existing.length > 0 && existing[0].slots) {
        try { allSlots = JSON.parse(existing[0].slots as string); } catch { allSlots = []; }
      }
      // Remove this day's slots and add the new ones
      allSlots = allSlots.filter(s => s.day !== body.day);
      for (const slot of (body.slots || [])) {
        allSlots.push({
          day: body.day,
          start_hour: slot.start_hour, start_minute: slot.start_minute,
          stop_hour:  slot.stop_hour,  stop_minute:  slot.stop_minute,
        });
      }
      allSlots.sort((a, b) => a.day - b.day || a.start_hour - b.start_hour || a.start_minute - b.start_minute);
      newSlots = allSlots;
    } else {
      // Full replace
      newSlots = (body.slots || []).map((s: Slot) => ({
        day: s.day,
        start_hour: s.start_hour, start_minute: s.start_minute,
        stop_hour:  s.stop_hour,  stop_minute:  s.stop_minute,
      }));
    }

    if (newSlots.length === 0) {
      await companyQuery(config,
        'DELETE FROM employee_availability WHERE employee_id = ? AND special = ?',
        [id, specialFlag]
      );
    } else {
      await companyQuery(config,
        `INSERT INTO employee_availability (employee_id, special, slots)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE slots = VALUES(slots)`,
        [id, specialFlag, JSON.stringify(newSlots)]
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('POST availability error:', err);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}
