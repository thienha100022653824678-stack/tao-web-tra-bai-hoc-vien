import { NextRequest, NextResponse } from 'next/server';
import { OAuth2Client } from 'google-auth-library';
import { createStudentSession } from '@/lib/session';

export async function POST(request: NextRequest) {
  try {
    const { credential } = await request.json();
    if (!credential) {
      return NextResponse.json({ success: false, error: 'Thiếu credential' }, { status: 400 });
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      console.error('Missing GOOGLE_CLIENT_ID environment variable');
      return NextResponse.json({ success: false, error: 'Chưa cấu hình Google Client ID' }, { status: 500 });
    }

    const client = new OAuth2Client(clientId);
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: clientId,
    });
    
    const payload = ticket.getPayload();
    if (!payload || !payload.email) {
      return NextResponse.json({ success: false, error: 'Xác thực Google thất bại' }, { status: 400 });
    }

    const email = payload.email.trim().toLowerCase();
    const session = createStudentSession(email);

    const response = NextResponse.json({ success: true, email });

    // Set cookie
    response.cookies.set('course_session_token', session.token, {
      maxAge: 30 * 24 * 60 * 60, // 30 days
      httpOnly: true,
      path: '/',
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });

    return response;
  } catch (err: any) {
    console.error('Auth login error:', err);
    return NextResponse.json({ success: false, error: err.message || 'Lỗi xác thực' }, { status: 500 });
  }
}
