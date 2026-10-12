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
