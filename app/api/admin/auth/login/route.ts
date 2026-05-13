// app/api/admin/auth/login/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createAdminSession, setAdminCookie } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const { password } = await req.json();
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminPassword) {
      console.error('ADMIN_PASSWORD not set in environment');
      return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
    }

    if (!password || password !== adminPassword) {
      return NextResponse.json({ error: 'Incorrect password' }, { status: 200 });
    }

    const token = await createAdminSession();
    const response = NextResponse.json({ success: true });
    setAdminCookie(response, token);
    return response;

  } catch (err) {
    console.error('Admin login error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
