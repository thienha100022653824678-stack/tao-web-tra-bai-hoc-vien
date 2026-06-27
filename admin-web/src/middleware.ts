import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const session = request.cookies.get('admin-session')?.value;
  
  // Exclude static assets
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/static') ||
    pathname.includes('favicon.ico')
  ) {
    return NextResponse.next();
  }

  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
  
  // Calculate SHA-256 hash of ADMIN_PASSWORD
  const encoder = new TextEncoder();
  const data = encoder.encode(adminPassword);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const expectedSession = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

  const isAuthenticated = session === expectedSession;

  const isLoginPage = pathname === '/login';
  const isAuthApi = pathname.startsWith('/api/auth');
  const isSyncApi = pathname === '/api/sync' || pathname.startsWith('/api/sync');

  // If not authenticated and trying to access a protected page, redirect to login
  if (!isAuthenticated && !isLoginPage && !isAuthApi && !isSyncApi) {
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  // If authenticated and trying to access login, redirect to dashboard
  if (isAuthenticated && isLoginPage) {
    const dashboardUrl = new URL('/', request.url);
    return NextResponse.redirect(dashboardUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except static files or favicon
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
