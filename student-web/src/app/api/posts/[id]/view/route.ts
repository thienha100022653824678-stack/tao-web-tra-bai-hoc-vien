import { NextResponse, NextRequest } from 'next/server';
import { supabase } from '@/lib/supabase';
import crypto from 'crypto';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Retrieve or generate a unique session ID
    let sessionId = request.cookies.get('student-session-id')?.value;
    let isNewSession = false;

    if (!sessionId) {
      sessionId = crypto.randomUUID();
      isNewSession = true;
    }

    // Get client details from headers
    const forwardedFor = request.headers.get('x-forwarded-for');
    const realIp = request.headers.get('x-real-ip');
    let ip = '127.0.0.1';

    if (forwardedFor) {
      // x-forwarded-for can be a list of IPs, the first one is the client
      ip = forwardedFor.split(',')[0].trim();
    } else if (realIp) {
      ip = realIp;
    }

    const ua = request.headers.get('user-agent') || 'unknown';

    // Call Supabase RPC record_view
    const { error } = await supabase.rpc('record_view', {
      p_post_id: id,
      p_session_id: sessionId,
      p_ip: ip,
      p_ua: ua
    });

    if (error) {
      console.error('Database error in record_view:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    const response = NextResponse.json({ success: true });

    // Set cookie for student session (persistent for 1 year)
    if (isNewSession) {
      response.cookies.set('student-session-id', sessionId, {
        maxAge: 60 * 60 * 24 * 365, // 1 year
        httpOnly: true,
        path: '/',
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
      });
    }

    return response;
  } catch (err: any) {
    console.error('System error recording view:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
