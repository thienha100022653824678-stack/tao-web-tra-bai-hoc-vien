import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const { password } = (body || {}) as { password?: string };

    // Fail-closed: no weak 'admin123' default. When ADMIN_PASSWORD is not set
    // the system is not configured to accept logins — return a 500 config
    // error (mirrors Shop's check-auth posture) instead of silently letting
    // the literal 'admin123' through.
    const adminPassword = process.env.ADMIN_PASSWORD;
    if (!adminPassword) {
      return NextResponse.json(
        {
          success: false,
          error: 'Hệ thống chưa cấu hình mật khẩu quản trị (ADMIN_PASSWORD).',
        },
        { status: 500 }
      );
    }

    if (password !== adminPassword) {
      return NextResponse.json(
        { success: false, error: 'Mật khẩu không chính xác' },
        { status: 401 }
      );
    }

    // Generate SHA-256 hash of the password as the session token
    const encoder = new TextEncoder();
    const data = encoder.encode(adminPassword);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const sessionToken = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    const response = NextResponse.json({ success: true });

    // Set HTTP-only admin-session cookie (valid for 30 days)
    response.cookies.set('admin-session', sessionToken, {
      maxAge: 60 * 60 * 24 * 30, // 30 days
      httpOnly: true,
      path: '/',
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });

    return response;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Login API error:', err);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
