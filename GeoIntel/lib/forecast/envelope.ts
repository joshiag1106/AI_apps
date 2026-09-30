import { sendDigest, type Digest, type SendOptions, type SendResult } from '@/lib/alerts/send';
import { chainHeads, forecastsForWeek, type ChainHeads, type StoredForecast } from '@/lib/forecast/ledger';
import { FORECASTERS } from '@/lib/forecast/types';

const pct = (p: number | undefined) => (p === undefined ? '—' : `${Math.round(p * 100)}%`);
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const seal = (label: string, h: ChainHeads['forecasts']) => (h ? `${label} #${h.seq} ${h.hash}` : `${label}: none yet`);

/**
 * The week's forecasts plus the heads of both record chains. Kept in the owner's inbox, it is a dated copy
 * outside the server that any later rewrite of the record would contradict.
 */
export function renderEnvelope(week: string, forecasts: StoredForecast[], heads: ChainHeads): Digest {
  const byQuestion = new Map<string, StoredForecast[]>();
  for (const f of forecasts) byQuestion.set(f.questionId, [...(byQuestion.get(f.questionId) ?? []), f]);
  const items = [...byQuestion.values()].map((fs) => {
    const p = (name: string) => fs.find((f) => f.forecaster === name);
    const model = p(FORECASTERS.model);
    return {
      question: fs[0].question,
      line: `signal model ${pct(model?.probability)} · usual rate ${pct(p(FORECASTERS.usual)?.probability)} · same as last week ${pct(p(FORECASTERS.persistence)?.probability)}`,
      why: model?.explanation?.text ?? '',
    };
  });
  const intro = 'These are this week\'s forecasts, recorded before the outcomes are known. Keep this email: the seal '
    + 'below fingerprints the whole record so far, so any later change to it would no longer match.';
  const seals = [seal('forecasts', heads.forecasts), seal('outcomes', heads.outcomes)];
  const text = [intro, '', ...items.flatMap((i) => [i.question, `  ${i.line}`, i.why ? `  ${i.why}` : '', '']),
    'Seal:', ...seals.map((s) => `  ${s}`)].join('\n');
  const html = `<p>${esc(intro)}</p><ul>${items.map((i) =>
    `<li><strong>${esc(i.question)}</strong><br>${esc(i.line)}${i.why ? `<br><em>${esc(i.why)}</em>` : ''}</li>`).join('')}</ul>`
    + `<p><strong>Seal</strong><br><code>${seals.map(esc).join('<br>')}</code></p>`;
  return { subject: `Kautilya forecasts — ${week} (sealed)`, text, html };
}

export async function sendEnvelope(week: string, opts: SendOptions & { to?: string } = {}): Promise<SendResult> {
  const to = (opts.to ?? process.env.FORECAST_DIGEST_TO ?? '').trim();
  if (!to) return { delivered: false, reason: 'no_recipient' };
  return sendDigest(to, renderEnvelope(week, forecastsForWeek(week), chainHeads()), opts);
}
