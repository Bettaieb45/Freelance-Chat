import "server-only";
import { randomUUID } from "node:crypto";
import nodemailer from "nodemailer";
import { gmailAddress, mailCredentials, replyAddress, smtpServer } from "./config";

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export type ClientEmail = {
  to: string;
  freelancerName: string;
  body: string;
  chatUrl: string;
  replyToken: string;
  /** Message-ID of the previous email to this client, to keep one thread. */
  previousMessageId: string | null;
};

/** Sends one chat message to a client by email. Returns the new Message-ID. */
export async function sendClientEmail(e: ClientEmail): Promise<string> {
  const from = gmailAddress();
  const domain = from.split("@")[1];
  const messageId = `<${randomUUID()}@${domain}>`;
  const transport = nodemailer.createTransport({ ...smtpServer(), auth: mailCredentials() });

  const text = `${e.freelancerName} sent you a message:

${e.body}

—
Reply to this email to answer, or open your private chat: ${e.chatUrl}`;

  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;color:#0f172a">
  <p style="color:#64748b;font-size:14px;margin:0 0 8px">${escapeHtml(e.freelancerName)} sent you a message:</p>
  <div style="background:#f1f5f9;border-radius:14px;padding:14px 16px;font-size:16px;line-height:1.45;white-space:pre-wrap">${escapeHtml(e.body)}</div>
  <p style="font-size:14px;color:#334155;margin:20px 0 12px">Just reply to this email to answer.</p>
  <a href="${escapeHtml(e.chatUrl)}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:10px 16px;border-radius:10px;font-size:14px">Open the chat</a>
</div>`;

  await transport.sendMail({
    from: { name: e.freelancerName, address: from },
    to: e.to,
    replyTo: replyAddress(e.replyToken, from),
    subject: `New message from ${e.freelancerName}`,
    text,
    html,
    messageId,
    ...(e.previousMessageId ? { inReplyTo: e.previousMessageId, references: [e.previousMessageId] } : {}),
  });
  return messageId;
}
