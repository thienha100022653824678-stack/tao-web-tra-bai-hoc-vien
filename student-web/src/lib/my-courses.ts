import { lmsSupabaseAdmin, supabaseAdmin } from './supabase';

type CourseStatus = 'pending_order' | 'approved_waiting_content' | 'approved_ready';

type MyCourse = {
  id: string;
  title: string;
  course_slug: string;
  status: CourseStatus;
  grantedAt?: string;
  images: string[];
  driveStatus?: string;
};

const APPROVED_ORDER_STATUSES = new Set([
  'da duyet',
  'da-duyet',
  'approved',
  'active',
  'completed',
]);

const REJECTED_ORDER_STATUSES = new Set([
  'huy',
  'da huy',
  'tu choi',
  'rejected',
  'cancelled',
  'canceled',
]);

const ACTIVE_ENROLLMENT_STATUSES = new Set([
  'active',
  'approved',
  'approved_ready',
  'approved_waiting_content',
  'completed',
]);

function normalizeSlug(slug: unknown): string {
  return String(slug || '').trim();
}

function normalizeStatus(status: unknown): string {
  return String(status || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function isApprovedOrder(status: unknown): boolean {
  return APPROVED_ORDER_STATUSES.has(normalizeStatus(status));
}

function isRejectedOrder(status: unknown): boolean {
  return REJECTED_ORDER_STATUSES.has(normalizeStatus(status));
}

function isActiveEnrollment(status: unknown): boolean {
  return ACTIVE_ENROLLMENT_STATUSES.has(normalizeStatus(status));
}

function isPortalReady(status: unknown): boolean {
  const normalized = normalizeStatus(status);
  return normalized === 'ready' || normalized === 'active' || normalized === '';
}

function imagesFrom(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || '').trim()).filter(Boolean);
  }
  const single = String(value || '').trim();
  return single ? [single] : [];
}

function studentTitleFromCourse(course: any, fallback: unknown): string {
  const studentDisplayTitle = String(course?.raw_data?.studentDisplayTitle || '').trim();
  return studentDisplayTitle || String(fallback || course?.title || course?.slug || '').trim();
}

function mergeCourse(target: Map<string, MyCourse>, next: MyCourse) {
  const existing = target.get(next.course_slug);
  if (!existing) {
    target.set(next.course_slug, next);
    return;
  }

  const statusRank: Record<CourseStatus, number> = {
    pending_order: 0,
    approved_waiting_content: 1,
    approved_ready: 2,
  };

  target.set(next.course_slug, {
    ...existing,
    ...next,
    id: next.id.startsWith('course-') ? existing.id : next.id,
    title: next.title || existing.title,
    status: statusRank[next.status] > statusRank[existing.status] ? next.status : existing.status,
    grantedAt: next.grantedAt || existing.grantedAt,
    images: next.images.length > 0 ? next.images : existing.images,
    driveStatus: next.driveStatus || existing.driveStatus,
  });
}

