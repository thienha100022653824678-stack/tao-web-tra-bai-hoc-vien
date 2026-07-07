import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// 1. GET: Fetch list of all posts with their metadata and views stats
export async function GET() {
  try {
    // Select posts and aggregate count of total views from post_views table
    const { data: posts, error } = await supabaseAdmin
      .from('posts')
      .select('*, post_views(count)');

    if (error) {
      console.error('Error fetching posts in API:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    // Fetch view logs to calculate global unique IPs and track newest view times
    const { data: viewsData, error: viewsError } = await supabaseAdmin
      .from('post_views')
      .select('post_id, ip_address, viewed_at')
      .order('viewed_at', { ascending: false });

    // 1. Count global unique IP addresses across all posts
    const globalUniqueViews = viewsError ? 0 : new Set(viewsData?.map((v: any) => v.ip_address).filter(Boolean)).size;

    // 2. Map post_id to its latest view time (first occurrence in descending ordered list)
    const latestViewMap: Record<string, string> = {};
    if (viewsData) {
      viewsData.forEach((v: any) => {
        if (v.post_id && !latestViewMap[v.post_id]) {
          latestViewMap[v.post_id] = v.viewed_at;
        }
      });
    }

    // Map data to return flat structure with total_views and last_viewed_at
    const formattedPosts = posts?.map((post: any) => ({
      id: post.id,
      title: post.title,
      recipe: post.recipe,
      images: post.images || [],
      unique_views: post.views, // Aggregated unique views (IP count per post)
      total_views: post.post_views?.[0]?.count || 0, // Total raw view records for this post
      created_at: post.created_at,
      last_viewed_at: latestViewMap[post.id] || null,
    })) || [];

    // Sort posts: newest view time first (last_viewed_at), falling back to creation time (created_at)
    formattedPosts.sort((a: any, b: any) => {
      const timeA = new Date(a.last_viewed_at || a.created_at).getTime();
      const timeB = new Date(b.last_viewed_at || b.created_at).getTime();
      return timeB - timeA;
    });

    return NextResponse.json({ 
      success: true, 
      posts: formattedPosts,
      global_unique_views: globalUniqueViews 
    });
  } catch (err: any) {
    console.error('System error listing posts:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// 2. POST: Create a new post
export async function POST(request: Request) {
  try {
    const { title, recipe, images, source } = await request.json();

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
        views: 0,
        source: source || 'main_admin'
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
