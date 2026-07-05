import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

const PORTAL_RECIPE_PLACEHOLDER = 'noi dung bai viet se som duoc cap nhat boi giang vien';
const MIN_REAL_RECIPE_CHARS = 40;
const TITLE_ONLY_RECIPE_TEXTS = new Set([
  'tai lieu lop hoc',
  'tai lieu khoa hoc',
  'tong quan',
  'chua co mo ta ngan'
]);

function normalizePlainText(value: unknown) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ');
}

function hasRealRecipeText(value: unknown) {
  const normalized = normalizePlainText(value);
  if (!normalized || normalized.length < MIN_REAL_RECIPE_CHARS) return false;
  if (normalized.includes(PORTAL_RECIPE_PLACEHOLDER)) return false;
  if (TITLE_ONLY_RECIPE_TEXTS.has(normalized)) return false;
  return true;
}

export async function POST(request: NextRequest) {
  // Verify sync secret
  const syncSecret = request.headers.get('x-sync-secret');
  const systemSecret = process.env.INTERNAL_SYNC_SECRET;

  if (!systemSecret || syncSecret !== systemSecret) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized: Sync secret is invalid or missing.' },
      { status: 401 }
    );
  }

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
      const { courseSlug, title, imageUrl, isPublished } = body || {};
      if (!courseSlug || !title) {
        return NextResponse.json({ success: false, error: 'Thiếu courseSlug hoặc title' }, { status: 400 });
      }

      const slug = courseSlug.trim();
      const isPub = isPublished === true || isPublished === "true";
      const targetStatus = isPub ? 'ready' : 'waiting';

      // Check if a post mapped to this course slug already exists
      const { data: existingPost, error: fetchErr } = await supabaseAdmin
        .from('posts')
        .select('id')
        .eq('course_slug', slug)
        .maybeSingle();

      if (fetchErr) {
        console.error('Error fetching post during sync:', fetchErr);
        return NextResponse.json({ success: false, error: fetchErr.message }, { status: 500 });
      }

      let postId = '';
      if (existingPost) {
        postId = existingPost.id;
        // Update basic metadata and status
        const { error: updateErr } = await supabaseAdmin
          .from('posts')
          .update({
            title: title.trim(),
            images: imageUrl ? [imageUrl.trim()] : [],
            status: targetStatus
          })
          .eq('id', postId);

        if (updateErr) {
          console.error('Error updating post during sync:', updateErr);
          return NextResponse.json({ success: false, error: updateErr.message }, { status: 500 });
        }
      } else {
        // Insert new post
        const { data: newPost, error: insertErr } = await supabaseAdmin
          .from('posts')
          .insert({
            title: title.trim(),
            recipe: '<h2>Nội dung bài viết sẽ sớm được cập nhật bởi giảng viên.</h2>',
            images: imageUrl ? [imageUrl.trim()] : [],
            views: 0,
            course_slug: slug,
            status: targetStatus
          })
          .select('id')
          .single();

        if (insertErr) {
          console.error('Error inserting post during sync:', insertErr);
          return NextResponse.json({ success: false, error: insertErr.message }, { status: 500 });
        }
        postId = newPost.id;
      }

      // Propagate enrollments status
      if (isPub) {
        await supabaseAdmin
          .from('student_enrollments')
          .update({ status: 'approved_ready' })
          .eq('course_slug', slug)
          .in('status', ['approved_waiting_content', 'active']);
      } else {
        await supabaseAdmin
          .from('student_enrollments')
          .update({ status: 'approved_waiting_content' })
          .eq('course_slug', slug)
          .in('status', ['approved_ready', 'active']);
      }

      return NextResponse.json({ success: true, postId, updated: true, projectRef });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 2. SYNC ENROLLMENT (Duyệt cấp quyền Gmail học viên xem bài viết)
    // ─────────────────────────────────────────────────────────────────────────
    if (action === 'syncEnrollment') {
      if (!email || !courseSlug) {
        return NextResponse.json({ success: false, error: 'Thiếu email hoặc courseSlug' }, { status: 400 });
      }

      const cleanEmail = email.toLowerCase().trim();

      // Determine course readiness status from posts table
      const { data: post } = await supabaseAdmin
        .from('posts')
        .select('status')
        .eq('course_slug', courseSlug.trim())
        .maybeSingle();

      const isReady = post ? (post.status === 'ready' || post.status === 'active' || !post.status) : false;
      const targetStatus = isReady ? 'approved_ready' : 'approved_waiting_content';

      const { data: enrollment, error: upsertErr } = await supabaseAdmin
        .from('student_enrollments')
        .upsert({
          email: cleanEmail,
          course_slug: courseSlug.trim(),
          status: targetStatus,
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
    // 2.5 SYNC PENDING ORDER (Đồng bộ đơn hàng chờ duyệt sang Portal)
    // ─────────────────────────────────────────────────────────────────────────
    if (action === 'syncPendingOrder') {
      const { courseName, thumbnail } = body || {};
      if (!email || !courseSlug) {
        return NextResponse.json({ success: false, error: 'Thiếu email hoặc courseSlug' }, { status: 400 });
      }

      const cleanEmail = email.toLowerCase().trim();

      const { data: enrollment, error: upsertErr } = await supabaseAdmin
        .from('student_enrollments')
        .upsert({
          email: cleanEmail,
          course_slug: courseSlug.trim(),
          course_name: courseName ? courseName.trim() : null,
          thumbnail: thumbnail ? thumbnail.trim() : null,
          status: 'pending_order',
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'email,course_slug'
        })
        .select()
        .single();

      if (upsertErr) {
        console.error('Error upserting pending order enrollment:', upsertErr);
        return NextResponse.json({ success: false, error: upsertErr.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, enrollment, projectRef });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 2.6 SYNC COURSE PUBLISH STATUS (Cập nhật trạng thái xuất bản từ LMS)
    // ─────────────────────────────────────────────────────────────────────────
    if (action === 'syncCoursePublishStatus') {
      const { courseSlug, isPublished, title, imageUrl } = body || {};
      if (!courseSlug) {
        return NextResponse.json({ success: false, error: 'Thiếu courseSlug' }, { status: 400 });
      }

      const slug = courseSlug.trim();
      const isPub = isPublished === true || isPublished === "true";
      const targetStatus = isPub ? 'ready' : 'waiting';

      // 1. Check if post exists, if not, create it. If yes, update status, title, image.
      const { data: existingPost } = await supabaseAdmin
        .from('posts')
        .select('id, status')
        .eq('course_slug', slug)
        .maybeSingle();

      let postId = '';
      if (existingPost) {
        postId = existingPost.id;
        const { error: updateErr } = await supabaseAdmin
          .from('posts')
          .update({
            status: targetStatus,
            title: title ? title.trim() : undefined,
            images: imageUrl ? [imageUrl.trim()] : undefined
          })
          .eq('id', postId);

        if (updateErr) {
          console.error('Error updating post status during publish status sync:', updateErr);
          return NextResponse.json({ success: false, error: updateErr.message }, { status: 500 });
        }
      } else {
        const { data: newPost, error: insertErr } = await supabaseAdmin
          .from('posts')
          .insert({
            title: (title || 'Bài học mới').trim(),
            recipe: '<h2>Nội dung bài viết sẽ sớm được cập nhật bởi giảng viên.</h2>',
            images: imageUrl ? [imageUrl.trim()] : [],
            views: 0,
            course_slug: slug,
            status: targetStatus,
            created_at: new Date().toISOString()
          })
          .select('id')
          .single();

        if (insertErr) {
          console.error('Error inserting post during publish status sync:', insertErr);
          return NextResponse.json({ success: false, error: insertErr.message }, { status: 500 });
        }
        postId = newPost.id;
      }

      // 2. Update enrollments status
      if (isPub) {
        await supabaseAdmin
          .from('student_enrollments')
          .update({ status: 'approved_ready' })
          .eq('course_slug', slug)
          .in('status', ['approved_waiting_content', 'active']);

        // Trigger Email 2 (Khóa học sẵn sàng) to all enrolled students
        triggerCourseReadyEmails(slug, title || slug).catch(console.error);
      } else {
        await supabaseAdmin
          .from('student_enrollments')
          .update({ status: 'approved_waiting_content' })
          .eq('course_slug', slug)
          .in('status', ['approved_ready', 'active']);
      }

      return NextResponse.json({ success: true, postId, isPublished: isPub, projectRef });
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
      const { courseSlug, recipe, title, createIfMissing = true } = body || {};
      if (!courseSlug) {
        return NextResponse.json({ success: false, error: 'Thiếu courseSlug' }, { status: 400 });
      }

      if (!hasRealRecipeText(recipe)) {
        return NextResponse.json({
          success: true,
          skipped: true,
          reason: 'no_real_recipe',
          projectRef
        });
      }

      // Check if a post mapped to this course slug already exists
      const { data: existingPost, error: fetchErr } = await supabaseAdmin
        .from('posts')
        .select('id, recipe, title')
        .eq('course_slug', courseSlug.trim())
        .maybeSingle();

      if (fetchErr) {
        console.error('Error fetching post during recipe sync:', fetchErr);
        return NextResponse.json({ success: false, error: fetchErr.message }, { status: 500 });
      }

      if (existingPost) {
        // Update recipe and optionally title (do NOT touch status or enrollments)
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
      } else if (createIfMissing === false) {
        return NextResponse.json({
          success: true,
          skipped: true,
          reason: 'post_not_found',
          courseSlug: courseSlug.trim(),
          projectRef
        });
      } else {
        // Insert new post with default status 'waiting'
        const { data: newPost, error: insertErr } = await supabaseAdmin
          .from('posts')
          .insert({
            title: (title || 'Bài học mới').trim(),
            recipe: recipe || '',
            images: [],
            views: 0,
            course_slug: courseSlug.trim(),
            status: 'waiting',
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

// ─────────────────────────────────────────────────────────────────────────
// EMAIL NOTIFICATION HOOKS & HELPERS (GIAI ĐOẠN 20)
// ─────────────────────────────────────────────────────────────────────────

async function sendCourseReadyEmail(email: string, courseName: string) {
  console.log(`[Email Hook - TODO] Gửi email số 2 hoàn tất nội dung đến ${email} cho khóa ${courseName}`);
  
  // TODO: Cấu hình SMTP / Resend / Gmail API tại đây để gửi email thực tế
  // Ví dụ sử dụng Resend:
  // const resend = new Resend(process.env.RESEND_API_KEY);
  // await resend.emails.send({
  //   from: 'Culinary Academy <academy@yeunauan.live>',
  //   to: email,
  //   subject: `Khóa học ${courseName} đã hoàn tất nội dung`,
  //   html: `<p>Khóa học <strong>${courseName}</strong> đã hoàn tất nội dung.</p>
  //          <p>Bạn có thể vào học ngay tại: <a href="https://yeunauan.live/my-courses">https://yeunauan.live/my-courses</a></p>`
  // });
}

async function triggerCourseReadyEmails(courseSlug: string, courseTitle: string) {
  try {
    const { data: enrollments } = await supabaseAdmin
      .from('student_enrollments')
      .select('email')
      .eq('course_slug', courseSlug)
      .in('status', ['approved_ready', 'approved_waiting_content', 'active']);

    if (enrollments && enrollments.length > 0) {
      for (const enroll of enrollments) {
        if (enroll.email) {
          await sendCourseReadyEmail(enroll.email.trim().toLowerCase(), courseTitle);
        }
      }
    }
  } catch (err) {
    console.error('Failed to trigger course ready emails:', err);
  }
}
