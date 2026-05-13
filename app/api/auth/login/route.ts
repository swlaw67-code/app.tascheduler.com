// app/api/auth/login/route.ts
import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { masterQuery } from '@/lib/db/master';
import { createSchedulerSession, setSessionCookie } from '@/lib/auth';
import type { CompanyRecord } from '@/lib/types';
import mysql from 'mysql2/promise';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { company_code, password } = body as {
      company_code?: string;
      password?: string;
    };

    // Basic validation
    if (!company_code || !password) {
      return NextResponse.json(
        { error: 'Company code and password are required.' },
        { status: 200 }
      );
    }

    const code = company_code.trim().toUpperCase();

    // Look up company in master DB
    const rows = await masterQuery<mysql.RowDataPacket[]>(
      'SELECT * FROM companies WHERE company_code = ? LIMIT 1',
      [code]
    );

    if (!rows.length) {
      return NextResponse.json(
        { error: 'Company code not found. Please check your company code and try again.' },
        { status: 200 }
      );
    }

    const company = rows[0] as CompanyRecord;

    // Check password
    const valid = await bcrypt.compare(password, company.password_hash);
    if (!valid) {
      return NextResponse.json(
        { error: 'Incorrect password. Please try again.' },
        { status: 200 }
      );
    }

    // Check if account is expired
    if (company.expired) {
      // Still create a minimal session so /expired page can show, or just return a flag
      return NextResponse.json({ expired: true }, { status: 200 });
    }

    // Check for existing active session (single scheduler rule)
    // We do this by checking scheduler_sessions in the master DB
    const now = new Date();
    const activeSessions = await masterQuery<mysql.RowDataPacket[]>(
      `SELECT id FROM scheduler_sessions
       WHERE company_code = ? AND expires_at > ?
       LIMIT 1`,
      [code, now]
    );

    if (activeSessions.length > 0) {
      return NextResponse.json(
        { error: 'Another user is already logged in to this account. Only one scheduler session is allowed at a time. Please wait for that session to expire or contact your administrator to force logout.' },
        { status: 200 }
      );
    }

    // Create JWT session
    const sessionPayload = {
      company_code: code,
      db_name:      company.db_name,
      db_user:      company.db_user,
      db_pass:      company.db_pass,
    };

    const token = await createSchedulerSession(sessionPayload);

    // Record session in master DB for single-user enforcement
    const expiresAt = new Date(Date.now() + parseInt(process.env.SESSION_HOURS || '12', 10) * 60 * 60 * 1000);
    const bcryptToken = await bcrypt.hash(token.slice(-20), 6); // store a hash of part of token
    await masterQuery(
      `INSERT INTO scheduler_sessions (company_code, token_hash, expires_at)
       VALUES (?, ?, ?)`,
      [code, bcryptToken, expiresAt]
    );

    // Update last_login
    await masterQuery(
      'UPDATE companies SET last_login = NOW() WHERE company_code = ?',
      [code]
    );

    // Set cookie and respond
    const response = NextResponse.json({ success: true });
    setSessionCookie(response, token);
    return response;

  } catch (err) {
    console.error('Login error:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Login error detail:', message);
    return NextResponse.json(
      { error: 'A server error occurred. Please try again or contact support if the problem persists.' },
      { status: 500 }
    );
  }
}
