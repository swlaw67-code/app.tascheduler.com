// app/api/company/route.ts
// GET/POST the company record (single row)
import { NextRequest, NextResponse } from 'next/server';
import { getDbConfig } from '@/lib/query';
import { companyQuery } from '@/lib/db/company';
import mysql from 'mysql2/promise';

export async function GET(req: NextRequest) {
  const config = await getDbConfig(req);
  if (!config) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const rows = await companyQuery<mysql.RowDataPacket[]>(
      config,
      `SELECT id, version, name, address, city, state, zip, email, phone, fax,
              schedule_start_day, max_seats, first_shift, second_shift, third_shift,
              shift_color_1, shift_color_2, shift_color_3,
              HEX(shift_values) AS shift_values_hex,
              min_hours, autofill_breaks, company_not_247
       FROM company LIMIT 1`
    );
    return NextResponse.json({ company: rows[0] ?? null }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('GET company error:', err);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const config = await getDbConfig(req);
  if (!config) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await req.json();

    if (!body.name?.trim()) {
      return NextResponse.json({ error: 'Company name is required.' }, { status: 400 });
    }

    // shift_values is sent as a 96-element number array [0,1,2,...]
    // Convert to binary buffer for storage
    let shiftValuesBuf: Buffer | null = null;
    if (Array.isArray(body.shift_values) && body.shift_values.length === 96) {
      shiftValuesBuf = Buffer.from(body.shift_values);
    }

    // Check if a row exists
    const existing = await companyQuery<mysql.RowDataPacket[]>(
      config, 'SELECT id FROM company LIMIT 1'
    );

    if (existing.length > 0) {
      await companyQuery(config,
        `UPDATE company SET
          name               = ?,
          address            = ?,
          city               = ?,
          state              = ?,
          zip                = ?,
          email              = ?,
          phone              = ?,
          fax                = ?,
          schedule_start_day = ?,
          max_seats          = ?,
          first_shift        = ?,
          second_shift       = ?,
          third_shift        = ?,
          shift_color_1      = ?,
          shift_color_2      = ?,
          shift_color_3      = ?,
          shift_values       = ?,
          min_hours          = ?,
          autofill_breaks    = ?,
          company_not_247    = ?
        WHERE id = ?`,
        [
          body.name.trim(),
          body.address      || null,
          body.city         || null,
          body.state        || null,
          body.zip          || null,
          body.email        || null,
          body.phone        || null,
          body.fax          || null,
          body.schedule_start_day ?? 0,
          Math.max(1, parseInt(body.max_seats) || 1),
          body.first_shift  || '1st Shift',
          body.second_shift || '2nd Shift',
          body.third_shift  || '3rd Shift',
          body.shift_color_1 ?? 0xFFFF00,
          body.shift_color_2 ?? 0xFFFF00,
          body.shift_color_3 ?? 0xFFFF00,
          shiftValuesBuf,
          Math.min(24, Math.max(1, parseInt(body.min_hours) || 10)),
          body.autofill_breaks  ? 1 : 0,
          body.company_not_247  ? 1 : 0,
          existing[0].id,
        ]
      );
    } else {
      await companyQuery(config,
        `INSERT INTO company (
          name, address, city, state, zip, email, phone, fax,
          schedule_start_day, max_seats,
          first_shift, second_shift, third_shift,
          shift_color_1, shift_color_2, shift_color_3,
          shift_values, min_hours, autofill_breaks, company_not_247
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          body.name.trim(),
          body.address      || null,
          body.city         || null,
          body.state        || null,
          body.zip          || null,
          body.email        || null,
          body.phone        || null,
          body.fax          || null,
          body.schedule_start_day ?? 0,
          Math.max(1, parseInt(body.max_seats) || 1),
          body.first_shift  || '1st Shift',
          body.second_shift || '2nd Shift',
          body.third_shift  || '3rd Shift',
          body.shift_color_1 ?? 0xFFFF00,
          body.shift_color_2 ?? 0xFFFF00,
          body.shift_color_3 ?? 0xFFFF00,
          shiftValuesBuf,
          Math.min(24, Math.max(1, parseInt(body.min_hours) || 10)),
          body.autofill_breaks  ? 1 : 0,
          body.company_not_247  ? 1 : 0,
        ]
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('POST company error:', err);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}
