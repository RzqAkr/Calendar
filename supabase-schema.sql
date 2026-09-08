-- Jalankan sekali di Supabase SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  username text unique,
  role text not null default 'member' check (role in ('admin','pembina','member')),
  created_at timestamptz not null default now()
);

create table if not exists public.events (
  id text primary key,
  date date not null,
  payload jsonb not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.assignments (
  id text primary key,
  event_id text not null references public.events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  payload jsonb not null,
  assigned_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.events enable row level security;
alter table public.assignments enable row level security;

create or replace function public.is_manager()
returns boolean language sql security definer set search_path = public
as $$ select exists (select 1 from public.profiles where id = auth.uid() and role in ('admin','pembina')); $$;

drop policy if exists "profiles readable by signed in users" on public.profiles;
create policy "profiles readable by signed in users" on public.profiles for select to authenticated using (true);
drop policy if exists "events readable by signed in users" on public.events;
create policy "events readable by signed in users" on public.events for select to authenticated using (true);
drop policy if exists "managers write events" on public.events;
create policy "managers write events" on public.events for all to authenticated using (public.is_manager()) with check (public.is_manager());
drop policy if exists "assignments readable by owner or manager" on public.assignments;
create policy "assignments readable by owner or manager" on public.assignments for select to authenticated using (user_id = auth.uid() or public.is_manager());
drop policy if exists "managers write assignments" on public.assignments;
create policy "managers write assignments" on public.assignments for all to authenticated using (public.is_manager()) with check (public.is_manager());

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$ begin insert into public.profiles (id, name, username) values (new.id, coalesce(new.raw_user_meta_data->>'name', new.email), new.email) on conflict (id) do nothing; return new; end; $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();
