-- MIGRATION SCRIPT FOR LMS MAPPING ON SYSTEM 1 (SUPABASE A)
-- Chạy đoạn script này trong Supabase SQL Editor của Hệ thống 1 (yeunauan.live)

-- 1. Bổ sung cột lms_course_slug vào bảng posts để lưu trữ mapping slug khóa học của LMS
ALTER TABLE posts ADD COLUMN IF NOT EXISTS lms_course_slug text;
