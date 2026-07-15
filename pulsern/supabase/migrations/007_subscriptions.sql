-- 007: subscriptions, partner discount codes, and permanent exam attempts.
-- Writes to subscriptions/discount_codes happen ONLY through the service
-- role (api/billing.js + Stripe webhook); clients can read their own rows.

create table if not exists public.subscriptions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  plan text not null,
  starts_at timestamptz not null default now(),
  expires_at timestamptz not null,
  exams_granted int not null default 0,
  price_cents int not null default 0,
  discount_code text,
  stripe_session text unique,
  created_at timestamptz not null default now()
);
create index if not exists idx_subs_user on public.subscriptions (user_id, expires_at desc);
alter table public.subscriptions enable row level security;
drop policy if exists "read own subscriptions" on public.subscriptions;
create policy "read own subscriptions" on public.subscriptions
  for select using (auth.uid() = user_id);
-- Paid rows are written ONLY by the service role (Stripe webhook). The one
-- client-writable shape is the 1-day free pass, and the partial unique
-- index caps it at one per account for life.
create unique index if not exists one_free_pass_per_user
  on public.subscriptions (user_id) where plan = 'pass1';
drop policy if exists "self-grant free pass" on public.subscriptions;
create policy "self-grant free pass" on public.subscriptions
  for insert with check (
    auth.uid() = user_id and plan = 'pass1' and exams_granted = 0
    and price_cents = 0 and expires_at <= now() + interval '25 hours'
  );

create table if not exists public.discount_codes (
  code text primary key,
  partner text not null,
  percent_off int check (percent_off between 1 and 100),
  amount_off_cents int check (amount_off_cents > 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.discount_codes enable row level security;
-- no client policies at all: codes are validated server-side so partners'
-- code lists can't be enumerated from the browser

-- One row per exam form a user has ever STARTED. The primary key plus the
-- absence of update/delete policies is the "never see the same exam twice"
-- guarantee: once a form is attempted it can never be reset or repeated.
create table if not exists public.exam_attempts (
  user_id uuid not null references auth.users(id) on delete cascade,
  form int not null check (form between 1 and 10),
  started_at timestamptz not null default now(),
  primary key (user_id, form)
);
alter table public.exam_attempts enable row level security;
drop policy if exists "read own attempts" on public.exam_attempts;
create policy "read own attempts" on public.exam_attempts
  for select using (auth.uid() = user_id);
drop policy if exists "insert own attempts" on public.exam_attempts;
create policy "insert own attempts" on public.exam_attempts
  for insert with check (auth.uid() = user_id);
