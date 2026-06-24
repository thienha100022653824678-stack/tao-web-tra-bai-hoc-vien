import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// POST: Bulk import posts from Excel data
export async function POST(request: Request) {
  try {
    const { posts } = await request.json();

    if (!posts || !Array.isArray(posts) || posts.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Danh sách bài học trống hoặc không hợp lệ' },
        { status: 400 }
      );
    }

    // Map rows to Supabase schema format
    const postsToInsert = posts.map((post: any) => ({
      title: String(post.title || post.normalized_title || '').trim(),
      recipe: String(post.recipe || '').trim(),
      images: [], // Default empty array for images as per YÊU CẦU 1
      views: 0,   // Default to 0 views
      telegram_chat_id: post.telegram_chat_id ? String(post.telegram_chat_id).trim() : null,
      original_channel_name: post.original_channel_name ? String(post.original_channel_name).trim() : null,
    }));

    // Validate that all records have at least a title and recipe
    const invalidPost = postsToInsert.find((p) => !p.title || !p.recipe);
    if (invalidPost) {
      return NextResponse.json(
        { success: false, error: 'Tất cả bài học phải có tiêu đề và nội dung công thức' },
        { status: 400 }
      );
    }

    // Bulk insert posts in one transaction
    const { data: insertedData, error: insertError } = await supabaseAdmin
      .from('posts')
      .insert(postsToInsert)
      .select();

    if (insertError) {
      console.error('Error during bulk post insert:', insertError);
      return NextResponse.json(
        { success: false, error: insertError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Đã import thành công ${insertedData?.length || 0} bài học`,
      posts: insertedData,
    });
  } catch (err: any) {
    console.error('System error in bulk import:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Lỗi hệ thống không xác định' },
      { status: 500 }
    );
  }
}
