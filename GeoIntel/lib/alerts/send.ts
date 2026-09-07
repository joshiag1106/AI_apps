import { createTransport } from 'nodemailer';
import type { Jump } from '@/lib/alerts/detect';

/**
 * Composing and delivering a ladder alert.
 *
 * Delivery is SMTP. An HTTP provider was tried first and abandoned: it required a verified
 * sending domain, which a personal address can never have, so the delivery half stayed
 * unprovable for as long as it was in place. SMTP authenticates as a mailbox that already
 * exists, which is the whole reason it works here.
 *
 * Nodemailer is the single dependency this costs. Node ships no SMTP client, and
 * hand-rolling TLS, AUTH LOGIN and MIME multipart is a great deal of fragile surface for a
 * feature that sends a handful of messages a month.
 *
 * Without credentials nothing is sent and the caller is told so plainly — the whole
 * pipeline stays exercisable in development without mailing a real person, which is the
 * only responsible default for code that can put things in someone's inbox.
 */

export interface Digest { subject: string; text: string; html: string }
export interface SendResult { delivered: boolean; reason?: string }

/** One outgoing message, as handed to whatever actually puts it on the wire. */
export interface MailMessage {
  from: string; to: string; subject: string; text: string; html: string;
}

/** Rejects on failure; `sendDigest` turns that into a SendResult rather than a throw. */
export type Transport = (msg: MailMessage) => Promise<void>;

export interface SendOptions {
  user?: string;
  pass?: string;
  host?: string;
  port?: number;
  from?: string;
  transport?: Transport;
  warn?: (message: string) => void;
}


/**
 * One mail covering every jump in this run.
 *
 * A reader watching two dozen targets during a busy cycle would otherwise get two dozen
 * mails, which is how an alert becomes a nuisance and then a filter rule.
 */
export function renderDigest(jumps: Jump[], origin: string): Digest {
  const n = jumps.length;
  const head = n === 1
    ? `${jumps[0].item.label} moved to rung ${jumps[0].rung}`
    : `${n} watched files moved up the PRC ladder`;

  const lines = jumps.map((j) => {
    const from = j.previous > 0 ? `rung ${j.previous} → ${j.rung}` : `rung ${j.rung}`;
    const formula = [j.event.ladderZh, j.event.ladderEn].filter(Boolean).join(' — ');
    return [
      `${j.item.label}: ${from}`,
      formula && `  ${formula}`,
      `  ${j.event.title}`,
      `  ${origin}/events/${j.event.id}`,
    ].filter(Boolean).join('\n');
  });

  const text = [
    n === 1
      ? 'A file you watch has moved up the PRC official escalation ladder.'
      : `${n} files you watch have moved up the PRC official escalation ladder.`,
    '',
    ...lines,
    '',
    'Movement up the ladder on a given file matters more than raw volume anywhere on it.',
    'This is a corroboration and provenance reading, not a determination of truth.',
    '',
    `Turn these off in your account: ${origin}/account`,
  ].join('\n');

  const esc = (s: string) => s.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]!));
  const html = `<div style="font:14px/1.55 -apple-system,Segoe UI,Roboto,sans-serif">
<p>${esc(text.split('\n')[0])}</p>
${jumps.map((j) => `<p style="margin:14px 0">
<strong>${esc(j.item.label)}</strong> — ${j.previous > 0 ? `rung ${j.previous} &rarr; ${j.rung}` : `rung ${j.rung}`}<br>
${esc([j.event.ladderZh, j.event.ladderEn].filter(Boolean).join(' — '))}<br>
<a href="${origin}/events/${encodeURIComponent(j.event.id)}">${esc(j.event.title)}</a>
</p>`).join('')}
<p style="color:#777;font-size:12px">This is a corroboration and provenance reading, not a determination of truth.<br>
<a href="${origin}/account">Turn these off in your account</a>.</p>
</div>`;

  return { subject: `Kautilya — ${head}`, text, html };
}

/**
 * A real SMTP connection. Port 465 is implicit TLS; anything else is treated as STARTTLS
 * and required to upgrade, so a password never crosses the wire in the clear.
 */
function smtpTransport(host: string, port: number, user: string, pass: string): Transport {
  const mailer = createTransport({
    host,
    port,
    secure: port === 465,
    requireTLS: port !== 465,
    auth: { user, pass },
  });
  return async (msg: MailMessage) => { await mailer.sendMail(msg); };
}

export async function sendDigest(
  to: string,
  digest: Digest,
  opts: SendOptions = {},
): Promise<SendResult> {
  const user = opts.user ?? process.env.SMTP_USER;
  const pass = opts.pass ?? process.env.SMTP_PASS;
  const host = opts.host ?? process.env.SMTP_HOST ?? 'smtp.gmail.com';
  const port = opts.port ?? Number(process.env.SMTP_PORT ?? 465);
  const warn = opts.warn ?? ((message: string) => console.warn(message));

  // No credentials means no send, and no pretending otherwise. The run logs what it would
  // have delivered so the pipeline can be exercised without a live mailbox.
  if (!user || !pass) return { delivered: false, reason: 'no_key' };

  // Most relays rewrite From to whichever account authenticated rather than refusing the
  // mismatch, so a wrong ALERTS_FROM is silently replaced instead of erroring. Say so
  // here, rather than leaving it to be discovered in a received header much later.
  const from = opts.from ?? process.env.ALERTS_FROM ?? user;
  if (from !== user) {
    warn(`[alerts] ALERTS_FROM is ${from} but the authenticated account is ${user}; mail will be sent as ${user}.`);
  }

  const send = opts.transport ?? smtpTransport(host, port, user, pass);
  try {
    await send({ from, to, subject: digest.subject, text: digest.text, html: digest.html });
    return { delivered: true };
  } catch (e) {
    // One unreachable server or one bad address must not abort a whole run.
    return { delivered: false, reason: e instanceof Error ? e.message : String(e) };
  }
}
