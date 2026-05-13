// app/api/fixed-shifts/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getDbConfig } from '@/lib/query';
import { companyQuery } from '@/lib/db/company';
import mysql from 'mysql2/promise';

// GET — all fixed shifts with their breaks
export async function GET(req: NextRequest) {
  const config = await getDbConfig(req);
  if (!config) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const shifts = await companyQuery<mysql.RowDataPacket[]>(
      config,
      'SELECT id, length, standard FROM fixed_shifts ORDER BY length ASC'
    );

    const breaks = await companyQuery<mysql.RowDataPacket[]>(
      config,
      `SELECT fsb.id, fsb.fixed_shift_id, fsb.break_id, fsb.total,
              b.name AS break_name, b.minutes, b.paid
       FROM fixed_shift_breaks fsb
       JOIN breaks b ON b.id = fsb.break_id AND b.deleted = 0
       ORDER BY fsb.fixed_shift_id ASC`
    );

    // Attach breaks to their shifts
    const shiftsWithBreaks = shifts.map(s => ({
      ...s,
      breaks: breaks.filter(b => b.fixed_shift_id === s.id),
    }));

    return NextResponse.json({ shifts: shiftsWithBreaks });
  } catch (err) {
    console.error('GET fixed-shifts error:', err);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}

// POST — create a new fixed shift
export async function POST(req: NextRequest) {
  const config = await getDbConfig(req);
  if (!config) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const length   = parseFloat(String(body.length ?? 8.5));
    const standard = body.standard ? 1 : 0;

    if (length < 0.5 || length > 12.5) {
      return NextResponse.json(
        { error: 'Shift length must be between 0.5 and 12.5 hours.' },
        { status: 400 }
      );
    }

    await companyQuery<mysql.RowDataPacket[]>(
      config,
      'INSERT INTO fixed_shifts (length, standard) VALUES (?, ?)',
      [length, standard]
    );

    // Fetch new id
    const newShift = await companyQuery<mysql.RowDataPacket[]>(
      config,
      'SELECT id FROM fixed_shifts ORDER BY id DESC LIMIT 1'
    );

    // If standard, assign to all existing employees (mirrors CopyRecords logic)
    if (standard && newShift[0]?.id) {
      const employees = await companyQuery<mysql.RowDataPacket[]>(
        config,
        'SELECT id FROM employees WHERE deleted = 0'
      );
      for (const emp of employees) {
        await companyQuery<mysql.RowDataPacket[]>(
          config,
          `INSERT IGNORE INTO employee_fixed_shifts (employee_id, fixed_shift_id)
           VALUES (?, ?)`,
          [emp.id, newShift[0].id]
        );
      }
    }

    return NextResponse.json({ success: true, id: newShift[0]?.id ?? 0 });
  } catch (err) {
    console.error('POST fixed-shifts error:', err);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}
