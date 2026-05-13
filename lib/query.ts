// lib/db/query.ts
// Convenience wrapper: extracts session from request, returns company DB config
// Use this in every API route to avoid boilerplate

import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { companyQuery, DbConfig } from '@/lib/db/company';
import mysql from 'mysql2/promise';

export type { DbConfig };

// Get the DB config from the current request's session
// Returns null + sends 401 response if not authenticated
export async function getDbConfig(
  req: NextRequest
): Promise<DbConfig | null> {
  const session = await getSessionFromRequest(req);
  if (!session) return null;
  return {
    db_name: session.db_name,
    db_user: session.db_user,
    db_pass: session.db_pass,
  };
}

// Run a query against the company DB from an API route
// Handles auth automatically — returns null if unauthorized
export async function apiQuery<T = mysql.RowDataPacket[]>(
  req: NextRequest,
  sql: string,
  params?: unknown[]
): Promise<{ rows: T; config: DbConfig } | NextResponse> {
  const config = await getDbConfig(req);
  if (!config) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const rows = await companyQuery<T>(config, sql, params);
  return { rows, config };
}

// Type guard
export function isNextResponse(val: unknown): val is NextResponse {
  return val instanceof NextResponse;
}
