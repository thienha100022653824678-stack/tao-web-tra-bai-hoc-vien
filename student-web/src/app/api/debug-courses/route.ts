import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const secret = request.headers.get('x-debug-secret');
  if (secret !== 'debug-student-2026-07') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { getMyCourses } = await import('@/lib/my-courses');

  const email = request.nextUrl.searchParams.get('email') || '';
  if (!email) {
    return NextResponse.json({ error: 'email param required' }, { status: 400 });
  }

  try {
    const courses = await getMyCourses(email);
    return NextResponse.json({
      env_check: {
        NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL?.slice(0, 50) || 'NOT_SET',
        has_SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
        LMS_SUPABASE_URL: process.env.LMS_SUPABASE_URL?.slice(0, 50) || 'NOT_SET',
        has_LMS_SUPABASE_SERVICE_ROLE_KEY: !!process.env.LMS_SUPABASE_SERVICE_ROLE_KEY,
      },
      checked_email: email,
      courses_count: courses.length,
      courses,
    });
  } catch (err: any) {
    return NextResponse.json({
      error: err.message,
      env_check: {
        NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL?.slice(0, 50) || 'NOT_SET',
        has_SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
        LMS_SUPABASE_URL: process.env.LMS_SUPABASE_URL?.slice(0, 50) || 'NOT_SET',
        has_LMS_SUPABASE_SERVICE_ROLE_KEY: !!process.env.LMS_SUPABASE_SERVICE_ROLE_KEY,
      },
    }, { status: 500 });
  }
}
