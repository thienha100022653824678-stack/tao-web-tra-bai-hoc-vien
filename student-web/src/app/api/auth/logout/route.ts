import { NextRequest, NextResponse } from 'next/server';
import { verifyStudentSession } from '@/lib/session';
import { PORTAL_DEVICE_COOKIE, markStudentSessionLoggedOut } from '@/lib/session-guard';

export async function POST(request: NextRequest) {
  const sessionToken = request.cookies.get('course_session_token')?.value || '';
  const portalDeviceId = request.cookies.get(PORTAL_DEVICE_COOKIE)?.value || '';
  const session = verifyStudentSession(sessionToken);

  if (session && portalDeviceId) {
    try {
      await markStudentSessionLoggedOut({
        email: session.email,
        portalDeviceId,
      });
    } catch {
      // Logout should still clear the browser cookie even if the guard tables
      // are temporarily unavailable.
    }
  }

  const response = NextResponse.json({ success: true });
  response.cookies.delete('course_session_token');
  return response;
}
