-- =============================================================
-- WorkOrder app - Supabase schema
-- Run this once in Supabase Studio -> SQL Editor -> New query -> Run
-- Safe to re-run: everything is guarded with "if not exists" / "drop ... if exists"
-- =============================================================

-- ---------- extensions ----------
create extension if not exists "pgcrypto";

-- ---------- helper: updated_at ----------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;


-- =============================================================
-- profiles  (one row per signed-in user)
-- =============================================================
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  full_name   text,
  phone       text,
  role        text not null default 'member' check (role in ('admin','member')),
  is_worker   boolean not null default true,   -- can be assigned to jobs
  is_active   boolean not null default true,
  color       text,                            -- avatar tint, e.g. '#f97316'
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- auto-create a profile whenever someone signs up
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- =============================================================
-- customers  (saved so nobody retypes the same person twice)
-- =============================================================
create table if not exists public.customers (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  phone        text,
  email        text,
  unit_number  text,
  building     text,
  address      text,
  notes        text,
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

drop trigger if exists customers_touch on public.customers;
create trigger customers_touch before update on public.customers
  for each row execute function public.touch_updated_at();

create index if not exists customers_name_idx    on public.customers (lower(name));
create index if not exists customers_phone_idx   on public.customers (phone);
create index if not exists customers_unit_idx    on public.customers (unit_number);


-- =============================================================
-- work_orders
-- =============================================================
create sequence if not exists public.work_order_no_seq start 1001;

create table if not exists public.work_orders (
  id               uuid primary key default gen_random_uuid(),
  order_no         bigint not null default nextval('public.work_order_no_seq'),
  title            text not null,
  description      text,
  category         text,          -- Plumbing / Electrical / Aircon / ...
  priority         text not null default 'normal'
                     check (priority in ('low','normal','high','urgent')),
  status           text not null default 'open'
                     check (status in ('open','scheduled','in_progress','on_hold','completed','cancelled')),
  customer_id      uuid references public.customers(id) on delete set null,
  -- snapshot of the site at the time of the job (so history stays correct
  -- even if the customer record is edited later)
  site_unit_number text,
  site_building    text,
  site_address     text,
  scheduled_start  timestamptz,
  scheduled_end    timestamptz,
  completed_at     timestamptz,
  created_by       uuid references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

drop trigger if exists work_orders_touch on public.work_orders;
create trigger work_orders_touch before update on public.work_orders
  for each row execute function public.touch_updated_at();

create unique index if not exists work_orders_order_no_idx on public.work_orders (order_no);
create index if not exists work_orders_status_idx    on public.work_orders (status);
create index if not exists work_orders_sched_idx     on public.work_orders (scheduled_start);
create index if not exists work_orders_customer_idx  on public.work_orders (customer_id);

-- keep completed_at in sync with status
create or replace function public.sync_completed_at()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'completed' and (old.status is distinct from 'completed') then
    new.completed_at = now();
  elsif new.status <> 'completed' then
    new.completed_at = null;
  end if;
  return new;
end;
$$;

drop trigger if exists work_orders_completed on public.work_orders;
create trigger work_orders_completed before update on public.work_orders
  for each row execute function public.sync_completed_at();


-- =============================================================
-- work_order_assignees  (many workers per job)
-- =============================================================
create table if not exists public.work_order_assignees (
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  profile_id    uuid not null references public.profiles(id)    on delete cascade,
  assigned_at   timestamptz not null default now(),
  primary key (work_order_id, profile_id)
);

create index if not exists woa_profile_idx on public.work_order_assignees (profile_id);


-- =============================================================
-- work_order_notes  (activity log + comments)
-- =============================================================
create table if not exists public.work_order_notes (
  id            uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  author_id     uuid references public.profiles(id) on delete set null,
  body          text not null,
  kind          text not null default 'comment' check (kind in ('comment','system')),
  created_at    timestamptz not null default now()
);

create index if not exists notes_order_idx on public.work_order_notes (work_order_id, created_at);


-- =============================================================
-- Row Level Security
-- This is a small trusted crew: every signed-in user can see and edit
-- the shared board. Anonymous visitors get nothing.
-- =============================================================
alter table public.profiles            enable row level security;
alter table public.customers           enable row level security;
alter table public.work_orders         enable row level security;
alter table public.work_order_assignees enable row level security;
alter table public.work_order_notes    enable row level security;

-- profiles: everyone signed in can read the team; you edit your own row,
-- admins can edit anyone.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated using (true);

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update to authenticated
  using (
    id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles
  for insert to authenticated with check (id = auth.uid());

drop policy if exists profiles_delete on public.profiles;
create policy profiles_delete on public.profiles
  for delete to authenticated using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- customers: shared address book
drop policy if exists customers_all on public.customers;
create policy customers_all on public.customers
  for all to authenticated using (true) with check (true);

-- work orders: admins see and manage everything. Members only see jobs
-- they created or are assigned to, and can only update jobs assigned to
-- them (status changes etc). Only admins can delete a job.
drop policy if exists work_orders_all on public.work_orders;

drop policy if exists work_orders_insert on public.work_orders;
create policy work_orders_insert on public.work_orders
  for insert to authenticated with check (true);

drop policy if exists work_orders_select on public.work_orders;
create policy work_orders_select on public.work_orders
  for select to authenticated using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
    or created_by = auth.uid()
    or exists (
      select 1 from public.work_order_assignees wa
      where wa.work_order_id = work_orders.id and wa.profile_id = auth.uid()
    )
  );

drop policy if exists work_orders_update on public.work_orders;
create policy work_orders_update on public.work_orders
  for update to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
    or exists (
      select 1 from public.work_order_assignees wa
      where wa.work_order_id = work_orders.id and wa.profile_id = auth.uid()
    )
  )
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
    or exists (
      select 1 from public.work_order_assignees wa
      where wa.work_order_id = work_orders.id and wa.profile_id = auth.uid()
    )
  );

drop policy if exists work_orders_delete on public.work_orders;
create policy work_orders_delete on public.work_orders
  for delete to authenticated using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

drop policy if exists woa_all on public.work_order_assignees;
create policy woa_all on public.work_order_assignees
  for all to authenticated using (true) with check (true);

-- notes: readable only if you can already see the parent work order;
-- anyone with access can add a note; you can only delete your own
drop policy if exists notes_select on public.work_order_notes;
create policy notes_select on public.work_order_notes
  for select to authenticated using (
    exists (
      select 1 from public.work_orders wo
      where wo.id = work_order_notes.work_order_id
      and (
        exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
        or wo.created_by = auth.uid()
        or exists (
          select 1 from public.work_order_assignees wa
          where wa.work_order_id = wo.id and wa.profile_id = auth.uid()
        )
      )
    )
  );

drop policy if exists notes_insert on public.work_order_notes;
create policy notes_insert on public.work_order_notes
  for insert to authenticated with check (author_id = auth.uid());

drop policy if exists notes_delete on public.work_order_notes;
create policy notes_delete on public.work_order_notes
  for delete to authenticated using (author_id = auth.uid());


-- =============================================================
-- Realtime  (so all 8 users see changes live)
-- =============================================================
do $$
begin
  begin execute 'alter publication supabase_realtime add table public.work_orders';          exception when duplicate_object then null; end;
  begin execute 'alter publication supabase_realtime add table public.work_order_assignees'; exception when duplicate_object then null; end;
  begin execute 'alter publication supabase_realtime add table public.customers';            exception when duplicate_object then null; end;
  begin execute 'alter publication supabase_realtime add table public.work_order_notes';     exception when duplicate_object then null; end;
end $$;
