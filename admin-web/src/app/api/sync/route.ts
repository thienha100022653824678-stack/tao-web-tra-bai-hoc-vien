import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { warmRuntimeConfig } from '@/lib/v2-runtime-controller';

export async function POST(request: NextRequest) {
  // Verify sync secret FIRST — do not warm the runtime cache (which issues a
  // site_config SELECT against DB B) before the request is authenticated.
  // Warming before the 401 would let unauthenticated traffic trigger DB B
  // reads. The 401 stays fail-closed when INTERNAL_SYNC_SECRET is unset.
  const syncSecret = request.headers.get('x-sync-secret');
  const systemSecret = process.env.INTERNAL_SYNC_SECRET;

  if (!systemSecret || syncSecret !== systemSecret) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized: Sync secret is invalid or missing.' },
      { status: 401 }
    );
  }

  // Authenticated only: warm the V2 runtime cache so Admin reports the same
  // active mode as the rest of the platform (LMS/Portal/Shop) during this
  // sync. Safe to call on every request — concurrent calls coalesce into
  // one DB read; never throws.
  await warmRuntimeConfig();

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase/)?.[1] || 'unknown';

    const body = await request.json();
    const { action, courseSlug, title, imageUrl, email } = body || {};

    if (!action) {
      return NextResponse.json({ success: false, error: 'Thiếu action' }, { status: 400 });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 1. SYNC COURSE (Đồng bộ tạo/sửa bài viết liên kết với khóa học)
    // ─────────────────────────────────────────────────────────────────────────
    if (action === 'syncCourse') {
      if (!courseSlug || !title) {
        return NextResponse.json({ success: false, error: 'Thiếu courseSlug hoặc title' }, { status: 400 });
      }

      // Check if a post mapped to this course slug already exists
      const { data: existingPost, error: fetchErr } = await supabaseAdmin
        .from('posts')
        .select('id')
        .eq('course_slug', courseSlug.trim())
        .maybeSingle();

      if (fetchErr) {
        console.error('Error fetching post during sync:', fetchErr);
        return NextResponse.json({ success: false, error: fetchErr.message }, { status: 500 });
      }

      if (existingPost) {
        // Update basic metadata (title and image)
        const { error: updateErr } = await supabaseAdmin
          .from('posts')
          .update({
            title: title.trim(),
            images: imageUrl ? [imageUrl.trim()] : []
          })
          .eq('id', existingPost.id);

        if (updateErr) {
          console.error('Error updating post during sync:', updateErr);
          return NextResponse.json({ success: false, error: updateErr.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, postId: existingPost.id, updated: true, projectRef });
      } else {
        // Insert new post
        const { data: newPost, error: insertErr } = await supabaseAdmin
          .from('posts')
          .insert({
            title: title.trim(),
            recipe: '<h2>Nội dung bài viết sẽ sớm được cập nhật bởi giảng viên.</h2>',
            images: imageUrl ? [imageUrl.trim()] : [],
            views: 0,
            course_slug: courseSlug.trim()
          })
          .select('id')
          .single();

        if (insertErr) {
          console.error('Error inserting post during sync:', insertErr);
          return NextResponse.json({ success: false, error: insertErr.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, postId: newPost.id, created: true, projectRef });
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 2. SYNC ENROLLMENT (Duyệt cấp quyền Gmail học viên xem bài viết)
    // ─────────────────────────────────────────────────────────────────────────
    if (action === 'syncEnrollment') {
      if (!email || !courseSlug) {
        return NextResponse.json({ success: false, error: 'Thiếu email hoặc courseSlug' }, { status: 400 });
      }

      const cleanEmail = email.toLowerCase().trim();

      const { data: enrollment, error: upsertErr } = await supabaseAdmin
        .from('student_enrollments')
        .upsert({
          email: cleanEmail,
          course_slug: courseSlug.trim(),
          status: 'active',
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'email,course_slug'
        })
        .select()
        .single();

      if (upsertErr) {
        console.error('Error upserting enrollment access:', upsertErr);
        return NextResponse.json({ success: false, error: upsertErr.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, enrollment, projectRef });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 3. REVOKE ENROLLMENT (Thu hồi quyền Gmail học viên)
    // ─────────────────────────────────────────────────────────────────────────
    if (action === 'revokeEnrollment') {
      if (!email || !courseSlug) {
        return NextResponse.json({ success: false, error: 'Thiếu email hoặc courseSlug' }, { status: 400 });
      }

      const cleanEmail = email.toLowerCase().trim();

      const { error: deleteErr } = await supabaseAdmin
        .from('student_enrollments')
        .delete()
        .eq('email', cleanEmail)
        .eq('course_slug', courseSlug.trim());

      if (deleteErr) {
        console.error('Error deleting enrollment access:', deleteErr);
        return NextResponse.json({ success: false, error: deleteErr.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, projectRef });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 4. SYNC RECIPE (Đồng bộ công thức từ bài học LMS sang bài viết tương ứng)
    // ─────────────────────────────────────────────────────────────────────────
    if (action === 'syncRecipe') {
      const { courseSlug, recipe, title } = body || {};
      if (!courseSlug) {
        return NextResponse.json({ success: false, error: 'Thiếu courseSlug' }, { status: 400 });
      }

      // Check if a post mapped to this course slug already exists
      const { data: existingPost, error: fetchErr } = await supabaseAdmin
        .from('posts')
        .select('id')
        .eq('course_slug', courseSlug.trim())
        .maybeSingle();

      if (fetchErr) {
        console.error('Error fetching post during recipe sync:', fetchErr);
        return NextResponse.json({ success: false, error: fetchErr.message }, { status: 500 });
      }

      if (existingPost) {
        // Update recipe and optionally title
        const updatePayload: any = {
          recipe: recipe || ''
        };
        if (title) updatePayload.title = title.trim();

        const { error: updateErr } = await supabaseAdmin
          .from('posts')
          .update(updatePayload)
          .eq('id', existingPost.id);

        if (updateErr) {
          console.error('Error updating post recipe during sync:', updateErr);
          return NextResponse.json({ success: false, error: updateErr.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, postId: existingPost.id, updated: true, projectRef });
      } else {
        // Insert new post
        const { data: newPost, error: insertErr } = await supabaseAdmin
          .from('posts')
          .insert({
            title: (title || 'Bài học mới').trim(),
            recipe: recipe || '',
            images: [],
            views: 0,
            course_slug: courseSlug.trim(),
            created_at: new Date().toISOString()
          })
          .select('id')
          .single();

        if (insertErr) {
          console.error('Error inserting new post during recipe sync:', insertErr);
          return NextResponse.json({ success: false, error: insertErr.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, postId: newPost.id, created: true, projectRef });
      }
    }

    return NextResponse.json({ success: false, error: 'Action không hợp lệ', projectRef }, { status: 400 });
  } catch (err: any) {
    console.error('Sync POST handler error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
