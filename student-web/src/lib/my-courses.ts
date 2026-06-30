import { supabaseAdmin } from './supabase';

export async function getMyCourses(email: string) {
  const cleanEmail = email.trim().toLowerCase();

  // 1. Fetch enrollments
  const { data: enrollments, error: enrollError } = await supabaseAdmin
    .from('student_enrollments')
    .select('course_slug, created_at, status')
    .eq('email', cleanEmail);

  if (enrollError) {
    throw enrollError;
  }

  if (!enrollments || enrollments.length === 0) {
    return [];
  }

  // 2. Fetch posts mapping to these slugs
  const slugs = enrollments.map(e => String(e.course_slug || '').trim()).filter(Boolean);
  let posts: any[] = [];
  if (slugs.length > 0) {
    const { data: pts, error: postsError } = await supabaseAdmin
      .from('posts')
      .select('id, title, course_slug, created_at, images, status')
      .in('course_slug', slugs);
    if (postsError) {
      console.error('Error fetching posts in helper:', postsError);
    }
    if (pts) posts = pts;
  }

  const postsBySlug = new Map<string, any>();
  for (const post of posts) {
    postsBySlug.set(String(post.course_slug || '').trim(), post);
  }

  // 3. Map status and return aggregated list
  return enrollments.map(enrollment => {
    const slug = String(enrollment.course_slug || '').trim();
    const post = postsBySlug.get(slug);

    let status: 'pending_order' | 'approved_waiting_content' | 'approved_ready' = 'approved_waiting_content';
    
    if (enrollment.status === 'pending_order') {
      status = 'pending_order';
    } else {
      // Post status checks (ready or active or null fallback)
      const isReady = post ? (post.status === 'ready' || post.status === 'active' || !post.status) : false;
      status = isReady ? 'approved_ready' : 'approved_waiting_content';
    }

    return {
      id: post?.id || `course-${slug}`,
      title: post?.title || slug,
      course_slug: slug,
      status,
      grantedAt: enrollment.created_at,
      images: post?.images || []
    };
  });
}
