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

  // Fail-closed: no weak 'admin123' default. When ADMIN_PASSWORD is not set
  // the system is considered not configured → treat as NOT authenticated. For
  // page requests this redirects to /login (which itself will surface a
  // config error via the login API); for API requests we fall through so the
  // route handler can return its own auth/config error.
  const adminPassword = process.env.ADMIN_PASSWORD;

  let isAuthenticated = false;
  if (adminPassword) {
    // Calculate SHA-256 hash of ADMIN_PASSWORD
    const encoder = new TextEncoder();
    const data = encoder.encode(adminPassword);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const expectedSession = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    isAuthenticated = session === expectedSession;
  }

  const isLoginPage = pathname === '/login';
  const isAuthApi = pathname.startsWith('/api/auth');
  const isSyncApi = pathname === '/api/sync' || pathname.startsWith('/api/sync');
  // Worker-secret gated diagnostics route — reachable WITHOUT the admin
  // session cookie (it authorizes via x-v2-worker-secret / x-sync-secret,
  // like /api/sync). Exempt here so the route handler owns its own auth.
  const isDiagnosticsApi = pathname === '/api/v2/diagnostics';

  // If not authenticated and trying to access a protected page, redirect to login
  if (!isAuthenticated && !isLoginPage && !isAuthApi && !isSyncApi && !isDiagnosticsApi) {
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
