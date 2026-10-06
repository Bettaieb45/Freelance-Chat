export type Channel = "web" | "telegram" | "email";
export type Sender = "freelancer" | "client";

export type Message = {
  id: string;
  client_id: string;
  sender: Sender;
  body: string;
  channel: Channel;
  created_at: string;
  delivered_at: string | null;
  delivered_via: Channel | null;
  read_at: string | null;
};

export type ClientRow = {
  id: string;
  name: string;
  email: string | null;
  drive_link: string | null;
  magic_token: string;
  preferred_channel: Channel;
  email_reply_token: string;
  channel_chosen_at: string | null;
  archived: boolean;
  last_message_at: string | null;
  last_message_preview: string | null;
  last_message_sender: Sender | null;
  created_at: string;
};

/** What the freelancer gets to share after creating a client or resetting access. */
export type Invite = { clientId: string; clientName: string; url: string; passcode: string };

export type TelegramLink = { telegram_username: string | null; telegram_name: string | null };
