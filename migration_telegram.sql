-- Migration: Add Telegram-related fields to posts table
-- Copy and run this script in your Supabase SQL Editor (Dashboard > SQL Editor)

alter table posts add column if not exists telegram_chat_id text;
alter table posts add column if not exists original_channel_name text;
