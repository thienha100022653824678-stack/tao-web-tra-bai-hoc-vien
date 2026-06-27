-- KỊCH BẢN MIGRATION SQL CHO HỆ THỐNG 1 (CỔNG TRẢ BÀI HỌC VIÊN FREE)
-- Chạy đoạn script này trong Supabase SQL Editor của Hệ thống 1 (yeunauan.live)

-- 1. Thêm cột course_slug vào bảng posts để liên kết với khóa học khóa quyền từ Hệ thống 2
alter table posts add column if not exists course_slug text;

-- 2. Tạo bảng gated_posts_access để lưu danh sách Gmail học viên được cấp quyền truy cập từng khóa học
create table if not exists gated_posts_access (
  id uuid default gen_random_uuid() primary key,
  email text not null,
  course_slug text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique (email, course_slug)
);

-- 3. Tạo index tối ưu hóa việc kiểm tra quyền truy cập theo Gmail và course_slug
create index if not exists idx_gated_posts_access_lookup on gated_posts_access(email, course_slug);
