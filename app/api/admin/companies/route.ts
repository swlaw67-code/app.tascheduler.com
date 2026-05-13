// app/api/admin/companies/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getAdminSessionFromRequest } from '@/lib/auth';
import { masterQuery } from '@/lib/db/master';
import bcrypt from 'bcryptjs';
import mysql from 'mysql2/promise';

// GET — list all companies
export async function GET(req: NextRequest) {
  if (!await getAdminSessionFromRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 200 });
  }
  try {
    const rows = await masterQuery<mysql.RowDataPacket[]>(
      `SELECT id, company_code, db_name, expired, created_at, last_login
       FROM companies ORDER BY created_at DESC`
    );
    return NextResponse.json({ companies: rows });
  } catch (err) {
    console.error('List companies error:', err);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}

// POST — create a new company record in master DB
export async function POST(req: NextRequest) {
  if (!await getAdminSessionFromRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 200 });
  }
  try {
    const body = await req.json();
    const { company_code, password, db_name, db_user, db_pass } = body as {
      company_code: string;
      password: string;
      db_name: string;
      db_user: string;
      db_pass: string;
    };

    // Validate
    if (!company_code || !password || !db_name || !db_user || !db_pass) {
      return NextResponse.json({ error: 'All fields are required.' }, { status: 400 });
    }
    const code = company_code.trim().toUpperCase();
    if (code.length > 10) {
      return NextResponse.json({ error: 'Company code must be 10 characters or less.' }, { status: 400 });
    }

    // Check for duplicate
    const existing = await masterQuery<mysql.RowDataPacket[]>(
      'SELECT id FROM companies WHERE company_code = ?', [code]
    );
    if (existing.length > 0) {
      return NextResponse.json({ error: 'Company code already exists.' }, { status: 409 });
    }

    // Hash password
    const password_hash = await bcrypt.hash(password, 12);

    // Insert into master DB
    await masterQuery(
      `INSERT INTO companies (company_code, password_hash, db_name, db_user, db_pass, expired)
       VALUES (?, ?, ?, ?, ?, 0)`,
      [code, password_hash, db_name.trim(), db_user.trim(), db_pass]
    );

    return NextResponse.json({ success: true, company_code: code });

  } catch (err) {
    console.error('Create company error:', err);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}
