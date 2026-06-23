import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

interface RouteParams {
  params: Promise<{
    id: string;
  }>;
}

// 1. GET: Fetch post details and detailed view logs (up to 200 logs)
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;

    // Fetch post details
    const { data: post, error: postError } = await supabaseAdmin
      .from('posts')
      .select('*')
      .eq('id', id)
      .single();

    if (postError || !post) {
      console.error('Error fetching post:', postError);
      return NextResponse.json({ success: false, error: 'Không tìm thấy bài viết' }, { status: 404 });
    }

    // Fetch detailed view logs
    const { data: logs, error: logsError } = await supabaseAdmin
      .from('post_views')
      .select('*')
      .eq('post_id', id)
      .order('viewed_at', { ascending: false })
      .limit(200);

    if (logsError) {
      console.error('Error fetching view logs:', logsError);
      // Don't fail the whole request just because logs failed
    }

    // Fetch total raw view count
    const { count: totalViewsCount, error: countError } = await supabaseAdmin
      .from('post_views')
      .select('*', { count: 'exact', head: true })
      .eq('post_id', id);

    return NextResponse.json({
      success: true,
      post: {
        ...post,
        unique_views: post.views,
        total_views: totalViewsCount || 0,
      },
      logs: logs || [],
    });
  } catch (err: any) {
    console.error('System error in GET post:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// 2. PUT: Update post details (title, recipe, images) or override view count
export async function PUT(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const { title, recipe, images, views } = await request.json();

    const updateData: any = {};
    if (title !== undefined) updateData.title = title;
    if (recipe !== undefined) updateData.recipe = recipe;
    if (images !== undefined) updateData.images = images;
    if (views !== undefined) updateData.views = Number(views);

    const { data: updatedPost, error } = await supabaseAdmin
      .from('posts')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating post:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, post: updatedPost });
  } catch (err: any) {
    console.error('System error in PUT post:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// 3. DELETE: Remove post
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;

    const { error } = await supabaseAdmin
      .from('posts')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting post:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('System error in DELETE post:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
