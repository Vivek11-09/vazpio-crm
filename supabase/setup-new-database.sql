-- Vazpio CRM: complete database setup for a NEW, EMPTY Supabase project.
-- Paste this whole file into Supabase > SQL Editor > New query, then click Run. Run it once only.
-- Generated from supabase/migrations/0001, 0002 and 0003 (in that order).

begin;

-- ===== supabase/migrations/0001_init.sql =====
-- Vazpio CRM - Phase 1 schema
-- Tenant isolation is enforced here with row-level security, not in the UI.

create extension if not exists pg_trgm with schema extensions;
create schema if not exists private;

create type public.app_role as enum ('super_admin', 'manager', 'sdr', 'client_admin', 'client_viewer');

-- All "today" logic (due / overdue, date filters) runs on India time.
create function public.today_ist() returns date
language sql stable set search_path = '' as $$
  select (now() at time zone 'Asia/Kolkata')::date
$$;

create function public.normalize_company(n text) returns text
language sql immutable set search_path = '' as $$
  select coalesce(
    nullif(regexp_replace(
      regexp_replace(lower(coalesce(n, '')),
        '\m(pvt|private|ltd|limited|inc|incorporated|llp|llc|corp|corporation|co|company)\M\.?', '', 'g'),
      '[^a-z0-9]', '', 'g'), ''),
    regexp_replace(lower(coalesce(n, '')), '[^a-z0-9]', '', 'g'))
$$;

create function public.normalize_domain(w text) returns text
language sql immutable set search_path = '' as $$
  select nullif(split_part(split_part(split_part(
    regexp_replace(regexp_replace(lower(trim(coalesce(w, ''))), '^https?://', ''), '^www\.', ''),
    '/', 1), '?', 1), '#', 1), '')
$$;

-- ---------------------------------------------------------------- lookups
create table public.prospect_statuses (
  value text primary key,
  sort int not null,
  is_active boolean not null default true
);

create table public.call_outcomes (
  value text primary key,
  sort int not null,
  is_connected boolean not null default false,
  is_active boolean not null default true
);

-- Statuses are the ones used in the current calling sheet (typo fixed), plus Do Not Contact.
insert into public.prospect_statuses (value, sort) values
  ('Not started', 1), ('In progress', 2), ('No Response', 3), ('No Requirement', 4),
  ('Need New Contact', 5), ('Invalid Contact', 6), ('Meeting to be set', 7),
  ('Meeting Done', 8), ('Converted', 9), ('Do Not Contact', 10);

insert into public.call_outcomes (value, sort, is_connected) values
  ('No Answer', 1, false), ('Busy', 2, false), ('Disconnected / Dropped', 3, false),
  ('Wrong Number', 4, false), ('Callback Requested', 5, true), ('Connected - Conversation', 6, true),
  ('Wrong Person', 7, true), ('Send Details / Deck', 8, true), ('Interested', 9, true),
  ('Not Interested', 10, true), ('No Requirement', 11, true), ('Meeting Proposed', 12, true),
  ('Meeting Booked', 13, true), ('Do Not Contact', 14, true);

-- ---------------------------------------------------------------- core tables
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  website text,
  industry text,
  geography text,
  start_date date,
  engagement_model text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  primary_contacts text,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text not null default '',
  role public.app_role,                       -- null until an admin approves the user
  client_id uuid references public.clients (id),
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  constraint client_roles_need_client check (
    role is null or role not in ('client_admin', 'client_viewer') or client_id is not null)
);

create table public.client_sdrs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id),
  sdr_id uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (client_id, sdr_id)
);

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id),
  name text not null,
  objective text,
  target_industries text,
  target_locations text,
  start_date date,
  end_date date,
  status text not null default 'active' check (status in ('active', 'inactive')),
  monthly_meeting_target int not null default 0,
  payout_rate numeric(12, 2) not null default 0,
  payout_threshold int not null default 0,
  inactivity_days int not null default 7,
  collateral_links text,
  created_at timestamptz not null default now()
);

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id),
  name text not null check (length(trim(name)) > 0),
  name_key text generated always as (public.normalize_company(name)) stored,
  website text,
  domain_key text generated always as (public.normalize_domain(website)) stored,
  industry text,
  company_size text,
  location text,
  linkedin_url text,
  tier text,
  status text not null default 'Active',
  owner_id uuid not null references public.profiles (id),
  research_notes text,
  custom jsonb not null default '{}',
  dup_override boolean not null default false,
  is_archived boolean not null default false,
  created_by uuid references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now()
);
-- One active account per company within a client. The same company may exist for another client.
create unique index accounts_client_name_uq on public.accounts (client_id, name_key)
  where not is_archived and not dup_override;
create unique index accounts_client_domain_uq on public.accounts (client_id, domain_key)
  where domain_key is not null and not is_archived;
create index accounts_name_trgm on public.accounts using gin (name_key extensions.gin_trgm_ops);

create table public.account_campaigns (
  account_id uuid not null references public.accounts (id),
  campaign_id uuid not null references public.campaigns (id),
  primary key (account_id, campaign_id)
);

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id),
  account_id uuid not null references public.accounts (id),
  campaign_id uuid references public.campaigns (id),
  name text not null check (length(trim(name)) > 0),
  designation text,
  department text,
  seniority text,
  buying_role text not null default 'Unknown'
    check (buying_role in ('Decision Maker', 'Influencer', 'Gatekeeper', 'User', 'Unknown')),
  linkedin_url text,
  email text,
  phone text,
  location text,
  contact_status text not null default 'Active',
  prospect_status text not null default 'Not started' references public.prospect_statuses (value),
  client_note text,
  internal_note text,
  custom jsonb not null default '{}',
  created_by uuid references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now()
);
create index contacts_client_idx on public.contacts (client_id, prospect_status);
create index contacts_account_idx on public.contacts (account_id);

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id),
  account_id uuid not null references public.accounts (id),
  contact_id uuid references public.contacts (id),
  campaign_id uuid references public.campaigns (id),
  sdr_id uuid not null references public.profiles (id) default auth.uid(),
  activity_date date not null default public.today_ist(),
  channel text not null default 'call' check (channel in ('call', 'email_log', 'note')),
  outcome text references public.call_outcomes (value),
  client_note text,
  internal_note text,
  next_action text,
  next_followup_date date,
  created_at timestamptz not null default now(),
  constraint call_needs_outcome check (channel <> 'call' or outcome is not null)
);
create index activities_contact_idx on public.activities (contact_id, activity_date desc);
create index activities_client_date_idx on public.activities (client_id, activity_date);

create table public.followups (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id),
  account_id uuid not null references public.accounts (id),
  contact_id uuid references public.contacts (id),
  activity_id uuid references public.activities (id),
  owner_id uuid not null references public.profiles (id) default auth.uid(),
  due_date date not null,
  action text,
  status text not null default 'open' check (status in ('open', 'done', 'cancelled')),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
