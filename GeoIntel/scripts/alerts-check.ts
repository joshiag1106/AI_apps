/**
 * Send one real ladder alert, to an address you name, and report what happened.
 *
 * The counterpart to llm-check.ts, and it exists for the same reason: the alert pipeline
 * shipped without ever having put a message in an inbox. Trigger, batching, state and
 * template are covered by tests; delivery itself has only ever been exercised against a
 * stubbed transport.
 *
 * The recipient must be given explicitly. This puts mail in a real inbox, so it will not
 * guess an address, read one out of the database, or fall back to a default.
 *
 *   npm run alerts:check -- --to=you@example.com
 */
import { allEvents } from '@/lib/db';
import { renderDigest, sendDigest } from '@/lib/alerts/send';
import type { Jump } from '@/lib/alerts/detect';

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.split('=').slice(1).join('=').trim() || undefined;
}

async function main() {
  const to = arg('to');
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const host = process.env.SMTP_HOST ?? 'smtp.gmail.com';
  const port = process.env.SMTP_PORT ?? '465';
  const from = process.env.ALERTS_FROM ?? user;
  const origin = process.env.KAUTILYA_ORIGIN ?? 'http://localhost:3111';

  console.log(`\n  server   ${host}:${port}`);
  console.log(`  user     ${user ?? '(SMTP_USER not set)'}`);
  console.log(`  pass     ${pass ? `set, ${pass.length} chars` : '(SMTP_PASS not set)'}`);
  console.log(`  from     ${from ?? '(defaults to SMTP_USER)'}`);
  console.log(`  origin   ${origin}`);

  if (!to) {
    console.error('\n  No recipient. This sends real mail, so the address must be explicit:');
    console.error('    npm run alerts:check -- --to=you@example.com\n');
    process.exit(1);
  }
  if (!user || !pass) {
    console.error('\n  Not configured. Add both to .env.local, then re-run:');
    console.error('    SMTP_USER=alerts@your-domain.com');
    console.error('    SMTP_PASS=<that mailbox\'s password>');
    console.error('\n  SMTP_HOST must match where that address\'s mail is really hosted —');
    console.error('  check its MX records. Gmail is the exception that needs a 16-character');
    console.error('  App Password rather than the account password.');
    console.error('  Nothing was sent.\n');
    process.exit(1);
  }

  // A real event from the corpus, so the mail is representative rather than a lorem ipsum.
  const candidate = allEvents(4000).find((e) => e.ladderRung != null)
    ?? allEvents(4000)[0];
  if (!candidate) {
    console.error('\n  Corpus is empty — run `npm run ingest` first.\n');
    process.exit(1);
  }

  const jump: Jump = {
    item: { kind: 'dyad', id: candidate.actors.slice(0, 2).join('-') || 'IND-CHN',
            label: candidate.actors.slice(0, 2).join(' — ') || 'India — China' },
    rung: candidate.ladderRung ?? 8,
    previous: Math.max(0, (candidate.ladderRung ?? 8) - 4),
    event: candidate,
  };

  const digest = renderDigest([jump], origin);
  console.log(`\n  subject  ${digest.subject}`);
  console.log(`  to       ${to}`);
  console.log('\n  sending one message…');

  const started = Date.now();
  const res = await sendDigest(to, digest);
  const secs = ((Date.now() - started) / 1000).toFixed(1);

  if (!res.delivered) {
    console.error(`\n  FAILED after ${secs}s — ${res.reason}\n`);
    process.exit(1);
  }
  console.log(`\n  ACCEPTED by ${host} in ${secs}s.`);
  console.log('  Accepted is not the same as delivered — check the inbox, and the spam');
  console.log('  folder, before calling this proven.\n');
}

main();
