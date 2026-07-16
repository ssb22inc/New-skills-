-- 008: student profiles + SMS consent.
-- Name/phone are collected in-app; email already lives in auth.users.
-- Consent flags are the legal record for TCPA compliance: sms_reminders
-- ("continue studying" nudges) and sms_offers (marketing) are separate
-- opt-ins, each stamped when granted. The sender script refuses numbers
-- without the matching consent, and STOP replies are honored by the
-- carrier layer (Twilio Advanced Opt-Out) plus the opted_out flag here.

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  phone text,                                   -- E.164, e.g. +13053920000
  sms_reminders boolean not null default false, -- study-reminder texts
  sms_offers boolean not null default false,    -- product offers / marketing
  consent_at timestamptz,                       -- stamped when either opt-in is granted
  opted_out boolean not null default false,     -- set when a STOP is received
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

drop policy if exists "read own profile" on public.profiles;
create policy "read own profile" on public.profiles
  for select using (auth.uid() = user_id);
drop policy if exists "insert own profile" on public.profiles;
create policy "insert own profile" on public.profiles
  for insert with check (auth.uid() = user_id);
drop policy if exists "update own profile" on public.profiles;
create policy "update own profile" on public.profiles
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- no delete policy: profile rows follow the account (cascade on user delete)
