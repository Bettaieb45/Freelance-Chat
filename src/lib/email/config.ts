// Email runs through the freelancer's Gmail (CLAUDE.md decision 6): SMTP to
// send with an App Password, IMAP to read replies. Host overrides exist for
// tests (a local mail server) or a future provider.

export function emailConfigured(): boolean {
  return !!(process.env.GMAIL_ADDRESS && process.env.GMAIL_APP_PASSWORD);
}

export function gmailAddress(): string {
  const a = process.env.GMAIL_ADDRESS;
  if (!a) throw new Error("Missing environment variable GMAIL_ADDRESS (see README setup checklist)");
  return a.trim().toLowerCase();
}

export function mailCredentials() {
  return { user: gmailAddress(), pass: (process.env.GMAIL_APP_PASSWORD ?? "").replace(/\s+/g, "") };
}

export function smtpServer() {
  return {
    host: process.env.EMAIL_SMTP_HOST ?? "smtp.gmail.com",
    port: Number(process.env.EMAIL_SMTP_PORT ?? 465),
    secure: (process.env.EMAIL_SMTP_SECURE ?? "true") === "true",
  };
}

export function imapServer() {
  return {
    host: process.env.EMAIL_IMAP_HOST ?? "imap.gmail.com",
    port: Number(process.env.EMAIL_IMAP_PORT ?? 993),
    secure: (process.env.EMAIL_IMAP_SECURE ?? "true") === "true",
  };
}

/** Per-client reply address using plus addressing: you+c<token>@gmail.com */
export function replyAddress(token: string, base = gmailAddress()): string {
  const [local, domain] = base.split("@");
  return `${local}+c${token}@${domain}`;
}

const TOKEN_RE = /\+c([0-9a-f]{24})@/i;

/** Finds the reply token in any of the given addresses/header values. */
export function findReplyToken(values: (string | null | undefined)[]): string | null {
  for (const v of values) {
    const m = v?.match(TOKEN_RE);
    if (m) return m[1].toLowerCase();
  }
  return null;
}
