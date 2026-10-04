# Client Chat

One private chat link per client. Clients open the link, enter a passcode once, and chat — no app,
no sign-up. You manage every conversation from one inbox. See [CLAUDE.md](CLAUDE.md) for the full
product plan and decisions.

**Status:** Phase 1 — Google sign-in, add/archive clients, passcode-protected client page, realtime
web chat with read receipts, inbox.

## Setup checklist

Everything below runs on free tiers. Do it once, in this order. It all works from a phone
browser, but a laptop is easier for the Google Cloud step.

### 1. Supabase (database + auth)

- [ ] Create an account at [supabase.com](https://supabase.com) and a **new project**. Pick an
      **EU region** (simpler for GDPR). Save the database password somewhere safe.
- [ ] **Create the tables:** open **SQL Editor → New query**, paste the full contents of
      [`supabase/migrations/20261004000000_phase1_init.sql`](supabase/migrations/20261004000000_phase1_init.sql),
      and click **Run**. It should say "Success. No rows returned".
- [ ] **Allow client sessions:** **Authentication → Sign In / Providers →** turn on
      **Allow anonymous sign-ins**. (Clients never see an account; this is how a browser
      that entered the right passcode is remembered.)
- [ ] **Copy the keys** from **Project Settings → API Keys** (and the project URL from
      **Project Settings → Data API**). You'll need: Project URL, Publishable key, Secret key.

### 2. Google sign-in

- [ ] Go to [console.cloud.google.com](https://console.cloud.google.com), create a project
      (e.g. "Client Chat").
- [ ] **APIs & Services → OAuth consent screen** (Google Auth Platform): choose **External**,
      fill in the app name and your email. Under **Audience**, leave it in **Testing** and add
      your own Gmail as a **test user**.
- [ ] **Clients → Create client → Web application.** Under **Authorized redirect URIs** add
      `https://YOUR-PROJECT-REF.supabase.co/auth/v1/callback` (your Supabase project URL +
      `/auth/v1/callback`). Copy the **Client ID** and **Client secret**.
- [ ] Back in Supabase: **Authentication → Sign In / Providers → Google**, enable it, paste the
      Client ID and secret, save.

### 3. Vercel (hosting)

- [ ] Create an account at [vercel.com](https://vercel.com) with GitHub, then **Add New →
      Project** and import this repository. Framework: Next.js (detected automatically).
- [ ] Before deploying, add these **Environment Variables** (all environments):

  | Name | Value |
  | --- | --- |
  | `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project URL |
  | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase Publishable key (`sb_publishable_…`) |
  | `SUPABASE_SECRET_KEY` | Supabase Secret key (`sb_secret_…`) — server only |
  | `ALLOWED_EMAIL` | Your Gmail address — the only account allowed to sign in |

- [ ] Deploy. Note your production URL (e.g. `https://client-chat-xyz.vercel.app`).

### 4. Connect Supabase to your Vercel URLs

- [ ] Supabase → **Authentication → URL Configuration**:
  - **Site URL:** your production URL.
  - **Redirect URLs:** add
    - `https://YOUR-PRODUCTION-URL/auth/callback`
    - `https://*-YOUR-VERCEL-TEAM.vercel.app/**` (so PR preview links can sign in — your team
      slug is in any preview URL)
    - `http://localhost:3000/**` (only if you develop locally)

### 5. Try it

- [ ] Open your production URL on your phone → **Continue with Google**.
- [ ] **+ Add client** → you get a link and a 6-digit passcode → **Share invite message**.
- [ ] Open the link in a private/incognito tab (or another phone), enter the passcode, send a
      message. It appears in your inbox instantly.
- [ ] Optional: in Safari/Chrome use **Add to Home Screen** to install the inbox as an app.

### Later phases (not needed yet)

- **Phase 2 — Telegram:** create a bot with [@BotFather](https://t.me/BotFather), copy its token.
- **Phase 3 — Email:** needs a domain for sending to and receiving from clients (see CLAUDE.md
  decision 6). Resend API key.
- **Phase 4 — Push notifications:** VAPID keys (generated with `npx web-push generate-vapid-keys`).

## How client access works

- Each client has an unguessable link (`/c/<token>`) **and** a 6-digit passcode. Only a hash of the
  passcode is stored; you see it once and can reset it any time.
- After the right passcode, that browser stays unlocked (anonymous Supabase session linked to the
  client). Five wrong attempts lock the page for 15 minutes.
- **New passcode**, **New link + passcode**, or **Archive** in the client's settings signs out
  every device immediately.
- Row Level Security makes sure a device can only ever read its own conversation, and the
  freelancer only their own clients.

## Development

```bash
npm install
cp .env.example .env.local   # fill in values (or use the local Supabase below)
npm run dev
```

Local Supabase (needs Docker): `npx supabase start` runs the stack and applies the migrations;
copy the printed URL, publishable key and secret key into `.env.local`. Google sign-in won't work
locally unless you configure a Google client for it.

Checks:

```bash
npm run lint
npm run typecheck
npm test          # unit tests (passcode/token helpers)
npm run test:db   # migrations + RLS tests on a throwaway local Postgres (needs Postgres installed)
```

Database changes go in a new file under `supabase/migrations/` — never edit a migration that has
already been run in production.
