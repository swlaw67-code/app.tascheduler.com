// app/api/auth/logout/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest, clearSessionCookie } from '@/lib/auth';
import { masterQuery } from '@/lib/db/master';

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);

    if (session?.company_code) {
      // Remove active session record from master DB
      // Delete all expired + this company's sessions to clean up
      await masterQuery(
        `DELETE FROM scheduler_sessions
         WHERE company_code = ? OR expires_at < NOW()`,
        [session.company_code]
      );
    }

    const response = NextResponse.json({ success: true });
    clearSessionCookie(response);
    return response;

  } catch (err) {
    console.error('Logout error:', err);
    const response = NextResponse.json({ success: true });
    clearSessionCookie(response);
    return response;
  }
}
