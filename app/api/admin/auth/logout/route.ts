// app/api/admin/auth/logout/route.ts
import { NextResponse } from 'next/server';
import { clearAdminCookie } from '@/lib/auth';

export async function POST() {
  const response = NextResponse.json({ success: true });
  clearAdminCookie(response);
  return response;
}
