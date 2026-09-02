import type { Jump } from '@/lib/alerts/detect';

/**
 * Composing and delivering a ladder alert.
 *
 * Delivery is a raw HTTP call to Resend, matching how Stripe is used elsewhere here: no
 * SDK, one key, and a working path when the key is absent. Without a key nothing is sent
 * and the caller is told so plainly — the whole pipeline stays exercisable in development
 * without mailing a real person, which is the only responsible default for code that can
 * put things in someone's inbox.
 */

const ENDPOINT = 'https://api.resend.com/emails';

export interface Digest { subject: string; text: string; html: string }
export interface SendResult { delivered: boolean; reason?: string }

export interface SendOptions {
  apiKey?: string;
  from?: string;
  fetchImpl?: typeof fetch;
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

export async function sendDigest(
  to: string,
  digest: Digest,
  opts: SendOptions = {},
): Promise<SendResult> {
  const apiKey = opts.apiKey ?? process.env.RESEND_API_KEY;
  const from = opts.from ?? process.env.ALERTS_FROM;
  const doFetch = opts.fetchImpl ?? fetch;

  // No key means no send, and no pretending otherwise. The run logs what it would have
  // delivered so the pipeline can be exercised without a live mailbox.
  if (!apiKey || !from) return { delivered: false, reason: 'no_key' };

  try {
    const res = await doFetch(ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject: digest.subject, text: digest.text, html: digest.html }),
    });
    if (!res.ok) return { delivered: false, reason: `${res.status} ${await res.text()}`.trim().slice(0, 200) };
    return { delivered: true };
  } catch (e) {
    // One unreachable provider or one bad address must not abort a whole run.
    return { delivered: false, reason: e instanceof Error ? e.message : String(e) };
  }
}