create index followups_owner_idx on public.followups (owner_id, status, due_date);
create index followups_contact_idx on public.followups (contact_id, status);

create table public.meetings (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id),
  campaign_id uuid references public.campaigns (id),
  account_id uuid not null references public.accounts (id),
  contact_id uuid not null references public.contacts (id),
  sdr_id uuid not null references public.profiles (id) default auth.uid(),
  booked_on date not null default public.today_ist(),
  scheduled_at timestamptz not null,
  client_attendees text,
  mode_or_link text,
  qualification_notes text,
  status text not null default 'Booked' check (status in (
    'Proposed', 'Booked', 'Confirmed', 'Rescheduled', 'Cancelled by Prospect',
    'Cancelled by Client', 'No Show', 'Held')),
  hqm_status text not null default 'pending' check (hqm_status in ('pending', 'accepted', 'rejected')),
  billable boolean not null default false,
  existing_opportunity boolean not null default false,
  client_confirmed_by text,
  credit_reason text,
  hqm_decided_by uuid references public.profiles (id),
  hqm_decided_at timestamptz,
  custom jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index meetings_client_idx on public.meetings (client_id, scheduled_at);

create table public.custom_fields (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id),
  object text not null check (object in ('account', 'contact', 'meeting')),
  key text not null,
  label text not null,
  field_type text not null check (field_type in (
    'short_text', 'long_text', 'number', 'yes_no', 'date', 'dropdown', 'multi_select')),
  options text,
  help_text text,
  default_value text,
  is_required boolean not null default false,
  is_active boolean not null default true,
  client_visible boolean not null default false,
  reportable boolean not null default false,
  display_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (campaign_id, object, key)
);

create table public.payout_runs (
  id uuid primary key default gen_random_uuid(),
  sdr_id uuid not null references public.profiles (id),
  campaign_id uuid not null references public.campaigns (id),
  month date not null,
  hqm_count int not null default 0,
  rate numeric(12, 2) not null default 0,
  threshold int not null default 0,
  gross numeric(12, 2) not null default 0,
  adjustment numeric(12, 2) not null default 0,
  adjustment_reason text,
  deduction numeric(12, 2) not null default 0,
  status text not null default 'draft' check (status in ('draft', 'reviewed', 'approved', 'paid')),
  created_at timestamptz not null default now(),
  unique (sdr_id, campaign_id, month),
  constraint adjustment_needs_reason check (adjustment = 0 or coalesce(adjustment_reason, '') <> '')
);

create table public.client_financials (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id),
  month date not null,
  revenue numeric(12, 2) not null default 0,
  tool_cost numeric(12, 2) not null default 0,
  other_cost numeric(12, 2) not null default 0,
  note text,
  unique (client_id, month)
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  table_name text not null,
  record_id uuid,
  action text not null,
  actor_id uuid,
  before jsonb,
  after jsonb,
  at timestamptz not null default now()
);
create index audit_record_idx on public.audit_log (table_name, record_id);

