import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// 1. GET: Fetch list of all posts with their metadata and views stats
export async function GET() {
  try {
    // Select posts and aggregate count of total views from post_views table
    const { data: posts, error } = await supabaseAdmin
      .from('posts')
      .select('*, post_views(count)')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching posts in API:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    // Map data to return flat structure with total_views
    const formattedPosts = posts?.map((post: any) => ({
      id: post.id,
      title: post.title,
      recipe: post.recipe,
      images: post.images || [],
      unique_views: post.views, // Aggregated unique session count
      total_views: post.post_views?.[0]?.count || 0, // Total raw view records
      created_at: post.created_at,
    })) || [];

    return NextResponse.json({ success: true, posts: formattedPosts });
  } catch (err: any) {
    console.error('System error listing posts:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// 2. POST: Create a new post
export async function POST(request: Request) {
  try {
    const { title, recipe, images } = await request.json();

    if (!title) {
      return NextResponse.json({ success: false, error: 'Tiêu đề không được để trống' }, { status: 400 });
    }
    if (!recipe) {
      return NextResponse.json({ success: false, error: 'Công thức không được để trống' }, { status: 400 });
    }

    const { data: newPost, error } = await supabaseAdmin
      .from('posts')
      .insert({
        title,
        recipe,
        images: images || [],
        views: 0
      })
      .select()
      .single();

    if (error) {
      console.error('Error inserting post in API:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, post: newPost });
  } catch (err: any) {
    console.error('System error creating post:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
