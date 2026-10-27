import nodemailer from "nodemailer";
import { env } from "@/env";

const transport = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
});

type Mail = { to: string; subject: string; text: string; html?: string };

export async function sendMail({ to, subject, text, html }: Mail) {
  await transport.sendMail({ from: env.MAIL_FROM, to, subject, text, html });
}
