// app/api/employees/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getDbConfig } from '@/lib/query';
import { companyQuery } from '@/lib/db/company';
import mysql from 'mysql2/promise';

// GET — list all non-deleted employees with their primary skill
export async function GET(req: NextRequest) {
  const config = await getDbConfig(req);
  if (!config) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    // Check employee_sort setting: if true use custom sort_num order,
    // otherwise use default: skill POI order then skill_level DESC (mirrors desktop app)
    const settingsRows = await companyQuery<mysql.RowDataPacket[]>(
      config, 'SELECT employee_sort FROM company_settings LIMIT 1'
    );
    const useCustomSort = settingsRows[0]?.employee_sort ? true : false;

    const orderBy = useCustomSort
      ? 'e.sort_num ASC, e.name ASC'
      : 's.sort_order ASC, e.skill_level DESC, e.name ASC';

    const rows = await companyQuery<mysql.RowDataPacket[]>(
      config,
      `SELECT
         e.id, e.name, e.email, e.phone, e.skill_id,
         s.name  AS skill_name,
         s.color AS skill_color,
         s.sort_order AS skill_sort_order,
         e.min_hours, e.max_hours, e.min_hours_day, e.max_hours_day,
         e.max_days_week, e.max_days_row, e.pay_rate, e.pay_cycle,
         e.skill_level, e.split_shift, e.overtime, e.inactive,
         e.poor_performance, e.two_days_off, e.use_weekend_rule,
         e.timezone, e.preference, e.sort_num, e.hire_date,
         e.portal_active, e.use_special, e.address, e.city, e.state,
         e.zip, e.mtf_employee_id, e.saturday_date
       FROM employees e
       LEFT JOIN skills s ON s.id = e.skill_id
       WHERE e.deleted = 0
       ORDER BY ${orderBy}`,
      []
    );
    return NextResponse.json({ employees: rows, use_custom_sort: useCustomSort }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('GET employees error:', err);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}

// POST — create a new employee
export async function POST(req: NextRequest) {
  const config = await getDbConfig(req);
  if (!config) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();

    if (!body.name?.trim()) {
      return NextResponse.json({ error: 'Employee name is required.' }, { status: 400 });
    }
    if (!body.skill_id && (!body.skill_ids || body.skill_ids.length === 0)) {
      return NextResponse.json({ error: 'At least one skill must be selected.' }, { status: 400 });
    }

    // Get next sort_num
    const maxRows = await companyQuery<mysql.RowDataPacket[]>(
      config,
      'SELECT COALESCE(MAX(sort_num), 0) AS max_sort FROM employees WHERE deleted = 0'
    );
    const nextSort = (maxRows[0]?.max_sort ?? 0) + 1;

    // Determine primary skill_id
    const primarySkillId = body.skill_id ||
      (Array.isArray(body.skill_ids) && body.skill_ids.length > 0 ? body.skill_ids[0] : 0);

    // INSERT without ResultSetHeader casting
    await companyQuery<mysql.RowDataPacket[]>(
      config,
      `INSERT INTO employees (
        skill_id, name, address, city, state, zip, email, phone,
        min_hours, max_hours, split_shift, skill_level, poor_performance,
        inactive, pay_rate, pay_cycle, overtime, min_hours_day, max_hours_day,
        max_days_week, mtf_employee_id, sort_num, preference, timezone,
        max_days_row, hire_date, two_days_off, use_weekend_rule, saturday_date,
        deleted, use_special, portal_active
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?,0)`,
      [
        primarySkillId,
        body.name.trim(),
        body.address          ?? null,
        body.city             ?? null,
        body.state            ?? null,
        body.zip              ?? null,
        body.email            ?? null,
        body.phone            ?? null,
        body.min_hours        ?? 20,
        body.max_hours        ?? 40,
        body.split_shift      ? 1 : 0,
        body.skill_level      ?? 1,
        body.poor_performance ? 1 : 0,
        body.inactive         ? 1 : 0,
        body.pay_rate         ?? 0,
        body.pay_cycle        ?? 0,
        body.overtime         ? 1 : 0,
        body.min_hours_day    ?? 4,
        body.max_hours_day    ?? 8,
        body.max_days_week    ?? 5,
        body.mtf_employee_id  ?? null,
        nextSort,
        body.preference       ?? 0,
        body.timezone         ?? 0,
        body.max_days_row     ?? 0,
        body.hire_date     ? body.hire_date     : null,
        body.two_days_off     ? 1 : 0,
        body.use_weekend_rule ? 1 : 0,
        body.saturday_date ? body.saturday_date : null,
        body.use_special      ? 1 : 0,
      ]
    );

    // Fetch the new employee's id
    const newEmp = await companyQuery<mysql.RowDataPacket[]>(
      config,
      'SELECT id FROM employees WHERE name = ? AND deleted = 0 ORDER BY id DESC LIMIT 1',
      [body.name.trim()]
    );
    const newId = newEmp[0]?.id ?? 0;

    // Insert skill assignments
    if (newId && Array.isArray(body.skill_ids) && body.skill_ids.length > 0) {
      for (const sid of body.skill_ids) {
        await companyQuery<mysql.RowDataPacket[]>(
          config,
          'INSERT IGNORE INTO employee_skills (employee_id, skill_id) VALUES (?, ?)',
          [newId, sid]
        );
      }
    }

    return NextResponse.json({ success: true, id: newId });
  } catch (err) {
    console.error('POST employee error:', err);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}
