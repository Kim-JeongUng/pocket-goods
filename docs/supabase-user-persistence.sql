-- Pocket Goods user persistence tables.
-- Run this once in Supabase Dashboard > SQL Editor for the project used by
-- NEXT_PUBLIC_SUPABASE_URL / SUPABASE_URL.

create extension if not exists pgcrypto;

create table if not exists public.user_order_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  buyer_name text not null default '',
  buyer_phone text not null default '',
  buyer_email text not null default '',
  zipcode text not null default '',
  address_line1 text not null default '',
  address_line2 text not null default '',
  memo text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.user_order_profiles enable row level security;

drop policy if exists "Users can read their own order profile" on public.user_order_profiles;
create policy "Users can read their own order profile"
  on public.user_order_profiles
  for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own order profile" on public.user_order_profiles;
create policy "Users can insert their own order profile"
  on public.user_order_profiles
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own order profile" on public.user_order_profiles;
create policy "Users can update their own order profile"
  on public.user_order_profiles
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own order profile" on public.user_order_profiles;
create policy "Users can delete their own order profile"
  on public.user_order_profiles
  for delete
  using (auth.uid() = user_id);

create table if not exists public.user_design_drafts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  product_type text not null default 'sticker',
  output_size text not null default 'A5',
  canvas_json jsonb not null,
  thumbnail text,
  updated_at timestamptz not null default now()
);

alter table public.user_design_drafts
  add column if not exists output_size text not null default 'A5';

alter table public.user_design_drafts enable row level security;

drop policy if exists "Users can read their own design draft" on public.user_design_drafts;
create policy "Users can read their own design draft"
  on public.user_design_drafts
  for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own design draft" on public.user_design_drafts;
create policy "Users can insert their own design draft"
  on public.user_design_drafts
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own design draft" on public.user_design_drafts;
create policy "Users can update their own design draft"
  on public.user_design_drafts
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own design draft" on public.user_design_drafts;
create policy "Users can delete their own design draft"
  on public.user_design_drafts
  for delete
  using (auth.uid() = user_id);

create table if not exists public.user_design_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_type text not null default 'sticker',
  output_size text not null default 'A5',
  canvas_json jsonb not null,
  thumbnail text,
  created_at timestamptz not null default now()
);

create index if not exists user_design_snapshots_user_id_created_at_idx
  on public.user_design_snapshots (user_id, created_at desc);

alter table public.user_design_snapshots enable row level security;

drop policy if exists "Users can read their own design snapshots" on public.user_design_snapshots;
create policy "Users can read their own design snapshots"
  on public.user_design_snapshots
  for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own design snapshots" on public.user_design_snapshots;
create policy "Users can insert their own design snapshots"
  on public.user_design_snapshots
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own design snapshots" on public.user_design_snapshots;
create policy "Users can update their own design snapshots"
  on public.user_design_snapshots
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own design snapshots" on public.user_design_snapshots;
create policy "Users can delete their own design snapshots"
  on public.user_design_snapshots
  for delete
  using (auth.uid() = user_id);
