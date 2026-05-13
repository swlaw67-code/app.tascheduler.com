// middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifySchedulerSession, verifyAdminSession } from '@/lib/auth';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── Admin routes ──────────────────────────────────────────────────────────
  if (pathname.startsWith('/admin') && pathname !== '/admin/login') {
    const token = request.cookies.get('tas_admin')?.value;
    const valid = token ? await verifyAdminSession(token) : false;
    if (!valid) {
      return NextResponse.redirect(new URL('/admin/login', request.url));
    }
    return NextResponse.next();
  }

  // ── Scheduler routes ──────────────────────────────────────────────────────
  const schedulerPaths = [
    '/schedule',
    '/employees',
    '/company',
    '/settings',
    '/data',
    '/forecast',
    '/time-off',   // legacy redirect support
  ];
  const isSchedulerRoute = schedulerPaths.some(p =>
    pathname === p || pathname.startsWith(p + '/')
  );

  if (isSchedulerRoute) {
    const token   = request.cookies.get('tas_session')?.value;
    const session = token ? await verifySchedulerSession(token) : null;
    if (!session) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/schedule/:path*',
    '/employees/:path*',
    '/company/:path*',
    '/settings/:path*',
    '/data/:path*',
    '/forecast/:path*',
    '/time-off/:path*',
    '/admin/:path*',
  ],
};
