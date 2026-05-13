// app/api/admin/companies/[code]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getAdminSessionFromRequest } from '@/lib/auth';
import { masterQuery } from '@/lib/db/master';
import bcrypt from 'bcryptjs';

export async function POST(
  req: NextRequest,
  { params }: { params: { code: string } }
) {
  if (!await getAdminSessionFromRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 200 });
  }
  try {
    const code = params.code.toUpperCase();
    const body = await req.json();

    if (typeof body.expired === 'boolean') {
      await masterQuery(
        'UPDATE companies SET expired = ? WHERE company_code = ?',
        [body.expired ? 1 : 0, code]
      );
    }
    if (body.new_password) {
      const hash = await bcrypt.hash(body.new_password, 12);
      await masterQuery(
        'UPDATE companies SET password_hash = ? WHERE company_code = ?',
        [hash, code]
      );
    }
    if (body.force_logout) {
      await masterQuery(
        'DELETE FROM scheduler_sessions WHERE company_code = ?', [code]
      );
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('admin companies/[code] error:', err);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}
