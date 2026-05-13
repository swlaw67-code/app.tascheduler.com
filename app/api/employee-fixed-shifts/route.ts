// app/api/employee-fixed-shifts/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getDbConfig } from '@/lib/query';
import { companyQuery } from '@/lib/db/company';
import mysql from 'mysql2/promise';

// GET — all employee-fixed-shift assignments, or for a specific employee
export async function GET(req: NextRequest) {
  const config = await getDbConfig(req);
  if (!config) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const url    = new URL(req.url);
    const empId  = url.searchParams.get('employee_id');

    let sql = `
      SELECT efs.id, efs.employee_id, efs.fixed_shift_id,
             e.name AS employee_name,
             fs.length, fs.standard,
             fsb.id AS break_record_id, fsb.break_id, fsb.total,
             b.name AS break_name, b.minutes, b.paid
      FROM employee_fixed_shifts efs
      JOIN employees e ON e.id = efs.employee_id AND e.deleted = 0
      JOIN fixed_shifts fs ON fs.id = efs.fixed_shift_id
      LEFT JOIN fixed_shift_breaks fsb ON fsb.fixed_shift_id = efs.fixed_shift_id
      LEFT JOIN breaks b ON b.id = fsb.break_id AND b.deleted = 0
    `;
    const params: unknown[] = [];

    if (empId) {
      sql += ' WHERE efs.employee_id = ?';
      params.push(parseInt(empId, 10));
    }

    sql += ' ORDER BY fs.length ASC, e.sort_num ASC';

    const rows = await companyQuery<mysql.RowDataPacket[]>(config, sql, params);
    return NextResponse.json({ assignments: rows });
  } catch (err) {
    console.error('GET employee-fixed-shifts error:', err);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}

// POST — copy shift(s) to employee(s), or delete assignment(s)
export async function POST(req: NextRequest) {
  const config = await getDbConfig(req);
  if (!config) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();

    // DELETE single assignment
    if (body._method === 'DELETE') {
      await companyQuery<mysql.RowDataPacket[]>(config,
        'DELETE FROM employee_fixed_shifts WHERE employee_id = ? AND fixed_shift_id = ?',
        [body.employee_id, body.fixed_shift_id]
      );
      return NextResponse.json({ success: true });
    }

    // DELETE ALL assignments for an employee
    if (body._method === 'DELETE_EMPLOYEE_ALL') {
      await companyQuery<mysql.RowDataPacket[]>(config,
        'DELETE FROM employee_fixed_shifts WHERE employee_id = ?',
        [body.employee_id]
      );
      return NextResponse.json({ success: true });
    }

    // COPY shift(s) to employee(s) — mirrors CopyRecords
    // body.employee_ids: number[]  — target employees
    // body.shift_ids: number[]     — shifts to copy (empty = all shifts = CopyAll)
    const empIds: number[]   = (body.employee_ids || []).map(Number);
    const shiftIds: number[] = body.shift_ids ? body.shift_ids.map(Number) : [];

    if (empIds.length === 0) {
      return NextResponse.json({ error: 'No employees selected.' }, { status: 400 });
    }

    // If no shift_ids provided, copy ALL shifts (Copy All button)
    let targetShiftIds = shiftIds;
    if (targetShiftIds.length === 0) {
      const allShifts = await companyQuery<mysql.RowDataPacket[]>(
        config, 'SELECT id FROM fixed_shifts ORDER BY length ASC'
      );
      targetShiftIds = allShifts.map(s => s.id as number);
    }

    let copied = 0;
    for (const empId of empIds) {
      for (const shiftId of targetShiftIds) {
        // INSERT IGNORE — no duplicate if already assigned
        await companyQuery<mysql.RowDataPacket[]>(config,
          'INSERT IGNORE INTO employee_fixed_shifts (employee_id, fixed_shift_id) VALUES (?, ?)',
          [empId, shiftId]
        );
        copied++;
      }
    }

    return NextResponse.json({
      success: true,
      message: `${targetShiftIds.length} shift(s) copied to ${empIds.length} employee(s).`,
      copied,
    });
  } catch (err) {
    console.error('POST employee-fixed-shifts error:', err);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}
