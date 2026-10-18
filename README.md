# Vazpio CRM

Internal multi-client CRM that replaces the Google Sheets calling sheet. Next.js app with a Supabase
(Postgres) database.

## Run it

1. `npm install`
2. Copy `.env.example` to `.env.local` and fill in the Supabase project URL and publishable/anon key.
3. `npm run dev`, then open `http://localhost:3000`.
4. Sign up on `/login`. **The first account created becomes Super Admin.** Everyone who signs up
   afterwards appears on **Users** and waits there for a role.

A new database needs every file in `supabase/migrations/` applied in order.

Deploys go to Vercel from this folder with `npx vercel deploy --prod --yes`. `vercel.json` pins the
server to Mumbai (`bom1`), the same region as the database (Supabase `ap-south-1`); keep the two together or every page slows down.

## First-time setup in the app

1. **Clients**: add the client, then a campaign (monthly target, payout per HQM, minimum HQMs).
2. **Users**: give each person a role. Client users must be linked to their client.
3. **Clients > client**: tick the SDRs who work on it. Add any campaign custom fields.
4. **Import / Export**: upload the existing calling sheet (`.xlsx` or `.csv`). The file is checked
   first and nothing is saved until you confirm.

## Roles

| Role | Sees | Can do |
|---|---|---|
| Super Admin / Manager | Everything | Configure, approve HQMs, payouts, profitability, import, export, audit |
| SDR | Clients they are assigned to | Add prospects, log calls, follow-ups, meetings. After save only status and notes stay editable |
| Client Admin / Viewer | Their own client's portal | Read-only. No edit, export or internal notes |

## How access is enforced

Client isolation and edit rules live in the database (row-level security and triggers), not in the pages:

- SDRs only read clients they are assigned to. Client users cannot read any table; the portal uses the
  `portal_*` functions, which return only client-safe columns for the caller's own client.
- After an SDR saves a record, a blank field can be filled once; changing a filled one needs an edit
  request approved by an Admin.
- Call history is insert-only, and every change to core records is written to `audit_log`.

## Tests

```
DATABASE_URL="postgresql://postgres.<ref>:<password>@<pooler-host>:5432/postgres" npm run test:db
```

Runs about 70 checks of the database rules as simulated users (admin, SDRs, client user, signed-out)
inside one transaction that is rolled back, so it is safe to run against the live database.

## Supabase settings to review

- **Authentication > Providers**: enable Google with Vazpio's OAuth credentials for Google login.
- **Authentication > Emails**: sign-ups must confirm their email. The built-in mailer is rate-limited,
  so connect an SMTP provider before inviting the whole team.
- **Authentication > Sessions**: set the inactivity timeout Vazpio wants.