export async function getMyCourses(email: string) {
  const cleanEmail = email.trim().toLowerCase();

  const { data: portalEnrollments, error: enrollError } = await supabaseAdmin
    .from('student_enrollments')
    .select('course_slug, created_at, status, course_name, thumbnail')
    .eq('email', cleanEmail);

  if (enrollError) {
    throw enrollError;
  }

  const portalSlugs = (portalEnrollments || [])
    .map((enrollment) => normalizeSlug(enrollment.course_slug))
    .filter(Boolean);

  let lmsEnrollments: any[] = [];
  let lmsOrders: any[] = [];
  let lmsCourses: any[] = [];

  if (lmsSupabaseAdmin) {
    const [{ data: enrollmentRows, error: lmsEnrollmentError }, { data: orderRows, error: lmsOrderError }] = await Promise.all([
      lmsSupabaseAdmin
        .from('student_enrollments')
        .select('course_slug, status, created_at, updated_at, drive_permission_status')
        .eq('email', cleanEmail),
      lmsSupabaseAdmin
        .from('orders')
        .select('course_slug, course_title, status, created_at, updated_at')
        .eq('customer_email', cleanEmail),
    ]);

    if (lmsEnrollmentError) {
      console.error('Error fetching LMS enrollments in my-courses helper:', lmsEnrollmentError);
    }
    if (lmsOrderError) {
      console.error('Error fetching LMS orders in my-courses helper:', lmsOrderError);
    }

    lmsEnrollments = (enrollmentRows || []).filter((row) => isActiveEnrollment(row.status));
    lmsOrders = (orderRows || []).filter((row) => !isRejectedOrder(row.status));
  }

  const lmsSlugs = [
    ...lmsEnrollments.map((row) => normalizeSlug(row.course_slug)),
    ...lmsOrders.map((row) => normalizeSlug(row.course_slug)),
  ].filter(Boolean);

  const allSlugs = [...new Set([...portalSlugs, ...lmsSlugs])];

  let posts: any[] = [];
  if (allSlugs.length > 0) {
    const { data: pts, error: postsError } = await supabaseAdmin
      .from('posts')
      .select('id, title, course_slug, created_at, images, status')
      .in('course_slug', allSlugs);
    if (postsError) {
      console.error('Error fetching posts in my-courses helper:', postsError);
    }
    if (pts) posts = pts;
  }

  if (lmsSupabaseAdmin && allSlugs.length > 0) {
    const { data: courseRows, error: lmsCourseError } = await lmsSupabaseAdmin
      .from('courses')
      .select('slug, title, raw_data, image_url, active, is_published')
      .in('slug', allSlugs);
    if (lmsCourseError) {
      console.error('Error fetching LMS courses in my-courses helper:', lmsCourseError);
    }
    lmsCourses = (courseRows || []).filter((course) => course.active !== false);
  }

  const postsBySlug = new Map<string, any>();
  for (const post of posts) {
    postsBySlug.set(normalizeSlug(post.course_slug), post);
  }

  const lmsCoursesBySlug = new Map<string, any>();
  for (const course of lmsCourses) {
    lmsCoursesBySlug.set(normalizeSlug(course.slug), course);
  }

  const courses = new Map<string, MyCourse>();

  for (const enrollment of lmsEnrollments) {
    const slug = normalizeSlug(enrollment.course_slug);
    const course = lmsCoursesBySlug.get(slug);
    if (!slug || !course) continue;

    const post = postsBySlug.get(slug);
    const ready = course.is_published === true && Boolean(post?.id);

    mergeCourse(courses, {
      id: post?.id || `course-${slug}`,
      title: studentTitleFromCourse(course, post?.title || slug),
      course_slug: slug,
      status: ready ? 'approved_ready' : 'approved_waiting_content',
      grantedAt: enrollment.created_at || enrollment.updated_at,
      images: imagesFrom(post?.images).length > 0 ? imagesFrom(post?.images) : imagesFrom(course.image_url),
      driveStatus: enrollment.drive_permission_status || undefined,
    });
  }

  for (const order of lmsOrders) {
    const slug = normalizeSlug(order.course_slug);
    const course = lmsCoursesBySlug.get(slug);
    if (!slug || !course) continue;

    const post = postsBySlug.get(slug);
    const ready = course.is_published === true && Boolean(post?.id);
    const status: CourseStatus = isApprovedOrder(order.status)
      ? (ready ? 'approved_ready' : 'approved_waiting_content')
      : 'pending_order';

    mergeCourse(courses, {
      id: post?.id || `course-${slug}`,
      title: studentTitleFromCourse(course, order.course_title || post?.title || slug),
      course_slug: slug,
      status,
      grantedAt: order.updated_at || order.created_at,
      images: imagesFrom(post?.images).length > 0 ? imagesFrom(post?.images) : imagesFrom(course.image_url),
    });
  }

  for (const enrollment of portalEnrollments || []) {
    const slug = normalizeSlug(enrollment.course_slug);
    if (!slug) continue;

    const course = lmsCoursesBySlug.get(slug);
    if (lmsSupabaseAdmin && !course) {
      continue;
    }

    const post = postsBySlug.get(slug);
    let status: CourseStatus = 'approved_waiting_content';

    if (enrollment.status === 'pending_order') {
      status = 'pending_order';
    } else if (course) {
      status = course.is_published === true && Boolean(post?.id) ? 'approved_ready' : 'approved_waiting_content';
    } else if (enrollment.status === 'approved_ready' || enrollment.status === 'approved_waiting_content') {
      status = enrollment.status;
    } else {
      status = isPortalReady(post?.status) ? 'approved_ready' : 'approved_waiting_content';
    }

    mergeCourse(courses, {
      id: post?.id || `course-${slug}`,
      title: course ? studentTitleFromCourse(course, post?.title || enrollment.course_name || slug) : post?.title || enrollment.course_name || slug,
      course_slug: slug,
      status,
      grantedAt: enrollment.created_at,
      images: imagesFrom(post?.images).length > 0
        ? imagesFrom(post?.images)
        : imagesFrom(course?.image_url || enrollment.thumbnail),
      driveStatus: undefined,
    });
  }

  return Array.from(courses.values()).sort((a, b) => {
    const aTime = a.grantedAt ? new Date(a.grantedAt).getTime() : 0;
    const bTime = b.grantedAt ? new Date(b.grantedAt).getTime() : 0;
    return bTime - aTime;
  });
}
