# Client Chat — Project Context

## The problem
Freelancers have to give clients their personal phone number to stay in touch. They don't want a
second number, don't want to pay for Upwork, and don't want to pay for Slack seats. Clients won't
install a new app just to talk to one freelancer.

## The product
One private link per client. The client never signs up or installs anything. The freelancer manages
every client conversation from one inbox (PWA). Clients can reply from wherever they prefer — web
page, Telegram, or email — and every reply lands in the freelancer's inbox. The freelancer replies
from the app; the reply is delivered back on the client's channel.

Core idea: don't force the client back to the link. The app is a bridge between the freelancer's
inbox and the client's preferred channel.

## MVP scope (v1)

### Freelancer app (PWA)
- Sign in with Google only (Supabase Auth)
- One inbox listing all clients, newest activity first
- Realtime chat per client
- Push notifications (Web Push) for new client messages
- Read receipts (see when the client has read a message)
- Business hours + auto-reply outside them
- Add client (name, email, Google Drive link), archive client

### Client page (no login)
- Private magic link: `/c/[token]`, protected by a passcode (see Decisions)
- Web chat with the freelancer (realtime)
- Pinned Google Drive folder link (no file uploads in v1)
- On first visit, client chooses how to get updates: Web, Telegram, or Email

### Telegram bridge
- One shared bot for the whole app
- Each client gets a deep link: `t.me/<BotName>?start=<code>`
- `/start` with the code links the Telegram chat_id to that client
- Client messages in Telegram -> saved as messages -> shown in freelancer inbox
- Freelancer replies in app -> bot sends them to the client's Telegram chat
- Use a webhook (not polling), library: grammY

### Two-way email
- Outbound: "New message from <freelancer>" email containing the message text and a magic link to
  the client page
- Inbound: each conversation has its own reply-to address; client replies by email -> parsed ->
  saved as a message in the thread
- Strip quoted previous text from email replies
- Provider: Resend (outbound + inbound) — see Decisions, needs a domain

### Escalation ladder
- If the client page is open -> deliver live only
- Unread after ~10 minutes -> send to the client's chosen channel (Telegram or email)
- Still unread after 24 hours -> one email reminder
- Never spam: one notification per batch of unread messages

## Out of scope for v1
WhatsApp, file uploads, invoices, approvals, payments, native mobile app, team accounts, custom
branding.

## Later (v2+)
- WhatsApp Business API bridge (paid tier — Meta charges for template messages outside the 24h
  window; needs Meta business verification; routing via wa.me link with pre-filled code)
- Approvals and invoices on the client page
- "Powered by" footer on client pages for growth
- Paid tier: WhatsApp, larger storage, custom branding, invoicing. Core (chat, email, Telegram)
  stays free.

## Tech stack (free tiers)
- Next.js (App Router, TypeScript) on Vercel
- Supabase: Postgres, Auth (Google + anonymous sessions for clients), Realtime
- Telegram Bot API via grammY, webhook route in Next.js
- Resend for email (outbound + inbound webhook)
- Web Push (web-push library, VAPID keys)
- Tailwind CSS
- All secrets in environment variables, never committed

## Data model (starting point)
- freelancers: id, auth_user_id, name, email, business_hours, auto_reply_text
- clients: id, freelancer_id, name, email, drive_link, magic_token,
  preferred_channel (web|telegram|email), archived, last_message_* (inbox preview)
- client_access (service role only): client_id, passcode_hash, failed_attempts, locked_until
- client_sessions: auth_user_id (anonymous Supabase user), client_id — a device that entered the
  correct passcode
- messages: id, client_id, sender (freelancer|client), body, channel (web|telegram|email),
  created_at, delivered_at, read_at
- telegram_links: client_id, telegram_chat_id
- push_subscriptions: freelancer_id, subscription_json
- Use Row Level Security so freelancers only see their own clients and messages, and client
  devices only see their own conversation.

## Build phases
1. Auth (Google), add client, client page with realtime web chat, freelancer inbox
2. Telegram bot bridge
3. Two-way email
4. Push notifications, escalation ladder, business hours + auto-reply
5. Privacy policy, GDPR data deletion (EU users), then onboard real clients

## Success test
3 real clients use it for 4 weeks and reply through it without being nudged.

## Decisions (agreed with the founder)
1. **Single user for now.** Only the founder uses the freelancer app. Google sign-in is restricted
   to the address in the `ALLOWED_EMAIL` env var; anyone else is rejected. The data model stays
   multi-freelancer so this can be opened up later.
2. **Client access = link + passcode, no account.** Each client gets a magic link and a 6-digit
   passcode, which the freelancer shares with them. On first visit the client enters the passcode
   once; the browser then gets a long-lived anonymous Supabase session that is linked to that
   client (`client_sessions`), so they never type it again on that device.
   - Only a hash of the passcode is stored. The freelancer sees it once, and can reset it.
   - 5 wrong attempts lock the passcode for 15 minutes.
   - Archiving a client, or resetting the passcode/link, signs out all of that client's devices.
   - Later phases may add "email me a code" as an alternative to the passcode.
   - The Telegram deep link uses a one-time code generated *after* the client has unlocked the
     page, never the magic token itself.
3. **What "read" means across channels.** Telegram doesn't report reads to bots and email opens
   are unreliable, so each freelancer message has three states:
   - **Sent** — saved.
   - **Delivered** (`delivered_at`) — pushed to the client's Telegram chat or email.
   - **Seen** (`read_at`) — the client had the web page open and visible while the message was
     on screen, **or** the client sent any message on any channel after it (replying proves
     they read it).
   The escalation ladder stops for a batch as soon as it is seen. The 24h reminder email only goes
   out if there has been no client activity at all (no page visit, no reply) since the batch.
4. **Clients who choose "Web"** fall back to email for the ~10-minute escalation, if we have their
   email address. With no email, they only get live web delivery.
5. **Timed jobs run in Supabase, not Vercel** (Vercel Hobby cron is once a day). A Supabase
   `pg_cron` job calls `/api/cron/escalate` every few minutes via `pg_net`, authenticated with a
   `CRON_SECRET` header.
6. **Email domain: open question for Phase 3.** The founder has only a Gmail address, no domain.
   Resend can't send to clients or receive mail without a verified domain. Recommended: buy a
   cheap domain (~$10/year) at Phase 3. Fallback: send via Gmail SMTP (app password) and receive
   via Gmail plus-addressing (`you+<id>@gmail.com`) read over IMAP — free, but exposes the
   personal Gmail address to clients. Decide before starting Phase 3.

## Repo conventions
- Schema lives in `supabase/migrations/` (one new file per change). RLS/RPC tests in
  `supabase/tests/rls_test.sql`, run with `npm run test:db`.
- Before pushing: `npm run lint && npm run typecheck && npm test && npm run test:db`.
- Freelancer and client devices use separate Supabase auth cookies (`src/lib/supabase/cookies.ts`).
- Service-role client (`src/lib/supabase/admin.ts`) only after checking who is calling.

## Working style
- The founder builds from the Claude mobile app (Claude Code on the web). Keep each task to one
  phase or smaller.
- Open a PR per task; Vercel preview links are used for testing on the phone.
- Maintain a README with a setup checklist (Supabase, Vercel env vars, Telegram BotFather token,
  Resend keys).
- Keep the UI mobile-first and simple.

@AGENTS.md
