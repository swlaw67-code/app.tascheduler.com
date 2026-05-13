// app/api/employees/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getDbConfig } from '@/lib/query';
import { companyQuery } from '@/lib/db/company';
import mysql from 'mysql2/promise';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const config = await getDbConfig(req);
  if (!config) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const id = parseInt(params.id, 10);

    const empRows = await companyQuery<mysql.RowDataPacket[]>(
      config,
      'SELECT * FROM employees WHERE id = ? AND deleted = 0 LIMIT 1',
      [id]
    );
    if (!empRows.length) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Availability (regular)
    const availRows = await companyQuery<mysql.RowDataPacket[]>(
      config,
      `SELECT id, employee_id, day, start_hour, start_minute, stop_hour, stop_minute, special
       FROM employee_availability
       WHERE employee_id = ? AND special = 0
       ORDER BY day ASC, start_hour ASC`,
      [id]
    );

    // All skills assigned to this employee
    const skillRows = await companyQuery<mysql.RowDataPacket[]>(
      config,
      `SELECT es.skill_id
       FROM employee_skills es
       WHERE es.employee_id = ?
       ORDER BY es.id ASC`,
      [id]
    );
    const skillIds = skillRows.map(r => r.skill_id as number);

    return NextResponse.json({
      employee:    empRows[0],
      availability: availRows,
      skill_ids:   skillIds,
    });
  } catch (err) {
    console.error('GET employee error:', err);
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
    const id   = parseInt(params.id, 10);
    const body = await req.json();

    if (body._method === 'DELETE') {
      await companyQuery<mysql.RowDataPacket[]>(
        config, 'UPDATE employees SET deleted = 1 WHERE id = ?', [id]
      );
      return NextResponse.json({ success: true });
    }

    // UPDATE
    await companyQuery<mysql.RowDataPacket[]>(config,
      `UPDATE employees SET
        skill_id=?, name=?, address=?, city=?, state=?, zip=?, email=?, phone=?,
        min_hours=?, max_hours=?, split_shift=?, skill_level=?, poor_performance=?,
        inactive=?, pay_rate=?, pay_cycle=?, overtime=?, min_hours_day=?, max_hours_day=?,
        max_days_week=?, mtf_employee_id=?, preference=?, timezone=?, max_days_row=?,
        hire_date=?, two_days_off=?, use_weekend_rule=?, saturday_date=?, use_special=?
       WHERE id=? AND deleted=0`,
      [
        body.skill_id,
        body.name,
        body.address          ?? null,
        body.city             ?? null,
        body.state            ?? null,
        body.zip              ?? null,
        body.email            ?? null,
        body.phone            ?? null,
        body.min_hours        ?? 0,
        body.max_hours        ?? 40,
        body.split_shift      ? 1 : 0,
        body.skill_level      ?? 1,
        body.poor_performance ? 1 : 0,
        body.inactive         ? 1 : 0,
        body.pay_rate         ?? 0,
        body.pay_cycle        ?? 0,
        body.overtime         ? 1 : 0,
        body.min_hours_day    ?? 0,
        body.max_hours_day    ?? 0,
        body.max_days_week    ?? 5,
        body.mtf_employee_id  ?? null,
        body.preference       ?? 0,
        body.timezone         ?? 0,
        body.max_days_row     ?? 0,
        body.hire_date        ?? null,
        body.two_days_off     ? 1 : 0,
        body.use_weekend_rule ? 1 : 0,
        body.saturday_date    ?? null,
        body.use_special      ? 1 : 0,
        id,
      ]
    );

    // Update skill assignments
    if (Array.isArray(body.skill_ids)) {
      await companyQuery<mysql.RowDataPacket[]>(
        config, 'DELETE FROM employee_skills WHERE employee_id = ?', [id]
      );
      for (const sid of body.skill_ids) {
        await companyQuery<mysql.RowDataPacket[]>(
          config,
          'INSERT IGNORE INTO employee_skills (employee_id, skill_id) VALUES (?, ?)',
          [id, sid]
        );
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('employees/[id] error:', err);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}
