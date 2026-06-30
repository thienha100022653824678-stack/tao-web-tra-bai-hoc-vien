import { NextRequest, NextResponse } from 'next/server';
import { verifyStudentSession } from '@/lib/session';
import { getMyCourses } from '@/lib/my-courses';

export async function GET(request: NextRequest) {
  const token = request.cookies.get('course_session_token')?.value || '';
  const session = verifyStudentSession(token);

  if (!session) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const coursesList = await getMyCourses(session.email);
    return NextResponse.json({ success: true, courses: coursesList });
  } catch (err: any) {
    console.error('My courses API error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
