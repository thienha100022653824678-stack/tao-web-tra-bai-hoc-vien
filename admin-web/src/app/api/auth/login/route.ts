import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { password } = await request.json();
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';

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
  } catch (err: any) {
    console.error('Login API error:', err);
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}
