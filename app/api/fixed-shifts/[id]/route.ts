// app/api/fixed-shifts/[id]/route.ts
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
    const id   = parseInt(params.id, 10);
    const body = await req.json();

    // DELETE — removes shift, its breaks, and all employee assignments
    if (body._method === 'DELETE') {
      await companyQuery<mysql.RowDataPacket[]>(config,
        'DELETE FROM employee_fixed_shifts WHERE fixed_shift_id = ?', [id]
      );
      await companyQuery<mysql.RowDataPacket[]>(config,
        'DELETE FROM fixed_shift_breaks WHERE fixed_shift_id = ?', [id]
      );
      await companyQuery<mysql.RowDataPacket[]>(config,
        'DELETE FROM fixed_shifts WHERE id = ?', [id]
      );
      return NextResponse.json({ success: true });
    }

    // DELETE ALL shifts
    if (body._method === 'DELETE_ALL') {
      await companyQuery<mysql.RowDataPacket[]>(config,
        'DELETE FROM employee_fixed_shifts', []
      );
      await companyQuery<mysql.RowDataPacket[]>(config,
        'DELETE FROM fixed_shift_breaks', []
      );
      await companyQuery<mysql.RowDataPacket[]>(config,
        'DELETE FROM fixed_shifts', []
      );
      return NextResponse.json({ success: true });
    }

    // UPDATE shift length and standard flag
    const length   = parseFloat(String(body.length ?? 8.5));
    const standard = body.standard ? 1 : 0;

    if (length < 0.5 || length > 12.5) {
      return NextResponse.json(
        { error: 'Shift length must be between 0.5 and 12.5 hours.' },
        { status: 400 }
      );
    }

    await companyQuery<mysql.RowDataPacket[]>(config,
      'UPDATE fixed_shifts SET length = ?, standard = ? WHERE id = ?',
      [length, standard, id]
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('fixed-shifts/[id] error:', err);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}
