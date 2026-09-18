import Link from 'next/link';
import { SOURCES } from '@/data/sources';
import { BEATS, DIRECT_FEEDS } from '@/data/feeds';
import { ESCALATION_LADDER } from '@/data/glossary.zh';
import { PEOPLE } from '@/data/people';
import { FREE_LIMIT } from '@/lib/quota';
import { TREND_SERIES_DAYS } from '@/lib/risk';
import { corpus, corpusStats } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Why Kautilya',
  description: 'What this engine does, what it is for, and where it fails.',
};

function H({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-10 mb-3 text-[19px] font-semibold tracking-tight text-text">{children}</h2>;
}
function P({ children }: { children: React.ReactNode }) {
  return <p className="mb-3 max-w-[64ch] text-[16px] leading-relaxed text-muted">{children}</p>;
}
function Feature({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="panel p-4">
      <div className="mb-1.5 text-[15px] font-semibold tracking-tight text-text">{title}</div>
      <p className="text-[14px] leading-relaxed text-muted">{children}</p>
    </div>
  );
}

export default async function AboutPage() {
  // Counted from the data files rather than written down, so this page cannot drift from what
  // the engine actually reads — the same discipline /methodology uses.
  const queries = BEATS.reduce((n, b) => n + b.queries.length, 0);
  const states = new Set(PEOPLE.map((p) => p.home)).size;
  // Read from the CORPUS, not from LOCALES. The gazetteer configures more language-locales
  // than currently produce articles, so counting configuration said 8 while the home page,
  // which counts what was actually ingested, said 6. Two numbers for one fact on the same
  // site is worse than either number being slightly conservative — so both now come from
  // corpusStats and cannot drift apart.
  const stats = corpusStats(corpus());
  const languages = stats.languages;

  return (
    <div>
      <div className="text-[12px] uppercase tracking-[0.22em] text-faint">Why Kautilya</div>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">
        Reporting read in the language it was written in
      </h1>

      <div className="mt-4 grid gap-x-10 gap-y-2 lg:grid-cols-2">
        <p className="text-[17px] leading-relaxed text-muted">
          Most geopolitical monitoring reads the world in English. That is a translation layer, and
          translation layers lose the thing that matters most in statecraft: the exact wording a
          government chose. &ldquo;Expressed concern&rdquo; and &ldquo;will not sit idly by&rdquo;
          arrive in English looking similar. In the original they are separated by several rungs of
          a ladder that everyone in the room understands.
        </p>
        <p className="text-[17px] leading-relaxed text-muted">
          Kautilya reads {languages} languages in their own scripts, keeps the original beside the
          gloss, and scores how reporting is distributed rather than asserting what is true. Every
          number traces back to the headlines that produced it, so a brief built on this can be
          checked by whoever receives it.
        </p>
      </div>

      <H>What you get</H>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Feature title="Original-language reporting">
          {DIRECT_FEEDS.length} publisher feeds and {queries} aggregator queries across{' '}
          {BEATS.length} beats, in {languages} languages. Chinese headlines carry pinyin and a gloss,
          so you can read what was published, not a summary of it.
        </Feature>
        <Feature title="Corroboration, not volume">
          Stories are clustered into events and scored by how many genuinely independent outlets
          carry them. Ownership is recorded for all {SOURCES.length} publishers, because five
          outlets owned by one state are not five sources.
        </Feature>
        <Feature title="Escalation ladder detection">
          Chinese official statements use {ESCALATION_LADDER.length} fixed formulae with
          well-understood severity — 强烈不满, 勿谓言之不预. The engine detects them and reports the
          rung, where translation would flatten them all to &ldquo;criticised&rdquo;.
        </Feature>
        <Feature title="Risk surface by state">
          A composite risk score for every covered state, with a {TREND_SERIES_DAYS}-day trend, so
          you can see direction rather than a single day&rsquo;s noise.
        </Feature>
        <Feature title="Relationship tracking">
          Bilateral tension scored per pair, with the events that moved it marked on the timeline.
          Useful for the question &ldquo;is this worse than last month, or does it just feel
          worse?&rdquo;
        </Feature>
        <Feature title="Who is in the room">
          {PEOPLE.length} officials across {states} states, linked to the events that name them, so an incident can be read against the
          people actually handling it.
        </Feature>
        <Feature title="Ask, in plain language">
          Query the corpus without learning a syntax. {FREE_LIMIT} free analyses, then a plan.
        </Feature>
        <Feature title="Watchlists and alerts">
          Follow states that matter to you and be told when the ladder moves, instead of checking.
        </Feature>
      </div>

      <H>What it is for</H>
      <P>
        The engine is built for the hour before a decision, not the week after it. Four things it
        is genuinely useful for:
      </P>
      <div className="mt-4 grid gap-x-10 gap-y-5 sm:grid-cols-2 xl:grid-cols-4">
        <div>
          <div className="mb-1.5 text-[15px] font-semibold tracking-tight text-text">Telling signal from echo</div>
          <p className="text-[15px] leading-relaxed text-muted">
            A story in twenty outlets may be one wire report republished nineteen times. The
            corroboration score separates genuine independent confirmation from amplification —
            the difference between a development and a campaign.
          </p>
        </div>
        <div>
          <div className="mb-1.5 text-[15px] font-semibold tracking-tight text-text">Reading the domestic message</div>
          <p className="text-[15px] leading-relaxed text-muted">
            What a government tells its own public, in its own language, is often a better guide to
            what it will do than what its foreign ministry says in English. That divergence is
            visible here because both are on the page.
          </p>
        </div>
        <div>
          <div className="mb-1.5 text-[15px] font-semibold tracking-tight text-text">Catching a posture change early</div>
          <p className="text-[15px] leading-relaxed text-muted">
            Fixed official formulae move before policy does. A shift from &ldquo;strong
            dissatisfaction&rdquo; to &ldquo;reserves the right to take further measures&rdquo; is a
            deliberate signal, sent to be read — and machine-detectable the day it appears.
          </p>
        </div>
        <div>
          <div className="mb-1.5 text-[15px] font-semibold tracking-tight text-text">Arguing from evidence</div>
          <p className="text-[15px] leading-relaxed text-muted">
            Every score traces back to the headlines that produced it, so a conclusion drawn here
            can be audited by whoever receives it — a different kind of claim from one resting on
            judgement alone.
          </p>
        </div>
      </div>

      <div className="grid gap-x-10 lg:grid-cols-2">
      <div>
      <H>What it does not do</H>
      <P>
        It does not tell you what is true. Corroboration is not verification: many outlets can be
        wrong together, and one outlet can be right alone. Every score measures how reporting is
        distributed, not whether it is accurate, and that distinction is the whole design.
      </P>
      <P>
        It does not forecast. There is no model here predicting what happens next, and nothing on
        this site should be read as a probability. It is an instrument for seeing the present more
        precisely, which is a smaller claim and a more defensible one.
      </P>
      <P>
        Nothing here is a language model guessing at plausibility. Every number comes from rules
        written down on the{' '}
        <Link href="/methodology" className="underline decoration-dotted hover:text-[color:var(--color-accent)]">
          methodology page
        </Link>. Optional model-assisted framing analysis exists on event pages, is labelled where
        it appears, and changes no score.
      </P>

      </div>
      <div>
      <H>Where it is weakest</H>
      <P>
        Coverage follows the feeds, so a region with thin sourcing looks quiet whether or not it is
        — absence of signal here is not evidence of calm. Official rosters go stale as cabinets
        change, and a departed minister stops being written about rather than being flagged as
        gone, so silence around a name needs reading carefully rather than trusting.
      </P>
      <P>
        The{' '}
        <Link href="/methodology" className="underline decoration-dotted hover:text-[color:var(--color-accent)]">
          methodology page
        </Link>{' '}
        lists these in detail, with the scoring rules and the known failure modes. A tool that hides
        its limits is worse than one that has none.
      </P>

      </div>
      </div>

      <H>The name</H>
      <P>
        Kautilya wrote the Arthashastra in the fourth century BCE — a manual of statecraft built on
        the premise that power is best understood by observing what states actually do, patiently
        and without flattery. That is the ambition, if not yet the achievement.
      </P>
    </div>
  );
}
