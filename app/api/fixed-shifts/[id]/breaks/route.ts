// app/api/fixed-shifts/[id]/breaks/route.ts
// Mirrors CFixedShiftData::AddBreak:
//   When range_mode=true: adds break to ALL shifts from [id] through add_to_shift_id
//   (finds index of start shift, finds index of end shift, loops start→end)

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
    const shiftId = parseInt(params.id, 10);
    const body    = await req.json();

    // DELETE a specific break record
    if (body._method === 'DELETE') {
      await companyQuery<mysql.RowDataPacket[]>(config,
        'DELETE FROM fixed_shift_breaks WHERE id = ?', [body.break_record_id]
      );
      return NextResponse.json({ success: true });
    }

    // UPDATE an existing break record
    if (body._method === 'UPDATE') {
      await companyQuery<mysql.RowDataPacket[]>(config,
        'UPDATE fixed_shift_breaks SET break_id = ?, total = ? WHERE id = ?',
        [body.break_id, body.total ?? 1, body.break_record_id]
      );
      return NextResponse.json({ success: true });
    }

    // ADD — range_mode: add to all shifts from shiftId through add_to_shift_id
    // Mirrors CFixedShiftData::AddBreak(Shift_ID, AddShift_ID, Break_ID, Total)
    const breakId  = parseInt(String(body.break_id), 10);
    const total    = Math.min(4, Math.max(1, parseInt(String(body.total ?? 1), 10)));
    const toShiftId = body.add_to_shift_id
      ? parseInt(String(body.add_to_shift_id), 10)
      : shiftId;

    if (body.range_mode && toShiftId !== shiftId) {
      // Get all shifts ordered by length (same order as FixedShiftListVector)
      const allShifts = await companyQuery<mysql.RowDataPacket[]>(
        config,
        'SELECT id FROM fixed_shifts ORDER BY length ASC'
      );

      // Find start and stop indices (mirrors start = index of Shift_ID, stop = index of AddShift_ID)
      const ids        = allShifts.map(s => s.id as number);
      const startIdx   = ids.indexOf(shiftId);
      const stopIdx    = ids.indexOf(toShiftId);

      if (startIdx === -1 || stopIdx === -1) {
        return NextResponse.json({ error: 'Shift not found.' }, { status: 404 });
      }

      const [lo, hi] = startIdx <= stopIdx
        ? [startIdx, stopIdx]
        : [stopIdx, startIdx];

      // Loop from start to stop inclusive, add break if not already present
      let added = 0;
      for (let i = lo; i <= hi; i++) {
        const sid = ids[i];
        // Check if this break already exists on this shift
        const existing = await companyQuery<mysql.RowDataPacket[]>(
          config,
          'SELECT id FROM fixed_shift_breaks WHERE fixed_shift_id = ? AND break_id = ? LIMIT 1',
          [sid, breakId]
        );
        if (existing.length === 0) {
          await companyQuery<mysql.RowDataPacket[]>(config,
            'INSERT INTO fixed_shift_breaks (fixed_shift_id, break_id, total) VALUES (?, ?, ?)',
            [sid, breakId, total]
          );
          added++;
        }
      }

      return NextResponse.json({ success: true, added });
    }

    // Single shift add (no range)
    const existing = await companyQuery<mysql.RowDataPacket[]>(
      config,
      'SELECT id FROM fixed_shift_breaks WHERE fixed_shift_id = ? AND break_id = ? LIMIT 1',
      [shiftId, breakId]
    );
    if (existing.length > 0) {
      return NextResponse.json({ error: 'This break already exists on this shift.' }, { status: 409 });
    }
    await companyQuery<mysql.RowDataPacket[]>(config,
      'INSERT INTO fixed_shift_breaks (fixed_shift_id, break_id, total) VALUES (?, ?, ?)',
      [shiftId, breakId, total]
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('fixed-shifts/[id]/breaks error:', err);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}
