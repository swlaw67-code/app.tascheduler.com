// app/api/skill-needs/[skill_id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getDbConfig } from '@/lib/query';
import { companyQuery } from '@/lib/db/company';
import mysql from 'mysql2/promise';

export async function GET(
  req: NextRequest,
  { params }: { params: { skill_id: string } }
) {
  const config = await getDbConfig(req);
  if (!config) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const skillId = parseInt(params.skill_id, 10);
    const rows = await companyQuery<mysql.RowDataPacket[]>(
      config,
      `SELECT id, skill_id, day, number, start_hour, start_minute, stop_hour, stop_minute
       FROM skill_needs WHERE skill_id = ?
       ORDER BY day ASC, start_hour ASC, start_minute ASC`,
      [skillId]
    );
    return NextResponse.json({ needs: rows });
  } catch (err) {
    console.error('GET skill-needs error:', err);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}

// POST handles delete-all for a skill
export async function POST(
  req: NextRequest,
  { params }: { params: { skill_id: string } }
) {
  const config = await getDbConfig(req);
  if (!config) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const skillId = parseInt(params.skill_id, 10);
    await companyQuery(config, 'DELETE FROM skill_needs WHERE skill_id = ?', [skillId]);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE all skill-needs error:', err);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}
