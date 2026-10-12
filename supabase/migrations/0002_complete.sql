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
