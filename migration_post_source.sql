-- MIGRATION SQL: PHÂN BIỆT NGUỒN GỐC BÀI VIẾT TRÊN CỔNG HỌC VIÊN
-- Chạy script này trong Supabase SQL Editor của hệ thống yeunauan.live (Dự án crphwjizolsgghapyjjv)

-- 1. Thêm cột source vào bảng posts để phân biệt nguồn gốc bài viết
alter table posts add column if not exists source text default 'main_admin';

-- 2. Cập nhật các bài viết hiện tại đã có course_slug không phải null sang shop_admin (nếu cần), hoặc giữ mặc định
-- (Tùy chọn: các bài viết cũ đã liên kết với khóa học trả phí có thể mặc định là shop_admin)
update posts set source = 'shop_admin' where course_slug is not null;
