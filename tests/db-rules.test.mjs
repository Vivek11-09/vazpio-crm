// Checks the database rules (client isolation, edit locks, duplicates, HQM, payouts, import) as
// simulated users. Everything runs inside one transaction that is rolled back, so no data is left.
//
//   DATABASE_URL="postgresql://postgres.<ref>:<password>@<pooler-host>:5432/postgres" npm run test:db
import pg from "pg";

if (!process.env.DATABASE_URL) {
  console.error("Set DATABASE_URL to the Supabase connection string first.");
  process.exit(1);
}
const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const U = { admin: "00000000-0000-0000-0000-0000000000a1", sdr1: "00000000-0000-0000-0000-0000000000a2", sdr2: "00000000-0000-0000-0000-0000000000a3", cli: "00000000-0000-0000-0000-0000000000a4" };
let pass = 0, failn = 0;
const ok = (name, cond, extra = "") => { if (cond) pass++; else failn++; console.log(cond ? "PASS" : "FAIL", name, extra); };
const q = async (sql, p) => (await c.query(sql, p)).rows;
async function as(who) {
  await c.query("reset role");
  if (who === "postgres") return;
  if (who === "anon") { await c.query("select set_config('request.jwt.claims', '{}', true)"); await c.query("set local role anon"); return; }
  await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: U[who], role: "authenticated" })]);
  await c.query("set local role authenticated");
}
// run a statement expected to fail, without aborting the transaction
async function fails(name, sql, p, match) {
  await c.query("savepoint s");
  try { await c.query(sql, p); await c.query("release savepoint s"); ok(name, false, "(no error raised)"); }
  catch (e) { await c.query("rollback to savepoint s"); ok(name, match.test(e.message + e.code), `-> ${e.code} ${e.message.slice(0, 90)}`); }
}
await c.query("begin");
try {
  for (const [k, id] of Object.entries(U)) await c.query("insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)", [id, `${k}@test.local`, { full_name: k }]);
  // On an empty database the first signup becomes Super Admin. On a live one every signup waits,
  // so the test admin is promoted here to exercise the rest of the rules.
  const p = await q("select id, role, is_active from public.profiles where id = any($1)", [Object.values(U)]);
  const wasEmpty = (await q("select count(*)::int n from public.profiles where id <> all($1)", [Object.values(U)]))[0].n === 0;
  if (wasEmpty) ok("first signup is super_admin, others pending", p.find(r => r.id === U.admin).role === "super_admin" && p.filter(r => r.is_active).length === 1);
  else {
    ok("signups on a live database wait for approval", p.every(r => r.role === null && !r.is_active));
    await c.query("update public.profiles set role='super_admin', is_active=true where id=$1", [U.admin]);
  }

  await as("sdr1");
  ok("pending user sees no clients", (await q("select * from public.clients")).length === 0);
  ok("pending user cannot self-promote", (await q("update public.profiles set role='super_admin', is_active=true where id=$1 returning id", [U.sdr1])).length === 0);

  await as("admin");
  await c.query("update public.profiles set role='sdr', is_active=true where id in ($1,$2)", [U.sdr1, U.sdr2]);
  const [A] = await q("insert into public.clients (name) values ('Client A') returning id");
  const [B] = await q("insert into public.clients (name) values ('Client B') returning id");
  await c.query("update public.profiles set role='client_admin', client_id=$2, is_active=true where id=$1", [U.cli, A.id]);
  const [camp] = await q("insert into public.campaigns (client_id, name, monthly_meeting_target, payout_rate, payout_threshold) values ($1,'Camp',5,1000,1) returning id", [A.id]);
  await c.query("insert into public.client_sdrs (client_id, sdr_id) values ($1,$2),($3,$4)", [A.id, U.sdr1, B.id, U.sdr2]);

  await as("sdr1");
  ok("sdr1 sees only assigned client", (await q("select name from public.clients")).map(r => r.name).join() === "Client A");
  const [acc] = await q("insert into public.accounts (client_id, name, website, owner_id) values ($1,'Fyno Pvt. Ltd.','https://www.fyno.io/about',$2) returning id, owner_id, name_key, domain_key", [A.id, U.sdr2]);
  ok("account owner forced to creating SDR; keys normalised", acc.owner_id === U.sdr1 && acc.name_key === "fyno" && acc.domain_key === "fyno.io", JSON.stringify(acc));
  await fails("duplicate company name blocked", "insert into public.accounts (client_id, name, owner_id) values ($1,'FYNO',$2)", [A.id, U.sdr1], /23505/);
  await fails("duplicate domain blocked", "insert into public.accounts (client_id, name, website, owner_id) values ($1,'Other Name','fyno.io',$2)", [A.id, U.sdr1], /23505/);
  await fails("sdr1 cannot create account for unassigned client", "insert into public.accounts (client_id, name, owner_id) values ($1,'X',$2)", [B.id, U.sdr1], /row-level security/);
  const m = await q("select name, match, owner_name from public.find_account_matches($1,'Fyno Private Limited', null)", [A.id]);
  ok("find_account_matches finds exact match with owner", m.length === 1 && m[0].match === "exact" && m[0].owner_name === "sdr1", JSON.stringify(m));
  const sim = await q("select name, match from public.find_account_matches($1,'Fynoo', null)", [A.id]);
  ok("find_account_matches flags similar name", sim.length === 1 && sim[0].match === "similar", JSON.stringify(sim));

  const [con] = await q("insert into public.contacts (client_id, account_id, campaign_id, name, email, client_note, internal_note) values ($1,$2,$3,'Aniketh','a@fyno.io','visible','SECRET internal') returning id", [A.id, acc.id, camp.id]);
  await c.query("update public.contacts set prospect_status='In progress', client_note='n2' where id=$1", [con.id]);
  ok("sdr can change status and notes", true);
  await c.query("update public.contacts set phone='9900000146' where id=$1", [con.id]);
  ok("sdr can fill a blank field once", true);
  await fails("sdr cannot change a filled field", "update public.contacts set phone='111' where id=$1", [con.id], /locked/);
  await fails("sdr cannot change email", "update public.contacts set email='x@y.z' where id=$1", [con.id], /locked/);
  await fails("sdr cannot rename account", "update public.accounts set name='Renamed' where id=$1", [acc.id], /locked/);
  ok("sdr cannot delete contact", (await q("delete from public.contacts returning id")).length === 0);

  const [a1] = await q("insert into public.activities (client_id, account_id, contact_id, campaign_id, outcome, client_note, internal_note, next_followup_date, next_action) values ($1,$2,$3,$4,'Callback Requested','call back','int', public.today_ist()-1, 'call again') returning id", [A.id, acc.id, con.id, camp.id]);
  let fu = await q("select status, due_date from public.followups where contact_id=$1", [con.id]);
  ok("activity with follow-up date creates a task", fu.length === 1 && fu[0].status === "open");
  const sheet = await q("select followup_alert, call_count, last_outcome, owner_name from public.calling_sheet where contact_id=$1", [con.id]);
  ok("calling sheet shows OVERDUE alert", sheet[0].followup_alert === "OVERDUE" && sheet[0].call_count === 1, JSON.stringify(sheet[0]));
  await q("insert into public.activities (client_id, account_id, contact_id, campaign_id, outcome) values ($1,$2,$3,$4,'No Answer')", [A.id, acc.id, con.id, camp.id]);
  fu = await q("select status from public.followups where contact_id=$1", [con.id]);
  ok("next call closes the open follow-up", fu.length === 1 && fu[0].status === "done");
  ok("activities cannot be edited", (await q("update public.activities set client_note='changed' where id=$1 returning id", [a1.id])).length === 0);
  ok("activities cannot be deleted", (await q("delete from public.activities where id=$1 returning id", [a1.id])).length === 0);
  await fails("call without outcome rejected", "insert into public.activities (client_id, account_id, contact_id) values ($1,$2,$3)", [A.id, acc.id, con.id], /call_needs_outcome/);

  const [mt] = await q("insert into public.meetings (client_id, campaign_id, account_id, contact_id, scheduled_at, hqm_status) values ($1,$2,$3,$4, now(), 'accepted') returning id, hqm_status, billable", [A.id, camp.id, acc.id, con.id]);
  ok("sdr cannot create a pre-accepted HQM", mt.hqm_status === "pending" && mt.billable === false);
  await c.query("update public.meetings set status='Held' where id=$1", [mt.id]);
  await fails("sdr cannot accept HQM", "update public.meetings set hqm_status='accepted', qualification_notes='q' where id=$1", [mt.id], /Admin or Manager/);
  ok("sdr cannot read audit log", (await q("select * from public.audit_log")).length === 0);
  ok("sdr cannot read client financials", (await q("select * from public.client_financials")).length === 0);
  await fails("sdr cannot compute payouts", "select public.compute_payouts(public.today_ist())", [], /Not allowed/);
  await c.query("insert into public.edit_requests (table_name, record_id, field, current_value, requested_value, reason) values ('contacts',$1,'email','a@fyno.io','new@fyno.io','typo')", [con.id]);

  await as("sdr2");
  ok("sdr2 cannot see Client A accounts/contacts/activities",
    (await q("select 1 from public.accounts where client_id=$1", [A.id])).length + (await q("select 1 from public.contacts")).length + (await q("select 1 from public.activities")).length + (await q("select 1 from public.calling_sheet")).length === 0);
  ok("sdr2 gets nothing from portal preview of Client A", (await q("select * from public.portal_calling_sheet($1)", [A.id])).length === 0);
  ok("sdr2 dashboard counts nothing from Client A", (await q("select public.dashboard_stats(public.today_ist()-30, public.today_ist(), $1) s", [A.id]))[0].s.calls === 0);
  await c.query("insert into public.accounts (client_id, name, owner_id) values ($1,'Fyno',$2)", [B.id, U.sdr2]);
  ok("same company allowed under a different client", true);

  await as("admin");
  await fails("HQM needs qualification notes", "update public.meetings set hqm_status='accepted' where id=$1", [mt.id], /Qualification notes/);
  const [acc2] = await q("update public.meetings set hqm_status='accepted', qualification_notes='good fit', client_confirmed_by='Jane' where id=$1 returning billable, hqm_decided_by", [mt.id]);
  ok("admin accepts HQM -> billable, decision recorded", acc2.billable === true && acc2.hqm_decided_by === U.admin);
  const er = await q("select id from public.edit_requests");
  await c.query("select public.decide_edit_request($1, true)", [er[0].id]);
  ok("approved edit request applies the correction", (await q("select email from public.contacts where id=$1", [con.id]))[0].email === "new@fyno.io");
  ok("payout computed", (await q("select public.compute_payouts(public.today_ist()) n"))[0].n >= 1);
  const pr = await q("select hqm_count, gross, status from public.payout_runs where sdr_id=$1", [U.sdr1]);
  ok("payout = 1 HQM x 1000", pr.length === 1 && Number(pr[0].gross) === 1000, JSON.stringify(pr));
  await c.query("update public.payout_runs set status='approved' where sdr_id=$1", [U.sdr1]);
  await c.query("insert into public.client_financials (client_id, month, revenue, tool_cost) values ($1, date_trunc('month', public.today_ist())::date, 50000, 4000)", [A.id]);
  const prof = await q("select contribution_margin, margin_pct from public.client_profitability where client_id=$1", [A.id]);
  ok("profitability 50000-1000-4000 = 45000 (90%)", Number(prof[0].contribution_margin) === 45000 && Number(prof[0].margin_pct) === 90, JSON.stringify(prof));
  const lb = await q("select sdr_name, calls, connected, hqm, score from public.sdr_leaderboard(public.today_ist()-30, public.today_ist()) where sdr_id = any($1) order by calls desc", [[U.sdr1, U.sdr2]]);
  ok("leaderboard lists SDRs", lb.length === 2 && lb[0].sdr_name === "sdr1" && Number(lb[0].calls) === 2 && Number(lb[0].hqm) === 1, JSON.stringify(lb[0]));
  const st = (await q("select public.dashboard_stats(public.today_ist()-30, public.today_ist(), $1) s", [A.id]))[0].s;
  ok("dashboard stats", st.calls === 2 && st.connected === 1 && st.hqm === 1 && st.meetings_held === 1 && st.monthly_target === 5, JSON.stringify(st).slice(0, 260));
  const au = await q("select table_name, action, actor_id from public.audit_log where table_name='contacts' and action='UPDATE'");
  ok("audit log records contact updates with actor", au.length >= 3 && au.every(r => r.actor_id), `${au.length} rows`);
  ok("admin cannot edit audit log", (await q("update public.audit_log set action='x' returning id")).length === 0);

  await as("cli");
  const direct = (await q("select 1 from public.contacts")).length + (await q("select 1 from public.accounts")).length + (await q("select 1 from public.activities")).length + (await q("select 1 from public.campaigns")).length + (await q("select 1 from public.meetings")).length + (await q("select 1 from public.calling_sheet")).length + (await q("select 1 from public.profiles where id <> $1", [U.cli])).length;
  ok("client user reads no base tables directly", direct === 0);
  const ps = await q("select * from public.portal_calling_sheet()");
  ok("portal sheet: own rows, owner masked, no internal note", ps.length === 1 && ps[0].owner === "Vazpio Team" && !JSON.stringify(ps).includes("SECRET") && !JSON.stringify(ps).includes("sdr1"), JSON.stringify(ps[0]).slice(0, 200));
  ok("client cannot preview another client", (await q("select * from public.portal_calling_sheet($1)", [B.id])).every(r => r.prospect === "Fyno Pvt. Ltd."));
  ok("portal stats work", (await q("select public.portal_stats(public.today_ist()-30, public.today_ist()) s"))[0].s.calls === 2);
  ok("client direct dashboard_stats is empty", (await q("select public.dashboard_stats(public.today_ist()-30, public.today_ist()) s"))[0].s.calls === 0);
  ok("portal meetings + campaigns", (await q("select * from public.portal_meetings()")).length === 1 && (await q("select * from public.portal_campaigns()")).length === 1);
  await fails("client cannot insert contact", "insert into public.contacts (client_id, account_id, name) values ($1,$2,'x')", [A.id, acc.id], /row-level security/);
  ok("client cannot update status", (await q("update public.contacts set prospect_status='Converted' returning id")).length === 0);
  ok("client sees own client row only", (await q("select name from public.clients")).map(r => r.name).join() === "Client A");

  await as("anon");
  await fails("anon cannot read tables", "select * from public.clients", [], /permission denied/);
  await fails("anon cannot call portal function", "select * from public.portal_calling_sheet()", [], /permission denied/);

  // ---- custom fields
  await as("admin");
  await c.query("insert into public.custom_fields (campaign_id, object, key, label, field_type, client_visible) values ($1,'contact','team_size','Team size','number',true), ($1,'contact','secret_research','Research','short_text',false)", [camp.id]);
  await as("sdr1");
  await c.query("update public.contacts set custom = '{\"team_size\": 40, \"secret_research\": \"private\"}' where id=$1", [con.id]);
  ok("sdr can fill empty custom fields", true);
  await fails("sdr cannot change a filled custom field", "update public.contacts set custom = '{\"team_size\": 99, \"secret_research\": \"private\"}' where id=$1", [con.id], /locked/);
  await as("cli");
  const pc = (await q("select custom from public.portal_calling_sheet()"))[0].custom;
  ok("portal shows only client-visible custom fields", pc["Team size"] === 40 && !JSON.stringify(pc).includes("private"), JSON.stringify(pc));

  // ---- import
  const rows = JSON.stringify([
    { row: 2, prospect: "Zluri", contact_name: "Arindam", email: "ARINDAM@zluri.com", status: "in progress", owner: "sdr1", notes: "n", date: "2026-09-01", followup_date: "2026-12-01" },
    { row: 3, prospect: "ZLURI Pvt Ltd", contact_name: "Second Person", phone: "7259809872" },
    { row: 4, prospect: "Fyno", contact_name: "Dup", email: "new@fyno.io" },
    { row: 5, prospect: "", contact_name: "No company" },
    { row: 6, prospect: "Yulu", contact_name: "" },
  ]);
  await as("sdr1");
  await fails("sdr cannot import", "select public.import_prospects($1,$2,$3::jsonb,true)", [A.id, camp.id, rows], /Not allowed/);
  await as("admin");
  const dry = (await q("select public.import_prospects($1,$2,$3::jsonb,false) r", [A.id, camp.id, rows]))[0].r;
  ok("import dry run reports 2 importable, 3 skipped, saves nothing", dry.imported === 2 && dry.skipped.length === 3 && dry.accounts_created === 1
    && (await q("select 1 from public.contacts where name='Arindam' and client_id=$1", [A.id])).length === 0, JSON.stringify(dry).slice(0, 220));
  const real = (await q("select public.import_prospects($1,$2,$3::jsonb,true) r", [A.id, camp.id, rows]))[0].r;
  const imp = await q("select c.name, c.prospect_status, a.name account, a.owner_id from public.contacts c join public.accounts a on a.id=c.account_id where a.name='Zluri' and a.client_id=$1 order by c.name", [A.id]);
  ok("import commits: 2 contacts under one account, status and owner mapped", real.imported === 2 && imp.length === 2 && imp[0].prospect_status === "In progress" && imp[0].owner_id === U.sdr1, JSON.stringify(imp));
  ok("import created the follow-up and dated entry", (await q("select 1 from public.followups where action='Imported follow-up' and client_id=$1", [A.id])).length === 1 && (await q("select 1 from public.activities where channel='note' and client_id=$1", [A.id])).length === 1);
  ok("re-running the same import adds nothing", (await q("select public.import_prospects($1,$2,$3::jsonb,true) r", [A.id, camp.id, rows]))[0].r.imported === 0);

  // ---- risk flags and analytics
  ok("nothing is flagged while a prospect is fresh", (await q("select 1 from public.attention_items where contact_id=$1", [con.id])).length === 0);
  // created_at is pinned because every insert in this transaction shares the same now()
  await c.query("insert into public.activities (client_id, account_id, contact_id, outcome, created_at) values ($1,$2,$3,'Send Details / Deck', now() + interval '1 second')", [A.id, acc.id, con.id]);
  ok("deck sent with no follow-up is flagged", (await q("select 1 from public.attention_items where contact_id=$1 and kind like 'Material sent%'", [con.id])).length === 1);
  const st2 = (await q("select public.dashboard_stats(public.today_ist()-30, public.today_ist(), $1) s", [A.id]))[0].s;
  ok("dashboard has industry and location breakdowns", Array.isArray(st2.industry_breakdown) && Array.isArray(st2.location_breakdown));

  // ---- role hardening
  await fails("admin cannot deactivate themselves", "update public.profiles set is_active=false where id=$1", [U.admin], /your own role/);
  await c.query("update public.profiles set role='manager' where id=$1", [U.sdr2]);
  await as("sdr2");
  await fails("manager cannot create a super admin", "update public.profiles set role='super_admin' where id=$1", [U.sdr1], /Only a Super Admin/);
  await fails("manager cannot demote a super admin", "update public.profiles set role='sdr' where id=$1", [U.admin], /Only a Super Admin/);

  await as("admin");
  await c.query("update public.clients set status='inactive' where id=$1", [A.id]);
  await as("sdr1");
  ok("inactive client: SDR loses access", (await q("select 1 from public.contacts")).length === 0);
} catch (e) { console.log("TEST SCRIPT ERROR:", e.message, e.where || ""); failn++; }
await c.query("rollback").catch(() => {});
await c.query("reset role").catch(() => {});
const left = await c.query("select (select count(*) from auth.users) u, (select count(*) from public.clients) c");
console.log(`\n${pass} passed, ${failn} failed. Rolled back; rows left: users=${left.rows[0].u} clients=${left.rows[0].c}`);
await c.end();
