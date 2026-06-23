-- =========================================================================
-- DATABASE SETUP SCRIPT FOR STUDENT HOMEWORK AND ADMIN SYSTEM
-- Copy and run this script in your Supabase SQL Editor (Dashboard > SQL Editor)
-- =========================================================================

-- 1. Create the posts table
create table if not exists posts (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  recipe text not null, -- Stores formula/details (HTML or Markdown)
  images text[] default array[]::text[], -- Stores list of public image URLs
  views integer default 0 not null, -- Stores aggregate unique view counts
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Create the post_views table for detailed view logs
create table if not exists post_views (
  id uuid default gen_random_uuid() primary key,
  post_id uuid references posts(id) on delete cascade not null,
  session_id text not null,        -- Client-side unique session identifier (cookie)
  ip_address text,                -- Client IP address (for anti-spam/analytics)
  user_agent text,                -- Client browser info
  viewed_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. Create database indexes to ensure high performance
create index if not exists idx_post_views_post_id on post_views(post_id);
create index if not exists idx_post_views_session on post_views(post_id, session_id);

-- 4. Create the secure RPC function to record a view with anti-spam check (10-minute cooldown per session)
create or replace function record_view(
  p_post_id uuid,
  p_session_id text,
  p_ip text,
  p_ua text
)
returns void as $$
declare
  last_view_time timestamp with time zone;
begin
  -- Check if this session viewed this post in the last 10 minutes
  select max(viewed_at) into last_view_time
  from post_views
  where post_id = p_post_id and session_id = p_session_id;

  if last_view_time is null or last_view_time < now() - interval '10 minutes' then
    -- Record new view detail
    insert into post_views (post_id, session_id, ip_address, user_agent)
    values (p_post_id, p_session_id, p_ip, p_ua);

    -- Update aggregate unique views in the posts table
    update posts
    set views = (
      select count(distinct session_id)
      from post_views
      where post_id = p_post_id
    )
    where id = p_post_id;
  end if;
end;
$$ language plpgsql security definer;

-- =========================================================================
-- SETUP SUPABASE STORAGE BUCKET:
-- 1. Go to Supabase Dashboard > Storage
-- 2. Create a new bucket named: post-images
-- 3. Set the bucket to: Public (so anyone can view image URLs)
-- 4. That's it! Admin uploads are done via server-side service role key,
--    so no additional Storage RLS policies are required.
-- =========================================================================