create table public.edit_requests (
  id uuid primary key default gen_random_uuid(),
  table_name text not null check (table_name in ('accounts', 'contacts', 'meetings')),
  record_id uuid not null,
  field text not null,
  current_value text,
  requested_value text,
  reason text not null,
  requested_by uuid not null references public.profiles (id) default auth.uid(),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  decided_by uuid references public.profiles (id),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- access helpers
create function private.my_role() returns public.app_role
language sql stable security definer set search_path = '' as $$
  select role from public.profiles where id = (select auth.uid()) and is_active
$$;

create function private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(private.my_role() in ('super_admin', 'manager'), false)
$$;

create function private.is_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(private.my_role() in ('super_admin', 'manager', 'sdr'), false)
$$;

-- The client a portal user belongs to; null for everyone else.
create function private.my_client() returns uuid
language sql stable security definer set search_path = '' as $$
  select client_id from public.profiles
  where id = (select auth.uid()) and is_active and role in ('client_admin', 'client_viewer')
$$;

-- Vazpio staff who may read and work a client's records.
create function private.can_work_client(cid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(case private.my_role()
    when 'super_admin' then true
    when 'manager' then true
    when 'sdr' then exists (
      select 1 from public.client_sdrs s join public.clients c on c.id = s.client_id
      where s.client_id = cid and s.sdr_id = (select auth.uid()) and c.status = 'active')
    else false end, false)
$$;

grant usage on schema private to authenticated;

-- ---------------------------------------------------------------- triggers
-- First user to sign up becomes Super Admin; everyone after waits for approval.
create function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  is_first boolean;
begin
  select not exists (select 1 from public.profiles) into is_first;
  insert into public.profiles (id, email, full_name, role, is_active)
  values (
    new.id, new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name',
             split_part(new.email, '@', 1)),
    case when is_first then 'super_admin'::public.app_role end,
    is_first);
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

create function private.audit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_log (table_name, record_id, action, actor_id, before, after)
  values (
    tg_table_name,
    case when tg_op = 'DELETE' then old.id else new.id end,
    tg_op, (select auth.uid()),
    case when tg_op <> 'INSERT' then to_jsonb(old) end,
    case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return coalesce(new, old);
end $$;

do $$
declare
  t text;
begin
  foreach t in array array['profiles', 'clients', 'client_sdrs', 'campaigns', 'accounts', 'contacts',
                           'meetings', 'custom_fields', 'payout_runs', 'client_financials', 'edit_requests']
  loop
    execute format(
      'create trigger audit_%1$s after insert or update or delete on public.%1$I
         for each row execute function private.audit()', t);
  end loop;
end $$;

-- After an SDR saves a record, only the columns passed as trigger arguments stay editable.
-- A blank field may be filled in once; changing a filled field needs an edit request.
create function private.enforce_sdr_lock() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  k text;
  o jsonb := to_jsonb(old);
  n jsonb := to_jsonb(new);
begin
  if private.my_role() is distinct from 'sdr' then
    return new;
  end if;
  for k in select jsonb_object_keys(n) loop
    if (n -> k) is distinct from (o -> k) and not (k = any (tg_argv)) then
      if (o -> k) = 'null'::jsonb or (o ->> k) = '' then
        continue;
      end if;
      raise exception 'The field "%" is locked after save. Submit an edit request.', k
        using errcode = '42501';
    end if;
  end loop;
  return new;
end $$;

create trigger lock_accounts before update on public.accounts
  for each row execute function private.enforce_sdr_lock('status', 'research_notes');
create trigger lock_contacts before update on public.contacts
  for each row execute function private.enforce_sdr_lock(
    'prospect_status', 'contact_status', 'client_note', 'internal_note');

-- New accounts: an SDR always becomes the owner and cannot bypass the duplicate block.
create function private.account_before_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if private.my_role() = 'sdr' then
    new.owner_id := (select auth.uid());
    new.dup_override := false;
  end if;
  return new;
end $$;

create trigger account_before_insert before insert on public.accounts
  for each row execute function private.account_before_insert();

-- Logging an activity closes the contact's open follow-ups and opens the next one.
create function private.activity_after_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.followups
     set status = 'done', completed_at = now()
   where status = 'open' and account_id = new.account_id
     and contact_id is not distinct from new.contact_id;
  if new.next_followup_date is not null then
    insert into public.followups (client_id, account_id, contact_id, activity_id, owner_id, due_date, action)
    values (new.client_id, new.account_id, new.contact_id, new.id, new.sdr_id,
            new.next_followup_date, new.next_action);
  end if;
  return new;
end $$;

create trigger activity_after_insert after insert on public.activities
  for each row execute function private.activity_after_insert();

-- HQM decisions belong to Admin/Manager. Billable follows acceptance.
create function private.meeting_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if not private.is_admin() then
      new.hqm_status := 'pending';
      new.credit_reason := null;
      new.client_confirmed_by := null;
    end if;
  elsif (new.hqm_status, new.existing_opportunity, coalesce(new.credit_reason, ''),
         coalesce(new.client_confirmed_by, ''), new.sdr_id)
        is distinct from
        (old.hqm_status, old.existing_opportunity, coalesce(old.credit_reason, ''),
         coalesce(old.client_confirmed_by, ''), old.sdr_id)
        and auth.uid() is not null and not private.is_admin() then
    raise exception 'Only an Admin or Manager can change HQM fields.' using errcode = '42501';
  end if;

  if new.hqm_status <> 'pending' and (tg_op = 'INSERT' or new.hqm_status <> old.hqm_status) then
    if coalesce(trim(new.qualification_notes), '') = '' then
      raise exception 'Qualification notes are required before an HQM decision.';
    end if;
    new.hqm_decided_by := (select auth.uid());
    new.hqm_decided_at := now();
  end if;
  new.billable := (new.hqm_status = 'accepted' and not new.existing_opportunity);
  return new;
end $$;

create trigger meeting_guard before insert or update on public.meetings
  for each row execute function private.meeting_guard();

-- ---------------------------------------------------------------- row-level security
alter table public.prospect_statuses enable row level security;
alter table public.call_outcomes enable row level security;
alter table public.clients enable row level security;
alter table public.profiles enable row level security;
alter table public.client_sdrs enable row level security;
alter table public.campaigns enable row level security;
alter table public.accounts enable row level security;
alter table public.account_campaigns enable row level security;
alter table public.contacts enable row level security;
alter table public.activities enable row level security;
alter table public.followups enable row level security;
alter table public.meetings enable row level security;
alter table public.custom_fields enable row level security;
alter table public.payout_runs enable row level security;
alter table public.client_financials enable row level security;
alter table public.audit_log enable row level security;
alter table public.edit_requests enable row level security;

create policy lookups_read on public.prospect_statuses for select to authenticated using (true);
create policy lookups_write on public.prospect_statuses for all to authenticated
  using (private.is_admin()) with check (private.is_admin());
create policy outcomes_read on public.call_outcomes for select to authenticated using (true);
create policy outcomes_write on public.call_outcomes for all to authenticated
  using (private.is_admin()) with check (private.is_admin());

create policy profiles_read on public.profiles for select to authenticated
  using (id = (select auth.uid()) or private.is_staff());
create policy profiles_admin_update on public.profiles for update to authenticated
  using (private.is_admin()) with check (private.is_admin());

create policy clients_read on public.clients for select to authenticated
  using (private.can_work_client(id) or id = private.my_client());
create policy clients_insert on public.clients for insert to authenticated with check (private.is_admin());
create policy clients_update on public.clients for update to authenticated
  using (private.is_admin()) with check (private.is_admin());

create policy client_sdrs_read on public.client_sdrs for select to authenticated using (private.is_staff());
create policy client_sdrs_insert on public.client_sdrs for insert to authenticated with check (private.is_admin());
create policy client_sdrs_delete on public.client_sdrs for delete to authenticated using (private.is_admin());

-- Client users never read these tables directly: the portal_* functions return only safe columns.
create policy campaigns_read on public.campaigns for select to authenticated
  using (private.can_work_client(client_id));
create policy campaigns_insert on public.campaigns for insert to authenticated with check (private.is_admin());
create policy campaigns_update on public.campaigns for update to authenticated
  using (private.is_admin()) with check (private.is_admin());

create policy accounts_read on public.accounts for select to authenticated
  using (private.can_work_client(client_id));
create policy accounts_insert on public.accounts for insert to authenticated
  with check (private.can_work_client(client_id));
create policy accounts_update on public.accounts for update to authenticated
  using (private.can_work_client(client_id)) with check (private.can_work_client(client_id));

create policy account_campaigns_read on public.account_campaigns for select to authenticated
  using (exists (select 1 from public.accounts a where a.id = account_id));
create policy account_campaigns_insert on public.account_campaigns for insert to authenticated
  with check (exists (select 1 from public.accounts a where a.id = account_id));

create policy contacts_read on public.contacts for select to authenticated
  using (private.can_work_client(client_id));
create policy contacts_insert on public.contacts for insert to authenticated
  with check (private.can_work_client(client_id));
create policy contacts_update on public.contacts for update to authenticated
  using (private.can_work_client(client_id)) with check (private.can_work_client(client_id));

-- Activities are insert-only: there is deliberately no update or delete policy.
create policy activities_read on public.activities for select to authenticated
  using (private.can_work_client(client_id));
create policy activities_insert on public.activities for insert to authenticated
  with check (private.can_work_client(client_id) and sdr_id = (select auth.uid()));

create policy followups_read on public.followups for select to authenticated
  using (private.can_work_client(client_id));
create policy followups_insert on public.followups for insert to authenticated
  with check (private.can_work_client(client_id));
create policy followups_update on public.followups for update to authenticated
  using (private.can_work_client(client_id)) with check (private.can_work_client(client_id));

create policy meetings_read on public.meetings for select to authenticated
  using (private.can_work_client(client_id));
create policy meetings_insert on public.meetings for insert to authenticated
  with check (private.can_work_client(client_id));
create policy meetings_update on public.meetings for update to authenticated
  using (private.can_work_client(client_id)) with check (private.can_work_client(client_id));

create policy custom_fields_read on public.custom_fields for select to authenticated using (private.is_staff());
create policy custom_fields_insert on public.custom_fields for insert to authenticated with check (private.is_admin());
create policy custom_fields_update on public.custom_fields for update to authenticated
  using (private.is_admin()) with check (private.is_admin());

create policy payouts_read on public.payout_runs for select to authenticated
  using (private.is_admin() or sdr_id = (select auth.uid()));
create policy payouts_insert on public.payout_runs for insert to authenticated with check (private.is_admin());
create policy payouts_update on public.payout_runs for update to authenticated
  using (private.is_admin()) with check (private.is_admin());

create policy financials_all on public.client_financials for all to authenticated
  using (private.is_admin()) with check (private.is_admin());

create policy audit_read on public.audit_log for select to authenticated using (private.is_admin());

create policy edit_requests_read on public.edit_requests for select to authenticated
  using (private.is_admin() or requested_by = (select auth.uid()));
create policy edit_requests_insert on public.edit_requests for insert to authenticated
  with check (private.is_staff() and requested_by = (select auth.uid()) and status = 'pending');
create policy edit_requests_update on public.edit_requests for update to authenticated
  using (private.is_admin()) with check (private.is_admin());

-- ---------------------------------------------------------------- staff views and functions
create view public.calling_sheet with (security_invoker = true) as
select
  c.id as contact_id, c.client_id, c.campaign_id, a.id as account_id,
  a.name as prospect, c.name as contact_name, c.linkedin_url, c.designation,
  coalesce(c.location, a.location) as location, c.email, c.phone,
  c.prospect_status as status, a.owner_id, p.full_name as owner_name,
  c.client_note, c.internal_note,
  la.activity_date as last_activity_date, la.outcome as last_outcome, la.client_note as last_note,
  coalesce(calls.n, 0) as call_count,
  f.due_date as next_followup_date,
  case when f.due_date is null then null
       when f.due_date < public.today_ist() then 'OVERDUE'
       when f.due_date <= public.today_ist() + 2 then 'DUE SOON'
       else 'UPCOMING' end as followup_alert,
  c.created_at
from public.contacts c
join public.accounts a on a.id = c.account_id
left join public.profiles p on p.id = a.owner_id
left join lateral (
  select x.activity_date, x.outcome, x.client_note from public.activities x
  where x.contact_id = c.id order by x.activity_date desc, x.created_at desc limit 1) la on true
left join lateral (
  select count(*)::int as n from public.activities x
  where x.contact_id = c.id and x.channel = 'call') calls on true
left join lateral (
  select min(x.due_date) as due_date from public.followups x
  where x.contact_id = c.id and x.status = 'open') f on true;

-- Shown to the SDR while typing a company name, before anything is saved.
create function public.find_account_matches(p_client uuid, p_name text, p_website text default null)
returns table (id uuid, name text, website text, status text, owner_name text, match text)
language sql stable set search_path = '' as $$
  select a.id, a.name, a.website, a.status, p.full_name,
    case when a.name_key = public.normalize_company(p_name) then 'exact'
         when a.domain_key is not null and a.domain_key = public.normalize_domain(p_website) then 'exact'
         else 'similar' end
  from public.accounts a
  left join public.profiles p on p.id = a.owner_id
  where a.client_id = p_client and not a.is_archived
    and (a.name_key = public.normalize_company(p_name)
      or (a.domain_key is not null and a.domain_key = public.normalize_domain(p_website))
      or extensions.similarity(a.name_key, public.normalize_company(p_name)) > 0.5)
  order by 6, a.name
  limit 10
$$;

-- Runs with the caller's permissions, so an SDR only ever counts their assigned clients.
create function public.dashboard_stats(
  p_from date, p_to date, p_client uuid default null, p_campaign uuid default null, p_sdr uuid default null)
returns jsonb language sql stable set search_path = '' as $$
with act as (
  select a.activity_date, a.contact_id, a.outcome, coalesce(o.is_connected, false) as is_connected
  from public.activities a
  left join public.call_outcomes o on o.value = a.outcome
  where a.channel = 'call' and a.activity_date between p_from and p_to
    and (p_client is null or a.client_id = p_client)
    and (p_campaign is null or a.campaign_id = p_campaign)
    and (p_sdr is null or a.sdr_id = p_sdr)
), con as (
  select c.prospect_status, (c.created_at at time zone 'Asia/Kolkata')::date as created_on
  from public.contacts c
  join public.accounts ac on ac.id = c.account_id
  where (p_client is null or c.client_id = p_client)
    and (p_campaign is null or c.campaign_id = p_campaign)
    and (p_sdr is null or ac.owner_id = p_sdr)
), mt as (
  select m.status, m.hqm_status, m.billable, m.booked_on,
    (m.scheduled_at at time zone 'Asia/Kolkata')::date as held_on,
    (m.hqm_decided_at at time zone 'Asia/Kolkata')::date as decided_on
  from public.meetings m
  where (p_client is null or m.client_id = p_client)
    and (p_campaign is null or m.campaign_id = p_campaign)
    and (p_sdr is null or m.sdr_id = p_sdr)
), fu as (
  select f.due_date from public.followups f
  where f.status = 'open'
    and (p_client is null or f.client_id = p_client)
    and (p_sdr is null or f.owner_id = p_sdr)
)
select jsonb_build_object(
  'contacts_total', (select count(*) from con),
  'contacts_added', (select count(*) from con where created_on between p_from and p_to),
  'calls', (select count(*) from act),
  'connected', (select count(*) from act where is_connected),
  'contacts_reached', (select count(distinct contact_id) from act where is_connected),
  'meetings_booked', (select count(*) from mt where booked_on between p_from and p_to),
  'meetings_held', (select count(*) from mt where status = 'Held' and held_on between p_from and p_to),
  'hqm', (select count(*) from mt where hqm_status = 'accepted' and decided_on between p_from and p_to),
  'hqm_billable', (select count(*) from mt where billable and decided_on between p_from and p_to),
  'hqm_pending', (select count(*) from mt where status = 'Held' and hqm_status = 'pending'),
  'followups_overdue', (select count(*) from fu where due_date < public.today_ist()),
  'followups_today', (select count(*) from fu where due_date = public.today_ist()),
  'monthly_target', (
    select coalesce(sum(cp.monthly_meeting_target), 0) from public.campaigns cp
    where cp.status = 'active' and (p_client is null or cp.client_id = p_client)
      and (p_campaign is null or cp.id = p_campaign)),
  'status_breakdown', (
    select coalesce(jsonb_agg(jsonb_build_object('label', s.prospect_status, 'n', s.n) order by s.n desc), '[]'::jsonb)
    from (select prospect_status, count(*) as n from con group by 1) s),
  'outcome_breakdown', (
    select coalesce(jsonb_agg(jsonb_build_object('label', s.outcome, 'n', s.n) order by s.n desc), '[]'::jsonb)
    from (select outcome, count(*) as n from act group by 1) s),
  'trend', (
    select coalesce(jsonb_agg(jsonb_build_object('d', t.activity_date, 'calls', t.n, 'connected', t.k)
                              order by t.activity_date), '[]'::jsonb)
    from (select activity_date, count(*) as n, count(*) filter (where is_connected) as k
          from act group by 1) t)
)
$$;

-- Management only. The score weights are a starting point and should be agreed with Vazpio.
create function public.sdr_leaderboard(p_from date, p_to date, p_client uuid default null)
returns table (sdr_id uuid, sdr_name text, calls bigint, connected bigint, meetings_booked bigint,
               meetings_held bigint, hqm bigint, overdue bigint, score numeric)
language sql stable set search_path = '' as $$
  select s.id, s.full_name, x.calls, x.connected, x.booked, x.held, x.hqm, x.overdue,
    round(x.hqm * 10 + x.held * 4 + x.booked * 2 + x.connected * 0.2 - x.overdue * 0.5, 1)
  from public.profiles s
  cross join lateral (
    select
      (select count(*) from public.activities a
        where a.sdr_id = s.id and a.channel = 'call' and a.activity_date between p_from and p_to
          and (p_client is null or a.client_id = p_client)) as calls,
      (select count(*) from public.activities a join public.call_outcomes o on o.value = a.outcome
        where a.sdr_id = s.id and a.channel = 'call' and o.is_connected
          and a.activity_date between p_from and p_to
          and (p_client is null or a.client_id = p_client)) as connected,
      (select count(*) from public.meetings m
        where m.sdr_id = s.id and m.booked_on between p_from and p_to
          and (p_client is null or m.client_id = p_client)) as booked,
      (select count(*) from public.meetings m
        where m.sdr_id = s.id and m.status = 'Held'
          and (m.scheduled_at at time zone 'Asia/Kolkata')::date between p_from and p_to
          and (p_client is null or m.client_id = p_client)) as held,
      (select count(*) from public.meetings m
        where m.sdr_id = s.id and m.hqm_status = 'accepted'
          and (m.hqm_decided_at at time zone 'Asia/Kolkata')::date between p_from and p_to
          and (p_client is null or m.client_id = p_client)) as hqm,
      (select count(*) from public.followups f
        where f.owner_id = s.id and f.status = 'open' and f.due_date < public.today_ist()
          and (p_client is null or f.client_id = p_client)) as overdue
  ) x
  where s.role = 'sdr' and s.is_active and private.is_admin()
  order by 9 desc
$$;

-- Monthly draft payouts from accepted HQMs. Reviewed/approved/paid months are never overwritten.
create function public.compute_payouts(p_month date) returns int
language plpgsql set search_path = '' as $$
declare
  m date := date_trunc('month', p_month)::date;
  n int;
begin
  if not private.is_admin() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  update public.payout_runs set hqm_count = 0, gross = 0 where month = m and status = 'draft';
  insert into public.payout_runs (sdr_id, campaign_id, month, hqm_count, rate, threshold, gross)
  select mt.sdr_id, mt.campaign_id, m, count(*), cp.payout_rate, cp.payout_threshold,
         case when count(*) >= cp.payout_threshold then count(*) * cp.payout_rate else 0 end
  from public.meetings mt
  join public.campaigns cp on cp.id = mt.campaign_id
  where mt.hqm_status = 'accepted'
    and date_trunc('month', mt.hqm_decided_at at time zone 'Asia/Kolkata')::date = m
  group by mt.sdr_id, mt.campaign_id, cp.payout_rate, cp.payout_threshold
  on conflict (sdr_id, campaign_id, month) do update
    set hqm_count = excluded.hqm_count, rate = excluded.rate,
        threshold = excluded.threshold, gross = excluded.gross
    where public.payout_runs.status = 'draft';
  get diagnostics n = row_count;
  return n;
end $$;

create view public.client_profitability with (security_invoker = true) as
select
  f.client_id, c.name as client_name, f.month, f.revenue, f.tool_cost, f.other_cost,
  coalesce(p.payout, 0) as sdr_payout,
  f.revenue - coalesce(p.payout, 0) - f.tool_cost - f.other_cost as contribution_margin,
  case when f.revenue > 0
       then round((f.revenue - coalesce(p.payout, 0) - f.tool_cost - f.other_cost) / f.revenue * 100, 1)
  end as margin_pct
from public.client_financials f
join public.clients c on c.id = f.client_id
left join lateral (
  select sum(r.gross + r.adjustment) as payout
  from public.payout_runs r
  join public.campaigns cp on cp.id = r.campaign_id
  where cp.client_id = f.client_id and r.month = f.month and r.status in ('approved', 'paid')) p on true;

-- Applies an approved correction to a locked field and records the decision.
create function public.decide_edit_request(p_id uuid, p_approve boolean) returns void
language plpgsql set search_path = '' as $$
declare
  r public.edit_requests;
  col_type text;
begin
  if not private.is_admin() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  select * into r from public.edit_requests where id = p_id and status = 'pending' for update;
  if not found then
    raise exception 'Edit request not found or already decided.';
  end if;
  if p_approve then
    select format_type(a.atttypid, a.atttypmod) into col_type
    from pg_catalog.pg_attribute a
    where a.attrelid = format('public.%I', r.table_name)::regclass
      and a.attname = r.field and a.attnum > 0 and not a.attisdropped and a.attgenerated = '';
    if col_type is null or r.field in ('id', 'client_id', 'created_by', 'created_at') then
      raise exception 'Field "%" cannot be edited.', r.field;
    end if;
    execute format('update public.%I set %I = $1::%s where id = $2', r.table_name, r.field, col_type)
      using r.requested_value, r.record_id;
  end if;
  update public.edit_requests
     set status = case when p_approve then 'approved' else 'rejected' end,
         decided_by = (select auth.uid()), decided_at = now()
   where id = p_id;
end $$;

-- ---------------------------------------------------------------- client portal (read-only)
-- Security definer on purpose: these return only client-safe columns for the caller's own client.
-- An Admin/Manager may pass p_client to preview what a client sees.
create function private.portal_client(p_client uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select coalesce(private.my_client(), case when private.is_admin() then p_client end)
$$;

create function public.portal_calling_sheet(p_client uuid default null)
returns table (
  contact_id uuid, campaign_id uuid, activity_date date, prospect text, contact_name text,
  linkedin_url text, designation text, location text, email text, phone text, status text,
  owner text, notes text, last_note text, next_followup_date date, followup_alert text)
language sql stable security definer set search_path = '' as $$
  select
    c.id, c.campaign_id, la.activity_date, a.name, c.name, c.linkedin_url, c.designation,
    coalesce(c.location, a.location), c.email, c.phone, c.prospect_status,
    'Vazpio Team', c.client_note, la.client_note, f.due_date,
    case when f.due_date is null then null
         when f.due_date < public.today_ist() then 'OVERDUE'
         when f.due_date <= public.today_ist() + 2 then 'DUE SOON'
         else 'UPCOMING' end
  from public.contacts c
  join public.accounts a on a.id = c.account_id
  left join lateral (
    select x.activity_date, x.client_note from public.activities x
    where x.contact_id = c.id order by x.activity_date desc, x.created_at desc limit 1) la on true
  left join lateral (
    select min(x.due_date) as due_date from public.followups x
    where x.contact_id = c.id and x.status = 'open') f on true
  where c.client_id = private.portal_client(p_client)
  order by la.activity_date desc nulls last, a.name
$$;

create function public.portal_campaigns(p_client uuid default null)
returns table (id uuid, name text, status text, monthly_meeting_target int)
language sql stable security definer set search_path = '' as $$
  select cp.id, cp.name, cp.status, cp.monthly_meeting_target
  from public.campaigns cp
  where cp.client_id = private.portal_client(p_client)
  order by cp.name
$$;

create function public.portal_meetings(p_client uuid default null)
returns table (id uuid, campaign_id uuid, prospect text, contact_name text, designation text,
               scheduled_at timestamptz, status text, hqm_status text)
language sql stable security definer set search_path = '' as $$
  select m.id, m.campaign_id, a.name, c.name, c.designation, m.scheduled_at, m.status, m.hqm_status
  from public.meetings m
  join public.accounts a on a.id = m.account_id
  join public.contacts c on c.id = m.contact_id
  where m.client_id = private.portal_client(p_client)
  order by m.scheduled_at desc
$$;

create function public.portal_stats(
  p_from date, p_to date, p_campaign uuid default null, p_client uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v uuid := private.portal_client(p_client);
begin
  if v is null then
    return '{}'::jsonb;
  end if;
  return public.dashboard_stats(p_from, p_to, v, p_campaign, null);
end $$;

-- ---------------------------------------------------------------- grants
revoke all on all tables in schema public from anon;
revoke execute on all functions in schema public from public, anon;
revoke execute on all functions in schema private from public, anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;
grant execute on all functions in schema private to authenticated;

-- ===== supabase/migrations/0002_complete.sql =====
-- Vazpio CRM - custom field locking, import, risk flags, richer analytics, role hardening.

-- ---------------------------------------------------------------- SDR lock: custom fields
-- Custom values follow the same rule as standard fields: an empty one may be filled once.
create or replace function private.enforce_sdr_lock() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  k text;
  o jsonb := to_jsonb(old);
  n jsonb := to_jsonb(new);
begin
  if private.my_role() is distinct from 'sdr' then
    return new;
  end if;
  for k in select jsonb_object_keys(n) loop
    if (n -> k) is distinct from (o -> k) and not (k = any (tg_argv)) then
      if k = 'custom' then
        if exists (
          select 1 from jsonb_each(o -> 'custom') e
          where e.value not in ('null'::jsonb, '""'::jsonb, '[]'::jsonb)
            and (n -> 'custom' -> e.key) is distinct from e.value) then
          raise exception 'A campaign field is locked after save. Ask an Admin to correct it.'
            using errcode = '42501';
        end if;
        continue;
      end if;
      if (o -> k) = 'null'::jsonb or (o ->> k) = '' then
        continue;
      end if;
      raise exception 'The field "%" is locked after save. Submit an edit request.', k
        using errcode = '42501';
    end if;
  end loop;
  return new;
end $$;

-- ---------------------------------------------------------------- role hardening
-- Only a Super Admin may create, change or deactivate a Super Admin. Nobody can lock themselves out.
create function private.profile_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or private.my_role() = 'super_admin' then
    if new.id = auth.uid() and (new.role is distinct from old.role or not new.is_active) then
      raise exception 'You cannot change your own role or deactivate yourself.' using errcode = '42501';
    end if;
    return new;
  end if;
  if old.role = 'super_admin' or new.role = 'super_admin' then
    raise exception 'Only a Super Admin can manage Super Admin accounts.' using errcode = '42501';
  end if;
  if new.id = auth.uid() and (new.role is distinct from old.role or not new.is_active) then
    raise exception 'You cannot change your own role or deactivate yourself.' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger profile_guard before update on public.profiles
  for each row execute function private.profile_guard();

-- ---------------------------------------------------------------- analytics: industry and geography
create or replace function public.dashboard_stats(
  p_from date, p_to date, p_client uuid default null, p_campaign uuid default null, p_sdr uuid default null)
returns jsonb language sql stable set search_path = '' as $$
with act as (
  select a.activity_date, a.contact_id, a.outcome, coalesce(o.is_connected, false) as is_connected
  from public.activities a
  left join public.call_outcomes o on o.value = a.outcome
  where a.channel = 'call' and a.activity_date between p_from and p_to
    and (p_client is null or a.client_id = p_client)
    and (p_campaign is null or a.campaign_id = p_campaign)
    and (p_sdr is null or a.sdr_id = p_sdr)
), con as (
  select c.prospect_status, (c.created_at at time zone 'Asia/Kolkata')::date as created_on,
    nullif(trim(ac.industry), '') as industry,
    nullif(trim(coalesce(c.location, ac.location)), '') as location
  from public.contacts c
  join public.accounts ac on ac.id = c.account_id
  where (p_client is null or c.client_id = p_client)
    and (p_campaign is null or c.campaign_id = p_campaign)
    and (p_sdr is null or ac.owner_id = p_sdr)
), mt as (
  select m.status, m.hqm_status, m.billable, m.booked_on,
    (m.scheduled_at at time zone 'Asia/Kolkata')::date as held_on,
    (m.hqm_decided_at at time zone 'Asia/Kolkata')::date as decided_on
  from public.meetings m
  where (p_client is null or m.client_id = p_client)
    and (p_campaign is null or m.campaign_id = p_campaign)
    and (p_sdr is null or m.sdr_id = p_sdr)
), fu as (
  select f.due_date from public.followups f
  where f.status = 'open'
    and (p_client is null or f.client_id = p_client)
    and (p_sdr is null or f.owner_id = p_sdr)
)
select jsonb_build_object(
  'contacts_total', (select count(*) from con),
  'contacts_added', (select count(*) from con where created_on between p_from and p_to),
  'calls', (select count(*) from act),
  'connected', (select count(*) from act where is_connected),
  'contacts_reached', (select count(distinct contact_id) from act where is_connected),
  'meetings_booked', (select count(*) from mt where booked_on between p_from and p_to),
  'meetings_held', (select count(*) from mt where status = 'Held' and held_on between p_from and p_to),
  'hqm', (select count(*) from mt where hqm_status = 'accepted' and decided_on between p_from and p_to),
  'hqm_billable', (select count(*) from mt where billable and decided_on between p_from and p_to),
  'hqm_pending', (select count(*) from mt where status = 'Held' and hqm_status = 'pending'),
  'followups_overdue', (select count(*) from fu where due_date < public.today_ist()),
  'followups_today', (select count(*) from fu where due_date = public.today_ist()),
  'monthly_target', (
    select coalesce(sum(cp.monthly_meeting_target), 0) from public.campaigns cp
    where cp.status = 'active' and (p_client is null or cp.client_id = p_client)
      and (p_campaign is null or cp.id = p_campaign)),
  'status_breakdown', (
    select coalesce(jsonb_agg(jsonb_build_object('label', s.prospect_status, 'n', s.n) order by s.n desc), '[]'::jsonb)
    from (select prospect_status, count(*) as n from con group by 1) s),
  'outcome_breakdown', (
    select coalesce(jsonb_agg(jsonb_build_object('label', s.outcome, 'n', s.n) order by s.n desc), '[]'::jsonb)
    from (select outcome, count(*) as n from act group by 1) s),
  'industry_breakdown', (
    select coalesce(jsonb_agg(jsonb_build_object('label', s.industry, 'n', s.n) order by s.n desc), '[]'::jsonb)
    from (select industry, count(*) as n from con where industry is not null group by 1 order by 2 desc limit 10) s),
  'location_breakdown', (
    select coalesce(jsonb_agg(jsonb_build_object('label', s.location, 'n', s.n) order by s.n desc), '[]'::jsonb)
    from (select initcap(location) as location, count(*) as n from con where location is not null
          group by 1 order by 2 desc limit 10) s),
  'trend', (
    select coalesce(jsonb_agg(jsonb_build_object('d', t.activity_date, 'calls', t.n, 'connected', t.k)
                              order by t.activity_date), '[]'::jsonb)
    from (select activity_date, count(*) as n, count(*) filter (where is_connected) as k
          from act group by 1) t)
)
$$;

-- ---------------------------------------------------------------- portal: client-visible custom fields
drop function public.portal_calling_sheet(uuid);

create function public.portal_calling_sheet(p_client uuid default null)
returns table (
  contact_id uuid, campaign_id uuid, activity_date date, prospect text, contact_name text,
  linkedin_url text, designation text, location text, email text, phone text, status text,
  owner text, notes text, last_note text, next_followup_date date, followup_alert text, custom jsonb)
language sql stable security definer set search_path = '' as $$
  select
    c.id, c.campaign_id, la.activity_date, a.name, c.name, c.linkedin_url, c.designation,
    coalesce(c.location, a.location), c.email, c.phone, c.prospect_status,
    'Vazpio Team', c.client_note, la.client_note, f.due_date,
    case when f.due_date is null then null
         when f.due_date < public.today_ist() then 'OVERDUE'
         when f.due_date <= public.today_ist() + 2 then 'DUE SOON'
         else 'UPCOMING' end,
    -- Only fields an Admin marked client-visible ever leave the database.
    (select coalesce(jsonb_object_agg(cf.label,
              case cf.object when 'contact' then c.custom -> cf.key else a.custom -> cf.key end), '{}'::jsonb)
       from public.custom_fields cf
      where cf.campaign_id = c.campaign_id and cf.client_visible and cf.is_active
        and cf.object in ('contact', 'account')
        and case cf.object when 'contact' then c.custom ? cf.key else a.custom ? cf.key end)
  from public.contacts c
  join public.accounts a on a.id = c.account_id
  left join lateral (
    select x.activity_date, x.client_note from public.activities x
    where x.contact_id = c.id order by x.activity_date desc, x.created_at desc limit 1) la on true
  left join lateral (
    select min(x.due_date) as due_date from public.followups x
    where x.contact_id = c.id and x.status = 'open') f on true
  where c.client_id = private.portal_client(p_client)
  order by la.activity_date desc nulls last, a.name
$$;

-- ---------------------------------------------------------------- risk flags (follow-up discipline)
create view public.attention_items with (security_invoker = true) as
with base as (
  select c.id as contact_id, c.client_id, c.name as contact_name, c.prospect_status,
    a.name as account_name, a.owner_id, p.full_name as owner_name,
    coalesce(cp.inactivity_days, 7) as inactivity_days,
    coalesce(la.activity_date, (c.created_at at time zone 'Asia/Kolkata')::date) as last_touch,
    la.outcome as last_outcome, la.channel as last_channel,
    exists (select 1 from public.followups f where f.contact_id = c.id and f.status = 'open') as has_followup
  from public.contacts c
  join public.accounts a on a.id = c.account_id
  left join public.profiles p on p.id = a.owner_id
  left join public.campaigns cp on cp.id = c.campaign_id
  left join lateral (
    select x.activity_date, x.outcome, x.channel from public.activities x
    where x.contact_id = c.id order by x.activity_date desc, x.created_at desc limit 1) la on true
  where c.prospect_status in ('Not started', 'In progress', 'No Response', 'Meeting to be set')
)
select 'Material sent, no follow-up set'::text as kind, client_id, contact_id, account_name, contact_name,
       owner_id, owner_name, last_touch as since
from base
where not has_followup and (last_outcome = 'Send Details / Deck' or last_channel = 'email_log')
union all
select 'No activity for ' || inactivity_days || '+ days', client_id, contact_id, account_name, contact_name,
       owner_id, owner_name, last_touch
from base
where not has_followup and last_touch < public.today_ist() - inactivity_days
  and not (last_outcome is not distinct from 'Send Details / Deck' or last_channel is not distinct from 'email_log')
union all
select case when m.scheduled_at < now() then 'Meeting passed, outcome not updated'
            else 'Meeting in 2 days, not confirmed' end,
       m.client_id, m.contact_id, a.name, c.name, m.sdr_id, p.full_name,
       (m.scheduled_at at time zone 'Asia/Kolkata')::date
from public.meetings m
join public.accounts a on a.id = m.account_id
join public.contacts c on c.id = m.contact_id
left join public.profiles p on p.id = m.sdr_id
where m.status in ('Proposed', 'Booked', 'Rescheduled') and m.scheduled_at < now() + interval '2 days';

-- ---------------------------------------------------------------- import (Excel / CSV / legacy sheet)
-- p_rows: [{row, date, prospect, contact_name, linkedin_url, designation, location, email, phone,
--           status, owner, notes, followup_date}]. With p_commit = false nothing is saved: the same
-- checks run and the result shows what would happen.
create function public.import_prospects(p_client uuid, p_campaign uuid, p_rows jsonb, p_commit boolean)
returns jsonb language plpgsql set search_path = '' as $$
declare
  r jsonb;
  v_account uuid;
  v_contact uuid;
  v_owner uuid;
  v_status text;
  v_dup text;
  v_imported int := 0;
  v_accounts int := 0;
  v_skipped jsonb := '[]'::jsonb;
begin
  if not private.is_admin() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  begin
    for r in select * from jsonb_array_elements(p_rows) loop
      if coalesce(trim(r ->> 'prospect'), '') = '' then
        v_skipped := v_skipped || jsonb_build_object('row', r -> 'row', 'reason', 'Company name is missing');
        continue;
      end if;
      if coalesce(trim(r ->> 'contact_name'), '') = '' then
        v_skipped := v_skipped || jsonb_build_object('row', r -> 'row', 'prospect', r ->> 'prospect',
                                                     'reason', 'Contact name is missing');
        continue;
      end if;

      select c.name into v_dup from public.contacts c
      where c.client_id = p_client and (
            (nullif(r ->> 'email', '') is not null and lower(c.email) = lower(r ->> 'email'))
         or (nullif(r ->> 'phone', '') is not null and c.phone = r ->> 'phone')
         or (nullif(r ->> 'linkedin_url', '') is not null and c.linkedin_url = r ->> 'linkedin_url'))
      limit 1;
      if found then
        v_skipped := v_skipped || jsonb_build_object('row', r -> 'row', 'prospect', r ->> 'prospect',
          'reason', 'Duplicate contact (same email, phone or LinkedIn as ' || v_dup || ')');
        continue;
      end if;

      select p.id into v_owner from public.profiles p
      where lower(trim(p.full_name)) = lower(trim(r ->> 'owner')) and p.role in ('sdr', 'manager', 'super_admin')
      limit 1;
      v_owner := coalesce(v_owner, auth.uid());

      select a.id into v_account from public.accounts a
      where a.client_id = p_client and not a.is_archived
        and a.name_key = public.normalize_company(r ->> 'prospect')
      limit 1;
      if not found then
        insert into public.accounts (client_id, name, location, owner_id)
        values (p_client, trim(r ->> 'prospect'), nullif(r ->> 'location', ''), v_owner)
        returning id into v_account;
        v_accounts := v_accounts + 1;
      end if;
      if p_campaign is not null then
        insert into public.account_campaigns (account_id, campaign_id) values (v_account, p_campaign)
        on conflict do nothing;
      end if;

      select s.value into v_status from public.prospect_statuses s
      where lower(s.value) = lower(trim(r ->> 'status'));
      insert into public.contacts (client_id, account_id, campaign_id, name, designation, linkedin_url,
                                   location, email, phone, prospect_status, client_note)
      values (p_client, v_account, p_campaign, trim(r ->> 'contact_name'), nullif(r ->> 'designation', ''),
              nullif(r ->> 'linkedin_url', ''), nullif(r ->> 'location', ''), nullif(r ->> 'email', ''),
              nullif(r ->> 'phone', ''), coalesce(v_status, 'Not started'), nullif(r ->> 'notes', ''))
      returning id into v_contact;

      if nullif(r ->> 'date', '') is not null then
        insert into public.activities (client_id, account_id, contact_id, campaign_id, activity_date,
                                       channel, internal_note)
        values (p_client, v_account, v_contact, p_campaign, (r ->> 'date')::date, 'note',
                'Imported from the legacy calling sheet');
      end if;
      if nullif(r ->> 'followup_date', '') is not null then
        insert into public.followups (client_id, account_id, contact_id, owner_id, due_date, action)
        values (p_client, v_account, v_contact, v_owner, (r ->> 'followup_date')::date, 'Imported follow-up');
      end if;
      v_imported := v_imported + 1;
    end loop;

    if not p_commit then
      raise exception 'dry run' using errcode = 'P0DRY';
    end if;
  exception when sqlstate 'P0DRY' then
    null; -- everything inserted above is rolled back; the counters survive
  end;
  return jsonb_build_object('committed', p_commit, 'imported', v_imported,
                            'accounts_created', v_accounts, 'skipped', v_skipped);
end $$;

-- ---------------------------------------------------------------- grants for the new objects
revoke all on all tables in schema public from anon;
revoke execute on all functions in schema public from public, anon;
revoke execute on all functions in schema private from public, anon;
grant select on public.attention_items to authenticated;
grant execute on all functions in schema public to authenticated;
grant execute on all functions in schema private to authenticated;

-- ===== supabase/migrations/0003_faster_access_checks.sql =====
-- Vazpio CRM - faster access checks.
-- The first version asked "may this user see this client?" once for every row read. These policies
-- ask "which clients may this user see?" once per query and compare each row against that list.
-- The rules themselves are unchanged.

create function private.my_client_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select c.id from public.clients c
  where case private.my_role()
    when 'super_admin' then true
    when 'manager' then true
    when 'sdr' then c.status = 'active' and exists (
      select 1 from public.client_sdrs s
      where s.client_id = c.id and s.sdr_id = (select auth.uid()))
    else false end
$$;

revoke execute on function private.my_client_ids() from public, anon;
grant execute on function private.my_client_ids() to authenticated;

drop policy profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select private.is_staff()));

-- clients_read deliberately stays a per-row check (private.can_work_client). The list-based form
-- cannot see a client in the statement that creates it, which would break "create client".
-- The clients table is small, so the per-row cost is negligible.

drop policy client_sdrs_read on public.client_sdrs;
create policy client_sdrs_read on public.client_sdrs for select to authenticated
  using ((select private.is_staff()));

drop policy campaigns_read on public.campaigns;
create policy campaigns_read on public.campaigns for select to authenticated
  using (client_id in (select private.my_client_ids()));

drop policy accounts_read on public.accounts;
drop policy accounts_insert on public.accounts;
drop policy accounts_update on public.accounts;
create policy accounts_read on public.accounts for select to authenticated
  using (client_id in (select private.my_client_ids()));
create policy accounts_insert on public.accounts for insert to authenticated
  with check (client_id in (select private.my_client_ids()));
create policy accounts_update on public.accounts for update to authenticated
  using (client_id in (select private.my_client_ids()))
  with check (client_id in (select private.my_client_ids()));

drop policy contacts_read on public.contacts;
drop policy contacts_insert on public.contacts;
drop policy contacts_update on public.contacts;
create policy contacts_read on public.contacts for select to authenticated
  using (client_id in (select private.my_client_ids()));
create policy contacts_insert on public.contacts for insert to authenticated
  with check (client_id in (select private.my_client_ids()));
create policy contacts_update on public.contacts for update to authenticated
  using (client_id in (select private.my_client_ids()))
  with check (client_id in (select private.my_client_ids()));

drop policy activities_read on public.activities;
drop policy activities_insert on public.activities;
create policy activities_read on public.activities for select to authenticated
  using (client_id in (select private.my_client_ids()));
create policy activities_insert on public.activities for insert to authenticated
  with check (client_id in (select private.my_client_ids()) and sdr_id = (select auth.uid()));

drop policy followups_read on public.followups;
drop policy followups_insert on public.followups;
drop policy followups_update on public.followups;
create policy followups_read on public.followups for select to authenticated
  using (client_id in (select private.my_client_ids()));
create policy followups_insert on public.followups for insert to authenticated
  with check (client_id in (select private.my_client_ids()));
create policy followups_update on public.followups for update to authenticated
  using (client_id in (select private.my_client_ids()))
  with check (client_id in (select private.my_client_ids()));

drop policy meetings_read on public.meetings;
drop policy meetings_insert on public.meetings;
drop policy meetings_update on public.meetings;
create policy meetings_read on public.meetings for select to authenticated
  using (client_id in (select private.my_client_ids()));
create policy meetings_insert on public.meetings for insert to authenticated
  with check (client_id in (select private.my_client_ids()));
create policy meetings_update on public.meetings for update to authenticated
  using (client_id in (select private.my_client_ids()))
  with check (client_id in (select private.my_client_ids()));

-- Newest-first paging of the calling sheet, and the dashboard's date-range scans.
create index if not exists contacts_client_created_idx on public.contacts (client_id, created_at desc);
create index if not exists meetings_sdr_idx on public.meetings (sdr_id, booked_on);
create index if not exists activities_sdr_date_idx on public.activities (sdr_id, activity_date);

commit;
